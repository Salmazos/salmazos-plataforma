// Verificação da API da proposta de Mão de Obra Temporária (MOT): conteúdo e validação, snapshot com a planilha congelada, parâmetros (diretoria),
// número real e de teste, modelo desligado em produção, criar/editar/enviar e Funil. SEM telas (2D) e SEM PDF (2E).
// O projeto não tem runner de testes: as rotas rodam contra o banco em memória do harness (scripts/harness-mot/memdb.mjs). Nada toca o Supabase real.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-mot-api.mts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import * as rotaId from "@/app/api/comercial/propostas/[id]/route";
import * as rotaSit from "@/app/api/comercial/propostas/[id]/situacao/route";
import * as rotaPdf from "@/app/api/comercial/propostas/[id]/pdf/route";
import * as rotaParametros from "@/app/api/comercial/propostas/mot/parametros/route";
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

// ═══ 1) Conteúdo: schema e validação ═════════════════════════════════════════
await caso("conteudoMotSchema: válido (1 função) ganha os padrões das condições (vencimento 15 e 30, 5 dias); funções de 1 a 20", () => {
  const r = conteudoMotSchema.safeParse(conteudoMot());
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  assert.deepEqual(r.data.condicoes, { vencimentos_dias: [15, 30], antecedencia_dias: 5 });
  assert.equal(r.data.funcoes.length, 1);
  assert.equal(conteudoMotSchema.safeParse({ funcoes: Array.from({ length: 20 }, () => funcao()) }).success, true);
  assert.equal(conteudoMotSchema.safeParse({ funcoes: Array.from({ length: 21 }, () => funcao()) }).success, false);
  assert.equal(conteudoMotSchema.safeParse(conteudoMot({ condicoes: { vencimentos_dias: [10], antecedencia_dias: 0 }, cargo_supervisao: "Analista", texto_introdutorio: "Olá" })).success, true);
});
await caso("conteúdo INVÁLIDO: 0 funções, sem funções, função sem área/jornada/horário, salário zero/negativo/fracionário/texto/acima do teto, campos grandes demais — mensagens em português, sem caminho interno", () => {
  const falha = (c: unknown, trecho: RegExp) => {
    const r = comMotSync(() => validarConteudo("MOT", c));
    assert.equal(r.ok, false, String(JSON.stringify(c)).slice(0, 90));
    if (!r.ok) {
      assert.match(r.error, trecho, r.error);
      assert.doesNotMatch(r.error, /funcoes\.\d|salario_centavos|invalid|expected|undefined|\[object/i, "sem detalhe interno: " + r.error);
    }
  };
  falha({ funcoes: [] }, /pelo menos uma função/);
  falha({}, /pelo menos uma função/);
  falha(undefined, /pelo menos uma função/);
  falha({ funcoes: "x" }, /pelo menos uma função/);
  falha(conteudoMot({ funcoes: [funcao({ area: "" })] }), /Função 1 \(área\): Preencha a área/);
  falha(conteudoMot({ funcoes: [funcao({ area: "   " })] }), /Função 1 \(área\)/);
  falha(conteudoMot({ funcoes: [funcao(), funcao({ jornada: "" })] }), /Função 2 \(jornada\)/);
  falha(conteudoMot({ funcoes: [funcao({ horario: "" })] }), /Função 1 \(horário\)/);
  for (const s of [0, -1, -100000]) falha(conteudoMot({ funcoes: [funcao({ salario_centavos: s })] }), /Função 1 \(salário\): O salário precisa ser maior que zero/);
  falha(conteudoMot({ funcoes: [funcao({ salario_centavos: 1500.5 })] }), /centavos inteiros/);
  falha(conteudoMot({ funcoes: [funcao({ salario_centavos: "1000" })] }), /Função 1 \(salário\)/);
  falha(conteudoMot({ funcoes: [funcao({ salario_centavos: null })] }), /Função 1 \(salário\)/);
  falha(conteudoMot({ funcoes: [funcao({ salario_centavos: salarioDoTeto + 1 })] }), /passa do limite de R\$\s*10\.000\.000,00/);
  falha(conteudoMot({ funcoes: [funcao({ area: "x".repeat(81) })] }), /A área vai até 80 caracteres/);
  falha(conteudoMot({ funcoes: [funcao({ descricao: "x".repeat(201) })] }), /A descrição vai até 200 caracteres/);
  falha(conteudoMot({ funcoes: [funcao({ jornada: "x".repeat(121) })] }), /A jornada vai até 120/);
  falha(conteudoMot({ funcoes: [funcao({ horario: "x".repeat(121) })] }), /O horário vai até 120/);
  falha(conteudoMot({ cargo_supervisao: "x".repeat(101) }), /O cargo vai até 100/);
  falha(conteudoMot({ texto_introdutorio: "x".repeat(1001) }), /texto introdutório vai até 1000/);
  falha(conteudoMot({ texto_introdutorio: "😀😀" }), /não consegue imprimir/);
  falha(conteudoMot({ condicoes: { vencimentos_dias: [] } }), /Condições: .*pelo menos um dia/);
  falha(conteudoMot({ condicoes: { vencimentos_dias: [0] } }), /de 1 a 31/);
  falha(conteudoMot({ condicoes: { vencimentos_dias: [32] } }), /de 1 a 31/);
  falha(conteudoMot({ condicoes: { vencimentos_dias: [15, 15] } }), /Não repita/);
  falha(conteudoMot({ condicoes: { vencimentos_dias: [1, 2, 3, 4, 5] } }), /no máximo 4/);
  falha(conteudoMot({ condicoes: { antecedencia_dias: -1 } }), /não pode ser negativa/);
  falha(conteudoMot({ condicoes: { antecedencia_dias: 31 } }), /até 30 dias/);
  assert.equal(comMotSync(() => validarConteudo("MOT", conteudoMot({ funcoes: [funcao({ salario_centavos: salarioDoTeto })] })).ok), true, "o teto exato é aceito");
});
function comMotSync<T>(fn: () => T): T {
  const antes = { m: process.env.HARNESS_PROPOSTA_MOT, n: process.env.NODE_ENV, v: process.env.VERCEL_ENV, vv: process.env.VERCEL };
  delete process.env.NODE_ENV; delete process.env.VERCEL_ENV; delete process.env.VERCEL; process.env.HARNESS_PROPOSTA_MOT = "1";
  try { return fn(); } finally {
    for (const [k, v] of [["HARNESS_PROPOSTA_MOT", antes.m], ["NODE_ENV", antes.n], ["VERCEL_ENV", antes.v], ["VERCEL", antes.vv]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

await caso("cláusulas adicionais (opcionais): lista vazia por padrão; com itens vale; mesmos limites e mensagens do R&S (10 itens, 600 caracteres, sem vazia, só imprimível)", () => {
  const padrao = conteudoMotSchema.parse(conteudoMot());
  assert.deepEqual(padrao.clausulas_adicionais, [], "vazia por padrão");
  assert.deepEqual(conteudoMotSchema.parse(conteudoMot({ clausulas_adicionais: ["  Primeira cláusula.  ", "Segunda cláusula."] })).clausulas_adicionais, ["Primeira cláusula.", "Segunda cláusula."], "aparada");
  // o MOT usa EXATAMENTE os limites do R&S (fonte única)
  assert.equal(MAX_CLAUSULAS_ADICIONAIS, RS_MAX_CLAUSULAS);
  assert.equal(MAX_CLAUSULA_ADICIONAL, RS_MAX_CLAUSULA);
  assert.equal(MAX_CLAUSULAS_ADICIONAIS, 10);
  assert.equal(MAX_CLAUSULA_ADICIONAL, 600);
  const falha = (clausulas: unknown, trecho: RegExp) => {
    const r = comMotSync(() => validarConteudo("MOT", conteudoMot({ clausulas_adicionais: clausulas })));
    assert.equal(r.ok, false);
    if (!r.ok) { assert.match(r.error, trecho, r.error); assert.doesNotMatch(r.error, /clausulas_adicionais|invalid|expected|undefined/i, r.error); }
    // a mensagem de cada regra é a MESMA do R&S
    const rs = conteudoRsSchema.safeParse({ clausulas_adicionais: clausulas });
    assert.equal(rs.success, false);
    if (!rs.success && !r.ok) assert.ok(r.error.includes(rs.error.issues[0].message), "mesma mensagem do R&S: " + rs.error.issues[0].message);
  };
  falha(Array.from({ length: 11 }, (_, i) => `Cláusula ${i + 1}.`), /Use no máximo 10 cláusulas adicionais/);
  falha(["x".repeat(601)], /Cláusula adicional 1: Cada cláusula adicional vai até 600 caracteres/);
  falha(["ok", ""], /Cláusula adicional 2: Preencha a cláusula adicional ou remova-a/);
  falha(["   "], /Cláusula adicional 1: Preencha a cláusula adicional ou remova-a/);
  falha(["😀😀"], /Cláusula adicional 1: A cláusula adicional só tem caracteres que o PDF não consegue imprimir/);
  { const r = comMotSync(() => validarConteudo("MOT", conteudoMot({ clausulas_adicionais: "texto solto" }))); assert.deepEqual(r, { ok: false, error: "As cláusulas adicionais devem ser uma lista de textos." }); }
  assert.equal(comMotSync(() => validarConteudo("MOT", conteudoMot({ clausulas_adicionais: Array.from({ length: 10 }, () => "x".repeat(600)) })).ok), true, "10 de 600 é o limite aceito");
});

// ═══ 2) Snapshot: planilha calculada e congelada ═════════════════════════════
const PARAMETROS_VIGENTES: ParametrosMotVigentes = { vigente_desde: "2026-11-19", id: "par-1", ...INICIAIS };
const entradaMot = (conteudo: unknown, extra: Record<string, unknown> = {}) => ({
  modelo: "MOT" as const, numero: "ES-MOT-0072/26", revisao: 0, templateVersao: TEMPLATE_VERSAO_MOT, dataEmissao: "2026-11-20", validadeDias: 15, validadeAte: "2026-12-05",
  clienteNome: "PASTIFÍCIO SELMI S/A", aosCuidados: "Isadora Ramos Marques", conteudo, vendedorNome: "LUCAS MIGUEL", vendedorCargo: "Especialista em pessoas",
  vendedorTelefone: "(19) 99452-7272", vendedorEmail: "lucas@salmazos.com.br", parametrosMot: PARAMETROS_VIGENTES, ...extra,
});
await caso("snapshot, 1 função (salário R$ 1.000,00): linhas na ordem do Word, NF R$ 1.889,64 linha a linha, valor mensal por extenso com 'Mil' (nunca 'Hum mil')", () => {
  const s = comMotSync(() => montarSnapshot(entradaMot(conteudoMot())));
  assert.ok(snapshotMotSchema.safeParse(s).success, "o snapshot respeita o próprio schema");
  const f = s.funcoes[0];
  assert.deepEqual(f.planilha.linhas.map((l) => l.chave), ["salario", "fgts", "inss_patronal", "ferias", "terco_ferias", "decimo_terceiro", "taxa_administrativa", "exames_admissionais", "vale_transporte", "encargos_tributarios", "subtotal"]);
  assert.equal(f.planilha.base_centavos, 159977);
  assert.equal(f.planilha.subtotal_centavos, 232287);
  assert.equal(f.planilha.total_retencoes_centavos, 43323);
  assert.equal(f.planilha.total_nf_centavos, 188964);
  assert.equal(f.valor_mensal_centavos, 188964);
  assert.equal(f.valor_mensal_extenso, "Mil, oitocentos e oitenta e nove reais e sessenta e quatro centavos");
  assert.doesNotMatch(f.valor_mensal_extenso + s.total_mensal_extenso, /hum mil|um mil/i);
  assert.equal(s.total_mensal_centavos, 188964);
  assert.equal(s.total_mensal_extenso, f.valor_mensal_extenso);
  assert.deepEqual(f.planilha.retencoes.map((r) => r.valor_centavos), [4646, 25552, 2323, 6969, 2323, 1510]);
  // linhas impressas (sem o subtotal) somam o subtotal
  assert.equal(f.planilha.linhas.filter((l) => l.chave !== "subtotal").reduce((x, l) => x + (l.valor_centavos ?? 0), 0), f.planilha.subtotal_centavos);
});
await caso("snapshot: percentuais vigentes congelados (com a data de início), cargo do vendedor (perfil, ou o informado no conteúdo), texto de apresentação padrão com 'segmento', e-mail só corporativo", () => {
  const s = comMotSync(() => montarSnapshot(entradaMot(conteudoMot())));
  assert.deepEqual(s.parametros, { vigente_desde: "2026-11-19", id: "par-1", ...INICIAIS });
  assert.equal(s.vendedor_cargo, "Especialista em pessoas");
  const outro = comMotSync(() => montarSnapshot(entradaMot(conteudoMot({ cargo_supervisao: "Gerente Comercial" }))));
  assert.equal(outro.vendedor_cargo, "Gerente Comercial");
  assert.equal(comMotSync(() => montarSnapshot(entradaMot(conteudoMot(), { vendedorCargo: null }))).vendedor_cargo, null);
  assert.equal(s.texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_MOT);
  assert.match(s.texto_introdutorio, /no segmento de mão de obra/);
  assert.doesNotMatch(s.texto_introdutorio, /seguimento/);
  assert.equal(s.vendedor_email, "lucas@salmazos.com.br");
  assert.equal(comMotSync(() => montarSnapshot(entradaMot(conteudoMot(), { vendedorEmail: "pessoal@gmail.com" }))).vendedor_email, null);
  assert.equal(comMotSync(() => montarSnapshot(entradaMot(conteudoMot({ texto_introdutorio: "Texto livre do vendedor." })))).texto_introdutorio, "Texto livre do vendedor.");
  assert.equal(s.template_versao, TEMPLATE_VERSAO_MOT);
  assert.equal(TEMPLATE_VERSAO_MOT, 1);
  assert.deepEqual(s.condicoes, { vencimentos_dias: [15, 30], antecedencia_dias: 5 });
});
await caso("snapshot, várias funções: cada função tem a PRÓPRIA planilha (arredondamento linha a linha) e o total é a soma dos valores mensais; sem arredondar a soma", () => {
  const salarios = [100000, 151800, 345678, 1];
  const s = comMotSync(() => montarSnapshot(entradaMot(conteudoMot({ funcoes: salarios.map((x, i) => funcao({ area: `FUNÇÃO ${i + 1}`, salario_centavos: x })) }))));
  assert.equal(s.funcoes.length, 4);
  salarios.forEach((sal, i) => {
    const ref = calcularPlanilhaMot({ salarioCentavos: sal, parametros: INICIAIS });
    assert.equal(s.funcoes[i].planilha.total_nf_centavos, ref.totalNfCentavos, `função ${i + 1}`);
    assert.equal(s.funcoes[i].planilha.subtotal_centavos, ref.subtotalCentavos);
    assert.equal(s.funcoes[i].valor_mensal_extenso, valorPorExtensoBRL(ref.totalNfCentavos));
    assert.equal(s.funcoes[i].area, `FUNÇÃO ${i + 1}`);
  });
  assert.equal(s.total_mensal_centavos, s.funcoes.reduce((x, f) => x + f.valor_mensal_centavos, 0));
  assert.equal(s.total_mensal_extenso, valorPorExtensoBRL(s.total_mensal_centavos));
  assert.ok(snapshotMotSchema.safeParse(s).success);
  // referência: R$ 1.000,00 → NF R$ 1.889,64. (R$ 3.200,00 NÃO dá 1.889,64: dá o valor abaixo.)
  assert.equal(calcularPlanilhaMot({ salarioCentavos: 100000, parametros: INICIAIS }).totalNfCentavos, 188964);
  assert.equal(formatarCentavosBRL(calcularPlanilhaMot({ salarioCentavos: 320000, parametros: INICIAIS }).totalNfCentavos).replace(/\s/g, " "), "R$ 6.046,93");
});
await caso("snapshot do MOT leva as cláusulas adicionais (vazia = []); o do R&S NÃO ganha esse campo e segue idêntico", () => {
  const sem = comMotSync(() => montarSnapshot(entradaMot(conteudoMot())));
  assert.deepEqual(sem.clausulas_adicionais, []);
  const com = comMotSync(() => montarSnapshot(entradaMot(conteudoMot({ clausulas_adicionais: ["  Prazo de reposição de 30 dias.  ", "Faturamento mensal."] }))));
  assert.deepEqual(com.clausulas_adicionais, ["Prazo de reposição de 30 dias.", "Faturamento mensal."]);
  assert.ok(snapshotMotSchema.safeParse(com).success && snapshotMotSchema.safeParse(sem).success);
  assert.equal(com.total_mensal_centavos, sem.total_mensal_centavos, "cláusulas não mudam o valor");
  const rs = montarSnapshot({ modelo: "RS", numero: "VE-0053/26", revisao: 0, templateVersao: 2, dataEmissao: "2026-11-20", validadeDias: 15, validadeAte: "2026-12-05", clienteNome: "X", aosCuidados: null, conteudo: {}, vendedorNome: "V", vendedorTelefone: null });
  assert.deepEqual(Object.keys(rs).sort(), ["aos_cuidados", "clausulas_adicionais", "cliente_cnpj", "cliente_endereco", "cliente_nome", "condicoes", "data_emissao", "modelo", "numero", "revisao", "template_versao", "texto_introdutorio", "validade_ate", "validade_dias", "vendedor_email", "vendedor_nome", "vendedor_telefone"].sort(), "as chaves do snapshot do R&S não mudaram");
});
await caso("cláusulas do MOT pela API: criar/editar/enviar guardam a lista; a Rev. 0 e a Rev. 1 levam as cláusulas; CNPJ e endereço NÃO existem no MOT", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v", { conteudo: conteudoMot({ clausulas_adicionais: ["Cláusula A."] }) })).body.data.id as string;
  assert.deepEqual(proposta(db, id).conteudo.clausulas_adicionais, ["Cláusula A."]);
  assert.equal((await criar(db, "u-v")).body.data.conteudo.clausulas_adicionais.length, 0);
  const ruim = await criar(db, "u-v", { conteudo: conteudoMot({ clausulas_adicionais: Array.from({ length: 11 }, () => "x") }) });
  assert.equal(ruim.status, 400);
  assert.match(ruim.body.error, /Use no máximo 10 cláusulas adicionais/);
  assert.equal((await situacao(db, "u-v", id, { para: "enviada" })).status, 200);
  assert.deepEqual(db.tabelas.proposta_revisoes[0].conteudo.clausulas_adicionais, ["Cláusula A."]);
  const ed = await patch(db, "u-v", id, { conteudo: conteudoMot({ clausulas_adicionais: ["Cláusula A.", "Cláusula B."] }) });
  assert.equal(ed.status, 200);
  assert.deepEqual(db.tabelas.proposta_revisoes[1].conteudo.clausulas_adicionais, ["Cláusula A.", "Cláusula B."]);
  assert.deepEqual(db.tabelas.proposta_revisoes[0].conteudo.clausulas_adicionais, ["Cláusula A."], "a Rev. 0 não mudou");
  // CNPJ e endereço do cliente não entram no MOT (igual ao Word): campos extras são descartados
  const c = conteudoMotSchema.parse(conteudoMot({ cliente_cnpj: "12.345.678/0001-90", cliente_endereco: "Rua X" }));
  assert.equal("cliente_cnpj" in c || "cliente_endereco" in c, false);
  const snap = comMotSync(() => montarSnapshot(entradaMot(conteudoMot({ cliente_cnpj: "1", cliente_endereco: "x" }))));
  assert.equal("cliente_cnpj" in snap || "cliente_endereco" in snap, false);
}));
await caso("snapshot: conteúdo inválido não vira snapshot (lança); sem percentuais não monta; percentuais fora de faixa são recusados", () => {
  assert.throws(() => comMotSync(() => montarSnapshot(entradaMot({ funcoes: [] }))));
  assert.throws(() => comMotSync(() => montarSnapshot(entradaMot(conteudoMot(), { parametrosMot: undefined }))), /Percentuais do MOT ausentes/);
  assert.throws(() => comMotSync(() => montarSnapshot(entradaMot(conteudoMot(), { parametrosMot: { ...PARAMETROS_VIGENTES, fgts_bp: 10001 } }))), /inválidos/);
  assert.equal(textoFaturamentoMot({ vencimentos_dias: [30, 15], antecedencia_dias: 5 }), "O faturamento será através de nota fiscal com vencimento da fatura para dia 15 e 30, pago à Salmazos RH, com antecedência de 05 dias do pagamento dos colaboradores ou conforme acordado entre as partes.");
  assert.match(textoFaturamentoMot({ vencimentos_dias: [5, 15, 30], antecedencia_dias: 1 }), /dia 5, 15 e 30, .* 01 dia do pagamento/);
});
await caso("R&S INALTERADO byte a byte: snapshot e conteúdo do PDF (v1 e v2) idênticos aos de antes do MOT (hashes gerados na origin/main c01e974)", async () => {
  const entrada = (templateVersao: number) => ({
    modelo: "RS" as const, numero: "VE-0053/26", revisao: 1, templateVersao, dataEmissao: "2026-11-20", validadeDias: 15, validadeAte: "2026-12-05", clienteNome: "Cliente Dourado S/A", aosCuidados: "Maria Silva",
    conteudo: {
      cliente_cnpj: "12.345.678/0001-90", cliente_endereco: "Rua das Flores, 100 - Campinas/SP",
      condicoes: { taxa_sem_reposicao_pct: 40, taxa_com_reposicao_pct: 50, prazo_envio_curriculos_dias_uteis: 6, taxa_cancelamento_pct: 20, prazo_faturamento_dias: 10 },
      texto_introdutorio: "Prezados,\nSegue nossa proposta de recrutamento.",
      clausulas_adicionais: ["Cláusula extra um.", "Cláusula extra dois, um pouco mais longa para quebrar linha no PDF e conferir o recuo do texto."],
    },
    vendedorNome: "Vendedor Teste", vendedorTelefone: "(19) 99999-0000", vendedorEmail: "vendedor@salmazos.com.br",
  });
  const GOLDEN = {
    snapshot_v1: "cefa6bfd160e3837607bd95dd55fff1ccce0a3d7f31ebfb28a99663791b417cb",
    snapshot_v2: "58f3bacc0574ac0f8137d9d714662527d0037feb21e6bce6806dd396b82507aa",
    pdf_v1: ["72a0609fa0ed26925e2e7a1cf4d268c86228b0ab6b4f85f715780a66e7196cc4", "e45bb7a69efd237e18970c7817b1e59b5e79cf9668a25c8693207d89a5ee5fb2"],
    pdf_v2: ["c884866eb926441bc074e22c98eb8b5ab1bac80600ecf71e7247e4a9161f1b73", "2bc05f29ea2732e441fc285fea321b8c30398c5a036900b62b0d2da4a855b49d"],
    // Tudo padrão (sem texto introdutório nem cláusulas): exercita os textos fixos do template v2.
    snapshot_v2_padrao: "bbb3017f2f91f42c728b68aae09f41f07e82dc019710250610006c560836f0f2",
    pdf_v2_padrao: ["e71cf10d4d5e60085a07f8f1461273734ca18441d44df477c7da171ff7e782be", "bbdf41b9c8791759dbc9f8bcbda5ad1e128ffb76ec8653c240bb2b9330a39bfb"],
  };
  const hashPaginas = async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes);
    return doc.getPages().map((pg) => {
      const conts = pg.node.Contents();
      const lista: any[] = conts instanceof PDFArray ? conts.asArray().map((r) => doc.context.lookup(r)) : conts ? [conts] : [];
      return crypto.createHash("sha256").update(lista.map((c) => Buffer.from(decodePDFRawStream(c as PDFRawStream).decode()).toString("latin1")).join("\n")).digest("hex");
    });
  };
  for (const v of [1, 2] as const) {
    const snap = montarSnapshot(entrada(v));
    assert.equal(crypto.createHash("sha256").update(JSON.stringify(snap)).digest("hex"), GOLDEN[`snapshot_v${v}`], `snapshot R&S v${v}`);
    assert.deepEqual(await hashPaginas(await gerarPdfProposta(snap)), GOLDEN[`pdf_v${v}`], `PDF R&S v${v}`);
  }
  const padrao = montarSnapshot({ ...entrada(2), conteudo: {} });
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(padrao)).digest("hex"), GOLDEN.snapshot_v2_padrao, "snapshot R&S v2 com tudo padrão");
  assert.deepEqual(await hashPaginas(await gerarPdfProposta(padrao)), GOLDEN.pdf_v2_padrao, "PDF R&S v2 com tudo padrão");
  assert.equal(TEMPLATE_VERSAO_ATUAL, 2, "o template do R&S continua na v2");
  assert.equal(MODELOS_PROPOSTA.RS.templateVersao, 2);
  assert.equal(MODELOS_PROPOSTA.MOT.templateVersao, TEMPLATE_VERSAO_MOT, "o MOT tem versão própria");
  assert.equal(comMotSync(() => validarConteudo("RS", {}).ok), true);
});

