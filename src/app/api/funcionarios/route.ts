import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import { resolverUnidadeCliente, resolverUnidadeUsuario, podeVerUnidade } from "@/lib/unidadeAuth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const clienteId = searchParams.get("cliente_id");

  const svc = createServiceClient();
  let query = svc.from("funcionarios").select("*, clientes(nome)").order("criado_em", { ascending: false });
  // RH por unidade: supervisor só lista os funcionários da própria unidade.
  const ctx = await contextoRH(user);
  if (!ctx) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);
  if (status) query = query.eq("status", status);
  if (clienteId) query = query.eq("cliente_id", clienteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(funcionarioCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Com cliente, o funcionário fica na unidade do cliente. Empresa em texto livre (sem
  // cliente cadastrado) fica na unidade de quem cadastrou — mesma regra dos contatos de
  // Aniversários; sem perfil de analista, recusa em vez de cair no DEFAULT do banco.
  let unidadeId: string | null;
  if (parsed.data.cliente_id) {
    unidadeId = await resolverUnidadeCliente(parsed.data.cliente_id);
    if (!unidadeId) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
    // RH por unidade: supervisor só cadastra funcionário de cliente da própria unidade.
    const ctxRH = await contextoRH(user);
    if (!ctxRH || !podeVerUnidade(ctxRH, unidadeId)) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
  } else {
    unidadeId = (await resolverUnidadeUsuario(user))?.unidadeId ?? null;
    if (!unidadeId) return NextResponse.json({ error: "Não foi possível identificar sua unidade." }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionarios")
    .insert({
      unidade_id: unidadeId,
      nome_completo: parsed.data.nome_completo,
      cliente_id: parsed.data.cliente_id ?? null,
      empresa: parsed.data.empresa,
      cargo: parsed.data.cargo ?? null,
      data_admissao: parsed.data.data_admissao ?? null,
      tipo_servico: parsed.data.tipo_servico,
      horario_trabalho: parsed.data.horario_trabalho ?? null,
      turno: parsed.data.turno ?? null,
      status: "ativo",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_criado_manualmente",
    entidade: "funcionarios",
    entidade_id: data.id,
    detalhes: { nome_completo: data.nome_completo, empresa: data.empresa },
  });

  return NextResponse.json({ data });
}
