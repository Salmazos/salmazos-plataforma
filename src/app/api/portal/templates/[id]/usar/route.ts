import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();

  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: tpl } = await service
    .from("vaga_templates_cliente")
    .select("total_usos")
    .eq("id", id)
    .eq("cliente_id", cu.cliente_id)
    .single();

  if (!tpl) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });

  await service
    .from("vaga_templates_cliente")
    .update({
      total_usos: (tpl.total_usos ?? 0) + 1,
      ultimo_uso_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("cliente_id", cu.cliente_id);

  return NextResponse.json({ success: true });
}
