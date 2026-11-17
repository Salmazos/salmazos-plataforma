import { TEMPO_CONTRATO_PADRAO } from "@/lib/constants";
import { MOSTRAR_DIA_TESTE_NO_PORTAL } from "@/lib/diaTestePortal";
import { ESTADO_DIAS_TESTE_VAZIO, diasTesteParaEnvio, estadoDiasTesteDeValor, type EstadoDiasTeste } from "@/components/CampoDiasTeste";
import type { CamposAdmissaoPadrao } from "@/lib/admissaoCamposPadrao";
import { TIPO_MOT, TIPO_RS, TIPO_TERC } from "@/lib/admissaoObrigatorios";

// Estado do bloco "Dados para Admissão" do Portal do Cliente (indicação com vaga, sem vaga e edição) e a conversão de/para as colunas
// admissao_* de solicitacoes_indicacao_candidato. O bloco (BlocoDadosAdmissao) é o MESMO nos três; aqui mora tudo que não é tela.
// `padrao` guarda os 7 campos padronizados (salário, centro de custo, horário, turno, escala, tempo de contrato) do CamposAdmissaoPadrao.

export interface DadosAdmissaoForm {
  data_inicio: string;
  funcao: string;
  setor: string;
  gestor: string;
  periodo_exp: string;
  padrao: CamposAdmissaoPadrao;
  vt: boolean | null;
  exame: string;
  integ_local: string;
  integ_data: string;
  integ_hora: string;
  // Texto de integração que já existia e não está no formato "Local, DD/MM/AAAA às HH:MM": preservado enquanto o cliente não mexer nos 3 campos.
  integ_legado: string;
  dias_teste: EstadoDiasTeste;
  observacoes: string;
}

export const comHorario = (tipo: string | null | undefined) => tipo === TIPO_MOT || tipo === TIPO_TERC;

// Tempo de contrato já vem com o padrão no MOT (era assim no formulário); nos demais tipos o campo nem aparece.
export function dadosVazios(tipo: string | null | undefined): DadosAdmissaoForm {
  return {
    data_inicio: "", funcao: "", setor: "", gestor: "", periodo_exp: "",
    padrao: tipo === TIPO_MOT ? { admissao_tempo_contrato: TEMPO_CONTRATO_PADRAO } : {},
    vt: null, exame: "", integ_local: "", integ_data: "", integ_hora: "", integ_legado: "",
    dias_teste: ESTADO_DIAS_TESTE_VAZIO, observacoes: "",
  };
}

// Trocar o tipo (vaga de outro tipo, ou o tipo do sem vaga) refaz o que depende dele e mantém o que vale para todos.
export function dadosAoTrocarTipo(atual: DadosAdmissaoForm, novoTipo: string | null | undefined): DadosAdmissaoForm {
  const novo = dadosVazios(novoTipo);
  return { ...novo, data_inicio: atual.data_inicio, funcao: atual.funcao, setor: atual.setor, observacoes: atual.observacoes };
}

export const formatarDataIntegracao = (iso: string) => iso.split("-").reverse().join("/");

const REGEX_INTEGRACAO = /^(.+), (\d{2})\/(\d{2})\/(\d{4}) às (\d{2}:\d{2})$/;
export function decomporIntegracao(texto: string | null | undefined): { local: string; data: string; hora: string } | null {
  const m = REGEX_INTEGRACAO.exec((texto ?? "").trim());
  return m ? { local: m[1], data: `${m[4]}-${m[3]}-${m[2]}`, hora: m[5] } : null;
}

export const integracaoPreenchidaParcialmente = (d: DadosAdmissaoForm): boolean =>
  Boolean((d.integ_local.trim() || d.integ_data || d.integ_hora) && !(d.integ_local.trim() && d.integ_data && d.integ_hora));

function integracaoComposta(d: DadosAdmissaoForm): string | null {
  if (d.integ_local.trim() && d.integ_data && d.integ_hora) return `${d.integ_local.trim()}, ${formatarDataIntegracao(d.integ_data)} às ${d.integ_hora}`;
  if (!d.integ_local.trim() && !d.integ_data && !d.integ_hora) return d.integ_legado.trim() || null;
  return null;
}

