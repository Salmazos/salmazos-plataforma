import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, vagaCreateSchema } from "@/lib/schemas";
import { generateUniqueSlug } from "@/lib/slug";

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
    const parsed = parseBody(vagaCreateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const supabase = createServiceClient();
    const slug = await generateUniqueSlug(body.titulo, supabase);
    const { data, error } = await supabase
      .from("vagas")
      .insert({
        titulo: body.titulo,
        slug,
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

    registrarAuditoria({
      acao: "vaga_criada",
      entidade: "vagas",
      entidade_id: data.id,
      detalhes: { titulo: data.titulo, tipo_servico: data.tipo_servico, status: data.status },
    });

    const vagaId = data.id;
    const vagaTitulo = data.titulo;
    const vagaTipo = data.tipo_servico;
    const vagaCidade = data.cidade;
    const vagaEstado = data.estado;
    const vagaNumPosicoes = data.num_posicoes;
    const vagaResponsavel = data.responsavel;
    const vagaSalario = data.salario;
    const vagaHorario = data.horario;
    const vagaRequisitos = data.requisitos;
    const vagaBeneficios = data.beneficios;
    const vagaObservacoes = data.observacoes;

    after(async () => {
      console.log(`[POST /api/vagas] Notificando analistas sobre nova vaga ${vagaId}`);
      const TIPO_LABELS: Record<string, string> = {
        recrutamento_selecao: "Recrutamento e Seleção",
        mao_obra_temporaria: "Mão de Obra Temporária",
        terceirizacao: "Terceirização de Serviços",
        avaliacao_psicologica: "Avaliação Psicológica",
      };
      const svcAfter = createServiceClient();
      const { data: analistas } = await svcAfter
        .from("analistas_perfil")
        .select("email, nome_completo")
        .eq("ativo", true);

      if (!analistas?.length) return;

      const vagaUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas/${vagaId}`;
      const template = getEmailTemplate("nova_vaga_criada", {
        nome: "",
        cargo: vagaTitulo,
        tipoServicoLabel: TIPO_LABELS[vagaTipo] ?? vagaTipo,
        cidade: vagaCidade ?? undefined,
        estado: vagaEstado ?? undefined,
        numPosicoes: vagaNumPosicoes,
        responsavel: vagaResponsavel,
        salario: vagaSalario ?? undefined,
        horario: vagaHorario ?? undefined,
        requisitos: vagaRequisitos ?? undefined,
        beneficios: vagaBeneficios ?? undefined,
        observacoes: vagaObservacoes ?? undefined,
        vagaUrl,
      });

      const destinatarios = analistas.filter((a) => a.email);
      console.log(`[POST /api/vagas] Enviando para ${destinatarios.length} analistas`);
      await Promise.all(
        destinatarios.map((a) =>
          sendEmail({
            to: a.email,
            subject: template.subject,
            html: template.html,
            tipo: "nova_vaga_criada",
            vaga_id: vagaId,
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
