import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { hojeSaoPaulo } from "@/lib/comercial";
import { registrarAuditoria } from "@/lib/audit";
import { CHAVES_PARAMETROS_MOT, type ParametrosMot } from "@/lib/propostaMotCalculo";
import { LIMITES_PARAMETROS_MOT, parametrosMotCreateSchema } from "@/lib/propostaMot";

// Percentuais da planilha de verbas do MOT (taxa administrativa, encargos, INSS patronal, FGTS e retenções), em pontos-base inteiros (31,2% = 3120).
// SÓ a diretoria/superuser lê e altera; o vendedor não vê nem edita percentual (a proposta apenas guarda o que foi usado, no snapshot).
// Versionado por vigente_desde e SOMENTE INSERÇÃO: não existe PATCH/PUT/DELETE aqui, e o banco barra UPDATE/DELETE em proposta_mot_parametros
// (gatilho de imutabilidade). Mudar um percentual é inserir uma vigência nova; o que já foi enviado não muda, porque o snapshot da revisão congela os percentuais.

const MSG_SO_DIRETORIA = "Só a diretoria acessa os percentuais do MOT.";
const MSG_VIGENCIA_REPETIDA = "Já existe uma vigência com esta data. Escolha outra data.";

async function contextoDiretoria() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const r = await exigirContextoPropostas(user);
  if (r.erro) return { erro: r.erro };
  if (!r.ctx.gestor) return { erro: NextResponse.json({ error: MSG_SO_DIRETORIA }, { status: 403 }) };
  return { ctx: r.ctx };
}

// Vigentes hoje + histórico (mais recente primeiro) + faixas permitidas.
export async function GET() {
  const r = await contextoDiretoria();
  if ("erro" in r) return r.erro;

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  const [{ data: vigentes, error: erroVigentes }, { data: historico, error: erroHistorico }] = await Promise.all([
    svc.rpc("parametros_mot_vigentes", { p_hoje: hoje }),
    svc.from("proposta_mot_parametros").select("*").order("vigente_desde", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (erroVigentes || erroHistorico) {
    console.error("[propostas] Percentuais do MOT não lidos:", (erroVigentes ?? erroHistorico)?.message);
    return NextResponse.json({ error: "Não foi possível carregar os percentuais do MOT." }, { status: 500 });
  }

  const autores = [...new Set((historico ?? []).map((h) => h.alterado_por as string | null).filter((a): a is string => !!a))];
  const { data: nomes } = autores.length ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", autores) : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((nomes ?? []).map((n) => [n.id, n.nome_completo]));

  const vigente = (Array.isArray(vigentes) ? vigentes[0] : vigentes) ?? null;
  return NextResponse.json({
    hoje,
    vigentes: vigente,
    historico: (historico ?? []).map((h) => ({ ...h, alterado_por_nome: h.alterado_por ? nomePorId.get(h.alterado_por as string) ?? null : null })),
    limites: LIMITES_PARAMETROS_MOT,
  });
}

// Nova vigência. Não retroativa: vigente_desde >= hoje (o passado não é reescrito).
export async function POST(request: NextRequest) {
  const r = await contextoDiretoria();
  if ("erro" in r) return r.erro;
  const { ctx } = r;

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return NextResponse.json({ error: "Informe a data de início e todos os percentuais, em pontos-base inteiros (ex.: 3120 para 31,2%)." }, { status: 400 });
  }
  const parsed = parametrosMotCreateSchema.safeParse(corpo);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const { vigente_desde, ...percentuais } = parsed.data;

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  if (vigente_desde < hoje) {
    return NextResponse.json({ error: "A vigência não pode começar antes de hoje: os percentuais que já valeram não são reescritos." }, { status: 400 });
  }

  // Uma vigência por data: repetir a data é recusado (409). A checagem é feita aqui; se o banco passar a ter índice único em vigente_desde, o 23505
  // da corrida (duas chamadas ao mesmo tempo) cai na mesma mensagem, mais abaixo.
  const { data: existente, error: erroExistente } = await svc.from("proposta_mot_parametros").select("id").eq("vigente_desde", vigente_desde).limit(1);
  if (erroExistente) {
    console.error("[propostas] Vigências do MOT não conferidas:", erroExistente.message);
    return NextResponse.json({ error: "Não foi possível salvar os percentuais. Nada foi alterado." }, { status: 500 });
  }
  if ((existente ?? []).length > 0) return NextResponse.json({ error: MSG_VIGENCIA_REPETIDA }, { status: 409 });

  const { data: anterior } = await svc.rpc("parametros_mot_vigentes", { p_hoje: vigente_desde });
  const antes = (Array.isArray(anterior) ? anterior[0] : anterior) as (Record<string, unknown> & { vigente_desde?: string }) | null | undefined;

  const { data: nova, error } = await svc
    .from("proposta_mot_parametros")
    .insert({ vigente_desde, ...percentuais, alterado_por: ctx.analistaId })
    .select()
    .single();
  if (error?.code === "23505") return NextResponse.json({ error: MSG_VIGENCIA_REPETIDA }, { status: 409 });
  if (error || !nova) {
    console.error("[propostas] Percentuais do MOT não gravados:", error?.message);
    return NextResponse.json({ error: "Não foi possível salvar os percentuais. Nada foi alterado." }, { status: 500 });
  }

  const resumo = (p: Record<string, unknown> | null | undefined) => (p ? Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k: keyof ParametrosMot) => [k, p[k] ?? null])) : null);
  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "parametros_mot_alterados",
    entidade: "proposta_mot_parametros",
    entidade_id: nova.id as string,
    unidade_id: ctx.unidadeId,
    detalhes: { vigente_desde, antes: resumo(antes), antes_vigente_desde: antes?.vigente_desde ?? null, depois: resumo(nova) },
  });

  return NextResponse.json({ data: nova }, { status: 201 });
}
