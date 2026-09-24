import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, usuarioCreateSchema } from "@/lib/schemas";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

async function guardSuperuser() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") return null;
  return user;
}

export async function GET() {
  if (!(await guardSuperuser())) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("analistas_perfil")
    .select("*")
    .order("nome_completo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analistas: data ?? [] });
}

export async function POST(req: NextRequest) {
  const actor = await guardSuperuser();
  if (!actor) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();

  const parsed = parseBody(usuarioCreateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { nome_completo, email, cargo, departamento, nivel_acesso, unidade_id, senha } = parsed.data;
  const nivel = nivel_acesso || "analista";

  const supabase = createServiceClient();

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { role: nivel_acesso || "analista" },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: perfilError } = await supabase.from("analistas_perfil").insert({
    user_id: authUser.user.id,
    nome_completo,
    email,
    cargo: cargo || null,
    departamento: departamento || null,
    nivel_acesso: nivel,
    ativo: true,
    unidade_id,
    // Acesso a todas as unidades acompanha o nível (diretoria/superuser, mesma constante do
    // resto do sistema) — não é escolha separada na tela. Fecha a pendência da Fase 1, em que
    // quem virava diretoria depois da migração ficava com false.
    acesso_todas_unidades: PAPEIS_FULL_ACCESS.includes(nivel),
  });

  if (perfilError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: perfilError.message }, { status: 500 });
  }

  registrarAuditoria({
    usuario_id: actor.id,
    usuario_nome: actor.email ?? null,
    acao: "usuario_criado",
    entidade: "usuarios",
    entidade_id: authUser.user.id,
    detalhes: { email, nivel_acesso: nivel, unidade_id },
  });

  return NextResponse.json({ success: true });
}
