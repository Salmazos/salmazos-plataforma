// Gestão de Pessoas interativa: a LISTA de funcionários que os gráficos e cartões filtram ("estilo Qlik").
// Tudo aqui é puro (sem banco): o servidor carrega as pessoas ativas UMA vez (carregarPessoasAtivas) e aplica os filtros com a MESMA classificação dos
// gráficos (classificarIdade, bucketSexo, normalizarCargo, admitidoNoMes, ocorrenciaDeAniversario, mesesDeCasa), então o tamanho da lista é, por construção,
// o número mostrado no gráfico ou no cartão clicado. Regras (decisões do Ölver):
//  - entre dimensões diferentes (sexo, faixa, escolaridade, cargo, admitido no mês, aniversariante) é AND;
//  - dentro da mesma dimensão, clicar em outro valor SUBSTITUI; clicar de novo no valor ativo REMOVE (alternarFiltros);
//  - "Tempo médio de casa" só ORDENA (maior para o menor) e alterna; não é filtro;
//  - a linha da lista NUNCA tem id de funcionário/admissão/cliente, CPF, RG, PIS, cor/raça, endereço nem salário; no portal também não tem sexo, idade nem escolaridade.
import { GRAU_INSTRUCAO_OPTIONS } from "@/lib/admissaoConstants";
import { dataBR } from "@/lib/dataBR";
import {
  agruparCargos, bucketSexo, classificarIdade, FAIXAS_ETARIAS, MAX_CARGOS_NO_GRAFICO, admitidoNoMes, mesesDeCasa, normalizarCargo, ocorrenciaDeAniversario, situacaoDosFilhos, textoDosFilhos,
  ROTULO_CARGO_NAO_INFORMADO, type EstadoFilhos, type FaixaEtaria, type OcorrenciaAniversario, type PessoaAtiva, type SituacaoFilhos,
} from "@/lib/gestaoPessoas";

export type SexoFiltro = "masculino" | "feminino" | "naoInformado";
export const SEXOS_FILTRO: SexoFiltro[] = ["masculino", "feminino", "naoInformado"];
export const ROTULO_SEXO: Record<SexoFiltro, string> = { masculino: "Masculino", feminino: "Feminino", naoInformado: "Não informado" };
export const ESCOLARIDADE_NAO_INFORMADO = "nao_informado";
export const ESCOLARIDADES_FILTRO = [...GRAU_INSTRUCAO_OPTIONS.map((o) => o.value), ESCOLARIDADE_NAO_INFORMADO];
export const FAIXAS_FILTRO = FAIXAS_ETARIAS.map((f) => f.id);
export const FILHOS_FILTRO: EstadoFilhos[] = ["com", "sem", "naoInformado"];
// Valor especial do filtro de cargo: a barra "Demais cargos (N)" do gráfico (o servidor sabe quais são, pela mesma regra do gráfico).
export const CARGO_DEMAIS = "__demais__";

export interface FiltrosGestao {
  sexo?: SexoFiltro;
  faixa?: FaixaEtaria;
  escolaridade?: string;
  cargo?: string; // rótulo da barra do gráfico de cargos, ou CARGO_DEMAIS
  filhos?: EstadoFilhos; // com = ao menos um filho menor de 14; sem = veio por admissão e não tem; naoInformado = legado (sem admissão)
  admitidoNoMes?: true;
  aniversario?: number; // posição (0 a 11) do mês, na lista de 12 meses a partir do mês corrente
  ordenarPorTempoDeCasa?: true; // não filtra: só ordena
}
export type DimensaoFiltro = keyof FiltrosGestao;

// Um clique (ou vários valores de uma vez, como o segmento sexo×faixa do gráfico): se TODOS os pares já estão ativos, remove; senão aplica (substituindo).
export function alternarFiltros(atual: FiltrosGestao, pares: [DimensaoFiltro, FiltrosGestao[DimensaoFiltro]][]): FiltrosGestao {
  const todosAtivos = pares.every(([dim, valor]) => atual[dim] === valor);
  const proximo: Record<string, unknown> = { ...atual };
  for (const [dim, valor] of pares) {
    if (todosAtivos) delete proximo[dim];
    else proximo[dim] = valor;
  }
  return proximo as FiltrosGestao;
}

