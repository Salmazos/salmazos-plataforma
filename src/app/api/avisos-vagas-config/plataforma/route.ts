import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, avisoVagaPlataformaCreateSchema } from "@/lib/schemas";
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
    .from("aviso_vaga_plataforma_destinatarios")
    .select("*")
    .order("criado_em");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
  const parsed = parseBody(avisoVagaPlataformaCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  // Validar que o usuário é um analista ativo
  const { data: analista } = await svc
    .from("analistas_perfil")
    .select("user_id, ativo")
    .eq("user_id", parsed.data.usuario_id)
    .maybeSingle();

  if (!analista || !analista.ativo) {
    return NextResponse.json({ error: "Analista inativo ou não encontrado" }, { status: 400 });
  }

  const { data, error } = await svc
    .from("aviso_vaga_plataforma_destinatarios")
    .insert({ evento: parsed.data.evento, usuario_id: parsed.data.usuario_id })
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
    acao: "aviso_vaga_plataforma_adicionado",
    entidade: "aviso_vaga_plataforma_destinatarios",
    entidade_id: data.id,
    detalhes: { evento: data.evento, usuario_id: data.usuario_id, nome_completo: perfil?.nome_completo ?? null },
  });

  return NextResponse.json({ data }, { status: 201 });
}
