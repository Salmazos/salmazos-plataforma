import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("*, candidatos(id, nome_completo, cargo_pretendido, telefone, email), vagas(id, titulo)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }, { data: auditLogs }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("audit_logs").select("id, created_at, usuario_nome, acao, detalhes").eq("entidade", "admissoes").eq("entidade_id", id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    data: {
      admissao,
      dados_pessoais: dadosPessoais ?? null,
      dependentes: dependentes ?? [],
      documentos: documentos ?? [],
      audit_logs: auditLogs ?? [],
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(admissaoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.observacoes_internas !== undefined) updates.observacoes_internas = parsed.data.observacoes_internas;

  const { data, error } = await svc
    .from("admissoes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_atualizada",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: updates,
  });

  return NextResponse.json({ data });
}
