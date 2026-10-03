import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoContabilidadeEmailUpdateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import type { User } from "@supabase/supabase-js";

interface Params {
  params: Promise<{ id: string }>;
}

async function autenticar(): Promise<{ user: User | null; status: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, status: 401 };
  return checarPapelSuperuser(user) ? { user: null, status: 403 } : { user, status: 200 };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { user, status } = await autenticar();
  if (!user) return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Acesso restrito." }, { status });

  const { id } = await params;
  const parsed = parseBody(admissaoContabilidadeEmailUpdateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("admissao_contabilidade_email_destinatarios")
    .update({ ativo: parsed.data.ativo })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: data.ativo ? "admissao_contabilidade_email_reativado" : "admissao_contabilidade_email_desativado",
    entidade: "admissao_contabilidade_email_destinatarios",
    entidade_id: data.id,
    detalhes: { nome: data.nome, email: data.email, ativo: data.ativo },
  });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { user, status } = await autenticar();
  if (!user) return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Acesso restrito." }, { status });

  const { id } = await params;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("admissao_contabilidade_email_destinatarios")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data) {
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "admissao_contabilidade_email_removido",
      entidade: "admissao_contabilidade_email_destinatarios",
      entidade_id: data.id,
      detalhes: { nome: data.nome, email: data.email },
    });
  }
  return NextResponse.json({ ok: true });
}
