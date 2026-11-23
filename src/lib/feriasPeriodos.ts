// Férias (aviso de vencimento): camada de dados — quem entra, carga em lote e garantirPeriodos (idempotente, sem trigger de banco).
// As regras de data e semáforo vivem em feriasRegras.ts (puras); aqui só se lê e grava. Schema: supabase/migration_ferias_aviso.sql.
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH, contextoRH } from "@/lib/rhUnidadeAuth";
import type { ContextoUnidade } from "@/lib/unidadeAuth";
import { consultarComEfetivacao, ehErroColunaAusente } from "@/lib/funcionarioEfetivacao";
import { registrarAuditoria } from "@/lib/audit";
import {
  avaliarFerias, decidirMudancaAutomatica, ehElegivelFerias, periodosDivergentes, periodosFaltantes, resolverDataBase, type AvaliacaoFerias, type PeriodoFerias,
} from "@/lib/feriasRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;
type ErroPg = { code?: string | null; message?: string | null } | null | undefined;

export const MSG_FERIAS_MIGRACAO_PENDENTE = "O controle de férias ainda não está disponível neste ambiente. Tente novamente em instantes.";
export const MSG_FERIAS_ERRO_GENERICO = "Não foi possível concluir a operação. Tente novamente.";

// A migration é aplicada separada do deploy: enquanto as tabelas não existem, o Postgres responde 42P01 e o PostgREST PGRST205 (tabela fora do cache).
// Qualquer OUTRO erro (rede, timeout, permissão) NÃO vira "migração pendente": quem chama trata como erro de verdade.
// A coluna ferias_periodos.aviso_vencido_em (migration_ferias_aviso_vencido.sql) também é aplicada separada do deploy: enquanto não existe, toda leitura dos
// períodos falha com 42703 (ou PGRST204/schema cache). Tratada como "migração pendente" (503 com mensagem clara), nunca como erro genérico.
export function ehErroColunaAvisoVencidoAusente(erro: ErroPg): boolean {
  if (!erro || typeof erro.message !== "string" || !/aviso_vencido_em/.test(erro.message)) return false;
  return erro.code === "42703" || erro.code === "PGRST204" || /does not exist|schema cache|could not find/i.test(erro.message);
}

export function ehErroTabelaFeriasAusente(erro: ErroPg): boolean {
  if (!erro) return false;
  if (ehErroColunaAvisoVencidoAusente(erro)) return true;
  if (erro.code === "42P01" || erro.code === "PGRST205") return true;
  return typeof erro.message === "string" && /ferias_(periodos|config)/.test(erro.message) && /(does not exist|schema cache|not found)/i.test(erro.message);
}

export interface FuncionarioFerias {
  id: string;
  nome_completo: string;
  cliente_id: string | null;
  empresa: string | null;
  data_admissao: string | null;
  status: string;
  tipo_servico: string | null;
  efetivado_em: string | null;
  unidade_id: string;
}

export interface ConfigFerias {
  funcionario_id: string;
  data_base_ajustada: string | null;
  ajustado_por: string | null;
  ajustado_em: string | null;
  motivo: string | null;
  saldo_inicial_confirmado_em: string | null;
  saldo_inicial_confirmado_por: string | null;
  saldo_inicial_quitado_ate: string | null;
}

const COLUNAS_FUNCIONARIO = "id, nome_completo, cliente_id, empresa, data_admissao, status, tipo_servico, unidade_id";
const COLUNAS_PERIODO =
  "id, funcionario_id, numero, aquisitivo_inicio, aquisitivo_fim, data_limite, situacao, gozo_inicio, gozo_fim, observacao, origem, aviso_90_em, aviso_60_em, aviso_30_em, aviso_vencido_em, unidade_id";
const COLUNAS_CONFIG =
  "funcionario_id, data_base_ajustada, ajustado_por, ajustado_em, motivo, saldo_inicial_confirmado_em, saldo_inicial_confirmado_por, saldo_inicial_quitado_ate";

export type PeriodoComFuncionario = PeriodoFerias & { funcionario_id: string; unidade_id: string };

// ── Gate (mesmo de Funcionários + recorte por unidade) ──────────────────────
// Decisão do Olver: sem chave nova — herda podeAcessarFuncionarios (chave rh_funcionarios, com exceção individual em usuario_acesso_customizado).
export async function autorizarFerias(funcionarioId?: string): Promise<{ user: User; ctx: ContextoUnidade } | { erro: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return { erro: acessoNegado };
  if (funcionarioId) {
    const bloqueioUnidade = await checarAcessoFuncionarioRH(user, funcionarioId);
    if (bloqueioUnidade) return { erro: bloqueioUnidade };
  }
  const ctx = await contextoRH(user);
  if (!ctx) return { erro: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }) };
  return { user, ctx };
}

