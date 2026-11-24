// Verificação da Etapa 2D (telas do MOT) no que é do SERVIDOR: rota de prévia do cálculo, trava do MOT (só gestor + empresa de teste), envio sem digitar valor,
// detalhe com planilha, aba de percentuais (API) e ligações das telas. O banco é o em memória do harness (scripts/harness-mot/memdb.mjs): nada toca o Supabase real.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-mot-telas.mts
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

// ── Casos novos da 2D ────────────────────────────────────────────────────────
const LEITOR = "55555555-5555-4555-8555-0000000000aa";
const dbComLeitor = (extra: Record<string, unknown[]> = {}) => {
  const db = novoDb(extra);
  // Diretoria SEM perfil comercial e SEM liberação em Propostas: só acompanha (não escreve).
  db.tabelas.analistas_perfil.push({ id: LEITOR, user_id: "u-leitor", nome_completo: "Diretor Leitor", email: "l@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true });
  // Analista comum, sem nenhum acesso a Propostas.
  db.tabelas.analistas_perfil.push({ id: "66666666-6666-4666-8666-000000000001", user_id: "u-semacesso", nome_completo: "Sem Acesso", email: "s@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true });
  return db;
};
const previa = (db: any, usuario: string | null, corpo: unknown) => chamar(db, usuario, rotaPrevia.POST, { metodo: "POST", corpo });
const semEscritas = (db: any) => db.consultas.filter((q: any) => ["insert", "update", "delete", "upsert"].includes(q.op));
// Nenhuma chave de percentual (*_bp, percentual*) pode aparecer; "taxa_administrativa" etc. só existem como NOME de linha (chave/rótulo), com valor em centavos.
const PROIBIDO_NA_PREVIA = /_bp"|percentual/i;
const funcaoPrevia = (r: Chamada, i: number) => r.body.data.funcoes[i];

// ═══ 1) Prévia do cálculo ════════════════════════════════════════════════════
await caso("prévia: R$ 1.000,00 → NF 1.889,64 e R$ 3.200,00 → NF 6.046,93 (cada função), mas o total mensal é o da PLANILHA ÚNICA sobre a soma (R$ 4.200,00 → 7.936,59); mesma conta da calculadora e do snapshot", async () => {
  const db = novoDb();
  const r = await previa(db, "u-v", { salarios_centavos: [100000, 320000] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(funcaoPrevia(r, 0).total_nf_centavos, 188964);
  assert.equal(funcaoPrevia(r, 1).total_nf_centavos, 604693);
  assert.equal(r.body.data.total_mensal_centavos, 793659, "planilha única sobre a soma dos salários (4.200,00), não a soma das planilhas por função (7.936,57)");
  assert.equal(r.body.data.unica.salario_centavos, 420000);
  assert.equal(r.body.data.unica.total_nf_centavos, 793659);
  assert.equal(r.body.data.vigente_desde, "2026-11-19", "devolve a data da vigência usada");
  assert.equal(r.body.data.total_mensal_extenso, valorPorExtensoBRL(793659));
  const parametros = { vigente_desde: "2026-11-19", id: "par-1", ...INICIAIS } as ParametrosMotVigentes;
  for (const [i, s] of [100000, 320000].entries()) {
    const calc = calcularPlanilhaMot({ salarioCentavos: s, parametros: INICIAIS });
    assert.equal(funcaoPrevia(r, i).total_nf_centavos, calc.totalNfCentavos);
    assert.equal(funcaoPrevia(r, i).subtotal_centavos, calc.subtotalCentavos);
    assert.deepEqual(funcaoPrevia(r, i).linhas.map((l: any) => [l.chave, l.valor_centavos]), calc.linhas.map((l) => [l.chave, l.valorCentavos]));
    assert.deepEqual(funcaoPrevia(r, i).retencoes.map((l: any) => [l.chave, l.valor_centavos]), calc.retencoes.map((l) => [l.chave, l.valorCentavos]));
  }
  // a mesma montarSnapshotMot da criação: o snapshot do mesmo conteúdo dá o mesmo total
  const snap = montarSnapshotMot({ numero: "X", revisao: 0, templateVersao: 1, dataEmissao: HOJE, validadeDias: 10, validadeAte: mais(10), clienteNome: "C", aosCuidados: null, conteudo: { funcoes: [funcao({ salario_centavos: 100000 }), funcao({ salario_centavos: 320000 })] }, vendedorNome: "V", vendedorTelefone: null, parametros });
  assert.equal(snap.total_mensal_centavos, r.body.data.total_mensal_centavos);
});
await caso("prévia: função sem salário volta null na mesma posição (a tela não se perde) e não entra no total", async () => {
  const r = await previa(novoDb(), "u-v", { salarios_centavos: [null, 100000, null] });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.data.funcoes[0], r.body.data.funcoes[2]], [null, null]);
  assert.equal(r.body.data.funcoes[1].total_nf_centavos, 188964);
  assert.equal(r.body.data.total_mensal_centavos, 188964);
});
await caso("prévia: NUNCA devolve percentuais (nenhuma chave *_bp, 'percentual', nem os nomes dos parâmetros), só valores em centavos", async () => {
  const db = novoDb();
  const r = await previa(db, "u-v", { salarios_centavos: [100000, 250000, 900000000] });
  assert.equal(r.status, 200);
  const texto = JSON.stringify(r.body);
  assert.doesNotMatch(texto, PROIBIDO_NA_PREVIA, texto.slice(0, 200));
  for (const f of r.body.data.funcoes) for (const l of [...f.linhas, ...f.retencoes]) assert.deepEqual(Object.keys(l).sort(), ["chave", "rotulo", "valor_centavos"]);
  // vendedor também não lê a rota de parâmetros crus
  assert.equal((await lerParametros(db, "u-v")).status, 403);
});
await caso("prévia: não grava nada (nenhum insert/update/delete, nenhuma auditoria, nenhum contador, nenhuma proposta)", async () => {
  const db = novoDb();
  const antes = JSON.stringify(db.tabelas);
  assert.equal((await previa(db, "u-v", { salarios_centavos: [100000] })).status, 200);
  assert.equal(semEscritas(db).length, 0);
  assert.equal(JSON.stringify(db.tabelas), antes);
  assert.deepEqual(db.rpcChamadas.map((c: any) => c.rpc), ["parametros_mot_vigentes"]);
});
await caso("prévia: teto de R$ 10.000.000,00 aceito; acima, zero, negativo, fracionário, texto, lista vazia/só nulos e mais de 20 funções → 400 em português e sem consulta ao banco", async () => {
  const db = novoDb();
  assert.equal((await previa(db, "u-v", { salarios_centavos: [salarioDoTeto] })).status, 200);
  const consultasAntes = db.rpcChamadas.length;
  const recusa = async (corpo: unknown, trecho: RegExp) => {
    const r = await previa(db, "u-v", corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.match(r.body.error, trecho, r.body.error);
    assert.doesNotMatch(r.body.error, /invalid|expected|undefined|\[object|ZodError/i);
  };
  await recusa({ salarios_centavos: [salarioDoTeto + 1] }, /limite/);
  await recusa({ salarios_centavos: [0] }, /maior que zero/);
  await recusa({ salarios_centavos: [-100] }, /maior que zero/);
  await recusa({ salarios_centavos: [100.5] }, /centavos inteiros/);
  await recusa({ salarios_centavos: ["1000"] }, /salário/i);
  await recusa({ salarios_centavos: [] }, /pelo menos uma função/);
  await recusa({ salarios_centavos: [null, null] }, /pelo menos uma função|salário de pelo menos uma/);
  await recusa({ salarios_centavos: Array.from({ length: 21 }, () => 100000) }, /no máximo 20/);
  await recusa({}, /funções|salários/i);
  await recusa(null, /funções|salários/i);
  assert.equal((await previa(db, "u-v", { salarios_centavos: Array.from({ length: 20 }, () => 100000) })).status, 200, "20 funções é o limite aceito");
  assert.equal(db.rpcChamadas.length, consultasAntes + 1, "só o pedido válido de 20 funções consultou os percentuais");
});
await caso("prévia: SEM percentuais vigentes (tabela vazia ou só vigência futura) → 409 com a mesma mensagem do servidor ('peça à diretoria para cadastrá-los'), sem inventar valor", async () => {
  for (const linhas of [[], [{ ...PARAMETROS_SEED(), id: "futura", vigente_desde: mais(30) }]]) {
    const db = novoDb({ proposta_mot_parametros: linhas });
    const r = await previa(db, "u-v", { salarios_centavos: [100000] });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los.");
    assert.equal(r.body.data, undefined);
  }
});
await caso("prévia: percentuais cadastrados com defeito → 500 claro ('Avise a diretoria'), sem valor", async () => {
  const db = novoDb({ proposta_mot_parametros: [{ ...PARAMETROS_SEED(), fgts_bp: 99999 }] });
  const r = await previa(db, "u-v", { salarios_centavos: [100000] });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /Avise a diretoria/);
});
await caso("prévia: acesso — sem login 401; sem acesso a Propostas 403; só acompanha (diretoria sem perfil comercial nem liberação) 403 'só acompanha'; quem escreve (vendedor, gestor liberado) 200", async () => {
  const db = dbComLeitor();
  const corpo = { salarios_centavos: [100000] };
  assert.equal((await previa(db, null, corpo)).status, 401);
  assert.equal((await previa(db, "u-semacesso", corpo)).status, 403);
  const leitor = await previa(db, "u-leitor", corpo);
  assert.equal(leitor.status, 403);
  assert.equal(leitor.body.error, "Seu perfil só acompanha as propostas, não cria.");
  assert.equal(leitor.body.data, undefined);
  for (const u of ["u-v", "u-g", "u-gc"]) assert.equal((await previa(db, u, corpo)).status, 200, u);
});
await caso("prévia usa a vigência de HOJE: uma vigência futura não entra, e uma vigência que começa hoje passa a valer", async () => {
  const db = novoDb({ proposta_mot_parametros: [PARAMETROS_SEED(), { ...PARAMETROS_SEED(), id: "futura", vigente_desde: mais(30), taxa_administrativa_bp: 5000 }] });
  assert.equal((await previa(db, "u-v", { salarios_centavos: [100000] })).body.data.funcoes[0].total_nf_centavos, 188964);
  db.tabelas.proposta_mot_parametros.push({ ...PARAMETROS_SEED(), id: "hoje", vigente_desde: HOJE, taxa_administrativa_bp: 1500, created_at: "2026-11-20T10:00:00Z" });
  const r = await previa(db, "u-v", { salarios_centavos: [100000] });
  assert.equal(r.body.data.vigente_desde, HOJE);
  assert.notEqual(r.body.data.funcoes[0].total_nf_centavos, 188964);
});

// ═══ 2) Trava: MOT só para gestor + empresa de teste ═════════════════════════
await caso("trava (unidade): modeloDisponivel('MOT', {gestor, teste}) só é true com os DOIS; sem contexto segue como antes; TS nunca; R&S sempre", () => comMot(async () => {
  assert.equal(modeloDisponivel("MOT", { gestor: true, teste: true }), true);
  for (const ctx of [{ gestor: true, teste: false }, { gestor: false, teste: true }, { gestor: true }, { teste: true }, {}, undefined]) {
    assert.equal(modeloDisponivel("MOT", ctx as any), false, JSON.stringify(ctx));
  }
  assert.equal(modeloDisponivel("TS", { gestor: true, teste: true }), false);
  assert.equal(modeloDisponivel("RS"), true);
  assert.equal(modeloDisponivel("RS", { gestor: false, teste: false }), true);
  assert.equal(modeloDisponivel("XX", { gestor: true, teste: true }), false);
  assert.deepEqual(MODELOS_ATIVOS, ["RS"], "MODELOS_ATIVOS continua só com o R&S");
  assert.equal(validarConteudo("MOT", conteudoMot()).ok, false);
  assert.equal(validarConteudo("MOT", conteudoMot(), { gestor: true, teste: true }).ok, true);
  assert.equal(validarConteudo("MOT", conteudoMot(), { gestor: true, teste: false }).ok, false);
}, {}));
await caso("trava (API, SEM chave do harness): vendedor recusado em empresa real (400) e em empresa de teste (404, ela nem existe para ele); nada é criado e nenhum número é gasto", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const real = await criar(db, "u-v");
    assert.equal(real.status, 400);
    assert.equal(real.body.error, MENSAGEM_MODELO_INDISPONIVEL);
    const teste = await criar(db, "u-v", {}, EMP_TESTE);
    assert.equal(teste.status, 404);
    assert.equal(db.tabelas.propostas.length, 0);
    assert.equal(db.rpcChamadas.length, 0);
    assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT);
    assert.equal(db.tabelas.proposta_contadores_teste.length, 0);
  }, {});
});
await caso("trava (API, SEM chave do harness): GESTOR em empresa REAL é recusado (400) e nada é criado; em empresa de TESTE passa (201) como TESTE-MOT-0001/aa, sem gastar o número real do MOT", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const real = await criar(db, "u-g");
    assert.equal(real.status, 400);
    assert.equal(real.body.error, MENSAGEM_MODELO_INDISPONIVEL);
    assert.equal(db.tabelas.propostas.length, 0);
    assert.equal(db.rpcChamadas.length, 0, "recusada antes de gastar qualquer número");
    const teste = await criar(db, "u-g", {}, EMP_TESTE);
    assert.equal(teste.status, 201, JSON.stringify(teste.body));
    assert.equal(teste.body.data.numero, `TESTE-MOT-0001/${AA}`);
    assert.equal(teste.body.data.teste, true);
    assert.equal(teste.body.data.modelo, "MOT");
    assert.equal(teste.body.data.template_versao, TEMPLATE_VERSAO_MOT);
    assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT, "contador real do MOT intacto");
    assert.equal(contadorDe(db, "proposta_contadores", "RS"), ULTIMO_RS);
    assert.deepEqual(db.rpcChamadas.map((c: any) => c.rpc), ["criar_proposta_teste"]);
    // quem só acompanha (diretoria sem perfil comercial nem liberação) nunca cria
    assert.equal((await criar(db, "u-leitor", {}, EMP_TESTE)).status, 403);
    // gestor com Funil também: a proposta de teste nunca liga a oportunidade
    const gc = await criar(db, "u-gc", {}, EMP_TESTE);
    assert.equal(gc.status, 201);
    assert.equal(gc.body.data.numero, `TESTE-MOT-0002/${AA}`);
    assert.equal(gc.body.data.oportunidade_id, null);
    assert.equal(db.tabelas.oportunidades.length, 0);
  }, {});
});
await caso("trava em PRODUÇÃO (NODE_ENV=production / VERCEL_ENV=production + chave do harness ligada): a chave é ignorada, vendedor e gestor em empresa real seguem recusados; gestor em empresa de teste passa (a trava da 2D não depende da chave)", async () => {
  for (const env of [{ HARNESS_PROPOSTA_MOT: "1", NODE_ENV: "production" }, { HARNESS_PROPOSTA_MOT: "1", VERCEL_ENV: "production", VERCEL: "1" }] as Record<string, string>[]) {
    const db = dbComLeitor();
    await comMot(async () => {
      assert.equal(chaveHarnessMotLigada(), false);
      assert.equal((await criar(db, "u-v")).status, 400, "vendedor, empresa real");
      assert.equal((await criar(db, "u-g")).status, 400, "gestor, empresa real");
      assert.equal(db.tabelas.propostas.length, 0);
      assert.equal((await criar(db, "u-g", {}, EMP_TESTE)).status, 201, "gestor, empresa de teste");
      assert.equal(db.tabelas.propostas.length, 1);
      assert.equal(db.tabelas.propostas[0].teste, true);
    }, env);
  }
});
await caso("trava: R&S não muda — vendedor cria R&S normalmente (VE-... real), gestor cria R&S em empresa de teste (TESTE-...), MOT/TS no corpo de R&S continuam recusados; TS recusado até para gestor em empresa de teste", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const rs = await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP, conteudo: {} } });
    assert.equal(rs.status, 201, JSON.stringify(rs.body));
    assert.equal(rs.body.data.numero, `VE-0053/${AA}`);
    const rsTeste = await chamar(db, "u-g", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP_TESTE, conteudo: {} } });
    assert.equal(rsTeste.status, 201);
    assert.equal(rsTeste.body.data.numero, `TESTE-0001/${AA}`);
    const ts = await chamar(db, "u-g", rotaLista.POST, { metodo: "POST", corpo: { modelo: "TS", empresa_visitada_id: EMP_TESTE, conteudo: {} } });
    assert.equal(ts.status, 400);
    assert.equal(ts.body.error, MENSAGEM_MODELO_INDISPONIVEL);
    // conteúdo de R&S num MOT de teste não passa
    const mistura = await chamar(db, "u-g", rotaLista.POST, { metodo: "POST", corpo: { modelo: "MOT", empresa_visitada_id: EMP_TESTE, conteudo: { cliente_cnpj: "1", condicoes: { taxa_sem_reposicao_pct: 80 } } } });
    assert.equal(mistura.status, 400);
    assert.match(mistura.body.error, /pelo menos uma função/);
  }, {});
});
await caso("trava: proposta MOT REAL (linha antiga/semeada) não pode ser editada fora do harness (400 'Modelo ainda não disponível.'); a de TESTE edita normalmente pelo gestor dono", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const teste = await criar(db, "u-g", {}, EMP_TESTE);
    const ed = await patch(db, "u-g", teste.body.data.id, { conteudo: conteudoMot({ funcoes: [funcao(), funcao({ area: "ADMINISTRATIVO", salario_centavos: 250000 })] }) });
    assert.equal(ed.status, 200, JSON.stringify(ed.body));
    assert.equal(ed.body.data.conteudo.funcoes.length, 2);
    // uma proposta MOT REAL só existe por semente/harness; sem a chave, a edição é recusada
    const real = (await comMot(async () => criar(db, "u-v"), { HARNESS_PROPOSTA_MOT: "1" })).body.data;
    const recusada = await patch(db, "u-v", real.id, { conteudo: conteudoMot() });
    assert.equal(recusada.status, 400);
    assert.equal(recusada.body.error, MENSAGEM_MODELO_INDISPONIVEL);
  }, {});
});

