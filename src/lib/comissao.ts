import type { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { apelidoDoNomeCompleto } from "@/lib/responsaveis";
import { carregarNomesGeradoresCobrancaRS } from "@/lib/cobrancaRSAutor";
import { TIPO_AVISO_COMISSAO, avisarBeneficiario, textos } from "@/lib/comissaoAvisos";
import {
  MENSAGEM_RECUSA_MARCACAO,
  arredondar2,
  beneficiarioPodeDesmarcar,
  calcularComissao,
  competenciaAtual,
  competenciaDoInstante,
  competenciaPassou,
  rotuloCompetencia,
  ehTerminal,
  motivoDeNaoPoderMarcar,
  mesAtrasadoDe,
  mudancasPorCobranca,
  statusInicialDaMarcacao,
  statusPelaCobranca,
  totalizar,
  type StatusLancamento,
  type TotaisComissao,
} from "@/lib/comissaoRegras";

// Serviço da comissão de analistas (Fase 1). Toda leitura/escrita passa pelo service client (a tabela só tem política de
// service_role); quem pode ver/fazer o quê é decidido nas rotas (comissaoAuth.ts) e aqui só quando faz parte da regra.
// Ledger imutável: nada aqui apaga lançamento nem reescreve valor de ajuste/estorno — correções entram como lançamento novo.

type Service = ReturnType<typeof createServiceClient>;

export interface Beneficiario {
  id: string;
  analista_perfil_id: string;
  percentual: number;
  ativo: boolean;
  unidade_id: string;
  nome_completo: string | null;
}

export interface Lancamento {
  id: string;
  cobranca_id: string;
  beneficiario_id: string;
  tipo: "comissao" | "ajuste" | "estorno";
  status: StatusLancamento;
  competencia: string;
  base_valor: number | null;
  percentual_aplicado: number | null;
  valor_comissao: number;
  lancamento_origem_id: string | null;
  motivo: string | null;
  marcado_por: string | null;
  marcado_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
  contestado_por: string | null;
  contestado_em: string | null;
  contestacao_motivo: string | null;
  status_antes_contestacao: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  resolucao_nota: string | null;
  fechado_em: string | null;
  fechamento_id: string | null;
  unidade_id: string;
}

export type Falha = { ok: false; status: number; error: string; codigo?: string };
export type Ok<T> = { ok: true } & T;
export type Resultado<T> = Ok<T> | Falha;

export interface Ator {
  id: string;
  nome: string | null;
}

const falha = (status: number, error: string, codigo?: string): Falha => ({ ok: false, status, error, ...(codigo ? { codigo } : {}) });

const STATUS_ATIVOS: StatusLancamento[] = ["prevista", "confirmada", "retroativo_pendente", "contestada"];

function auditar(ator: Ator, acao: string, lancId: string | null, detalhes: Record<string, unknown>, unidadeId?: string | null) {
  void unidadeId; // audit_logs.unidade_id tem DEFAULT; o registro de comissão não força outra unidade
  registrarAuditoria({
    usuario_id: ator.id || null,
    usuario_nome: ator.nome,
    acao,
    entidade: "comissao_lancamentos",
    entidade_id: lancId,
    detalhes,
  });
}

// ── Beneficiário ─────────────────────────────────────────────────────────────────────────────────────────────────────

export async function beneficiarioDoUsuario(svc: Service, userId: string): Promise<Beneficiario | null> {
  const { data: perfil } = await svc.from("analistas_perfil").select("id, nome_completo").eq("user_id", userId).maybeSingle();
  if (!perfil) return null;
  const { data: ben } = await svc
    .from("comissao_beneficiarios")
    .select("id, analista_perfil_id, percentual, ativo, unidade_id")
    .eq("analista_perfil_id", perfil.id)
    .eq("ativo", true)
    .maybeSingle();
  if (!ben) return null;
  return { ...ben, percentual: Number(ben.percentual), nome_completo: perfil.nome_completo ?? null } as Beneficiario;
}

// ── Cobrança (leitura) ───────────────────────────────────────────────────────────────────────────────────────────────

interface CobrancaLida {
  id: string;
  vaga_id: string;
  tipo: string;
  status: string;
  fee_valor: number | null;
  enviado_em: string | null;
  validada_em: string | null;
  gerado_por_user_id: string | null;
  unidade_id: string;
  cliente_nome_snapshot: string | null;
  candidato_nome_snapshot: string | null;
}

const COLUNAS_COBRANCA =
  "id, vaga_id, tipo, status, fee_valor, enviado_em, validada_em, gerado_por_user_id, unidade_id, cliente_nome_snapshot, candidato_nome_snapshot";
// validada_em só existe depois da migração da Fase 1; antes dela o select cai nesta lista sem a coluna.
const COLUNAS_COBRANCA_SEM_VALIDADA = COLUNAS_COBRANCA.replace(" validada_em,", "");

async function lerCobrancas(svc: Service, ids: string[]): Promise<Map<string, CobrancaLida>> {
  const mapa = new Map<string, CobrancaLida>();
  if (ids.length === 0) return mapa;
  // Os selects são strings montadas em tempo de execução, então o supabase-js não infere o tipo da linha: cast explícito.
  const ler = async (colunas: string) => {
    const r = await svc.from("cobrancas_rs").select(colunas).in("id", ids);
    return { data: r.data as unknown as CobrancaLida[] | null, error: r.error };
  };
  let { data, error } = await ler(COLUNAS_COBRANCA);
  if (error) ({ data, error } = await ler(COLUNAS_COBRANCA_SEM_VALIDADA));
  if (error) throw new Error(`Não foi possível ler as cobranças: ${error.message}`);
  for (const c of data ?? []) mapa.set(c.id, { ...c, validada_em: c.validada_em ?? null });
  return mapa;
}

async function ehReposicaoPorGarantia(svc: Service, vagaId: string): Promise<boolean> {
  const { data } = await svc.from("vagas").select("reposicao_de_candidato_vaga_id").eq("id", vagaId).maybeSingle();
  return !!data?.reposicao_de_candidato_vaga_id;
}

// ── Marcar / desmarcar ───────────────────────────────────────────────────────────────────────────────────────────────

export async function marcarComissao(
  svc: Service,
  o: {
    cobrancaId: string;
    beneficiario: Beneficiario;
    ator: Ator;
    agora?: Date;
  }
): Promise<Resultado<{ lancamento: Lancamento }>> {
  const agora = o.agora ?? new Date();
  const cobrancas = await lerCobrancas(svc, [o.cobrancaId]);
  const cobranca = cobrancas.get(o.cobrancaId);
  if (!cobranca) return falha(404, "Cobrança não encontrada.");
  // Quem pode marcar é o beneficiário ativo (decidido pela rota); NÃO exige acesso à tela de Cobranças R&S: o caso comum é a comissão
  // ser de um analista e a cobrança ter sido gerada por outro.

  const reposicao = await ehReposicaoPorGarantia(svc, cobranca.vaga_id);
  const recusa = motivoDeNaoPoderMarcar({ ...cobranca, reposicao_garantia: reposicao });
  if (recusa) return falha(422, MENSAGEM_RECUSA_MARCACAO[recusa], recusa);

  const { data: ativa } = await svc
    .from("comissao_lancamentos")
    .select("id, beneficiario_id")
    .eq("cobranca_id", cobranca.id)
    .eq("tipo", "comissao")
    .in("status", STATUS_ATIVOS)
    .limit(1)
    .maybeSingle();
  if (ativa) {
    return falha(
      409,
      ativa.beneficiario_id === o.beneficiario.id ? "Você já marcou a comissão desta cobrança." : "Esta cobrança já tem a comissão marcada por outro beneficiário. Fale com a diretoria.",
      "marcacao_dupla"
    );
  }

  const fee = arredondar2(Number(cobranca.fee_valor));
  const { competencia, status } = statusInicialDaMarcacao({ status: cobranca.status, tipo: cobranca.tipo, enviado_em: cobranca.enviado_em as string }, agora);
  const { data: criado, error } = await svc
    .from("comissao_lancamentos")
    .insert({
      cobranca_id: cobranca.id,
      beneficiario_id: o.beneficiario.id,
      tipo: "comissao",
      status,
      competencia,
      base_valor: fee,
      percentual_aplicado: o.beneficiario.percentual,
      valor_comissao: calcularComissao(fee, o.beneficiario.percentual),
      marcado_por: o.ator.id,
      unidade_id: cobranca.unidade_id,
    })
    .select("*")
    .single();
  if (error || !criado) {
    if ((error as { code?: string } | null)?.code === "23505") return falha(409, "Esta cobrança já tem comissão marcada.", "marcacao_dupla");
    console.error("[comissao] Erro ao marcar:", error);
    return falha(500, "Não foi possível marcar a comissão.");
  }

  auditar(o.ator, "comissao_marcada", criado.id, {
    cobranca_id: cobranca.id,
    beneficiario_id: o.beneficiario.id,
    competencia,
    status,
    base_valor: fee,
    percentual_aplicado: o.beneficiario.percentual,
    valor_comissao: criado.valor_comissao,
    retroativo: status === "retroativo_pendente",
  }, cobranca.unidade_id);
  return { ok: true, lancamento: criado as Lancamento };
}

export async function desmarcarComissao(
  svc: Service,
  o: { lancamentoId: string; beneficiario: Beneficiario; ator: Ator }
): Promise<Resultado<{ lancamento: Lancamento }>> {
  const { data: lanc } = await svc.from("comissao_lancamentos").select("*").eq("id", o.lancamentoId).maybeSingle();
  // Lançamento de outro beneficiário é tratado como inexistente (não revela que existe).
  if (!lanc || lanc.beneficiario_id !== o.beneficiario.id) return falha(404, "Lançamento não encontrado.");
  const cobrancas = await lerCobrancas(svc, [lanc.cobranca_id]);
  const cobranca = cobrancas.get(lanc.cobranca_id);
  if (!cobranca) return falha(404, "Cobrança não encontrada.");
  if (!beneficiarioPodeDesmarcar(lanc, cobranca)) {
    return falha(409, "Depois que a diretoria valida a cobrança, só a diretoria desfaz a comissão (por estorno).", "desmarcar_bloqueado");
  }
  const agora = new Date().toISOString();
  const { data: atualizado, error } = await svc
    .from("comissao_lancamentos")
    .update({ status: "cancelada", resolvido_por: o.ator.id, resolvido_em: agora, resolucao_nota: "Desmarcada pelo beneficiário" })
    .eq("id", lanc.id)
    .eq("status", lanc.status)
    .select("*")
    .maybeSingle();
  if (error || !atualizado) return falha(409, "O lançamento mudou enquanto era desmarcado. Recarregue e tente de novo.");
  auditar(o.ator, "comissao_desmarcada", lanc.id, { cobranca_id: lanc.cobranca_id, status_anterior: lanc.status, valor_comissao: lanc.valor_comissao }, lanc.unidade_id);
  return { ok: true, lancamento: atualizado as Lancamento };
}

// ── Sincronização com a cobrança ─────────────────────────────────────────────────────────────────────────────────────

async function aplicarSincronizacao(svc: Service, lancs: Lancamento[], cobranca: CobrancaLida, origem: string): Promise<number> {
  let n = 0;
  for (const l of lancs) {
    const mud = mudancasPorCobranca(l, cobranca);
    if (Object.keys(mud).length === 0) continue;
    const { data, error } = await svc
      .from("comissao_lancamentos")
      .update(mud)
      .eq("id", l.id)
      .eq("status", l.status)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[comissao] Falha ao sincronizar lançamento", l.id, error.message);
      continue;
    }
    if (!data) continue; // mudou no meio (outra sincronização/decisão): a próxima leitura reconcilia
    n++;
    auditar({ id: "", nome: "sistema" }, mud.valor_comissao !== undefined ? "comissao_valor_sincronizado" : "comissao_status_sincronizado", l.id, {
      origem,
      cobranca_id: cobranca.id,
      antes: { status: l.status, base_valor: l.base_valor, valor_comissao: l.valor_comissao },
      depois: mud,
    }, l.unidade_id);
  }
  return n;
}

