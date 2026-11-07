"use client";

import { useCallback, useEffect, useState } from "react";
import { rotuloCompetencia } from "@/lib/comissaoRegras";
import { chamar, moeda, StatusChip, Aviso } from "./ui";
import type { LancamentoDetalhado } from "@/lib/comissao";

interface Estado {
  pode_marcar: boolean;
  motivo_bloqueio: string | null;
  lancamento: LancamentoDetalhado | null;
  marcada_por_outro: boolean;
  percentual: number;
  comissao_prevista: number | null;
  competencia: string | null;
  retroativo: boolean;
  sugestao_responsavel_da_vaga: boolean;
  fee_valor: number | null;
}

// Quadro "Esta comissão é minha" dentro da tela de Cobranças R&S. Só aparece para quem é beneficiário de comissão (a API devolve
// 403 aos demais e o quadro some). A marcação é SEMPRE explícita: a sugestão pelo responsável da vaga é só um aviso visual.
export default function ComissaoCobrancaBox({ cobrancaId }: { cobrancaId: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [oculto, setOculto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = await chamar<Estado>(`/api/comissoes/cobranca/${cobrancaId}`);
    if (!r.ok) { setOculto(true); return; }
    setEstado(r.json);
  }, [cobrancaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function marcar() {
    setSalvando(true); setErro("");
    const r = await chamar<unknown>("/api/comissoes/marcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cobranca_id: cobrancaId }) });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível marcar a comissão.");
    await carregar();
    setSalvando(false);
  }

  async function desmarcar(lancamentoId: string) {
    setSalvando(true); setErro("");
    const r = await chamar<unknown>("/api/comissoes/desmarcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lancamento_id: lancamentoId }) });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível desmarcar.");
    await carregar();
    setSalvando(false);
  }

  if (oculto || !estado) return null;
  const l = estado.lancamento;

  return (
    <div className="rounded-lg p-3 border space-y-2" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
      <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">💰 Comissão</p>

      {l ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip status={l.status} />
            <span className="text-sm font-semibold text-gray-900">{moeda(l.valor_comissao)}</span>
            <span className="text-xs text-gray-500">({l.percentual_aplicado}% de {moeda(l.base_valor)}) · competência {rotuloCompetencia(l.competencia)}</span>
          </div>
          {l.status === "retroativo_pendente" && <p className="text-xs text-amber-900">Cobrança de mês anterior: só conta depois que a diretoria aprovar.</p>}
          {l.status === "contestada" && <p className="text-xs text-red-700">Contestada pela diretoria: {l.contestacao_motivo}</p>}
          {l.pode_desmarcar ? (
            <button onClick={() => desmarcar(l.id)} disabled={salvando} className="text-xs font-semibold underline text-gray-700 disabled:opacity-50">
              Desmarcar (esta comissão não é minha)
            </button>
          ) : (
            <p className="text-xs text-gray-500">Depois que a diretoria valida a cobrança, só a diretoria desfaz a comissão.</p>
          )}
        </div>
      ) : estado.pode_marcar ? (
        <div className="space-y-1">
          {estado.sugestao_responsavel_da_vaga && <p className="text-xs text-gray-600">Você é o responsável por esta vaga — mas a marcação é sempre sua escolha.</p>}
          <label className="flex items-start gap-2 text-sm text-gray-900 cursor-pointer">
            <input type="checkbox" checked={false} disabled={salvando} onChange={marcar} className="mt-1" />
            <span>
              <strong>Esta comissão é minha</strong>
              <span className="block text-xs text-gray-600">
                Comissão prevista: {moeda(estado.comissao_prevista)} ({estado.percentual}% de {moeda(estado.fee_valor)}).
                {estado.retroativo && estado.competencia ? ` Cobrança de ${rotuloCompetencia(estado.competencia)}: vai para aprovação da diretoria.` : ""}
              </span>
            </span>
          </label>
        </div>
      ) : (
        <p className="text-xs text-gray-600">{estado.motivo_bloqueio ?? "Esta cobrança não pode receber marcação de comissão."}</p>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
