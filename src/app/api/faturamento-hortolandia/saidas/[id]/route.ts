import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { parseBody, contaPagarHortolandiaUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

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
  const parsed = parseBody(contaPagarHortolandiaUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contas_pagar_hortolandia")
    .update({ ...parsed.data, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "conta_pagar_hortolandia_editada",
    entidade: "contas_pagar_hortolandia",
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
    .from("contas_pagar_hortolandia")
    .select("descricao, valor")
    .eq("id", id)
    .maybeSingle();

  const { error } = await svc.from("contas_pagar_hortolandia").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "conta_pagar_hortolandia_excluida",
    entidade: "contas_pagar_hortolandia",
    entidade_id: id,
    detalhes: atual ?? null,
  });

  return NextResponse.json({ success: true });
}