// Colunas que o bloco mostra por tipo (a edição só compara estas).
export function colunasVisiveis(tipo: string | null | undefined): string[] {
  const base = ["admissao_data_inicio", "admissao_funcao", "admissao_setor", "admissao_salario", "admissao_observacoes"];
  if (tipo === TIPO_RS) return [...base, "admissao_gestor", "admissao_periodo_experiencia"];
  if (tipo === TIPO_MOT) {
    return [...base, "admissao_salario_hora", "admissao_centro_custo", "admissao_horario", "admissao_turno", "admissao_escala", "admissao_tempo_contrato",
      "admissao_vt", "admissao_exame_responsavel", "admissao_local_integracao"];
  }
  if (tipo === TIPO_TERC) {
    return [...base, "admissao_centro_custo", "admissao_horario", "admissao_turno", "admissao_vt", "admissao_exame_responsavel", "admissao_local_integracao"];
  }
  return base;
}

export type ColunasAdmissao = Record<string, string | number | boolean | null | undefined>;

// Estado -> colunas admissao_* (o que vai no corpo da API). Campo que o tipo não mostra sai nulo.
export function colunasDeDados(d: DadosAdmissaoForm, tipo: string | null | undefined): ColunasAdmissao {
  const horario = comHorario(tipo);
  const mot = tipo === TIPO_MOT;
  const rs = tipo === TIPO_RS;
  const p = d.padrao;
  return {
    admissao_data_inicio: d.data_inicio || null,
    admissao_funcao: d.funcao.trim() || null,
    admissao_setor: d.setor.trim() || null,
    admissao_gestor: rs ? d.gestor.trim() || null : null,
    admissao_periodo_experiencia: rs ? d.periodo_exp || null : null,
    admissao_salario: p.admissao_salario ?? null,
    admissao_salario_hora: mot ? p.admissao_salario_hora ?? null : null,
    admissao_centro_custo: horario ? p.admissao_centro_custo || null : null,
    admissao_horario: horario ? p.admissao_horario || null : null,
    admissao_turno: horario ? p.admissao_turno || null : null,
    admissao_escala: mot ? p.admissao_escala || null : null,
    admissao_tempo_contrato: mot ? p.admissao_tempo_contrato || null : null,
    admissao_vt: horario ? d.vt : null,
    admissao_exame_responsavel: horario ? d.exame.trim() || null : null,
    admissao_local_integracao: horario ? integracaoComposta(d) : null,
    // R&S não tem dia de teste: undefined sai do JSON. O texto antigo (admissao_dia_teste) não é mais enviado.
    admissao_qtd_dias_teste: MOSTRAR_DIA_TESTE_NO_PORTAL && horario ? diasTesteParaEnvio(d.dias_teste) : undefined,
    admissao_observacoes: d.observacoes.trim() || null,
  };
}

// Colunas guardadas (indicação existente) -> estado do bloco, para a edição.
export function dadosDeColunas(c: Record<string, unknown>, tipo: string | null | undefined): DadosAdmissaoForm {
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  const n = (k: string) => (c[k] === null || c[k] === undefined || c[k] === "" ? null : Number(c[k]));
  const integ = decomporIntegracao(s("admissao_local_integracao"));
  const base = dadosVazios(tipo);
  return {
    ...base,
    data_inicio: s("admissao_data_inicio"), funcao: s("admissao_funcao"), setor: s("admissao_setor"), gestor: s("admissao_gestor"),
    periodo_exp: s("admissao_periodo_experiencia"),
    padrao: {
      admissao_salario: n("admissao_salario"), admissao_salario_hora: n("admissao_salario_hora"), admissao_centro_custo: s("admissao_centro_custo") || null,
      admissao_horario: s("admissao_horario") || null, admissao_turno: s("admissao_turno") || null, admissao_escala: s("admissao_escala") || null,
      admissao_tempo_contrato: s("admissao_tempo_contrato") || null,
    },
    vt: typeof c.admissao_vt === "boolean" ? c.admissao_vt : null,
    exame: s("admissao_exame_responsavel"),
    integ_local: integ?.local ?? "", integ_data: integ?.data ?? "", integ_hora: integ?.hora ?? "",
    integ_legado: integ ? "" : s("admissao_local_integracao"),
    dias_teste: estadoDiasTesteDeValor(c.admissao_qtd_dias_teste),
    observacoes: s("admissao_observacoes"),
  };
}
