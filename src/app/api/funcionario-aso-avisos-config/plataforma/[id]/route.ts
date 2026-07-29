import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFullAccess(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionario_aso_avisos_plataforma_destinatarios")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data) {
    const { data: perfil } = await svc
      .from("analistas_perfil")
      .select("nome_completo")
      .eq("user_id", data.usuario_id)
      .maybeSingle();

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "funcionario_aso_aviso_plataforma_removido",
      entidade: "funcionario_aso_avisos_plataforma_destinatarios",
      entidade_id: data.id,
      detalhes: { usuario_id: data.usuario_id, nome_completo: perfil?.nome_completo ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}