// ── Leitura ─────────────────────────────────────────────────────────────────
// Funcionários que entram no controle: ativo E (terceirização OU efetivado). Coluna efetivado_em ausente (migração do Efetivar pendente) cai na
// consulta antiga: só terceirização entra.
export async function carregarElegiveis(svc: ServiceClient, ctx: ContextoUnidade | null): Promise<FuncionarioFerias[]> {
  type Linha = Omit<FuncionarioFerias, "efetivado_em"> & { efetivado_em?: string | null };
  const { data } = await consultarComEfetivacao<Linha>((comEfetivacao) => {
    let q = svc
      .from("funcionarios")
      .select(`${COLUNAS_FUNCIONARIO}${comEfetivacao ? ", efetivado_em" : ""}`)
      .eq("status", "ativo")
      .in("tipo_servico", comEfetivacao ? ["terceirizacao", "mao_obra_temporaria"] : ["terceirizacao"]);
    if (ctx && !ctx.todasUnidades) q = q.eq("unidade_id", ctx.unidadeId);
    return q as unknown as PromiseLike<{ data: Linha[] | null; error: ErroPg }>;
  }, "férias");
  return data.map((f) => ({ ...f, efetivado_em: f.efetivado_em ?? null })).filter(ehElegivelFerias);
}

export type ResultadoFuncionario = { funcionario: FuncionarioFerias } | { erro: NextResponse };

// Um funcionário elegível, ou a resposta de erro pronta (404 / 409 / 503).
export async function carregarFuncionarioElegivel(svc: ServiceClient, id: string): Promise<ResultadoFuncionario> {
  const { data, error } = await svc.from("funcionarios").select(`${COLUNAS_FUNCIONARIO}, efetivado_em`).eq("id", id).maybeSingle();
  if (error) {
    if (ehErroColunaAusente(error)) return { erro: NextResponse.json({ error: "A efetivação ainda não está disponível neste ambiente. Tente novamente em instantes." }, { status: 503 }) };
    console.error("[ferias] Erro ao buscar funcionário:", error.message);
    return { erro: NextResponse.json({ error: MSG_FERIAS_ERRO_GENERICO }, { status: 500 }) };
  }
  if (!data) return { erro: NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 }) };
  const funcionario = data as unknown as FuncionarioFerias;
  if (!ehElegivelFerias(funcionario)) {
    return { erro: NextResponse.json({ error: "Este funcionário não entra no controle de férias (precisa estar ativo e ser de Terceirização ou efetivado)." }, { status: 409 }) };
  }
  return { funcionario };
}

export interface DadosFerias {
  configs: Map<string, ConfigFerias>;
  periodos: Map<string, PeriodoComFuncionario[]>;
}

// Config e períodos de vários funcionários (2 consultas, sem N+1). Erro de tabela ausente é devolvido para a rota responder 503.
export async function carregarDadosFerias(svc: ServiceClient, ids: string[]): Promise<{ dados: DadosFerias; erro: ErroPg }> {
  const dados: DadosFerias = { configs: new Map(), periodos: new Map() };
  if (ids.length === 0) return { dados, erro: null };
  const [cfg, per] = await Promise.all([
    svc.from("ferias_config").select(COLUNAS_CONFIG).in("funcionario_id", ids),
    svc.from("ferias_periodos").select(COLUNAS_PERIODO).in("funcionario_id", ids).order("numero", { ascending: true }),
  ]);
  const erro = cfg.error ?? per.error;
  if (erro) return { dados, erro };
  for (const c of (cfg.data ?? []) as unknown as ConfigFerias[]) dados.configs.set(c.funcionario_id, c);
  for (const p of (per.data ?? []) as unknown as PeriodoComFuncionario[]) {
    const lista = dados.periodos.get(p.funcionario_id) ?? [];
    lista.push(p);
    dados.periodos.set(p.funcionario_id, lista);
  }
  return { dados, erro: null };
}

export function dataBaseDe(f: Pick<FuncionarioFerias, "data_admissao">, config: ConfigFerias | undefined): string | null {
  return resolverDataBase(f.data_admissao, config?.data_base_ajustada);
}

