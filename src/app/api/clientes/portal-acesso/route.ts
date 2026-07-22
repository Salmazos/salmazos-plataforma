import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import {
  parseBody,
  portalAcessoSchema,
  portalAcessoUpdateSchema,
  portalAcessoDeleteSchema,
} from "@/lib/schemas";

const MAX_USUARIOS_POR_CLIENTE = 3;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function exigirAnalista() {
  const supabaseAuth = await createAuthClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

function mensagemErroAuth(msg: string | undefined): string {
  if (msg && /already.*registered|already.*exists|duplicate/i.test(msg)) {
    return "Este e-mail já está em uso por outra conta.";
  }
  return msg || "Erro ao processar a solicitação.";
}

export async function GET(request: NextRequest) {
  try {
    const user = await exigirAnalista();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const cliente_id = searchParams.get("cliente_id");
    if (!cliente_id) return NextResponse.json({ error: "cliente_id obrigatório." }, { status: 400 });

    const admin = getAdmin();

    const { data: links, error } = await admin
      .from("cliente_usuarios")
      .select("id, user_id, created_at")
      .eq("cliente_id", cliente_id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const usuarios = await Promise.all(
      (links ?? []).map(async (link) => {
        const { data: authUser } = await admin.auth.admin.getUserById(link.user_id);
        return {
          id: link.id,
          user_id: link.user_id,
          email: authUser?.user?.email ?? "",
          nome: (authUser?.user?.user_metadata?.nome as string | undefined) ?? null,
          created_at: link.created_at,
        };
      })
    );

    return NextResponse.json({ data: usuarios, limite: MAX_USUARIOS_POR_CLIENTE });
  } catch (err) {
    console.error("[GET /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await exigirAnalista();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(portalAcessoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { cliente_id, nome, email, senha } = parsed.data;

    const admin = getAdmin();

    const { count } = await admin
      .from("cliente_usuarios")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", cliente_id);

    if ((count ?? 0) >= MAX_USUARIOS_POR_CLIENTE) {
      return NextResponse.json(
        { error: `Este cliente já possui o limite de ${MAX_USUARIOS_POR_CLIENTE} usuários de portal.` },
        { status: 409 }
      );
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: nome?.trim() ? { nome: nome.trim() } : undefined,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: mensagemErroAuth(authError?.message) }, { status: 400 });
    }

    const userId = authData.user.id;

    const { error: insertError } = await admin
      .from("cliente_usuarios")
      .insert({ cliente_id, user_id: userId });

    if (insertError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user_id: userId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await exigirAnalista();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(portalAcessoUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { cliente_id, user_id, nome, email, senha } = parsed.data;

    const admin = getAdmin();

    // Confirma que esse user_id realmente pertence a esse cliente_id antes de
    // atualizar — sem isso, qualquer user_id válido poderia ser editado por
    // quem tivesse acesso a essa rota, mesmo sendo de outro cliente.
    const { data: link } = await admin
      .from("cliente_usuarios")
      .select("id")
      .eq("cliente_id", cliente_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "Usuário não encontrado para este cliente." }, { status: 404 });
    }

    const updates: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    if (email) updates.email = email;
    if (senha) updates.password = senha;
    if (nome !== undefined) updates.user_metadata = { nome: nome.trim() };

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(user_id, updates);
    if (error) return NextResponse.json({ error: mensagemErroAuth(error.message) }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await exigirAnalista();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const parsed = parseBody(portalAcessoDeleteSchema, {
      cliente_id: searchParams.get("cliente_id"),
      user_id: searchParams.get("user_id"),
    });
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { cliente_id, user_id } = parsed.data;

    const admin = getAdmin();

    const { error: deleteError, count: deletedCount } = await admin
      .from("cliente_usuarios")
      .delete({ count: "exact" })
      .eq("cliente_id", cliente_id)
      .eq("user_id", user_id);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    if (!deletedCount) {
      return NextResponse.json({ error: "Usuário não encontrado para este cliente." }, { status: 404 });
    }

    // Só apaga a conta auth.users inteira se ela não estiver mais vinculada a
    // NENHUM cliente — senão ficaria um login órfão sem nenhum cliente_id.
    const { count: outrosVinculos } = await admin
      .from("cliente_usuarios")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id);

    if (!outrosVinculos) {
      await admin.auth.admin.deleteUser(user_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
