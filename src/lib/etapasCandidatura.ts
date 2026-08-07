// Fonte única para o domínio candidatos_vagas.etapa — substitui ETAPAS_VAGA
// (VagaDetalheClient.tsx) e OPCOES_POR_ETAPA/ETAPAS_REJEICAO (CandidatoCard.tsx),
// que tinham definições soltas e divergentes (entrevista_rh duplicando o label de
// entrevista_salmazos, reprovado_cliente com o mesmo label de reprovado).
//
// Domínio diferente de ETAPAS_KANBAN/ETAPAS_KANBAN_VISIVEIS/ETAPAS_SAIDA_VAGA
// (lib/constants.ts), que descrevem candidatos.etapa_kanban — não mexer aqui.

export type EtapaCandidaturaId =
  | "triagem"
  | "entrevista_salmazos"
  | "entrevista_cliente"
  | "aprovado_cliente"
  | "aprovado"
  | "contratado"
  | "reprovado"
  | "reprovado_cliente"
  | "reprovado_final"
  | "nao_tem_interesse"
  | "nao_compareceu"
  | "bloqueado";

export interface EtapaCandidaturaDef {
  id: EtapaCandidaturaId;
  label: string;
  bg: string;
  color: string;
}

export const ETAPAS_CANDIDATURA: EtapaCandidaturaDef[] = [
  { id: "triagem",             label: "Triagem",                 bg: "#1D6FA4", color: "#ffffff" },
  { id: "entrevista_salmazos", label: "Entrevista Salmazos",     bg: "#FFD700", color: "#000000" },
  { id: "entrevista_cliente",  label: "Entrevista Cliente",       bg: "#F97316", color: "#ffffff" },
  { id: "aprovado_cliente",    label: "Aprovado pelo Cliente",    bg: "#16A34A", color: "#ffffff" },
  { id: "aprovado",            label: "Aprovado",                 bg: "#1D9E75", color: "#ffffff" },
  { id: "contratado",          label: "Contratado",               bg: "#16A34A", color: "#ffffff" },
  { id: "reprovado",           label: "Reprovado",                bg: "#EC4899", color: "#ffffff" },
  { id: "reprovado_cliente",   label: "Reprovado pelo Cliente",   bg: "#DB2777", color: "#ffffff" },
  { id: "reprovado_final",     label: "Processo Encerrado",       bg: "#6B7280", color: "#ffffff" },
  { id: "nao_tem_interesse",   label: "Não tem Interesse",        bg: "#9CA3AF", color: "#ffffff" },
  { id: "nao_compareceu",      label: "Não Compareceu",           bg: "#EF4444", color: "#ffffff" },
  { id: "bloqueado",           label: "Bloqueado",                bg: "#7F1D1D", color: "#ffffff" },
];

// entrevista_rh: id legado (renomeado pra entrevista_salmazos em algum momento).
// Nunca aparece como opção selecionável — só resolve o label de registros antigos
// de histórico que ainda carregam esse valor.
const LABEL_LEGADO: Record<string, string> = {
  entrevista_rh: "Entrevista Salmazos",
};

export function getEtapaInfo(id: string): EtapaCandidaturaDef {
  return ETAPAS_CANDIDATURA.find((e) => e.id === id) ?? ETAPAS_CANDIDATURA[0];
}

export function getEtapaLabel(id: string): string {
  const encontrada = ETAPAS_CANDIDATURA.find((e) => e.id === id);
  if (encontrada) return encontrada.label;
  return LABEL_LEGADO[id] ?? id;
}

export interface EtapaOption {
  value: EtapaCandidaturaId;
  label: string;
}

function opcao(id: EtapaCandidaturaId): EtapaOption {
  return { value: id, label: getEtapaLabel(id) };
}

// processoSimplificado (clientes.processo_simplificado) pula "Entrevista Salmazos"
// só na transição a partir de triagem — indo direto pra "Entrevista Cliente".
export function getProximasEtapas(etapaAtual: string, processoSimplificado: boolean): EtapaOption[] {
  switch (etapaAtual) {
    case "triagem":
      return [
        processoSimplificado ? opcao("entrevista_cliente") : opcao("entrevista_salmazos"),
        opcao("nao_tem_interesse"),
        opcao("reprovado"),
        opcao("bloqueado"),
      ];
    case "entrevista_salmazos":
      return [
        opcao("entrevista_cliente"),
        opcao("nao_tem_interesse"),
        opcao("reprovado"),
        opcao("bloqueado"),
      ];
    case "entrevista_cliente":
      return [
        opcao("aprovado_cliente"),
        opcao("reprovado_cliente"),
        opcao("nao_tem_interesse"),
        opcao("nao_compareceu"),
        opcao("bloqueado"),
      ];
    case "aprovado_cliente":
      return [opcao("contratado"), opcao("reprovado_final")];
    default:
      return [];
  }
}

export type ComportamentoEtapa =
  | "entrevista_salmazos"
  | "encaminhamento"
  | "motivo_interno"
  | "motivo_cliente"
  | "finalizar"
  | "direto";

// Dispatch único: qual modal (se algum) uma transição exige. Usado tanto pelo
// Kanban geral quanto pela tela de Vaga, pra nunca mais divergir entre os dois.
export function getComportamentoEtapa(etapaDestino: string): ComportamentoEtapa {
  switch (etapaDestino) {
    case "entrevista_salmazos":
      return "entrevista_salmazos";
    case "entrevista_cliente":
      return "encaminhamento";
    case "reprovado":
      return "motivo_interno";
    case "reprovado_cliente":
      return "motivo_cliente";
    case "contratado":
    case "reprovado_final":
      return "finalizar";
    default:
      return "direto";
  }
}