// Chamada pelas rotas da cobrança depois que o status/valor mudam (vencimento, marcar-paga, cancelar, corrigir-taxa). NUNCA lança:
// a cobrança já foi gravada e a comissão se reconcilia sozinha na próxima leitura das telas.
export async function sincronizarComissoesDaCobranca(svc: Service, cobrancaId: string, origem: string): Promise<void> {
  try {
    const { data: lancs, error } = await svc
      .from("comissao_lancamentos")
      .select("*")
      .eq("cobranca_id", cobrancaId)
      .eq("tipo", "comissao")
      .in("status", STATUS_ATIVOS);
    if (error || !lancs || lancs.length === 0) return;
    const cobranca = (await lerCobrancas(svc, [cobrancaId])).get(cobrancaId);
    if (!cobranca) return;
    await aplicarSincronizacao(svc, lancs as Lancamento[], cobranca, origem);
  } catch (e) {
    console.error("[comissao] Erro ao sincronizar com a cobrança", cobrancaId, e);
  }
}

// Reconcilia, antes de listar, os lançamentos ativos do conjunto (rede de segurança caso uma rota da cobrança tenha falhado
// em sincronizar). Devolve os lançamentos já atualizados.
export async function reconciliar(svc: Service, lancs: Lancamento[], origem: string): Promise<Lancamento[]> {
  const ativos = lancs.filter((l) => l.tipo === "comissao" && !ehTerminal(l.status));
  if (ativos.length === 0) return lancs;
  const cobrancas = await lerCobrancas(svc, [...new Set(ativos.map((l) => l.cobranca_id))]);
  const mudou = new Set<string>();
  for (const l of ativos) {
    const c = cobrancas.get(l.cobranca_id);
    if (c && (await aplicarSincronizacao(svc, [l], c, origem)) > 0) mudou.add(l.id);
  }
  if (mudou.size === 0) return lancs;
  const { data } = await svc.from("comissao_lancamentos").select("*").in("id", [...mudou]);
  const novos = new Map((data ?? []).map((l) => [l.id, l as Lancamento]));
  return lancs.map((l) => novos.get(l.id) ?? l);
}

