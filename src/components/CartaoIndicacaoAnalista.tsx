"use client";

import IndicacaoSemVagaAcoes from "./IndicacaoSemVagaAcoes";
import { ROTULO_TIPO_SERVICO, estadoIndicacaoAnalista, type IndicacaoParaTela } from "@/lib/indicacaoSemVaga";

// Peças da tela do analista (ModalIndicacoesCandidato) que dependem de a indicação ter vaga ou não, em componentes sem busca de dados nem estado
// próprio de modal, para poderem ser renderizadas e testadas com o dado real da lista (scripts/verificar-tela-indicacao-analista.mts).

export const TIPO_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  recrutamento_selecao: { label: "R&S", bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria: { label: "MOT", bg: "#FFD700", color: "#000" },
  terceirizacao: { label: "Terceirização", bg: "#1D9E75", color: "#fff" },
};

export interface IndicacaoCartao extends IndicacaoParaTela {
  id: string;
  candidato_nome: string;
  candidato_telefone: string;
  cliente_nome: string | null;
  created_at: string;
  vaga_id?: string | null;
  admissao_funcao?: string | null;
  [campo: string]: unknown;
}

interface TopoProps {
  item: IndicacaoCartao;
  onAtualizadoSemVaga: (novo: Record<string, unknown>, mensagem: string, aviso?: string | null) => void;
}

// Nome, telefone, selo do tipo, data, a linha "cliente indicou…" e — quando cabe — as ações do analista (direcionar / criar vaga / completar dados).
export function CartaoIndicacaoTopo({ item, onAtualizadoSemVaga }: TopoProps) {
  const e = estadoIndicacaoAnalista(item);
  const tipo = e.tipoServico ? TIPO_LABEL[e.tipoServico] ?? { label: e.tipoServico, bg: "#6B7280", color: "#fff" } : null;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-gray-900 text-sm">{item.candidato_nome}</span>
        <span className="text-gray-300">—</span>
        <span className="font-semibold text-gray-800 text-sm">{item.candidato_telefone}</span>
        {tipo && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: tipo.bg, color: tipo.color }}>
            {tipo.label}
          </span>
        )}
        <span className="text-[10px] text-gray-400 ml-auto">{new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
      </div>

      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{item.cliente_nome}</span>{" "}
        {e.semVaga ? (
          <>
            indicou <span className="font-semibold text-amber-700">SEM VAGA (aguardando direcionamento)</span>
            {e.tipoServico ? <> · {ROTULO_TIPO_SERVICO[e.tipoServico] ?? e.tipoServico}</> : null}
          </>
        ) : (
          <>indicou pra vaga <span className="font-medium text-gray-700">{item.vagas?.titulo ?? "—"}</span></>
        )}
      </div>

      {e.mostrarAcoesSemVaga && <IndicacaoSemVagaAcoes item={item} onAtualizado={onAtualizadoSemVaga} />}
    </>
  );
}

interface AprovarProps {
  semVaga: boolean;
  carregando: boolean;
  // Outros motivos para não poder aprovar agora (busca de duplicado em andamento, data de término inválida…).
  desabilitado: boolean;
  dica?: string;
  onClick: () => void;
}

// O botão existe SEMPRE; sem vaga fica desabilitado com a dica (o servidor também recusa, com mensagem própria).
export function BotaoAprovarIndicacao({ semVaga, carregando, desabilitado, dica, onClick }: AprovarProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={semVaga || desabilitado}
      title={semVaga ? dica : desabilitado ? dica : undefined}
      className="text-xs font-semibold text-black bg-[#FFD700] rounded-lg px-3 py-1.5 hover:brightness-95 disabled:opacity-50"
    >
      {carregando ? "Aprovando..." : "Aprovar e registrar candidato"}
    </button>
  );
}
