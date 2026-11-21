// Verificação do valor estimado do MOT acompanhando a revisão mais recente (enviada/em negociação): valor, histórico, rollback, Funil e R&S intacto.
// Banco em memória do harness (scripts/harness-mot/memdb.mjs); nada toca o Supabase real.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-mot-valor.mts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import * as rotaId from "@/app/api/comercial/propostas/[id]/route";
import * as rotaSit from "@/app/api/comercial/propostas/[id]/situacao/route";
import * as rotaPdf from "@/app/api/comercial/propostas/[id]/pdf/route";
import * as rotaParametros from "@/app/api/comercial/propostas/mot/parametros/route";
import * as rotaPrevia from "@/app/api/comercial/propostas/mot/previa/route";
import { hojeSaoPaulo } from "@/lib/comercial";
import { MODELOS_ATIVOS, calcularValidadeAte, chaveHarnessMotLigada, modeloDisponivel } from "@/lib/propostas";
import { MENSAGEM_MODELO_INDISPONIVEL, MODELOS_PROPOSTA, TEMPLATE_VERSAO_ATUAL, montarSnapshot, validarConteudo } from "@/lib/propostaModelos";
import { gerarPdfProposta } from "@/lib/propostaPdf";
import { snapshotParaPdf } from "@/lib/propostaServico";
import {
  FUNCAO_MOT_PADRAO, LIMITES_PARAMETROS_MOT, TEMPLATE_VERSAO_MOT, TEXTO_INTRODUTORIO_PADRAO_MOT, conteudoMotSchema, montarSnapshotMot, snapshotMotSchema, textoFaturamentoMot,
  type ParametrosMotVigentes,
} from "@/lib/propostaMot";
import { MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL } from "@/lib/propostaClausulas";
import { MAX_CLAUSULAS_ADICIONAIS as RS_MAX_CLAUSULAS, MAX_CLAUSULA_ADICIONAL as RS_MAX_CLAUSULA, conteudoRsSchema } from "@/lib/propostaModelos";
import { PARAMETROS_MOT_INICIAIS, calcularPlanilhaMot, formatarCentavosBRL, valorPorExtensoBRL } from "@/lib/propostaMotCalculo";
import { createServiceClient } from "@/lib/supabase/server";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222", G = "33333333-3333-4333-8333-333333333333", GC = "44444444-4444-4444-8444-444444444444";
const EMP = "55555555-5555-4555-8555-000000000001", EMP_TESTE = "55555555-5555-4555-8555-000000000002";
const HOJE = hojeSaoPaulo();
const ANO = Number(HOJE.slice(0, 4));
const AA = String(ANO).slice(-2);
const ULTIMO_RS = 52, ULTIMO_MOT = 71;
const INICIAIS = { ...PARAMETROS_MOT_INICIAIS };

// ── Chave de teste do MOT (só do harness) ────────────────────────────────────
async function comMot<T>(fn: () => Promise<T> | T, env: Record<string, string | undefined> = { HARNESS_PROPOSTA_MOT: "1" }): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const k of ["HARNESS_PROPOSTA_MOT", "NODE_ENV", "VERCEL_ENV", "VERCEL"]) antes[k] = process.env[k];
  for (const k of ["HARNESS_PROPOSTA_MOT", "NODE_ENV", "VERCEL_ENV", "VERCEL"]) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  try { return await fn(); } finally {
    for (const k of Object.keys(antes)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
  }
}

