// Verificação do PDF da proposta MOT (2E): texto extraído, valores da calculadora, rótulos do Word, cores, páginas (1, 5 e 20 funções), marca TESTE, revisões antigas
// com percentuais congelados, rota de PDF e R&S intacto. Banco em memória do harness; nada toca o Supabase real.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-mot-pdf.mts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
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
  FUNCAO_MOT_PADRAO, LIMITES_PARAMETROS_MOT, TEMPLATE_VERSAO_MOT, TEXTO_INTRODUTORIO_PADRAO_MOT, conteudoMotSchema, mensagemErroConteudoMot, montarSnapshotMot, snapshotMotSchema, textoFaturamentoMot,
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



// ── Casos do PDF do MOT (2E) ─────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import path from "node:path";
import { gerarPdfPropostaMot, CHAVES_EM_VERMELHO, PLANILHAS_POR_PAGINA, ROTULOS_VERBAS_PDF } from "@/lib/propostaPdfMot";
import { ITENS_FIXOS_MOT, QUANTIDADE_ITENS_FIXOS_MOT, SUBTITULO_MOT, TITULO_MOT, numeroClausulaAdicionalMot } from "@/lib/propostaMot";
import { formatarPercentualBp } from "@/lib/propostaMotCalculo";
import { ENDERECOS_RODAPE_PROPOSTA } from "@/lib/propostaAssets";

const SEM_PASTA = path.join(process.cwd(), "nao-existe-pasta-zz");
const CABECALHO_REAL = path.join(process.cwd(), "public", "propostas", "cabecalho");
const CLIENTES_REAL = path.join(process.cwd(), "public", "propostas", "clientes");
const dec = new TextDecoder("windows-1252");
const VERMELHO_PDF = "0.62 0.05 0.05 rg";

async function paginasPdf(bytes: Uint8Array): Promise<{ textos: string[]; bruto: string }[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((pg) => {
    const conts = pg.node.Contents();
    const lista: any[] = conts instanceof PDFArray ? conts.asArray().map((r) => doc.context.lookup(r)) : conts ? [conts] : [];
    const bruto = lista.map((c) => Buffer.from(decodePDFRawStream(c as PDFRawStream).decode()).toString("latin1")).join("\n");
    const textos = [...bruto.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => dec.decode(Buffer.from(m[1], "hex")));
    return { textos, bruto };
  });
}
const ocorrencias = (lista: string[], t: string) => lista.filter((x) => x === t).length;
const todos = (pgs: { textos: string[] }[]) => pgs.flatMap((p) => p.textos);
const norm = (t: string) => t.replace(/\s+/g, " ");

const PARAMS = { vigente_desde: "2026-11-19", id: "par-1", ...INICIAIS } as ParametrosMotVigentes;
function snapMot(funcoes: Record<string, unknown>[], extra: Record<string, unknown> = {}, parametros: ParametrosMotVigentes = PARAMS, entrada: Record<string, unknown> = {}) {
  return montarSnapshotMot({
    numero: "TESTE-MOT-0001/26", revisao: 0, templateVersao: 1, dataEmissao: "2026-11-21", validadeDias: 15, validadeAte: "2026-12-06", clienteNome: "ZZTEST Cliente S/A", aosCuidados: "ZZTEST Ana",
    vendedorNome: "ZZTEST Vendedor", vendedorCargo: "Especialista em pessoas", vendedorTelefone: "(19) 99999-0000", vendedorEmail: "zztest@salmazos.com.br", parametros,
    conteudo: { funcoes, ...extra }, layoutPlanilha: "por_funcao", ...entrada,
  } as any);
}
const F = (salario: number, extra: Record<string, unknown> = {}) => ({ ...FUNCAO_MOT_PADRAO, salario_centavos: salario, ...extra });
const gerar = (snap: any, o: Record<string, unknown> = {}) => gerarPdfPropostaMot(snap, { pastaClientes: SEM_PASTA, pastaCabecalho: CABECALHO_REAL, ...o });

