import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cliente_id = searchParams.get("cliente_id");
  const status = searchParams.get("status");
  const supabase = createServiceClient();
  let query = supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .order("created_at", { ascending: false });
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const required = ["titulo", "tipo_servico", "num_posicoes", "responsavel"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Campo obrigatório: ${field}` }, { status: 400 });
      }
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vagas")
      .insert({
        titulo: body.titulo,
        cliente_id: body.cliente_id ?? null,
        tipo_servico: body.tipo_servico,
        num_posicoes: Number(body.num_posicoes),
        prazo: body.prazo || null,
        status: body.status ?? "aberta",
        cidade: body.cidade || null,
        estado: body.estado || null,
        salario: body.salario || null,
        requisitos: body.requisitos || null,
        beneficios: body.beneficios || null,
        horario: body.horario || null,
        habilidades_desejadas: Array.isArray(body.habilidades_desejadas)
          ? body.habilidades_desejadas
          : [],
        responsavel: body.responsavel,
        observacoes: body.observacoes || null,
        fee_rs_percentual: body.fee_rs_percentual ? Number(body.fee_rs_percentual) : null,
        fee_rs_prazo_cobranca: body.fee_rs_prazo_cobranca || null,
        data_abertura: new Date().toISOString(),
      })
      .select("*, clientes(id, nome)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Fire-and-forget: notify all active analysts
    const TIPO_LABELS: Record<string, string> = {
      recrutamento_selecao: "Recrutamento e Seleção",
      mao_obra_temporaria: "Mão de Obra Temporária",
      terceirizacao: "Terceirização de Serviços",
      avaliacao_psicologica: "Avaliação Psicológica",
    };
    const vagaUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas/${data.id}`;
    const template = getEmailTemplate("nova_vaga_criada", {
      nome: "",
      cargo: data.titulo,
      tipoServicoLabel: TIPO_LABELS[data.tipo_servico] ?? data.tipo_servico,
      cidade: data.cidade ?? undefined,
      estado: data.estado ?? undefined,
      numPosicoes: data.num_posicoes,
      responsavel: data.responsavel,
      salario: data.salario ?? undefined,
      horario: data.horario ?? undefined,
      requisitos: data.requisitos ?? undefined,
      beneficios: data.beneficios ?? undefined,
      observacoes: data.observacoes ?? undefined,
      vagaUrl,
    });

    supabase
      .from("analistas_perfil")
      .select("email, nome_completo")
      .eq("ativo", true)
      .then(({ data: analistas }) => {
        if (!analistas?.length) return;
        Promise.all(
          analistas
            .filter((a) => a.email)
            .map((a) =>
              sendEmail({
                to: a.email,
                subject: template.subject,
                html: template.html,
                tipo: "nova_vaga_criada",
                vaga_id: data.id,
              })
            )
        ).catch((err) => console.error("[POST /api/vagas] Erro ao notificar analistas:", err));
      });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/vagas]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
