"use client";

import { useCallback, useEffect, useState } from "react";
import { rotuloCompetencia } from "@/lib/comissaoRegras";
import type { FechamentoResumo, GrupoBeneficiario, PreviaUnidade } from "@/lib/comissaoFechamento";
import { Aviso, chamar, dataBR, mesInicial, moeda } from "./ui";

function TabelaGrupos({ grupos }: { grupos: GrupoBeneficiario[] }) {
  if (grupos.length === 0) return <p className="text-sm text-gray-500">Nada neste fechamento.</p>;
  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <div key={g.beneficiario_id} className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-b">
            <span className="text-sm font-bold text-gray-900">{g.nome ?? "—"}</span>
            <span className="text-sm">
              {g.qtd_cobrancas} cobrança{g.qtd_cobrancas === 1 ? "" : "s"} · total <strong className={g.total < 0 ? "text-red-700" : "text-gray-900"}>{moeda(g.total)}</strong>
              {g.total <= 0 && <span className="ml-2 text-xs text-amber-800">(zero ou negativo: mostrado, não bloqueia)</span>}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="p-2">Cliente / vaga</th><th className="p-2">Tipo</th><th className="p-2">Fee</th><th className="p-2">Comissão</th><th className="p-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {[...g.linhas, ...g.ajustes].map((l) => (
                <tr key={l.lancamento_id} className="border-b last:border-0 align-top" style={l.atrasada_de ? { background: "#FFFBEB" } : undefined}>
                  <td className="p-2"><div className="font-medium text-gray-900">{l.cliente ?? "—"}</div><div className="text-xs text-gray-500">{l.vaga ?? "—"}</div></td>
                  <td className="p-2">{l.tipo === "estorno" ? "Estorno" : l.tipo === "ajuste" ? "Ajuste" : "Comissão"}</td>
                  <td className="p-2">{l.fee == null ? "—" : moeda(l.fee)}</td>
                  <td className={`p-2 font-semibold ${l.comissao < 0 ? "text-red-700" : ""}`}>{moeda(l.comissao)}</td>
                  <td className="p-2 text-xs">
                    {l.atrasada_de && <span className="font-semibold text-amber-900">Atrasada de {rotuloCompetencia(l.atrasada_de)}</span>}
                    {l.motivo && <div className="text-gray-600">{l.motivo}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// Seção "Fechamento" da aba Comissões: prévia do mês (o que entra e o que bloqueia), fechar (irreversível), fechamentos anteriores,
// detalhe por beneficiário, CSV para a folha e "Marcar como pago". Sem desfazer nada: correção = ajuste/estorno no fechamento seguinte.
export default function FechamentoComissoes() {
  const [mes, setMes] = useState(mesInicial());
  const [unidades, setUnidades] = useState<PreviaUnidade[] | null>(null);
  const [fechamentos, setFechamentos] = useState<FechamentoResumo[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [detalhe, setDetalhe] = useState<{ fechamento: FechamentoResumo; grupos: GrupoBeneficiario[] } | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const [dataPagamento, setDataPagamento] = useState("");

  const carregar = useCallback(async () => {
    const [p, l] = await Promise.all([
      chamar<{ unidades: PreviaUnidade[] }>(`/api/comissoes/fechamentos/previa?mes=${mes}`),
      chamar<{ fechamentos: FechamentoResumo[] }>("/api/comissoes/fechamentos"),
    ]);
    if (!p.ok) setErro(p.json.error ?? "Não foi possível montar a prévia.");
    else { setUnidades(p.json.unidades); setErro(""); }
    if (l.ok) setFechamentos(l.json.fechamentos);
  }, [mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function fechar(u: PreviaUnidade) {
    setEnviando(true); setErro(""); setMsg("");
    const r = await chamar<{ ja_existia?: boolean }>("/api/comissoes/fechamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competencia: mes, unidade_id: u.unidade_id, esperado_qtd: u.qtd, esperado_total: u.total }),
    });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível fechar o mês.");
    else setMsg(r.json.ja_existia ? "Este mês já estava fechado." : `Mês ${rotuloCompetencia(`${mes}-01`)} fechado.`);
    setConfirmando(null); setEntendi(false);
    await carregar();
    setEnviando(false);
  }

  async function abrirDetalhe(id: string) {
    const r = await chamar<{ fechamento: FechamentoResumo; grupos: GrupoBeneficiario[] }>(`/api/comissoes/fechamentos/${id}`);
    if (!r.ok) { setErro(r.json.error ?? "Não foi possível carregar o fechamento."); return; }
    setDetalhe(r.json);
  }

  async function pagar(id: string) {
    setEnviando(true); setErro(""); setMsg("");
    const r = await chamar<unknown>(`/api/comissoes/fechamentos/${id}/pagar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pago_em: dataPagamento }) });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível registrar o pagamento.");
    else { setMsg("Pagamento registrado."); setPagando(null); if (detalhe?.fechamento.id === id) await abrirDetalhe(id); }
    await carregar();
    setEnviando(false);
  }

  return (
    <section className="space-y-4" id="fechamento">
      <div className="flex items-end justify-between flex-wrap gap-3 pt-4 border-t border-gray-200">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Fechamento mensal</h2>
          <p className="text-sm text-gray-500">Entra só comissão <strong>confirmada</strong> ainda sem fechamento (de qualquer mês até o escolhido) e os ajustes/estornos ainda não incluídos. Fechado é congelado: correções entram como ajuste no fechamento seguinte.</p>
        </div>
        <label className="text-xs font-semibold text-gray-600">
          Mês a fechar
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="block mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm" />
        </label>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msg && <Aviso tipo="ok">{msg}</Aviso>}

      {unidades === null ? (
        <p className="text-sm text-gray-400">Carregando prévia...</p>
      ) : unidades.length === 0 ? (
        <p className="text-sm text-gray-500">Nada confirmado nem pendente até {rotuloCompetencia(`${mes}-01`)}.</p>
      ) : (
        unidades.map((u) => (
          <div key={u.unidade_id} className="rounded-xl border-2 bg-white p-4 space-y-3" style={{ borderColor: "#FFB800" }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-bold text-gray-900">{u.unidade ?? "Unidade"} — {rotuloCompetencia(u.competencia)}</p>
              <p className="text-sm">{u.qtd} lançamento{u.qtd === 1 ? "" : "s"} · total <strong>{moeda(u.total)}</strong></p>
            </div>

            {u.fechamento ? (
              <Aviso tipo="info">
                Mês já fechado em {dataBR(u.fechamento.fechado_em)} — {moeda(u.fechamento.total)} · {u.fechamento.pago_em ? `pago em ${dataBR(u.fechamento.pago_em)}` : "aguardando pagamento"}.
                <button onClick={() => abrirDetalhe(u.fechamento!.id)} className="ml-2 underline font-semibold">Ver detalhe</button>
              </Aviso>
            ) : (
              <>
                {u.bloqueios.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                    <p className="text-sm font-semibold text-red-800">Não dá para fechar: resolva primeiro</p>
                    {u.bloqueios.map((b) => (
                      <p key={b.id} className="text-xs text-red-800">
                        {b.status === "contestada" ? "Contestada" : "Retroativo pendente"} · {b.beneficiario ?? "—"} · {b.cliente ?? "—"} ({b.vaga ?? "—"}) · competência {rotuloCompetencia(b.competencia)} —{" "}
                        <a href={b.link} className="underline font-semibold">resolver</a>
                      </p>
                    ))}
                  </div>
                )}
                {u.mes_futuro && <Aviso tipo="erro">Este mês ainda não começou.</Aviso>}
                {u.fechamento_posterior && <Aviso tipo="erro">Já existe fechamento de um mês posterior; este mês não pode mais ser fechado.</Aviso>}
                <TabelaGrupos grupos={u.grupos} />
                {confirmando === u.unidade_id ? (
                  <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-2">
                    <p className="text-sm font-bold text-red-800">Fechar {rotuloCompetencia(u.competencia)} é IRREVERSÍVEL</p>
                    <p className="text-xs text-red-800">Os {u.qtd} lançamentos ({moeda(u.total)}) ficam congelados: não mudam de valor nem de status, e o fechamento não pode ser reaberto nem apagado. Correções entram como ajuste/estorno no fechamento seguinte.</p>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} /> Entendo que este fechamento não pode ser desfeito.</label>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setConfirmando(null); setEntendi(false); }} className="text-sm text-gray-600 px-3 py-1.5">Cancelar</button>
                      <button disabled={!entendi || enviando} onClick={() => fechar(u)} className="text-sm font-semibold rounded-lg px-4 py-1.5 text-white bg-red-700 disabled:opacity-50">{enviando ? "Fechando..." : "Confirmar fechamento"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      disabled={u.bloqueios.length > 0 || u.mes_futuro || u.fechamento_posterior || u.qtd === 0}
                      onClick={() => { setConfirmando(u.unidade_id); setEntendi(false); }}
                      className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
                      style={{ background: "#000", color: "#FFD700" }}
                    >
                      Fechar mês
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <p className="p-3 text-sm font-bold text-gray-900 border-b bg-gray-50">Fechamentos anteriores</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-3">Mês</th><th className="p-3">Unidade</th><th className="p-3">Total</th><th className="p-3">Lanç.</th><th className="p-3">Fechado em</th><th className="p-3">Situação</th><th className="p-3" /></tr></thead>
          <tbody>
            {fechamentos.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">Nenhum fechamento ainda.</td></tr>
            ) : fechamentos.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{rotuloCompetencia(f.competencia)}</td>
                <td className="p-3">{f.unidade ?? "—"}</td>
                <td className={`p-3 font-semibold ${f.total < 0 ? "text-red-700" : ""}`}>{moeda(f.total)}</td>
                <td className="p-3">{f.qtd_lancamentos}</td>
                <td className="p-3 text-xs">{dataBR(f.fechado_em)}</td>
                <td className="p-3 text-xs">{f.pago_em ? <span className="text-green-700 font-semibold">Pago em {dataBR(f.pago_em)}</span> : <span className="text-amber-800 font-semibold">Aguardando pagamento</span>}</td>
                <td className="p-3 text-right whitespace-nowrap space-x-2">
                  <button onClick={() => abrirDetalhe(f.id)} className="text-xs underline">Detalhe</button>
                  <a href={`/api/comissoes/fechamentos/${f.id}/csv`} className="text-xs underline">CSV</a>
                  {!f.pago_em && <button onClick={() => { setPagando(f.id); setDataPagamento(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })); }} className="text-xs font-semibold border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">Marcar como pago</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagando && (
        <div className="rounded-xl border-2 p-4 bg-white space-y-2" style={{ borderColor: "#FFB800" }}>
          <p className="text-sm font-bold text-gray-900">Marcar como pago na folha</p>
          <p className="text-xs text-gray-600">Registra a data do pagamento, quem marcou e quando. Não se desfaz: erro de pagamento se corrige por ajuste no fechamento seguinte.</p>
          <label className="block text-xs font-semibold text-gray-600">Data do pagamento
            <input type="date" value={dataPagamento} max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })} onChange={(e) => setDataPagamento(e.target.value)} className="block mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm" />
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPagando(null)} className="text-sm text-gray-600 px-3 py-1.5">Cancelar</button>
            <button disabled={!dataPagamento || enviando} onClick={() => pagar(pagando)} className="text-sm font-semibold rounded-lg px-4 py-1.5 disabled:opacity-50" style={{ background: "#000", color: "#FFD700" }}>{enviando ? "Salvando..." : "Confirmar pagamento"}</button>
          </div>
        </div>
      )}

      {detalhe && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              Fechamento de {rotuloCompetencia(detalhe.fechamento.competencia)} — {detalhe.fechamento.unidade ?? "—"} · {moeda(detalhe.fechamento.total)} · {detalhe.fechamento.pago_em ? `pago em ${dataBR(detalhe.fechamento.pago_em)}` : "aguardando pagamento"}
            </p>
            <div className="space-x-3">
              <a href={`/api/comissoes/fechamentos/${detalhe.fechamento.id}/csv`} className="text-sm font-semibold underline">Baixar CSV</a>
              <button onClick={() => setDetalhe(null)} className="text-sm text-gray-500 underline">Fechar detalhe</button>
            </div>
          </div>
          <TabelaGrupos grupos={detalhe.grupos} />
        </div>
      )}
    </section>
  );
}
