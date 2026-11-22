// Férias (aviso de vencimento): a lista (tela e exportação CSV usam a MESMA montagem, então o arquivo é exatamente o que a tela mostra).
// Filtra, ordena por urgência e gera o CSV. O banco só é lido aqui; as regras de data vêm de feriasRegras.ts.
import type { NextResponse } from "next/server";
import type { createServiceClient } from "@/lib/supabase/server";
import type { ContextoUnidade } from "@/lib/unidadeAuth";
import { celulaCsv } from "@/lib/gestaoPessoasLista";
import { dataBR } from "@/lib/dataBR";
import {
  ROTULO_ESTADO_FERIAS, ROTULO_SITUACAO_FERIAS, textoDiasRestantes, type EstadoFerias, type OrigemPeriodo, type SemaforoFerias, type SituacaoFerias,
} from "@/lib/feriasRegras";
import { carregarDadosFerias, carregarElegiveis, garantirPeriodosLote, montarEstado, respostaDeErro } from "@/lib/feriasPeriodos";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface FiltrosFerias {
  cliente_id?: string;
  unidade_id?: string;
  situacao?: SituacaoFerias;
  semaforo?: SemaforoFerias;
  a_vencer?: boolean;
  busca?: string;
}

export interface LinhaFerias {
  funcionario_id: string;
  nome_completo: string;
  cliente_id: string | null;
  cliente_nome: string;
  unidade_id: string;
  unidade_nome: string;
  tipo_servico: string | null;
  efetivado_em: string | null;
  data_admissao: string | null;
  data_base: string | null;
  data_base_ajustada: boolean;
  estado: EstadoFerias;
  estado_rotulo: string;
  semaforo: SemaforoFerias;
  dias_restantes: number | null;
  saldo_confirmado: boolean;
  // Saldo não gravado mas dispensado: ainda não há período terminado (menos de 12 meses de casa), vale "nenhum" calculado na hora.
  saldo_calculado: boolean;
  programacao_vencida: boolean;
  periodo: {
    id: string;
    numero: number;
    aquisitivo_inicio: string;
    aquisitivo_fim: string;
    data_limite: string;
    situacao: SituacaoFerias;
    gozo_inicio: string | null;
    gozo_fim: string | null;
    observacao: string | null;
    origem: OrigemPeriodo;
  } | null;
}

export interface ListaFerias {
  linhas: LinhaFerias[];
  // Clientes e unidades com funcionário no controle (opções dos filtros; independem dos filtros aplicados).
  clientes: { id: string; nome: string }[];
  unidades: { id: string; nome: string }[];
  resumo: { total: number; vermelho: number; amarelo: number; verde: number; cinza: number };
}

const ORDEM_SEMAFORO: Record<SemaforoFerias, number> = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3 };

const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
const normalizar = (t: string) => t.normalize("NFD").replace(MARCAS, "").toLowerCase();

// Mesmo comportamento dos filtros da tela: todos combinam com AND.
export function filtrarLinhasFerias(linhas: LinhaFerias[], f: FiltrosFerias): LinhaFerias[] {
  const busca = f.busca ? normalizar(f.busca) : "";
  return linhas.filter((l) => {
    if (f.cliente_id && l.cliente_id !== f.cliente_id) return false;
    if (f.unidade_id && l.unidade_id !== f.unidade_id) return false;
    if (f.situacao && l.periodo?.situacao !== f.situacao) return false;
    if (f.semaforo && l.semaforo !== f.semaforo) return false;
    if (f.a_vencer && l.semaforo !== "amarelo" && l.semaforo !== "vermelho") return false;
    if (busca && !normalizar(l.nome_completo).includes(busca)) return false;
    return true;
  });
}

// Do mais urgente para o menos: vermelho (vencidos primeiro, dias negativos), amarelo, verde; cinza no fim, por nome.
function ordenar(linhas: LinhaFerias[]): LinhaFerias[] {
  return [...linhas].sort((a, b) => {
    if (ORDEM_SEMAFORO[a.semaforo] !== ORDEM_SEMAFORO[b.semaforo]) return ORDEM_SEMAFORO[a.semaforo] - ORDEM_SEMAFORO[b.semaforo];
    const da = a.dias_restantes ?? Number.POSITIVE_INFINITY;
    const db = b.dias_restantes ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.nome_completo.localeCompare(b.nome_completo, "pt-BR");
  });
}

