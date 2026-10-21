import type { z } from "zod";
import type { createServiceClient } from "@/lib/supabase/server";
import type { propostaCreateSchema, propostaSituacaoSchema, propostaUpdateSchema } from "@/lib/schemas";
import { hojeSaoPaulo, mensagemOportunidadeAberta, type ContextoComercial } from "@/lib/comercial";
import { ROTULO_MOTIVO_PERDA } from "@/lib/comercialRotulos";
import { atualizarOportunidade, type OportunidadeLinha } from "@/lib/oportunidadeEtapa";
import {
  FOLLOWUP_DIAS_UTEIS, ROTULO_SITUACAO, SERVICO_POR_MODELO, SITUACOES_ESCOLHIDAS_PELO_VENDEDOR, VALIDADE_PADRAO_DIAS,
  calcularValidadeAte, etapaAposSituacao, modeloDisponivel, modoEdicao, podeTransicionar, somarDiasUteis, textoFollowUp,
  type ModeloProposta, type SituacaoProposta,
} from "@/lib/propostas";
import { MENSAGEM_MODELO_INDISPONIVEL, MODELOS_PROPOSTA, montarSnapshot, validarConteudo, type SnapshotProposta } from "@/lib/propostaModelos";

type Svc = ReturnType<typeof createServiceClient>;
// Linha de `propostas` (select "*"): lida sem tipagem própria, como as demais linhas do Comercial.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PropostaLinha = Record<string, any>;

export type Resultado<T> = { ok: true; data: T; aviso?: string } | { ok: false; status: number; error: string };
const falha = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

// Toda escrita roda com o service role (o papel authenticated só lê): o dono é conferido aqui, em código.
export function ehDonoDaProposta(ctx: ContextoComercial, p: PropostaLinha): boolean {
  return ctx.vendedor && p.vendedor_id === ctx.analistaId;
}

// Leitura: o vendedor vê as próprias; o gestor vê as da sua unidade (ou todas, com acesso a todas as unidades).
export function podeVerProposta(ctx: ContextoComercial, p: PropostaLinha): boolean {
  if (ehDonoDaProposta(ctx, p)) return true;
  if (!ctx.gestor) return false;
  return ctx.todasUnidades || !ctx.unidadeId || p.unidade_id === ctx.unidadeId;
}

export async function carregarProposta(svc: Svc, id: string): Promise<PropostaLinha | null> {
  const { data } = await svc.from("propostas").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

async function dadosDoVendedor(svc: Svc, vendedorId: string): Promise<{ nome: string; telefone: string | null }> {
  const { data } = await svc.from("analistas_perfil").select("nome_completo, telefone").eq("id", vendedorId).maybeSingle();
  return { nome: data?.nome_completo ?? "", telefone: data?.telefone ?? null };
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

function snapshotDa(p: PropostaLinha, vendedor: { nome: string; telefone: string | null }, revisao: number, emissao: string, validadeAte: string): SnapshotProposta {
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
  });
}

// Rascunho: o PDF usa o conteúdo atual, com hoje como emissão. Proposta enviada: o snapshot da revisão pedida
// (ou da atual); reabrir uma revisão antiga nunca depende de dados vivos.
export async function snapshotParaPdf(svc: Svc, p: PropostaLinha, revisao: number | null): Promise<Resultado<SnapshotProposta>> {
  if (p.situacao === "rascunho" && revisao === null) {
    const hoje = hojeSaoPaulo();
    const vendedor = await dadosDoVendedor(svc, p.vendedor_id);
    return { ok: true, data: snapshotDa(p, vendedor, 0, hoje, calcularValidadeAte(hoje, p.validade_dias)) };
  }
  const alvo = revisao ?? p.revisao_atual;
  const { data: rev } = await svc.from("proposta_revisoes").select("conteudo").eq("proposta_id", p.id).eq("revisao", alvo).maybeSingle();
  if (!rev) return falha(404, "Revisão não encontrada.");
  return { ok: true, data: rev.conteudo as SnapshotProposta };
}

// ── Criar rascunho ───────────────────────────────────────────────────────────

