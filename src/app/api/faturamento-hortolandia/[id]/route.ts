import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { parseBody, contaReceberHortolandiaUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { checarUnidadeLancamento, checarClienteDaUnidade } from "@/lib/faturamentoUnidades";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(contaReceberHortolandiaUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data: lancamento } = await svc.from("contas_receber_hortolandia").select("unidade_id").eq("id", id).maybeSingle();
  const bloqueio = await checarUnidadeLancamento(user, lancamento?.unidade_id);
  if (bloqueio) return bloqueio;
  if (parsed.data.cliente_id) {
    const clienteErrado = await checarClienteDaUnidade(parsed.data.cliente_id, lancamento!.unidade_id);
    if (clienteErrado) return clienteErrado;
  }

  const { data, error } = await svc
    .from("contas_receber_hortolandia")
    .update({ ...parsed.data, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .select("*, clientes(id, nome)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "conta_receber_hortolandia_editada",
    entidade: "contas_receber_hortolandia",
    entidade_id: id,
    detalhes: { campos: Object.keys(parsed.data) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: atual } = await svc
    .from("contas_receber_hortolandia")
    .select("cliente_id, valor, unidade_id")
    .eq("id", id)
    .maybeSingle();
  const bloqueio = await checarUnidadeLancamento(user, atual?.unidade_id);
  if (bloqueio) return bloqueio;

  const { error } = await svc.from("contas_receber_hortolandia").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "conta_receber_hortolandia_excluida",
    entidade: "contas_receber_hortolandia",
    entidade_id: id,
    detalhes: atual ?? null,
  });

  return NextResponse.json({ success: true });
}
