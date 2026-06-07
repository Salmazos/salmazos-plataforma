import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import type { EmailTemplateName } from "@/lib/emailTemplates";
import { registrarHistorico } from "@/lib/registrarHistorico";

const ETAPAS_VALIDAS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

const ETAPA_LABEL: Record<string, string> = {
  triagem: "Triagem",
  entrevista_salmazos: "Entrevista Salmazos",
  entrevista_cliente: "Entrevista Cliente",
  aprovado_cliente: "Aprovado pelo Cliente",
};

const ETAPA_TEMPLATE: Partial<Record<string, EmailTemplateName>> = {
  entrevista_salmazos: "entrevista_salmazos",
  entrevista_cliente: "entrevista_cliente",
  aprovado_cliente: "aprovado_cliente",
};

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { etapa_kanban } = body;

  if (!ETAPAS_VALIDAS.includes(etapa_kanban)) {
    return NextResponse.json({ error: "Etapa inválida." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos")
    .update({ etapa_kanban, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const templateName = ETAPA_TEMPLATE[etapa_kanban];
  if (templateName && data.email) {
    const { subject, html } = getEmailTemplate(templateName, {
      nome: data.nome_completo,
      cargo: data.cargo_pretendido,
    });
    sendEmail({ to: data.email, subject, html, tipo: "notificacao_analista", candidato_id: id });
  }

  void registrarHistorico({
    candidato_id: id,
    tipo: "etapa_alterada",
    descricao: `Movido para ${ETAPA_LABEL[etapa_kanban] ?? etapa_kanban}`,
    metadata: { etapa: etapa_kanban },
    criado_por: user.email ?? null,
  });

  return NextResponse.json({ data });
}