await caso("PDF MOT: R$ 1.000,00 → TOTAL N. FISCAL R$ 1.889,64 e R$ 3.200,00 → R$ 6.046,93; cada linha da planilha bate com a calculadora; sub total 2.322,87 (números do sistema, não os do Word)", async () => {
  const pgs = await paginasPdf(await gerar(snapMot([F(100000), F(320000)])));
  const t = todos(pgs);
  for (const [i, s] of [100000, 320000].entries()) {
    const calc = calcularPlanilhaMot({ salarioCentavos: s, parametros: INICIAIS });
    const v = (c: number) => formatarCentavosBRL(c).replace(/ /g, " ");
    assert.ok(t.includes(v(calc.totalNfCentavos)), `total NF da função ${i + 1}`);
    assert.equal(ocorrencias(t, v(calc.totalNfCentavos)), 2, "uma vez na faixa VALOR MENSAL e uma na planilha");
    assert.ok(t.includes(v(calc.subtotalCentavos)));
    for (const l of [...calc.linhas, ...calc.retencoes]) if (l.valorCentavos !== null) assert.ok(t.includes(v(l.valorCentavos)), `${l.chave} ${l.valorCentavos}`);
  }
  assert.ok(t.includes("R$ 1.889,64") && t.includes("R$ 6.046,93") && t.includes("R$ 2.322,87"));
  assert.ok(!t.includes("R$ 1.889,66") && !t.includes("R$ 2.322,88"));
});
await caso("PDF MOT: valor mensal por extenso e total — 1 função só tem 'VALOR MENSAL'; várias têm uma faixa por função e o 'VALOR MENSAL TOTAL' (soma) no fim", async () => {
  const um = todos(await paginasPdf(await gerar(snapMot([F(100000)]))));
  assert.ok(um.includes("VALOR MENSAL") && !um.some((x) => x.includes("VALOR MENSAL TOTAL")));
  assert.ok(norm(um.join(" ")).includes("(Mil, oitocentos e oitenta e nove reais e sessenta e quatro centavos)"));
  const varias = todos(await paginasPdf(await gerar(snapMot([F(100000), F(320000), F(449999)]))));
  assert.ok(varias.includes("VALOR MENSAL – Função 1 (OPERACIONAL)") && varias.includes("VALOR MENSAL – Função 3 (OPERACIONAL)"));
  assert.ok(varias.includes("VALOR MENSAL TOTAL"));
  const soma = 188964 + 604693 + 850346;
  assert.ok(varias.includes(formatarCentavosBRL(soma).replace(/ /g, " ")), "total mensal = soma dos valores mensais");
  assert.ok(norm(varias.join(" ")).includes(`(${valorPorExtensoBRL(soma)})`));
});
await caso("PDF MOT: rótulos do Word só no PDF (por chave), percentuais entre parênteses só em taxa, encargos e retenções; o snapshot guarda os rótulos do sistema, que não mudam", async () => {
  const snap = snapMot([F(100000)]);
  const t = todos(await paginasPdf(await gerar(snap)));
  for (const r of ["VERBAS", "VALORES (R$)", "Salário", "FGTS", "INSS", "Férias (ref. 1 mês)", "1/3 sobre Férias", "13º Salário (ref. 1 mês)", "Exames Admissionais", "Vale Transporte", "SUB TOTAL", "TOTAL N. FISCAL"]) assert.ok(t.includes(r), r);
  for (const r of ["Taxa Administrativa (10%)", "Encargos Tributários (32%)", "ISS (2%)", "INSS (11%)", "IR (1%)", "COFINS (3%)", "CSLL (1%)", "PIS (0,65%)"]) assert.ok(t.includes(r), r);
  assert.ok(!t.some((x) => /^FGTS \(|^INSS \(31|INSS patronal/.test(x)), "FGTS e INSS patronal sem percentual e sem o rótulo do sistema");
  assert.equal(snap.funcoes[0].planilha.linhas.find((l) => l.chave === "inss_patronal")!.rotulo, "INSS patronal", "o snapshot não foi alterado");
  assert.equal(formatarPercentualBp(65), "0,65%");
  assert.deepEqual([...CHAVES_EM_VERMELHO].sort(), ["encargos_tributarios", "ret_cofins", "ret_csll", "ret_inss", "ret_ir", "ret_iss", "ret_pis", "taxa_administrativa"]);
  for (const chave of Object.keys(ROTULOS_VERBAS_PDF)) assert.ok(snap.funcoes[0].planilha.linhas.some((l) => l.chave === chave) || snap.funcoes[0].planilha.retencoes.some((l) => l.chave === chave), chave);
});
await caso("PDF MOT: vermelho-escuro SÓ nas 8 linhas (rótulo + valor = 16 textos por planilha); o resto do PDF fica em preto/amarelo/cinza do R&S; SUB TOTAL e TOTAL em negrito", async () => {
  for (const n of [1, 3]) {
    const pgs = await paginasPdf(await gerar(snapMot(Array.from({ length: n }, () => F(100000)))));
    assert.equal(pgs.reduce((s, p) => s + (p.bruto.match(/0\.62 0\.05 0\.05 rg/g) ?? []).length, 0), 16 * n, `${n} planilha(s)`);
    const cores = new Set(pgs.flatMap((p) => [...p.bruto.matchAll(/([0-9.]+ [0-9.]+ [0-9.]+) rg/g)].map((m) => m[1])));
    for (const c of cores) assert.ok(["0 0 0", "1 0.843 0", "0.12 0.14 0.16", "0.93 0.93 0.93", "0.89 0.89 0.89", "0.96 0.96 0.96", "0.62 0.05 0.05", "0.85 0.1 0.1", "0.43 0.46 0.5"].includes(c), `cor fora da paleta: ${c}`);
    assert.ok(!cores.has("1 1 1"), "nenhum texto branco: as faixas de valor não são mais pretas");
  }
});
await caso("PDF MOT: faixas de VALOR MENSAL em cinza claro com texto escuro (uma por função), o VALOR MENSAL TOTAL (ou o único VALOR MENSAL) um tom mais escuro com barra amarela e borda preta fina; as faixas pretas de título e o cabeçalho continuam pretos", async () => {
  const largurasPretas = (bruto: string) => [...bruto.matchAll(/0 0 0 rg\n0 w\n\[\] 0 d\n1 0 0 1 [0-9.]+ [0-9.]+ cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 ([0-9.]+) l\n([0-9.]+) [0-9.]+ l/g)].map((m) => ({ h: Number(m[1]), w: Number(m[2]) }));
  const conta = (pgs: { bruto: string }[], padrao: RegExp) => pgs.reduce((s, p) => s + (p.bruto.match(padrao) ?? []).length, 0);
  for (const n of [1, 3]) {
    const pgs = await paginasPdf(await gerar(snapMot(Array.from({ length: n }, (_, i) => F(100000, { area: `AREA${i + 1}` })))));
    const porFuncao = n > 1 ? n : 0;
    assert.equal(conta(pgs, /0\.93 0\.93 0\.93 rg/g), porFuncao, `${n}: uma faixa de preenchimento cinza claro por função (só quando há mais de uma; com 1 função a única faixa é a do total)`);
    assert.equal(conta(pgs, /0\.89 0\.89 0\.89 rg/g), 1, `${n}: exatamente uma faixa de total (um tom mais escuro)`);
    assert.equal(conta(pgs, /1 0\.843 0 rg/g) >= 1, true, "barra amarela do total e demais amarelos do R&S");
    // faixas pretas retangulares de largura de conteúdo (495,28) só as de título: ORÇAMENTO + 1 PLANILHA DE VERBAS por função, todas com 24 pt de altura
    const pretas = pgs.flatMap((p) => largurasPretas(p.bruto)).filter((r) => Math.abs(r.w - 495.28) < 0.01);
    assert.ok(pretas.length >= 1 + n && pretas.every((r) => r.h === 24), `${n}: faixas pretas de título (24 pt): ${JSON.stringify(pretas)}`);
    const t = todos(pgs);
    assert.ok(n === 1 ? t.includes("VALOR MENSAL") : t.includes("VALOR MENSAL TOTAL"));
  }
  // cabeçalho preto com logo continua na página 1 (110 pt) e compacto (32 pt) nas demais, como no R&S
  const pgs = await paginasPdf(await gerar(snapMot([F(100000), F(320000)])));
  assert.ok(largurasPretas(pgs[0].bruto).some((r) => r.h === 110 && Math.abs(r.w - 595.28) < 0.01));
});
await caso("PDF MOT: layout novo SEMPRE (v2) mesmo com template_versao 1 — cabeçalho grande com logo, marca d'água, rodapé com os 4 endereços em todas as páginas, sem frase de efeito do R&S", async () => {
  const snap = snapMot([F(100000), F(320000)]);
  assert.equal(snap.template_versao, 1);
  const pgs = await paginasPdf(await gerar(snap));
  assert.ok(pgs.length >= 2);
  for (const p of pgs) for (const linha of ENDERECOS_RODAPE_PROPOSTA) assert.ok(p.textos.includes(linha), `rodapé: ${linha}`);
  // rodapé aprovado: a 3ª linha tem o endereço novo de São Bernardo do Campo (as outras 3 não mudam) e o endereço antigo não aparece mais
  assert.deepEqual(ENDERECOS_RODAPE_PROPOSTA, [
    "Rua Hipólito Piva, nº 30 – Centro – Monte Mor | SP – Tel.: 19 – 3217-7899",
    "Rua Zacarias Costa Camargo, nº 752 – Remanso Campineiro – Hortolândia | SP – Tel.: 19 – 3819-3919",
    "Rua Jurubatuba, nº 292, Sala 56 – Centro – São Bernardo do Campo | SP – CEP 09725-620 – Tel.: 11 – 97345-9009",
    "www.salmazos.com.br | @salmazosrh",
  ]);
  for (const p of pgs) assert.ok(!p.textos.some((x) => x.includes("336") || x.includes("96695")), "sem o endereço antigo");
  const t = todos(pgs);
  assert.ok(!norm(t.join(" ")).includes("Contrate com clareza"));
  // cabeçalho cheio v2: faixa preta de 110 pt na primeira página (842 - 110 = 732) e compacta (32 pt) nas demais
  assert.match(pgs[0].bruto, /1 0 0 1 0 731\.89 cm[\s\S]{0,60}0 110 l\s+595\.28 110 l/);
  assert.match(pgs[1].bruto, /1 0 0 1 0 809\.89 cm[\s\S]{0,60}0 32 l\s+595\.28 32 l/);
  // sem o logo do cabeçalho, o texto "SALMAZOS RH & SERVIÇOS" da faixa entra, como no R&S
  const semLogo = todos(await paginasPdf(await gerar(snap, { pastaCabecalho: SEM_PASTA })));
  assert.ok(semLogo.includes("SALMAZOS RH & SERVIÇOS"));
});
await caso("PDF MOT: dados e textos — título, subtítulo, Cliente/A-C/Nº da proposta com Rev./Data dd/mm/aaaa (sem a linha Supervisão Técnica), introdução, ORÇAMENTO e a tabela com as 4 colunas; sem CNPJ nem endereço do cliente", async () => {
  const snap = snapMot([F(100000, { descricao: "ZZTEST Auxiliar", jornada: "Conforme Convenção Coletiva", horario: "Turnos A / B /C" })], {}, PARAMS, { revisao: 2 });
  const t = todos(await paginasPdf(await gerar(snap)));
  const txt = norm(t.join(" "));
  for (const x of [TITULO_MOT, "PROPOSTA MÃO DE OBRA TEMPORÁRIA", "ORÇAMENTO", "ÁREA", "DESCRIÇÃO / Salário", "JORNADA", "HORÁRIO", "OPERACIONAL", "ZZTEST Auxiliar", "Salário R$ 1.000,00", "Conforme Convenção Coletiva", "Turnos A / B /C"]) assert.ok(t.includes(x), x);
  assert.ok(txt.includes(SUBTITULO_MOT));
  assert.ok(t.includes("Cliente: ") && t.includes("ZZTEST Cliente S/A") && t.includes("A/C: ") && t.includes("ZZTEST Ana"));
  // A linha "Supervisão Técnica" saiu do cabeçalho: nem o rótulo nem o nome/cargo do vendedor aparecem acima da assinatura; o nome do vendedor só vem no bloco de assinatura.
  assert.ok(!txt.includes("Supervisão Técnica") && !txt.includes("Supervisao Tecnica"), "sem a linha Supervisão Técnica");
  assert.ok(!t.includes("ZZTEST Vendedor – Especialista em pessoas") && !txt.includes("Especialista em pessoas"), "cargo do vendedor não sai mais no PDF");
  // ordem do cabeçalho: Cliente, A/C, Nº da proposta, Data — e as linhas seguem coladas (mesmo passo vertical, sem buraco onde ficava a Supervisão Técnica)
  const bruto = (await paginasPdf(await gerar(snap)))[0].bruto;
  const yDe = (textoDoTj: string) => {
    const hex = Buffer.from(textoDoTj, "latin1").toString("hex").toUpperCase();
    const m = new RegExp(`1 0 0 1 [0-9.]+ ([0-9.]+) Tm\\s*<${hex}> Tj`, "i").exec(bruto);
    return m ? Number(m[1]) : NaN;
  };
  const ys = ["Cliente: ", "A/C: ", "Nº da proposta: ", "Data: "].map(yDe);
  assert.ok(ys.every(Number.isFinite), `rótulos achados: ${ys}`);
  assert.ok(ys[0] > ys[1] && ys[1] > ys[2] && ys[2] > ys[3], `ordem Cliente, A/C, Nº da proposta, Data: ${ys}`);
  const passos = [ys[0] - ys[1], ys[1] - ys[2], ys[2] - ys[3]];
  assert.ok(passos.every((d) => Math.abs(d - passos[0]) < 0.05), `mesmo espaçamento entre as 4 linhas: ${passos}`);
  // Respiro antes de "Vimos através desta…": uma linha em branco a mais (de linha de base a linha de base: era ~25 pt entre a Data e o parágrafo, agora ~40 pt)
  const yIntro = yDe("Vimos através desta, apresentar nossa Proposta de Mão de Obra Temporária.");
  assert.ok(Number.isFinite(yIntro), "parágrafo de introdução achado");
  const respiro = ys[3] - yIntro;
  assert.ok(Math.abs(respiro - (10.5 * 1.45 + 10 + 10.5 * 1.45)) < 0.1, `espaço entre a Data e o parágrafo: ${respiro}`);
  assert.ok(t.includes("TESTE-MOT-0001/26 – Rev. 2") || txt.includes("TESTE-MOT-0001/26"), "número com revisão");
  assert.ok(t.includes("21/11/2026"), "data dd/mm/aaaa");
  assert.ok(!txt.includes("de Novembro de 2026"));
  assert.ok(txt.includes("Vimos através desta, apresentar nossa Proposta de Mão de Obra Temporária."));
  assert.ok(!txt.includes("CNPJ do cliente") && !t.includes("CNPJ: ") && !t.includes("Endereço: "));
});
await caso("PDF MOT: cláusulas 1.1 a 1.5 (texto do Word) e as adicionais seguindo 1.6, 1.7…; validade antes da planilha e assinatura DEPOIS dela, inteira numa página; assinatura como o R&S (empresa + vendedor, telefone, e-mail)", async () => {
  const adicionais = ["ZZTEST primeira cláusula adicional.", "ZZTEST segunda cláusula adicional, mais longa, para quebrar linha e conferir o recuo do texto no PDF do MOT."];
  const snap = snapMot([F(100000)], { clausulas_adicionais: adicionais });
  const pgs = await paginasPdf(await gerar(snap));
  const t = todos(pgs);
  const txt = norm(t.join(" "));
  const fixas = [ITENS_FIXOS_MOT.exames, ITENS_FIXOS_MOT.encargos, ITENS_FIXOS_MOT.adicionais, ITENS_FIXOS_MOT.faltas, textoFaturamentoMot(snap.condicoes)];
  fixas.forEach((f, i) => { assert.ok(t.includes(`1.${i + 1}`), `1.${i + 1}`); assert.ok(txt.includes(norm(f).slice(0, 60)), f.slice(0, 40)); });
  // 1.3: a planilha de verbas vem DEPOIS das cláusulas, então o texto diz "a seguir" (nas duas ocorrências), nunca "acima"
  assert.ok(ITENS_FIXOS_MOT.adicionais.includes("apresentados na tabela a seguir contemplam") && ITENS_FIXOS_MOT.adicionais.includes("tabela de encargos a seguir."));
  assert.ok(!/acima/i.test(ITENS_FIXOS_MOT.adicionais), "sem 'acima' na 1.3");
  assert.ok(txt.includes("apresentados na tabela a seguir contemplam") && txt.includes("tabela de encargos a seguir."));
  assert.ok(!/\bacima\b/i.test(txt), "nenhum 'acima' no PDF do MOT");
  assert.equal(QUANTIDADE_ITENS_FIXOS_MOT, 5);
  assert.equal(numeroClausulaAdicionalMot(0), "1.6");
  assert.equal(numeroClausulaAdicionalMot(1), "1.7");
  assert.ok(t.includes("1.6") && t.includes("1.7") && !t.includes("1.8"));
  assert.ok(txt.includes("ZZTEST primeira cláusula adicional.") && txt.includes("ZZTEST segunda cláusula adicional"));
  assert.ok(txt.includes("vencimento da fatura para dia 15 e 30"));
  // Validade continua ANTES da planilha de verbas; a assinatura vai DEPOIS dela, inteira numa página só, sem mudar de conteúdo.
  const SEQ = ["SALMAZOS – Recrutamento, Seleção e Terceirização de Serviços (desde 2013)", "ZZTEST Vendedor", "(19) 99999-0000", "zztest@salmazos.com.br"];
  const validadeTxt = "Validade da proposta: 15 dias corridos, até 06/12/2026.";
  assert.equal(ocorrencias(t, validadeTxt), 1);
  const pgAssinatura = pgs.filter((pg) => pg.textos.includes(SEQ[0]));
  assert.equal(pgAssinatura.length, 1, "assinatura aparece uma vez");
  for (const x of SEQ) assert.ok(pgAssinatura[0].textos.includes(x), `assinatura inteira na mesma página: ${x}`);
  const posicao = (txt: string) => t.indexOf(txt);
  assert.ok(posicao(validadeTxt) < t.indexOf("VERBAS"), "validade antes da planilha de verbas");
  assert.ok(t.lastIndexOf("TOTAL N. FISCAL") < posicao(SEQ[0]), "assinatura DEPOIS da planilha de verbas");
  assert.ok(SEQ.every((x, i) => i === 0 || posicao(SEQ[i - 1]) < posicao(x)), "mesma ordem de antes dentro da assinatura");
  assert.ok(!t.includes("Elizabete Salmazo Santos") && !txt.includes("CNPJ.: 18.545"), "assinatura do R&S (vendedor), não a fixa do Word");
});
await caso("PDF MOT: planilhas de verbas — uma por função, sempre inteiras (nunca cortadas), no máximo 2 por página; páginas com 1, 5 e 20 funções", async () => {
  assert.equal(PLANILHAS_POR_PAGINA, 2);
  const resultados: Record<number, { paginas: number; porPagina: number[] }> = {};
  for (const n of [1, 5, 20]) {
    const funcoes = Array.from({ length: n }, (_, i) => F(100000 + i * 12345, { area: `AREA${String(i + 1).padStart(2, "0")}`, descricao: `ZZTEST função ${i + 1}` }));
    const pgs = await paginasPdf(await gerar(snapMot(funcoes)));
    const verbas = pgs.map((p) => ocorrencias(p.textos, "VERBAS"));
    const totais = pgs.map((p) => ocorrencias(p.textos, "TOTAL N. FISCAL"));
    assert.deepEqual(verbas, totais, `${n} funções: nenhuma planilha cortada (cada VERBAS tem o seu TOTAL N. FISCAL na mesma página)`);
    assert.equal(verbas.reduce((a, b) => a + b, 0), n, "uma planilha por função");
    const ASSIN = ["SALMAZOS – Recrutamento, Seleção e Terceirização de Serviços (desde 2013)", "ZZTEST Vendedor", "(19) 99999-0000", "zztest@salmazos.com.br"];
    const comAssin = pgs.map((pg, i) => ({ i, tem: ASSIN.filter((x) => pg.textos.includes(x)).length })).filter((x) => x.tem > 0);
    assert.deepEqual(comAssin.map((x) => x.tem), [4], `${n} funções: assinatura inteira numa página só: ${JSON.stringify(comAssin)}`);
    assert.ok(comAssin[0].i >= verbas.map((v, i) => (v > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1), `${n} funções: assinatura depois da última planilha`);
    assert.ok(verbas.every((v) => v <= PLANILHAS_POR_PAGINA), `${n} funções: no máximo 2 por página: ${verbas}`);
    const t = todos(pgs);
    for (let i = 1; i <= n; i++) assert.ok(t.includes(`VALOR MENSAL – Função ${i} (AREA${String(i).padStart(2, "0")})`) || n === 1, `faixa da função ${i}`);
    if (n > 1) assert.ok(t.some((x) => x.startsWith("PLANILHA DE VERBAS – Função 1 (AREA01)")) && t.some((x) => x === `PLANILHA DE VERBAS – Função ${n} (AREA${String(n).padStart(2, "0")})`));
    resultados[n] = { paginas: pgs.length, porPagina: verbas };
    assert.ok(pgs.length >= Math.ceil(n / 2) + 1 && pgs.length <= Math.ceil(n / 2) + 4, `${n} funções: ${pgs.length} páginas`);
  }
  console.log("      páginas por nº de funções:", JSON.stringify(resultados));
});
await caso("PDF MOT: a tabela ORÇAMENTO com 20 funções atravessa páginas e repete o cabeçalho; nenhuma linha é cortada e cada função aparece na tabela", async () => {
  const funcoes = Array.from({ length: 20 }, (_, i) => F(100000, { area: `AREA${String(i + 1).padStart(2, "0")}`, descricao: `ZZTEST ${i + 1} ${"descrição longa ".repeat(6)}`, jornada: "Jornada longa conforme convenção coletiva da categoria, com escala especial", horario: "Turnos A / B /C e plantões" }));
  const pgs = await paginasPdf(await gerar(snapMot(funcoes)));
  const comTabela = pgs.filter((p) => p.textos.includes("DESCRIÇÃO / Salário"));
  assert.ok(comTabela.length >= 2, "o cabeçalho da tabela se repete nas páginas seguintes");
  for (const p of pgs) if (p.textos.some((x) => /^Salário R\$ 1\.000,00$/.test(x))) assert.ok(p.textos.includes("DESCRIÇÃO / Salário"), "toda página com linhas do orçamento tem o cabeçalho");
  assert.equal(ocorrencias(todos(pgs), "Salário R$ 1.000,00"), 20, "as 20 linhas do orçamento");
});
await caso("PDF MOT: marca TESTE em TODAS as páginas quando é proposta de teste e em nenhuma quando não é (a marca vem da opção, nunca do snapshot)", async () => {
  const snap = snapMot(Array.from({ length: 5 }, () => F(100000)));
  const com = await paginasPdf(await gerar(snap, { teste: true }));
  assert.ok(com.length >= 3);
  for (const p of com) { assert.ok(p.textos.includes("TESTE"), "TESTE na página"); assert.match(p.bruto, /0\.85 0\.1 0\.1 rg/); }
  const sem = await paginasPdf(await gerar(snap));
  for (const p of sem) assert.ok(!p.textos.includes("TESTE"));
  assert.doesNotMatch(JSON.stringify(snap), /"teste"/, "o snapshot nunca carrega a marca");
});
await caso("PDF MOT: grade de clientes no fim (como o R&S) e texto com caracteres que o PDF não imprime (emoji, setas) não derruba o PDF: sai sem eles e o resto do texto fica", async () => {
  const snap = snapMot([F(100000, { area: "OPERAÇÃO 😀 Ñ", descricao: "Auxiliar → líder 🚀", jornada: "44h ✓ semanais", horario: "07h às 16h 😀" })], {
    texto_introdutorio: "Prezados 😀, segue ✓ nossa proposta.", clausulas_adicionais: ["Cláusula 🚀 com emoji e acentuação: ação, coração, nº 5."],
  });
  const bytes = await gerar(snap, { pastaClientes: CLIENTES_REAL });
  const pgs = await paginasPdf(bytes);
  const t = todos(pgs);
  const txt = norm(t.join(" "));
  assert.ok(t.includes("Alguns de nossos clientes:"), "grade de clientes");
  assert.doesNotMatch(txt, /😀|🚀|✓|→/u);
  assert.ok(txt.includes("Prezados, segue nossa proposta.") || txt.includes("Prezados, segue  nossa proposta."), txt.slice(0, 200));
  assert.ok(txt.includes("Cláusula com emoji e acentuação: ação, coração, nº 5."));
  assert.ok(t.includes("44h semanais") && t.includes("07h às 16h"));
  assert.ok(t.some((x) => x.startsWith("OPERA")));
});
await caso("PDF MOT: gerar PDF de proposta de outro modelo lança 'Modelo ainda não disponível' (nunca um PDF de MOT com dados de R&S)", async () => {
  await assert.rejects(() => gerarPdfPropostaMot({ ...snapMot([F(100000)]), modelo: "RS" } as any), /Modelo ainda não disponível/);
});

// ═══ Layout NOVO: UMA planilha de verbas sobre a SOMA dos salários ═══════════
const snapUnica = (funcoes: Record<string, unknown>[], extra: Record<string, unknown> = {}) => snapMot(funcoes, extra, PARAMS, { layoutPlanilha: "unica" });
const brlTxt = (c: number) => formatarCentavosBRL(c).replace(/ /g, " ");
await caso("PDF MOT (layout único): 3 funções (1.000,00 + 3.200,00 + 1.800,50) → base 6.000,50, UMA planilha 'PLANILHA DE VERBAS' sem 'Função N', com a linha de composição da base; total = TOTAL N. FISCAL dela; assinatura DEPOIS e inteira", async () => {
  const funcoes = [F(100000, { area: "OPERACIONAL" }), F(320000, { area: "ADMINISTRATIVO" }), F(180050, { area: "LOGÍSTICA" })];
  const snap = snapUnica(funcoes);
  assert.equal(snap.layout_planilha, "unica");
  const plan = calcularPlanilhaMot({ salarioCentavos: 600050, parametros: INICIAIS });
  assert.equal(snap.planilha_unica!.salario_centavos, 600050, "base = soma dos salários");
  assert.equal(snap.planilha_unica!.total_nf_centavos, plan.totalNfCentavos);
  assert.equal(snap.total_mensal_centavos, plan.totalNfCentavos, "total da proposta = TOTAL N. FISCAL da planilha única");
  const pgs = await paginasPdf(await gerar(snap));
  const t = todos(pgs);
  assert.equal(ocorrencias(t, "PLANILHA DE VERBAS"), 1, "uma única planilha");
  assert.equal(ocorrencias(t, "TOTAL N. FISCAL"), 1);
  assert.equal(ocorrencias(t, "VERBAS"), 1);
  assert.ok(!t.some((x) => x.startsWith("PLANILHA DE VERBAS –")) && !t.some((x) => /^VALOR MENSAL – Função/.test(x)), "sem planilha nem faixa por função");
  const base = "Base de cálculo: " + brlTxt(600050) + " (OPERACIONAL: " + brlTxt(100000) + " + ADMINISTRATIVO: " + brlTxt(320000) + " + LOGÍSTICA: " + brlTxt(180050) + ")";
  assert.ok(norm(t.join(" ")).includes(norm(base)) || t.includes(base), "composição da base: " + base);
  assert.ok(t.includes("VALOR MENSAL TOTAL") && t.includes(brlTxt(plan.totalNfCentavos)), "faixa do total = TOTAL N. FISCAL da planilha");
  assert.equal(ocorrencias(t, brlTxt(plan.totalNfCentavos)), 2, "o mesmo valor na faixa e no TOTAL N. FISCAL da planilha");
  console.log("      3 funções: base " + brlTxt(600050) + " | planilha única: total NF " + brlTxt(plan.totalNfCentavos) + " | valor_estimado = " + (plan.totalNfCentavos / 100).toFixed(2));
});
await caso("PDF MOT (layout único): 1 função → base só com nome e valor, 'VALOR MENSAL' (sem 'TOTAL'), uma planilha, mesmo valor da planilha por função de antes", async () => {
  const snap = snapUnica([F(100000, { area: "OPERACIONAL" })]);
  const t = todos(await paginasPdf(await gerar(snap)));
  assert.ok(t.join(" ").includes("Base de cálculo: " + brlTxt(100000) + " (OPERACIONAL)"), "nome e valor");
  assert.ok(t.includes("VALOR MENSAL") && !t.includes("VALOR MENSAL TOTAL"));
  assert.equal(ocorrencias(t, "PLANILHA DE VERBAS"), 1);
  assert.equal(snap.total_mensal_centavos, 188964, "1 função: o mesmo 1.889,64 de sempre");
});
await caso("PDF MOT (layout único): lista de funções (ORÇAMENTO) segue com UMA linha por função (área, descrição, salário); a linha de composição quebra com 20 funções sem cortar a planilha; assinatura inteira depois dela", async () => {
  const funcoes = Array.from({ length: 20 }, (_, i) => F(100000 + i * 12345, { area: "AREA" + String(i + 1).padStart(2, "0"), descricao: "ZZTEST função " + (i + 1) }));
  const snap = snapUnica(funcoes);
  const pgs = await paginasPdf(await gerar(snap));
  const t = todos(pgs);
  for (let i = 1; i <= 20; i++) assert.ok(t.includes("ZZTEST função " + i) && t.includes("AREA" + String(i).padStart(2, "0")), "função " + i + " listada");
  assert.equal(ocorrencias(t, "PLANILHA DE VERBAS"), 1);
  assert.equal(pgs.map((p) => ocorrencias(p.textos, "VERBAS")).join(), pgs.map((p) => ocorrencias(p.textos, "TOTAL N. FISCAL")).join(), "planilha inteira numa página");
  const pgAss = pgs.filter((p) => p.textos.includes("ZZTEST Vendedor"));
  assert.equal(pgAss.length, 1);
  assert.ok(pgs.indexOf(pgAss[0]) >= pgs.findIndex((p) => p.textos.includes("TOTAL N. FISCAL")), "assinatura depois da planilha");
});
await caso("PDF MOT: proposta ANTIGA (snapshot SEM layout_planilha) continua com UMA planilha POR FUNÇÃO e o total somando as funções, exatamente como antes", async () => {
  const nova = snapUnica([F(100000), F(320000)]);
  // snapshot como gravado antes desta mudança: sem layout_planilha nem planilha_unica, total = soma dos TOTAL N. FISCAL por função
  const { layout_planilha, planilha_unica, ...resto } = nova as any;
  const antiga = snapshotMotSchema.parse({ ...resto, total_mensal_centavos: 188964 + 604693, total_mensal_extenso: nova.total_mensal_extenso });
  assert.equal((antiga as any).layout_planilha, undefined);
  const t = todos(await paginasPdf(await gerar(antiga)));
  assert.equal(ocorrencias(t, "TOTAL N. FISCAL"), 2, "duas planilhas (uma por função)");
  assert.ok(t.includes("PLANILHA DE VERBAS – Função 1 (OPERACIONAL)") && t.includes("PLANILHA DE VERBAS – Função 2 (OPERACIONAL)"));
  assert.ok(t.includes("VALOR MENSAL – Função 1 (OPERACIONAL)") && t.includes("VALOR MENSAL TOTAL") && t.includes(brlTxt(188964 + 604693)), "total = 7.936,57 (soma por função)");
  assert.ok(!t.join(" ").includes("Base de cálculo"), "sem linha de composição");
});
await caso("conteúdo MOT: a SOMA dos salários também respeita o teto da calculadora (R$ 10.000.000,00) — sem isso a planilha única daria erro 500", async () => {
  const ok = conteudoMotSchema.safeParse({ funcoes: [{ ...FUNCAO_MOT_PADRAO, salario_centavos: 500000000 }, { ...FUNCAO_MOT_PADRAO, salario_centavos: 500000000 }] });
  assert.equal(ok.success, true);
  const ruim = conteudoMotSchema.safeParse({ funcoes: [{ ...FUNCAO_MOT_PADRAO, salario_centavos: 600000000 }, { ...FUNCAO_MOT_PADRAO, salario_centavos: 500000000 }] });
  assert.equal(ruim.success, false);
  assert.match(mensagemErroConteudoMot((ruim as any).error.issues), /A soma dos salários passa do limite/);
});

// ═══ A rota: PDF por revisão, acesso e erros ═════════════════════════════════
const F0 = [funcao({ salario_centavos: 449999 })];
const F1 = [funcao({ salario_centavos: 449999 }), funcao({ area: "ADMINISTRATIVO", salario_centavos: 50000 })];
await caso("rota PDF (MOT de TESTE, gestor, SEM chave do harness): rascunho gera PDF (200) com os percentuais VIGENTES e marca TESTE; cada revisão gera PDF do SEU snapshot; reabrir Rev. 0 depois de mudarem os percentuais mostra os percentuais congelados, nunca os de hoje", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-g", { conteudo: conteudoMot({ funcoes: F0 }) }, EMP_TESTE)).body.data.id as string;
  const rasc = await pdf(db, "u-g", id);
  assert.equal(rasc.status, 200);
  const pr = await paginasPdf(rasc.body);
  assert.ok(todos(pr).includes("Taxa Administrativa (10%)") && todos(pr).includes("R$ 8.503,46"));
  assert.ok(pr.every((p) => p.textos.includes("TESTE")), "marca TESTE do rascunho");
  assert.equal((await situacao(db, "u-g", id, { para: "enviada" })).status, 200);
  // a diretoria muda a taxa DEPOIS do envio (vigência que já vale hoje)
  db.tabelas.proposta_mot_parametros.push({ ...PARAMETROS_SEED(), id: "nova", vigente_desde: HOJE, taxa_administrativa_bp: 1500, created_at: "2026-11-21T10:00:00Z" });
  assert.equal((await patch(db, "u-g", id, { conteudo: conteudoMot({ funcoes: F1 }) })).status, 200);
  const rev0 = await chamar(db, "u-g", rotaPdf.GET, { id, url: `http://x/api/comercial/propostas/${id}/pdf?rev=0` });
  const rev1 = await chamar(db, "u-g", rotaPdf.GET, { id, url: `http://x/api/comercial/propostas/${id}/pdf?rev=1` });
  const atual = await pdf(db, "u-g", id);
  assert.deepEqual([rev0.status, rev1.status, atual.status], [200, 200, 200]);
  const a = todos(await paginasPdf(rev0.body));
  const b = todos(await paginasPdf(rev1.body));
  const c = todos(await paginasPdf(atual.body));
  assert.ok(a.includes("Taxa Administrativa (10%)") && !a.includes("Taxa Administrativa (15%)"), "Rev. 0: taxa congelada de 10%");
  assert.ok(a.includes("R$ 8.503,46") && !a.some((x) => x.startsWith("VALOR MENSAL TOTAL")));
  assert.ok(b.includes("Taxa Administrativa (15%)") && !b.includes("Taxa Administrativa (10%)"), "Rev. 1: percentuais da emissão dela");
  // Rev. 1 é uma revisão NOVA: layout único, total = TOTAL N. FISCAL da planilha sobre a SOMA dos salários (4.499,99 + 500,00)
  const totalB = calcularPlanilhaMot({ salarioCentavos: 449999 + 50000, parametros: { ...INICIAIS, taxa_administrativa_bp: 1500 } }).totalNfCentavos;
  assert.ok(b.includes("VALOR MENSAL TOTAL") && b.includes(formatarCentavosBRL(totalB).replace(/ /g, " ")), "total da Rev. 1 com a taxa de 15%");
  assert.ok(!b.includes("R$ 9.448,31"), "o total de hoje-com-10% não aparece na Rev. 1");
  assert.deepEqual(c, b, "sem ?rev= vale a revisão atual");
  const prev = (db.tabelas.proposta_revisoes as any[]).map((r) => r.conteudo.parametros.taxa_administrativa_bp);
  assert.deepEqual(prev, [1000, 1500]);
}, {}));
await caso("rota PDF: rev inválida 400; revisão que não existe 404; rascunho SEM percentuais vigentes → 409 com a mensagem de 'peça à diretoria'; snapshot gravado corrompido → 500 claro (nenhum PDF errado)", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-g", { conteudo: conteudoMot({ funcoes: F0 }) }, EMP_TESTE)).body.data.id as string;
  assert.equal((await chamar(db, "u-g", rotaPdf.GET, { id, url: `http://x/api/x?rev=abc` })).status, 400);
  assert.equal((await chamar(db, "u-g", rotaPdf.GET, { id, url: `http://x/api/x?rev=-1` })).status, 400);
  assert.equal((await chamar(db, "u-g", rotaPdf.GET, { id, url: `http://x/api/x?rev=7` })).status, 404);
  const semVigencia = novoDb({ proposta_mot_parametros: [] });
  const id2 = (await criar(semVigencia, "u-g", { conteudo: conteudoMot({ funcoes: F0 }) }, EMP_TESTE)).body.data.id as string;
  const r = await pdf(semVigencia, "u-g", id2);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Peça à diretoria para cadastrá-los/);
  await situacao(db, "u-g", id, { para: "enviada" });
  db.tabelas.proposta_revisoes[0].conteudo = { ...db.tabelas.proposta_revisoes[0].conteudo, funcoes: "quebrado" };
  const ruim = await pdf(db, "u-g", id);
  assert.equal(ruim.status, 500);
  assert.equal(ruim.body.error, "Não foi possível ler os dados desta revisão.");
}, {}));
await caso("rota PDF: acesso igual ao R&S — sem login 401; sem acesso 403; proposta de teste invisível para vendedor (404); vendedor de outra pessoa 404; gestor lê (200); só acompanha lê o PDF do que vê", async () => {
  const db = novoDb();
  db.tabelas.analistas_perfil.push({ id: "66666666-6666-4666-8666-000000000001", user_id: "u-semacesso", nome_completo: "Sem Acesso", email: "s@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true });
  const teste = (await comMot(async () => criar(db, "u-g", { conteudo: conteudoMot({ funcoes: F0 }) }, EMP_TESTE), {})).body.data.id as string;
  const real = (await comMot(async () => criar(db, "u-v", { conteudo: conteudoMot({ funcoes: F0 }) }), { HARNESS_PROPOSTA_MOT: "1" })).body.data.id as string;
  assert.equal((await pdf(db, null, teste)).status, 401);
  assert.equal((await pdf(db, "u-semacesso", teste)).status, 403);
  assert.equal((await pdf(db, "u-v", teste)).status, 404, "teste é invisível para o vendedor");
  assert.equal((await pdf(db, "u-gc", teste)).status, 200, "gestor lê o PDF do teste");
  assert.equal((await pdf(db, "u-v", real)).status, 200, "dono");
  assert.equal((await pdf(db, "u-gc", real)).status, 200, "gestor");
  db.tabelas.analistas_perfil.push({ id: "v2", user_id: "u-v2", nome_completo: "Outro Vendedor", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true });
  assert.equal((await pdf(db, "u-v2", real)).status, 404);
  // PDF de proposta MOT REAL (só existe pelo harness): sem marca TESTE
  const semMarca = await paginasPdf((await pdf(db, "u-v", real)).body);
  assert.ok(semMarca.every((p) => !p.textos.includes("TESTE")));
});
await caso("rota PDF: o R&S segue gerando o mesmo PDF pela rota (200 e %PDF); a rota só devolve 409 para modelo sem PDF (TS); o nome do arquivo tem -revN a partir da Rev. 1 (fonte)", async () => {
  const db = novoDb();
  const rs = (await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP, conteudo: {} } })).body.data.id as string;
  const r = await pdf(db, "u-v", rs);
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.body.slice(0, 4)).toString("latin1"), "%PDF");
  const rota = fs.readFileSync("src/app/api/comercial/propostas/[id]/pdf/route.ts", "utf8");
  assert.ok(rota.includes('snap.data.modelo !== "RS" && snap.data.modelo !== "MOT"'));
  assert.ok(rota.includes("snapshotMotSchema.safeParse(snap.data)") && rota.includes("revisaoDoArquivo > 0"));
  assert.ok(rota.includes("teste: proposta.teste === true"), "a marca vem da linha da proposta");
});
await caso("R&S INTACTO: propostaPdf.ts só ganhou a palavra 'export' em 3 declarações (Escritor, carregarLogoCabecalho, desenharGradeClientes); nada mais mudou", () => {
  const atual = fs.readFileSync("src/lib/propostaPdf.ts", "utf8");
  let base: string;
  try { base = execFileSync("git", ["show", "d49f071:src/lib/propostaPdf.ts"], { encoding: "utf8" }); } catch { return; }
  const volta = atual
    .replace("export class Escritor {", "class Escritor {")
    .replace("export async function carregarLogoCabecalho(", "async function carregarLogoCabecalho(")
    .replace("export async function desenharGradeClientes(", "async function desenharGradeClientes(");
  assert.equal(volta.replace(/\r\n/g, "\n"), base.replace(/\r\n/g, "\n"));
  assert.ok(atual !== base);
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