export const temFiltroAtivo = (f: FiltrosGestao) => Object.keys(f).length > 0;
// "Funcionários ativos" limpa TUDO (inclusive a ordem).
export const LIMPAR: FiltrosGestao = {};

// ── Classificação por pessoa (as mesmas funções dos gráficos) ───────────────
interface Linha {
  pessoa: PessoaAtiva;
  sexo: SexoFiltro;
  idade: number | null;
  faixa: FaixaEtaria;
  escolaridade: string;
  cargoChave: string;
  meses: number | null;
  admitidoNoMes: boolean;
  aniversario: OcorrenciaAniversario | null;
  filhos: SituacaoFilhos;
}

const GRAUS_CONHECIDOS = new Set(GRAU_INSTRUCAO_OPTIONS.map((o) => o.value));
const chaveDoRotulo = (rotulo: string) => (rotulo === ROTULO_CARGO_NAO_INFORMADO ? "" : normalizarCargo(rotulo));

function classificar(p: PessoaAtiva, hojeISO: string): Linha {
  const c = classificarIdade(p.dataNascimento, hojeISO);
  return {
    pessoa: p,
    sexo: bucketSexo(p.sexo),
    idade: c.idade,
    faixa: c.faixa,
    escolaridade: p.grauInstrucao && GRAUS_CONHECIDOS.has(p.grauInstrucao) ? p.grauInstrucao : ESCOLARIDADE_NAO_INFORMADO,
    cargoChave: normalizarCargo(p.cargo),
    meses: mesesDeCasa(p.dataAdmissao, hojeISO),
    admitidoNoMes: admitidoNoMes(p.dataAdmissao, hojeISO),
    aniversario: ocorrenciaDeAniversario(p.dataNascimento, hojeISO),
    filhos: situacaoDosFilhos(p.filhos, hojeISO),
  };
}

// Os cargos que o gráfico junta em "Demais cargos (N)": exatamente a regra de limitarCargos.
function cargosDemais(pessoas: PessoaAtiva[]): Set<string> {
  const grupos = agruparCargos(pessoas.map((p) => p.cargo));
  return grupos.length <= MAX_CARGOS_NO_GRAFICO ? new Set() : new Set(grupos.slice(MAX_CARGOS_NO_GRAFICO - 1).map((g) => chaveDoRotulo(g.cargo)));
}

export interface LinhaFiltrada extends Linha { rotuloSexo: string; rotuloEscolaridade: string }

export function filtrarFuncionariosGestao(pessoas: PessoaAtiva[], filtros: FiltrosGestao, hojeISO: string): LinhaFiltrada[] {
  const demais = filtros.cargo === CARGO_DEMAIS ? cargosDemais(pessoas) : null;
  const chaveCargo = filtros.cargo && filtros.cargo !== CARGO_DEMAIS ? chaveDoRotulo(filtros.cargo) : null;
  const linhas = pessoas.map((p) => classificar(p, hojeISO)).filter((l) =>
    (filtros.sexo === undefined || l.sexo === filtros.sexo) &&
    (filtros.faixa === undefined || l.faixa === filtros.faixa) &&
    (filtros.escolaridade === undefined || l.escolaridade === filtros.escolaridade) &&
    (demais === null || demais.has(l.cargoChave)) &&
    (chaveCargo === null || l.cargoChave === chaveCargo) &&
    (filtros.filhos === undefined || l.filhos.estado === filtros.filhos) &&
    (!filtros.admitidoNoMes || l.admitidoNoMes) &&
    (filtros.aniversario === undefined || l.aniversario?.indiceMes === filtros.aniversario));
  const porNome = (a: Linha, b: Linha) => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR");
  if (filtros.ordenarPorTempoDeCasa) {
    // maior tempo primeiro; quem não tem tempo (sem admissão ou admissão futura) vai para o fim
    linhas.sort((a, b) => (b.meses ?? -1) - (a.meses ?? -1) || porNome(a, b));
  } else if (filtros.aniversario !== undefined) {
    linhas.sort((a, b) => (a.aniversario?.ordem ?? 0) - (b.aniversario?.ordem ?? 0) || porNome(a, b));
  } else {
    linhas.sort(porNome);
  }
  return linhas.map((l) => ({ ...l, rotuloSexo: ROTULO_SEXO[l.sexo], rotuloEscolaridade: l.escolaridade === ESCOLARIDADE_NAO_INFORMADO ? "Não informado" : GRAU_INSTRUCAO_OPTIONS.find((o) => o.value === l.escolaridade)!.label }));
}

