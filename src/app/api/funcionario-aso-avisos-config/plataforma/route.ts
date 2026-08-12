import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioAsoAvisoPlataformaCreateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  const { data: destinatarios, error } = await svc
    .from("funcionario_aso_avisos_plataforma_destinatarios")
    .select("*")
    .order("criado_em");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sem FK direta pra analistas_perfil (usuario_id referencia auth.users, mesmo caso já
  // resolvido em rescisao_avisos_plataforma_destinatarios) — resolve o nome/e-mail com uma
  // segunda consulta em vez de um embed do PostgREST, que não existe pra esse relacionamento.
  const userIds = (destinatarios ?? []).map((d) => d.usuario_id);
  const { data: perfis } = userIds.length
    ? await svc.from("analistas_perfil").select("user_id, nome_completo, email").in("user_id", userIds)
    : { data: [] };

  const perfilPorUserId = new Map((perfis ?? []).map((p) => [p.user_id, p]));
  const resultado = (destinatarios ?? []).map((d) => ({
    ...d,
    analistas_perfil: perfilPorUserId.get(d.usuario_id) ?? null,
  }));

  return NextResponse.json({ data: resultado });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(funcionarioAsoAvisoPlataformaCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionario_aso_avisos_plataforma_destinatarios")
    .insert({ usuario_id: parsed.data.usuario_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("nome_completo")
    .eq("user_id", parsed.data.usuario_id)
    .maybeSingle();

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_aso_aviso_plataforma_adicionado",
    entidade: "funcionario_aso_avisos_plataforma_destinatarios",
    entidade_id: data.id,
    detalhes: { usuario_id: data.usuario_id, nome_completo: perfil?.nome_completo ?? null },
  });

  return NextResponse.json({ data }, { status: 201 });
}
