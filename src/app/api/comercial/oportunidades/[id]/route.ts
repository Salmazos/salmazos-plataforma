import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeUpdateSchema } from "@/lib/schemas";
import { exigirContextoComercial, ETAPAS_ABERTAS } from "@/lib/comercial";

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
  const aberta = (ETAPAS_ABERTAS as string[]).includes(novaEtapa);
  const proximaAcao = d.proxima_acao ?? atual.proxima_acao;
  const proximaEm = d.proxima_acao_em ?? atual.proxima_acao_em;

  if (aberta && (!proximaAcao || !proximaEm)) {
    return NextResponse.json({ error: "Informe a próxima ação e a data." }, { status: 400 });
  }
  const motivoPerda = d.motivo_perda ?? atual.motivo_perda;
  if (novaEtapa === "perdido" && !motivoPerda?.trim()) {
    return NextResponse.json({ error: "Informe o motivo da perda." }, { status: 400 });
  }

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["proxima_acao", "proxima_acao_em", "valor_estimado", "servico_interesse", "contato_nome", "contato_telefone", "contato_email"] as const) {
    if (d[k] !== undefined) campos[k] = d[k] === "" ? null : d[k];
  }
  if (d.etapa) {
    campos.etapa = d.etapa;
    if (d.etapa === "ganho" || d.etapa === "perdido") {
      campos.fechada_em = atual.fechada_em ?? new Date().toISOString();
      campos.motivo_perda = d.etapa === "perdido" ? motivoPerda : null;
    } else {
      campos.fechada_em = null;
      campos.motivo_perda = null;
    }
  }

  const { data, error } = await svc.from("oportunidades").update(campos).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (d.etapa && d.etapa !== atual.etapa) {
    await svc.from("oportunidade_interacoes").insert({
      oportunidade_id: id,
      autor_id: ctx.analistaId,
      tipo: "mudanca_etapa",
      descricao: `Etapa: ${atual.etapa} → ${d.etapa}${d.etapa === "perdido" && motivoPerda ? ` (${motivoPerda})` : ""}`,
    });
  }
  return NextResponse.json({ data });
}
