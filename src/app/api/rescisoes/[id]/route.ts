import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, rescisaoUpdateSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { registrarAuditoria, diffCampos, resolverNomeUsuario } from "@/lib/audit";
import { checarAcessoRescisaoRH } from "@/lib/rhUnidadeAuth";
import { avisarRescisaoPaga } from "@/lib/dispararAvisosRescisao";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { hojeBrasiliaISO, dataJaChegou, dataEhFutura } from "@/lib/rescisaoProgramada";

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
  const bloqueioUnidade = await checarAcessoRescisaoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;
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

  // Mudança da data de desligamento (rescisão programada): enquanto o funcionário está 'ativo' vale qualquer
  // data, e se a nova data já chegou ele vira 'desligado' no ato. Funcionário já 'desligado' nunca volta a ter
  // data futura (não existe "reativar" — a data futura só faz sentido pra rescisão ainda programada).
  let aplicarDesligamento = false;
  if (campos.data_desligamento !== undefined && campos.data_desligamento !== antes.data_desligamento) {
    const { data: funcionario } = await svc.from("funcionarios").select("status").eq("id", antes.funcionario_id).maybeSingle();
    const chegou = dataJaChegou(campos.data_desligamento as string, hojeBrasiliaISO());
    if (funcionario?.status === "desligado" && !chegou) {
      return NextResponse.json({ error: "Funcionário já desligado: a data de desligamento não pode ser futura." }, { status: 400 });
    }
    aplicarDesligamento = funcionario?.status === "ativo" && chegou;
  }

  const { data, error } = await svc
    .from("rescisoes")
    .update(campos)
    .eq("id", id)
    .select("*, funcionarios(nome_completo, cargo)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!antes.faturado && campos.faturado === true) await avisarRescisaoPaga(id, svc);

  // A rescisão já foi atualizada — a mudança de status é consequência dela (mesmo padrão do POST): falha aqui
  // só é logada, o cron rescisao-avisos tenta de novo no dia seguinte.
  if (aplicarDesligamento) {
    const { error: statusError } = await svc
      .from("funcionarios")
      .update({ status: "desligado" })
      .eq("id", antes.funcionario_id)
      .eq("status", "ativo");
    if (statusError) {
      console.error(`[rescisoes] Rescisão ${id} atualizada mas falha ao desligar o funcionário ${antes.funcionario_id}:`, statusError.message);
    }
  }

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
    detalhes: { diff: diffCampos(antes, campos), ...(aplicarDesligamento ? { funcionario_desligado: true } : {}) },
  });

  return NextResponse.json({ data });
}

// Cancelar rescisão PROGRAMADA (decisão do Olver): só PAPEIS_FULL_ACCESS, só enquanto a data de desligamento
// ainda é futura e o funcionário continua 'ativo'. Rescisão já efetivada nunca é apagada por aqui (não existe
// reativação de funcionário desligado). O ASO demissional anexado fica no Storage (só a linha é apagada) —
// o caminho sobra na auditoria.
export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;
  const fullAccessNegado = checarPapelFullAccess(user);
  if (fullAccessNegado) return fullAccessNegado;

  const { id } = await params;
  const bloqueioUnidade = await checarAcessoRescisaoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();
  const { data: rescisao } = await svc
    .from("rescisoes")
    .select("id, funcionario_id, data_desligamento, modalidade, aso_documento_path")
    .eq("id", id)
    .maybeSingle();
  if (!rescisao) return NextResponse.json({ error: "Rescisão não encontrada." }, { status: 404 });

  const hojeISO = hojeBrasiliaISO();
  if (!dataEhFutura(rescisao.data_desligamento, hojeISO)) {
    return NextResponse.json({ error: "Só é possível cancelar rescisão programada (data de desligamento futura)." }, { status: 409 });
  }
  const { data: funcionario } = await svc.from("funcionarios").select("status").eq("id", rescisao.funcionario_id).maybeSingle();
  if (funcionario?.status !== "ativo") {
    return NextResponse.json({ error: "O funcionário já está desligado." }, { status: 409 });
  }

  // O filtro da data repete a regra dentro do próprio DELETE: se a data virar hoje entre a checagem e o delete
  // (virada do dia), nada é apagado.
  const { data: apagadas, error } = await svc
    .from("rescisoes")
    .delete()
    .eq("id", id)
    .gt("data_desligamento", hojeISO)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!apagadas || apagadas.length === 0) {
    return NextResponse.json({ error: "Só é possível cancelar rescisão programada (data de desligamento futura)." }, { status: 409 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "rescisao_programada_cancelada",
    entidade: "rescisoes",
    entidade_id: id,
    detalhes: {
      funcionario_id: rescisao.funcionario_id,
      data_desligamento: rescisao.data_desligamento,
      modalidade: rescisao.modalidade,
      aso_documento_path: rescisao.aso_documento_path ?? null,
    },
  });

  return NextResponse.json({ success: true });
}
