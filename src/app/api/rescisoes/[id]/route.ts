import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, rescisaoUpdateSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { registrarAuditoria, diffCampos, resolverNomeUsuario } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Mesmo bucket/pasta usado em aso-upload-url/route.ts (criação) — ver comentário lá sobre
// reaproveitar "admissao-docs" em vez de bucket dedicado.
const BUCKET = "admissao-docs";

// funcionario_id e empresa não entram aqui (fora do schema de update) — identidade do
// registro, travados desde o lançamento.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(rescisaoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();

  const { data: antes, error: antesError } = await svc
    .from("rescisoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (antesError || !antes) return NextResponse.json({ error: "Rescisão não encontrada." }, { status: 404 });

  const campos: Record<string, unknown> = {};
  if (d.data_desligamento !== undefined) campos.data_desligamento = d.data_desligamento;
  if (d.modalidade !== undefined) campos.modalidade = d.modalidade;
  if (d.entrevista_desligamento !== undefined) campos.entrevista_desligamento = d.entrevista_desligamento;
  if (d.funcionario_assinou !== undefined) campos.funcionario_assinou = d.funcionario_assinou;
  if (d.valor_rescisao !== undefined) campos.valor_rescisao = d.valor_rescisao;
  if (d.data_pagamento_rescisao !== undefined) campos.data_pagamento_rescisao = d.data_pagamento_rescisao;
  if (d.valor_guia !== undefined) campos.valor_guia = d.valor_guia ?? null;
  if (d.data_pagamento_guia !== undefined) campos.data_pagamento_guia = d.data_pagamento_guia ?? null;
  if (d.pensao !== undefined) campos.pensao = d.pensao ?? null;
  if (d.farmacia !== undefined) campos.farmacia = d.farmacia ?? null;
  if (d.faturado !== undefined) campos.faturado = d.faturado;
  if (d.aso_documento_path !== undefined) campos.aso_documento_path = d.aso_documento_path ?? null;

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("rescisoes")
    .update(campos)
    .eq("id", id)
    .select("*, funcionarios(nome_completo, cargo)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ASO substituído: remove o arquivo antigo do Storage só depois do update confirmado —
  // se o update tivesse falhado, a referência antiga continuaria válida e não deveríamos
  // ter apagado o arquivo que ela aponta.
  if (
    campos.aso_documento_path !== undefined &&
    antes.aso_documento_path &&
    antes.aso_documento_path !== campos.aso_documento_path
  ) {
    const { error: removeError } = await svc.storage.from(BUCKET).remove([antes.aso_documento_path]);
    if (removeError) {
      console.error(
        `[rescisoes] Rescisão ${id} atualizada, mas falha ao remover ASO antigo do Storage (path=${antes.aso_documento_path}):`,
        removeError.message
      );
    }
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "rescisao_atualizada",
    entidade: "rescisoes",
    entidade_id: id,
    detalhes: { diff: diffCampos(antes, campos) },
  });

  return NextResponse.json({ data });
}
