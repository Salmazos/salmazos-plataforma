import type { z } from "zod";
import type { createServiceClient } from "@/lib/supabase/server";
import type { propostaCreateSchema, propostaSituacaoSchema, propostaUpdateSchema } from "@/lib/schemas";
import { hojeSaoPaulo, mensagemOportunidadeAberta, type ContextoComercial } from "@/lib/comercial";
import { ROTULO_MOTIVO_PERDA, ehAberta } from "@/lib/comercialRotulos";
import { MSG_SO_ACOMPANHA_PROPOSTAS, type ContextoPropostas } from "@/lib/propostasAcesso";
import { atualizarOportunidade, type OportunidadeLinha } from "@/lib/oportunidadeEtapa";
import { decidirEfeitoFunil, type PropostaDoFunil } from "@/lib/propostaFunil";
import {
  FOLLOWUP_DIAS_UTEIS, MSG_NOME_INCOMPLETO, ROTULO_SITUACAO, SERVICO_POR_MODELO, SITUACOES_ESCOLHIDAS_PELO_VENDEDOR, VALIDADE_PADRAO_DIAS,
  calcularValidadeAte, modeloDisponivel, modoEdicao, podeTransicionar, siglaDoVendedor, somarDiasUteis, textoFollowUp,
  type ModeloProposta, type SituacaoProposta,
} from "@/lib/propostas";
import { MENSAGEM_MODELO_INDISPONIVEL, MODELOS_PROPOSTA, montarSnapshot, validarConteudo, type SnapshotProposta, type SnapshotQualquer } from "@/lib/propostaModelos";
import { montarPreviaMot, previaDeSnapshotMot, snapshotMotSchema, type ParametrosMotVigentes, type PreviaMot, type SnapshotMot } from "@/lib/propostaMot";
import { parametrosMotValidos } from "@/lib/propostaMotCalculo";
import { registrarAuditoria } from "@/lib/audit";
import {
  MSG_PDF_TS_INDISPONIVEL, MSG_PERCENTUAIS_TS_AUSENTES, PDF_TS_DISPONIVEL, avaliarMargemTs, avaliarPrecoTs, conteudoTsSchema, mensagemErroConteudoTs, planilhaTsDeSnapshot,
  privilegiosTsViolados, restaurarOcultosTs, snapshotTsSchema, type ConteudoTs, type LiberacaoMargemTs, type ParametrosTsVigentes, type PlanilhaTsTela, type SnapshotTs,
} from "@/lib/propostaTs";
import { parametrosTsValidos } from "@/lib/propostaTsCalculo";

type Svc = ReturnType<typeof createServiceClient>;
// Linha de `propostas` (select "*"): lida sem tipagem própria, como as demais linhas do Comercial.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PropostaLinha = Record<string, any>;

export type Resultado<T> = { ok: true; data: T; aviso?: string } | { ok: false; status: number; error: string };
const falha = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

// Toda escrita roda com o service role (o papel authenticated só lê): o dono é conferido aqui, em código.
export function ehDonoDaProposta(ctx: ContextoPropostas, p: PropostaLinha): boolean {
  return ctx.podeEscrever && p.vendedor_id === ctx.analistaId;
}

// Leitura: o vendedor vê as próprias; o gestor vê as da sua unidade (ou todas, com acesso a todas as unidades).
export function podeVerProposta(ctx: ContextoPropostas, p: PropostaLinha): boolean {
  // Proposta de teste só aparece para o gestor (diretoria/superuser): para o vendedor responde como inexistente.
  if (p.teste === true && !ctx.gestor) return false;
  if (ehDonoDaProposta(ctx, p)) return true;
  if (!ctx.gestor) return false;
  return ctx.todasUnidades || !ctx.unidadeId || p.unidade_id === ctx.unidadeId;
}

// Empresa marcada como "de teste" (tabela empresas_teste, só a diretoria marca). Erro de leitura = erro: nunca se decide "no escuro", porque
// errar para "não é teste" gastaria um número REAL com uma proposta de teste.
export async function empresaEhDeTeste(svc: Svc, empresaId: string): Promise<{ ok: true; teste: boolean } | { ok: false; error: string }> {
  const { data, error } = await svc.from("empresas_teste").select("empresa_id").eq("empresa_id", empresaId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, teste: !!data };
}