// ═══ 3) Funil e envio sem digitar valor ══════════════════════════════════════
await caso("enviar MOT de TESTE sem valor: o servidor soma os valores mensais (2 funções), grava Rev. 0 com os percentuais congelados, e NADA vai para o Funil (nem oportunidade, nem follow-up)", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const c = await criar(db, "u-gc", { conteudo: conteudoMot({ funcoes: [funcao({ salario_centavos: 100000 }), funcao({ area: "ADMINISTRATIVO", salario_centavos: 320000 })] }) }, EMP_TESTE);
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const id = c.body.data.id;
    const prev = await previa(db, "u-gc", { salarios_centavos: [100000, 320000] });
    const env = await situacao(db, "u-gc", id, { para: "enviada" });
    assert.equal(env.status, 200, JSON.stringify(env.body));
    assert.equal(proposta(db, id).valor_estimado, 793659 / 100);
    assert.equal(proposta(db, id).valor_estimado * 100, prev.body.data.total_mensal_centavos, "o valor gravado é o que a prévia mostrava");
    assert.equal(db.tabelas.proposta_revisoes.length, 1);
    assert.equal(db.tabelas.proposta_revisoes[0].conteudo.total_mensal_centavos, 793659);
    assert.equal(db.tabelas.proposta_revisoes[0].conteudo.layout_planilha, "unica");
    assert.equal(db.tabelas.oportunidades.length, 0, "proposta de teste não cria oportunidade");
    assert.equal(db.tabelas.lembretes.length, 0, "nem follow-up");
    // o valor digitado pelo cliente continua ignorado
    const c2 = await criar(db, "u-gc", {}, EMP_TESTE);
    assert.equal((await situacao(db, "u-gc", c2.body.data.id, { para: "enviada", valor_estimado: 1 })).status, 200);
    assert.equal(proposta(db, c2.body.data.id).valor_estimado, 1889.64);
  }, {});
});
await caso("enviar MOT sem percentuais vigentes: 409 com a mensagem de 'peça à diretoria', a proposta segue rascunho; o detalhe mostra o aviso no lugar da planilha", async () => {
  const db = dbComLeitor({ proposta_mot_parametros: [] });
  await comMot(async () => {
    const c = await criar(db, "u-g", {}, EMP_TESTE);
    const env = await situacao(db, "u-g", c.body.data.id, { para: "enviada" });
    assert.equal(env.status, 409);
    assert.match(env.body.error, /Peça à diretoria para cadastrá-los/);
    assert.equal(proposta(db, c.body.data.id).situacao, "rascunho");
    const det = await detalhe(db, "u-g", c.body.data.id);
    assert.equal(det.status, 200);
    assert.equal(det.body.planilhaMot.previa, null);
    assert.match(det.body.planilhaMot.erro, /Peça à diretoria/);
  }, {});
});