export async function criarRascunho(svc: Svc, ctx: ContextoComercial, d: z.infer<typeof propostaCreateSchema>): Promise<Resultado<PropostaLinha>> {
  if (!ctx.vendedor) return falha(403, "Seu perfil só acompanha as propostas, não cria.");
  if (!ctx.unidadeId) return falha(400, "Seu perfil não tem unidade definida.");
  if (!modeloDisponivel(d.modelo)) return falha(400, MENSAGEM_MODELO_INDISPONIVEL);
  const conteudo = validarConteudo(d.modelo, d.conteudo);
  if (!conteudo.ok) return falha(400, conteudo.error);

  const { data: empresa } = await svc.from("empresas_visitadas").select("id, nome, cliente_id, unidade_id").eq("id", d.empresa_visitada_id).maybeSingle();
  if (!empresa || empresa.unidade_id !== ctx.unidadeId) return falha(404, "Empresa não encontrada na Carteira da sua unidade.");

  let contatoNome: string | null = null;
  if (d.contato_id) {
    const c = await resolverContato(svc, d.contato_id, empresa.id);
    if (!c.ok) return falha(400, c.error);
    contatoNome = c.nome;
  }

  // Aviso (não bloqueia): outra pessoa já tem oportunidade aberta nesta empresa. Só será barrado ao marcar como enviada.
  const aberta = await buscarOportunidadeAberta(svc, empresa.id);
  const aviso = aberta && aberta.vendedor_id !== ctx.analistaId ? (await mensagemOportunidadeAberta(svc, empresa.id)) ?? undefined : undefined;

  const { data, error } = await svc.rpc("criar_proposta", {
    p_modelo: d.modelo,
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
  return { ok: true, data, aviso };
}

// ── Editar ───────────────────────────────────────────────────────────────────

export async function editarProposta(svc: Svc, ctx: ContextoComercial, p: PropostaLinha, d: z.infer<typeof propostaUpdateSchema>): Promise<Resultado<PropostaLinha>> {
  const modo = modoEdicao(p.situacao as SituacaoProposta);
  if (!modo) return falha(409, `Uma proposta ${ROTULO_SITUACAO[p.situacao as SituacaoProposta].toLowerCase()} não pode mais ser editada.`);
  if (d.updated_at !== p.updated_at) return falha(409, "A proposta foi alterada desde que você a abriu. Recarregue e tente de novo.");

  let conteudo = p.conteudo;
  if (d.conteudo !== undefined) {
    const v = validarConteudo(p.modelo, d.conteudo);
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

  if (modo === "rascunho") {
    const { data } = await svc.from("propostas").update(campos).eq("id", p.id).eq("updated_at", p.updated_at).eq("situacao", "rascunho").select().maybeSingle();
    if (!data) return falha(409, "A proposta foi alterada desde que você a abriu. Recarregue e tente de novo.");
    return { ok: true, data };
  }

  // Proposta já entregue: nova revisão (mesmo número). A revisão anterior continua intacta; a validade recomeça de hoje.
  const hoje = hojeSaoPaulo();
  const novaRevisao = (p.revisao_atual as number) + 1;
  const validadeAte = calcularValidadeAte(hoje, validadeDias);
  const { data: atualizada } = await svc
    .from("propostas")
    .update({ ...campos, revisao_atual: novaRevisao, validade_ate: validadeAte })
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
    conteudo: snapshotDa(atualizada, vendedor, novaRevisao, hoje, validadeAte),
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
      })
      .eq("id", p.id)
      .eq("updated_at", atualizada.updated_at);
    return error.code === "23505" ? falha(409, "Outra revisão acabou de ser criada. Recarregue e tente de novo.") : falha(500, `Não foi possível criar a revisão: ${error.message}`);
  }
  await registrarHistorico(svc, { proposta_id: p.id, de: p.situacao, para: p.situacao, autor_id: ctx.analistaId, observacao: `Revisão ${novaRevisao} emitida.` });
  return { ok: true, data: atualizada };
}

// ── Mudar situação ───────────────────────────────────────────────────────────

interface EfeitoFunil {
  oportunidadeId: string | null;
  aviso?: string;
  desfazer: () => Promise<void>;
}

