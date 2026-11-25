import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, type ContextoPropostas } from "@/lib/propostasAcesso";
import { hojeSaoPaulo } from "@/lib/comercial";
import { registrarAuditoria } from "@/lib/audit";
import { CHAVES_PARAMETROS_TS } from "@/lib/propostaTsCalculo";
import { parametrosTsCreateSchema } from "@/lib/propostaTs";

// Percentuais da Terceirização (encargos, cobertura e preço), em pontos-base inteiros (23% = 2300). Versionado por vigente_desde e SOMENTE INSERÇÃO: não existe
// PATCH/PUT/DELETE aqui, e o banco barra UPDATE/DELETE em proposta_ts_parametros (gatilho de imutabilidade). Mudar um percentual é inserir uma vigência nova; o que já foi
// enviado não muda, porque o snapshot de cada revisão congela os percentuais usados.
// REGRA: os percentuais de preço (ISS, PIS, COFINS, IRPJ, CSLL, despesas, lucro, margem mínima e cobertura) NUNCA saem para vendedor, em nenhuma rota. Por isso AQUI, tanto a
// LEITURA quanto a ALTERAÇÃO são só do GESTOR e da DIRETORIA (diretoria e superuser): 403 para qualquer outro perfil, e nada é gravado. As demais rotas do TS (prévia,
// detalhe, criar, editar, situação) filtram os mesmos percentuais no servidor para quem não é gestor/diretoria (ver propostaTsParaPerfil e planilhaTsDeSnapshot).
//
// LINHA INICIAL: a vigência cadastrada pela migration (2026-11-25) é um ESPAÇO VAZIO: FGTS, INSS e multa preenchidos e os percentuais de preço (tributos, despesas, lucro)
// zerados. Até a diretoria gravar uma vigência VÁLIDA por esta rota, criar ou editar proposta TS devolve 422 ("Os percentuais de preço da Terceirização ainda não foram
// configurados pela diretoria."). A regra de vigência NÃO muda: não retroativa e uma por data (409 se repetir), então a primeira configuração vale de amanhã em diante;
// se um dia for preciso configurar no mesmo dia, a data da linha inicial é recuada por SQL (a tabela é imutável pela API).

const MSG_SO_DIRETORIA = "Só a diretoria altera os percentuais da Terceirização.";
const MSG_SEM_LEITURA = "Só a diretoria e a gestão acessam os percentuais da Terceirização.";
const MSG_VIGENCIA_REPETIDA = "Já existe uma vigência com esta data. Escolha outra data.";

async function contexto(escrita: boolean): Promise<{ ctx: ContextoPropostas } | { erro: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const r = await exigirContextoPropostas(user);
  if (r.erro) return { erro: r.erro };
  if (!r.ctx.gestor) return { erro: NextResponse.json({ error: escrita ? MSG_SO_DIRETORIA : MSG_SEM_LEITURA }, { status: 403 }) };
  return { ctx: r.ctx };
}

// Vigentes hoje + histórico (mais recente primeiro).
export async function GET() {
  const r = await contexto(false);
  if ("erro" in r) return r.erro;

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  const [{ data: vigentes, error: erroVigentes }, { data: historico, error: erroHistorico }] = await Promise.all([
    svc.rpc("parametros_ts_vigentes", { p_hoje: hoje }),
    svc.from("proposta_ts_parametros").select("*").order("vigente_desde", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (erroVigentes || erroHistorico) {
    console.error("[propostas] Percentuais do TS não lidos:", (erroVigentes ?? erroHistorico)?.message);
    return NextResponse.json({ error: "Não foi possível carregar os percentuais da Terceirização." }, { status: 500 });
  }

  const autores = [...new Set((historico ?? []).map((h) => h.alterado_por as string | null).filter((a): a is string => !!a))];
  const { data: nomes } = autores.length ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", autores) : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((nomes ?? []).map((n) => [n.id, n.nome_completo]));

  const vigente = (Array.isArray(vigentes) ? vigentes[0] : vigentes) ?? null;
  return NextResponse.json({
    hoje,
    vigentes: vigente,
    historico: (historico ?? []).map((h) => ({ ...h, alterado_por_nome: h.alterado_por ? nomePorId.get(h.alterado_por as string) ?? null : null })),
  });
}

// Nova vigência. Não retroativa: vigente_desde >= hoje (o passado não é reescrito). Uma vigência por data (409).
export async function POST(request: NextRequest) {
  const r = await contexto(true);
  if ("erro" in r) return r.erro;
  const { ctx } = r;

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return NextResponse.json({ error: "Informe a data de início e todos os percentuais, em pontos-base inteiros (ex.: 2300 para 23%)." }, { status: 400 });
  }
  const parsed = parametrosTsCreateSchema.safeParse(corpo);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const { vigente_desde, ...percentuais } = parsed.data;

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  if (vigente_desde < hoje) {
    return NextResponse.json({ error: "A vigência não pode começar antes de hoje: os percentuais que já valeram não são reescritos." }, { status: 400 });
  }

  const { data: existente, error: erroExistente } = await svc.from("proposta_ts_parametros").select("id").eq("vigente_desde", vigente_desde).limit(1);
  if (erroExistente) {
    console.error("[propostas] Vigências do TS não conferidas:", erroExistente.message);
    return NextResponse.json({ error: "Não foi possível salvar os percentuais. Nada foi alterado." }, { status: 500 });
  }
  if ((existente ?? []).length > 0) return NextResponse.json({ error: MSG_VIGENCIA_REPETIDA }, { status: 409 });

  const { data: anterior } = await svc.rpc("parametros_ts_vigentes", { p_hoje: vigente_desde });
  const antes = (Array.isArray(anterior) ? anterior[0] : anterior) as (Record<string, unknown> & { vigente_desde?: string }) | null | undefined;

  const { data: nova, error } = await svc.from("proposta_ts_parametros").insert({ vigente_desde, ...percentuais, alterado_por: ctx.analistaId }).select().single();
  // 23505: duas chamadas na mesma data ao mesmo tempo (o índice único da migration fecha a corrida).
  if (error?.code === "23505") return NextResponse.json({ error: MSG_VIGENCIA_REPETIDA }, { status: 409 });
  if (error || !nova) {
    console.error("[propostas] Percentuais do TS não gravados:", error?.message);
    return NextResponse.json({ error: "Não foi possível salvar os percentuais. Nada foi alterado." }, { status: 500 });
  }

  // Auditoria: só percentuais e datas (nenhum dado pessoal).
  const resumo = (p: Record<string, unknown> | null | undefined) => (p ? Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, p[k] ?? null])) : null);
  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "parametros_ts_alterados",
    entidade: "proposta_ts_parametros",
    entidade_id: nova.id as string,
    unidade_id: ctx.unidadeId,
    detalhes: { vigente_desde, antes: resumo(antes), antes_vigente_desde: antes?.vigente_desde ?? null, depois: resumo(nova) },
  });

  return NextResponse.json({ data: nova }, { status: 201 });
}
