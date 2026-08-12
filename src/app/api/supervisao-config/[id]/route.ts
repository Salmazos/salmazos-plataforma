import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { parseBody, clienteMetaSupervisaoUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const gate = checarPapelSuperuser(user);
  if (gate) return gate;

  const body = await request.json();
  const parsed = parseBody(clienteMetaSupervisaoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { frequencia_dias, supervisor_responsavel_id, modo, data_fim_implantacao } = parsed.data;

  const svc = createServiceClient();
  const { data: antes } = await svc.from("clientes_meta_supervisao").select("*").eq("id", id).single();

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (frequencia_dias !== undefined) patch.frequencia_dias = frequencia_dias;
  if (supervisor_responsavel_id !== undefined) patch.supervisor_responsavel_id = supervisor_responsavel_id || null;
  if (modo !== undefined) {
    patch.modo = modo;
    patch.data_fim_implantacao = modo === "implantacao" ? (data_fim_implantacao || null) : null;
  } else if (data_fim_implantacao !== undefined) {
    patch.data_fim_implantacao = data_fim_implantacao || null;
  }

  const { data, error } = await svc
    .from("clientes_meta_supervisao")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "editar",
    entidade: "clientes_meta_supervisao",
    entidade_id: id,
    detalhes: { antes, depois: patch },
  });

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const gate = checarPapelSuperuser(user);
  if (gate) return gate;

  const svc = createServiceClient();
  const { data: antes } = await svc.from("clientes_meta_supervisao").select("*").eq("id", id).single();
  const { error } = await svc.from("clientes_meta_supervisao").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "excluir",
    entidade: "clientes_meta_supervisao",
    entidade_id: id,
    detalhes: { antes },
  });

  return NextResponse.json({ success: true });
}
