import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { parseBody, contaReceberHortolandiaCreateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { resolverUnidadeFaturamento, checarClienteDaUnidade, checarEscritaFaturamento } from "@/lib/faturamentoUnidades";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;
  const { unidadeId, erro } = await resolverUnidadeFaturamento(user, new URL(request.url).searchParams.get("unidade"));
  if (erro) return erro;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contas_receber_hortolandia")
    .select("*, clientes(id, nome)")
    .eq("unidade_id", unidadeId)
    .order("data_vencimento", { ascending: true });
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
  const somenteLeitura = await checarEscritaFaturamento(user);
  if (somenteLeitura) return somenteLeitura;

  const body = await request.json();
  const parsed = parseBody(contaReceberHortolandiaCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { unidadeId, erro } = await resolverUnidadeFaturamento(user, parsed.data.unidade_id);
  if (erro) return erro;
  const clienteErrado = await checarClienteDaUnidade(parsed.data.cliente_id, unidadeId);
  if (clienteErrado) return clienteErrado;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contas_receber_hortolandia")
    .insert({ ...parsed.data, unidade_id: unidadeId, criado_por: user.id })
    .select("*, clientes(id, nome)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "conta_receber_hortolandia_criada",
    entidade: "contas_receber_hortolandia",
    entidade_id: data.id,
    detalhes: { cliente_id: data.cliente_id, valor: data.valor, data_vencimento: data.data_vencimento },
  });

  return NextResponse.json({ data });
}