// ═══ 3) Modelo desligado em produção ═════════════════════════════════════════
await caso("MODELOS_ATIVOS = [\"RS\"] e o MOT NÃO está disponível sem a chave: validarConteudo/modeloDisponivel recusam; a API recusa criar MOT (400 'Modelo ainda não disponível.')", async () => {
  assert.deepEqual(MODELOS_ATIVOS, ["RS"]);
  const db = novoDb();
  await comMot(async () => {
    assert.equal(modeloDisponivel("MOT"), false);
    assert.equal(modeloDisponivel("TS"), false);
    assert.equal(modeloDisponivel("RS"), true);
    assert.deepEqual(validarConteudo("MOT", conteudoMot()), { ok: false, error: MENSAGEM_MODELO_INDISPONIVEL });
    const r = await criar(db, "u-v");
    assert.equal(r.status, 400);
    assert.equal(r.body.error, MENSAGEM_MODELO_INDISPONIVEL);
    assert.equal(db.tabelas.propostas.length, 0);
    assert.equal(db.rpcChamadas.length, 0);
    assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT, "contador do MOT intacto");
    // gestor/teste também não consegue
    assert.equal((await criar(db, "u-g", {}, EMP_TESTE)).status, 400);
  }, {});
});
await caso("a chave do harness NUNCA liga o MOT em produção: NODE_ENV=production, VERCEL_ENV, VERCEL e valores diferentes de '1' mantêm o MOT desligado", async () => {
  for (const env of [
    { HARNESS_PROPOSTA_MOT: "1", NODE_ENV: "production" }, { HARNESS_PROPOSTA_MOT: "1", VERCEL_ENV: "production" }, { HARNESS_PROPOSTA_MOT: "1", VERCEL_ENV: "preview" },
    { HARNESS_PROPOSTA_MOT: "1", VERCEL: "1" }, { HARNESS_PROPOSTA_MOT: "true" }, { HARNESS_PROPOSTA_MOT: "0" }, { HARNESS_PROPOSTA_MOT: "" }, { HARNESS_PROPOSTA_MOT: "yes" }, {},
  ] as Record<string, string>[]) {
    await comMot(async () => {
      assert.equal(chaveHarnessMotLigada(), false, JSON.stringify(env));
      assert.equal(modeloDisponivel("MOT"), false, JSON.stringify(env));
      const db = novoDb();
      assert.equal((await criar(db, "u-v")).status, 400, JSON.stringify(env));
      assert.equal(validarConteudo("MOT", conteudoMot()).ok, false);
    }, env);
  }
  await comMot(() => { assert.equal(chaveHarnessMotLigada(), true); assert.equal(modeloDisponivel("MOT"), true); }, { HARNESS_PROPOSTA_MOT: "1" });
  // O TS segue desligado com a chave ligada (a chave é só do MOT).
  await comMot(() => assert.equal(modeloDisponivel("TS"), false));
});
await caso("fonte: MODELOS_ATIVOS continua literalmente [\"RS\"], sem ler ambiente; a tela Nova proposta ainda mostra o MOT como 'Em breve' (só MODELOS_ATIVOS)", () => {
  const propostas = fs.readFileSync("src/lib/propostas.ts", "utf8");
  assert.match(propostas, /export const MODELOS_ATIVOS: ModeloProposta\[\] = \["RS"\];/);
  assert.equal(MODELOS_PROPOSTA.MOT.ativo, false);
  const nova = fs.readFileSync("src/components/propostas/PropostaNovaClient.tsx", "utf8");
  assert.ok(nova.includes("MODELOS_ATIVOS.includes(m)") && !nova.includes("HARNESS_PROPOSTA_MOT") && !nova.includes("modeloDisponivel"));
  assert.match(propostas, /env\.NODE_ENV !== "production" && !env\.VERCEL_ENV && !env\.VERCEL/);
  for (const arquivo of ["src/lib/propostaModelos.ts", "src/lib/propostaServico.ts", "src/app/api/comercial/propostas/route.ts"]) {
    assert.doesNotMatch(fs.readFileSync(arquivo, "utf8"), /HARNESS_PROPOSTA_MOT/, `${arquivo} não lê a chave direto: só modeloDisponivel()`);
  }
});