// ═══ 4) Detalhe do MOT ═══════════════════════════════════════════════════════
await caso("detalhe MOT: rascunho traz a planilha calculada HOJE (sem percentuais); depois de enviada mostra o snapshot da revisão e NÃO muda quando a diretoria cadastra novos percentuais", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const c = await criar(db, "u-g", {}, EMP_TESTE);
    const id = c.body.data.id;
    const rasc = await detalhe(db, "u-g", id);
    assert.equal(rasc.body.planilhaMot.origem, "hoje");
    assert.equal(rasc.body.planilhaMot.previa.total_mensal_centavos, 188964);
    assert.doesNotMatch(JSON.stringify(rasc.body.planilhaMot), PROIBIDO_NA_PREVIA);
    assert.equal((await situacao(db, "u-g", id, { para: "enviada" })).status, 200);
    // a diretoria muda a taxa DEPOIS do envio
    db.tabelas.proposta_mot_parametros.push({ ...PARAMETROS_SEED(), id: "nova", vigente_desde: HOJE, taxa_administrativa_bp: 2000, created_at: "2026-11-21T10:00:00Z" });
    const enviada = await detalhe(db, "u-g", id);
    assert.equal(enviada.body.planilhaMot.origem, "revisao");
    assert.equal(enviada.body.planilhaMot.previa.total_mensal_centavos, 188964, "o que foi enviado não muda");
    assert.doesNotMatch(JSON.stringify(enviada.body.planilhaMot), PROIBIDO_NA_PREVIA);
    // um rascunho novo já usa a vigência nova
    const c2 = await criar(db, "u-g", {}, EMP_TESTE);
    assert.notEqual((await detalhe(db, "u-g", c2.body.data.id)).body.planilhaMot.previa.total_mensal_centavos, 188964);
  }, {});
});
await caso("detalhe: no R&S a resposta é a de sempre (nenhum campo planilhaMot); proposta de teste continua invisível para o vendedor; o PDF do MOT de teste sai (200) para o gestor (2E)", async () => {
  const db = dbComLeitor();
  await comMot(async () => {
    const rs = await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP, conteudo: {} } });
    const det = await detalhe(db, "u-v", rs.body.data.id);
    assert.equal(det.status, 200);
    assert.equal("planilhaMot" in det.body, false);
    const mot = await criar(db, "u-g", {}, EMP_TESTE);
    assert.equal((await detalhe(db, "u-v", mot.body.data.id)).status, 404);
    const pdfMot = await pdf(db, "u-g", mot.body.data.id);
    assert.equal(pdfMot.status, 200);
    assert.equal((await pdf(db, "u-v", mot.body.data.id)).status, 404, "o vendedor continua sem ver o teste, nem o PDF");
  }, {});
});

