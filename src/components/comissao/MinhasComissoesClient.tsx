"use client";

import { useCallback, useEffect, useState } from "react";
import { rotuloCompetencia } from "@/lib/comissaoRegras";
import type { TotaisComissao } from "@/lib/comissaoRegras";
import type { CobrancaParaMarcar, LancamentoDetalhado } from "@/lib/comissao";
import { Aviso, GradeTotais, StatusChip, chamar, dataHora, mesInicial, moeda, tipoRotulo } from "./ui";

interface Resposta {
  competencia: string;
  beneficiario: { id: string; nome: string | null; percentual: number };
  lancamentos: LancamentoDetalhado[];
  totais: TotaisComissao;
}

const ROTULO_STATUS_COBRANCA: Record<string, string> = { aprovada_enviada: "Aguardando validação", validada: "Aguardando pagamento", paga: "Paga" };

// Aba "Minhas comissões": só o que pertence ao beneficiário logado, por mês de competência.
export default function MinhasComissoesClient({ nome, percentual }: { nome: string | null; percentual: number }) {
  const [mes, setMes] = useState(mesInicial());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [paraMarcar, setParaMarcar] = useState<CobrancaParaMarcar[] | null>(null);
  const [lancando, setLancando] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    const r = await chamar<Resposta>(`/api/comissoes/minhas?mes=${mes}`);
    if (!r.ok) setErro(r.json.error ?? "Não foi possível carregar as comissões.");
    else setDados(r.json);
    setCarregando(false);
  }, [mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  const carregarParaMarcar = useCallback(async () => {
    const r = await chamar<{ cobrancas: CobrancaParaMarcar[] }>("/api/comissoes/para-marcar");
    if (!r.ok) { setErro(r.json.error ?? "Não foi possível carregar as cobranças para marcar."); return; }
    setParaMarcar(r.json.cobrancas);
  }, []);

  useEffect(() => { void carregarParaMarcar(); }, [carregarParaMarcar]);

  async function marcar(c: CobrancaParaMarcar) {
    setLancando(c.id); setErro(""); setMsg("");
    const r = await chamar<unknown>("/api/comissoes/marcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cobranca_id: c.id }) });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível marcar a comissão.");
    else setMsg(c.retroativo ? "Marcada como retroativo pendente — só conta depois da aprovação da diretoria." : "Comissão marcada.");
    await Promise.all([carregarParaMarcar(), carregar()]);
    setLancando(null);
  }

  async function desmarcar(id: string) {
    setErro(""); setMsg("");
    const r = await chamar<unknown>("/api/comissoes/desmarcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lancamento_id: id }) });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível desmarcar.");
    void carregar();
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Minhas comissões</h1>
          <p className="text-sm text-gray-500">{nome ?? "—"} · {percentual}% do fee bruto da cobrança R&S · competência = mês de envio para validação</p>
        </div>
        <label className="text-xs font-semibold text-gray-600">
          Mês de competência
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="block mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm" />
        </label>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msg && <Aviso tipo="ok">{msg}</Aviso>}

      {dados && <GradeTotais totais={dados.totais} />}

      <div className="rounded-xl border-2 bg-white p-4 space-y-3" style={{ borderColor: "#FFB800" }}>
        <div>
          <h2 className="text-sm font-bold text-gray-900">Cobranças para marcar</h2>
          <p className="text-xs text-gray-500">
            Cobranças R&S de contratação já enviadas para validação (mês atual e anteriores). Marque só a comissão que é sua — o sistema não deduz pelo responsável da vaga.
            Cobrança de mês anterior entra como <strong>retroativo pendente</strong> e só conta depois da aprovação da diretoria.
          </p>
        </div>
        {paraMarcar === null ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : paraMarcar.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma cobrança disponível.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-1 pr-3">Cliente</th><th className="pr-3">Vaga / cargo</th><th className="pr-3">Gerada por</th><th className="pr-3">Enviada em</th><th className="pr-3">Status</th><th className="pr-3">Fee</th><th className="pr-3">Comissão ({percentual}%)</th><th />
                </tr>
              </thead>
              <tbody>
                {paraMarcar.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-medium text-gray-900">{c.cliente ?? "—"}</td>
                    <td className="pr-3">{c.vaga ?? "—"}{c.cargo && c.cargo !== c.vaga ? <span className="block text-xs text-gray-500">{c.cargo}</span> : null}</td>
                    <td className="pr-3">{c.gerada_por ?? "não registrado"}</td>
                    <td className="pr-3 text-xs">{dataHora(c.enviado_em)}<span className="block text-gray-500">{rotuloCompetencia(c.competencia)}</span></td>
                    <td className="pr-3 text-xs">{ROTULO_STATUS_COBRANCA[c.status] ?? c.status}</td>
                    <td className="pr-3">{moeda(c.fee_valor)}</td>
                    <td className="pr-3 font-semibold">{moeda(c.comissao_prevista)}</td>
                    <td className="text-right whitespace-nowrap">
                      {c.marcada === "outro" ? (
                        <span className="text-xs text-gray-500">Já marcada</span>
                      ) : c.marcada === "voce" ? (
                        <span className="text-xs text-green-700">Marcada por você</span>
                      ) : (
                        <button
                          onClick={() => marcar(c)}
                          disabled={lancando === c.id}
                          title={c.retroativo ? "Mês anterior: vai para aprovação da diretoria" : undefined}
                          className="text-xs font-semibold rounded-md px-2 py-1 disabled:opacity-50"
                          style={{ background: "#000", color: "#FFD700" }}
                        >
                          {lancando === c.id ? "Marcando..." : "Esta comissão é minha"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-3">Cliente / vaga</th><th className="p-3">Tipo</th><th className="p-3">Fee bruto</th><th className="p-3">Comissão</th><th className="p-3">Status</th><th className="p-3">Enviada</th><th className="p-3">Validada</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">Carregando...</td></tr>
            ) : !dados || dados.lancamentos.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-500">Nenhuma comissão em {rotuloCompetencia(`${mes}-01`)}.</td></tr>
            ) : (
              dados.lancamentos.map((l) => (
                <tr key={l.id} className="border-b last:border-0 align-top">
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{l.cobranca?.cliente ?? "—"}</div>
                    <div className="text-xs text-gray-500">{l.cobranca?.vaga ?? "—"}{l.cobranca?.candidato ? ` · ${l.cobranca.candidato}` : ""}</div>
                    {l.motivo && <div className="text-xs text-gray-600 mt-1">Motivo: {l.motivo}</div>}
                    {l.status === "contestada" && <div className="text-xs text-red-700 mt-1">Contestada: {l.contestacao_motivo}</div>}
                    {l.resolucao_nota && l.status !== "contestada" && <div className="text-xs text-gray-600 mt-1">Decisão: {l.resolucao_nota}</div>}
                  </td>
                  <td className="p-3">{tipoRotulo(l.tipo)}</td>
                  <td className="p-3">{l.tipo === "comissao" ? moeda(l.cobranca?.fee_valor ?? l.base_valor) : "—"}</td>
                  <td className="p-3 font-semibold">{moeda(l.valor_comissao)}{l.percentual_aplicado != null && <span className="block text-xs font-normal text-gray-500">{l.percentual_aplicado}%</span>}</td>
                  <td className="p-3"><StatusChip status={l.status} /></td>
                  <td className="p-3 text-xs">{dataHora(l.cobranca?.enviado_em)}</td>
                  <td className="p-3 text-xs">{dataHora(l.cobranca?.validada_em)}</td>
                  <td className="p-3 text-right">
                    {l.pode_desmarcar && <button onClick={() => desmarcar(l.id)} className="text-xs underline text-gray-600">Desmarcar</button>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
