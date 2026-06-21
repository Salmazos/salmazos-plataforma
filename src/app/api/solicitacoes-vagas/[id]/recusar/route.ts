import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const body = await request.json();
    const { motivo_recusa } = body;

    if (!motivo_recusa?.trim()) {
      return NextResponse.json({ error: "Motivo da recusa é obrigatório." }, { status: 400 });
    }

    const service = createServiceClient();

    const { data: perfil } = await service
      .from("analistas_perfil")
      .select("nome_completo")
      .eq("user_id", user.id)
      .single();

    const { error } = await service
      .from("solicitacoes_vagas")
      .update({
        status: "recusada",
        motivo_recusa: motivo_recusa.trim(),
        aprovada_por: perfil?.nome_completo ?? user.email ?? "",
        aprovada_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/solicitacoes-vagas/[id]/recusar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
