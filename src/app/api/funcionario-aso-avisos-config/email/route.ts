import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioAsoAvisoEmailCreateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionario_aso_avisos_email_destinatarios")
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
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(funcionarioAsoAvisoEmailCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { nome, email } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionario_aso_avisos_email_destinatarios")
    .insert({ nome: nome.trim(), email: email.trim().toLowerCase(), ativo: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_aso_aviso_email_adicionado",
    entidade: "funcionario_aso_avisos_email_destinatarios",
    entidade_id: data.id,
    detalhes: { nome: data.nome, email: data.email },
  });

  return NextResponse.json({ data }, { status: 201 });
}
