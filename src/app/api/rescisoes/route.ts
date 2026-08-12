import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, rescisaoCreateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { dispararAvisosRescisao } from "@/lib/dispararAvisosRescisao";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const empresa = searchParams.get("empresa");
  const faturado = searchParams.get("faturado");
  const dataInicio = searchParams.get("data_inicio");
  const dataFim = searchParams.get("data_fim");

  const svc = createServiceClient();
  let query = svc
    .from("rescisoes")
    .select("*, funcionarios(nome_completo, cargo)")
    .order("data_desligamento", { ascending: false });

  if (empresa) query = query.eq("empresa", empresa);
  if (faturado === "true") query = query.eq("faturado", true);
  if (faturado === "false") query = query.eq("faturado", false);
  if (dataInicio) query = query.gte("data_desligamento", dataInicio);
  if (dataFim) query = query.lte("data_desligamento", dataFim);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(rescisaoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: funcionario, error: funcionarioError } = await svc
    .from("funcionarios")
    .select("id, status")
    .eq("id", parsed.data.funcionario_id)
    .single();
  if (funcionarioError || !funcionario) {
    return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  }
  if (funcionario.status === "desligado") {
    return NextResponse.json({ error: "Este funcionário já está desligado." }, { status: 400 });
  }

  const { data: rescisao, error } = await svc
    .from("rescisoes")
    .insert({
      funcionario_id: parsed.data.funcionario_id,
      empresa: parsed.data.empresa,
      data_desligamento: parsed.data.data_desligamento,
      modalidade: parsed.data.modalidade,
      entrevista_desligamento: parsed.data.entrevista_desligamento,
      funcionario_assinou: parsed.data.funcionario_assinou,
      valor_rescisao: parsed.data.valor_rescisao,
      data_pagamento_rescisao: parsed.data.data_pagamento_rescisao,
      valor_guia: parsed.data.valor_guia ?? null,
      data_pagamento_guia: parsed.data.data_pagamento_guia ?? null,
      pensao: parsed.data.pensao ?? null,
      farmacia: parsed.data.farmacia ?? null,
      faturado: parsed.data.faturado,
      aso_documento_path: parsed.data.aso_documento_path ?? null,
      criado_por: user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A rescisão já foi criada com sucesso nesse ponto — a mudança de status do funcionário
  // é consequência dela, não pré-condição. Uma falha aqui não deve apagar o lançamento já
  // salvo; só fica registrada pra correção manual (mesmo padrão anti-void já usado na
  // criação automática de funcionarios em gerar-pdf/route.ts).
  const { error: statusError } = await svc
    .from("funcionarios")
    .update({ status: "desligado" })
    .eq("id", parsed.data.funcionario_id);
  if (statusError) {
    console.error(
      `[rescisoes] Rescisão ${rescisao.id} criada mas falha ao atualizar status do funcionário ${parsed.data.funcionario_id}:`,
      statusError.message
    );
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "rescisao_criada",
    entidade: "rescisoes",
    entidade_id: rescisao.id,
    detalhes: { funcionario_id: parsed.data.funcionario_id, empresa: parsed.data.empresa, modalidade: parsed.data.modalidade },
  });

  // Disparo síncrono do momento "lançamento" — anti-void: aguardado, mas
  // dispararAvisosRescisao nunca lança exceção, então nunca bloqueia esta resposta.
  await dispararAvisosRescisao(rescisao.id, "lancamento");

  return NextResponse.json({ data: rescisao });
}
