import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import type { EmailTemplateName } from "@/lib/emailTemplates";
import { registrarHistorico } from "@/lib/registrarHistorico";

const ETAPAS_VALIDAS = [
  "triagem", "entrevista_salmazos", "entrevista_rh", "entrevista_cliente",
  "aprovado_cliente", "contratado", "reprovado", "nao_tem_interesse",
  "nao_compareceu", "bloqueado",
];

const ETAPA_LABEL: Record<string, string> = {
  triagem: "Triagem",
  entrevista_salmazos: "Entrevista Salmazos",
  entrevista_rh: "Entrevista Salmazos",
  entrevista_cliente: "Entrevista Cliente",
  aprovado_cliente: "Retorno Cliente",
  contratado: "Contratado",
  reprovado: "Reprovado",
  nao_tem_interesse: "Não tem Interesse",
  nao_compareceu: "Não Compareceu",
  bloqueado: "Bloqueado",
};

const ETAPAS_REMOVER = ["nao_tem_interesse", "reprovado", "nao_compareceu", "bloqueado", "contratado"];

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
  const { etapa_kanban, comentario } = body;

  if (!ETAPAS_VALIDAS.includes(etapa_kanban)) {
    return NextResponse.json({ error: "Etapa inválida." }, { status: 400 });
  }

  const svc = createServiceClient();

  // Map entrevista_rh to the DB value entrevista_salmazos
  const dbEtapa = etapa_kanban === "entrevista_rh" ? "entrevista_salmazos" : etapa_kanban;

  const isRemoval = ETAPAS_REMOVER.includes(etapa_kanban);
  const isBloqueado = etapa_kanban === "bloqueado";

  // Update candidato
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    bloqueado: isBloqueado,
  };
  if (!isRemoval) {
    updatePayload.etapa_kanban = dbEtapa;
  }

  const { data, error } = await svc
    .from("candidatos")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Update candidatos_vagas etapa
  if (isRemoval) {
    await svc
      .from("candidatos_vagas")
      .update({
        etapa: etapa_kanban,
        ...(comentario ? { observacoes: comentario } : {}),
      })
      .eq("candidato_id", id);
  } else {
    await svc
      .from("candidatos_vagas")
      .update({
        etapa: dbEtapa,
        ...(comentario ? { observacoes: comentario } : {}),
      })
      .eq("candidato_id", id);
  }

  const templateName = ETAPA_TEMPLATE[dbEtapa];
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
    descricao: `Movido para ${ETAPA_LABEL[etapa_kanban] ?? etapa_kanban}${comentario ? ` — ${comentario}` : ""}`,
    metadata: { etapa: etapa_kanban, comentario: comentario || null },
    criado_por: user.email ?? null,
  });

  return NextResponse.json({ data });
}