// ── garantirPeriodos ────────────────────────────────────────────────────────
// Cria os períodos que faltam (todos os já iniciados, de 1 até o atual) a partir da data-base. Idempotente: roda quantas vezes precisar, sem duplicar
// (upsert com ignoreDuplicates em (funcionario_id, numero)), e SEM trigger de banco. Não mexe em período existente. Não gera nada quando:
//  - o funcionário não é elegível; não tem data-base (informar data-base); a data-base está no futuro (ainda não iniciou);
//  - os períodos guardados não batem com a data-base atual (data_admissao editada depois): fica "Data-base mudou" até o RH reconfirmar a data-base.
// Devolve os períodos de cada funcionário já com os criados agora.
export async function garantirPeriodosLote(
  svc: ServiceClient,
  funcionarios: FuncionarioFerias[],
  dados: DadosFerias,
  hojeISO: string
): Promise<{ periodos: Map<string, PeriodoComFuncionario[]>; erro: ErroPg }> {
  const periodos = new Map(dados.periodos);
  const novos: Record<string, unknown>[] = [];
  for (const f of funcionarios) {
    if (!ehElegivelFerias(f)) continue;
    const base = dataBaseDe(f, dados.configs.get(f.id));
    if (!base || base > hojeISO) continue;
    const existentes = periodos.get(f.id) ?? [];
    if (periodosDivergentes(base, existentes)) continue;
    for (const p of periodosFaltantes(base, hojeISO, existentes)) {
      novos.push({
        funcionario_id: f.id, numero: p.numero, aquisitivo_inicio: p.aquisitivo_inicio, aquisitivo_fim: p.aquisitivo_fim, data_limite: p.data_limite,
        situacao: "a_programar", origem: "gerado", unidade_id: f.unidade_id,
      });
    }
  }
  if (novos.length === 0) return { periodos, erro: null };

  const { data, error } = await svc
    .from("ferias_periodos")
    .upsert(novos, { onConflict: "funcionario_id,numero", ignoreDuplicates: true })
    .select(COLUNAS_PERIODO);
  if (error) return { periodos, erro: error };
  // Com ignoreDuplicates o retorno traz só as linhas realmente criadas (as que outra chamada criou ao mesmo tempo ficam de fora; a próxima leitura as traz).
  for (const p of (data ?? []) as unknown as PeriodoComFuncionario[]) {
    const lista = [...(periodos.get(p.funcionario_id) ?? []), p].sort((a, b) => a.numero - b.numero);
    periodos.set(p.funcionario_id, lista);
  }
  return { periodos, erro: null };
}

// ── Mudança automática de situação ──────────────────────────────────────────
// Idempotente e sem tabela nova: só age em período cuja situação ainda não bate com as datas (decidirMudancaAutomatica); rodar de novo no mesmo dia não acha nada.
// A troca é atômica (.eq("situacao", anterior)): se o RH clicou ao mesmo tempo, a linha não bate e a automação simplesmente pula (sem erro, sem auditoria dobrada).
// Escreve em no máximo `limite` períodos por chamada (a lista usa poucos; o cron, mais); o resto fica para a próxima. Auditoria com as MESMAS ações dos cliques manuais
// (ferias_em_gozo / ferias_gozada), origem "automatico" e sem usuário (feito pelo sistema). Devolve os períodos já atualizados para quem chamou não reler o banco.
export const LIMITE_AUTOMATICO_LISTA = 50;
export const LIMITE_AUTOMATICO_CRON = 500;

export async function aplicarMudancasAutomaticasFerias(
  svc: ServiceClient,
  funcionarios: FuncionarioFerias[],
  periodos: Map<string, PeriodoComFuncionario[]>,
  hojeISO: string,
  limite: number = LIMITE_AUTOMATICO_LISTA
): Promise<{ periodos: Map<string, PeriodoComFuncionario[]>; alteradas: number; erro: ErroPg }> {
  const resultado = new Map(periodos);
  let alteradas = 0;
  const agora = new Date().toISOString();
  for (const f of funcionarios) {
    if (!ehElegivelFerias(f)) continue;
    const lista = resultado.get(f.id);
    if (!lista) continue;
    let mudou = false;
    const nova = [...lista];
    for (let i = 0; i < nova.length; i++) {
      const p = nova[i];
      const decisao = decidirMudancaAutomatica(p, hojeISO);
      if (!decisao) continue;
      if (alteradas >= limite) break;
      const { data, error } = await svc
        .from("ferias_periodos")
        .update({ situacao: decisao.para, atualizado_por: null, atualizado_em: agora })
        .eq("id", p.id)
        .eq("funcionario_id", f.id)
        .eq("situacao", p.situacao)
        .select("id")
        .maybeSingle();
      if (error) return { periodos: mudou ? new Map(resultado).set(f.id, nova) : resultado, alteradas, erro: error };
      if (!data) continue; // alguém mudou o período neste instante: não é erro, só não é com a automação
      for (const t of decisao.transicoes) {
        registrarAuditoria({
          usuario_id: null, usuario_nome: "Sistema (automático)", acao: t.para === "gozada" ? "ferias_gozada" : "ferias_em_gozo", entidade: "ferias_periodos", entidade_id: p.id,
          detalhes: { funcionario_id: f.id, periodo: p.numero, situacao_anterior: t.de, gozo_inicio: p.gozo_inicio, gozo_fim: p.gozo_fim, observacao: p.observacao, origem: "automatico", data_referencia: hojeISO },
          unidade_id: f.unidade_id,
        });
      }
      nova[i] = { ...p, situacao: decisao.para };
      mudou = true;
      alteradas++;
    }
    if (mudou) resultado.set(f.id, nova);
  }
  return { periodos: resultado, alteradas, erro: null };
}