// ═══ 4) Criar, editar, enviar ════════════════════════════════════════════════
await caso("criar MOT (real): número SIGLA-MOT-0072/aa pelo criar_proposta, contador do R&S intacto, template_versao do MOT, conteúdo com padrões, histórico; o R&S depois segue VE-0053", async () => comMot(async () => {
  const db = novoDb();
  const r = await criar(db, "u-v");
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `VE-MOT-0072/${AA}`);
  assert.equal(r.body.data.modelo, "MOT");
  assert.equal(r.body.data.teste, false);
  assert.equal(r.body.data.template_versao, TEMPLATE_VERSAO_MOT);
  assert.equal(r.body.data.situacao, "rascunho");
  assert.deepEqual(r.body.data.conteudo.condicoes, { vencimentos_dias: [15, 30], antecedencia_dias: 5 });
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc === "criar_proposta").length, 1);
  assert.equal(db.rpcChamadas[0].p_modelo, "MOT");
  assert.equal(db.rpcChamadas[0].p_sigla, "VE");
  assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT + 1);
  assert.equal(contadorDe(db, "proposta_contadores", "RS"), ULTIMO_RS, "o contador do R&S NÃO andou");
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "rascunho").length, 1);
  const rs = await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } });
  assert.equal(rs.body.data.numero, `VE-0053/${AA}`);
  assert.equal(rs.body.data.template_versao, TEMPLATE_VERSAO_ATUAL);
  assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT + 1);
}));
await caso("criar MOT com conteúdo inválido → 400 em português e NADA é criado nem gasta número; conteúdo do R&S no corpo do MOT é recusado", async () => comMot(async () => {
  const db = novoDb();
  for (const conteudo of [{}, { funcoes: [] }, { funcoes: [funcao({ salario_centavos: 0 })] }, { funcoes: [funcao({ area: "" })] }, { cliente_cnpj: "1", condicoes: { taxa_sem_reposicao_pct: 40 } }]) {
    const r = await criar(db, "u-v", { conteudo });
    assert.equal(r.status, 400, JSON.stringify(conteudo));
    assert.match(r.body.error, /função|Função/);
    assert.doesNotMatch(r.body.error, /undefined|invalid|expected/i);
  }
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.length, 0);
  assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT);
}));
await caso("editar rascunho MOT valida o conteúdo (400 em português, nada muda); edição válida grava; função nova entra", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v")).body.data.id as string;
  const antes = JSON.stringify(proposta(db, id).conteudo);
  const ruim = await patch(db, "u-v", id, { conteudo: { funcoes: [] } });
  assert.equal(ruim.status, 400);
  assert.match(ruim.body.error, /pelo menos uma função/);
  assert.equal(JSON.stringify(proposta(db, id).conteudo), antes);
  const ok = await patch(db, "u-v", id, { conteudo: conteudoMot({ funcoes: [funcao(), funcao({ area: "ADMINISTRATIVO", salario_centavos: 151800 })] }) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(proposta(db, id).conteudo.funcoes.length, 2);
  assert.equal(proposta(db, id).revisao_atual, 0);
  assert.equal(db.tabelas.proposta_revisoes.length, 0);
}));
await caso("enviar MOT: o valor vem da PLANILHA (soma dos valores mensais), o valor digitado pelo cliente é IGNORADO; Rev. 0 grava o snapshot do MOT com percentuais congelados; Funil recebe o valor calculado", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v", { conteudo: conteudoMot({ funcoes: [funcao(), funcao({ area: "ADMINISTRATIVO", salario_centavos: 151800 })] }) })).body.data.id as string;
  const esperado = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: INICIAIS }).totalNfCentavos + calcularPlanilhaMot({ salarioCentavos: 151800, parametros: INICIAIS }).totalNfCentavos;
  const r = await situacao(db, "u-v", id, { para: "enviada", valor_estimado: 999999 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).situacao, "enviada");
  assert.equal(proposta(db, id).valor_estimado, esperado / 100, "valor = soma da planilha, não o 999.999 digitado");
  const semValor = await criar(db, "u-v");
  assert.equal((await situacao(db, "u-v", semValor.body.data.id, { para: "enviada" })).status, 200, "sem valor no corpo também envia (o servidor calcula)");
  const rev = db.tabelas.proposta_revisoes[0];
  assert.equal(rev.template_versao, TEMPLATE_VERSAO_MOT);
  assert.equal(rev.conteudo.modelo, "MOT");
  assert.equal(rev.conteudo.total_mensal_centavos, esperado);
  assert.equal(rev.conteudo.funcoes.length, 2);
  assert.deepEqual(rev.conteudo.parametros, { vigente_desde: "2026-11-19", id: "par-1", ...INICIAIS });
  assert.equal(rev.conteudo.numero, `VE-MOT-0072/${AA}`);
  assert.equal(rev.conteudo.vendedor_cargo, "Especialista em pessoas");
  assert.equal(rev.conteudo.data_emissao, HOJE);
  assert.ok(snapshotMotSchema.safeParse(rev.conteudo).success);
  // Funil (vendedor com Funil): oportunidade com o valor calculado e o serviço do MOT
  const o = db.tabelas.oportunidades[0];
  assert.equal(Number(o.valor_estimado), esperado / 100 + Number(proposta(db, semValor.body.data.id).valor_estimado));
  assert.equal(o.servico_interesse, "Mão de Obra Temporária");
  assert.equal(proposta(db, id).oportunidade_id, o.id);
}));
await caso("enviar MOT SEM percentuais vigentes (tabela vazia ou só futuros) → 409 claro e a proposta continua rascunho (nada gravado, sem Funil)", async () => comMot(async () => {
  for (const linhas of [[], [{ ...PARAMETROS_SEED(), vigente_desde: mais(30) }]]) {
    const db = novoDb({ proposta_mot_parametros: linhas });
    const id = (await criar(db, "u-v")).body.data.id as string;
    const r = await situacao(db, "u-v", id, { para: "enviada" });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error, /Não há percentuais do MOT vigentes/);
    assert.equal(proposta(db, id).situacao, "rascunho");
    assert.equal(db.tabelas.proposta_revisoes.length, 0);
    assert.equal(db.tabelas.oportunidades.length, 0);
    assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "enviada").length, 0);
  }
}));
await caso("enviar MOT: falha ao ler os percentuais → 500 sem detalhe interno e nada muda; conteúdo corrompido no banco → 400 e nada muda", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v")).body.data.id as string;
  db.falhas["rpc.parametros_mot_vigentes"] = "conexão perdida em 10.0.0.5";
  const r = await situacao(db, "u-v", id, { para: "enviada" });
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /10\.0\.0\.5|conexão|rpc/);
  assert.equal(proposta(db, id).situacao, "rascunho");
  delete db.falhas["rpc.parametros_mot_vigentes"];
  proposta(db, id).conteudo = { funcoes: [] }; // corrompido (não passa pela API)
  const r2 = await situacao(db, "u-v", id, { para: "enviada" });
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /incompleto ou inválido/);
  assert.equal(proposta(db, id).situacao, "rascunho");
  assert.equal(db.tabelas.proposta_revisoes.length, 0);
}));
await caso("editar MOT já enviado cria a Rev. 1 com os percentuais VIGENTES HOJE; sem percentuais vigentes a edição falha sem gravar nada", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v")).body.data.id as string;
  assert.equal((await situacao(db, "u-v", id, { para: "enviada" })).status, 200);
  const rev0 = JSON.stringify(db.tabelas.proposta_revisoes[0].conteudo);
  const r = await patch(db, "u-v", id, { conteudo: conteudoMot({ funcoes: [funcao({ salario_centavos: 200000 })] }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.equal(db.tabelas.proposta_revisoes.length, 2);
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[0].conteudo), rev0, "a Rev. 0 não mudou");
  const rev1 = db.tabelas.proposta_revisoes[1].conteudo;
  assert.equal(rev1.revisao, 1);
  assert.equal(rev1.funcoes[0].salario_centavos, 200000);
  assert.equal(rev1.total_mensal_centavos, calcularPlanilhaMot({ salarioCentavos: 200000, parametros: INICIAIS }).totalNfCentavos);
  // sem vigência: a revisão não é criada e a proposta não muda
  db.tabelas.proposta_mot_parametros.length = 0;
  const antes = JSON.stringify({ p: proposta(db, id), r: db.tabelas.proposta_revisoes });
  const sem = await patch(db, "u-v", id, { conteudo: conteudoMot({ funcoes: [funcao({ salario_centavos: 300000 })] }) });
  assert.equal(sem.status, 409);
  assert.match(sem.body.error, /Não há percentuais do MOT vigentes/);
  assert.equal(JSON.stringify({ p: proposta(db, id), r: db.tabelas.proposta_revisoes }), antes);
}));
await caso("PDF do MOT ainda NÃO existe (2E): a rota responde 409 claro, sem gerar um PDF de R&S com dados de MOT; o PDF do R&S continua saindo", async () => comMot(async () => {
  const db = novoDb();
  const mot = (await criar(db, "u-v")).body.data.id as string;
  const r = await pdf(db, "u-v", mot);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /ainda não está disponível/);
  const rs = (await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })).body.data.id as string;
  const ok = await pdf(db, "u-v", rs);
  assert.equal(ok.status, 200);
  assert.ok(ok.body instanceof Uint8Array && ok.body.length > 1000);
}));
await caso("detalhe e lista aceitam o MOT; o vendedor de outra pessoa continua recebendo 404", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v")).body.data.id as string;
  const d = await detalhe(db, "u-v", id);
  assert.equal(d.status, 200);
  assert.equal(d.body.data.modelo, "MOT");
  const l = await chamar(db, "u-v", rotaLista.GET, { url: "http://x/api/comercial/propostas?modelo=MOT" });
  assert.equal(l.body.data.length, 1);
  assert.equal((await detalhe(db, "u-gc", id)).status, 200, "gestor lê");
  db.tabelas.analistas_perfil.push({ id: "v2", user_id: "u-v2", nome_completo: "Outro Vendedor", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true });
  assert.equal((await detalhe(db, "u-v2", id)).status, 404);
}));

