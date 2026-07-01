import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, candidatoReprovarInternoSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(candidatoReprovarInternoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { motivo } = parsed.data;

  const svc = createServiceClient();

  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("nome_completo")
    .eq("user_id", user.id)
    .single();

  const agora = new Date().toISOString();

  const { data, error } = await svc
    .from("candidatos")
    .update({
      reprovado_internamente: true,
      reprovacao_motivo: motivo,
      reprovado_por_id: user.id,
      reprovado_por_nome: perfil?.nome_completo ?? user.email ?? null,
      reprovado_em: agora,
      updated_at: agora,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: perfil?.nome_completo ?? user.email ?? null,
    acao: "candidato_reprovado_internamente",
    entidade: "candidatos",
    entidade_id: id,
    detalhes: { motivo },
  });

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = user.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria"].includes(role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const svc = createServiceClient();

  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("nome_completo")
    .eq("user_id", user.id)
    .single();

  const { data, error } = await svc
    .from("candidatos")
    .update({
      reprovado_internamente: false,
      reprovacao_motivo: null,
      reprovado_por_id: null,
      reprovado_por_nome: null,
      reprovado_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: perfil?.nome_completo ?? user.email ?? null,
    acao: "candidato_reprovacao_removida",
    entidade: "candidatos",
    entidade_id: id,
    detalhes: null,
  });

  return NextResponse.json({ data });
}