export interface EstadoFuncionarioFerias {
  funcionario: FuncionarioFerias;
  config: ConfigFerias | undefined;
  dataBase: string | null;
  periodos: PeriodoComFuncionario[];
  saldoConfirmado: boolean;
  avaliacao: AvaliacaoFerias;
}

export function montarEstado(f: FuncionarioFerias, dados: DadosFerias, periodos: PeriodoComFuncionario[], hojeISO: string): EstadoFuncionarioFerias {
  const config = dados.configs.get(f.id);
  const dataBase = dataBaseDe(f, config);
  const saldoConfirmado = !!config?.saldo_inicial_confirmado_em;
  return { funcionario: f, config, dataBase, periodos, saldoConfirmado, avaliacao: avaliarFerias({ dataBase, saldoConfirmado, periodos, hojeISO }) };
}

// Um funcionário: carrega config e períodos, garante os períodos e devolve o estado. `erroResposta` já vem pronto (503 se a migration não foi aplicada).
export async function garantirPeriodos(
  svc: ServiceClient,
  funcionario: FuncionarioFerias,
  hojeISO: string
): Promise<{ estado: EstadoFuncionarioFerias } | { erroResposta: NextResponse }> {
  const { dados, erro } = await carregarDadosFerias(svc, [funcionario.id]);
  if (erro) return { erroResposta: respostaDeErro(erro, "carregar") };
  const garantido = await garantirPeriodosLote(svc, [funcionario], dados, hojeISO);
  if (garantido.erro) return { erroResposta: respostaDeErro(garantido.erro, "gerar períodos") };
  return { estado: montarEstado(funcionario, dados, garantido.periodos.get(funcionario.id) ?? [], hojeISO) };
}

export function respostaDeErro(erro: ErroPg, onde: string): NextResponse {
  if (ehErroTabelaFeriasAusente(erro)) return NextResponse.json({ error: MSG_FERIAS_MIGRACAO_PENDENTE }, { status: 503 });
  console.error(`[ferias] Erro ao ${onde}:`, erro?.message);
  return NextResponse.json({ error: MSG_FERIAS_ERRO_GENERICO }, { status: 500 });
}

// Antes de qualquer ação de situação: o funcionário precisa ter data-base, já ter iniciado, ter períodos coerentes e o saldo inicial confirmado.
// Devolve a mensagem do que falta, ou null se pode seguir.
export function impedimentoParaAgir(e: EstadoFuncionarioFerias): string | null {
  switch (e.avaliacao.estado) {
    case "sem_data_base":
      return "Informe a data-base deste funcionário antes de lançar férias.";
    case "ainda_nao_iniciou":
      return "A data-base deste funcionário ainda não chegou.";
    case "base_alterada":
      return "A data-base mudou depois de gerar os períodos. Reconfirme a data-base antes de lançar férias.";
    case "saldo_pendente":
      return "Informe as férias já quitadas (fim do último período aquisitivo já quitado, ou \"nenhum\") antes de lançar férias.";
    default:
      return null;
  }
}

// Há período operado pelo RH (programada, em gozo ou gozada) que NÃO veio do saldo inicial? Trava ajuste de data-base e refazer o saldo.
export function temPeriodoOperadoPeloRH(periodos: Pick<PeriodoFerias, "situacao" | "origem">[]): boolean {
  return periodos.some((p) => p.origem === "gerado" && p.situacao !== "a_programar");
}

// Efetivar × Desfazer: bloqueia se o funcionário já tem período programada, em_gozo ou gozada (inclui o que veio do saldo inicial).
// Tabela ainda inexistente (migration não aplicada) = nenhum período: o Desfazer segue como antes.
export async function funcionarioTemFeriasLancadas(svc: ServiceClient, funcionarioId: string): Promise<{ tem: boolean; erro: boolean }> {
  const { data, error } = await svc.from("ferias_periodos").select("id").eq("funcionario_id", funcionarioId).in("situacao", ["programada", "em_gozo", "gozada"]).limit(1);
  if (error) {
    if (ehErroTabelaFeriasAusente(error)) return { tem: false, erro: false };
    console.error("[ferias] Erro ao conferir férias lançadas:", error.message);
    return { tem: false, erro: true };
  }
  return { tem: (data ?? []).length > 0, erro: false };
}
