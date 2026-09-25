// Rótulos e formatação dos campos de uma solicitação de vaga, sem dependência de servidor —
// usados tanto no e-mail (lib/solicitacaoAlteracao.ts) quanto nas telas que mostram o
// "antes → depois" de um pedido de alteração.

export const ROTULO_CAMPO_SOLICITACAO: Record<string, string> = {
  cargo: "Cargo",
  tipo_servico: "Tipo de serviço",
  num_posicoes: "Posições",
  cidade: "Cidade",
  estado: "UF",
  salario: "Salário",
  adicionais_salariais: "Adicionais salariais",
  previsao_inicio: "Previsão de início",
  horario_texto: "Horário",
  requisitos: "Requisitos",
  beneficios: "Benefícios",
  observacoes: "Observações",
  confidencial: "Confidencial",
};

const ROTULO_TIPO_SERVICO: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização",
};

export type Alteracoes = Record<string, { antes: unknown; depois: unknown }>;

export function valorLegivelCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo === "tipo_servico") return ROTULO_TIPO_SERVICO[String(valor)] ?? String(valor);
  if (campo === "confidencial") return valor ? "Sim" : "Não";
  if (campo === "previsao_inicio") return String(valor).split("-").reverse().join("/");
  return String(valor);
}