// ── Banco em memória + rpcs imitando o banco ─────────────────────────────────
function contador(db: any, tabela: string, modelo: string, inicial: number) {
  let c = db.tabelas[tabela].find((x: any) => x.modelo === modelo && x.ano === ANO);
  if (!c) { c = { modelo, ano: ANO, ultimo: inicial }; db.tabelas[tabela].push(c); }
  return c;
}
function linhaBase(a: Record<string, unknown>, numero: string, sequencial: number, teste: boolean) {
  const agora = new Date().toISOString();
  return {
    id: crypto.randomUUID(), numero, modelo: a.p_modelo, ano: ANO, sequencial, revisao_atual: 0, situacao: "rascunho", unidade_id: a.p_unidade_id, vendedor_id: a.p_vendedor_id,
    empresa_visitada_id: a.p_empresa_visitada_id, oportunidade_id: a.p_oportunidade_id, cliente_nome: a.p_cliente_nome, aos_cuidados: a.p_aos_cuidados, conteudo: a.p_conteudo,
    template_versao: a.p_template_versao, validade_dias: a.p_validade_dias, validade_ate: null, valor_estimado: null, enviada_em: null, created_at: agora, updated_at: agora, teste,
  };
}
function rpcReal(a: Record<string, unknown>, db: any) {
  db.rpcChamadas.push({ rpc: "criar_proposta", ...a });
  const c = contador(db, "proposta_contadores", a.p_modelo as string, a.p_modelo === "MOT" ? ULTIMO_MOT : ULTIMO_RS);
  c.ultimo += 1;
  const prefixo = a.p_modelo === "RS" ? `${a.p_sigla}-` : `${a.p_sigla}-${a.p_modelo}-`;
  const linha = linhaBase(a, `${prefixo}${String(c.ultimo).padStart(4, "0")}/${AA}`, c.ultimo, false);
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}
function rpcTeste(a: Record<string, unknown>, db: any) {
  db.rpcChamadas.push({ rpc: "criar_proposta_teste", ...a });
  const c = contador(db, "proposta_contadores_teste", a.p_modelo as string, 0);
  c.ultimo += 1;
  const prefixo = a.p_modelo === "RS" ? "TESTE-" : `TESTE-${a.p_modelo}-`;
  const linha = linhaBase(a, `${prefixo}${String(c.ultimo).padStart(4, "0")}/${AA}`, c.ultimo, true);
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}
// parametros_mot_vigentes(p_hoje): a vigência mais recente com vigente_desde <= p_hoje (empate no mesmo dia: a criada por último), como no banco.
function rpcVigentes(a: Record<string, unknown>, db: any) {
  const linhas = db.tabelas.proposta_mot_parametros
    .filter((l: any) => l.vigente_desde <= (a.p_hoje as string))
    .sort((x: any, y: any) => y.vigente_desde.localeCompare(x.vigente_desde) || String(y.created_at ?? "").localeCompare(String(x.created_at ?? "")));
  db.rpcChamadas.push({ rpc: "parametros_mot_vigentes", ...a });
  return { data: linhas.slice(0, 1).map((l: any) => structuredClone(l)), error: null };
}

const PARAMETROS_SEED = () => ({ id: "par-1", vigente_desde: "2026-11-19", ...INICIAIS, alterado_por: null, created_at: "2026-11-19T18:42:12Z" });

