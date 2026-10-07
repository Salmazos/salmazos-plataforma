import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResumoContratoMot } from "./contratoMotStatus";
import { hojeBrasiliaISO, formatarDataBR } from "./rescisaoProgramada";

// Eventos do contrato MOT (tabela funcionario_mot_eventos) — prorrogação e afastamento. Ver
// supabase/migration_funcionario_mot_eventos.sql. A regra de silêncio do aviso mora em
// contratoMotStatus.ts (avisoMotSilenciado); aqui só se monta o resumo por funcionário.

export type TipoEventoMot = "prorrogacao" | "afastamento_inicio" | "afastamento_fim";

export interface EventoMotLinha {
  id: string;
  funcionario_id: string;
  tipo: string;
  data_evento: string;
  corrige_evento_id: string | null;
  criado_em: string;
}

export interface RescisaoMotLinha {
  funcionario_id: string;
  data_desligamento: string;
}

function diasEntre(inicioISO: string, fimISO: string): number {
  const ms = Date.parse(`${fimISO}T00:00:00Z`) - Date.parse(`${inicioISO}T00:00:00Z`);
  return Math.floor(ms / 86400000);
}

// Ordem cronológica estável: data do evento e, no empate, o momento do lançamento.
export function ordenarEventosMot<T extends { data_evento: string; criado_em: string }>(eventos: T[]): T[] {
  return [...eventos].sort((a, b) =>
    a.data_evento === b.data_evento ? a.criado_em.localeCompare(b.criado_em) : a.data_evento.localeCompare(b.data_evento)
  );
}

// Eventos que valem: descarta a linha de correção em si (corrige_evento_id preenchido) e o evento que ela
// anulou. Evento nunca é apagado — a correção é um evento compensatório.
export function eventosMotValidos<T extends { id: string; corrige_evento_id: string | null }>(eventos: T[]): T[] {
  const anulados = new Set(eventos.map((e) => e.corrige_evento_id).filter((id): id is string => !!id));
  return eventos.filter((e) => !e.corrige_evento_id && !anulados.has(e.id));
}

// Afastamento em aberto = o último evento de afastamento válido é um início (início sem fim). Varre em ordem
// cronológica: um "fim" solto (sem início aberto) é ignorado, então anular um início nunca deixa o
// funcionário "afastado" por causa de um fim órfão.
export function afastamentoEmAberto(eventosValidos: Pick<EventoMotLinha, "tipo" | "data_evento" | "criado_em">[]): { aberto: boolean; desde: string | null } {
  let desde: string | null = null;
  for (const e of ordenarEventosMot(eventosValidos)) {
    if (e.tipo === "afastamento_inicio") desde = e.data_evento;
    else if (e.tipo === "afastamento_fim") desde = null;
  }
  return { aberto: desde !== null, desde };
}

// Resumo de UM funcionário. Devolve undefined quando não há nada a considerar — assim o chamador cai no
// mesmo caminho de código de antes dos eventos existirem (funcionário sem evento = comportamento idêntico).
//
// Rescisão: o loader só recebe funcionários ATIVOS, e hoje uma rescisão com data futura mantém o funcionário
// 'ativo' até a data (rescisaoProgramada.ts). Logo, ativo com rescisão = rescisão programada. Sem filtro de
// data de propósito: se a data já chegou mas o cron das 6h ainda não rodou, o aviso também fica calado.
export function resumirFuncionarioMot(
  eventos: EventoMotLinha[],
  rescisoes: RescisaoMotLinha[],
  hojeISO: string = hojeBrasiliaISO()
): ResumoContratoMot | undefined {
  const validos = eventosMotValidos(eventos);
  const { aberto, desde } = afastamentoEmAberto(validos);
  const prorrogado = validos.some((e) => e.tipo === "prorrogacao");
  const datasRescisao = rescisoes.map((r) => r.data_desligamento).sort();
  const rescisaoProgramadaEm = datasRescisao.length ? datasRescisao[datasRescisao.length - 1] : null;

  if (!aberto && !prorrogado && !rescisaoProgramadaEm) return undefined;
  return {
    afastadoEmAberto: aberto,
    afastadoDesde: desde,
    diasAfastado: aberto && desde ? diasEntre(desde, hojeISO) : null,
    prorrogado,
    rescisaoProgramadaEm,
  };
}

