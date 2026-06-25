import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import type { EmailTemplateName } from "@/lib/emailTemplates";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { parseBody, candidatoEtapaSchema } from "@/lib/schemas";

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
  const parsed = parseBody(candidatoEtapaSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { etapa_kanban, comentario } = parsed.data;

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

  if (dbEtapa === "entrevista_cliente") {
    const { data: cv } = await svc
      .from("candidatos_vagas")
      .select("vaga_id, vagas(cliente_id, clientes(nome, contato_email))")
      .eq("candidato_id", id)
      .limit(1)
      .single();

    const cliente = (cv?.vagas as any)?.clientes;
    if (cliente?.contato_email) {
      const { subject, html } = getEmailTemplate("candidato_entrevista_cliente", {
        nome: "",
        cargo: data.cargo_pretendido,
        nomeCliente: cliente.nome ?? "",
        nomeCandidato: data.nome_completo,
        empresa: cliente.nome ?? "",
      });
      sendEmail({
        to: cliente.contato_email,
        subject,
        html,
        tipo: "candidato_entrevista_cliente",
        candidato_id: id,
      });
    }
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
