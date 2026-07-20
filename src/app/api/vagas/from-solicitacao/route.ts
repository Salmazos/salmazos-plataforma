import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { parseBody, fromSolicitacaoSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(fromSolicitacaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { solicitacao_id } = parsed.data;

    const service = createServiceClient();

    const { data: sol, error: solErr } = await service
      .from("solicitacoes_vagas")
      .select("*")
      .eq("id", solicitacao_id)
      .single();

    if (solErr || !sol) {
      return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }

    if (sol.status !== "pendente") {
      return NextResponse.json({ error: "Esta solicitação já foi processada." }, { status: 409 });
    }

    const { data: perfil } = await service
      .from("analistas_perfil")
      .select("nome_completo")
      .eq("user_id", user.id)
      .single();

    const analistaNome = perfil?.nome_completo ?? user.email ?? "";

    const { data: vaga, error: vagaErr } = await service
      .from("vagas")
      .insert({
        titulo: sol.cargo,
        cliente_id: sol.cliente_id ?? null,
        tipo_servico: sol.tipo_servico,
        num_posicoes: sol.num_posicoes ?? 1,
        cidade: sol.cidade ?? null,
        estado: sol.estado ?? null,
        salario: sol.salario ?? null,
        horario: sol.horario_texto ?? null,
        requisitos: sol.requisitos ?? null,
        beneficios: sol.beneficios ?? null,
        habilidades_desejadas: [],
        status: "aberta",
        responsavel: analistaNome,
        observacoes: sol.observacoes ?? null,
        cliente_nome_temp: sol.cliente_nome ?? null,
      })
      .select("id")
      .single();

    if (vagaErr) return NextResponse.json({ error: vagaErr.message }, { status: 400 });

    await service
      .from("solicitacoes_vagas")
      .update({
        status: "aprovada",
        vaga_id: vaga.id,
        aprovada_por: analistaNome,
        aprovada_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", solicitacao_id);

    if (sol.cliente_id) {
      const { data: cliente } = await service
        .from("clientes")
        .select("contato_email")
        .eq("id", sol.cliente_id)
        .single();

      if (cliente?.contato_email) {
        const { subject, html } = getEmailTemplate("vaga_aprovada_cliente", {
          nome: sol.cliente_nome ?? "",
          cargo: sol.cargo,
          nomeCliente: sol.cliente_nome ?? "",
          numPosicoes: sol.num_posicoes ?? 1,
          cidade: sol.cidade ?? undefined,
        });
        try {
          await sendEmail({
            to: cliente.contato_email,
            subject,
            html,
            tipo: "vaga_aprovada_cliente",
            vaga_id: vaga.id,
          });
        } catch (emailErr) {
          console.error(`[from-solicitacao] Erro ao enviar e-mail de vaga aprovada ao cliente (vaga_id=${vaga.id}, cliente=${sol.cliente_nome ?? "?"}):`, emailErr);
        }
      }
    }

    return NextResponse.json({ success: true, vaga_id: vaga.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/vagas/from-solicitacao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