function novoDb(extra: Record<string, unknown[]> = {}) {
  const db: any = criarDb({
    analistas_perfil: [
      { id: V, user_id: "u-v", nome_completo: "Vendedor", email: "v@salmazos.com.br", telefone: "(19) 99999-0000", cargo: "Especialista em pessoas", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
      // Gestor sem perfil comercial (como o Olver): escreve por liberação, sem Funil.
      { id: G, user_id: "u-g", nome_completo: "Gestora Teste", email: "g@salmazos.com.br", telefone: null, cargo: "Diretora", nivel_acesso: "superuser", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      // Diretoria com perfil comercial: tem Funil.
      { id: GC, user_id: "u-gc", nome_completo: "Diretora Comercial", email: "gc@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: true, ativo: true },
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: G, chave_aba: "comercial_propostas", liberado: true }],
    empresas_visitadas: [{ id: EMP, nome: "Pastifício Selmi S/A", cliente_id: null, unidade_id: U }, { id: EMP_TESTE, nome: "cliente teste", cliente_id: null, unidade_id: U }],
    empresas_teste: [{ empresa_id: EMP_TESTE, marcado_por: G, created_at: "2026-11-20T10:00:00Z" }],
    empresa_contatos: [], oportunidades: [], lembretes: [], oportunidade_interacoes: [], propostas: [], proposta_revisoes: [], proposta_historico: [], audit_logs: [],
    proposta_contadores: [{ modelo: "RS", ano: ANO, ultimo: ULTIMO_RS }, { modelo: "MOT", ano: ANO, ultimo: ULTIMO_MOT }], proposta_contadores_teste: [],
    proposta_mot_parametros: [PARAMETROS_SEED()],
    ...extra,
  });
  db.rpcs = { criar_proposta: rpcReal, criar_proposta_teste: rpcTeste, parametros_mot_vigentes: rpcVigentes };
  db.rpcChamadas = [];
  // Nenhum update/delete pode acontecer nestas tabelas em NENHUM teste (o harness quebra se acontecer).
  db.imutaveis = ["proposta_revisoes", "proposta_historico", "proposta_mot_parametros"];
  db.cascatas = { oportunidades: [{ tabela: "oportunidade_interacoes", col: "oportunidade_id" }] };
  db.unicos = undefined;
  return db;
}

type Chamada = { status: number; body: any };
async function chamar(db: any, usuario: string | null, fn: (...a: any[]) => Promise<Response>, { metodo = "GET", url = "http://x/api", corpo, id }: { metodo?: string; url?: string; corpo?: unknown; id?: string } = {}): Promise<Chamada> {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: "analista" } } : null;
  globalThis.__DB__ = db;
  globalThis.__PENDENTES__ = [];
  const req = Object.assign(new Request(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { nextUrl: new URL(url) });
  const r = await fn(req, { params: Promise.resolve({ id }) });
  await Promise.all(globalThis.__PENDENTES__ ?? []);
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, body: tipo.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
}
const funcao = (extra: Record<string, unknown> = {}) => ({ ...FUNCAO_MOT_PADRAO, salario_centavos: 100000, ...extra });
const conteudoMot = (extra: Record<string, unknown> = {}) => ({ funcoes: [funcao()], ...extra });
const criar = (db: any, usuario: string, extra: Record<string, unknown> = {}, empresa = EMP) => chamar(db, usuario, rotaLista.POST, { metodo: "POST", corpo: { modelo: "MOT", empresa_visitada_id: empresa, conteudo: conteudoMot(), ...extra } });
const situacao = (db: any, usuario: string, id: string, corpo: Record<string, unknown>) => chamar(db, usuario, rotaSit.POST, { metodo: "POST", id, corpo });
const patch = (db: any, usuario: string, id: string, corpo: Record<string, unknown>) =>
  chamar(db, usuario, rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, ...corpo } });
const detalhe = (db: any, usuario: string, id: string) => chamar(db, usuario, rotaId.GET, { id });
const pdf = (db: any, usuario: string, id: string) => chamar(db, usuario, rotaPdf.GET, { id });
const lerParametros = (db: any, usuario: string | null) => chamar(db, usuario, rotaParametros.GET);
const gravarParametros = (db: any, usuario: string | null, corpo: unknown) => chamar(db, usuario, rotaParametros.POST, { metodo: "POST", corpo });
const proposta = (db: any, id: string) => db.tabelas.propostas.find((p: any) => p.id === id);
const contadorDe = (db: any, tabela: string, modelo: string) => db.tabelas[tabela].find((c: any) => c.modelo === modelo && c.ano === ANO)?.ultimo ?? 0;
const mais = (dias: number) => calcularValidadeAte(HOJE, dias);
const PARAMS_NOVOS = (extra: Record<string, unknown> = {}) => ({ vigente_desde: mais(10), ...INICIAIS, taxa_administrativa_bp: 1500, ...extra });
const salarioDoTeto = 1_000_000_000;