// ── Listagens ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LancamentoDetalhado extends Lancamento {
  cobranca: {
    id: string;
    cliente: string | null;
    vaga: string | null;
    candidato: string | null;
    tipo: string;
    status: string;
    fee_valor: number | null;
    enviado_em: string | null;
    validada_em: string | null;
  } | null;
  beneficiario_nome: string | null;
  pode_desmarcar: boolean;
  // Só em ajuste/estorno: status atual do lançamento de comissão original (decide em qual cartão de total o ajuste entra).
  origem_status: StatusLancamento | null;
  origem_fechado: boolean;
  // Fechamento em que o lançamento entrou (Fase 2): competência do fechamento e se a folha já foi paga. null = ainda não fechado.
  fechamento: { id: string; competencia: string; pago_em: string | null } | null;
  fechamento_pago: boolean;
  // "Atrasada de <mês>": entrou num fechamento de mês posterior ao da competência dela (competência original preservada).
  atrasada_de: string | null;
}

export async function detalhar(svc: Service, lancs: Lancamento[]): Promise<LancamentoDetalhado[]> {
  if (lancs.length === 0) return [];
  const cobrancas = await lerCobrancas(svc, [...new Set(lancs.map((l) => l.cobranca_id))]);
  const vagaIds = [...new Set([...cobrancas.values()].map((c) => c.vaga_id))];
  const { data: vagas } = vagaIds.length ? await svc.from("vagas").select("id, titulo").in("id", vagaIds) : { data: [] };
  const titulo = new Map((vagas ?? []).map((v) => [v.id, v.titulo as string]));
  const benIds = [...new Set(lancs.map((l) => l.beneficiario_id))];
  const { data: bens } = await svc.from("comissao_beneficiarios").select("id, analista_perfil_id").in("id", benIds);
  const perfilIds = [...new Set((bens ?? []).map((b) => b.analista_perfil_id))];
  const { data: perfis } = perfilIds.length ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", perfilIds) : { data: [] };
  const nomePerfil = new Map((perfis ?? []).map((p) => [p.id, p.nome_completo as string]));
  const nomeBen = new Map((bens ?? []).map((b) => [b.id, nomePerfil.get(b.analista_perfil_id) ?? null]));
  const origemIds = [...new Set(lancs.map((l) => l.lancamento_origem_id).filter((x): x is string => !!x))];
  const { data: origens } = origemIds.length ? await svc.from("comissao_lancamentos").select("id, status, fechado_em").in("id", origemIds) : { data: [] };
  const statusOrigem = new Map((origens ?? []).map((o) => [o.id, o.status as StatusLancamento]));
  const origemFechada = new Map((origens ?? []).map((o) => [o.id, !!o.fechado_em]));
  const fechIds = [...new Set(lancs.map((l) => l.fechamento_id).filter((x): x is string => !!x))];
  const { data: fechs } = fechIds.length ? await svc.from("comissao_fechamentos").select("id, competencia, pago_em").in("id", fechIds) : { data: [] };
  const fechPorId = new Map((fechs ?? []).map((f) => [f.id, { id: f.id as string, competencia: f.competencia as string, pago_em: (f.pago_em as string | null) ?? null }]));

  return lancs.map((l) => {
    const c = cobrancas.get(l.cobranca_id) ?? null;
    return {
      ...l,
      valor_comissao: Number(l.valor_comissao),
      base_valor: l.base_valor == null ? null : Number(l.base_valor),
      cobranca: c
        ? {
            id: c.id,
            cliente: c.cliente_nome_snapshot,
            vaga: titulo.get(c.vaga_id) ?? null,
            candidato: c.candidato_nome_snapshot,
            tipo: c.tipo,
            status: c.status,
            fee_valor: c.fee_valor == null ? null : Number(c.fee_valor),
            enviado_em: c.enviado_em,
            validada_em: c.validada_em,
          }
        : null,
      beneficiario_nome: nomeBen.get(l.beneficiario_id) ?? null,
      pode_desmarcar: c ? beneficiarioPodeDesmarcar(l, c) : false,
      origem_status: l.lancamento_origem_id ? statusOrigem.get(l.lancamento_origem_id) ?? null : null,
      origem_fechado: l.lancamento_origem_id ? origemFechada.get(l.lancamento_origem_id) ?? false : false,
      fechamento: l.fechamento_id ? fechPorId.get(l.fechamento_id) ?? null : null,
      fechamento_pago: l.fechamento_id ? !!fechPorId.get(l.fechamento_id)?.pago_em : false,
      atrasada_de: l.fechamento_id && fechPorId.get(l.fechamento_id) ? mesAtrasadoDe(l.competencia, fechPorId.get(l.fechamento_id)!.competencia) : null,
    };
  });
}

