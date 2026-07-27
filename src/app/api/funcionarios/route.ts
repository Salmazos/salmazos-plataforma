import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const clienteId = searchParams.get("cliente_id");

  const svc = createServiceClient();
  let query = svc.from("funcionarios").select("*, clientes(nome)").order("criado_em", { ascending: false });
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
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(funcionarioCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionarios")
    .insert({
      nome_completo: parsed.data.nome_completo,
      cliente_id: parsed.data.cliente_id ?? null,
      empresa: parsed.data.empresa,
      cargo: parsed.data.cargo ?? null,
      data_admissao: parsed.data.data_admissao ?? null,
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