export async function carregarProposta(svc: Svc, id: string): Promise<PropostaLinha | null> {
  const { data } = await svc.from("propostas").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

type DadosVendedor = { nome: string; telefone: string | null; email: string | null; cargo: string | null };
async function dadosDoVendedor(svc: Svc, vendedorId: string): Promise<DadosVendedor> {
  const { data } = await svc.from("analistas_perfil").select("nome_completo, telefone, email, cargo").eq("id", vendedorId).maybeSingle();
  return { nome: data?.nome_completo ?? "", telefone: data?.telefone ?? null, email: data?.email ?? null, cargo: data?.cargo ?? null };
}

export async function buscarOportunidadeAberta(svc: Svc, empresaId: string): Promise<OportunidadeLinha | null> {
  const { data } = await svc
    .from("oportunidades")
    .select("*")
    .eq("empresa_visitada_id", empresaId)
    .not("etapa", "in", "(ganho,perdido)")
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Só INSERE: o trigger do banco barra update/delete em proposta_historico (inclusive para o service role).
async function registrarHistorico(
  svc: Svc,
  h: { proposta_id: string; de: string | null; para: string; autor_id: string | null; observacao?: string | null }
): Promise<boolean> {
  const { error } = await svc.from("proposta_historico").insert({ ...h, observacao: h.observacao ?? null });
  if (error) console.error("[propostas] Histórico não gravado:", error.message);
  return !error;
}

// O lembrete de follow-up é achado por oportunidade + tipo "retorno" + texto com o número da proposta.
async function cancelarFollowUp(svc: Svc, p: PropostaLinha): Promise<boolean> {
  if (!p.oportunidade_id) return true;
  const agora = new Date().toISOString();
  const { error } = await svc
    .from("lembretes")
    .update({ status: "cancelado", concluido_em: agora, updated_at: agora })
    .eq("oportunidade_id", p.oportunidade_id)
    .eq("tipo", "retorno")
    .eq("status", "pendente")
    .eq("texto", textoFollowUp(p.numero));
  if (error) console.error("[propostas] Follow-up não cancelado:", error.message);
  return !error;
}

// Vencimento SEM cron: toda listagem/detalhe chama esta varredura. Idempotente: o UPDATE é condicional à situação
// lida, então duas chamadas (ou duas pessoas) não vencem a mesma proposta duas vezes nem duplicam o histórico.
export async function varrerVencidas(svc: Svc, hoje: string, propostaId?: string): Promise<number> {
  try {
    let q = svc.from("propostas").select("id, numero, situacao, oportunidade_id").in("situacao", ["enviada", "em_negociacao"]).lt("validade_ate", hoje);
    if (propostaId) q = q.eq("id", propostaId);
    const { data } = await q;
    let vencidas = 0;
    for (const p of data ?? []) {
      const { data: atualizada } = await svc
        .from("propostas")
        .update({ situacao: "vencida", updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("situacao", p.situacao)
        .select("id")
        .maybeSingle();
      if (!atualizada) continue;
      vencidas += 1;
      await registrarHistorico(svc, { proposta_id: p.id, de: p.situacao, para: "vencida", autor_id: null, observacao: "Validade expirada." });
      await cancelarFollowUp(svc, p);
    }
    return vencidas;
  } catch (err) {
    console.error("[propostas] Varredura de vencimento falhou:", err);
    return 0;
  }
}

async function resolverContato(
  svc: Svc,
  contatoId: string,
  empresaId: string | null
): Promise<{ ok: true; nome: string } | { ok: false; error: string }> {
  const { data: c } = await svc.from("empresa_contatos").select("id, nome, empresa_visitada_id").eq("id", contatoId).maybeSingle();
  if (!c || !empresaId || c.empresa_visitada_id !== empresaId) return { ok: false, error: "Esse contato não pertence à empresa da proposta." };
  return { ok: true, nome: c.nome };
}

function snapshotDa(p: PropostaLinha, vendedor: DadosVendedor, revisao: number, emissao: string, validadeAte: string): SnapshotProposta {
  return montarSnapshot({
    modelo: p.modelo as ModeloProposta,
    numero: p.numero,
    revisao,
    templateVersao: p.template_versao,
    dataEmissao: emissao,
    validadeDias: p.validade_dias,
    validadeAte,
    clienteNome: p.cliente_nome,
    aosCuidados: p.aos_cuidados ?? null,
    conteudo: p.conteudo,
    vendedorNome: vendedor.nome,
    vendedorTelefone: vendedor.telefone,
    vendedorEmail: vendedor.email,
  });
}

// Percentuais do MOT vigentes na data (parametros_mot_vigentes: a vigência mais recente com vigente_desde <= data). Sem vigência não se inventa percentual.
async function parametrosMotVigentes(svc: Svc, data: string): Promise<Resultado<ParametrosMotVigentes>> {
  const { data: linhas, error } = await svc.rpc("parametros_mot_vigentes", { p_hoje: data });
  if (error) {
    console.error("[propostas] Percentuais do MOT não lidos:", error.message);
    return falha(500, "Não foi possível ler os percentuais do MOT. Nada foi alterado; tente de novo.");
  }
  const linha = (Array.isArray(linhas) ? linhas[0] : linhas) as (Record<string, unknown> & { vigente_desde?: string; id?: string }) | null | undefined;
  if (!linha || !linha.vigente_desde) return falha(409, "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los.");
  if (!parametrosMotValidos(linha)) return falha(500, "Os percentuais do MOT cadastrados estão inválidos. Avise a diretoria.");
  return { ok: true, data: linha as unknown as ParametrosMotVigentes };
}

// Snapshot do MOT: congela os percentuais vigentes na data da emissão e a planilha calculada de cada função (ver propostaMot.ts).
async function snapshotMotDaProposta(svc: Svc, p: PropostaLinha, vendedor: DadosVendedor, revisao: number, emissao: string, validadeAte: string): Promise<Resultado<SnapshotMot>> {
  const par = await parametrosMotVigentes(svc, emissao);
  if (!par.ok) return par;
  try {
    return {
      ok: true,
      data: montarSnapshot({
        modelo: "MOT",
        numero: p.numero,
        revisao,
        templateVersao: p.template_versao,
        dataEmissao: emissao,
        validadeDias: p.validade_dias,
        validadeAte,
        clienteNome: p.cliente_nome,
        aosCuidados: p.aos_cuidados ?? null,
        conteudo: p.conteudo,
        vendedorNome: vendedor.nome,
        vendedorCargo: vendedor.cargo,
        vendedorTelefone: vendedor.telefone,
        vendedorEmail: vendedor.email,
        parametrosMot: par.data,
      }),
    };
  } catch (err) {
    console.error("[propostas] Conteúdo do MOT inválido ao montar o snapshot:", err instanceof Error ? err.message : err);
    return falha(400, "O conteúdo da proposta de Mão de Obra Temporária está incompleto ou inválido. Revise as funções e tente de novo.");
  }
}

// ── Terceirização (TS): mesma integração do MOT, com as regras de preço da diretoria ────────────────────────────────────────────────────────────────
// O servidor SEMPRE recalcula a partir dos dados de entrada com os percentuais vigentes; nada calculado vem do navegador. Os percentuais usados ficam congelados no
// snapshot de cada revisão (proposta antiga nunca muda quando a diretoria muda os percentuais).

// Percentuais do TS vigentes na data (parametros_ts_vigentes: a vigência mais recente com vigente_desde <= data). Sem vigência não se inventa percentual.
async function parametrosTsVigentes(svc: Svc, data: string): Promise<Resultado<ParametrosTsVigentes>> {
  const { data: linhas, error } = await svc.rpc("parametros_ts_vigentes", { p_hoje: data });
  if (error) {
    console.error("[propostas] Percentuais do TS não lidos:", error.message);
    return falha(500, "Não foi possível ler os percentuais da Terceirização. Nada foi alterado; tente de novo.");
  }
  const linha = (Array.isArray(linhas) ? linhas[0] : linhas) as (Record<string, unknown> & { vigente_desde?: string; id?: string }) | null | undefined;
  if (!linha || !linha.vigente_desde) return falha(409, MSG_PERCENTUAIS_TS_AUSENTES);
  if (!parametrosTsValidos(linha)) return falha(500, "Os percentuais da Terceirização cadastrados estão inválidos. Avise a diretoria.");
  return { ok: true, data: linha as unknown as ParametrosTsVigentes };
}

// Preço manual e ISS por proposta: só a diretoria (403, nada é gravado). O que já estava gravado pode continuar como está para quem edita sem mexer nesses campos.
function exigirPrivilegiosTs(ctx: ContextoPropostas, novo: ConteudoTs, anteriorBruto: unknown): Resultado<null> {
  const anterior = conteudoTsSchema.safeParse(anteriorBruto ?? {});
  const msg = privilegiosTsViolados(novo, anterior.success ? anterior.data : null, ctx.gestor);
  return msg ? falha(403, msg) : { ok: true, data: null };
}

interface AvaliacaoServidorTs {
  parametros: ParametrosTsVigentes;
  abaixoMargem: number[];
  liberacao: { justificativa: string; servicos: number[] } | null;
}
// Percentuais vigentes → preço (422 com a mensagem da lib se o preço não estiver configurado) → margem mínima (bloqueia quem não é gestor; o gestor libera com justificativa).
async function avaliarTsNoServidor(svc: Svc, ctx: ContextoPropostas, conteudo: ConteudoTs, data: string): Promise<Resultado<AvaliacaoServidorTs>> {
  const par = await parametrosTsVigentes(svc, data);
  if (!par.ok) return par;
  const av = avaliarPrecoTs(conteudo, par.data);
  if (!av.ok) return falha(av.status, av.error);
  const m = avaliarMargemTs({ abaixoMargem: av.abaixoMargem, nomesServicos: conteudo.servicos.map((x) => x.nome), gestor: ctx.gestor, justificativa: conteudo.justificativa_margem_minima });
  if (!m.ok) return falha(m.status, m.error);
  return { ok: true, data: { parametros: par.data, abaixoMargem: av.abaixoMargem, liberacao: m.liberacao } };
}

// Snapshot do TS: congela os percentuais vigentes na data da emissão, o cálculo linha a linha de cada posto e, se o gestor liberou uma margem abaixo do mínimo, quem liberou.
async function snapshotTsDaProposta(
  svc: Svc, ctx: ContextoPropostas, p: PropostaLinha, conteudoBruto: unknown, vendedor: DadosVendedor, revisao: number, emissao: string, validadeAte: string
): Promise<Resultado<{ snapshot: SnapshotTs; avaliacao: AvaliacaoServidorTs }>> {
  const c = conteudoTsSchema.safeParse(conteudoBruto ?? {});
  if (!c.success) return falha(400, mensagemErroConteudoTs(c.error.issues));
  const av = await avaliarTsNoServidor(svc, ctx, c.data, emissao);
  if (!av.ok) return av;
  const liberacao: LiberacaoMargemTs | null = av.data.liberacao
    ? { ...av.data.liberacao, liberado_por_id: ctx.analistaId, liberado_por_nome: (await dadosDoVendedor(svc, ctx.analistaId)).nome, liberado_em: new Date().toISOString() }
    : null;
  try {
    return {
      ok: true,
      data: {
        avaliacao: av.data,
        snapshot: montarSnapshot({
          modelo: "TS", numero: p.numero, revisao, templateVersao: p.template_versao, dataEmissao: emissao, validadeDias: p.validade_dias, validadeAte,
          clienteNome: p.cliente_nome, aosCuidados: p.aos_cuidados ?? null, conteudo: c.data, vendedorNome: vendedor.nome, vendedorCargo: vendedor.cargo,
          vendedorTelefone: vendedor.telefone, vendedorEmail: vendedor.email, parametrosTs: av.data.parametros, liberacaoMargemTs: liberacao,
        }),
      },
    };
  } catch (err) {
    console.error("[propostas] Conteúdo do TS inválido ao montar o snapshot:", err instanceof Error ? err.message : err);
    return falha(400, "O conteúdo da proposta de Terceirização está incompleto ou inválido. Revise os serviços e tente de novo.");
  }
}

// Auditoria SÓ de autorizações especiais (preço manual, ISS por proposta, margem liberada), sem dados pessoais: quem fez, em qual proposta e o quê.
function auditarAutorizacoesTs(ctx: ContextoPropostas, p: { id: string; numero: string }, conteudo: ConteudoTs, avaliacao: AvaliacaoServidorTs, evento: "criada" | "editada" | "revisao") {
  const precoManual = conteudo.servicos.some((x) => x.preco_manual_centavos != null);
  const iss = conteudo.iss_override_bp ?? null;
  if (!precoManual && iss === null && !avaliacao.liberacao) return;
  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "proposta_ts_autorizacao",
    entidade: "propostas",
    entidade_id: p.id,
    unidade_id: ctx.unidadeId,
    detalhes: {
      numero: p.numero, evento, preco_manual: precoManual, iss_override_bp: iss, margem_liberada: !!avaliacao.liberacao,
      servicos_abaixo_da_margem: avaliacao.liberacao?.servicos ?? [], justificativa: avaliacao.liberacao?.justificativa ?? null,
    },
  });
}

// Rascunho: o PDF usa o conteúdo atual, com hoje como emissão. Proposta enviada: o snapshot da revisão pedida
// (ou da atual); reabrir uma revisão antiga nunca depende de dados vivos.
export async function snapshotParaPdf(svc: Svc, p: PropostaLinha, revisao: number | null): Promise<Resultado<SnapshotQualquer>> {
  if (p.situacao === "rascunho" && revisao === null) {
    const hoje = hojeSaoPaulo();
    const vendedor = await dadosDoVendedor(svc, p.vendedor_id);
    if (p.modelo === "MOT") return snapshotMotDaProposta(svc, p, vendedor, 0, hoje, calcularValidadeAte(hoje, p.validade_dias));
    if (p.modelo === "TS") return falha(409, MSG_PDF_TS_INDISPONIVEL);
    return { ok: true, data: snapshotDa(p, vendedor, 0, hoje, calcularValidadeAte(hoje, p.validade_dias)) };
  }
  const alvo = revisao ?? p.revisao_atual;
  const { data: rev } = await svc.from("proposta_revisoes").select("conteudo").eq("proposta_id", p.id).eq("revisao", alvo).maybeSingle();
  if (!rev) return falha(404, "Revisão não encontrada.");
  // Revisão já gravada: devolve EXATAMENTE o que foi gravado (nunca recalcula; vale para R&S e MOT).
  return { ok: true, data: rev.conteudo as SnapshotQualquer };
}

// ── Criar rascunho ───────────────────────────────────────────────────────────

export async function criarRascunho(svc: Svc, ctx: ContextoPropostas, d: z.infer<typeof propostaCreateSchema>): Promise<Resultado<PropostaLinha>> {
  if (!ctx.podeEscrever) return falha(403, MSG_SO_ACOMPANHA_PROPOSTAS);
  if (!ctx.unidadeId) return falha(400, "Seu perfil não tem unidade definida.");
  // MOT fora da chave do harness: a decisão depende de ser gestor E a empresa ser de teste, então fica para depois de ler a empresa (abaixo).
  const modeloLivre = modeloDisponivel(d.modelo);
  if (!modeloLivre && d.modelo !== "MOT" && d.modelo !== "TS") return falha(400, MENSAGEM_MODELO_INDISPONIVEL);
  let conteudo = modeloLivre ? validarConteudo(d.modelo, d.conteudo) : null;
  if (conteudo && !conteudo.ok) return falha(400, conteudo.error);
  const { data: empresa } = await svc.from("empresas_visitadas").select("id, nome, cliente_id, unidade_id").eq("id", d.empresa_visitada_id).maybeSingle();
  if (!empresa || empresa.unidade_id !== ctx.unidadeId) return falha(404, "Empresa não encontrada na Carteira da sua unidade.");

  // Proposta de teste vem SÓ da empresa marcada (nunca do corpo da requisição). Só o gestor enxerga e usa empresa de teste.
  const marca = await empresaEhDeTeste(svc, empresa.id);
  if (!marca.ok) return falha(500, "Não foi possível verificar se a empresa é de teste. Nada foi criado; tente de novo.");
  const teste = marca.teste;
  if (teste && !ctx.gestor) return falha(404, "Empresa não encontrada na Carteira da sua unidade.");
  if (!modeloLivre) {
    if (!modeloDisponivel(d.modelo, { gestor: ctx.gestor, teste })) return falha(400, MENSAGEM_MODELO_INDISPONIVEL);
    conteudo = validarConteudo(d.modelo, d.conteudo, { gestor: ctx.gestor, teste });
    if (!conteudo.ok) return falha(400, conteudo.error);
  }
  if (!conteudo || !conteudo.ok) return falha(400, MENSAGEM_MODELO_INDISPONIVEL);

  // TS: preço manual e ISS só da diretoria (403); o servidor recalcula tudo com os percentuais vigentes (422 se o preço não estiver configurado; margem abaixo do mínimo
  // bloqueia quem não é gestor e exige justificativa do gestor). Tudo ANTES de gastar número: nada é criado quando algo é recusado.
  let avaliacaoTs: AvaliacaoServidorTs | null = null;
  if (d.modelo === "TS") {
    const privilegios = exigirPrivilegiosTs(ctx, conteudo.data as ConteudoTs, null);
    if (!privilegios.ok) return privilegios;
    const av = await avaliarTsNoServidor(svc, ctx, conteudo.data as ConteudoTs, hojeSaoPaulo());
    if (!av.ok) return av;
    avaliacaoTs = av.data;
  }

  // A sigla do número (proposta REAL) sai do nome do vendedor e fica fixa na criação; sem nome aproveitável não se inventa sigla.
  // Proposta de teste leva TESTE no lugar da sigla e não precisa dela.
  const sigla = teste ? null : siglaDoVendedor((await dadosDoVendedor(svc, ctx.analistaId)).nome);
  if (!teste && !sigla) return falha(400, MSG_NOME_INCOMPLETO);

  let contatoNome: string | null = null;
  if (d.contato_id) {
    const c = await resolverContato(svc, d.contato_id, empresa.id);
    if (!c.ok) return falha(400, c.error);
    contatoNome = c.nome;
  }

  // Aviso (não bloqueia): outra pessoa já tem oportunidade aberta nesta empresa. Só será barrado ao marcar como enviada.
  // Quem não tem Funil (acesso só por liberação) não lê nem se vincula a oportunidades.
  // Proposta de teste nunca se liga ao Funil.
  const aberta = ctx.temFunil && !teste ? await buscarOportunidadeAberta(svc, empresa.id) : null;
  const aviso = aberta && aberta.vendedor_id !== ctx.analistaId ? (await mensagemOportunidadeAberta(svc, empresa.id)) ?? undefined : undefined;

  // Teste: criar_proposta_teste (contador de teste próprio, número TESTE-...). Real: criar_proposta, exatamente como antes.
  const { data, error } = await svc.rpc(teste ? "criar_proposta_teste" : "criar_proposta", {
    p_modelo: d.modelo,
    ...(teste ? {} : { p_sigla: sigla }),
    p_unidade_id: ctx.unidadeId,
    p_vendedor_id: ctx.analistaId,
    p_empresa_visitada_id: empresa.id,
    p_oportunidade_id: aberta && aberta.vendedor_id === ctx.analistaId ? aberta.id : null,
    p_cliente_nome: empresa.nome,
    p_aos_cuidados: d.aos_cuidados?.trim() || contatoNome,
    p_conteudo: conteudo.data,
    p_template_versao: MODELOS_PROPOSTA[d.modelo].templateVersao,
    p_validade_dias: d.validade_dias ?? VALIDADE_PADRAO_DIAS,
  });
  if (error || !data) return falha(500, `Não foi possível criar a proposta: ${error?.message ?? "sem retorno"}`);

  await registrarHistorico(svc, { proposta_id: data.id, de: null, para: "rascunho", autor_id: ctx.analistaId });
  if (avaliacaoTs) auditarAutorizacoesTs(ctx, data, conteudo.data as ConteudoTs, avaliacaoTs, "criada");
  return { ok: true, data, aviso };
}

// ── Editar ───────────────────────────────────────────────────────────────────

export async function editarProposta(svc: Svc, ctx: ContextoPropostas, p: PropostaLinha, d: z.infer<typeof propostaUpdateSchema>): Promise<Resultado<PropostaLinha>> {
  const modo = modoEdicao(p.situacao as SituacaoProposta);
  if (!modo) return falha(409, `Uma proposta ${ROTULO_SITUACAO[p.situacao as SituacaoProposta].toLowerCase()} não pode mais ser editada.`);
  if (d.updated_at !== p.updated_at) return falha(409, "A proposta foi alterada desde que você a abriu. Recarregue e tente de novo.");

  let conteudo = p.conteudo;
  if (d.conteudo !== undefined) {
    const v = validarConteudo(p.modelo, d.conteudo, { gestor: ctx.gestor, teste: p.teste === true });
    if (!v.ok) return falha(400, v.error);
    conteudo = v.data;
  }
  let aosCuidados: string | null = p.aos_cuidados ?? null;
  if (d.aos_cuidados !== undefined) aosCuidados = d.aos_cuidados?.trim() || null;
  else if (d.contato_id) {
    const c = await resolverContato(svc, d.contato_id, p.empresa_visitada_id ?? null);
    if (!c.ok) return falha(400, c.error);
    aosCuidados = c.nome;
  }
  const validadeDias = d.validade_dias ?? p.validade_dias;
  const agora = new Date().toISOString();
  const campos: Record<string, unknown> = { conteudo, aos_cuidados: aosCuidados, validade_dias: validadeDias, updated_at: agora };

  // TS: mesma validação da criação (privilégios da diretoria, preço recalculado no servidor, margem mínima) em TODA gravação; em proposta já entregue o snapshot
  // da nova revisão sai da mesma conta. Nada é gravado quando algo é recusado.
  const hojeTs = hojeSaoPaulo();
  let snapTs: SnapshotTs | null = null;
  let avaliacaoTs: AvaliacaoServidorTs | null = null;
  if (p.modelo === "TS") {
    const parseado = conteudoTsSchema.safeParse(conteudo);
    if (!parseado.success) return falha(400, mensagemErroConteudoTs(parseado.error.issues));
    // Quem não é gestor não VÊ o ISS por proposta, a cobertura dos postos nem a justificativa da margem; o que já estava gravado volta no lugar do que não veio.
    const anteriorTs = conteudoTsSchema.safeParse(p.conteudo ?? {});
    const novo = { data: ctx.gestor ? parseado.data : restaurarOcultosTs(parseado.data, anteriorTs.success ? anteriorTs.data : null) };
    conteudo = novo.data;
    campos.conteudo = novo.data;
    const privilegios = exigirPrivilegiosTs(ctx, novo.data, p.conteudo);
    if (!privilegios.ok) return privilegios;
    const s = await snapshotTsDaProposta(
      svc, ctx, { ...p, conteudo, aos_cuidados: aosCuidados, validade_dias: validadeDias }, novo.data, await dadosDoVendedor(svc, p.vendedor_id),
      modo === "revisao" ? (p.revisao_atual as number) + 1 : 0, hojeTs, calcularValidadeAte(hojeTs, validadeDias)
    );
    if (!s.ok) return s;
    snapTs = s.data.snapshot;
    avaliacaoTs = s.data.avaliacao;
  }

  if (modo === "rascunho") {
    const { data } = await svc.from("propostas").update(campos).eq("id", p.id).eq("updated_at", p.updated_at).eq("situacao", "rascunho").select().maybeSingle();
    if (!data) return falha(409, "A proposta foi alterada desde que você a abriu. Recarregue e tente de novo.");
    if (avaliacaoTs) auditarAutorizacoesTs(ctx, data, conteudo as ConteudoTs, avaliacaoTs, "editada");
    return { ok: true, data };
  }

  // Proposta já entregue: nova revisão (mesmo número). A revisão anterior continua intacta; a validade recomeça de hoje.
  const hoje = hojeTs;
  const novaRevisao = (p.revisao_atual as number) + 1;
  const validadeAte = calcularValidadeAte(hoje, validadeDias);
  // MOT: o snapshot (percentuais vigentes HOJE + planilha) é montado antes de gravar qualquer coisa; sem percentuais vigentes nada muda.
  let snapMot: SnapshotMot | SnapshotTs | null = null;
  if (p.modelo === "TS") snapMot = snapTs;
  if (p.modelo === "MOT") {
    const s = await snapshotMotDaProposta(svc, { ...p, conteudo, aos_cuidados: aosCuidados, validade_dias: validadeDias }, await dadosDoVendedor(svc, p.vendedor_id), novaRevisao, hoje, validadeAte);
    if (!s.ok) return s;
    snapMot = s.data;
  }
  // MOT: o valor estimado acompanha a revisão mais recente (soma dos valores mensais da planilha da revisão). Vai no MESMO update que grava a revisão
  // (e é restaurado se a gravação da revisão falhar). Só chega aqui em enviada/em negociação: nas demais situações a edição já foi recusada acima.
  // R&S não passa por aqui (snapMot é null): o valor do R&S continua sendo o digitado no envio.
  const valorNovo = snapMot ? snapMot.total_mensal_centavos / 100 : null;
  const valorAntigo = p.valor_estimado == null ? null : Number(p.valor_estimado);
  const valorMudou = valorNovo !== null && (valorAntigo === null || Math.round(valorAntigo * 100) !== snapMot!.total_mensal_centavos);
  const { data: atualizada } = await svc
    .from("propostas")
    .update({ ...campos, revisao_atual: novaRevisao, validade_ate: validadeAte, ...(valorMudou ? { valor_estimado: valorNovo } : {}) })
    .eq("id", p.id)
    .eq("updated_at", p.updated_at)
    .eq("situacao", p.situacao)
    .select()
    .maybeSingle();
  if (!atualizada) return falha(409, "A proposta foi alterada desde que você a abriu. Recarregue e tente de novo.");

  const vendedor = await dadosDoVendedor(svc, p.vendedor_id);
  const { error } = await svc.from("proposta_revisoes").insert({
    proposta_id: p.id,
    revisao: novaRevisao,
    conteudo: snapMot ?? snapshotDa(atualizada, vendedor, novaRevisao, hoje, validadeAte),
    template_versao: atualizada.template_versao,
    vendedor_nome: vendedor.nome,
    vendedor_telefone: vendedor.telefone,
    criado_por: ctx.analistaId,
  });
  if (error) {
    // Nada imutável foi gravado: devolve a proposta ao estado anterior.
    await svc
      .from("propostas")
      .update({
        conteudo: p.conteudo, aos_cuidados: p.aos_cuidados ?? null, validade_dias: p.validade_dias, revisao_atual: p.revisao_atual,
        validade_ate: p.validade_ate ?? null, updated_at: new Date().toISOString(),
        ...(valorMudou ? { valor_estimado: p.valor_estimado ?? null } : {}),
      })
      .eq("id", p.id)
      .eq("updated_at", atualizada.updated_at);
    return error.code === "23505" ? falha(409, "Outra revisão acabou de ser criada. Recarregue e tente de novo.") : falha(500, `Não foi possível criar a revisão: ${error.message}`);
  }
  // A mudança de valor entra na própria linha "Revisão N emitida" (sem tipo de evento novo): "Valor: R$ A → R$ B (Rev. N)".
  const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const observacao = valorMudou && valorAntigo !== null
    ? `Revisão ${novaRevisao} emitida. Valor: ${moeda(valorAntigo)} → ${moeda(valorNovo as number)} (Rev. ${novaRevisao}).`
    : valorMudou ? `Revisão ${novaRevisao} emitida. Valor: ${moeda(valorNovo as number)} (Rev. ${novaRevisao}).` : `Revisão ${novaRevisao} emitida.`;
  await registrarHistorico(svc, { proposta_id: p.id, de: p.situacao, para: p.situacao, autor_id: ctx.analistaId, observacao });
  if (avaliacaoTs) auditarAutorizacoesTs(ctx, atualizada, conteudo as ConteudoTs, avaliacaoTs, "revisao");
  // Funil: só proposta MOT real, de quem tem Funil, quando o valor mudou. A revisão já está gravada (imutável): falha aqui vira aviso, nunca erro.
  let aviso: string | undefined;
  if (valorMudou && ctx.temFunil && p.teste !== true && p.oportunidade_id) aviso = await recalcularValorFunil(svc, ctx, atualizada);
  return { ok: true, data: atualizada, aviso };
}

// ── Mudar situação ───────────────────────────────────────────────────────────

interface EfeitoFunil {
  oportunidadeId: string | null;
  aviso?: string;
  desfazer: () => Promise<void>;
}

const MSG_FUNIL_NAO_ATUALIZADO = "O valor do Funil não pôde ser atualizado.";

// Valor da oportunidade depois que o valor de uma proposta MOT enviada mudou numa revisão. Mesma regra de dono do efeitoAcompanhamento; usa a decisão pura
// (soma das propostas ativas, com a proposta já no valor novo, que precisa estar gravado em propostas) e grava SÓ o valor: a etapa nunca se move.
// Devolve o aviso a mostrar (ou undefined quando não há nada a dizer). Nunca lança: a edição já foi salva.
async function recalcularValorFunil(svc: Svc, ctx: ContextoComercial, p: PropostaLinha): Promise<string | undefined> {
  try {
    const { data: opp } = await svc.from("oportunidades").select("*").eq("id", p.oportunidade_id).maybeSingle();
    if (!opp) return undefined;
    const atual: OportunidadeLinha = opp;
    if (atual.vendedor_id !== ctx.analistaId) return "A oportunidade aberta desta empresa é de outro vendedor e o valor dela não foi alterado no Funil.";
    if (!ehAberta(atual.etapa)) return undefined;
    const todas = await propostasDaOportunidade(svc, atual.id, { id: p.id, situacao: p.situacao as SituacaoProposta, valor_estimado: p.valor_estimado ?? null });
    const decisao = decidirEfeitoFunil({ evento: { propostaId: p.id, para: p.situacao as SituacaoProposta }, etapaAtual: atual.etapa, propostas: todas });
    if (decisao.valorEstimado === undefined || Number(atual.valor_estimado) === decisao.valorEstimado) return undefined;
    // Oportunidade aberta sem próxima ação (legado) não aceita regravar o valor: não se inventa ação.
    if (!atual.proxima_acao || !atual.proxima_acao_em) return MSG_FUNIL_NAO_ATUALIZADO;
    const r = await atualizarOportunidade(svc, ctx.analistaId, atual, { valor_estimado: decisao.valorEstimado });
    return r.ok ? undefined : MSG_FUNIL_NAO_ATUALIZADO;
  } catch (err) {
    console.error("[propostas] Valor do Funil não recalculado:", err instanceof Error ? err.message : err);
    return MSG_FUNIL_NAO_ATUALIZADO;
  }
}

// Todas as propostas ligadas a uma oportunidade (qualquer modelo), com a proposta do evento já na situação/valor novos. É a entrada da
// decisão pura (propostaFunil.ts): a soma de valores e o "ninguém mais ativo" dependem do conjunto inteiro, não só desta proposta.
async function propostasDaOportunidade(svc: Svc, oportunidadeId: string, atual: PropostaDoFunil): Promise<PropostaDoFunil[]> {
  const { data } = await svc.from("propostas").select("id, situacao, valor_estimado").eq("oportunidade_id", oportunidadeId);
  return [...(data ?? []).filter((x) => x.id !== atual.id), atual] as PropostaDoFunil[];
}

// Serviço de interesse é texto livre que o vendedor também edita: o que já estiver preenchido fica; só se preenche quando vazio.
const servicoVazio = (o: OportunidadeLinha) => !o.servico_interesse || !String(o.servico_interesse).trim();

// Marcar como enviada: usa a oportunidade DA PRÓPRIA proposta (propostas.oportunidade_id) enquanto ela estiver aberta; sem ela (ou se já
// fechou, sem reabrir) cai na oportunidade aberta da empresa, como sempre; sem nenhuma, cria uma. Move/atualiza ou cria e agenda o
// follow-up. O valor da oportunidade passa a ser a soma das propostas ativas dela. Qualquer falha desfaz o que foi feito aqui.
async function efeitoEnviada(
  svc: Svc, ctx: ContextoComercial, p: PropostaLinha, valor: number
): Promise<{ ok: true; efeito: EfeitoFunil } | { ok: false; status: number; error: string }> {
  if (!p.empresa_visitada_id) return falha(400, "A empresa desta proposta não está mais na Carteira.");
  const hoje = hojeSaoPaulo();
  const proximaEm = somarDiasUteis(hoje, FOLLOWUP_DIAS_UTEIS);
  const acao = textoFollowUp(p.numero);
  const servico = SERVICO_POR_MODELO[p.modelo as ModeloProposta];

  let aberta: OportunidadeLinha | null = null;
  if (p.oportunidade_id) {
    const { data: propria } = await svc.from("oportunidades").select("*").eq("id", p.oportunidade_id).maybeSingle();
    if (propria && ehAberta(propria.etapa)) aberta = propria;
  }
  if (!aberta) aberta = await buscarOportunidadeAberta(svc, p.empresa_visitada_id);
  if (aberta && aberta.vendedor_id !== ctx.analistaId) {
    return falha(409, (await mensagemOportunidadeAberta(svc, p.empresa_visitada_id)) ?? "Já existe uma oportunidade aberta para esta empresa.");
  }

  let oportunidade: OportunidadeLinha;
  let desfazerOportunidade: () => Promise<void>;
  if (aberta) {
    const aSerAtualizada: OportunidadeLinha = aberta;
    const todas = await propostasDaOportunidade(svc, aSerAtualizada.id, { id: p.id, situacao: "enviada", valor_estimado: valor });
    const decisao = decidirEfeitoFunil({ evento: { propostaId: p.id, para: "enviada" }, etapaAtual: aSerAtualizada.etapa, propostas: todas });
    const r = await atualizarOportunidade(svc, ctx.analistaId, aSerAtualizada, {
      ...(decisao.etapa ? { etapa: decisao.etapa } : {}),
      valor_estimado: decisao.valorEstimado ?? valor,
      ...(servicoVazio(aSerAtualizada) ? { servico_interesse: servico } : {}),
      // A próxima ação é sempre a da proposta enviada mais recente.
      proxima_acao: acao,
      proxima_acao_em: proximaEm,
    });
    if (!r.ok) return falha(r.status, r.error);
    oportunidade = r.data;
    desfazerOportunidade = async () => {
      await svc.from("oportunidades").update({
        etapa: aSerAtualizada.etapa, valor_estimado: aSerAtualizada.valor_estimado ?? null, servico_interesse: aSerAtualizada.servico_interesse ?? null,
        proxima_acao: aSerAtualizada.proxima_acao ?? null, proxima_acao_em: aSerAtualizada.proxima_acao_em ?? null, updated_at: aSerAtualizada.updated_at,
      }).eq("id", aSerAtualizada.id);
    };
  } else {
    // Só havia oportunidade ganha/perdida (ou nenhuma): abre uma nova, sem reabrir a antiga.
    const { data: empresa } = await svc.from("empresas_visitadas").select("cliente_id").eq("id", p.empresa_visitada_id).maybeSingle();
    const { data, error } = await svc.from("oportunidades").insert({
      unidade_id: p.unidade_id,
      vendedor_id: ctx.analistaId,
      empresa: p.cliente_nome,
      empresa_visitada_id: p.empresa_visitada_id,
      cliente_id: empresa?.cliente_id ?? null,
      contato_nome: p.aos_cuidados ?? null,
      origem: "outro",
      servico_interesse: servico,
      valor_estimado: valor,
      etapa: "proposta_enviada",
      proxima_acao: acao,
      proxima_acao_em: proximaEm,
    }).select().single();
    if (error || !data) {
      if (error?.code === "23505") return falha(409, (await mensagemOportunidadeAberta(svc, p.empresa_visitada_id)) ?? "Já existe uma oportunidade aberta para esta empresa.");
      return falha(500, `Não foi possível criar a oportunidade no Funil: ${error?.message ?? "sem retorno"}`);
    }
    oportunidade = data;
    // Deixa a origem visível no card do Funil. Só registra: se falhar não desfaz nada.
    const { error: origemErr } = await svc.from("oportunidade_interacoes").insert({
      oportunidade_id: data.id,
      autor_id: ctx.analistaId,
      tipo: "anotacao",
      descricao: `Oportunidade criada ao marcar a proposta ${p.numero} como enviada.`,
    });
    if (origemErr) console.error("[propostas] Anotação de origem da oportunidade não gravada:", origemErr.message);
    // As interações da oportunidade caem junto (oportunidade_interacoes.oportunidade_id é ON DELETE CASCADE).
    desfazerOportunidade = async () => {
      await svc.from("oportunidades").delete().eq("id", data.id);
    };
  }

  // Follow-up: reaproveita o pendente desta proposta (reenvio) ou cria um novo.
  const { data: pendente } = await svc
    .from("lembretes").select("id").eq("oportunidade_id", oportunidade.id).eq("tipo", "retorno").eq("status", "pendente").eq("texto", acao).maybeSingle();
  const agora = new Date().toISOString();
  const { error: lembErr } = pendente
    ? await svc.from("lembretes").update({ data_lembrete: proximaEm, updated_at: agora }).eq("id", pendente.id)
    : await svc.from("lembretes").insert({
        vendedor_id: ctx.analistaId,
        unidade_id: p.unidade_id,
        empresa_visitada_id: p.empresa_visitada_id,
        oportunidade_id: oportunidade.id,
        tipo: "retorno",
        data_lembrete: proximaEm,
        texto: acao,
        status: "pendente",
      });
  if (lembErr) {
    await desfazerOportunidade();
    return falha(500, `Não foi possível agendar o follow-up: ${lembErr.message}`);
  }
  return {
    ok: true,
    efeito: {
      oportunidadeId: oportunidade.id,
      desfazer: async () => {
        await cancelarFollowUp(svc, { ...p, oportunidade_id: oportunidade.id });
        await desfazerOportunidade();
      },
    },
  };
}

// Negociação, aceita e recusada acompanham a oportunidade DA PRÓPRIA proposta (propostas.oportunidade_id), se for do próprio vendedor.
// O que fazer com etapa e valor sai de decidirEfeitoFunil (regra de várias propostas na mesma oportunidade); aqui só se aplica.
async function efeitoAcompanhamento(
  svc: Svc, ctx: ContextoComercial, p: PropostaLinha, para: SituacaoProposta, d: z.infer<typeof propostaSituacaoSchema>, de?: SituacaoProposta
): Promise<{ ok: true; efeito: EfeitoFunil } | { ok: false; status: number; error: string }> {
  const nada: EfeitoFunil = { oportunidadeId: null, desfazer: async () => {} };
  if (!p.oportunidade_id) return { ok: true, efeito: nada };
  const { data: opp } = await svc.from("oportunidades").select("*").eq("id", p.oportunidade_id).maybeSingle();
  if (!opp) return { ok: true, efeito: nada };
  const atual: OportunidadeLinha = opp;
  // Cancelar nunca avisa nem mexe quando a oportunidade é de outro vendedor: o cancelamento sempre foi silencioso com o Funil.
  if (atual.vendedor_id !== ctx.analistaId && para === "cancelada") return { ok: true, efeito: nada };
  if (atual.vendedor_id !== ctx.analistaId) {
    return { ok: true, efeito: { ...nada, aviso: "A oportunidade aberta desta empresa é de outro vendedor e não foi alterada no Funil." } };
  }

  const todas = await propostasDaOportunidade(svc, atual.id, { id: p.id, situacao: para, valor_estimado: p.valor_estimado ?? null });
  const decisao = decidirEfeitoFunil({ evento: { propostaId: p.id, para, de }, etapaAtual: atual.etapa, propostas: todas });
  const valorMudou = decisao.valorEstimado !== undefined && Number(atual.valor_estimado) !== decisao.valorEstimado;
  // Oportunidade aberta sem próxima ação (legado) não pode travar a recusa/aceite só por causa do valor: aí o valor não é regravado.
  const valorSeguro = valorMudou && (decisao.etapa !== null || !ehAberta(atual.etapa) || (!!atual.proxima_acao && !!atual.proxima_acao_em));
  if (!decisao.etapa && !valorSeguro) return { ok: true, efeito: { ...nada, oportunidadeId: atual.id } };

  const r = await atualizarOportunidade(svc, ctx.analistaId, atual, {
    ...(decisao.etapa ? { etapa: decisao.etapa } : {}),
    ...(valorSeguro ? { valor_estimado: decisao.valorEstimado } : {}),
    ...(decisao.etapa === "ganho" && servicoVazio(atual) ? { servico_interesse: SERVICO_POR_MODELO[p.modelo as ModeloProposta] } : {}),
    // O motivo de perda obrigatório do Funil vem da recusa que FECHOU a oportunidade.
    ...(decisao.etapa === "perdido" ? { motivo_perda_categoria: d.motivo_perda_categoria, motivo_perda: d.motivo_perda ?? null } : {}),
  });
  if (!r.ok) return falha(r.status, r.error);
  return {
    ok: true,
    efeito: {
      oportunidadeId: atual.id,
      desfazer: async () => {
        await svc.from("oportunidades").update({
          etapa: atual.etapa, fechada_em: atual.fechada_em ?? null, motivo_perda: atual.motivo_perda ?? null,
          motivo_perda_categoria: atual.motivo_perda_categoria ?? null, valor_estimado: atual.valor_estimado ?? null,
          servico_interesse: atual.servico_interesse ?? null, updated_at: atual.updated_at,
        }).eq("id", atual.id);
        // Perda agenda um "reconectar": se a proposta voltar atrás, esse lembrete não faz mais sentido.
        const agora = new Date().toISOString();
        await svc.from("lembretes").update({ status: "cancelado", concluido_em: agora, updated_at: agora })
          .eq("oportunidade_id", atual.id).eq("tipo", "reconectar").eq("status", "pendente");
      },
    },
  };
}

export async function mudarSituacao(svc: Svc, ctx: ContextoPropostas, p: PropostaLinha, d: z.infer<typeof propostaSituacaoSchema>): Promise<Resultado<PropostaLinha>> {
  const para = d.para as SituacaoProposta;
  const de = p.situacao as SituacaoProposta;
  if (!SITUACOES_ESCOLHIDAS_PELO_VENDEDOR.includes(para)) {
    return falha(400, para === "vencida" ? "A situação Vencida é automática: a proposta vence sozinha ao passar da validade." : "Situação inválida.");
  }
  if (!podeTransicionar(de, para)) return falha(409, `Não é possível passar de ${ROTULO_SITUACAO[de]} para ${ROTULO_SITUACAO[para]}.`);

  // TS: marcar como enviada só depois de existir o PDF (etapa 2E): bloqueado, sem gravar nada (nem situação, nem Funil, nem revisão).
  if (para === "enviada" && p.modelo === "TS" && !PDF_TS_DISPONIVEL) return falha(409, MSG_PDF_TS_INDISPONIVEL);

  // Data de emissão/validade do envio (a mesma do snapshot e da reserva abaixo).
  const hoje = hojeSaoPaulo();
  // R&S: o valor vem do vendedor (como sempre). MOT: o valor é calculado pelo servidor (soma dos valores mensais das funções, a partir dos percentuais
  // vigentes) e o que o cliente mandar é ignorado: ninguém digita o valor de uma proposta cujo preço sai da planilha.
  let valorEnvio = d.valor_estimado;
  let snapMotEnvio: SnapshotMot | SnapshotTs | null = null;
  if (para === "enviada" && p.modelo === "MOT") {
    const s = await snapshotMotDaProposta(svc, p, await dadosDoVendedor(svc, p.vendedor_id), p.revisao_atual, hoje, calcularValidadeAte(hoje, p.validade_dias));
    if (!s.ok) return s;
    snapMotEnvio = s.data;
    valorEnvio = s.data.total_mensal_centavos / 100;
  } else if (para === "enviada" && p.modelo === "TS") {
    // Pronto para a 2E (quando PDF_TS_DISPONIVEL virar true): o valor também é calculado pelo servidor e o snapshot da Rev. 0 congela os percentuais.
    const s = await snapshotTsDaProposta(svc, ctx, p, p.conteudo, await dadosDoVendedor(svc, p.vendedor_id), p.revisao_atual, hoje, calcularValidadeAte(hoje, p.validade_dias));
    if (!s.ok) return s;
    snapMotEnvio = s.data.snapshot;
    valorEnvio = s.data.snapshot.total_mensal_centavos / 100;
  }
  if (para === "enviada" && !(valorEnvio != null && valorEnvio > 0)) return falha(400, "Informe o valor estimado (maior que zero) para marcar como enviada.");
  // O motivo da recusa é opcional na proposta; se a categoria "outro" foi escolhida, o texto continua obrigatório.
  // Com Funil e oportunidade própria aberta, quem exige o motivo é o "perdido" do Funil (atualizarOportunidade).
  if (para === "recusada" && d.motivo_perda_categoria === "outro" && !d.motivo_perda?.trim()) return falha(400, "Descreva o motivo, já que você escolheu \"Outro motivo\".");

  // 1) Reserva a mudança (condicional à situação e à versão lidas): quem chegar depois recebe 409.
  const agora = new Date().toISOString();
  const campos: Record<string, unknown> = { situacao: para, updated_at: agora };
  let validadeAte: string | null = null;
  if (para === "enviada") {
    validadeAte = calcularValidadeAte(hoje, p.validade_dias);
    Object.assign(campos, { enviada_em: agora, validade_ate: validadeAte, valor_estimado: valorEnvio });
  }
  const { data: reservada } = await svc.from("propostas").update(campos).eq("id", p.id).eq("situacao", de).eq("updated_at", p.updated_at).select().maybeSingle();
  if (!reservada) return falha(409, "A proposta foi alterada desde que você a abriu. Recarregue e tente de novo.");

  const reverter = async () => {
    await svc.from("propostas").update({
      situacao: de, enviada_em: p.enviada_em ?? null, validade_ate: p.validade_ate ?? null, valor_estimado: p.valor_estimado ?? null,
      oportunidade_id: p.oportunidade_id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", p.id).eq("situacao", para);
  };

  // 2) Funil e follow-up. Se falhar, a proposta volta ao que era (nunca fica "enviada" sem follow-up/oportunidade).
  // Sem Funil (acesso só por liberação) a proposta apenas se registra: nada de oportunidade, interação ou lembrete.
  // Proposta de teste não dispara efeito no Funil (nem oportunidade, nem follow-up): decisão do Ölver.
  const comFunil = ctx.temFunil && p.teste !== true;
  let efeito: EfeitoFunil = { oportunidadeId: null, desfazer: async () => {} };
  // Cancelar proposta que estava ATIVA recalcula só o valor da oportunidade (soma das ativas que restaram); cancelar rascunho não mexe no Funil.
  const cancelaAtiva = para === "cancelada" && (de === "enviada" || de === "em_negociacao");
  if (comFunil && (para === "enviada" || para === "em_negociacao" || para === "aceita" || para === "recusada" || cancelaAtiva)) {
    const r = para === "enviada" ? await efeitoEnviada(svc, ctx, p, valorEnvio as number) : await efeitoAcompanhamento(svc, ctx, p, para, d, de);
    if (!r.ok) {
      await reverter();
      return falha(r.status, r.error);
    }
    efeito = r.efeito;
  }

  let atual = reservada;
  if (para === "enviada") {
    // 3) Liga a oportunidade e grava a Rev. 0 (snapshot do momento do clique). Falha aqui desfaz tudo: nada imutável foi gravado antes.
    // Sem Funil, o vínculo que a proposta já tinha (de quando o autor tinha Funil) não é sobrescrito.
    const oportunidadeId = comFunil ? efeito.oportunidadeId : (p.oportunidade_id ?? null);
    const { data: ligada } = await svc.from("propostas").update({ oportunidade_id: oportunidadeId }).eq("id", p.id).select().maybeSingle();
    const vendedor = await dadosDoVendedor(svc, p.vendedor_id);
    const { error } = ligada
      ? await svc.from("proposta_revisoes").insert({
          proposta_id: p.id,
          revisao: reservada.revisao_atual,
          conteudo: snapMotEnvio ?? snapshotDa(ligada, vendedor, reservada.revisao_atual, hoje, validadeAte as string),
          template_versao: reservada.template_versao,
          vendedor_nome: vendedor.nome,
          vendedor_telefone: vendedor.telefone,
          criado_por: ctx.analistaId,
        })
      : { error: { message: "proposta não encontrada ao ligar a oportunidade" } };
    if (error) {
      await efeito.desfazer();
      await reverter();
      return falha(500, `Não foi possível registrar a revisão inicial: ${error.message}`);
    }
    atual = ligada as PropostaLinha;
  } else if (comFunil && (para === "aceita" || para === "recusada" || para === "cancelada")) {
    // Vencida/cancelada não mexem no Funil, só no follow-up pendente desta proposta.
    const ok = await cancelarFollowUp(svc, p);
    if (!ok) efeito.aviso = "A proposta mudou de situação, mas o lembrete de follow-up não pôde ser cancelado.";
  }

  const observacao = para === "recusada" && d.motivo_perda_categoria
    ? `Motivo: ${ROTULO_MOTIVO_PERDA[d.motivo_perda_categoria as string] ?? d.motivo_perda_categoria}${d.motivo_perda?.trim() ? ` (${d.motivo_perda.trim()})` : ""}${d.observacao ? ` — ${d.observacao}` : ""}`
    : d.observacao ?? null;
  const gravou = await registrarHistorico(svc, { proposta_id: p.id, de, para, autor_id: ctx.analistaId, observacao });
  const aviso = efeito.aviso ?? (gravou ? undefined : "A situação foi alterada, mas o histórico não pôde ser gravado.");
  return { ok: true, data: atual, aviso };
}

// ── Prévia do cálculo do MOT (não grava nada) ───────────────────────────────────────────────────────────────────────────────────
// Quem pode escrever em Propostas vê o cálculo da função enquanto preenche. Usa os percentuais vigentes HOJE (a mesma leitura da criação/envio) e a mesma
// montarSnapshotMot; sem percentuais vigentes devolve o mesmo 409 do servidor. Os percentuais não saem: só os valores de cada linha.
export async function previaMot(svc: Svc, ctx: ContextoPropostas, salarios: (number | null)[]): Promise<Resultado<PreviaMot>> {
  if (!ctx.podeEscrever) return falha(403, MSG_SO_ACOMPANHA_PROPOSTAS);
  const par = await parametrosMotVigentes(svc, hojeSaoPaulo());
  if (!par.ok) return par;
  try {
    return { ok: true, data: montarPreviaMot(salarios, par.data) };
  } catch (err) {
    console.error("[propostas] Prévia do MOT não calculada:", err instanceof Error ? err.message : err);
    return falha(400, "Não foi possível calcular com os salários informados. Confira os valores.");
  }
}

// Planilha mostrada no detalhe de uma proposta MOT (sem percentuais). Rascunho (ou proposta que nunca foi enviada): calculada com os percentuais vigentes HOJE,
// como será no envio. Proposta com revisão gravada: o snapshot da revisão atual, exatamente como foi enviado (nunca recalcula).
export interface PlanilhaMotDetalhe {
  origem: "hoje" | "revisao";
  previa: PreviaMot | null;
  erro: string | null;
}
export async function planilhaMotDaProposta(svc: Svc, p: PropostaLinha): Promise<PlanilhaMotDetalhe> {
  if (p.situacao !== "rascunho") {
    const { data: rev } = await svc.from("proposta_revisoes").select("conteudo").eq("proposta_id", p.id).eq("revisao", p.revisao_atual).maybeSingle();
    if (rev) {
      const s = snapshotMotSchema.safeParse(rev.conteudo);
      if (!s.success) return { origem: "revisao", previa: null, erro: "Não foi possível ler a planilha desta revisão." };
      return { origem: "revisao", previa: previaDeSnapshotMot(s.data), erro: null };
    }
  }
  const par = await parametrosMotVigentes(svc, hojeSaoPaulo());
  if (!par.ok) return { origem: "hoje", previa: null, erro: par.error };
  try {
    const funcoes = ((p.conteudo as { funcoes?: { salario_centavos?: unknown }[] } | null)?.funcoes ?? []).map((f) => (typeof f.salario_centavos === "number" ? f.salario_centavos : null));
    return { origem: "hoje", previa: montarPreviaMot(funcoes, par.data), erro: null };
  } catch {
    return { origem: "hoje", previa: null, erro: "Não foi possível calcular a planilha desta proposta." };
  }
}

// ── Prévia e detalhe do TS ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// A prévia mostra o cálculo enquanto o gestor preenche, SEM gravar nada: o servidor aplica as mesmas regras da criação (privilégios, preço configurado) e devolve só
// valores (sem percentuais; a margem real em pontos-base só para o gestor), mais quais serviços ficaram abaixo da margem mínima.
export interface PreviaTs {
  planilha: PlanilhaTsTela;
  // Só para o gestor/diretoria: o vendedor nunca recebe nada que revele a margem mínima (abaixo dela ele recebe o MESMO bloqueio da criação, 422).
  margem?: { abaixo: number[]; exige_justificativa: boolean };
}
export async function previaTs(svc: Svc, ctx: ContextoPropostas, conteudoBruto: unknown): Promise<Resultado<PreviaTs>> {
  if (!ctx.podeEscrever) return falha(403, MSG_SO_ACOMPANHA_PROPOSTAS);
  // Sem empresa escolhida a prévia vale para quem poderia criar TS de teste (gestor) ou pela chave do harness.
  const contexto = { gestor: ctx.gestor, teste: true };
  if (!modeloDisponivel("TS", contexto)) return falha(400, MENSAGEM_MODELO_INDISPONIVEL);
  const v = validarConteudo("TS", conteudoBruto, contexto);
  if (!v.ok) return falha(400, v.error);
  const conteudo = v.data as ConteudoTs;
  const privilegios = exigirPrivilegiosTs(ctx, conteudo, null);
  if (!privilegios.ok) return privilegios;
  const hoje = hojeSaoPaulo();
  const par = await parametrosTsVigentes(svc, hoje);
  if (!par.ok) return par;
  const av = avaliarPrecoTs(conteudo, par.data);
  if (!av.ok) return falha(av.status, av.error);
  if (!ctx.gestor) {
    const m = avaliarMargemTs({ abaixoMargem: av.abaixoMargem, nomesServicos: conteudo.servicos.map((x) => x.nome), gestor: false, justificativa: null });
    if (!m.ok) return falha(m.status, m.error);
  }
  try {
    const snap = montarSnapshot({
      modelo: "TS", numero: "PREVIA", revisao: 0, templateVersao: 1, dataEmissao: "2000-01-01", validadeDias: 1, validadeAte: "2000-01-02", clienteNome: "Prévia", aosCuidados: null,
      conteudo, vendedorNome: "Prévia", vendedorTelefone: null, parametrosTs: par.data, liberacaoMargemTs: null,
    });
    return { ok: true, data: { planilha: planilhaTsDeSnapshot(snap, ctx.gestor), ...(ctx.gestor ? { margem: { abaixo: av.abaixoMargem, exige_justificativa: av.abaixoMargem.length > 0 } } : {}) } };
  } catch (err) {
    console.error("[propostas] Prévia do TS não calculada:", err instanceof Error ? err.message : err);
    return falha(400, "Não foi possível calcular com os dados informados. Confira os valores.");
  }
}

// Planilha mostrada no detalhe de uma proposta TS. Rascunho (ou proposta que nunca foi enviada): calculada com os percentuais vigentes HOJE, como será no envio.
// Proposta com revisão gravada: o snapshot da revisão atual, exatamente como foi gravado (nunca recalcula: mudar os percentuais depois não altera o que já foi enviado).
export interface PlanilhaTsDetalhe {
  origem: "hoje" | "revisao";
  planilha: PlanilhaTsTela | null;
  erro: string | null;
}
export async function planilhaTsDaProposta(svc: Svc, ctx: ContextoPropostas, p: PropostaLinha): Promise<PlanilhaTsDetalhe> {
  if (p.situacao !== "rascunho") {
    const { data: rev } = await svc.from("proposta_revisoes").select("conteudo").eq("proposta_id", p.id).eq("revisao", p.revisao_atual).maybeSingle();
    if (rev) {
      const s = snapshotTsSchema.safeParse(rev.conteudo);
      if (!s.success) return { origem: "revisao", planilha: null, erro: "Não foi possível ler a planilha desta revisão." };
      return { origem: "revisao", planilha: planilhaTsDeSnapshot(s.data, ctx.gestor), erro: null };
    }
  }
  const c = conteudoTsSchema.safeParse(p.conteudo ?? {});
  if (!c.success) return { origem: "hoje", planilha: null, erro: mensagemErroConteudoTs(c.error.issues) };
  const par = await parametrosTsVigentes(svc, hojeSaoPaulo());
  if (!par.ok) return { origem: "hoje", planilha: null, erro: par.error };
  const av = avaliarPrecoTs(c.data, par.data);
  if (!av.ok) return { origem: "hoje", planilha: null, erro: av.error };
  try {
    const snap = montarSnapshot({
      modelo: "TS", numero: p.numero, revisao: 0, templateVersao: p.template_versao, dataEmissao: "2000-01-01", validadeDias: 1, validadeAte: "2000-01-02", clienteNome: p.cliente_nome,
      aosCuidados: null, conteudo: c.data, vendedorNome: "Prévia", vendedorTelefone: null, parametrosTs: par.data, liberacaoMargemTs: null,
    });
    return { origem: "hoje", planilha: planilhaTsDeSnapshot(snap, ctx.gestor), erro: null };
  } catch {
    return { origem: "hoje", planilha: null, erro: "Não foi possível calcular a planilha desta proposta." };
  }
}
