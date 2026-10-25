import type { SalarioModo } from "./constants";
import { salarioLegivel, type SecaoResumo } from "./solicitacaoVagaPublicaForm";

// Solicitação de vaga do portal: o corpo do POST e o resumo de conferência, em funções puras (sem I/O) para a página e os scripts usarem as mesmas.
// Nada daqui conhece contratante, aceite ou condições comerciais: o cliente do portal já é cadastrado.

// Os mesmos nomes dos cartões de "Tipo de Serviço" do formulário do portal (TIPOS em solicitar-vaga/page.tsx).
const NOME_DO_TIPO: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização",
};

export interface EntradaCorpoPortal {
  cargo: string;
  tipoServico: string;
  numPosicoes: string;
  cidade: string;
  estado: string;
  // Já no formato gravado (salarioParaEnvio da página): "2500", "R$ 9,50/hora", sentinela ou null.
  salarioParaEnvio: string | null;
  adicionaisSalariais: string;
  horarioTipo: string;
  horarioTexto: string;
  previsaoInicio: string;
  requisitosTexto: string;
  reqChipsList: string[];
  beneficiosTexto: string;
  beneficiosChips: Record<string, boolean>;
  principaisAtividades: string;
  observacoes: string;
  horarioPadrao: unknown;
  confidencial: boolean;
}

// Corpo exato que a página sempre enviou para /api/portal/solicitar-vaga (mesmas chaves, mesma ordem, mesmos valores).
export function montarCorpoSolicitacaoPortal(e: EntradaCorpoPortal) {
  return {
    cargo: e.cargo.trim(),
    tipo_servico: e.tipoServico,
    num_posicoes: Number(e.numPosicoes) || 1,
    cidade: e.cidade.trim(),
    estado: e.estado,
    salario: e.salarioParaEnvio,
    adicionais_salariais: e.adicionaisSalariais.trim() || null,
    horario_tipo: e.horarioTipo || null,
    horario_texto: e.horarioTexto || null,
    previsao_inicio: e.previsaoInicio || null,
    requisitos: e.requisitosTexto || null,
    requisitos_chips: e.reqChipsList.length > 0 ? e.reqChipsList : null,
    beneficios: e.beneficiosTexto || null,
    beneficios_chips: e.beneficiosChips,
    principais_atividades: e.principaisAtividades.trim() || null,
    observacoes: e.observacoes.trim() || null,
    horario_padrao: e.horarioPadrao,
    confidencial: e.confidencial,
  };
}

export interface EntradaResumoPortal {
  tipoServico: string;
  cargo: string;
  numPosicoes: string;
  cidade: string;
  estado: string;
  salario: string;
  salarioModo: SalarioModo;
  salarioPeriodo: "mes" | "hora";
  adicionaisSalariais: string;
  previsaoInicio: string;
  horarioTexto: string;
  beneficios: string[];
  requisitos: string[];
  principaisAtividades: string;
  observacoes: string;
  confidencial: boolean;
}

// Seções do cartão "Confira a sua solicitação" do portal. Linhas vazias não aparecem e uma seção sem linhas some; "Confidencial" só aparece marcado.
export function resumoDaSolicitacaoPortal(e: EntradaResumoPortal): SecaoResumo[] {
  const preenchidas = (linhas: { rotulo: string; valor: string | null | undefined }[]) =>
    linhas.filter((l) => l.valor && l.valor.trim()).map((l) => ({ rotulo: l.rotulo, valor: l.valor!.trim() }));
  const tipo = NOME_DO_TIPO[e.tipoServico] ?? e.tipoServico;
  const secoes: SecaoResumo[] = [
    {
      titulo: "A vaga",
      linhas: preenchidas([
        { rotulo: "Tipo de serviço", valor: tipo },
        { rotulo: "Cargo", valor: e.cargo },
        { rotulo: "Vagas", valor: String(Number(e.numPosicoes) || 1) },
        { rotulo: "Local", valor: [e.cidade.trim(), e.estado].filter(Boolean).join(" / ") },
        { rotulo: "Previsão de início", valor: e.previsaoInicio ? e.previsaoInicio.split("-").reverse().join("/") : null },
        { rotulo: "Salário", valor: salarioLegivel({ salario: e.salario, salario_modo: e.salarioModo, salario_periodo: e.salarioPeriodo }) },
        { rotulo: "Adicionais", valor: e.salarioModo === "fixo" ? e.adicionaisSalariais : null },
        { rotulo: "Horário", valor: e.horarioTexto },
        { rotulo: "Benefícios", valor: e.beneficios.join(", ") },
        { rotulo: "Confidencial", valor: e.confidencial ? "Sim" : null },
      ]),
    },
    {
      titulo: "Requisitos e atividades",
      linhas: preenchidas([
        { rotulo: "Requisitos", valor: e.requisitos.join(", ") },
        { rotulo: "Principais atividades", valor: e.principaisAtividades },
        { rotulo: "Outras informações", valor: e.observacoes },
      ]),
    },
  ];
  return secoes.filter((s) => s.linhas.length > 0);
}
