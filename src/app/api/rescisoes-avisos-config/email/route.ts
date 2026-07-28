import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, rescisaoAvisoEmailCreateSchema } from "@/lib/schemas";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFullAccess(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("rescisao_avisos_email_destinatarios")
    .select("*")
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFullAccess(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(rescisaoAvisoEmailCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { nome, email } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("rescisao_avisos_email_destinatarios")
    .insert({ nome: nome.trim(), email: email.trim().toLowerCase(), ativo: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Essa lista decide quem sabe sobre pagamento de rescisão pendente — uma remoção ou
  // adição sem rastro é o mesmo tipo de falha silenciosa que este módulo existe pra evitar.
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "rescisao_aviso_email_adicionado",
    entidade: "rescisao_avisos_email_destinatarios",
    entidade_id: data.id,
    detalhes: { nome: data.nome, email: data.email },
  });

  return NextResponse.json({ data }, { status: 201 });
}
