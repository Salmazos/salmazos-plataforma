import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioAsoCreateSchema } from "@/lib/schemas";
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
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: asos, error } = await svc
    .from("funcionario_asos")
    .select("*")
    .eq("funcionario_id", id)
    .is("excluido_em", null)
    .order("data_exame", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sem FK direta entre funcionario_asos.criado_por e analistas_perfil (as duas só
  // referenciam auth.users separadamente) — mesmo caso já resolvido em
  // rescisao_avisos_plataforma_destinatarios: duas consultas em vez de embed do PostgREST.
  const userIds = [...new Set((asos ?? []).map((a) => a.criado_por).filter(Boolean))];
  const { data: perfis } = userIds.length
    ? await svc.from("analistas_perfil").select("user_id, nome_completo").in("user_id", userIds)
    : { data: [] };
  const nomePorUserId = new Map((perfis ?? []).map((p) => [p.user_id, p.nome_completo]));

  const resultado = (asos ?? []).map((a) => ({
    ...a,
    criado_por_nome: a.criado_por ? nomePorUserId.get(a.criado_por) ?? "Usuário removido" : null,
  }));

  return NextResponse.json({ data: resultado });
}

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(funcionarioAsoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionario_asos")
    .insert({
      funcionario_id: id,
      data_exame: parsed.data.data_exame,
      arquivo_path: parsed.data.arquivo_path ?? null,
      criado_por: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_aso_registrado",
    entidade: "funcionario_asos",
    entidade_id: data.id,
    detalhes: { funcionario_id: id, data_exame: data.data_exame },
  });

  return NextResponse.json({ data }, { status: 201 });
}