// ═══ 5) Teste: TESTE-MOT e sem Funil ═════════════════════════════════════════
await caso("MOT de TESTE (empresa em empresas_teste): TESTE-MOT-0001/aa pelo criar_proposta_teste, contador real do MOT e do R&S intactos, sem Funil ao enviar; valor calculado igual", async () => comMot(async () => {
  const db = novoDb();
  const r = await criar(db, "u-gc", {}, EMP_TESTE);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `TESTE-MOT-0001/${AA}`);
  assert.equal(r.body.data.teste, true);
  assert.equal(r.body.data.oportunidade_id, null);
  assert.equal(db.rpcChamadas[0].rpc, "criar_proposta_teste");
  assert.equal("p_sigla" in db.rpcChamadas[0], false);
  assert.equal(contadorDe(db, "proposta_contadores", "MOT"), ULTIMO_MOT, "contador MOT real intacto");
  assert.equal(contadorDe(db, "proposta_contadores", "RS"), ULTIMO_RS);
  assert.equal(contadorDe(db, "proposta_contadores_teste", "MOT"), 1);
  const base = { o: db.tabelas.oportunidades.length, l: db.tabelas.lembretes.length, i: db.tabelas.oportunidade_interacoes.length };
  const consultas = db.consultas.length;
  const env = await situacao(db, "u-gc", r.body.data.id, { para: "enviada" });
  assert.equal(env.status, 200, JSON.stringify(env.body));
  assert.equal(proposta(db, r.body.data.id).valor_estimado, 1889.64);
  assert.deepEqual({ o: db.tabelas.oportunidades.length, l: db.tabelas.lembretes.length, i: db.tabelas.oportunidade_interacoes.length }, base, "MOT de teste NÃO toca o Funil, mesmo com perfil comercial");
  assert.equal(db.consultas.slice(consultas).filter((q: any) => ["oportunidades", "lembretes", "oportunidade_interacoes"].includes(q.tabela)).length, 0);
  assert.equal(db.tabelas.proposta_revisoes[0].conteudo.modelo, "MOT");
  assert.equal(db.tabelas.proposta_revisoes[0].conteudo.numero, `TESTE-MOT-0001/${AA}`);
  for (const para of ["aceita"]) assert.equal((await situacao(db, "u-gc", r.body.data.id, { para })).status, 200);
  assert.equal(db.tabelas.oportunidades.length, 0);
  // vendedor não cria MOT em empresa de teste
  assert.equal((await criar(db, "u-v", {}, EMP_TESTE)).status, 404);
}));

