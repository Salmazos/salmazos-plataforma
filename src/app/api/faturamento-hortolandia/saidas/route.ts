import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { parseBody, contaPagarHortolandiaCreateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

// Mesmo gate de acesso de /api/faturamento-hortolandia (contas a receber) — saída é dado
// financeiro da mesma unidade, sem motivo pra ter um nível de acesso diferente.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contas_pagar_hortolandia")
    .select("*")
    .order("data_pagamento", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(contaPagarHortolandiaCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contas_pagar_hortolandia")
    .insert({ ...parsed.data, criado_por: user.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "conta_pagar_hortolandia_criada",
    entidade: "contas_pagar_hortolandia",
    entidade_id: data.id,
    detalhes: { valor: data.valor, data_pagamento: data.data_pagamento, responsavel: data.responsavel },
  });

  return NextResponse.json({ data });
}
