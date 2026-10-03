import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { avisarIndicacaoRecebida } from "@/lib/avisoIndicacaoRecebida";
import { parseBody, portalIndicarCandidatoSchema } from "@/lib/schemas";
import { resolverUnidadeCliente } from "@/lib/unidadeAuth";

const TIPO_LABEL: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização",
};

// GET: "Minhas indicações" do cliente (status de acompanhamento) — mesma lógica de listagem
// simples de /api/portal/solicitacoes, sem os extras de vaga_status/alteração que aquela
// tela tem porque essa solicitação não vira uma vaga, vira um candidato.
export async function GET() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();
  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data, error } = await service
    .from("solicitacoes_indicacao_candidato")
    .select("id, candidato_nome, candidato_telefone, status, motivo_recusa, created_at, vagas(titulo)")
    .eq("cliente_id", cu.cliente_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createPortalClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const service = createServiceClient();
    const { data: cu } = await service
      .from("cliente_usuarios")
      .select("cliente_id")
      .eq("user_id", user.id)
      .single();
    if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

    const body = await request.json();
    const parsed = parseBody(portalIndicarCandidatoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const dados = parsed.data;

    // Vaga precisa ser do próprio cliente e estar aberta — nunca confia no vaga_id só porque
    // veio no body (o mesmo cuidado de portal/avaliar com encaminhamento_id).
    const { data: vaga } = await service
      .from("vagas")
      .select("id, titulo, tipo_servico, cliente_id, unidade_id, status")
      .eq("id", dados.vaga_id)
      .eq("cliente_id", cu.cliente_id)
      .maybeSingle();
    if (!vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
    if (vaga.status !== "aberta") {
      return NextResponse.json({ error: "Esta vaga não está mais aberta." }, { status: 409 });
    }

    const { data: cliente } = await service
      .from("clientes")
      .select("nome")
      .eq("id", cu.cliente_id)
      .single();
    const clienteNome = cliente?.nome ?? "Cliente";

    const unidadeId = await resolverUnidadeCliente(cu.cliente_id);
    if (!unidadeId) {
      console.error(`[portal/indicar-candidato] Cliente sem unidade resolvida (cliente_id=${cu.cliente_id}).`);
      return NextResponse.json({ error: "Não foi possível registrar a indicação." }, { status: 500 });
    }

    const { data: solicitacao, error } = await service
      .from("solicitacoes_indicacao_candidato")
      .insert({
        cliente_id: cu.cliente_id,
        cliente_nome: clienteNome,
        unidade_id: unidadeId,
        vaga_id: vaga.id,
        solicitado_por_user_id: user.id,
        candidato_nome: dados.candidato_nome,
        candidato_telefone: dados.candidato_telefone,
        curriculo_url: dados.curriculo_url || null,
        admissao_data_inicio: dados.admissao_data_inicio || null,
        admissao_salario: dados.admissao_salario ?? null,
        admissao_salario_hora: dados.admissao_salario_hora ?? null,
        admissao_setor: dados.admissao_setor || null,
        admissao_centro_custo: dados.admissao_centro_custo || null,
        admissao_horario: dados.admissao_horario || null,
        admissao_gestor: dados.admissao_gestor || null,
        admissao_periodo_experiencia: dados.admissao_periodo_experiencia || null,
        admissao_funcao: dados.admissao_funcao || null,
        admissao_turno: dados.admissao_turno || null,
        admissao_escala: dados.admissao_escala || null,
        admissao_tempo_contrato: dados.admissao_tempo_contrato || null,
        admissao_vt: dados.admissao_vt ?? null,
        admissao_exame_responsavel: dados.admissao_exame_responsavel || null,
        admissao_local_integracao: dados.admissao_local_integracao || null,
        admissao_observacoes: dados.admissao_observacoes || null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const tipoLbl = TIPO_LABEL[vaga.tipo_servico] ?? vaga.tipo_servico;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.15em">SALMAZOS RH &amp; SERVIÇOS</p>
    <h1 style="color:#FFD700;margin:0;font-size:20px">🧑‍💼 Indicação Direta de Candidato</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151"><strong style="color:#111827">${clienteNome}</strong> indicou um candidato direto pra registro, sem passar pela triagem:</p>
    <div style="margin-bottom:20px;padding:14px 16px;background:#DBEAFE;border-radius:10px;border:1px solid #93C5FD">
      <p style="margin:0;font-size:16px;font-weight:700;color:#1D4ED8">${dados.candidato_nome}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#1E40AF">${dados.candidato_telefone}</p>
    </div>
    <div style="margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:8px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Vaga</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${vaga.titulo}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${tipoLbl}</p>
    </div>
    ${dados.curriculo_url ? `<p style="margin:0 0 20px;font-size:13px;color:#374151">📎 Currículo anexado — revise a indicação no painel para baixar.</p>` : ""}
    <div style="text-align:center;padding-top:24px;border-top:1px solid #f3f4f6;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/vagas" style="display:inline-block;padding:12px 28px;background:#000;color:#FFD700;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">Revisar indicação</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© 2026 Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;

    // Avisos internos (e-mail e sino, isolados entre si; o popup lê da mesma lista). Nunca lança:
    // a indicação já está gravada e o cliente recebe 201 mesmo se um canal falhar.
    await avisarIndicacaoRecebida({
      solicitacaoId: solicitacao.id,
      unidadeId,
      vagaId: vaga.id,
      vagaTitulo: vaga.titulo,
      clienteNome,
      candidatoNome: dados.candidato_nome,
      subject: `🧑‍💼 Indicação Direta de Candidato — ${clienteNome}`,
      html,
    });

    return NextResponse.json({ success: true, id: solicitacao.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/portal/indicar-candidato]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
