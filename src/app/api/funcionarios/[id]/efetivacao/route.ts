import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioEfetivarSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { hojeBrasiliaISO, formatarDataBR } from "@/lib/rescisaoProgramada";
import { TIPOS_COM_VENCIMENTO_CONTRATO } from "@/lib/contratoMotStatus";
import { ehErroColunaAusente } from "@/lib/funcionarioEfetivacao";

interface Params {
  params: Promise<{ id: string }>;
}

const MIGRACAO_PENDENTE = "A efetivação ainda não está disponível neste ambiente. Tente novamente em instantes.";
const ERRO_GENERICO = "Não foi possível concluir a operação. Tente novamente.";

// Efetivar NÃO é desligamento: funcionarios.status e rescisoes não são tocados. Só o relógio de vencimento de contrato
// (90/180/270 dias) para. Mesmo gate das demais ações do RH (checarPapelFuncionarios + unidade), decisão do Olver.
async function autorizar(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return { erro: acessoNegado };
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, id);
  if (bloqueioUnidade) return { erro: bloqueioUnidade };
  return { user };
}

async function carregar(id: string) {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("funcionarios")
    .select("id, status, tipo_servico, data_admissao, efetivado_em")
    .eq("id", id)
    .maybeSingle();
  return { svc, data, error };
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await autorizar(id);
  if (auth.erro) return auth.erro;
  const user = auth.user;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(funcionarioEfetivarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const { svc, data: funcionario, error: erroBusca } = await carregar(id);
  if (erroBusca) {
    if (ehErroColunaAusente(erroBusca)) return NextResponse.json({ error: MIGRACAO_PENDENTE }, { status: 503 });
    console.error("[efetivacao POST] Erro ao buscar funcionário:", erroBusca.message);
    return NextResponse.json({ error: ERRO_GENERICO }, { status: 500 });
  }
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (funcionario.status !== "ativo") {
    return NextResponse.json({ error: "Este funcionário já está desligado." }, { status: 409 });
  }
  if (!(TIPOS_COM_VENCIMENTO_CONTRATO as readonly string[]).includes(funcionario.tipo_servico ?? "")) {
    return NextResponse.json({ error: "A efetivação só vale para funcionário de mão de obra temporária ou de terceirização." }, { status: 400 });
  }
  if (funcionario.efetivado_em) {
    return NextResponse.json({ error: "Este funcionário já está efetivado." }, { status: 409 });
  }

  // Rescisão programada = funcionário saindo: mesma recusa que prorrogar/registrar afastamento (mot-eventos).
  // Afastamento em aberto NÃO impede: efetivar só para o relógio de vencimento, não mexe no afastamento.
  const { data: rescisoes, error: erroRescisao } = await svc.from("rescisoes").select("id").eq("funcionario_id", id).limit(1);
  if (erroRescisao) {
    console.error("[efetivacao POST] Erro ao buscar rescisões:", erroRescisao.message);
    return NextResponse.json({ error: ERRO_GENERICO }, { status: 500 });
  }
  if ((rescisoes ?? []).length > 0) {
    return NextResponse.json({ error: "Este funcionário tem rescisão programada." }, { status: 409 });
  }

  const hoje = hojeBrasiliaISO();
  if (d.data_efetivacao > hoje) {
    return NextResponse.json({ error: "A data da efetivação não pode ser futura." }, { status: 400 });
  }
  if (funcionario.data_admissao && d.data_efetivacao < funcionario.data_admissao) {
    return NextResponse.json({ error: `A data da efetivação não pode ser anterior à admissão (${formatarDataBR(funcionario.data_admissao)}).` }, { status: 400 });
  }

  // .is("efetivado_em", null) + status ativo no próprio UPDATE: dois cliques simultâneos não efetivam duas vezes.
  const observacao = d.observacao?.trim() ? d.observacao.trim() : null;
  const { data: atualizado, error } = await svc
    .from("funcionarios")
    .update({ efetivado_em: d.data_efetivacao, efetivado_por: user.id, efetivado_obs: observacao })
    .eq("id", id)
    .eq("status", "ativo")
    .is("efetivado_em", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (ehErroColunaAusente(error)) return NextResponse.json({ error: MIGRACAO_PENDENTE }, { status: 503 });
    console.error("[efetivacao POST] Erro ao gravar:", error.message);
    return NextResponse.json({ error: ERRO_GENERICO }, { status: 500 });
  }
  if (!atualizado) return NextResponse.json({ error: "Este funcionário já está efetivado." }, { status: 409 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "funcionario_efetivado",
    entidade: "funcionarios",
    entidade_id: id,
    detalhes: { funcionario_id: id, data_efetivacao: d.data_efetivacao, observacao },
  });

  return NextResponse.json({ data: { id, efetivado_em: d.data_efetivacao } });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await autorizar(id);
  if (auth.erro) return auth.erro;
  const user = auth.user;

  const { svc, data: funcionario, error: erroBusca } = await carregar(id);
  if (erroBusca) {
    if (ehErroColunaAusente(erroBusca)) return NextResponse.json({ error: MIGRACAO_PENDENTE }, { status: 503 });
    console.error("[efetivacao DELETE] Erro ao buscar funcionário:", erroBusca.message);
    return NextResponse.json({ error: ERRO_GENERICO }, { status: 500 });
  }
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (funcionario.status !== "ativo") {
    return NextResponse.json({ error: "Este funcionário já está desligado." }, { status: 409 });
  }
  if (!funcionario.efetivado_em) {
    return NextResponse.json({ error: "Este funcionário não está efetivado." }, { status: 409 });
  }

  const dataAnulada = funcionario.efetivado_em as string;
  const { data: atualizado, error } = await svc
    .from("funcionarios")
    .update({ efetivado_em: null, efetivado_por: null, efetivado_obs: null })
    .eq("id", id)
    .eq("status", "ativo")
    .not("efetivado_em", "is", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[efetivacao DELETE] Erro ao gravar:", error.message);
    return NextResponse.json({ error: ERRO_GENERICO }, { status: 500 });
  }
  if (!atualizado) return NextResponse.json({ error: "Este funcionário não está efetivado." }, { status: 409 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "funcionario_efetivacao_desfeita",
    entidade: "funcionarios",
    entidade_id: id,
    detalhes: { funcionario_id: id, data_efetivacao_anulada: dataAnulada },
  });

  return NextResponse.json({ data: { id, efetivado_em: null } });
}
