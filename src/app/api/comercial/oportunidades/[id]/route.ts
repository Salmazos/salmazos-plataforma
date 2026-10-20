import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeUpdateSchema } from "@/lib/schemas";
import { exigirContextoComercial } from "@/lib/comercial";
import { atualizarOportunidade } from "@/lib/oportunidadeEtapa";

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

  const resultado = await atualizarOportunidade(svc, ctx.analistaId, atual, d);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  const data = resultado.data;
  return NextResponse.json({ data });
}
