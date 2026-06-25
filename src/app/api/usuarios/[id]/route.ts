import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, usuarioUpdateSchema } from "@/lib/schemas";

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

  const parsed = parseBody(usuarioUpdateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { nome_completo, cargo, departamento, nivel_acesso, ativo } = parsed.data;

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guardSuperuser();
  if (!actor) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("user_id, nivel_acesso, ativo, email, nome_completo")
    .eq("id", id)
    .single();

  if (!perfil) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  if (perfil.nivel_acesso === "superuser") {
    return NextResponse.json({ error: "Não é permitido excluir um superuser" }, { status: 403 });
  }

  if (perfil.ativo) {
    return NextResponse.json({ error: "Desative o usuário antes de excluir" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("analistas_perfil")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (perfil.user_id) {
    await supabase.auth.admin.deleteUser(perfil.user_id);
  }

  registrarAuditoria({
    usuario_id: actor.id,
    usuario_nome: actor.email ?? null,
    acao: "usuario_excluido",
    entidade: "usuarios",
    entidade_id: id,
    detalhes: { email: perfil.email, nome: perfil.nome_completo },
  });

  return NextResponse.json({ ok: true });
}