// 2 consultas em paralelo (eventos + rescisões), sem N+1: uma por tabela, para todos os ids de uma vez.
// Falha de qualquer uma só é logada e tratada como "sem evento" — o aviso volta ao comportamento de antes
// (nunca derruba o popup nem o relatório; no pior caso mostra um aviso a mais, nunca um a menos).
export async function carregarResumosMot(
  svc: SupabaseClient,
  funcionarioIds: string[],
  hojeISO: string = hojeBrasiliaISO()
): Promise<Map<string, ResumoContratoMot>> {
  const resumos = new Map<string, ResumoContratoMot>();
  if (funcionarioIds.length === 0) return resumos;

  const [eventosRes, rescisoesRes] = await Promise.all([
    svc
      .from("funcionario_mot_eventos")
      .select("id, funcionario_id, tipo, data_evento, corrige_evento_id, criado_em")
      .in("funcionario_id", funcionarioIds),
    svc.from("rescisoes").select("funcionario_id, data_desligamento").in("funcionario_id", funcionarioIds),
  ]);
  if (eventosRes.error) console.error("[contratoMotEventos] Erro ao buscar eventos MOT:", eventosRes.error.message);
  if (rescisoesRes.error) console.error("[contratoMotEventos] Erro ao buscar rescisões programadas:", rescisoesRes.error.message);

  const eventosPorFuncionario = new Map<string, EventoMotLinha[]>();
  for (const e of (eventosRes.error ? [] : eventosRes.data ?? []) as EventoMotLinha[]) {
    const lista = eventosPorFuncionario.get(e.funcionario_id) ?? [];
    lista.push(e);
    eventosPorFuncionario.set(e.funcionario_id, lista);
  }
  const rescisoesPorFuncionario = new Map<string, RescisaoMotLinha[]>();
  for (const r of (rescisoesRes.error ? [] : rescisoesRes.data ?? []) as RescisaoMotLinha[]) {
    const lista = rescisoesPorFuncionario.get(r.funcionario_id) ?? [];
    lista.push(r);
    rescisoesPorFuncionario.set(r.funcionario_id, lista);
  }

  for (const id of funcionarioIds) {
    const resumo = resumirFuncionarioMot(eventosPorFuncionario.get(id) ?? [], rescisoesPorFuncionario.get(id) ?? [], hojeISO);
    if (resumo) resumos.set(id, resumo);
  }
  return resumos;
}

export interface SeloMot {
  texto: string;
  bg: string;
  text: string;
}

// Selos do relatório do PAINEL (o portal nunca recebe isto — ver aplicarSilencioPortal).
export function selosRelatorioMot(resumo: ResumoContratoMot | undefined): SeloMot[] {
  if (!resumo) return [];
  const selos: SeloMot[] = [];
  if (resumo.afastadoEmAberto && resumo.diasAfastado !== null) {
    selos.push({
      texto: `Afastado (${resumo.diasAfastado} ${resumo.diasAfastado === 1 ? "dia" : "dias"})`,
      bg: "#E0E7FF",
      text: "#3730A3",
    });
  }
  if (resumo.prorrogado) selos.push({ texto: "Prorrogado", bg: "#DBEAFE", text: "#1E40AF" });
  if (resumo.rescisaoProgramadaEm) {
    selos.push({
      texto: `Rescisão programada ${formatarDataBR(resumo.rescisaoProgramadaEm).slice(0, 5)}`,
      bg: "#FCE7F3",
      text: "#9D174D",
    });
  }
  return selos;
}

export interface AcoesMotDisponiveis {
  prorrogar: boolean;
  registrarAfastamento: boolean;
  encerrarAfastamento: boolean;
  encerrarContrato: boolean;
  cancelarRescisaoProgramada: boolean;
}

// Quais botões o painel "Contrato MOT" mostra — função pura pra ser testada sem DOM (o projeto não tem testes de
// componente). O servidor confere tudo de novo; isto só evita oferecer o que ele vai recusar:
//  - Prorrogar: some com rescisão programada e some se já há prorrogação válida (lançou errado → "Corrigir" no
//    histórico anula e o botão volta);
//  - Registrar afastamento: só sem afastamento aberto e sem rescisão programada; "Encerrar afastamento" é o
//    contrário (continua valendo mesmo com rescisão programada);
//  - Encerrar contrato: só sem rescisão já lançada;
//  - Cancelar rescisão programada: só PAPEIS_FULL_ACCESS e só enquanto a data de desligamento ainda é futura
//    (data que chegou espera o cron das 6h; o DELETE também recusa).
export function acoesDisponiveisMot(p: {
  ativo: boolean;
  resumo: Pick<ResumoContratoMot, "afastadoEmAberto" | "prorrogado"> | null | undefined;
  rescisaoProgramada: { data_desligamento: string } | null | undefined;
  hoje: string;
  podeCorrigir: boolean;
}): AcoesMotDisponiveis {
  const afastado = !!p.resumo?.afastadoEmAberto;
  const prorrogado = !!p.resumo?.prorrogado;
  const rescisao = !!p.rescisaoProgramada;
  return {
    prorrogar: p.ativo && !rescisao && !prorrogado,
    registrarAfastamento: p.ativo && !rescisao && !afastado,
    encerrarAfastamento: p.ativo && afastado,
    encerrarContrato: p.ativo && !rescisao,
    cancelarRescisaoProgramada: p.ativo && rescisao && p.podeCorrigir && !!p.rescisaoProgramada && p.rescisaoProgramada.data_desligamento > p.hoje,
  };
}