// Lançamentos de uma competência (1º dia do mês) — de um beneficiário ou de todos (diretoria; `unidadeIds` = null não filtra).
export async function listarLancamentos(
  svc: Service,
  o: { competencia: string; beneficiarioId?: string; unidadeId?: string | null }
): Promise<{ lancamentos: LancamentoDetalhado[]; totais: TotaisComissao; totaisPorBeneficiario: { beneficiario_id: string; nome: string | null; totais: TotaisComissao }[] }> {
  let q = svc.from("comissao_lancamentos").select("*").eq("competencia", o.competencia).order("marcado_em", { ascending: true });
  if (o.beneficiarioId) q = q.eq("beneficiario_id", o.beneficiarioId);
  if (o.unidadeId) q = q.eq("unidade_id", o.unidadeId);
  const { data, error } = await q;
  if (error) throw new Error(`Não foi possível ler as comissões: ${error.message}`);
  const reconciliados = await reconciliar(svc, (data ?? []) as Lancamento[], "leitura");
  const lancamentos = await detalhar(svc, reconciliados);
  const porBen = new Map<string, LancamentoDetalhado[]>();
  for (const l of lancamentos) porBen.set(l.beneficiario_id, [...(porBen.get(l.beneficiario_id) ?? []), l]);
  return {
    lancamentos,
    totais: totalizar(lancamentos),
    totaisPorBeneficiario: [...porBen.entries()].map(([id, ls]) => ({ beneficiario_id: id, nome: ls[0].beneficiario_nome, totais: totalizar(ls) })),
  };
}

// Pedidos retroativos esperando a diretoria, de qualquer mês de competência.
export async function listarRetroativosPendentes(svc: Service, o: { unidadeId?: string | null } = {}): Promise<LancamentoDetalhado[]> {
  let q = svc.from("comissao_lancamentos").select("*").eq("status", "retroativo_pendente").order("marcado_em", { ascending: true });
  if (o.unidadeId) q = q.eq("unidade_id", o.unidadeId);
  const { data, error } = await q;
  if (error) throw new Error(`Não foi possível ler os pedidos retroativos: ${error.message}`);
  return detalhar(svc, await reconciliar(svc, (data ?? []) as Lancamento[], "leitura"));
}

