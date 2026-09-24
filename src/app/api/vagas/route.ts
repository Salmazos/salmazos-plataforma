import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, vagaCreateSchema } from "@/lib/schemas";
import { generateUniqueSlug } from "@/lib/slug";
import { exigirContextoUnidade, podeVerUnidade, resolverUnidadeCliente } from "@/lib/unidadeAuth";
import { analistaAtendeUnidade } from "@/lib/notifyAllAnalysts";

export async function GET(request: NextRequest) {
  const { ctx, erro } = await exigirContextoUnidade();
  if (erro) return erro;

  const { searchParams } = new URL(request.url);
  const cliente_id = searchParams.get("cliente_id");
  const status = searchParams.get("status");
  const supabase = createServiceClient();
  let query = supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .order("created_at", { ascending: false });
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const { ctx, erro } = await exigirContextoUnidade();
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(vagaCreateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const supabase = createServiceClient();

    // DECISÃO DO OLVER (24/09): vaga com cliente fica SEMPRE na unidade do cliente — mesma
    // regra da solicitação do portal e dos encaminhamentos; vaga e cliente nunca ficam em
    // unidades diferentes. Sem cliente, quem tem acesso a todas as unidades escolhe a
    // unidade no formulário (obrigatório, nunca assume); os demais criam na própria.
    let unidadeId: string;
    if (body.cliente_id) {
      const unidadeCliente = await resolverUnidadeCliente(body.cliente_id);
      if (!unidadeCliente || !podeVerUnidade(ctx, unidadeCliente)) {
        return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
      }
      unidadeId = unidadeCliente;
    } else if (ctx.todasUnidades) {
      if (!body.unidade_id) {
        return NextResponse.json({ error: "Escolha a unidade da vaga." }, { status: 400 });
      }
      // Sem filtro de ativa: unidade ainda não aberta oficialmente (SBC) já opera.
      const { data: unidade } = await supabase
        .from("unidades")
        .select("id")
        .eq("id", body.unidade_id)
        .maybeSingle();
      if (!unidade) return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
      unidadeId = unidade.id;
    } else {
      unidadeId = ctx.unidadeId;
    }

    const slug = await generateUniqueSlug(body.titulo, supabase);
    const { data, error } = await supabase
      .from("vagas")
      .insert({
        titulo: body.titulo,
        slug,
        cliente_id: body.cliente_id ?? null,
        tipo_servico: body.tipo_servico,
        num_posicoes: Number(body.num_posicoes),
        // Nasce igual a num_posicoes — sem isso a coluna fica null e a vaga fecha (some
        // do site) já na primeira contratação, mesmo tendo várias posições (ver
        // finalizar/route.ts, que decrementa esse contador). Mesmo padrão já usado na
        // criação da vaga de reposição de garantia (acionar-garantia/route.ts).
        num_posicoes_abertas: Number(body.num_posicoes),
        prazo: body.prazo || null,
        status: body.status ?? "aberta",
        cidade: body.cidade || null,
        estado: body.estado || null,
        salario: body.salario || null,
        adicionais_salariais: body.adicionais_salariais || null,
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
        confidencial: body.confidencial === true,
        taxa_cancelamento: body.taxa_cancelamento === true,
        taxa_cancelamento_percentual: body.taxa_cancelamento_percentual !== "" && body.taxa_cancelamento_percentual != null ? Number(body.taxa_cancelamento_percentual) : null,
        visivel_publicamente: body.visivel_publicamente !== false,
        data_abertura: new Date().toISOString(),
        // Explícito, não o DEFAULT do banco (que é só rede de segurança e sempre cai em
        // Monte Mor/Hortolândia).
        unidade_id: unidadeId,
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
    const vagaConfidencial = data.confidencial === true;
    const vagaFeeRsPercentual = data.fee_rs_percentual;
    const vagaFeeRsPrazoCobranca = data.fee_rs_prazo_cobranca;
    const vagaTaxaCancelamento = data.taxa_cancelamento === true;
    const vagaTaxaCancelamentoPercentual = data.taxa_cancelamento_percentual;
    const vagaClienteNome = (data.clientes as any)?.nome ?? null;
    const vagaUnidadeId = data.unidade_id as string;

    after(async () => {
      console.log(`[POST /api/vagas] Notificando analistas sobre nova vaga ${vagaId}`);
      const TIPO_LABELS: Record<string, string> = {
        recrutamento_selecao: "Recrutamento e Seleção",
        mao_obra_temporaria: "Mão de Obra Temporária",
        terceirizacao: "Terceirização de Serviços",
        avaliacao_psicologica: "Avaliação Psicológica",
      };
      const svcAfter = createServiceClient();
      // Só a equipe da unidade da vaga (+ sócios com acesso a todas) recebe.
      const { data: analistasTodos } = await svcAfter
        .from("analistas_perfil")
        .select("email, nome_completo, unidade_id, acesso_todas_unidades")
        .eq("ativo", true);
      const analistas = (analistasTodos ?? []).filter((a) => analistaAtendeUnidade(a, vagaUnidadeId));

      if (!analistas.length) return;

      const vagaUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas/${vagaId}`;
      const template = getEmailTemplate("nova_vaga_criada", {
        nome: "",
        cargo: vagaTitulo,
        tipoServico: vagaTipo,
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
        confidencial: vagaConfidencial,
        vagaUrl,
        nomeCliente: vagaClienteNome ?? undefined,
        feeRsPercentual: vagaFeeRsPercentual,
        feeRsPrazoCobranca: vagaFeeRsPrazoCobranca,
        taxaCancelamento: vagaTaxaCancelamento,
        taxaCancelamentoPercentual: vagaTaxaCancelamentoPercentual,
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

      const { error: errNotifSino } = await svcAfter.from("notificacoes_analista").insert({
        tipo: "vaga_criada",
        titulo: `${vagaConfidencial ? "🔴 [CONFIDENCIAL] " : ""}Nova vaga criada: ${vagaTitulo}`,
        mensagem: `Vaga "${vagaTitulo}" (${TIPO_LABELS[vagaTipo] ?? vagaTipo}) foi criada e está aberta.`,
        vaga_id: vagaId,
        unidade_id: vagaUnidadeId,
      });
      if (errNotifSino) console.error("[POST /api/vagas] Erro ao registrar notificação de sino:", errNotifSino.message);
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/vagas]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
