import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";

interface Params {
  params: Promise<{ id: string }>;
}

const TIPO_LABELS: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização de Serviços",
  avaliacao_psicologica: "Avaliação Psicológica",
};

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { status } = await request.json();

  if (status !== "fechada" && status !== "cancelada") {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: vaga, error } = await supabase
    .from("vagas")
    .select("id, titulo, tipo_servico, cidade, estado, responsavel")
    .eq("id", id)
    .single();

  if (error || !vaga) {
    return NextResponse.json({ error: "Vaga não encontrada" }, { status: 404 });
  }

  const { data: analistas } = await supabase
    .from("analistas_perfil")
    .select("id, email, nome_completo")
    .eq("ativo", true);

  if (!analistas?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const vagaUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas/${id}`;
  const template = getEmailTemplate("vaga_encerrada", {
    nome: "",
    cargo: vaga.titulo,
    tipoServicoLabel: TIPO_LABELS[vaga.tipo_servico] ?? vaga.tipo_servico,
    cidade: vaga.cidade ?? undefined,
    estado: vaga.estado ?? undefined,
    responsavel: vaga.responsavel,
    statusEncerramento: status,
    vagaUrl,
  });

  Promise.all(
    analistas
      .filter((a) => a.email)
      .map((a) =>
        sendEmail({
          to: a.email,
          subject: template.subject,
          html: template.html,
          tipo: "vaga_encerrada",
          vaga_id: id,
        })
      )
  ).catch((err) => console.error("[notificar-encerramento] Erro ao enviar emails:", err));

  return NextResponse.json({ ok: true, sent: analistas.filter((a) => a.email).length });
}
