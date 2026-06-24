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

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: vaga, error } = await supabase
    .from("vagas")
    .select("id, titulo, tipo_servico, cidade, estado, responsavel, num_posicoes, salario, horario, requisitos, beneficios")
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
  const template = getEmailTemplate("nova_vaga_criada", {
    nome: "",
    cargo: vaga.titulo,
    tipoServicoLabel: TIPO_LABELS[vaga.tipo_servico] ?? vaga.tipo_servico,
    cidade: vaga.cidade ?? undefined,
    estado: vaga.estado ?? undefined,
    numPosicoes: vaga.num_posicoes,
    responsavel: vaga.responsavel,
    salario: vaga.salario ?? undefined,
    horario: vaga.horario ?? undefined,
    requisitos: vaga.requisitos ?? undefined,
    beneficios: vaga.beneficios ?? undefined,
    vagaUrl,
  });

  const subject = `🔄 Vaga Reativada: ${vaga.titulo}`;

  Promise.all(
    analistas
      .filter((a) => a.email)
      .map((a) =>
        sendEmail({
          to: a.email,
          subject,
          html: template.html,
          tipo: "nova_vaga_criada",
          vaga_id: id,
        })
      )
  ).catch((err) => console.error("[notificar-ativacao] Erro ao enviar emails:", err));

  return NextResponse.json({ ok: true, sent: analistas.filter((a) => a.email).length });
}
