import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, vagaUpdateSchema } from "@/lib/schemas";
import { generateUniqueSlug } from "@/lib/slug";
import { gerarCobrancasRSParaVaga, gerarCobrancaCancelamentoRSSeAplicavel } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vagas")
    .select("*, clientes(id, nome, processo_simplificado)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = parseBody(vagaUpdateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createServiceClient();

    const campos: Record<string, unknown> = {};
    if (body.titulo !== undefined) {
      campos.titulo = body.titulo;
      campos.slug = await generateUniqueSlug(body.titulo, supabase, id);
    }
    if (body.cliente_id !== undefined)          campos.cliente_id = body.cliente_id ?? null;
    if (body.tipo_servico !== undefined)        campos.tipo_servico = body.tipo_servico;
    if (body.num_posicoes !== undefined)        campos.num_posicoes = Number(body.num_posicoes);
    if (body.prazo !== undefined)               campos.prazo = body.prazo || null;
    if (body.status !== undefined)              campos.status = body.status;
    if (body.cidade !== undefined)              campos.cidade = body.cidade || null;
    if (body.estado !== undefined)              campos.estado = body.estado || null;
    if (body.salario !== undefined)             campos.salario = body.salario || null;
    if (body.requisitos !== undefined)          campos.requisitos = body.requisitos || null;
    if (body.beneficios !== undefined)          campos.beneficios = body.beneficios || null;
    if (body.horario !== undefined)             campos.horario = body.horario || null;
    if (body.habilidades_desejadas !== undefined) campos.habilidades_desejadas = body.habilidades_desejadas;
    if (body.responsavel !== undefined)         campos.responsavel = body.responsavel;
    if (body.observacoes !== undefined)         campos.observacoes = body.observacoes || null;
    if (body.fee_rs_percentual !== undefined)  campos.fee_rs_percentual = body.fee_rs_percentual !== "" ? Number(body.fee_rs_percentual) : null;
    if (body.fee_rs_prazo_cobranca !== undefined) campos.fee_rs_prazo_cobranca = body.fee_rs_prazo_cobranca || null;
    if (body.confidencial !== undefined)        campos.confidencial = body.confidencial === true;
    if (body.taxa_cancelamento !== undefined)   campos.taxa_cancelamento = body.taxa_cancelamento === true;
    if (body.taxa_cancelamento_percentual !== undefined) campos.taxa_cancelamento_percentual = body.taxa_cancelamento_percentual !== "" ? Number(body.taxa_cancelamento_percentual) : null;

    let statusAlterado = false;
    let statusAnterior: string | null = null;

    if (body.status !== undefined) {
      const { data: current } = await supabase
        .from("vagas")
        .select("status")
        .eq("id", id)
        .single();
      if (current && current.status !== body.status) {
        statusAlterado = true;
        statusAnterior = current.status as string;
        if (body.status === "aberta") {
          campos.data_abertura = new Date().toISOString();
          campos.data_fechamento = null;
        } else if (body.status === "fechada" || body.status === "cancelada") {
          campos.data_fechamento = new Date().toISOString();
        }
      }
    }

    if (body.tipo_servico !== undefined) {
      const { data: current } = await supabase
        .from("vagas")
        .select("tipo_servico, tipo_servico_original")
        .eq("id", id)
        .single();

      if (current && current.tipo_servico !== body.tipo_servico) {
        let alteradoPor = "";
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();
        if (user) {
          const { data: perfil } = await supabase
            .from("analistas_perfil")
            .select("nome_completo")
            .eq("user_id", user.id)
            .single();
          alteradoPor = perfil?.nome_completo ?? user.email ?? "";
        }

        if (!current.tipo_servico_original) {
          campos.tipo_servico_original = current.tipo_servico;
        }
        campos.tipo_servico_alterado_em = new Date().toISOString();
        campos.tipo_servico_alterado_por = alteradoPor;
        campos.tipo_servico_motivo = body.motivo_alteracao || null;

        await supabase.from("vagas_historico_modalidade").insert({
          vaga_id: id,
          tipo_anterior: current.tipo_servico,
          tipo_novo: body.tipo_servico,
          alterado_por: alteradoPor,
          motivo: body.motivo_alteracao || null,
        });
      }
    }

    const { data, error } = await supabase
      .from("vagas")
      .update(campos)
      .eq("id", id)
      .select("*, clientes(id, nome, processo_simplificado)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (statusAlterado) {
      registrarAuditoria({
        acao: "vaga_atualizada",
        entidade: "vagas",
        entidade_id: id,
        detalhes: { status_anterior: statusAnterior, status_novo: body.status as string },
      });

      // Fechamento manual (botão "Encerrar vaga" ou edição direta do status em
      // ModalEditarVaga — os dois passam por este mesmo endpoint) também precisa gerar
      // cobrança R&S pros candidatos já contratados, não só o fechamento automático por
      // última posição preenchida em finalizar/route.ts.
      if (body.status === "fechada") {
        await gerarCobrancasRSParaVaga(id, supabase).catch((err) =>
          console.error("[PATCH /api/vagas/[id]] Erro ao gerar cobranças R&S:", err)
        );
      }

      // Cancelamento manual (mesmos 2 caminhos: "Encerrar vaga" e edição direta do status)
      // também pode gerar cobrança, se a vaga tiver taxa de cancelamento configurada.
      if (body.status === "cancelada") {
        await gerarCobrancaCancelamentoRSSeAplicavel(id, supabase).catch((err) =>
          console.error("[PATCH /api/vagas/[id]] Erro ao gerar cobrança de cancelamento R&S:", err)
        );
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