// ═══ 6) Funil: R&S + MOT na mesma oportunidade ═════════════════════════════
await caso("Funil: R&S (R$ 1.000) + MOT (planilha R$ 1.889,64) na MESMA oportunidade → valor = soma; recusar uma com a outra ativa não fecha; aceitar a outra ganha; valor = soma das aceitas", async () => comMot(async () => {
  const db = novoDb();
  const rs = (await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })).body.data.id as string;
  assert.equal((await situacao(db, "u-v", rs, { para: "enviada", valor_estimado: 1000 })).status, 200);
  const opp = () => db.tabelas.oportunidades[0];
  assert.equal(db.tabelas.oportunidades.length, 1);
  const mot = (await criar(db, "u-v")).body.data.id as string;
  assert.equal(proposta(db, mot).oportunidade_id, opp().id, "o MOT nasce ligado à oportunidade aberta do mesmo vendedor");
  assert.equal((await situacao(db, "u-v", mot, { para: "enviada", valor_estimado: 1 })).status, 200);
  assert.equal(db.tabelas.oportunidades.length, 1, "uma só oportunidade");
  assert.equal(Math.round(Number(opp().valor_estimado) * 100), 100000 + 188964, "soma das ativas: R&S digitado + MOT calculado");
  assert.equal(opp().etapa, "proposta_enviada");
  const rec = await situacao(db, "u-v", mot, { para: "recusada" });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));
  assert.equal(opp().etapa, "proposta_enviada", "recusar o MOT com o R&S ativo não fecha a oportunidade");
  assert.equal(Number(opp().valor_estimado), 1000);
  assert.equal((await situacao(db, "u-v", rs, { para: "aceita" })).status, 200);
  assert.equal(opp().etapa, "ganho");
  assert.equal(Number(opp().valor_estimado), 1000);
}));
await caso("Funil: MOT aceita primeiro e R&S depois → ganho e valor = soma das aceitas; duas recusadas → perdida com o motivo da última", async () => comMot(async () => {
  const db = novoDb();
  const mot = (await criar(db, "u-v")).body.data.id as string;
  assert.equal((await situacao(db, "u-v", mot, { para: "enviada" })).status, 200);
  const rs = (await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })).body.data.id as string;
  assert.equal((await situacao(db, "u-v", rs, { para: "enviada", valor_estimado: 500 })).status, 200);
  assert.equal((await situacao(db, "u-v", mot, { para: "aceita" })).status, 200);
  const o = db.tabelas.oportunidades[0];
  assert.deepEqual({ etapa: o.etapa, valor: Number(o.valor_estimado) }, { etapa: "ganho", valor: 1889.64 });
  assert.equal((await situacao(db, "u-v", rs, { para: "aceita" })).status, 200);
  assert.deepEqual({ etapa: db.tabelas.oportunidades[0].etapa, centavos: Math.round(Number(db.tabelas.oportunidades[0].valor_estimado) * 100) }, { etapa: "ganho", centavos: 188964 + 50000 });
  const db2 = novoDb();
  const m2 = (await criar(db2, "u-v")).body.data.id as string;
  assert.equal((await situacao(db2, "u-v", m2, { para: "enviada" })).status, 200);
  const r2 = (await chamar(db2, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })).body.data.id as string;
  assert.equal((await situacao(db2, "u-v", r2, { para: "enviada", valor_estimado: 700 })).status, 200);
  assert.equal((await situacao(db2, "u-v", m2, { para: "recusada", motivo_perda_categoria: "valor_acima_orcamento" })).status, 200);
  assert.equal(db2.tabelas.oportunidades[0].etapa, "proposta_enviada");
  assert.equal((await situacao(db2, "u-v", r2, { para: "recusada", motivo_perda_categoria: "sem_retorno" })).status, 200);
  assert.equal(db2.tabelas.oportunidades[0].etapa, "perdido");
  assert.equal(db2.tabelas.oportunidades[0].motivo_perda_categoria, "sem_retorno");
}));
await caso("Funil: cancelar um MOT ativo recalcula só o valor (soma das ativas restantes), como no R&S", async () => comMot(async () => {
  const db = novoDb();
  const rs = (await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })).body.data.id as string;
  assert.equal((await situacao(db, "u-v", rs, { para: "enviada", valor_estimado: 1000 })).status, 200);
  const mot = (await criar(db, "u-v")).body.data.id as string;
  assert.equal((await situacao(db, "u-v", mot, { para: "enviada" })).status, 200);
  assert.equal((await situacao(db, "u-v", mot, { para: "cancelada" })).status, 200);
  const o = db.tabelas.oportunidades[0];
  assert.deepEqual({ etapa: o.etapa, valor: Number(o.valor_estimado) }, { etapa: "proposta_enviada", valor: 1000 });
}));