function comMotSync<T>(fn: () => T): T {
  const antes = { m: process.env.HARNESS_PROPOSTA_MOT, n: process.env.NODE_ENV, v: process.env.VERCEL_ENV, vv: process.env.VERCEL };
  delete process.env.NODE_ENV; delete process.env.VERCEL_ENV; delete process.env.VERCEL; process.env.HARNESS_PROPOSTA_MOT = "1";
  try { return fn(); } finally {
    for (const [k, v] of [["HARNESS_PROPOSTA_MOT", antes.m], ["NODE_ENV", antes.n], ["VERCEL_ENV", antes.v], ["VERCEL", antes.vv]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}


// ── Casos da etapa "valor estimado do MOT acompanha a revisão" ──────────────
// MOT REAL (empresa real) só existe com a chave do harness: casoMot liga a chave só durante o caso.
const casoMot = (nome: string, fn: () => Promise<void>) => caso(nome, () => comMot(fn));
const F0 = [funcao({ salario_centavos: 449999 })]; // NF 8.503,46
const F1 = [funcao({ salario_centavos: 449999 }), funcao({ area: "ADMINISTRATIVO", salario_centavos: 50000 })]; // NF 9.448,31
const nova = async (db: any, u: string, empresa: string, funcoes = F0) => (await criar(db, u, { conteudo: conteudoMot({ funcoes }) }, empresa)).body.data.id as string;
const enviar = (db: any, u: string, id: string) => situacao(db, u, id, { para: "enviada" });
const histRevisao = (db: any, id: string) => db.tabelas.proposta_historico.filter((h: any) => h.proposta_id === id && h.de === h.para).map((h: any) => String(h.observacao).replace(/ /g, " "));
const oportunidadeUpdates = (db: any) => db.consultas.filter((q: any) => q.tabela === "oportunidades" && q.op === "update").length;

await caso("MOT enviada (teste, gestor, SEM chave do harness): editar o salário muda o valor 8.503,46 → 9.448,31; Rev. 0 e Rev. 1 guardam cada uma a sua planilha, a Rev. 0 intacta; histórico 'Valor: A → B (Rev. 1)'", async () => comMot(async () => {
  const db = novoDb();
  const id = await nova(db, "u-g", EMP_TESTE);
  assert.equal((await enviar(db, "u-g", id)).status, 200);
  assert.equal(proposta(db, id).valor_estimado, 8503.46);
  const rev0 = structuredClone(db.tabelas.proposta_revisoes[0]);
  const ed = await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F1 }) });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(proposta(db, id).valor_estimado, 9448.31);
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.equal(db.tabelas.proposta_revisoes.length, 2);
  assert.deepEqual(db.tabelas.proposta_revisoes[0], rev0, "Rev. 0 intacta");
  assert.equal(db.tabelas.proposta_revisoes[0].conteudo.total_mensal_centavos, 850346);
  assert.equal(db.tabelas.proposta_revisoes[1].conteudo.total_mensal_centavos, 944831);
  assert.equal(db.tabelas.proposta_revisoes[0].conteudo.funcoes.length, 1);
  assert.equal(db.tabelas.proposta_revisoes[1].conteudo.funcoes.length, 2);
  assert.deepEqual(histRevisao(db, id), ["Revisão 1 emitida. Valor: R$ 8.503,46 → R$ 9.448,31 (Rev. 1)."]);
  assert.equal(ed.body.aviso, undefined);
  // o detalhe mostra a planilha da Rev. 1 e o mesmo valor
  const det = await detalhe(db, "u-g", id);
  assert.equal(det.body.data.valor_estimado, 9448.31);
  assert.equal(det.body.planilhaMot.previa.total_mensal_centavos, 944831);
  // volta a baixar: nova revisão e nova linha de histórico
  assert.equal((await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F0 }) })).status, 200);
  assert.equal(proposta(db, id).valor_estimado, 8503.46);
  assert.deepEqual(histRevisao(db, id).slice(-1), ["Revisão 2 emitida. Valor: R$ 9.448,31 → R$ 8.503,46 (Rev. 2)."]);
}, {}));
await caso("revisão que NÃO muda o valor (só texto/validade): valor intacto e a observação continua 'Revisão N emitida.'; sem aviso", async () => comMot(async () => {
  const db = novoDb();
  const id = await nova(db, "u-g", EMP_TESTE);
  await enviar(db, "u-g", id);
  const ed = await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F0, texto_introdutorio: "Outro texto" }), validade_dias: 20 });
  assert.equal(ed.status, 200);
  assert.equal(proposta(db, id).valor_estimado, 8503.46);
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.deepEqual(histRevisao(db, id), ["Revisão 1 emitida."]);
  assert.equal(ed.body.aviso, undefined);
}, {}));
await caso("em negociação também acompanha: o valor muda na revisão", async () => comMot(async () => {
  const db = novoDb();
  const id = await nova(db, "u-g", EMP_TESTE);
  await enviar(db, "u-g", id);
  assert.equal((await situacao(db, "u-g", id, { para: "em_negociacao" })).status, 200);
  assert.equal((await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F1 }) })).status, 200);
  assert.equal(proposta(db, id).valor_estimado, 9448.31);
  assert.equal(proposta(db, id).situacao, "em_negociacao");
}, {}));
await caso("aceita, recusada, cancelada e vencida: editar dá 409 e NADA muda (valor, revisões, histórico); rascunho segue com valor null", async () => comMot(async () => {
  for (const alvo of ["aceita", "recusada", "cancelada", "vencida"]) {
    const db = novoDb();
    const id = await nova(db, "u-g", EMP_TESTE);
    await enviar(db, "u-g", id);
    if (alvo === "vencida") proposta(db, id).situacao = "vencida";
    else assert.equal((await situacao(db, "u-g", id, { para: alvo })).status, 200, alvo);
    const antes = JSON.stringify([proposta(db, id), db.tabelas.proposta_revisoes, db.tabelas.proposta_historico]);
    const ed = await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F1 }) });
    assert.equal(ed.status, 409, alvo);
    assert.match(ed.body.error, /não pode mais ser editada/);
    assert.equal(JSON.stringify([proposta(db, id), db.tabelas.proposta_revisoes, db.tabelas.proposta_historico]), antes, alvo);
    assert.equal(proposta(db, id).valor_estimado, 8503.46);
  }
  const db = novoDb();
  const id = await nova(db, "u-g", EMP_TESTE);
  assert.equal(proposta(db, id).valor_estimado, null);
  assert.equal((await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F1 }) })).status, 200);
  assert.equal(proposta(db, id).valor_estimado, null, "rascunho continua sem valor");
  assert.equal(db.tabelas.proposta_revisoes.length, 0);
}, {}));
await caso("proposta de TESTE de quem tem Funil: o valor muda na proposta, mas o Funil nunca é consultado nem tocado (nenhuma oportunidade, nenhum update)", async () => comMot(async () => {
  const db = novoDb();
  const id = await nova(db, "u-gc", EMP_TESTE);
  await enviar(db, "u-gc", id);
  const ed = await patch(db, "u-gc", id, { conteudo: conteudoMot({ funcoes: F1 }) });
  assert.equal(ed.status, 200);
  assert.equal(proposta(db, id).valor_estimado, 9448.31);
  assert.equal(db.tabelas.oportunidades.length, 0);
  assert.equal(db.consultas.filter((q: any) => q.tabela === "oportunidades").length, 0, "nem leitura");
  assert.equal(ed.body.aviso, undefined);
}, {}));
await casoMot("MOT REAL com oportunidade PRÓPRIA: a oportunidade passa a valer a soma das propostas ATIVAS (com a 2ª proposta), sem mudar de etapa nem de próxima ação", async () => {
  const db = novoDb();
  const a = await nova(db, "u-v", EMP);
  assert.equal((await enviar(db, "u-v", a)).status, 200);
  const opp = () => db.tabelas.oportunidades[0];
  assert.equal(opp().valor_estimado, 8503.46);
  const etapa = opp().etapa, acao = opp().proxima_acao, acaoEm = opp().proxima_acao_em;
  const ed = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F1 }) });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(ed.body.aviso, undefined);
  assert.equal(proposta(db, a).valor_estimado, 9448.31);
  assert.equal(opp().valor_estimado, 9448.31);
  assert.equal(opp().etapa, etapa);
  assert.equal(opp().proxima_acao, acao);
  assert.equal(opp().proxima_acao_em, acaoEm);
  // 2ª proposta ativa na mesma oportunidade: soma
  const b = await nova(db, "u-v", EMP, [funcao({ salario_centavos: 100000 })]);
  assert.equal((await enviar(db, "u-v", b)).status, 200);
  assert.equal(db.tabelas.oportunidades.length, 1);
  assert.equal(Math.round(opp().valor_estimado * 100), 944831 + 188964);
  assert.equal((await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F0 }) })).status, 200);
  assert.equal(Math.round(opp().valor_estimado * 100), 850346 + 188964, "soma das ativas, com a proposta já no valor novo");
  assert.equal(opp().etapa, etapa);
  // revisão sem mudança de valor: não mexe no Funil
  const antes = oportunidadeUpdates(db);
  assert.equal((await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F0, texto_introdutorio: "x" }) })).status, 200);
  assert.equal(oportunidadeUpdates(db), antes);
});
await casoMot("oportunidade de OUTRO vendedor: o valor dela não muda e a resposta avisa; oportunidade FECHADA: não mexe e não avisa", async () => {
  const db = novoDb();
  const a = await nova(db, "u-v", EMP);
  await enviar(db, "u-v", a);
  const opp = () => db.tabelas.oportunidades[0];
  opp().vendedor_id = GC;
  const ed = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F1 }) });
  assert.equal(ed.status, 200);
  assert.match(ed.body.aviso, /outro vendedor/);
  assert.equal(proposta(db, a).valor_estimado, 9448.31, "a proposta muda mesmo assim");
  assert.equal(opp().valor_estimado, 8503.46);
  opp().vendedor_id = V;
  opp().etapa = "ganho";
  const ed2 = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F0 }) });
  assert.equal(ed2.status, 200);
  assert.equal(ed2.body.aviso, undefined);
  assert.equal(opp().valor_estimado, 8503.46);
  assert.equal(opp().etapa, "ganho");
});
await casoMot("falha ao gravar a REVISÃO: a edição devolve erro e o valor antigo é restaurado (junto com revisão atual, conteúdo e validade); nada de histórico nem de Funil", async () => {
  const db = novoDb();
  const a = await nova(db, "u-v", EMP);
  await enviar(db, "u-v", a);
  const antes = structuredClone(proposta(db, a));
  const oppAntes = structuredClone(db.tabelas.oportunidades[0]);
  db.falhas["proposta_revisoes.insert"] = "disco cheio";
  const ed = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F1 }) });
  assert.equal(ed.status, 500);
  delete db.falhas["proposta_revisoes.insert"];
  const depois = proposta(db, a);
  assert.equal(depois.valor_estimado, 8503.46);
  assert.equal(depois.revisao_atual, antes.revisao_atual);
  assert.deepEqual(depois.conteudo, antes.conteudo);
  assert.equal(depois.validade_ate, antes.validade_ate);
  assert.equal(db.tabelas.proposta_revisoes.length, 1);
  assert.deepEqual(histRevisao(db, a), []);
  assert.deepEqual(db.tabelas.oportunidades[0], oppAntes, "Funil intacto");
});
await casoMot("falha no FUNIL depois da revisão: a edição NÃO falha (proposta e Rev. 1 ficam salvas, histórico com o valor) e a resposta traz o aviso 'O valor do Funil não pôde ser atualizado.'", async () => {
  const db = novoDb();
  const a = await nova(db, "u-v", EMP);
  await enviar(db, "u-v", a);
  db.falhas["oportunidades.update"] = "conexão perdida";
  const ed = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F1 }) });
  delete db.falhas["oportunidades.update"];
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(ed.body.aviso, "O valor do Funil não pôde ser atualizado.");
  assert.equal(proposta(db, a).valor_estimado, 9448.31);
  assert.equal(proposta(db, a).revisao_atual, 1);
  assert.equal(db.tabelas.proposta_revisoes.length, 2);
  assert.deepEqual(histRevisao(db, a), ["Revisão 1 emitida. Valor: R$ 8.503,46 → R$ 9.448,31 (Rev. 1)."]);
  assert.equal(db.tabelas.oportunidades[0].valor_estimado, 8503.46, "o Funil ficou como estava");
  // oportunidade legada sem próxima ação: não se inventa ação; também só avisa
  db.tabelas.oportunidades[0].proxima_acao = null;
  assert.equal(db.tabelas.oportunidades[0].valor_estimado, 8503.46);
  const ed2 = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F0 }) });
  assert.equal(ed2.status, 200);
  assert.equal(ed2.body.aviso, undefined, "valor da proposta volta ao da oportunidade: nada a regravar");
  const ed3 = await patch(db, "u-v", a, { conteudo: conteudoMot({ funcoes: F1 }) });
  assert.equal(ed3.status, 200);
  assert.equal(ed3.body.aviso, "O valor do Funil não pôde ser atualizado.");
  assert.equal(db.tabelas.oportunidades[0].valor_estimado, 8503.46, "sem próxima ação não se regrava o valor");
});
await caso("R&S IDÊNTICO: editar R&S enviado não muda valor_estimado, não toca o Funil, histórico 'Revisão 1 emitida.' e a resposta não ganha campo 'aviso'", async () => {
  const db = novoDb();
  const rs = await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP, conteudo: {} } });
  const id = rs.body.data.id;
  assert.equal((await situacao(db, "u-v", id, { para: "enviada", valor_estimado: 5000 })).status, 200);
  const oppAntes = structuredClone(db.tabelas.oportunidades[0]);
  const upd = oportunidadeUpdates(db);
  const ed = await patch(db, "u-v", id, { conteudo: { condicoes: { taxa_sem_reposicao_pct: 70 } } });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(proposta(db, id).valor_estimado, 5000);
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.equal("aviso" in ed.body, false);
  assert.deepEqual(histRevisao(db, id), ["Revisão 1 emitida."]);
  assert.deepEqual(db.tabelas.oportunidades[0], oppAntes);
  assert.equal(oportunidadeUpdates(db), upd);
});
await caso("fonte: o aviso da edição MOT acrescenta 'O valor estimado passa a ser o da nova revisão.' só na variante MOT; o detalhe do R&S não mudou; a rota PATCH só inclui 'aviso' quando existe", () => {
  const mot = fs.readFileSync("src/components/propostas/PropostaDetalheMot.tsx", "utf8");
  assert.ok(mot.includes("A revisão anterior continua guardada, a validade recomeça a contar de hoje e o cálculo usa os percentuais em vigor hoje. O valor estimado passa a ser o da nova revisão."));
  const rs = fs.readFileSync("src/components/propostas/PropostaDetalheClient.tsx", "utf8");
  assert.ok(rs.includes("A revisão anterior continua guardada e a validade recomeça a contar de hoje.") && !rs.includes("valor estimado passa a ser"));
  const rota = fs.readFileSync("src/app/api/comercial/propostas/[id]/route.ts", "utf8");
  assert.ok(rota.includes("...(r.aviso ? { aviso: r.aviso } : {})"));
  const serv = fs.readFileSync("src/lib/propostaServico.ts", "utf8");
  assert.ok(serv.includes("if (valorMudou && ctx.temFunil && p.teste !== true && p.oportunidade_id)"));
  assert.ok(serv.includes("const valorNovo = snapMot ? snapMot.total_mensal_centavos / 100 : null;"), "só o MOT (snapMot) tem valor novo");
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
