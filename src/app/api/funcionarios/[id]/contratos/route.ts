import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioContratoCreateSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: contratos, error } = await svc
    .from("funcionario_contratos")
    .select("*")
    .eq("funcionario_id", id)
    .order("criado_em", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sem FK direta entre funcionario_contratos.criado_por e analistas_perfil (mesmo caso já
  // resolvido em funcionario_asos) — resolve o nome com uma segunda consulta em vez de um
  // embed do PostgREST, que não existe pra esse relacionamento.
  const userIds = [...new Set((contratos ?? []).map((c) => c.criado_por).filter(Boolean))];
  const { data: perfis } = userIds.length
    ? await svc.from("analistas_perfil").select("user_id, nome_completo").in("user_id", userIds)
    : { data: [] };
  const nomePorUserId = new Map((perfis ?? []).map((p) => [p.user_id, p.nome_completo]));

  const resultado = (contratos ?? []).map((c) => ({
    ...c,
    criado_por_nome: c.criado_por ? nomePorUserId.get(c.criado_por) ?? "Usuário removido" : null,
  }));

  return NextResponse.json({ data: resultado });
}

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(funcionarioContratoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionario_contratos")
    .insert({
      funcionario_id: id,
      arquivo_path: parsed.data.arquivo_path,
      nome_arquivo_original: parsed.data.nome_arquivo_original ?? null,
      observacoes: parsed.data.observacoes ?? null,
      criado_por: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_contrato_registrado",
    entidade: "funcionario_contratos",
    entidade_id: data.id,
    detalhes: { funcionario_id: id, nome_arquivo_original: data.nome_arquivo_original, observacoes: data.observacoes },
  });

  return NextResponse.json({ data }, { status: 201 });
}
