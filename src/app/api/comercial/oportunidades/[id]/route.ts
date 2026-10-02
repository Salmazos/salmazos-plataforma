import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeUpdateSchema } from "@/lib/schemas";
import { exigirContextoComercial } from "@/lib/comercial";
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

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["proxima_acao", "proxima_acao_em", "valor_estimado", "servico_interesse", "contato_nome", "contato_telefone", "contato_email"] as const) {
    if (d[k] !== undefined) campos[k] = d[k] === "" ? null : d[k];
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
      descricao: `Fase alterada: ${rotuloEtapa(atual.etapa)} → ${rotuloEtapa(d.etapa)}${detalhePerda}`,
    });
  }
  return NextResponse.json({ data });
}
