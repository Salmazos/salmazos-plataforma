import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, bancoParceiroSchema } from "@/lib/schemas";
import { splitEmails } from "@/lib/bancosParceiros";

// Leitura liberada pra qualquer perfil com acesso ao módulo de Admissões (o modal da
// carta precisa listar os bancos ativos) — só a escrita é restrita a superuser.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const apenasAtivos = searchParams.get("ativo") === "true";

  const svc = createServiceClient();
  let query = svc.from("bancos_parceiros").select("*").order("nome");
  if (apenasAtivos) query = query.eq("ativo", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (user.app_metadata?.role !== "superuser") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(bancoParceiroSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("bancos_parceiros")
    .insert({
      nome: parsed.data.nome,
      emails_para: splitEmails(parsed.data.para),
      emails_cc: splitEmails(parsed.data.cc),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