// ═══ 7) Parâmetros (diretoria) ═══════════════════════════════════════════════
await caso("parâmetros: GET só gestor/diretoria (vendedor 403, sem login 401); devolve vigentes, histórico (mais recente primeiro) e as faixas permitidas", async () => {
  const db = novoDb({ proposta_mot_parametros: [PARAMETROS_SEED(), { id: "par-0", vigente_desde: "2026-01-01", ...INICIAIS, taxa_administrativa_bp: 900, alterado_por: G, created_at: "2026-01-01T10:00:00Z" }] });
  assert.equal((await lerParametros(db, null)).status, 401);
  assert.equal((await lerParametros(db, "u-v")).status, 403);
  assert.match((await lerParametros(db, "u-v")).body.error, /Só a diretoria/);
  const g = await lerParametros(db, "u-g");
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.vigentes.id, "par-1");
  assert.deepEqual(g.body.historico.map((h: any) => h.id), ["par-1", "par-0"]);
  assert.equal(g.body.historico[1].alterado_por_nome, "Gestora Teste");
  assert.deepEqual(g.body.limites, LIMITES_PARAMETROS_MOT);
  assert.equal((await lerParametros(db, "u-gc")).status, 200, "diretoria lê");
});
await caso("parâmetros: POST só diretoria (vendedor 403, sem login 401, nada gravado); diretoria insere nova vigência com autor e auditoria (antes/depois); linha anterior intacta", async () => {
  const db = novoDb();
  assert.equal((await gravarParametros(db, null, PARAMS_NOVOS())).status, 401);
  const v = await gravarParametros(db, "u-v", PARAMS_NOVOS());
  assert.equal(v.status, 403);
  assert.equal(db.tabelas.proposta_mot_parametros.length, 1);
  assert.equal(db.tabelas.audit_logs.length, 0);
  const r = await gravarParametros(db, "u-gc", PARAMS_NOVOS());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(db.tabelas.proposta_mot_parametros.length, 2);
  const nova = db.tabelas.proposta_mot_parametros[1];
  assert.deepEqual({ vigente_desde: nova.vigente_desde, taxa: nova.taxa_administrativa_bp, por: nova.alterado_por }, { vigente_desde: mais(10), taxa: 1500, por: GC });
  assert.deepEqual(db.tabelas.proposta_mot_parametros[0], PARAMETROS_SEED(), "a linha anterior não foi tocada");
  const a = db.tabelas.audit_logs;
  assert.equal(a.length, 1);
  assert.deepEqual({ acao: a[0].acao, entidade: a[0].entidade, entidade_id: a[0].entidade_id, usuario_id: a[0].usuario_id, unidade_id: a[0].unidade_id }, { acao: "parametros_mot_alterados", entidade: "proposta_mot_parametros", entidade_id: nova.id, usuario_id: "u-gc", unidade_id: U });
  assert.equal(a[0].detalhes.antes.taxa_administrativa_bp, 1000);
  assert.equal(a[0].detalhes.depois.taxa_administrativa_bp, 1500);
  assert.equal(a[0].detalhes.vigente_desde, mais(10));
  assert.equal((await gravarParametros(db, "u-g", PARAMS_NOVOS({ vigente_desde: mais(20) }))).status, 201, "superuser também");
});
await caso("parâmetros: validação — percentuais em pontos-base inteiros e dentro da faixa; todos obrigatórios; data válida e NÃO retroativa; nada é gravado nos recusados", async () => {
  const db = novoDb();
  const recusa = async (corpo: unknown, trecho: RegExp) => {
    const r = await gravarParametros(db, "u-gc", corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo).slice(0, 80));
    assert.match(r.body.error, trecho, r.body.error);
    assert.doesNotMatch(r.body.error, /undefined|invalid|expected|\[object/i);
  };
  await recusa(null, /Informe/);
  await recusa({}, /Informe/);
  await recusa(PARAMS_NOVOS({ fgts_bp: undefined }), /Informe FGTS/);
  await recusa(PARAMS_NOVOS({ fgts_bp: -1 }), /FGTS não pode ser negativo/);
  await recusa(PARAMS_NOVOS({ fgts_bp: 8.5 }), /FGTS deve ser um número inteiro de pontos-base/);
  await recusa(PARAMS_NOVOS({ fgts_bp: "800" }), /Informe FGTS/);
  await recusa(PARAMS_NOVOS({ fgts_bp: LIMITES_PARAMETROS_MOT.fgts_bp + 1 }), /FGTS passa do limite/);
  await recusa(PARAMS_NOVOS({ inss_patronal_bp: 31200 }), /INSS patronal passa do limite/);
  await recusa(PARAMS_NOVOS({ ret_pis_bp: 10001 }), /Retenção de PIS passa do limite/);
  await recusa(PARAMS_NOVOS({ vigente_desde: "amanhã" }), /formato AAAA-MM-DD/);
  await recusa(PARAMS_NOVOS({ vigente_desde: "2027-02-30" }), /formato AAAA-MM-DD/);
  await recusa(PARAMS_NOVOS({ vigente_desde: undefined }), /Informe a data/);
  await recusa(PARAMS_NOVOS({ vigente_desde: mais(-1) }), /não pode começar antes de hoje/);
  await recusa(PARAMS_NOVOS({ vigente_desde: "2020-01-01" }), /não pode começar antes de hoje/);
  assert.equal(db.tabelas.proposta_mot_parametros.length, 1);
  assert.equal(db.tabelas.audit_logs.length, 0);
  for (const k of Object.keys(LIMITES_PARAMETROS_MOT) as (keyof typeof LIMITES_PARAMETROS_MOT)[]) assert.ok(LIMITES_PARAMETROS_MOT[k] >= (INICIAIS as any)[k], `o limite de ${k} cobre o valor inicial`);
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: HOJE }))).status, 201, "começar hoje é permitido");
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ fgts_bp: 0, ret_pis_bp: 0, vigente_desde: mais(5) }))).status, 201, "zero é permitido");
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: mais(6), fgts_bp: LIMITES_PARAMETROS_MOT.fgts_bp }))).status, 201, "o limite exato é aceito");
});
await caso("parâmetros: vigência por data — a nova só vale a partir do início; a antiga continua valendo antes; revisões já emitidas NÃO mudam (snapshot congelado) e a próxima revisão usa a vigência de HOJE", async () => comMot(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v")).body.data.id as string;
  assert.equal((await situacao(db, "u-v", id, { para: "enviada" })).status, 200);
  const rev0 = JSON.stringify(db.tabelas.proposta_revisoes[0].conteudo);
  // vigência futura: não altera nada hoje
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: mais(10), taxa_administrativa_bp: 1500 }))).status, 201);
  const hojeVigente = await lerParametros(db, "u-gc");
  assert.equal(hojeVigente.body.vigentes.taxa_administrativa_bp, 1000, "hoje ainda vale a antiga");
  const edicaoHoje = await patch(db, "u-v", id, { conteudo: conteudoMot({ funcoes: [funcao({ salario_centavos: 120000 })] }) });
  assert.equal(edicaoHoje.status, 200);
  assert.equal(db.tabelas.proposta_revisoes[1].conteudo.parametros.taxa_administrativa_bp, 1000);
  // vigência que começa HOJE: a próxima revisão usa a nova; as já emitidas ficam como estavam
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: HOJE, taxa_administrativa_bp: 2000 }))).status, 201);
  const rev1Antes = JSON.stringify(db.tabelas.proposta_revisoes[1].conteudo);
  const edicao = await patch(db, "u-v", id, { conteudo: conteudoMot({ funcoes: [funcao({ salario_centavos: 120000 })] }) });
  assert.equal(edicao.status, 200);
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[0].conteudo), rev0, "Rev. 0 idêntica");
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[1].conteudo), rev1Antes, "Rev. 1 idêntica");
  const rev2 = db.tabelas.proposta_revisoes[2].conteudo;
  assert.equal(rev2.parametros.taxa_administrativa_bp, 2000, "a Rev. 2 usa a vigência de hoje");
  assert.notEqual(rev2.total_mensal_centavos, db.tabelas.proposta_revisoes[1].conteudo.total_mensal_centavos);
  // reabrir uma revisão antiga devolve exatamente o que foi gravado (nunca recalcula)
  globalThis.__DB__ = db;
  db.usuario = { id: "u-v", email: "v@t.local", app_metadata: { role: "analista" } };
  const svc = createServiceClient();
  const r0 = await snapshotParaPdf(svc as any, proposta(db, id), 0);
  assert.ok(r0.ok);
  assert.equal(JSON.stringify(r0.ok ? r0.data : null), rev0);
}));
await caso("parâmetros: DUAS vigências com a mesma data → 409 com mensagem clara; a repetida não grava nem audita; datas diferentes seguem", async () => {
  const db = novoDb();
  const dia = mais(10);
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia }))).status, 201);
  const antes = JSON.stringify(db.tabelas.proposta_mot_parametros);
  const auditoriaAntes = db.tabelas.audit_logs.length;
  const dup = await gravarParametros(db, "u-g", PARAMS_NOVOS({ vigente_desde: dia, taxa_administrativa_bp: 1700 }));
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.equal(dup.body.error, "Já existe uma vigência com esta data. Escolha outra data.");
  assert.equal(JSON.stringify(db.tabelas.proposta_mot_parametros), antes, "nada gravado");
  assert.equal(db.tabelas.audit_logs.length, auditoriaAntes);
  // a data de HOJE também conta, e outra data continua aceita
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: HOJE }))).status, 201);
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: HOJE }))).status, 409);
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: mais(11) }))).status, 201);
  // a validação de formato/retroatividade vem ANTES: data passada continua 400 (não 409)
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: "2026-11-19" }))).status, 400);
  // vendedor continua 403 mesmo com data repetida
  assert.equal((await gravarParametros(db, "u-v", PARAMS_NOVOS({ vigente_desde: dia }))).status, 403);
});
await caso("parâmetros: CORRIDA (duas chamadas ao mesmo tempo) — se o banco recusar por violação de unicidade, a resposta é o mesmo 409; qualquer outro erro do banco vira 500 genérico, sem vazar detalhe", async () => {
  // O banco de produção NÃO tem índice único em vigente_desde (ver relatório): aqui imitamos o 23505 que ele daria se tivesse (db.unicos).
  const db = novoDb();
  db.unicos = { proposta_mot_parametros: ["vigente_desde"] };
  const dia = mais(20);
  // outra chamada "ganha a corrida" depois da checagem e antes do insert
  db.ganchos = { "proposta_mot_parametros.insert": async () => { db.tabelas.proposta_mot_parametros.push({ id: "corrida", vigente_desde: dia, ...INICIAIS, alterado_por: GC, created_at: new Date().toISOString() }); } };
  const r = await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia }));
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.error, "Já existe uma vigência com esta data. Escolha outra data.");
  assert.equal(db.tabelas.proposta_mot_parametros.filter((l: any) => l.vigente_desde === dia).length, 1, "só a que ganhou a corrida");
  assert.equal(db.tabelas.audit_logs.length, 0, "a que perdeu não audita");
  // outros erros do banco: 500 sem vazar
  for (const motivo of ["deadlock detected em relation proposta_mot_parametros", "connection reset by peer 10.1.2.3:5432"]) {
    const db2 = novoDb();
    db2.falhas["proposta_mot_parametros.insert"] = motivo;
    const e = await gravarParametros(db2, "u-gc", PARAMS_NOVOS());
    assert.equal(e.status, 500);
    assert.equal(e.body.error, "Não foi possível salvar os percentuais. Nada foi alterado.");
    assert.doesNotMatch(JSON.stringify(e.body), /deadlock|relation|connection|10\.1\.2\.3/);
  }
  // erro ao conferir vigências existentes também não vaza
  const db3 = novoDb();
  db3.falhas["proposta_mot_parametros.select"] = "tabela travada xyz";
  const e3 = await gravarParametros(db3, "u-gc", PARAMS_NOVOS());
  assert.equal(e3.status, 500);
  assert.doesNotMatch(JSON.stringify(e3.body), /xyz|travada/);
  assert.equal(db3.tabelas.proposta_mot_parametros.length, 1);
});
await caso("migração do índice único de vigência: só o índice (nome, coluna, idempotente), sem begin/commit e sem DROP/DELETE/UPDATE/INSERT; a prova no Postgres está em provar-numeracao-propostas.sh (seção 11)", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_mot_vigencia_unica.sql", "utf8");
  const instrucoes = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.equal(instrucoes, "create unique index if not exists proposta_mot_parametros_vigente_desde_uq\n  on public.proposta_mot_parametros (vigente_desde);", "uma única instrução, exatamente esta");
  assert.match(instrucoes, /create unique index if not exists proposta_mot_parametros_vigente_desde_uq/);
  assert.match(instrucoes, /on public\.proposta_mot_parametros \(vigente_desde\)/);
  assert.doesNotMatch(instrucoes, /\b(drop|delete|update|insert|truncate|alter|begin|commit)\b/i);
  assert.equal((instrucoes.match(/;/g) ?? []).length, 1);
  assert.match(sql, /Motivo:/);
  assert.match(sql, /Aplicar ANTES do deploy/);
  // O que a rota faz com o 23505 do índice: o MESMO 409 (o harness do banco em memória imita o erro com db.unicos; o texto real do Postgres está na prova .sh)
  const rota = fs.readFileSync("src/app/api/comercial/propostas/mot/parametros/route.ts", "utf8");
  assert.match(rota, /error\?\.code === "23505"\) return NextResponse\.json\(\{ error: MSG_VIGENCIA_REPETIDA \}, \{ status: 409 \}\)/);
  assert.ok(rota.includes('const MSG_VIGENCIA_REPETIDA = "Já existe uma vigência com esta data. Escolha outra data.";'));
});
await caso("com o índice único no banco: a conferência da rota é a primeira barreira (409 sem tentar inserir) e, se ela for burlada pela corrida, o 23505 do insert dá o MESMO 409, sem auditoria e sem segunda linha", async () => {
  const db = novoDb();
  db.unicos = { proposta_mot_parametros: ["vigente_desde"] }; // o índice proposta_mot_parametros_vigente_desde_uq
  const dia = mais(40);
  assert.equal((await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia }))).status, 201);
  const inserts = () => db.consultas.filter((q: any) => q.tabela === "proposta_mot_parametros" && q.op === "insert").length;
  const antes = inserts();
  const dup = await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia }));
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, "Já existe uma vigência com esta data. Escolha outra data.");
  assert.equal(inserts(), antes, "a conferência barrou antes de tentar o insert");
  // corrida: a conferência não vê a outra linha, o índice recusa o insert
  const dia2 = mais(41);
  db.ganchos = { "proposta_mot_parametros.insert": async () => { db.tabelas.proposta_mot_parametros.push({ id: "outra", vigente_desde: dia2, ...INICIAIS, alterado_por: G, created_at: new Date().toISOString() }); } };
  const auditoriaAntes = db.tabelas.audit_logs.length;
  const corrida = await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: dia2 }));
  assert.equal(corrida.status, 409);
  assert.equal(corrida.body.error, "Já existe uma vigência com esta data. Escolha outra data.");
  assert.equal(db.tabelas.proposta_mot_parametros.filter((l: any) => l.vigente_desde === dia2).length, 1);
  assert.equal(db.tabelas.audit_logs.length, auditoriaAntes);
});
await caso("parâmetros: só inserção — a rota exporta apenas GET e POST; nenhum update/delete em proposta_mot_parametros acontece (nem o imutável do harness quebra); fonte sem PATCH/PUT/DELETE", async () => {
  assert.deepEqual(Object.keys(rotaParametros).filter((k) => /^[A-Z]+$/.test(k)).sort(), ["GET", "POST"]);
  const fonte = fs.readFileSync("src/app/api/comercial/propostas/mot/parametros/route.ts", "utf8");
  assert.doesNotMatch(fonte, /\.update\(|\.delete\(|\.upsert\(|export async function (PUT|PATCH|DELETE)/);
  const db = novoDb();
  for (let i = 1; i <= 3; i++) await gravarParametros(db, "u-gc", PARAMS_NOVOS({ vigente_desde: mais(i), taxa_administrativa_bp: 1000 + i }));
  assert.equal(db.tabelas.proposta_mot_parametros.length, 4);
  assert.equal(db.consultas.filter((q: any) => q.tabela === "proposta_mot_parametros" && q.op !== "select" && q.op !== "insert").length, 0, "só select e insert");
  assert.equal(db.consultas.filter((q: any) => q.tabela === "proposta_mot_parametros" && q.op === "insert").length, 3);
});
await caso("parâmetros: falha ao gravar → 500 sem detalhe e nada muda; falha ao ler → 500 sem detalhe", async () => {
  const db = novoDb();
  db.falhas["proposta_mot_parametros.insert"] = "violação interna xyz";
  const r = await gravarParametros(db, "u-gc", PARAMS_NOVOS());
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /xyz|violação/);
  assert.equal(db.tabelas.proposta_mot_parametros.length, 1);
  assert.equal(db.tabelas.audit_logs.length, 0);
  const db2 = novoDb();
  db2.falhas["rpc.parametros_mot_vigentes"] = "erro interno abc";
  const g = await lerParametros(db2, "u-gc");
  assert.equal(g.status, 500);
  assert.doesNotMatch(JSON.stringify(g.body), /abc|erro interno/);
});

// ═══ 8) Disciplina do escopo ═════════════════════════════════════════════════
await caso("escopo: 2C não cria SQL, não ativa o MOT na tela, e propostaMot.ts é pura (sem imports de servidor/banco/rede)", () => {
  const fonte = fs.readFileSync("src/lib/propostaMot.ts", "utf8");
  const imports = [...fonte.matchAll(/^import [\s\S]*? from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["@/lib/propostaClausulas", "@/lib/propostaMotCalculo", "@/lib/propostaTexto", "@/lib/propostas", "zod"].sort());
  assert.doesNotMatch(fonte, /supabase|process\.env|fetch\(|Math\.random|Date\.now|new Date\(\)/);
  assert.ok(fonte.includes("export const TEMPLATE_VERSAO_MOT = 1;"));
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
