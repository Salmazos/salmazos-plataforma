import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { parseBody, portalAcessoSchema, portalSenhaSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createAuthClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const cliente_id = searchParams.get("cliente_id");
    if (!cliente_id) return NextResponse.json({ error: "cliente_id obrigatório." }, { status: 400 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await supabaseAdmin
      .from("cliente_usuarios")
      .select("id")
      .eq("cliente_id", cliente_id)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ temAcesso: !!data });
  } catch (err) {
    console.error("[GET /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createAuthClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = parseBody(portalAcessoSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { cliente_id, email, senha } = parsed.data;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existing } = await supabaseAdmin
      .from("cliente_usuarios")
      .select("id")
      .eq("cliente_id", cliente_id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Este cliente já possui acesso ao portal." },
        { status: 409 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? "Erro ao criar usuário." },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    const { error: insertError } = await supabaseAdmin
      .from("cliente_usuarios")
      .insert({ cliente_id, user_id: userId });

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabaseAuth = await createAuthClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(portalSenhaSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { cliente_id, senha } = parsed.data;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: link } = await supabaseAdmin
      .from("cliente_usuarios")
      .select("user_id")
      .eq("cliente_id", cliente_id)
      .limit(1)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: "Cliente não possui acesso ao portal." },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      link.user_id,
      { password: senha }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/clientes/portal-acesso]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