// ═══ 5) Aba de percentuais (API que a tela usa) ══════════════════════════════
await caso("percentuais (API da aba): só gestor lê e grava (vendedor 403); data repetida 409 e retroativa 400 com texto claro; nova vigência futura entra e aparece no histórico com quem alterou; sem editar/apagar", async () => {
  const db = dbComLeitor();
  assert.equal((await lerParametros(db, "u-v")).status, 403);
  assert.equal((await gravarParametros(db, "u-v", PARAMS_NOVOS())).status, 403);
  assert.equal((await lerParametros(db, null)).status, 401);
  const dia = mais(40);
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia }))).status, 201);
  const dup = await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia }));
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, "Já existe uma vigência com esta data. Escolha outra data.");
  const antiga = await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: "2020-01-01" }));
  assert.equal(antiga.status, 400);
  assert.equal(antiga.body.error, "A vigência não pode começar antes de hoje: os percentuais que já valeram não são reescritos.");
  const lido = await lerParametros(db, "u-gc");
  assert.equal(lido.status, 200);
  assert.equal(lido.body.vigentes.vigente_desde, "2026-11-19");
  assert.deepEqual(lido.body.historico.map((h: any) => h.vigente_desde), [dia, "2026-11-19"]);
  assert.equal(lido.body.historico[0].alterado_por_nome, "Diretora Comercial");
  assert.equal(typeof (rotaParametros as any).PATCH, "undefined");
  assert.equal(typeof (rotaParametros as any).PUT, "undefined");
  assert.equal(typeof (rotaParametros as any).DELETE, "undefined");
});

