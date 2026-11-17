// Campos OBRIGATÓRIOS dos dados de admissão por tipo de serviço (R&S, MOT, Terceirização). Fonte única: o formulário do Portal do Cliente
// (indicação com vaga e sem vaga) e o servidor usam estas mesmas regras e mensagens. O servidor só as aplica à indicação SEM vaga (criação e
// edição); a indicação com vaga segue com a validação de sempre (obrigatoriedade só na tela). Função pura, sem imports de servidor nem de tela.

export const TIPO_RS = "recrutamento_selecao";
export const TIPO_MOT = "mao_obra_temporaria";
export const TIPO_TERC = "terceirizacao";

export interface DadosObrigatorios {
  admissao_data_inicio?: string | null;
  admissao_funcao?: string | null;
  admissao_setor?: string | null;
  admissao_centro_custo?: string | null;
  admissao_salario?: number | string | null;
  admissao_salario_hora?: number | string | null;
  admissao_horario?: string | null;
  admissao_turno?: string | null;
  admissao_escala?: string | null;
  admissao_tempo_contrato?: string | null;
  admissao_vt?: boolean | null;
  admissao_exame_responsavel?: string | null;
}

const texto = (v: string | null | undefined) => typeof v === "string" && v.trim() !== "";
// Aceita número ou texto numérico: o banco devolve numeric como número, mas um corpo mesclado pode trazer o valor como veio.
const positivo = (v: number | string | null | undefined) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

// Lista as mensagens de tudo o que falta, na ordem em que aparecem na tela. Tipo desconhecido = nada exigido.
export function faltandoObrigatorios(tipoServico: string | null | undefined, d: DadosObrigatorios): string[] {
  const falta: string[] = [];
  const exige = (ok: boolean, mensagem: string) => { if (!ok) falta.push(mensagem); };

  if (tipoServico === TIPO_RS) {
    exige(texto(d.admissao_data_inicio), "Informe a data de início.");
    exige(texto(d.admissao_funcao), "Informe a função confirmada.");
    exige(positivo(d.admissao_salario), "Informe o salário acordado.");
  } else if (tipoServico === TIPO_MOT) {
    exige(texto(d.admissao_data_inicio), "Informe a data de início.");
    exige(texto(d.admissao_funcao), "Informe a função.");
    exige(texto(d.admissao_setor), "Informe o setor.");
    exige(texto(d.admissao_centro_custo), "Informe o centro de custo.");
    // Horista ou mensalista: basta um dos dois salários.
    exige(positivo(d.admissao_salario) || positivo(d.admissao_salario_hora), "Informe o salário.");
    exige(texto(d.admissao_turno), "Selecione o turno.");
    exige(!texto(d.admissao_turno) || texto(d.admissao_horario), "Informe o horário de entrada e saída.");
    exige(texto(d.admissao_escala), "Selecione a escala.");
    exige(texto(d.admissao_tempo_contrato), "Informe o tempo de contrato.");
    exige(typeof d.admissao_vt === "boolean", "Informe se utiliza Vale Transporte.");
    exige(texto(d.admissao_exame_responsavel), "Informe o responsável pelo exame admissional.");
  } else if (tipoServico === TIPO_TERC) {
    exige(texto(d.admissao_data_inicio), "Informe a data de início.");
    exige(texto(d.admissao_funcao), "Informe a função/cargo.");
    exige(texto(d.admissao_setor), "Informe o setor.");
    exige(texto(d.admissao_centro_custo), "Informe o centro de custo.");
    exige(positivo(d.admissao_salario), "Informe o salário.");
    exige(texto(d.admissao_turno), "Selecione o turno.");
    exige(!texto(d.admissao_turno) || texto(d.admissao_horario), "Informe o horário de entrada e saída.");
    exige(typeof d.admissao_vt === "boolean", "Informe se utiliza Vale Transporte.");
    exige(texto(d.admissao_exame_responsavel), "Informe o responsável pelo exame admissional.");
  }
  return falta;
}

// Na EDIÇÃO de indicação sem vaga a exigência só entra quando o cliente mexe nestes campos (tudo que é "dado de admissão" exceto função e
// observações, que já existiam no formulário mínimo). Indicação antiga, só com a função, segue editável em nome, telefone, currículo etc.
export const CAMPOS_QUE_ATIVAM_EXIGENCIA: readonly string[] = [
  "admissao_data_inicio", "admissao_salario", "admissao_salario_hora", "admissao_setor", "admissao_centro_custo", "admissao_horario",
  "admissao_gestor", "admissao_periodo_experiencia", "admissao_turno", "admissao_escala", "admissao_tempo_contrato", "admissao_vt",
  "admissao_exame_responsavel", "admissao_local_integracao", "admissao_qtd_dias_teste",
];

export const mexeNosDadosDeAdmissao = (chaves: readonly string[]): boolean => chaves.some((c) => CAMPOS_QUE_ATIVAM_EXIGENCIA.includes(c));

// Quais dos 7 campos padronizados (CamposAdmissaoPadrao) o tipo exige — só para marcar o rótulo com "*" na tela; a exigência em si continua em
// faltandoObrigatorios acima (mesma lista, não há segunda regra).
export type CampoPadraoObrigatorio =
  | "admissao_salario" | "admissao_salario_hora" | "admissao_centro_custo" | "admissao_horario" | "admissao_turno" | "admissao_escala" | "admissao_tempo_contrato";

export function camposPadraoObrigatorios(tipoServico: string | null | undefined): CampoPadraoObrigatorio[] {
  if (tipoServico === TIPO_RS) return ["admissao_salario"];
  if (tipoServico === TIPO_MOT) return ["admissao_salario", "admissao_centro_custo", "admissao_horario", "admissao_turno", "admissao_escala", "admissao_tempo_contrato"];
  if (tipoServico === TIPO_TERC) return ["admissao_salario", "admissao_centro_custo", "admissao_horario", "admissao_turno"];
  return [];
}
