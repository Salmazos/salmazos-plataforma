import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, funcionarioMotEventoCreateSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { afastamentoEmAberto, eventosMotValidos, resumirFuncionarioMot, type EventoMotLinha } from "@/lib/contratoMotEventos";
import { hojeBrasiliaISO, formatarDataBR } from "@/lib/rescisaoProgramada";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

interface Params {
  params: Promise<{ id: string }>;
}

const COLUNAS_EVENTO = "id, funcionario_id, tipo, data_evento, tipo_beneficio, observacoes, arquivo_path, nome_arquivo_original, corrige_evento_id, criado_por, criado_em";

// Histórico + contexto do funcionário pro modal do popup e pro bloco "Contrato MOT" da ficha. Tudo derivado
// do [id] da URL — nada de cliente_id/funcionario_id vindo do cliente. O corpo desta resposta tem dado de
// saúde (afastamento/benefício): só chega a quem passa no gate de RH + unidade, nunca ao portal.
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();
  const [funcionarioRes, eventosRes, rescisoesRes] = await Promise.all([
    svc
      .from("funcionarios")
      .select("id, nome_completo, cargo, empresa, cliente_id, status, tipo_servico, data_admissao, clientes(nome)")
      .eq("id", id)
      .maybeSingle(),
    svc.from("funcionario_mot_eventos").select(COLUNAS_EVENTO).eq("funcionario_id", id).order("data_evento", { ascending: false }).order("criado_em", { ascending: false }),
    svc.from("rescisoes").select("id, funcionario_id, data_desligamento").eq("funcionario_id", id),
  ]);
  if (!funcionarioRes.data) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (eventosRes.error) {
    console.error("[mot-eventos GET] Erro ao buscar eventos:", eventosRes.error.message);
    return NextResponse.json({ error: "Não foi possível carregar o histórico do contrato. Tente novamente." }, { status: 500 });
  }

  const eventos = (eventosRes.data ?? []) as (EventoMotLinha & Record<string, unknown>)[];
  const anulados = new Set(eventos.map((e) => e.corrige_evento_id).filter((v): v is string => !!v));

  // Sem FK direta de criado_por pra analistas_perfil — mesma segunda consulta de funcionario_contratos.
  const userIds = [...new Set(eventos.map((e) => e.criado_por as string | null).filter((v): v is string => !!v))];
  const { data: perfis } = userIds.length
    ? await svc.from("analistas_perfil").select("user_id, nome_completo").in("user_id", userIds)
    : { data: [] };
  const nomePorUserId = new Map((perfis ?? []).map((p) => [p.user_id, p.nome_completo]));

  const hoje = hojeBrasiliaISO();
  const rescisao = (rescisoesRes.data ?? [])[0] ?? null;
  return NextResponse.json({
    data: {
      funcionario: funcionarioRes.data,
      hoje,
      eventos: eventos.map((e) => ({
        ...e,
        anulado: anulados.has(e.id),
        eh_correcao: e.corrige_evento_id !== null,
        criado_por_nome: e.criado_por ? nomePorUserId.get(e.criado_por as string) ?? "Usuário removido" : null,
      })),
      resumo: resumirFuncionarioMot(eventos, rescisoesRes.data ?? [], hoje) ?? null,
      rescisao_programada: rescisao,
      // Só pra esconder os botões "Corrigir" e "Cancelar rescisão programada" — as rotas conferem de novo.
      pode_corrigir: PAPEIS_FULL_ACCESS.includes(user.app_metadata?.role ?? "analista"),
    },
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(funcionarioMotEventoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const { data: funcionario } = await svc
    .from("funcionarios")
    .select("id, status, tipo_servico, data_admissao")
    .eq("id", id)
    .maybeSingle();
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (funcionario.status !== "ativo") {
    return NextResponse.json({ error: "Este funcionário já está desligado." }, { status: 409 });
  }
  if (funcionario.tipo_servico !== "mao_obra_temporaria") {
    return NextResponse.json({ error: "Prorrogação e afastamento só valem para funcionário de mão de obra temporária." }, { status: 400 });
  }

  // Só a rescisão programada aceita data futura — evento é fato que já aconteceu.
  const hoje = hojeBrasiliaISO();
  if (d.data_evento > hoje) {
    return NextResponse.json({ error: "A data do evento não pode ser futura." }, { status: 400 });
  }
  if (funcionario.data_admissao && d.data_evento < funcionario.data_admissao) {
    return NextResponse.json({ error: `A data do evento não pode ser anterior à admissão (${formatarDataBR(funcionario.data_admissao)}).` }, { status: 400 });
  }

  if (d.arquivo_path && (!d.arquivo_path.startsWith(`aditivos/${id}/`) || d.arquivo_path.includes(".."))) {
    return NextResponse.json({ error: "Anexo inválido para este funcionário." }, { status: 400 });
  }

  const [eventosRes, rescisoesRes] = await Promise.all([
    svc.from("funcionario_mot_eventos").select("id, funcionario_id, tipo, data_evento, corrige_evento_id, criado_em").eq("funcionario_id", id),
    svc.from("rescisoes").select("id").eq("funcionario_id", id),
  ]);
  if (eventosRes.error) {
    console.error("[mot-eventos POST] Erro ao buscar eventos do funcionário:", eventosRes.error.message);
    return NextResponse.json({ error: "Não foi possível registrar o evento. Tente novamente." }, { status: 500 });
  }

  if ((rescisoesRes.data ?? []).length > 0 && d.tipo !== "afastamento_fim") {
    return NextResponse.json({ error: "Este funcionário tem rescisão programada." }, { status: 409 });
  }

  const eventosValidos = eventosMotValidos((eventosRes.data ?? []) as EventoMotLinha[]);

  // Uma prorrogação por funcionário (não anulada). Lançou errado? Corrigir no histórico anula a linha e libera
  // um novo lançamento — nunca duas prorrogações valendo ao mesmo tempo.
  if (d.tipo === "prorrogacao" && eventosValidos.some((e) => e.tipo === "prorrogacao")) {
    return NextResponse.json({ error: "Este funcionário já tem uma prorrogação registrada. Se houve erro de lançamento, use \"Corrigir\" no histórico." }, { status: 409 });
  }

  const afastamento = afastamentoEmAberto(eventosValidos);
  if (d.tipo === "afastamento_inicio" && afastamento.aberto) {
    return NextResponse.json({ error: "Já existe um afastamento em aberto. Encerre-o antes de registrar outro." }, { status: 409 });
  }
  if (d.tipo === "afastamento_fim") {
    if (!afastamento.aberto) {
      return NextResponse.json({ error: "Não há afastamento em aberto para encerrar." }, { status: 409 });
    }
    if (afastamento.desde && d.data_evento < afastamento.desde) {
      return NextResponse.json({ error: `O fim do afastamento não pode ser anterior ao início (${formatarDataBR(afastamento.desde)}).` }, { status: 400 });
    }
  }

  const { data, error } = await svc
    .from("funcionario_mot_eventos")
    .insert({
      funcionario_id: id,
      tipo: d.tipo,
      data_evento: d.data_evento,
      tipo_beneficio: d.tipo === "afastamento_inicio" ? d.tipo_beneficio ?? null : null,
      observacoes: d.observacoes || null,
      arquivo_path: d.tipo === "prorrogacao" ? d.arquivo_path ?? null : null,
      nome_arquivo_original: d.tipo === "prorrogacao" && d.arquivo_path ? d.nome_arquivo_original ?? null : null,
      criado_por: user.id,
    })
    .select(COLUNAS_EVENTO)
    .single();
  if (error) {
    console.error("[mot-eventos POST] Erro ao gravar evento:", error.message);
    return NextResponse.json({ error: "Não foi possível registrar o evento. Tente novamente." }, { status: 500 });
  }

  // Auditoria SÓ com ids e tipo — benefício e observação são dado de saúde e /painel/audit-logs é mais
  // largo que esta tela.
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "funcionario_mot_evento_registrado",
    entidade: "funcionario_mot_eventos",
    entidade_id: data.id,
    detalhes: { funcionario_id: id, tipo: d.tipo },
  });

  return NextResponse.json({ data }, { status: 201 });
}