export interface CobrancaParaMarcar {
  id: string;
  cliente: string | null;
  vaga: string | null;
  cargo: string | null;
  gerada_por: string | null;
  enviado_em: string;
  status: string;
  fee_valor: number;
  competencia: string;
  // Mês anterior: a marcação vai para aprovação da diretoria (retroativo_pendente).
  retroativo: boolean;
  comissao_prevista: number;
  // "voce" = já é sua; "outro" = já marcada por outra pessoa (sem revelar quem nem quanto); null = livre para marcar.
  marcada: "voce" | "outro" | null;
}

// "Cobranças para marcar": TODAS as cobranças R&S de CONTRATAÇÃO já enviadas para validação (enviadas, validadas ou pagas; nunca
// canceladas nem em revisão), do mês corrente e dos anteriores, sem exigir acesso à tela de Cobranças R&S — a comissão é de quem o
// beneficiário diz ser, e a cobrança pode ter sido gerada por outro analista. Só sai o necessário para reconhecer a cobrança e
// calcular a comissão: cliente, vaga/cargo, quem gerou (nome), envio, status e fee_valor. Nenhum dado fiscal, e-mail ou anexo.
// Reposição por garantia fica fora. As já marcadas por outra pessoa aparecem como "outro", sem a comissão alheia.
export async function listarCobrancasParaMarcar(svc: Service, o: { beneficiario: Beneficiario; agora?: Date }): Promise<CobrancaParaMarcar[]> {
  const agora = o.agora ?? new Date();
  const { data, error } = await svc
    .from("cobrancas_rs")
    .select("id, vaga_id, status, fee_valor, enviado_em, gerado_por_user_id, cliente_nome_snapshot, cargo")
    .eq("tipo", "contratacao")
    .in("status", ["aprovada_enviada", "validada", "paga"])
    .not("enviado_em", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Não foi possível ler as cobranças: ${error.message}`);
  const linhas = ((data ?? []) as unknown as {
    id: string; vaga_id: string; status: string; fee_valor: number | null; enviado_em: string | null;
    gerado_por_user_id: string | null; cliente_nome_snapshot: string | null; cargo: string | null;
  }[]).filter((c) => c.enviado_em && Number(c.fee_valor) > 0);
  if (linhas.length === 0) return [];
  const ids = linhas.map((c) => c.id);

  const { data: ativas } = await svc.from("comissao_lancamentos").select("cobranca_id, beneficiario_id").eq("tipo", "comissao").in("status", STATUS_ATIVOS).in("cobranca_id", ids);
  const marcadaPor = new Map((ativas ?? []).map((a) => [a.cobranca_id, a.beneficiario_id]));

  const { data: vagas } = await svc.from("vagas").select("id, titulo, reposicao_de_candidato_vaga_id").in("id", [...new Set(linhas.map((c) => c.vaga_id))]);
  const vagaPorId = new Map((vagas ?? []).map((v) => [v.id, v]));
  const nomes = await carregarNomesGeradoresCobrancaRS(svc, linhas.map((c) => c.gerado_por_user_id));

  const saida: CobrancaParaMarcar[] = [];
  for (const c of linhas) {
    const vaga = vagaPorId.get(c.vaga_id);
    if (vaga?.reposicao_de_candidato_vaga_id) continue;
    const competencia = competenciaDoInstante(c.enviado_em as string);
    const dono = marcadaPor.get(c.id);
    saida.push({
      id: c.id,
      cliente: c.cliente_nome_snapshot,
      vaga: vaga?.titulo ?? null,
      cargo: c.cargo,
      gerada_por: c.gerado_por_user_id ? nomes.get(c.gerado_por_user_id) ?? null : null,
      enviado_em: c.enviado_em as string,
      status: c.status,
      fee_valor: Number(c.fee_valor),
      competencia,
      retroativo: competenciaPassou(competencia, agora),
      comissao_prevista: calcularComissao(Number(c.fee_valor), o.beneficiario.percentual),
      marcada: dono ? (dono === o.beneficiario.id ? "voce" : "outro") : null,
    });
  }
  return saida;
}

// Estado da comissão de UMA cobrança para o quadro "Esta comissão é minha" na tela de Cobranças R&S.
export async function estadoDaCobranca(
  svc: Service,
  o: { cobrancaId: string; beneficiario: Beneficiario }
): Promise<{
  pode_marcar: boolean;
  motivo_bloqueio: string | null;
  lancamento: LancamentoDetalhado | null;
  marcada_por_outro: boolean;
  percentual: number;
  comissao_prevista: number | null;
  competencia: string | null;
  // Cobrança de mês já passado: a marcação vai para aprovação da diretoria (retroativo_pendente).
  retroativo: boolean;
  // Só uma sugestão visual (a marcação é sempre explícita): o responsável da vaga é o próprio beneficiário.
  sugestao_responsavel_da_vaga: boolean;
  fee_valor: number | null;
}> {
  const cobranca = (await lerCobrancas(svc, [o.cobrancaId])).get(o.cobrancaId);
  const base = {
    percentual: o.beneficiario.percentual,
    comissao_prevista: null as number | null,
    competencia: null as string | null,
    retroativo: false,
    sugestao_responsavel_da_vaga: false,
    fee_valor: null as number | null,
  };
  if (!cobranca) return { pode_marcar: false, motivo_bloqueio: "Cobrança não encontrada.", lancamento: null, marcada_por_outro: false, ...base };

  const { data: ativas } = await svc
    .from("comissao_lancamentos")
    .select("*")
    .eq("cobranca_id", o.cobrancaId)
    .eq("tipo", "comissao")
    .in("status", STATUS_ATIVOS);
  const recon = await reconciliar(svc, (ativas ?? []) as Lancamento[], "leitura");
  const minha = recon.find((l) => l.beneficiario_id === o.beneficiario.id) ?? null;
  const detalhado = minha ? (await detalhar(svc, [minha]))[0] : null;
  const outro = recon.some((l) => l.beneficiario_id !== o.beneficiario.id);

  const { data: vaga } = await svc.from("vagas").select("responsavel, reposicao_de_candidato_vaga_id").eq("id", cobranca.vaga_id).maybeSingle();
  const reposicao = !!vaga?.reposicao_de_candidato_vaga_id;
  const recusa = motivoDeNaoPoderMarcar({ ...cobranca, reposicao_garantia: reposicao });
  const competencia = cobranca.enviado_em ? competenciaDoInstante(cobranca.enviado_em) : null;
  const resp = (vaga?.responsavel ?? "").trim();
  return {
    competencia,
    retroativo: competencia ? competenciaPassou(competencia) : false,
    sugestao_responsavel_da_vaga: !!resp && (resp === o.beneficiario.nome_completo || resp === apelidoDoNomeCompleto(o.beneficiario.nome_completo)),
    fee_valor: cobranca.fee_valor == null ? null : Number(cobranca.fee_valor),
    pode_marcar: !recusa && !minha && !outro,
    motivo_bloqueio: recusa ? MENSAGEM_RECUSA_MARCACAO[recusa] : outro ? "Esta cobrança já tem a comissão marcada por outro beneficiário." : null,
    lancamento: detalhado,
    marcada_por_outro: outro,
    percentual: o.beneficiario.percentual,
    comissao_prevista: cobranca.fee_valor != null ? calcularComissao(Number(cobranca.fee_valor), o.beneficiario.percentual) : null,
  };
}

// ── Diretoria ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function lerLancamento(svc: Service, id: string): Promise<Lancamento | null> {
  const { data } = await svc.from("comissao_lancamentos").select("*").eq("id", id).maybeSingle();
  return (data as Lancamento | null) ?? null;
}

// Status que o lançamento deve ter olhando a cobrança agora (usado ao sair de contestada / ao aprovar um retroativo).
async function statusAlvoPelaCobranca(svc: Service, l: Lancamento): Promise<StatusLancamento> {
  const c = (await lerCobrancas(svc, [l.cobranca_id])).get(l.cobranca_id);
  const alvo = c ? statusPelaCobranca(c) : null;
  return alvo ?? "prevista";
}

export async function contestarLancamento(svc: Service, o: { lancamentoId: string; motivo: string; ator: Ator }): Promise<Resultado<{ lancamento: Lancamento }>> {
  const l = await lerLancamento(svc, o.lancamentoId);
  if (!l || l.tipo !== "comissao") return falha(404, "Lançamento não encontrado.");
  if (l.status !== "prevista" && l.status !== "confirmada") return falha(409, "Só dá para contestar uma comissão prevista ou confirmada.", "status_invalido");
  if (l.fechado_em) return falha(409, "Esta comissão já está em um fechamento (congelado). Corrija com um ajuste/estorno, que entra no próximo fechamento.", "lancamento_fechado");
  const { data, error } = await svc
    .from("comissao_lancamentos")
    .update({
      status: "contestada",
      status_antes_contestacao: l.status,
      contestado_por: o.ator.id,
      contestado_em: new Date().toISOString(),
      contestacao_motivo: o.motivo,
    })
    .eq("id", l.id)
    .eq("status", l.status)
    .select("*")
    .maybeSingle();
  if (error || !data) return falha(409, "O lançamento mudou enquanto era contestado. Recarregue e tente de novo.");
  auditar(o.ator, "comissao_contestada", l.id, { cobranca_id: l.cobranca_id, motivo: o.motivo, status_anterior: l.status, valor_comissao: l.valor_comissao }, l.unidade_id);
  const cliente = await clienteDaCobranca(svc, l.cobranca_id);
  const t = textos.contestada({ cliente, valor: Number(l.valor_comissao), motivo: o.motivo });
  await avisarBeneficiario(svc, { beneficiarioId: l.beneficiario_id, tipo: TIPO_AVISO_COMISSAO.contestada, ...t, referencia: { lancamento_id: l.id }, disparadoPor: o.ator });
  return { ok: true, lancamento: data as Lancamento };
}

export async function decidirRetroativo(
  svc: Service,
  o: { lancamentoId: string; decisao: "aprovar" | "recusar"; motivo?: string; ator: Ator }
): Promise<Resultado<{ lancamento: Lancamento }>> {
  const l = await lerLancamento(svc, o.lancamentoId);
  if (!l || l.tipo !== "comissao") return falha(404, "Lançamento não encontrado.");
  if (l.status !== "retroativo_pendente") return falha(409, "Este lançamento não está pendente de aprovação.", "status_invalido");
  if (o.decisao === "recusar" && !o.motivo?.trim()) return falha(400, "Informe o motivo da recusa.");
  const novoStatus: StatusLancamento = o.decisao === "recusar" ? "recusada" : await statusAlvoPelaCobranca(svc, l);
  const { data, error } = await svc
    .from("comissao_lancamentos")
    .update({
      status: novoStatus,
      decidido_por: o.ator.id,
      decidido_em: new Date().toISOString(),
      ...(o.decisao === "recusar" ? { resolucao_nota: o.motivo!.trim() } : {}),
    })
    .eq("id", l.id)
    .eq("status", "retroativo_pendente")
    .select("*")
    .maybeSingle();
  if (error || !data) return falha(409, "O lançamento mudou enquanto era decidido. Recarregue e tente de novo.");
  auditar(o.ator, o.decisao === "aprovar" ? "comissao_retroativo_aprovado" : "comissao_retroativo_recusado", l.id, {
    cobranca_id: l.cobranca_id,
    competencia: l.competencia,
    valor_comissao: l.valor_comissao,
    novo_status: novoStatus,
    motivo: o.motivo ?? null,
  }, l.unidade_id);
  const cliente = await clienteDaCobranca(svc, l.cobranca_id);
  const mes = rotuloCompetencia(l.competencia);
  const t = o.decisao === "aprovar"
    ? textos.retroativoAprovado({ cliente, valor: Number(l.valor_comissao), mes })
    : textos.retroativoRecusado({ cliente, mes, motivo: o.motivo!.trim() });
  await avisarBeneficiario(svc, {
    beneficiarioId: l.beneficiario_id,
    tipo: o.decisao === "aprovar" ? TIPO_AVISO_COMISSAO.retroativoAprovado : TIPO_AVISO_COMISSAO.retroativoRecusado,
    ...t,
    referencia: { lancamento_id: l.id },
    disparadoPor: o.ator,
  });
  return { ok: true, lancamento: data as Lancamento };
}

async function clienteDaCobranca(svc: Service, cobrancaId: string): Promise<string | null> {
  try {
    return (await lerCobrancas(svc, [cobrancaId])).get(cobrancaId)?.cliente_nome_snapshot ?? null;
  } catch {
    return null;
  }
}

// Soma já lançada em ajustes/estornos sobre um original (para não estornar mais do que existe).
async function somaAjustes(svc: Service, origemId: string): Promise<number> {
  const { data } = await svc.from("comissao_lancamentos").select("valor_comissao").eq("lancamento_origem_id", origemId);
  return arredondar2((data ?? []).reduce((s, r) => s + Number(r.valor_comissao), 0));
}

async function inserirAjuste(
  svc: Service,
  origem: Lancamento,
  tipo: "ajuste" | "estorno",
  valorAssinado: number,
  motivo: string,
  ator: Ator,
  agora: Date
): Promise<Resultado<{ lancamento: Lancamento }>> {
  const { data, error } = await svc
    .from("comissao_lancamentos")
    .insert({
      cobranca_id: origem.cobranca_id,
      beneficiario_id: origem.beneficiario_id,
      tipo,
      status: "confirmada",
      // O ajuste/estorno cai na competência em que foi REGISTRADO (o lançamento original não é reaberto).
      competencia: competenciaAtual(agora),
      valor_comissao: valorAssinado,
      lancamento_origem_id: origem.id,
      motivo,
      marcado_por: ator.id,
      unidade_id: origem.unidade_id,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[comissao] Erro ao criar ajuste/estorno:", error);
    return falha(500, "Não foi possível registrar o ajuste.");
  }
  auditar(ator, tipo === "estorno" ? "comissao_estorno_criado" : "comissao_ajuste_criado", data.id, {
    lancamento_origem_id: origem.id,
    cobranca_id: origem.cobranca_id,
    valor: valorAssinado,
    motivo,
  }, origem.unidade_id);
  return { ok: true, lancamento: data as Lancamento };
}

// Ajuste (valor assinado, ≠ 0) ou estorno (valor positivo informado, gravado negativo) vinculado a um lançamento de comissão.
// Estorno após comissão paga é só REGISTRO — nada é descontado em folha nesta fase.
export async function criarAjuste(
  svc: Service,
  o: { origemId: string; tipo: "ajuste" | "estorno"; valor: number; motivo: string; ator: Ator; agora?: Date }
): Promise<Resultado<{ lancamento: Lancamento }>> {
  const origem = await lerLancamento(svc, o.origemId);
  if (!origem || origem.tipo !== "comissao") return falha(404, "Lançamento não encontrado.");
  if (ehTerminal(origem.status)) return falha(409, "Lançamento cancelado/recusado não recebe ajuste.", "status_invalido");
  if (!o.motivo.trim()) return falha(400, "Informe o motivo.");
  const valor = arredondar2(o.valor);
  if (!Number.isFinite(valor) || valor === 0) return falha(400, "Informe um valor diferente de zero.");

  let assinado = valor;
  if (o.tipo === "estorno") {
    if (valor < 0) return falha(400, "Informe o valor do estorno como número positivo.");
    const restante = arredondar2(Number(origem.valor_comissao) + (await somaAjustes(svc, origem.id)));
    if (valor > restante) return falha(422, `O estorno não pode passar do que resta da comissão (${restante.toFixed(2)}).`, "estorno_excede");
    assinado = -valor;
  }
  return inserirAjuste(svc, origem, o.tipo, assinado, o.motivo.trim(), o.ator, o.agora ?? new Date());
}

// Decisão manual sobre a comissão contestada: mantém, ajusta o valor (via ajuste) ou remove (via estorno do restante). Em todos os
// casos o original volta ao status que a cobrança indica e fica registrado quem resolveu, quando e por quê.
export async function resolverContestacao(
  svc: Service,
  o: { lancamentoId: string; acao: "mantem" | "ajuste" | "remover"; valor?: number; nota: string; ator: Ator; agora?: Date }
): Promise<Resultado<{ lancamento: Lancamento; ajuste: Lancamento | null }>> {
  const l = await lerLancamento(svc, o.lancamentoId);
  if (!l || l.tipo !== "comissao") return falha(404, "Lançamento não encontrado.");
  if (l.status !== "contestada") return falha(409, "Este lançamento não está contestado.", "status_invalido");
  if (!o.nota.trim()) return falha(400, "Informe a justificativa da decisão.");
  const agora = o.agora ?? new Date();

  let ajuste: Lancamento | null = null;
  if (o.acao === "ajuste") {
    if (o.valor == null || arredondar2(o.valor) === 0) return falha(400, "Informe o valor do ajuste (diferente de zero).");
    const r = await inserirAjuste(svc, l, "ajuste", arredondar2(o.valor), o.nota.trim(), o.ator, agora);
    if (!r.ok) return r;
    ajuste = r.lancamento;
  } else if (o.acao === "remover") {
    const restante = arredondar2(Number(l.valor_comissao) + (await somaAjustes(svc, l.id)));
    if (restante > 0) {
      const r = await inserirAjuste(svc, l, "estorno", -restante, o.nota.trim(), o.ator, agora);
      if (!r.ok) return r;
      ajuste = r.lancamento;
    }
  }

  const novoStatus = await statusAlvoPelaCobranca(svc, l);
  const { data, error } = await svc
    .from("comissao_lancamentos")
    .update({ status: novoStatus, resolvido_por: o.ator.id, resolvido_em: agora.toISOString(), resolucao_nota: o.nota.trim() })
    .eq("id", l.id)
    .eq("status", "contestada")
    .select("*")
    .maybeSingle();
  if (error || !data) return falha(409, "O lançamento mudou enquanto a contestação era resolvida. Recarregue e confira os ajustes antes de tentar de novo.");
  auditar(o.ator, "comissao_contestacao_resolvida", l.id, { acao: o.acao, nota: o.nota.trim(), novo_status: novoStatus, ajuste_id: ajuste?.id ?? null }, l.unidade_id);
  const cliente = await clienteDaCobranca(svc, l.cobranca_id);
  const t = textos.contestacaoResolvida({ cliente, acao: o.acao, nota: o.nota.trim() });
  await avisarBeneficiario(svc, { beneficiarioId: l.beneficiario_id, tipo: TIPO_AVISO_COMISSAO.contestacaoResolvida, ...t, referencia: { lancamento_id: l.id }, disparadoPor: o.ator });
  return { ok: true, lancamento: data as Lancamento, ajuste };
}

// ── Beneficiários (configuração) ─────────────────────────────────────────────────────────────────────────────────────

export async function salvarBeneficiario(
  svc: Service,
  o: { analistaPerfilId: string; percentual: number; ativo: boolean; ator: Ator }
): Promise<Resultado<{ beneficiario: Beneficiario }>> {
  if (!(o.percentual >= 0 && o.percentual <= 100)) return falha(400, "Percentual deve estar entre 0 e 100.");
  const { data: perfil } = await svc.from("analistas_perfil").select("id, nome_completo, unidade_id").eq("id", o.analistaPerfilId).maybeSingle();
  if (!perfil) return falha(404, "Analista não encontrado.");
  const { data: existente } = await svc.from("comissao_beneficiarios").select("id, percentual, ativo").eq("analista_perfil_id", perfil.id).maybeSingle();
  const campos = { percentual: arredondar2(o.percentual), ativo: o.ativo };
  const { data, error } = existente
    ? await svc.from("comissao_beneficiarios").update(campos).eq("id", existente.id).select("*").single()
    : await svc.from("comissao_beneficiarios").insert({ analista_perfil_id: perfil.id, unidade_id: perfil.unidade_id, ...campos }).select("*").single();
  if (error || !data) return falha(500, "Não foi possível salvar o beneficiário.");
  registrarAuditoria({
    usuario_id: o.ator.id,
    usuario_nome: o.ator.nome,
    acao: existente ? "comissao_beneficiario_atualizado" : "comissao_beneficiario_criado",
    entidade: "comissao_beneficiarios",
    entidade_id: data.id,
    // O percentual novo vale só para marcações novas: lançamentos existentes guardam o percentual que aplicaram.
    detalhes: { analista: perfil.nome_completo, antes: existente ?? null, depois: campos },
  });
  return { ok: true, beneficiario: { ...data, percentual: Number(data.percentual), nome_completo: perfil.nome_completo ?? null } as Beneficiario };
}