// Monta a lista completa (já com os períodos garantidos) e aplica os filtros. Devolve `erroResposta` pronto quando o banco falha
// (503 se a migration ainda não foi aplicada).
export async function montarListaFerias(
  svc: ServiceClient,
  ctx: ContextoUnidade,
  filtros: FiltrosFerias,
  hojeISO: string
): Promise<{ lista: ListaFerias } | { erroResposta: NextResponse }> {
  const funcionarios = await carregarElegiveis(svc, ctx);
  const { dados, erro } = await carregarDadosFerias(svc, funcionarios.map((f) => f.id));
  if (erro) return { erroResposta: respostaDeErro(erro, "listar") };
  const garantido = await garantirPeriodosLote(svc, funcionarios, dados, hojeISO);
  if (garantido.erro) return { erroResposta: respostaDeErro(garantido.erro, "gerar períodos") };

  const clienteIds = [...new Set(funcionarios.map((f) => f.cliente_id).filter((id): id is string => !!id))];
  const [{ data: clientes }, { data: unidades }] = await Promise.all([
    clienteIds.length > 0 ? svc.from("clientes").select("id, nome").in("id", clienteIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    svc.from("unidades").select("id, nome"),
  ]);
  const nomeCliente = new Map((clientes ?? []).map((c) => [c.id as string, c.nome as string]));
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));

  const todas: LinhaFerias[] = funcionarios.map((f) => {
    const e = montarEstado(f, dados, garantido.periodos.get(f.id) ?? [], hojeISO);
    const p = e.avaliacao.periodo;
    return {
      funcionario_id: f.id,
      nome_completo: f.nome_completo,
      cliente_id: f.cliente_id,
      cliente_nome: (f.cliente_id ? nomeCliente.get(f.cliente_id) : null) ?? f.empresa ?? "—",
      unidade_id: f.unidade_id,
      unidade_nome: nomeUnidade.get(f.unidade_id) ?? "—",
      tipo_servico: f.tipo_servico,
      efetivado_em: f.efetivado_em,
      data_admissao: f.data_admissao,
      data_base: e.dataBase,
      data_base_ajustada: !!e.config?.data_base_ajustada,
      estado: e.avaliacao.estado,
      estado_rotulo: ROTULO_ESTADO_FERIAS[e.avaliacao.estado],
      semaforo: e.avaliacao.semaforo,
      dias_restantes: e.avaliacao.diasRestantes,
      saldo_confirmado: e.saldoConfirmado,
      saldo_calculado: e.avaliacao.saldoCalculado,
      programacao_vencida: e.avaliacao.programacaoVencida,
      periodo: p
        ? {
            id: p.id, numero: p.numero, aquisitivo_inicio: p.aquisitivo_inicio, aquisitivo_fim: p.aquisitivo_fim, data_limite: p.data_limite,
            situacao: p.situacao, gozo_inicio: p.gozo_inicio, gozo_fim: p.gozo_fim, observacao: p.observacao, origem: p.origem,
          }
        : null,
    };
  });

  const linhas = ordenar(filtrarLinhasFerias(todas, filtros));
  const resumo = { total: linhas.length, vermelho: 0, amarelo: 0, verde: 0, cinza: 0 };
  for (const l of linhas) resumo[l.semaforo]++;
  const clientesFiltro = [...new Map(todas.filter((l) => l.cliente_id).map((l) => [l.cliente_id as string, { id: l.cliente_id as string, nome: l.cliente_nome }])).values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  );
  const unidadesFiltro = [...new Map(todas.map((l) => [l.unidade_id, { id: l.unidade_id, nome: l.unidade_nome }])).values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { lista: { linhas, clientes: clientesFiltro, unidades: unidadesFiltro, resumo } };
}

// ── CSV (para enviar à contabilidade) ───────────────────────────────────────
const dataOuVazio = (d: string | null | undefined) => (d ? dataBR(d) : "");

export const CABECALHO_CSV_FERIAS = [
  "Funcionário", "Cliente", "Unidade", "Admissão", "Data-base", "Período atual", "Data-limite", "Dias restantes", "Situação", "Início programado", "Fim programado",
];

export function montarCsvFerias(linhas: LinhaFerias[]): string {
  const corpo = linhas.map((l) => {
    const p = l.periodo;
    // Estado fora do normal (sem data-base, saldo pendente...) aparece como situação; o período só mostra datas quando o prazo vale.
    const situacao = l.estado === "ok" ? (p ? ROTULO_SITUACAO_FERIAS[p.situacao] : "") : l.estado_rotulo;
    return [
      l.nome_completo.trim(),
      l.cliente_nome,
      l.unidade_nome,
      dataOuVazio(l.data_admissao),
      dataOuVazio(l.data_base),
      p ? `${dataBR(p.aquisitivo_inicio)} a ${dataBR(p.aquisitivo_fim)}` : "",
      l.estado === "ok" && p ? dataBR(p.data_limite) : "",
      l.estado === "ok" ? (l.dias_restantes === null ? "" : textoDiasRestantes(l.dias_restantes)) : "",
      situacao,
      p ? dataOuVazio(p.gozo_inicio) : "",
      p ? dataOuVazio(p.gozo_fim) : "",
    ];
  });
  // Separador ";" e BOM UTF-8 (Excel brasileiro), como a exportação da Gestão de Pessoas.
  return "﻿" + [CABECALHO_CSV_FERIAS, ...corpo].map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";
}

export function nomeArquivoCsvFerias(hojeISO: string, aVencer: boolean): string {
  return `ferias${aVencer ? "-a-vencer" : ""}-${dataBR(hojeISO).replace(/\//g, "-")}.csv`;
}

// Texto curto dos filtros para a auditoria (sem dado pessoal).
export function descricaoFiltrosFerias(f: FiltrosFerias): Record<string, unknown> {
  return { ...f };
}
