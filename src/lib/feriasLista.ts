// Férias (aviso de vencimento): a lista (tela e exportação CSV usam a MESMA montagem, então o arquivo é exatamente o que a tela mostra).
// Filtra, ordena por urgência e gera o CSV. O banco só é lido aqui; as regras de data vêm de feriasRegras.ts.
import type { NextResponse } from "next/server";
import type { createServiceClient } from "@/lib/supabase/server";
import type { ContextoUnidade } from "@/lib/unidadeAuth";
import { celulaCsv } from "@/lib/gestaoPessoasLista";
import { dataBR } from "@/lib/dataBR";
import { ROTULO_ESTADO_FERIAS, ROTULO_SITUACAO_FERIAS, textoDiasRestantes, type OrigemPeriodo, type SemaforoFerias, type SituacaoFerias } from "@/lib/feriasRegras";
import { filtrarLinhasFerias, type FiltrosFerias, type LinhaFerias } from "@/lib/feriasLinhas";
import { aplicarMudancasAutomaticasFerias, LIMITE_AUTOMATICO_LISTA, carregarDadosFerias, carregarElegiveis, garantirPeriodosLote, montarEstado, respostaDeErro } from "@/lib/feriasPeriodos";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Tipos e filtro da linha vivem em feriasLinhas.ts (puro, usado também pela tela); reexportados aqui para quem já importava deste arquivo.
export { filtrarLinhasFerias };
export type { FiltrosFerias, LinhaFerias };

export interface ListaFerias {
  linhas: LinhaFerias[];
  // Clientes e unidades com funcionário no controle (opções dos filtros; independem dos filtros aplicados).
  clientes: { id: string; nome: string }[];
  unidades: { id: string; nome: string }[];
  resumo: { total: number; vermelho: number; amarelo: number; verde: number; cinza: number };
}

const ORDEM_SEMAFORO: Record<SemaforoFerias, number> = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3 };

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

// Último período lançado pelo RH (origem "gerado", fora de "a programar"): é o único que a rota de situação aceita reabrir.
function ultimoLancado(periodos: { id: string; numero: number; situacao: SituacaoFerias; origem: OrigemPeriodo; gozo_inicio: string | null; gozo_fim: string | null }[]): LinhaFerias["reabrivel"] {
  const p = [...periodos].filter((x) => x.origem === "gerado" && x.situacao !== "a_programar").sort((a, b) => b.numero - a.numero)[0];
  return p ? { id: p.id, numero: p.numero, situacao: p.situacao, gozo_inicio: p.gozo_inicio, gozo_fim: p.gozo_fim } : null;
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
  // A tela nunca mostra situação desatualizada entre dois crons. Falha aqui não derruba a lista: mostra como está e o próximo cron tenta de novo.
  let periodosDaLista = garantido.periodos;
  try {
    const auto = await aplicarMudancasAutomaticasFerias(svc, funcionarios, garantido.periodos, hojeISO, LIMITE_AUTOMATICO_LISTA);
    periodosDaLista = auto.periodos;
    if (auto.erro) console.error("[ferias] Mudança automática de situação falhou ao listar:", auto.erro.message);
  } catch (err) {
    console.error("[ferias] Mudança automática de situação falhou ao listar:", err);
  }

  const clienteIds = [...new Set(funcionarios.map((f) => f.cliente_id).filter((id): id is string => !!id))];
  const [{ data: clientes }, { data: unidades }] = await Promise.all([
    clienteIds.length > 0 ? svc.from("clientes").select("id, nome").in("id", clienteIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    svc.from("unidades").select("id, nome"),
  ]);
  const nomeCliente = new Map((clientes ?? []).map((c) => [c.id as string, c.nome as string]));
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));

  const todas: LinhaFerias[] = funcionarios.map((f) => {
    const e = montarEstado(f, dados, periodosDaLista.get(f.id) ?? [], hojeISO);
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
      reabrivel: ultimoLancado(e.periodos),
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
