import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsAvisoEmailUpdateSchema } from "@/lib/schemas";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import type { User } from "@supabase/supabase-js";

interface Params {
  params: Promise<{ id: string }>;
}

async function autenticar(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const acessoNegado = checarPapelFullAccess(user);
  return acessoNegado ? null : user;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await autenticar();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(cobrancaRsAvisoEmailUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("cobranca_rs_avisos_destinatarios")
    .update({ ativo: parsed.data.ativo })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: data.ativo ? "cobranca_rs_aviso_email_reativado" : "cobranca_rs_aviso_email_desativado",
    entidade: "cobranca_rs_avisos_destinatarios",
    entidade_id: data.id,
    detalhes: { nome: data.nome, email: data.email, ativo: data.ativo },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await autenticar();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("cobranca_rs_avisos_destinatarios")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data) {
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "cobranca_rs_aviso_email_removido",
      entidade: "cobranca_rs_avisos_destinatarios",
      entidade_id: data.id,
      detalhes: { nome: data.nome, email: data.email },
    });
  }

  return NextResponse.json({ ok: true });
}
