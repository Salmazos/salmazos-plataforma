import type { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { TIPO_AVISO_COMISSAO, avisarBeneficiario, textos } from "@/lib/comissaoAvisos";
import { detalhar, reconciliar, type Ator, type Falha, type Lancamento, type LancamentoDetalhado, type Resultado } from "@/lib/comissao";
import {
  arredondar2,
  competenciaAtual,
  competenciaDoMes,
  mesAtrasadoDe,
  montarCsvFolha,
  rotuloCompetencia,
  selecionarParaFechamento,
  type LinhaFolha,
} from "@/lib/comissaoRegras";

// Fechamento mensal e pagamento das comissões (Fase 2). A função SQL comissao_fechar_mes é a AUTORIDADE (transação única, idempotente,
// com trava); a prévia daqui usa a mesma regra (selecionarParaFechamento) só para mostrar à diretoria o que entra e o que bloqueia.

type Service = ReturnType<typeof createServiceClient>;

const falha = (status: number, error: string, codigo?: string, extra?: Record<string, unknown>): Falha & Record<string, unknown> => ({ ok: false, status, error, ...(codigo ? { codigo } : {}), ...(extra ?? {}) });

export interface LinhaFechamento {
  lancamento_id: string;
  cobranca_id: string;
  tipo: "comissao" | "ajuste" | "estorno";
  cliente: string | null;
  vaga: string | null;
  competencia: string;
  atrasada_de: string | null;
  fee: number | null;
  comissao: number;
  motivo: string | null;
}

export interface GrupoBeneficiario {
  beneficiario_id: string;
  nome: string | null;
  // Soma ASSINADA (estorno negativo). Zero ou negativo é mostrado e não bloqueia.
  total: number;
  qtd_cobrancas: number;
  linhas: LinhaFechamento[];
  ajustes: LinhaFechamento[];
}

export interface Bloqueio {
  id: string;
  status: string;
  competencia: string;
  beneficiario: string | null;
  cliente: string | null;
  vaga: string | null;
  // Tela onde se resolve (a lista do mês de competência do lançamento).
  link: string;
}

export interface FechamentoResumo {
  id: string;
  competencia: string;
  unidade_id: string;
  unidade: string | null;
  total: number;
  qtd_lancamentos: number;
  fechado_por: string | null;
  fechado_em: string;
  pago_em: string | null;
  pago_registrado_em: string | null;
}

export interface PreviaUnidade {
  unidade_id: string;
  unidade: string | null;
  competencia: string;
  fechamento: FechamentoResumo | null;
  mes_futuro: boolean;
  fechamento_posterior: boolean;
  bloqueios: Bloqueio[];
  qtd: number;
  total: number;
  grupos: GrupoBeneficiario[];
}

function linhaDe(l: LancamentoDetalhado, competenciaFechamento: string): LinhaFechamento {
  return {
    lancamento_id: l.id,
    cobranca_id: l.cobranca_id,
    tipo: l.tipo,
    cliente: l.cobranca?.cliente ?? null,
    vaga: l.cobranca?.vaga ?? null,
    competencia: l.competencia,
    atrasada_de: mesAtrasadoDe(l.competencia, competenciaFechamento),
    fee: l.tipo === "comissao" ? l.base_valor ?? l.cobranca?.fee_valor ?? null : null,
    comissao: Number(l.valor_comissao),
    motivo: l.motivo,
  };
}

export function montarGrupos(lancs: LancamentoDetalhado[], competenciaFechamento: string): GrupoBeneficiario[] {
  const porBen = new Map<string, LancamentoDetalhado[]>();
  for (const l of lancs) porBen.set(l.beneficiario_id, [...(porBen.get(l.beneficiario_id) ?? []), l]);
  return [...porBen.entries()]
    .map(([id, ls]) => {
      const linhas = ls.filter((l) => l.tipo === "comissao").map((l) => linhaDe(l, competenciaFechamento)).sort((a, b) => a.competencia.localeCompare(b.competencia));
      const ajustes = ls.filter((l) => l.tipo !== "comissao").map((l) => linhaDe(l, competenciaFechamento));
      return {
        beneficiario_id: id,
        nome: ls[0].beneficiario_nome,
        total: arredondar2([...linhas, ...ajustes].reduce((s, l) => s + l.comissao, 0)),
        qtd_cobrancas: linhas.length,
        linhas,
        ajustes,
      };
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
}

// As MESMAS linhas da tela, na ordem da tela (por beneficiário: comissões e depois ajustes/estornos), para o CSV da folha.
export function linhasFolha(grupos: GrupoBeneficiario[]): LinhaFolha[] {
  const nome = (t: LinhaFechamento["tipo"]) => (t === "estorno" ? "Estorno" : t === "ajuste" ? "Ajuste" : "Comissão");
  return grupos.flatMap((g) =>
    [...g.linhas, ...g.ajustes].map((l) => ({
      beneficiario: g.nome ?? "—",
      tipo: nome(l.tipo),
      cliente: l.cliente ?? "—",
      vaga: l.vaga ?? "—",
      competencia: l.competencia,
      atrasadaDe: l.atrasada_de,
      fee: l.fee,
      comissao: l.comissao,
      motivo: l.motivo,
    }))
  );
}

export const csvDoFechamento = (grupos: GrupoBeneficiario[]): string => montarCsvFolha(linhasFolha(grupos));

async function nomesUnidades(svc: Service): Promise<Map<string, string>> {
  const { data } = await svc.from("unidades").select("id, slug");
  return new Map((data ?? []).map((u) => [u.id as string, u.slug as string]));
}

function resumo(f: Record<string, unknown>, unidades: Map<string, string>): FechamentoResumo {
  return {
    id: f.id as string,
    competencia: f.competencia as string,
    unidade_id: f.unidade_id as string,
    unidade: unidades.get(f.unidade_id as string) ?? null,
    total: Number(f.total),
    qtd_lancamentos: Number(f.qtd_lancamentos),
    fechado_por: (f.fechado_por as string | null) ?? null,
    fechado_em: f.fechado_em as string,
    pago_em: (f.pago_em as string | null) ?? null,
    pago_registrado_em: (f.pago_registrado_em as string | null) ?? null,
  };
}

// ── Prévia ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function previaFechamento(svc: Service, o: { competencia: string; unidadeId: string | null; agora?: Date }): Promise<PreviaUnidade[]> {
  const unidades = await nomesUnidades(svc);
  let q = svc.from("comissao_lancamentos").select("*").lte("competencia", o.competencia);
  if (o.unidadeId) q = q.eq("unidade_id", o.unidadeId);
  const { data, error } = await q;
  if (error) throw new Error(`Não foi possível ler as comissões: ${error.message}`);
  // Estado real antes de decidir (rede de segurança, igual às telas): prevista que já deveria estar confirmada, etc.
  const todos = await reconciliar(svc, (data ?? []) as Lancamento[], "previa-fechamento");
  const abertos = todos.filter((l) => !l.fechamento_id);

  let qf = svc.from("comissao_fechamentos").select("*");
  if (o.unidadeId) qf = qf.eq("unidade_id", o.unidadeId);
  const { data: fechs } = await qf;

  const idsUnidades = new Set<string>([...abertos.map((l) => l.unidade_id), ...(fechs ?? []).filter((f) => f.competencia === o.competencia).map((f) => f.unidade_id as string)]);
  const origensFechadas = new Set(todos.filter((l) => l.fechamento_id).map((l) => l.id));
  const saida: PreviaUnidade[] = [];

  for (const unidade of idsUnidades) {
    const doUnidade = abertos.filter((l) => l.unidade_id === unidade);
    const sel = selecionarParaFechamento(doUnidade, o.competencia, origensFechadas);
    const existente = (fechs ?? []).find((f) => f.unidade_id === unidade && f.competencia === o.competencia);
    const entram = new Set([...sel.comissoes, ...sel.ajustes]);
    const detalhados = await detalhar(svc, doUnidade.filter((l) => entram.has(l.id)));
    const bloq = await detalhar(svc, doUnidade.filter((l) => sel.bloqueios.includes(l.id)));
    saida.push({
      unidade_id: unidade,
      unidade: unidades.get(unidade) ?? null,
      competencia: o.competencia,
      fechamento: existente ? resumo(existente, unidades) : null,
      mes_futuro: o.competencia > competenciaAtual(o.agora),
      fechamento_posterior: (fechs ?? []).some((f) => f.unidade_id === unidade && f.competencia > o.competencia),
      bloqueios: bloq.map((l) => ({
        id: l.id,
        status: l.status,
        competencia: l.competencia,
        beneficiario: l.beneficiario_nome,
        cliente: l.cobranca?.cliente ?? null,
        vaga: l.cobranca?.vaga ?? null,
        link: `/painel/comissoes?mes=${l.competencia.slice(0, 7)}`,
      })),
      qtd: entram.size,
      total: sel.total,
      grupos: montarGrupos(detalhados, o.competencia),
    });
  }
  return saida;
}

// ── Fechar ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function fecharMes(
  svc: Service,
  o: { competencia: string; unidadeId: string; ator: Ator; esperadoQtd?: number | null; esperadoTotal?: number | null }
): Promise<Resultado<{ fechamento_id: string; total: number; qtd: number; ja_existia: boolean }>> {
  const { data, error } = await svc.rpc("comissao_fechar_mes", {
    p_competencia: o.competencia,
    p_unidade: o.unidadeId,
    p_usuario: o.ator.id,
    p_esperado_qtd: o.esperadoQtd ?? null,
    p_esperado_total: o.esperadoTotal ?? null,
  });
  if (error || !data) {
    console.error("[comissao] Erro ao fechar o mês:", error);
    return falha(500, "Não foi possível fechar o mês. Nada foi gravado.");
  }
  const r = data as { ok: boolean; codigo?: string; ja_existia?: boolean; fechamento_id?: string; total?: number; qtd?: number; bloqueios?: unknown[] };
  if (!r.ok) {
    switch (r.codigo) {
      case "bloqueado":
        return falha(409, "Há lançamentos retroativos pendentes ou contestados até este mês. Resolva-os antes de fechar.", "bloqueado", { bloqueios: r.bloqueios });
      case "nada_para_fechar":
        return falha(422, "Não há comissão confirmada nem ajuste para fechar neste mês.", "nada_para_fechar");
      case "unidade_invalida":
        return falha(404, "Unidade não encontrada.", "unidade_invalida");
      case "mes_futuro":
        return falha(422, "Não dá para fechar um mês que ainda não começou.", "mes_futuro");
      case "fechamento_posterior":
        return falha(409, "Já existe fechamento de um mês posterior; este mês não pode mais ser fechado.", "fechamento_posterior");
      case "mudou_desde_a_previa":
        return falha(409, "O que entra no fechamento mudou desde a prévia. Recarregue e confira antes de fechar.", "mudou_desde_a_previa", { qtd: r.qtd, total: r.total });
      default:
        return falha(500, "Resposta inesperada ao fechar o mês.");
    }
  }
  const fechamentoId = r.fechamento_id as string;
  const resultado = { ok: true as const, fechamento_id: fechamentoId, total: Number(r.total), qtd: Number(r.qtd), ja_existia: !!r.ja_existia };
  // Fechamento que já existia (clicar duas vezes): devolve o mesmo e NÃO repete auditoria nem avisos.
  if (resultado.ja_existia) return resultado;

  registrarAuditoria({
    usuario_id: o.ator.id,
    usuario_nome: o.ator.nome,
    acao: "comissao_fechamento_concluido",
    entidade: "comissao_fechamentos",
    entidade_id: fechamentoId,
    detalhes: { competencia: o.competencia, unidade_id: o.unidadeId, total: resultado.total, qtd: resultado.qtd },
  });
  await avisarFechamento(svc, fechamentoId, o.competencia, o.ator);
  return resultado;
}

async function totaisPorBeneficiario(svc: Service, fechamentoId: string): Promise<{ beneficiarioId: string; total: number; qtd: number }[]> {
  const { data } = await svc.from("comissao_lancamentos").select("beneficiario_id, valor_comissao, tipo").eq("fechamento_id", fechamentoId);
  const mapa = new Map<string, { total: number; qtd: number }>();
  for (const l of data ?? []) {
    const atual = mapa.get(l.beneficiario_id) ?? { total: 0, qtd: 0 };
    mapa.set(l.beneficiario_id, { total: atual.total + Number(l.valor_comissao), qtd: atual.qtd + 1 });
  }
  return [...mapa.entries()].map(([beneficiarioId, v]) => ({ beneficiarioId, total: arredondar2(v.total), qtd: v.qtd }));
}

// Sino só para os beneficiários que têm lançamento NESTE fechamento (cada um vê o próprio total).
async function avisarFechamento(svc: Service, fechamentoId: string, competencia: string, ator: Ator): Promise<void> {
  for (const b of await totaisPorBeneficiario(svc, fechamentoId)) {
    const t = textos.fechamento({ mes: rotuloCompetencia(competencia), total: b.total, qtd: b.qtd });
    await avisarBeneficiario(svc, { beneficiarioId: b.beneficiarioId, tipo: TIPO_AVISO_COMISSAO.fechamento, ...t, referencia: { fechamento_id: fechamentoId }, disparadoPor: ator });
  }
}

// ── Listagem e detalhe ───────────────────────────────────────────────────────────────────────────────────────────────

export async function listarFechamentos(svc: Service, o: { unidadeId: string | null }): Promise<FechamentoResumo[]> {
  let q = svc.from("comissao_fechamentos").select("*").order("competencia", { ascending: false });
  if (o.unidadeId) q = q.eq("unidade_id", o.unidadeId);
  const { data, error } = await q;
  if (error) throw new Error(`Não foi possível ler os fechamentos: ${error.message}`);
  const unidades = await nomesUnidades(svc);
  return (data ?? []).map((f) => resumo(f, unidades));
}

export async function detalharFechamento(svc: Service, o: { id: string; unidadeId: string | null }): Promise<{ fechamento: FechamentoResumo; grupos: GrupoBeneficiario[] } | null> {
  const { data: f } = await svc.from("comissao_fechamentos").select("*").eq("id", o.id).maybeSingle();
  // Fechamento de outra unidade = inexistente (não confirma que o id existe).
  if (!f || (o.unidadeId && f.unidade_id !== o.unidadeId)) return null;
  const { data: lancs } = await svc.from("comissao_lancamentos").select("*").eq("fechamento_id", o.id);
  const detalhados = await detalhar(svc, (lancs ?? []) as Lancamento[]);
  return { fechamento: resumo(f, await nomesUnidades(svc)), grupos: montarGrupos(detalhados, f.competencia as string) };
}

// ── Pagamento ────────────────────────────────────────────────────────────────────────────────────────────────────────

// Pagamento por FECHAMENTO (um registro só, com data informada, quem e quando). Não se desfaz nem se altera: erro de pagamento se
// corrige por ajuste no fechamento seguinte. A data não pode ser futura (Brasília).
export async function marcarPago(
  svc: Service,
  o: { fechamentoId: string; pagoEm: string; ator: Ator; agora?: Date }
): Promise<Resultado<{ fechamento: FechamentoResumo }>> {
  const dataPagamento = competenciaDoMes(o.pagoEm.slice(0, 7)) && /^\d{4}-\d{2}-\d{2}$/.test(o.pagoEm) ? o.pagoEm : null;
  if (!dataPagamento || Number.isNaN(Date.parse(`${dataPagamento}T00:00:00Z`))) return falha(400, "Informe a data do pagamento.");
  const hoje = (o.agora ?? new Date()).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (dataPagamento > hoje) return falha(422, "A data do pagamento não pode ser futura.", "data_futura");

  const { data: f } = await svc.from("comissao_fechamentos").select("*").eq("id", o.fechamentoId).maybeSingle();
  if (!f) return falha(404, "Fechamento não encontrado.");
  if (f.pago_em) return falha(409, "Este fechamento já foi marcado como pago. O pagamento não pode ser alterado nem desfeito.", "ja_pago");

  const { data, error } = await svc
    .from("comissao_fechamentos")
    .update({ pago_em: dataPagamento, pago_registrado_por: o.ator.id, pago_registrado_em: (o.agora ?? new Date()).toISOString() })
    .eq("id", o.fechamentoId)
    .is("pago_em", null)
    .select("*")
    .maybeSingle();
  if (error || !data) return falha(409, "O fechamento mudou enquanto o pagamento era registrado. Recarregue e confira.");

  registrarAuditoria({
    usuario_id: o.ator.id,
    usuario_nome: o.ator.nome,
    acao: "comissao_fechamento_pago",
    entidade: "comissao_fechamentos",
    entidade_id: data.id,
    detalhes: { competencia: data.competencia, total: data.total, pago_em: dataPagamento },
  });
  for (const b of await totaisPorBeneficiario(svc, data.id)) {
    const t = textos.pagamento({ mes: rotuloCompetencia(data.competencia), total: b.total, pagoEm: dataPagamento });
    await avisarBeneficiario(svc, { beneficiarioId: b.beneficiarioId, tipo: TIPO_AVISO_COMISSAO.pagamento, ...t, referencia: { fechamento_id: data.id }, disparadoPor: o.ator });
  }
  return { ok: true, fechamento: resumo(data, await nomesUnidades(svc)) };
}
