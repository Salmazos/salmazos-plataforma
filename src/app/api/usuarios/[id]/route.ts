import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function guardSuperuser() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") return null;
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guardSuperuser())) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { nome_completo, cargo, departamento, nivel_acesso, ativo } = body;

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (nome_completo !== undefined) updates.nome_completo = nome_completo;
  if (cargo !== undefined) updates.cargo = cargo;
  if (departamento !== undefined) updates.departamento = departamento;
  if (nivel_acesso !== undefined) updates.nivel_acesso = nivel_acesso;
  if (ativo !== undefined) updates.ativo = ativo;

  const { error } = await supabase
    .from("analistas_perfil")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("user_id")
    .eq("id", id)
    .single();

  if (perfil?.user_id) {
    if (ativo !== undefined) {
      await supabase.auth.admin.updateUserById(perfil.user_id, {
        ban_duration: ativo ? "none" : "876600h",
      });
    }
    if (nivel_acesso !== undefined) {
      await supabase.auth.admin.updateUserById(perfil.user_id, {
        app_metadata: { role: nivel_acesso },
      });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Exclusão não permitida. Use PATCH para desativar." },
    { status: 405 }
  );
}
