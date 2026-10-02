import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeUpdateSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo, somarDias, mensagemOportunidadeAberta } from "@/lib/comercial";
import { ehAberta, rotuloEtapa, ROTULO_MOTIVO_PERDA } from "@/lib/comercialRotulos";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const { data: atual } = await svc.from("oportunidades").select("*").eq("id", id).maybeSingle();
  if (!atual) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  // Só o próprio vendedor edita (gestor apenas lê).
  if (!ctx.vendedor || atual.vendedor_id !== ctx.analistaId) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const parsed = parseBody(oportunidadeUpdateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const novaEtapa = d.etapa ?? atual.etapa;
  const aberta = ehAberta(novaEtapa);
  const proximaAcao = d.proxima_acao ?? atual.proxima_acao;
  const proximaEm = d.proxima_acao_em ?? atual.proxima_acao_em;

  if (aberta && (!proximaAcao || !proximaEm)) {
    return NextResponse.json({ error: "Informe a próxima ação e a data." }, { status: 400 });
  }
  const motivoPerda = d.motivo_perda ?? atual.motivo_perda;
  const categoriaPerda = d.motivo_perda_categoria ?? atual.motivo_perda_categoria ?? null;

  // Valor e serviço só passam a ser exigidos a partir de "Proposta enviada" (e na venda fechada).
  if (d.etapa === "proposta_enviada" || d.etapa === "ganho") {
    const valor = d.valor_estimado !== undefined ? d.valor_estimado : atual.valor_estimado;
    const servico = d.servico_interesse !== undefined ? d.servico_interesse : atual.servico_interesse;
    if (valor == null || !(Number(valor) > 0)) {
      return NextResponse.json({ error: "Informe o valor estimado (maior que zero) para avançar para esta fase." }, { status: 400 });
    }
    if (!servico || !String(servico).trim()) {
      return NextResponse.json({ error: "Informe o serviço de interesse para avançar para esta fase." }, { status: 400 });
    }
  }
  if (d.etapa === "perdido") {
    if (!categoriaPerda) {
      return NextResponse.json({ error: "Escolha o motivo de a oportunidade não ter avançado desta vez." }, { status: 400 });
    }
    if (categoriaPerda === "outro" && !motivoPerda?.trim()) {
      return NextResponse.json({ error: "Descreva o motivo, já que você escolheu \"Outro motivo\"." }, { status: 400 });
    }
  }

  // "Não desta vez" agenda um lembrete de reconexão: padrão hoje + 90 dias, nunca no passado.
  let reconectarEm: string | null = null;
  if (d.etapa === "perdido") {
    const hoje = hojeSaoPaulo();
    reconectarEm = d.reconectar_em ?? somarDias(hoje, 90);
    if (reconectarEm < hoje) {
      return NextResponse.json({ error: "A data para reconectar não pode ser no passado." }, { status: 400 });
    }
  }

  // Contato: precisa ser da mesma empresa da oportunidade. Os campos contato_* da oportunidade são
  // um snapshot do contato escolhido; contato nulo limpa tudo.
  let contatoEscolhido: { id: string; nome: string; telefone: string | null; email: string | null } | null = null;
  if (d.contato_id) {
    const { data: c } = await svc
      .from("empresa_contatos")
      .select("id, nome, telefone, email, empresa_visitada_id")
      .eq("id", d.contato_id)
      .maybeSingle();
    if (!c || !atual.empresa_visitada_id || c.empresa_visitada_id !== atual.empresa_visitada_id) {
      return NextResponse.json({ error: "Esse contato não pertence à empresa da oportunidade." }, { status: 400 });
    }
    contatoEscolhido = c;
  }

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["proxima_acao", "proxima_acao_em", "valor_estimado", "servico_interesse", "contato_nome", "contato_telefone", "contato_email"] as const) {
    if (d[k] !== undefined) campos[k] = d[k] === "" ? null : d[k];
  }
  if (d.contato_id !== undefined) {
    campos.contato_id = contatoEscolhido?.id ?? null;
    campos.contato_nome = contatoEscolhido?.nome ?? null;
    campos.contato_telefone = contatoEscolhido?.telefone ?? null;
    campos.contato_email = contatoEscolhido?.email ?? null;
  }
  if (d.etapa) {
    campos.etapa = d.etapa;
    if (d.etapa === "ganho" || d.etapa === "perdido") {
      campos.fechada_em = atual.fechada_em ?? new Date().toISOString();
      campos.motivo_perda = d.etapa === "perdido" ? motivoPerda?.trim() || null : null;
      campos.motivo_perda_categoria = d.etapa === "perdido" ? categoriaPerda : null;
    } else {
      // Reabrir (ganho/perdido → fase aberta) limpa tudo que era do resultado final.
      campos.fechada_em = null;
      campos.motivo_perda = null;
      campos.motivo_perda_categoria = null;
    }
  }

  const { data, error } = await svc.from("oportunidades").update(campos).eq("id", id).select().single();
  if (error) {
    // Reabrir esbarrou no índice de uma-aberta-por-empresa.
    if (error.code === "23505") {
      const msg = (atual.empresa_visitada_id ? await mensagemOportunidadeAberta(svc, atual.empresa_visitada_id, id) : null)
        ?? "Já existe uma oportunidade aberta para esta empresa.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const agora = new Date().toISOString();
  if (d.etapa === "perdido" && reconectarEm) {
    const { data: pendente } = await svc
      .from("lembretes")
      .select("id")
      .eq("oportunidade_id", id)
      .eq("tipo", "reconectar")
      .eq("status", "pendente")
      .maybeSingle();
    const { error: lembErr } = pendente
      ? await svc.from("lembretes").update({ data_lembrete: reconectarEm, contato_id: data.contato_id ?? null, updated_at: agora }).eq("id", pendente.id)
      : await svc.from("lembretes").insert({
          vendedor_id: ctx.analistaId,
          unidade_id: atual.unidade_id,
          empresa_visitada_id: atual.empresa_visitada_id ?? null,
          oportunidade_id: id,
          contato_id: data.contato_id ?? null,
          tipo: "reconectar",
          data_lembrete: reconectarEm,
          texto: `Reconectar com ${atual.empresa}`,
          status: "pendente",
        });
    if (lembErr) {
      // Sem lembrete a perda ficaria sem rede de segurança: desfaz a mudança e avisa.
      await svc.from("oportunidades").update({
        etapa: atual.etapa, fechada_em: atual.fechada_em, motivo_perda: atual.motivo_perda,
        motivo_perda_categoria: atual.motivo_perda_categoria ?? null, updated_at: atual.updated_at,
      }).eq("id", id);
      return NextResponse.json({ error: `Não foi possível criar o lembrete de reconexão: ${lembErr.message}` }, { status: 500 });
    }
  } else if (d.etapa && (d.etapa === "ganho" || (aberta && atual.etapa === "perdido"))) {
    // Venda fechada ou oportunidade reaberta: o lembrete de reconexão deixa de fazer sentido.
    const { error: cancErr } = await svc
      .from("lembretes")
      .update({ status: "cancelado", concluido_em: agora, updated_at: agora })
      .eq("oportunidade_id", id)
      .eq("tipo", "reconectar")
      .eq("status", "pendente");
    if (cancErr) return NextResponse.json({ error: `Fase alterada, mas não foi possível cancelar o lembrete: ${cancErr.message}` }, { status: 500 });
  }

  if (d.etapa && d.etapa !== atual.etapa) {
    let detalhePerda = "";
    if (d.etapa === "perdido" && categoriaPerda) {
      const rotulo = ROTULO_MOTIVO_PERDA[categoriaPerda] ?? categoriaPerda;
      const texto = motivoPerda?.trim();
      detalhePerda = categoriaPerda === "outro" ? ` (${texto})` : texto ? ` (${rotulo}: ${texto})` : ` (${rotulo})`;
    }
    await svc.from("oportunidade_interacoes").insert({
      oportunidade_id: id,
      autor_id: ctx.analistaId,
      tipo: "mudanca_etapa",
      descricao: `Fase alterada: ${rotuloEtapa(atual.etapa)} → ${rotuloEtapa(d.etapa)}${detalhePerda}${reconectarEm ? ` · Reconectar em ${reconectarEm.split("-").reverse().join("/")}` : ""}`,
    });
  }
  return NextResponse.json({ data });
}
