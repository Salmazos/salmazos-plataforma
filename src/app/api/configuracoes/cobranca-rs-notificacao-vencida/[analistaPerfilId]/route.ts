import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsNotificacaoVencidaUpdateSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ analistaPerfilId: string }>;
}

// Upsert — mesmo padrão de .../cobranca-rs-notificacao-enviada/[analistaPerfilId]/route.ts.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const gate = checarPapelSuperuser(user);
  if (gate) return gate;

  const { analistaPerfilId } = await params;
  const body = await request.json();
  const parsed = parseBody(cobrancaRsNotificacaoVencidaUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ativo } = parsed.data;

  const svc = createServiceClient();

  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo")
    .eq("id", analistaPerfilId)
    .single();
  if (!perfil) return NextResponse.json({ error: "Analista não encontrado." }, { status: 404 });

  const { data, error } = await svc
    .from("cobranca_rs_destinatarios_popup_vencida")
    .upsert(
      { analista_perfil_id: analistaPerfilId, ativo, criado_por_user_id: user.id },
      { onConflict: "analista_perfil_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: ativo ? "cobranca_rs_notificacao_vencida_concedida" : "cobranca_rs_notificacao_vencida_revogada",
    entidade: "cobranca_rs_destinatarios_popup_vencida",
    entidade_id: analistaPerfilId,
    detalhes: { analista_nome: perfil.nome_completo },
  });

  return NextResponse.json({ data });
}