// ═══ 6) Ligações das telas (fonte) ═══════════════════════════════════════════
await caso("fonte: a aba 'Percentuais do MOT' só existe dentro do bloco do gestor e só renderiza com gestor; a tela Nova proposta só habilita o MOT para gestor com empresa de teste; MODELOS_ATIVOS segue literalmente [\"RS\"]", () => {
  const lista = fs.readFileSync("src/components/propostas/PropostasListaClient.tsx", "utf8");
  const bloco = lista.slice(lista.indexOf("{gestor && ("), lista.indexOf("{gestor && (") + 700);
  assert.ok(bloco.includes('setAba("percentuais")') && bloco.includes("Percentuais do MOT"));
  assert.ok(lista.includes('aba === "percentuais" && gestor ? <PercentuaisMotAdmin />'));
  assert.equal((lista.match(/Percentuais do MOT/g) ?? []).length, 1);
  const nova = fs.readFileSync("src/components/propostas/PropostaNovaClient.tsx", "utf8");
  assert.ok(nova.includes("const motLiberado = gestor && empresa?.teste === true;"));
  assert.ok(nova.includes('const modeloAtual: ModeloProposta = modelo === "MOT" && !motLiberado ? "RS" : modelo;'));
  assert.ok(nova.includes("const noTeste = m === \"MOT\" && gestor && !MODELOS_ATIVOS.includes(m);"));
  assert.ok(nova.includes('"Em teste"') && nova.includes('"Em breve"'));
  assert.ok(nova.includes("bloqueadoPorCalculo") && nova.includes("previaMot.erro !== null"));
  const pagina = fs.readFileSync("src/app/painel/comercial/propostas/nova/page.tsx", "utf8");
  assert.ok(pagina.includes("gestor={ctx.gestor}"));
  assert.match(fs.readFileSync("src/lib/propostas.ts", "utf8"), /export const MODELOS_ATIVOS: ModeloProposta\[\] = \["RS"\];/);
});
await caso("fonte (2E): o detalhe do MOT gera o PDF como o R&S (rascunho ou com revisão; link por revisão com ?rev=N) e não tem mais o 'PDF do MOT em breve'; o detalhe do R&S só ganhou o desvio para o MOT", () => {
  const mot = fs.readFileSync("src/components/propostas/PropostaDetalheMot.tsx", "utf8");
  assert.doesNotMatch(mot, /PDF do MOT em breve|TEXTO_PDF_MOT_EM_BREVE/);
  assert.ok(mot.includes("const temPdf = d.situacao === \"rascunho\" || d.revisoes.length > 0;"));
  assert.ok(mot.includes("`${urlPdf}?rev=${r.revisao}`") && mot.includes("Gerar PDF do rascunho") && mot.includes("Gerar PDF (Rev. "));
  const modal = fs.readFileSync("src/components/propostas/ModalMarcarEnviadaMot.tsx", "utf8");
  assert.doesNotMatch(modal, /CampoMoeda|valor_estimado/, "o envio do MOT não pede valor");
  assert.ok(modal.includes('onConfirmar={() => mudarSituacao({ para: "enviada" })}') === false);
  assert.ok(mot.includes('mudarSituacao({ para: "enviada" })'));
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
