import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoContabilidadeEmailCreateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

// Destinatários "Para" do e-mail do pacote de admissão. Mesmo acesso das telas de avisos
// (superuser). Service client (a tabela só tem policy de service_role).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  const { data, error } = await svc.from("admissao_contabilidade_email_destinatarios").select("*").order("nome");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const parsed = parseBody(admissaoContabilidadeEmailCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.replace(/^email: /, "") }, { status: 400 });
  const { nome, email } = parsed.data;

  const svc = createServiceClient();
  // E-mail duplicado (sem diferenciar maiúsculas): o e-mail já vem em minúsculas pelo schema e o índice
  // único em lower(email) é a trava final; esta checagem só dá a mensagem amigável.
  const { data: existente } = await svc.from("admissao_contabilidade_email_destinatarios").select("id").eq("email", email).maybeSingle();
  if (existente) return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });

  const { data, error } = await svc
    .from("admissao_contabilidade_email_destinatarios")
    .insert({ nome, email, ativo: true })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_contabilidade_email_adicionado",
    entidade: "admissao_contabilidade_email_destinatarios",
    entidade_id: data.id,
    detalhes: { nome: data.nome, email: data.email },
  });
  return NextResponse.json({ data }, { status: 201 });
}