// Marcar como enviada: acha a oportunidade ABERTA da empresa (não confia só no oportunidade_id da proposta),
// move/atualiza ou cria, e agenda o follow-up. Qualquer falha desfaz o que foi feito aqui.
async function efeitoEnviada(
  svc: Svc, ctx: ContextoComercial, p: PropostaLinha, valor: number
): Promise<{ ok: true; efeito: EfeitoFunil } | { ok: false; status: number; error: string }> {
  if (!p.empresa_visitada_id) return falha(400, "A empresa desta proposta não está mais na Carteira.");
  const hoje = hojeSaoPaulo();
  const proximaEm = somarDiasUteis(hoje, FOLLOWUP_DIAS_UTEIS);
  const acao = textoFollowUp(p.numero);
  const servico = SERVICO_POR_MODELO[p.modelo as ModeloProposta];

  const aberta = await buscarOportunidadeAberta(svc, p.empresa_visitada_id);
  if (aberta && aberta.vendedor_id !== ctx.analistaId) {
    return falha(409, (await mensagemOportunidadeAberta(svc, p.empresa_visitada_id)) ?? "Já existe uma oportunidade aberta para esta empresa.");
  }

  let oportunidade: OportunidadeLinha;
  let desfazerOportunidade: () => Promise<void>;
  if (aberta) {
    const etapaAlvo = etapaAposSituacao("enviada", aberta.etapa);
    const r = await atualizarOportunidade(svc, ctx.analistaId, aberta, {
      ...(etapaAlvo ? { etapa: etapaAlvo } : {}),
      valor_estimado: valor,
      servico_interesse: servico,
      proxima_acao: acao,
      proxima_acao_em: proximaEm,
    });
    if (!r.ok) return falha(r.status, r.error);
    oportunidade = r.data;
    desfazerOportunidade = async () => {
      await svc.from("oportunidades").update({
        etapa: aberta.etapa, valor_estimado: aberta.valor_estimado ?? null, servico_interesse: aberta.servico_interesse ?? null,
        proxima_acao: aberta.proxima_acao ?? null, proxima_acao_em: aberta.proxima_acao_em ?? null, updated_at: aberta.updated_at,
      }).eq("id", aberta.id);
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

// Negociação, aceita e recusada acompanham a oportunidade aberta da empresa, se for do próprio vendedor.
async function efeitoAcompanhamento(
  svc: Svc, ctx: ContextoComercial, p: PropostaLinha, para: SituacaoProposta, d: z.infer<typeof propostaSituacaoSchema>
): Promise<{ ok: true; efeito: EfeitoFunil } | { ok: false; status: number; error: string }> {
  const nada: EfeitoFunil = { oportunidadeId: null, desfazer: async () => {} };
  if (!p.empresa_visitada_id) return { ok: true, efeito: nada };
  const aberta = await buscarOportunidadeAberta(svc, p.empresa_visitada_id);
  if (!aberta) return { ok: true, efeito: nada };
  if (aberta.vendedor_id !== ctx.analistaId) {
    return { ok: true, efeito: { ...nada, aviso: "A oportunidade aberta desta empresa é de outro vendedor e não foi alterada no Funil." } };
  }
  const etapa = etapaAposSituacao(para, aberta.etapa);
  if (!etapa) return { ok: true, efeito: { ...nada, oportunidadeId: aberta.id } };

  const r = await atualizarOportunidade(svc, ctx.analistaId, aberta, {
    etapa,
    ...(etapa === "ganho" && !(Number(aberta.valor_estimado) > 0) ? { valor_estimado: p.valor_estimado ?? undefined } : {}),
    ...(etapa === "ganho" && !aberta.servico_interesse ? { servico_interesse: SERVICO_POR_MODELO[p.modelo as ModeloProposta] } : {}),
    ...(etapa === "perdido" ? { motivo_perda_categoria: d.motivo_perda_categoria, motivo_perda: d.motivo_perda ?? null } : {}),
  });
  if (!r.ok) return falha(r.status, r.error);
  return {
    ok: true,
    efeito: {
      oportunidadeId: aberta.id,
      desfazer: async () => {
        await svc.from("oportunidades").update({
          etapa: aberta.etapa, fechada_em: aberta.fechada_em ?? null, motivo_perda: aberta.motivo_perda ?? null,
          motivo_perda_categoria: aberta.motivo_perda_categoria ?? null, valor_estimado: aberta.valor_estimado ?? null,
          servico_interesse: aberta.servico_interesse ?? null, updated_at: aberta.updated_at,
        }).eq("id", aberta.id);
        // Perda agenda um "reconectar": se a proposta voltar atrás, esse lembrete não faz mais sentido.
        const agora = new Date().toISOString();
        await svc.from("lembretes").update({ status: "cancelado", concluido_em: agora, updated_at: agora })
          .eq("oportunidade_id", aberta.id).eq("tipo", "reconectar").eq("status", "pendente");
      },
    },
  };
}

export async function mudarSituacao(svc: Svc, ctx: ContextoComercial, p: PropostaLinha, d: z.infer<typeof propostaSituacaoSchema>): Promise<Resultado<PropostaLinha>> {
  const para = d.para as SituacaoProposta;
  const de = p.situacao as SituacaoProposta;
  if (!SITUACOES_ESCOLHIDAS_PELO_VENDEDOR.includes(para)) {
    return falha(400, para === "vencida" ? "A situação Vencida é automática: a proposta vence sozinha ao passar da validade." : "Situação inválida.");
  }
  if (!podeTransicionar(de, para)) return falha(409, `Não é possível passar de ${ROTULO_SITUACAO[de]} para ${ROTULO_SITUACAO[para]}.`);

  if (para === "enviada" && !(d.valor_estimado != null && d.valor_estimado > 0)) return falha(400, "Informe o valor estimado (maior que zero) para marcar como enviada.");
  if (para === "recusada") {
    if (!d.motivo_perda_categoria) return falha(400, "Escolha o motivo de a proposta não ter sido aceita.");
    if (d.motivo_perda_categoria === "outro" && !d.motivo_perda?.trim()) return falha(400, "Descreva o motivo, já que você escolheu \"Outro motivo\".");
  }

  // 1) Reserva a mudança (condicional à situação e à versão lidas): quem chegar depois recebe 409.
  const hoje = hojeSaoPaulo();
  const agora = new Date().toISOString();
  const campos: Record<string, unknown> = { situacao: para, updated_at: agora };
  let validadeAte: string | null = null;
  if (para === "enviada") {
    validadeAte = calcularValidadeAte(hoje, p.validade_dias);
    Object.assign(campos, { enviada_em: agora, validade_ate: validadeAte, valor_estimado: d.valor_estimado });
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
  let efeito: EfeitoFunil = { oportunidadeId: null, desfazer: async () => {} };
  if (para === "enviada" || para === "em_negociacao" || para === "aceita" || para === "recusada") {
    const r = para === "enviada" ? await efeitoEnviada(svc, ctx, p, d.valor_estimado as number) : await efeitoAcompanhamento(svc, ctx, p, para, d);
    if (!r.ok) {
      await reverter();
      return falha(r.status, r.error);
    }
    efeito = r.efeito;
  }

  let atual = reservada;
  if (para === "enviada") {
    // 3) Liga a oportunidade e grava a Rev. 0 (snapshot do momento do clique). Falha aqui desfaz tudo: nada imutável foi gravado antes.
    const { data: ligada } = await svc.from("propostas").update({ oportunidade_id: efeito.oportunidadeId }).eq("id", p.id).select().maybeSingle();
    const vendedor = await dadosDoVendedor(svc, p.vendedor_id);
    const { error } = ligada
      ? await svc.from("proposta_revisoes").insert({
          proposta_id: p.id,
          revisao: reservada.revisao_atual,
          conteudo: snapshotDa(ligada, vendedor, reservada.revisao_atual, hoje, validadeAte as string),
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
  } else if (para === "aceita" || para === "recusada" || para === "cancelada") {
    // Vencida/cancelada não mexem no Funil, só no follow-up pendente desta proposta.
    const ok = await cancelarFollowUp(svc, p);
    if (!ok) efeito.aviso = "A proposta mudou de situação, mas o lembrete de follow-up não pôde ser cancelado.";
  }

  const observacao = para === "recusada"
    ? `Motivo: ${ROTULO_MOTIVO_PERDA[d.motivo_perda_categoria as string] ?? d.motivo_perda_categoria}${d.motivo_perda?.trim() ? ` (${d.motivo_perda.trim()})` : ""}${d.observacao ? ` — ${d.observacao}` : ""}`
    : d.observacao ?? null;
  const gravou = await registrarHistorico(svc, { proposta_id: p.id, de, para, autor_id: ctx.analistaId, observacao });
  const aviso = efeito.aviso ?? (gravou ? undefined : "A situação foi alterada, mas o histórico não pôde ser gravado.");
  return { ok: true, data: atual, aviso };
}