// "1 ano e 3 meses", "7 meses", "Menos de 1 mês"; sem tempo (sem admissão ou admissão futura) = "—".
export function formatarTempoDeCasa(meses: number | null): string {
  if (meses === null) return "—";
  const total = Math.floor(meses);
  if (total < 1) return "Menos de 1 mês";
  const anos = Math.floor(total / 12), resto = total % 12;
  const m = (x: number) => `${x} ${x === 1 ? "mês" : "meses"}`;
  if (anos === 0) return m(total);
  const a = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return resto === 0 ? a : `${a} e ${m(resto)}`;
}

// ── Linhas que vão para o navegador ──────────────────────────────────────────
// `filhos` é o texto pronto (textoDosFilhos): nome e idade de menores de 14, nunca a data de nascimento do filho.
export interface LinhaListaPortal { nome: string; cargo: string | null; dataAdmissao: string; tempoDeCasa: string; filhos: string; diaMes?: string; completaAnos?: number }
export interface LinhaListaRH extends LinhaListaPortal { idade: number | null; sexo: string; escolaridade: string }

const cargoDe = (l: Linha) => (l.pessoa.cargo ?? "").trim() || null;

export function linhasParaPortal(linhas: LinhaFiltrada[], filtros: FiltrosGestao): LinhaListaPortal[] {
  return linhas.map((l) => ({
    nome: l.pessoa.nome, cargo: cargoDe(l), dataAdmissao: dataBR(l.pessoa.dataAdmissao), tempoDeCasa: formatarTempoDeCasa(l.meses), filhos: textoDosFilhos(l.filhos, "portal"),
    ...(filtros.aniversario !== undefined && l.aniversario ? { diaMes: l.aniversario.diaMes, completaAnos: l.aniversario.completaAnos } : {}),
  }));
}

export function linhasParaRH(linhas: LinhaFiltrada[], filtros: FiltrosGestao): LinhaListaRH[] {
  const base = linhasParaPortal(linhas, filtros);
  return linhas.map((l, i) => ({ ...base[i], filhos: textoDosFilhos(l.filhos, "rh"), idade: l.idade, sexo: l.rotuloSexo, escolaridade: l.rotuloEscolaridade }));
}

// ── CSV (só o RH) ────────────────────────────────────────────────────────────
// Separador ";" e BOM UTF-8 (Excel brasileiro). Célula que começa com = + - @ (ou tab/CR) é lida como fórmula: ganha um apóstrofo na frente.
export function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}
export function celulaCsv(valor: string | number | null | undefined): string {
  const t = neutralizarFormula(valor === null || valor === undefined ? "" : String(valor));
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function montarCsvRH(linhas: LinhaListaRH[], comAniversario: boolean): string {
  const cab = ["Nome", "Cargo", "Data de admissão", "Tempo de casa", "Idade", "Sexo", "Escolaridade", "Filhos", ...(comAniversario ? ["Aniversário", "Completa (anos)"] : [])];
  const corpo = linhas.map((l) => [l.nome, l.cargo ?? "", l.dataAdmissao, l.tempoDeCasa, l.idade ?? "", l.sexo, l.escolaridade, l.filhos, ...(comAniversario ? [l.diaMes ?? "", l.completaAnos ?? ""] : [])]);
  return "﻿" + [cab, ...corpo].map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";
}

const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
// "gestao-pessoas-{empresa-sem-acento}-{dd-mm-aaaa}.csv" (a data no nome do arquivo é exceção aceita; sai de dataBR, não de new Date).
export function nomeArquivoCsv(empresa: string, hojeISO: string): string {
  const slug = empresa.normalize("NFD").replace(MARCAS, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "empresa";
  return `gestao-pessoas-${slug}-${dataBR(hojeISO).replace(/\//g, "-")}.csv`;
}

// Texto curto dos filtros para a auditoria (sem dado pessoal).
export function descricaoDosFiltros(f: FiltrosGestao): Record<string, unknown> {
  return { ...f };
}
