"use client";

import { useCallback, useEffect, useState } from "react";
import { rotuloCompetencia } from "@/lib/comissaoRegras";
import type { TotaisComissao } from "@/lib/comissaoRegras";
import type { LancamentoDetalhado } from "@/lib/comissao";
import { Aviso, GradeTotais, StatusChip, chamar, dataHora, mesInicial, moeda, tipoRotulo } from "./ui";

interface Resposta {
  competencia: string;
  lancamentos: LancamentoDetalhado[];
  totais: TotaisComissao;
  totaisPorBeneficiario: { beneficiario_id: string; nome: string | null; totais: TotaisComissao }[];
  retroativosPendentes: LancamentoDetalhado[];
}

type Acao =
  | { tipo: "contestar"; id: string }
  | { tipo: "recusar"; id: string }
  | { tipo: "resolver"; id: string }
  | { tipo: "ajuste"; id: string };

// Aba "Comissões" (diretoria/superuser): todos os beneficiários por mês. A diretoria só CONTESTA o que discordar; retroativos
// esperam aprovação; ajuste/estorno entram como lançamento novo vinculado (o original nunca é editado). Sem fechamento mensal.
export default function ComissoesDiretoriaClient() {
  const [mes, setMes] = useState(mesInicial());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState<"ajuste" | "estorno">("estorno");
  const [resolucao, setResolucao] = useState<"mantem" | "ajuste" | "remover">("mantem");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<Resposta>(`/api/comissoes?mes=${mes}`);
    if (!r.ok) setErro(r.json.error ?? "Não foi possível carregar as comissões.");
    else { setDados(r.json); setErro(""); }
    setCarregando(false);
  }, [mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  function abrir(a: Acao) { setAcao(a); setTexto(""); setValor(""); setResolucao("mantem"); setTipoAjuste("estorno"); setErro(""); setMsg(""); }

  async function enviar(url: string, corpo: unknown, sucesso: string) {
    setEnviando(true); setErro("");
    const r = await chamar<unknown>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível concluir a ação.");
    else { setMsg(sucesso); setAcao(null); await carregar(); }
    setEnviando(false);
  }

  const numero = (v: string) => Number(v.replace(",", "."));

  function Linha({ l, retro }: { l: LancamentoDetalhado; retro?: boolean }) {
    return (
      <tr className="border-b last:border-0 align-top">
        <td className="p-3 font-medium text-gray-900">{l.beneficiario_nome ?? "—"}</td>
        <td className="p-3">
          <div className="font-medium text-gray-900">{l.cobranca?.cliente ?? "—"}</div>
          <div className="text-xs text-gray-500">{l.cobranca?.vaga ?? "—"}{l.cobranca?.candidato ? ` · ${l.cobranca.candidato}` : ""}</div>
          {l.motivo && <div className="text-xs text-gray-600 mt-1">Motivo: {l.motivo}</div>}
          {l.status === "contestada" && <div className="text-xs text-red-700 mt-1">Contestada em {dataHora(l.contestado_em)}: {l.contestacao_motivo}</div>}
          {l.resolucao_nota && l.status !== "contestada" && <div className="text-xs text-gray-600 mt-1">Decisão ({dataHora(l.resolvido_em)}): {l.resolucao_nota}</div>}
        </td>
        <td className="p-3">{tipoRotulo(l.tipo)}{retro && <span className="block text-xs text-gray-500">competência {rotuloCompetencia(l.competencia)}</span>}</td>
        <td className="p-3">{l.tipo === "comissao" ? moeda(l.cobranca?.fee_valor ?? l.base_valor) : "—"}</td>
        <td className="p-3 font-semibold">{moeda(l.valor_comissao)}{l.percentual_aplicado != null && <span className="block text-xs font-normal text-gray-500">{l.percentual_aplicado}%</span>}</td>
        <td className="p-3"><StatusChip status={l.status} /></td>
        <td className="p-3 text-xs">{dataHora(l.cobranca?.enviado_em)}<br />{dataHora(l.cobranca?.validada_em)}</td>
        <td className="p-3 text-right space-y-1 whitespace-nowrap">
          {l.status === "retroativo_pendente" && (
            <>
              <button disabled={enviando} onClick={() => enviar(`/api/comissoes/${l.id}/retroativo`, { decisao: "aprovar" }, "Retroativo aprovado.")} className="block ml-auto text-xs font-semibold border border-green-300 text-green-800 rounded px-2 py-1 hover:bg-green-50">Aprovar</button>
              <button onClick={() => abrir({ tipo: "recusar", id: l.id })} className="block ml-auto text-xs font-semibold border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">Recusar</button>
            </>
          )}
          {l.tipo === "comissao" && (l.status === "prevista" || l.status === "confirmada") && (
            <>
              <button onClick={() => abrir({ tipo: "contestar", id: l.id })} className="block ml-auto text-xs font-semibold border border-red-300 text-red-700 rounded px-2 py-1 hover:bg-red-50">Contestar</button>
              <button onClick={() => abrir({ tipo: "ajuste", id: l.id })} className="block ml-auto text-xs underline text-gray-600">Ajuste / estorno</button>
            </>
          )}
          {l.status === "contestada" && (
            <button onClick={() => abrir({ tipo: "resolver", id: l.id })} className="block ml-auto text-xs font-semibold border border-gray-400 rounded px-2 py-1 hover:bg-gray-50">Resolver contestação</button>
          )}
        </td>
      </tr>
    );
  }

  const cab = (
    <thead>
      <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
        <th className="p-3">Beneficiário</th><th className="p-3">Cobrança</th><th className="p-3">Tipo</th><th className="p-3">Fee bruto</th><th className="p-3">Comissão</th><th className="p-3">Status</th><th className="p-3">Enviada / validada</th><th className="p-3" />
      </tr>
    </thead>
  );

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comissões</h1>
          <p className="text-sm text-gray-500">Todos os beneficiários · competência = mês de envio da cobrança para validação · sem fechamento mensal nesta fase</p>
        </div>
        <label className="text-xs font-semibold text-gray-600">
          Mês de competência
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="block mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm" />
        </label>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msg && <Aviso tipo="ok">{msg}</Aviso>}

      {acao && (
        <div className="rounded-xl border-2 p-4 bg-white space-y-3" style={{ borderColor: "#FFB800" }}>
          <p className="text-sm font-bold text-gray-900">
            {acao.tipo === "contestar" && "Contestar comissão"}
            {acao.tipo === "recusar" && "Recusar pedido retroativo"}
            {acao.tipo === "resolver" && "Resolver contestação"}
            {acao.tipo === "ajuste" && "Registrar ajuste ou estorno (o lançamento original não é editado)"}
          </p>
          {acao.tipo === "resolver" && (
            <div className="flex gap-3 flex-wrap text-sm">
              {([["mantem", "Manter como está"], ["ajuste", "Ajustar o valor (via ajuste)"], ["remover", "Remover (via estorno)"]] as const).map(([v, r]) => (
                <label key={v} className="flex items-center gap-1"><input type="radio" checked={resolucao === v} onChange={() => setResolucao(v)} /> {r}</label>
              ))}
            </div>
          )}
          {acao.tipo === "ajuste" && (
            <div className="flex gap-3 flex-wrap text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={tipoAjuste === "estorno"} onChange={() => setTipoAjuste("estorno")} /> Estorno (valor positivo a abater)</label>
              <label className="flex items-center gap-1"><input type="radio" checked={tipoAjuste === "ajuste"} onChange={() => setTipoAjuste("ajuste")} /> Ajuste (valor com sinal, + ou −)</label>
            </div>
          )}
          {(acao.tipo === "ajuste" || (acao.tipo === "resolver" && resolucao === "ajuste")) && (
            <label className="block text-xs font-semibold text-gray-600">Valor (R$)
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="block mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm w-40" />
            </label>
          )}
          <label className="block text-xs font-semibold text-gray-600">
            {acao.tipo === "resolver" ? "Justificativa da decisão" : "Motivo"}
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} className="block mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm" />
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAcao(null)} className="text-sm text-gray-600 px-3 py-1.5">Cancelar</button>
            <button
              disabled={enviando || texto.trim().length < 3}
              onClick={() => {
                if (acao.tipo === "contestar") return enviar(`/api/comissoes/${acao.id}/contestar`, { motivo: texto }, "Comissão contestada.");
                if (acao.tipo === "recusar") return enviar(`/api/comissoes/${acao.id}/retroativo`, { decisao: "recusar", motivo: texto }, "Retroativo recusado.");
                if (acao.tipo === "resolver") return enviar(`/api/comissoes/${acao.id}/resolver-contestacao`, { acao: resolucao, nota: texto, ...(resolucao === "ajuste" ? { valor: numero(valor) } : {}) }, "Contestação resolvida.");
                return enviar("/api/comissoes/ajuste", { lancamento_origem_id: acao.id, tipo: tipoAjuste, valor: numero(valor), motivo: texto }, tipoAjuste === "estorno" ? "Estorno registrado." : "Ajuste registrado.");
              }}
              className="text-sm font-semibold rounded-lg px-4 py-1.5 disabled:opacity-50"
              style={{ background: "#000", color: "#FFD700" }}
            >
              {enviando ? "Salvando..." : "Confirmar"}
            </button>
          </div>
        </div>
      )}

      {dados && <GradeTotais totais={dados.totais} />}

      {dados && dados.totaisPorBeneficiario.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b bg-gray-50"><th className="p-3">Totais por pessoa — {rotuloCompetencia(`${mes}-01`)}</th><th className="p-3">Previsto</th><th className="p-3">Confirmado</th><th className="p-3">Contestado</th><th className="p-3">Retroativo pendente</th></tr></thead>
            <tbody>
              {dados.totaisPorBeneficiario.map((b) => (
                <tr key={b.beneficiario_id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{b.nome ?? "—"}</td><td className="p-3">{moeda(b.totais.previsto)}</td><td className="p-3 font-semibold">{moeda(b.totais.confirmado)}</td><td className="p-3">{moeda(b.totais.contestado)}</td><td className="p-3">{moeda(b.totais.retroativoPendente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados && dados.retroativosPendentes.length > 0 && (
        <div className="rounded-xl border-2 bg-white overflow-x-auto" style={{ borderColor: "#FDE68A" }}>
          <p className="p-3 text-sm font-bold text-amber-900 bg-amber-50">Pedidos retroativos aguardando decisão ({dados.retroativosPendentes.length})</p>
          <table className="w-full text-sm">{cab}<tbody>{dados.retroativosPendentes.map((l) => <Linha key={l.id} l={l} retro />)}</tbody></table>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          {cab}
          <tbody>
            {carregando ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">Carregando...</td></tr>
            ) : !dados || dados.lancamentos.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-gray-500">Nenhuma comissão em {rotuloCompetencia(`${mes}-01`)}.</td></tr>
            ) : (
              dados.lancamentos.map((l) => <Linha key={l.id} l={l} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
