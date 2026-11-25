// Verificação das PROPOSTAS DE TESTE (categoria própria): número TESTE-... com contador separado, flag decidida pela empresa (nunca pelo corpo),
// escondidas das listas, só o gestor as vê, sem efeito no Funil, PDF com marca TESTE, rota de gestão com salvaguarda, auditoria e permissão.
// O projeto não tem runner de testes: as rotas rodam contra o banco em memória do harness (scripts/harness-mot/memdb.mjs). Nada toca o Supabase real.
// A unicidade (modelo, ano, sequencial, teste) e o contador no banco de verdade são provados em scripts/provar-numeracao-propostas.sh.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-teste.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import * as rotaId from "@/app/api/comercial/propostas/[id]/route";
import * as rotaSit from "@/app/api/comercial/propostas/[id]/situacao/route";
import * as rotaPdf from "@/app/api/comercial/propostas/[id]/pdf/route";
import * as rotaPainel from "@/app/api/comercial/propostas/painel/route";
import * as rotaEmpresas from "@/app/api/comercial/propostas/empresas/route";
import * as rotaDeCliente from "@/app/api/comercial/propostas/empresas/de-cliente/route";
import * as rotaTeste from "@/app/api/comercial/propostas/empresas/[id]/teste/route";
import { hojeSaoPaulo } from "@/lib/comercial";
import { gerarPdfProposta, TEXTO_MARCA_TESTE } from "@/lib/propostaPdf";
import { montarSnapshot, TEMPLATE_VERSAO_ATUAL } from "@/lib/propostaModelos";
import { podeVerProposta } from "@/lib/propostaServico";
import { TEXTO_SELO_TESTE } from "@/components/propostas/propostasUi";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const U = "11111111-1111-4111-8111-111111111111", U2 = "11111111-1111-4111-8111-222222222222";
const V = "22222222-2222-4222-8222-222222222222", G = "33333333-3333-4333-8333-333333333333", GC = "44444444-4444-4444-8444-444444444444";
const EMP_TESTE = "55555555-5555-4555-8555-000000000001", EMP_REAL = "55555555-5555-4555-8555-000000000002", EMP_COM_REAL = "55555555-5555-4555-8555-000000000003";
const EMP_COM_OPP = "55555555-5555-4555-8555-000000000004", EMP_OUTRA_UNIDADE = "55555555-5555-4555-8555-000000000005", EMP_SO_TESTE = "55555555-5555-4555-8555-000000000006";
const HOJE = hojeSaoPaulo();
const ANO = Number(HOJE.slice(0, 4));
const AA = String(ANO).slice(-2);
const ULTIMO_REAL = 52;

// Imita criar_proposta (versão com p_sigla) e criar_proposta_teste do banco, com fórmula própria e contadores SEPARADOS.
function contador(db: any, tabela: string, modelo: string) {
  let c = db.tabelas[tabela].find((x: any) => x.modelo === modelo && x.ano === ANO);
  if (!c) { c = { modelo, ano: ANO, ultimo: tabela === "proposta_contadores" ? ULTIMO_REAL : 0 }; db.tabelas[tabela].push(c); }
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
  (db as any).rpcChamadas.push({ rpc: "criar_proposta", ...a });
  const c = contador(db, "proposta_contadores", a.p_modelo as string);
  c.ultimo += 1;
  const prefixo = a.p_modelo === "RS" ? `${a.p_sigla}-` : `${a.p_sigla}-${a.p_modelo}-`;
  const linha = linhaBase(a, `${prefixo}${String(c.ultimo).padStart(4, "0")}/${AA}`, c.ultimo, false);
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}
function rpcTeste(a: Record<string, unknown>, db: any) {
  (db as any).rpcChamadas.push({ rpc: "criar_proposta_teste", ...a });
  const c = contador(db, "proposta_contadores_teste", a.p_modelo as string);
  c.ultimo += 1;
  const prefixo = a.p_modelo === "RS" ? "TESTE-" : `TESTE-${a.p_modelo}-`;
  const linha = linhaBase(a, `${prefixo}${String(c.ultimo).padStart(4, "0")}/${AA}`, c.ultimo, true);
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}

function novoDb(extra: Record<string, unknown[]> = {}) {
  const db: any = criarDb({
    analistas_perfil: [
      { id: V, user_id: "u-v", nome_completo: "Vendedor", email: "v@salmazos.com.br", telefone: "(19) 99999-0000", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
      // Gestor SEM perfil comercial (como o Olver), com a aba liberada: escreve, sem Funil.
      { id: G, user_id: "u-g", nome_completo: "Gestora Teste", email: "g@salmazos.com.br", telefone: null, nivel_acesso: "superuser", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      // Diretoria COM perfil comercial: tem Funil; prova que a proposta de teste não o dispara mesmo assim.
      { id: GC, user_id: "u-gc", nome_completo: "Diretora Comercial", email: "gc@salmazos.com.br", telefone: null, nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: true, ativo: true },
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: G, chave_aba: "comercial_propostas", liberado: true }],
    empresas_visitadas: [
      { id: EMP_TESTE, nome: "cliente teste", cliente_id: null, unidade_id: U }, { id: EMP_REAL, nome: "Empresa Real", cliente_id: null, unidade_id: U },
      { id: EMP_COM_REAL, nome: "Empresa Com Proposta Real", cliente_id: null, unidade_id: U }, { id: EMP_COM_OPP, nome: "Empresa Com Oportunidade", cliente_id: null, unidade_id: U },
      { id: EMP_OUTRA_UNIDADE, nome: "Empresa Outra Unidade", cliente_id: null, unidade_id: U2 }, { id: EMP_SO_TESTE, nome: "Empresa Só Com Testes", cliente_id: null, unidade_id: U },
    ],
    empresas_teste: [{ empresa_id: EMP_TESTE, marcado_por: G, created_at: "2026-11-20T10:00:00Z" }],
    empresa_contatos: [], oportunidades: [{ id: "opp-1", empresa_visitada_id: EMP_COM_OPP, vendedor_id: V, unidade_id: U, etapa: "contato_feito", proxima_acao: "x", proxima_acao_em: "2030-01-01" }],
    lembretes: [], oportunidade_interacoes: [], propostas: [], proposta_revisoes: [], proposta_historico: [], audit_logs: [],
    proposta_contadores: [{ modelo: "RS", ano: ANO, ultimo: ULTIMO_REAL }], proposta_contadores_teste: [],
    ...extra,
  });
  db.rpcs = { criar_proposta: rpcReal, criar_proposta_teste: rpcTeste };
  db.rpcChamadas = [];
  db.imutaveis = ["proposta_revisoes", "proposta_historico"];
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
const criar = (db: any, usuario: string, empresa: string, extra: Record<string, unknown> = {}) => chamar(db, usuario, rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: empresa, ...extra } });
const listar = (db: any, usuario: string, qs = "") => chamar(db, usuario, rotaLista.GET, { url: `http://x/api/comercial/propostas${qs}` });
const situacao = (db: any, usuario: string, id: string, corpo: Record<string, unknown>) => chamar(db, usuario, rotaSit.POST, { metodo: "POST", id, corpo });
const detalhe = (db: any, usuario: string, id: string) => chamar(db, usuario, rotaId.GET, { id });
const pdf = (db: any, usuario: string, id: string) => chamar(db, usuario, rotaPdf.GET, { id });
const marcar = (db: any, usuario: string | null, empresa: string) => chamar(db, usuario, rotaTeste.POST, { metodo: "POST", id: empresa });
const desmarcar = (db: any, usuario: string | null, empresa: string) => chamar(db, usuario, rotaTeste.DELETE, { metodo: "DELETE", id: empresa });
const painel = (db: any, usuario: string, qs = "") => chamar(db, usuario, rotaPainel.GET, { url: `http://x/api/comercial/propostas/painel${qs}` });
const empresas = (db: any, usuario: string) => chamar(db, usuario, rotaEmpresas.GET, { url: "http://x/api/comercial/propostas/empresas" });
const proposta = (db: any, id: string) => db.tabelas.propostas.find((p: any) => p.id === id);
const contadorReal = (db: any) => db.tabelas.proposta_contadores.find((c: any) => c.modelo === "RS" && c.ano === ANO).ultimo;
const contadorTeste = (db: any) => db.tabelas.proposta_contadores_teste.find((c: any) => c.modelo === "RS" && c.ano === ANO)?.ultimo ?? 0;
const semFunil = (db: any) => ({ o: db.tabelas.oportunidades.length, l: db.tabelas.lembretes.length, i: db.tabelas.oportunidade_interacoes.length });

// Conteúdo desenhado de cada página (streams decodificados): o texto da marca sai em hexadecimal (fonte padrão) e a rotação em 45° na matriz.
async function conteudoPorPagina(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((pg) => {
    const conts = pg.node.Contents();
    const lista: any[] = conts instanceof PDFArray ? conts.asArray().map((r) => doc.context.lookup(r)) : conts ? [conts] : [];
    return lista.map((c) => Buffer.from(decodePDFRawStream(c as PDFRawStream).decode()).toString("latin1")).join("\n");
  });
}
const HEX_TESTE = Buffer.from(TEXTO_MARCA_TESTE, "latin1").toString("hex").toUpperCase();
const temMarca = (conteudo: string) => conteudo.toUpperCase().includes(`<${HEX_TESTE}>`) && /0\.70\d+ 0\.70\d+ -0\.70\d+ 0\.70\d+ /.test(conteudo);
const snapshot = (extra: Record<string, unknown> = {}) => montarSnapshot({
  modelo: "RS", numero: "OS-0053/26", revisao: 0, templateVersao: TEMPLATE_VERSAO_ATUAL, dataEmissao: "2026-11-20", validadeDias: 15, validadeAte: "2026-12-05", clienteNome: "Cliente X",
  aosCuidados: null, conteudo: { clausulas_adicionais: Array.from({ length: 10 }, (_, i) => `${i + 1}) ${"Texto de cláusula para ocupar espaço e forçar mais de uma página. ".repeat(8)}`) }, vendedorNome: "Vendedor", vendedorTelefone: "(19) 99999-0000", vendedorEmail: null, ...extra,
});

// ── Criação: empresa decide, corpo não ───────────────────────────────────────
await caso("empresa marcada → proposta de TESTE: número TESTE-0001/aa, contador de teste anda e o REAL não; sem sigla e sem oportunidade", async () => {
  const db = novoDb();
  const r = await criar(db, "u-g", EMP_TESTE);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `TESTE-0001/${AA}`);
  assert.equal(r.body.data.teste, true);
  assert.equal(r.body.data.oportunidade_id, null);
  assert.equal(contadorReal(db), ULTIMO_REAL, "o contador REAL não andou");
  assert.equal(contadorTeste(db), 1);
  const chamada = db.rpcChamadas[0];
  assert.equal(chamada.rpc, "criar_proposta_teste");
  assert.equal("p_sigla" in chamada, false);
  assert.equal(chamada.p_oportunidade_id, null);
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "rascunho").length, 1);
  const r2 = await criar(db, "u-g", EMP_TESTE);
  assert.equal(r2.body.data.numero, `TESTE-0002/${AA}`);
  assert.equal(contadorReal(db), ULTIMO_REAL);
  assert.equal(db.tabelas.proposta_contadores.length, 1, "nenhuma linha nova no contador real");
});
await caso("empresa NÃO marcada → proposta REAL, com o número de hoje (SIGLA-0053/aa) e o contador real andando; teste = false", async () => {
  const db = novoDb();
  const r = await criar(db, "u-v", EMP_REAL);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `VE-0053/${AA}`);
  assert.equal(r.body.data.teste, false);
  assert.equal(contadorReal(db), ULTIMO_REAL + 1);
  assert.equal(contadorTeste(db), 0);
  assert.equal(db.rpcChamadas[0].rpc, "criar_proposta");
  assert.equal(db.rpcChamadas[0].p_sigla, "VE");
  const g = await criar(db, "u-g", EMP_REAL);
  assert.equal(g.body.data.numero, `GT-0054/${AA}`, "gestor em empresa normal também gera número real, com a sigla dele");
});
await caso("o CORPO não forja teste: campos teste/p_teste/numero/modelo no corpo são ignorados, em empresa normal e em empresa de teste", async () => {
  const db = novoDb();
  const forjado = { teste: true, p_teste: true, eh_teste: true, numero: "TESTE-0001/26", sequencial: 1 };
  const real = await criar(db, "u-v", EMP_REAL, forjado);
  assert.equal(real.status, 201);
  assert.equal(real.body.data.teste, false);
  assert.equal(real.body.data.numero, `VE-0053/${AA}`);
  assert.equal(contadorTeste(db), 0);
  const emTeste = await criar(db, "u-g", EMP_TESTE, { teste: false, p_teste: false, eh_teste: false });
  assert.equal(emTeste.body.data.teste, true, "não dá para 'desligar' o teste pelo corpo");
  assert.equal(emTeste.body.data.numero, `TESTE-0001/${AA}`);
  assert.equal(contadorReal(db), ULTIMO_REAL + 1);
});
await caso("vendedor NÃO cria em empresa de teste (404, nada gravado e contador intacto); a empresa nem aparece na busca dele; gestor vê com a flag", async () => {
  const db = novoDb();
  const antes = JSON.stringify({ p: db.tabelas.propostas, c: db.tabelas.proposta_contadores, t: db.tabelas.proposta_contadores_teste });
  const r = await criar(db, "u-v", EMP_TESTE);
  assert.equal(r.status, 404);
  assert.equal(JSON.stringify({ p: db.tabelas.propostas, c: db.tabelas.proposta_contadores, t: db.tabelas.proposta_contadores_teste }), antes);
  assert.equal(db.rpcChamadas.length, 0);
  const v = await empresas(db, "u-v");
  assert.equal(v.status, 200);
  assert.equal(v.body.data.some((e: any) => e.id === EMP_TESTE), false, "vendedor não vê a empresa de teste");
  assert.equal(v.body.data.every((e: any) => !("teste" in e)), true, "vendedor não recebe a flag");
  const g = await empresas(db, "u-g");
  const eg = g.body.data.find((e: any) => e.id === EMP_TESTE);
  assert.equal(eg.teste, true);
  assert.equal(g.body.data.find((e: any) => e.id === EMP_REAL).teste, false);
});
await caso("cliente cuja EMPRESA é de teste: o vendedor não o vê como 'sem Carteira' e a rota de criação responde 404 (nada criado); o gestor vê a empresa pela Carteira com teste:true e a rota devolve a mesma empresa (200)", async () => {
  const CLI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000020";
  const db = novoDb({ clientes: [{ id: CLI, nome: "ZZTEST Cliente da Empresa de Teste", unidade_id: U, ativo: true, cidade: "X", contato_nome: "Ana", contato_telefone: "1", contato_email: "a@a.com" }] });
  db.tabelas.empresas_visitadas.find((e: any) => e.id === EMP_TESTE).cliente_id = CLI;
  const antes = structuredClone(db.tabelas.empresas_visitadas);
  const busca = await empresas(db, "u-v");
  assert.ok(!busca.body.data.some((x: any) => x.origem === "cliente"), "cliente com empresa de teste não vira 'sem Carteira' para o vendedor");
  assert.ok(!busca.body.data.some((x: any) => x.id === EMP_TESTE));
  const criar404 = await chamar(db, "u-v", rotaDeCliente.POST, { metodo: "POST", corpo: { cliente_id: CLI } });
  assert.equal(criar404.status, 404);
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  const gestor = await empresas(db, "u-g");
  assert.ok(!gestor.body.data.some((x: any) => x.origem === "cliente"));
  assert.equal(gestor.body.data.find((x: any) => x.id === EMP_TESTE).teste, true);
  const g = await chamar(db, "u-g", rotaDeCliente.POST, { metodo: "POST", corpo: { cliente_id: CLI } });
  assert.equal(g.status, 200);
  assert.equal(g.body.data.id, EMP_TESTE);
  assert.equal(g.body.data.teste, true);
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
});

await caso("erro ao ler a marca da empresa → 500 e NADA é criado (nunca gasta número real por engano)", async () => {
  const db = novoDb();
  db.falhas["empresas_teste.select"] = "boom";
  const r = await criar(db, "u-g", EMP_TESTE);
  assert.equal(r.status, 500);
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.length, 0);
  assert.equal(contadorReal(db), ULTIMO_REAL);
});

// ── Lista, detalhe e painel ─────────────────────────────────────────────────
async function cenarioLista() {
  const db = novoDb();
  const real = (await criar(db, "u-v", EMP_REAL)).body.data.id as string;
  const t1 = (await criar(db, "u-g", EMP_TESTE)).body.data.id as string;
  const realG = (await criar(db, "u-g", EMP_REAL)).body.data.id as string;
  return { db, real, t1, realG };
}
await caso("lista: testes escondidos por padrão; só o gestor os pede com ?teste=1; vendedor nunca vê (parâmetro ignorado)", async () => {
  const { db, real, t1, realG } = await cenarioLista();
  const padrao = await listar(db, "u-g");
  assert.deepEqual(padrao.body.data.map((p: any) => p.id).sort(), [real, realG].sort(), "gestor, por padrão, não vê teste");
  assert.equal(padrao.body.data.every((p: any) => p.teste === false), true);
  const com = await listar(db, "u-g", "?teste=1");
  assert.deepEqual(com.body.data.map((p: any) => p.id).sort(), [real, realG, t1].sort());
  assert.equal(com.body.data.find((p: any) => p.id === t1).teste, true);
  assert.equal(com.body.data.find((p: any) => p.id === t1).numero, `TESTE-0001/${AA}`);
  const v = await listar(db, "u-v");
  assert.deepEqual(v.body.data.map((p: any) => p.id), [real]);
  const vComFiltro = await listar(db, "u-v", "?teste=1");
  assert.deepEqual(vComFiltro.body.data.map((p: any) => p.id), [real], "?teste=1 não dá nada a quem não é gestor");
  assert.equal(vComFiltro.body.data.some((p: any) => p.teste), false);
});
await caso("lista: combina com os filtros de situação/modelo; teste=0 e valores estranhos NÃO ligam o modo teste", async () => {
  const { db, t1 } = await cenarioLista();
  for (const qs of ["?teste=0", "?teste=true", "?teste=", "?teste=2", "?teste=1x"]) {
    const r = await listar(db, "u-g", qs);
    assert.equal(r.body.data.some((p: any) => p.id === t1), false, qs);
  }
  const m = await listar(db, "u-g", "?teste=1&modelo=RS&situacao=rascunho");
  assert.equal(m.body.data.some((p: any) => p.id === t1), true);
  const outro = await listar(db, "u-g", "?teste=1&modelo=MOT");
  assert.equal(outro.body.data.length, 0);
});
await caso("detalhe/edição/situação/PDF de proposta de teste: vendedor recebe 404 (mesmo sendo o dono); gestor acessa e o detalhe devolve a flag", async () => {
  const db = novoDb();
  const t = (await criar(db, "u-g", EMP_TESTE)).body.data.id as string;
  proposta(db, t).vendedor_id = V; // proposta de teste "de" um vendedor: ainda assim ele não a vê
  assert.equal((await detalhe(db, "u-v", t)).status, 404);
  assert.equal((await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id: t, corpo: { updated_at: proposta(db, t).updated_at, validade_dias: 20 } })).status, 404);
  assert.equal((await situacao(db, "u-v", t, { para: "cancelada" })).status, 404);
  assert.equal((await pdf(db, "u-v", t)).status, 404);
  assert.equal(proposta(db, t).situacao, "rascunho");
  proposta(db, t).vendedor_id = G;
  const g = await detalhe(db, "u-g", t);
  assert.equal(g.status, 200);
  assert.equal(g.body.data.teste, true);
  assert.equal(podeVerProposta({ gestor: true, podeEscrever: true, analistaId: G, todasUnidades: true, unidadeId: U } as any, { teste: true, vendedor_id: V, unidade_id: U }), true);
  assert.equal(podeVerProposta({ gestor: false, podeEscrever: true, analistaId: V, todasUnidades: false, unidadeId: U } as any, { teste: true, vendedor_id: V, unidade_id: U }), false);
  assert.equal(podeVerProposta({ gestor: false, podeEscrever: true, analistaId: V, todasUnidades: false, unidadeId: U } as any, { teste: false, vendedor_id: V, unidade_id: U }), true, "proposta real continua visível ao dono");
});
await caso("painel de gestão: testes fora dos números por padrão; ?teste=1 do gestor os inclui; vendedor → 403", async () => {
  const { db, real, t1 } = await cenarioLista();
  assert.ok(real && t1);
  const p = await painel(db, "u-g");
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.total, 2);
  assert.equal(p.body.por_situacao.rascunho, 2);
  const com = await painel(db, "u-g", "?teste=1");
  assert.equal(com.body.total, 3);
  assert.equal((await painel(db, "u-v")).status, 403);
  // O parâmetro é lido da URL: valores estranhos NÃO ligam o modo teste
  for (const qs of ["?teste=0", "?teste=true", "?teste="]) assert.equal((await painel(db, "u-g", qs)).body.total, 2, qs);
});

// ── Funil ──────────────────────────────────────────────────────────────────
await caso("proposta de TESTE enviada/aceita/recusada/cancelada NÃO mexe no Funil, nem para quem tem Funil (perfil comercial)", async () => {
  const db = novoDb();
  const base = semFunil(db);
  const abertaAntes = JSON.stringify(db.tabelas.oportunidades);
  const consultasAntes = db.consultas.length;
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await criar(db, "u-gc", EMP_TESTE)).body.data.id);
  const env = await situacao(db, "u-gc", ids[0], { para: "enviada", valor_estimado: 1000 });
  assert.equal(env.status, 200, JSON.stringify(env.body));
  assert.equal(proposta(db, ids[0]).situacao, "enviada");
  assert.equal(proposta(db, ids[0]).oportunidade_id, null);
  assert.equal(proposta(db, ids[0]).valor_estimado, 1000);
  assert.equal(db.tabelas.proposta_revisoes.length, 1, "a Rev. 0 é gravada normalmente");
  assert.equal((await situacao(db, "u-gc", ids[0], { para: "aceita" })).status, 200);
  assert.equal((await situacao(db, "u-gc", ids[1], { para: "enviada", valor_estimado: 500 })).status, 200);
  assert.equal((await situacao(db, "u-gc", ids[1], { para: "recusada" })).status, 200, "recusar teste não exige motivo do Funil");
  assert.equal((await situacao(db, "u-gc", ids[2], { para: "enviada", valor_estimado: 300 })).status, 200);
  assert.equal((await situacao(db, "u-gc", ids[2], { para: "cancelada" })).status, 200);
  assert.deepEqual(semFunil(db), base, "nenhuma oportunidade, lembrete ou interação criado");
  assert.equal(JSON.stringify(db.tabelas.oportunidades), abertaAntes);
  assert.equal(db.consultas.slice(consultasAntes).filter((q: any) => ["oportunidades", "lembretes", "oportunidade_interacoes"].includes(q.tabela)).length, 0, "nem lê o Funil");
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.proposta_id === ids[0]).map((h: any) => h.para).join(">"), "rascunho>enviada>aceita");
});
await caso("proposta REAL de quem tem Funil continua criando oportunidade e follow-up ao enviar (o Funil não mudou)", async () => {
  const db = novoDb();
  const id = (await criar(db, "u-v", EMP_REAL)).body.data.id as string;
  const r = await situacao(db, "u-v", id, { para: "enviada", valor_estimado: 2000 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.tabelas.oportunidades.length, 2, "a de seed + a nova");
  const nova = db.tabelas.oportunidades.find((o: any) => o.empresa_visitada_id === EMP_REAL);
  assert.equal(nova.etapa, "proposta_enviada");
  assert.equal(proposta(db, id).oportunidade_id, nova.id);
  assert.equal(db.tabelas.lembretes.length, 1);
});

// ── PDF ────────────────────────────────────────────────────────────────────
await caso("PDF de teste: marca TESTE diagonal em TODAS as páginas (várias páginas); PDF normal sem marca e IGUAL ao de hoje (com e sem a opção)", async () => {
  const snap = snapshot();
  const normalSemOpcao = await conteudoPorPagina(await gerarPdfProposta(snap));
  const normalFalso = await conteudoPorPagina(await gerarPdfProposta(snap, { teste: false }));
  const marcado = await conteudoPorPagina(await gerarPdfProposta(snap, { teste: true }));
  assert.ok(normalSemOpcao.length >= 2, "o cenário tem mais de uma página: " + normalSemOpcao.length);
  assert.deepEqual(normalFalso, normalSemOpcao, "teste:false gera o MESMO conteúdo de hoje");
  assert.equal(normalSemOpcao.some(temMarca), false, "PDF normal não tem a marca");
  assert.equal(marcado.length, normalSemOpcao.length, "a marca não muda o número de páginas");
  assert.equal(marcado.every(temMarca), true, "marca em todas as páginas");
  // O restante do conteúdo continua lá: tirando o bloco da marca o texto é o mesmo.
  marcado.forEach((c, i) => assert.ok(c.length > normalSemOpcao[i].length));
});
await caso("PDF pela ROTA: proposta de teste sai com marca (da linha, não do snapshot); real sai sem; o snapshot gravado da revisão não muda", async () => {
  const db = novoDb();
  const t = (await criar(db, "u-g", EMP_TESTE)).body.data.id as string;
  const rascunho = await pdf(db, "u-g", t);
  assert.equal(rascunho.status, 200);
  assert.ok((await conteudoPorPagina(rascunho.body)).every(temMarca));
  assert.equal((await situacao(db, "u-g", t, { para: "enviada", valor_estimado: 100 })).status, 200);
  const snapGravado = JSON.stringify(db.tabelas.proposta_revisoes[0].conteudo);
  assert.equal("teste" in db.tabelas.proposta_revisoes[0].conteudo, false, "o snapshot imutável não carrega a flag");
  const rev0 = await pdf(db, "u-g", t);
  assert.ok((await conteudoPorPagina(rev0.body)).every(temMarca), "a Rev. 0 já gravada também sai com marca (vem da linha)");
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[0].conteudo), snapGravado);
  const real = (await criar(db, "u-v", EMP_REAL)).body.data.id as string;
  const pr = await pdf(db, "u-v", real);
  assert.equal((await conteudoPorPagina(pr.body)).some(temMarca), false);
});

// ── Rota de gestão: marcar/desmarcar empresa de teste ────────────────────────
await caso("rota de gestão: só gestor (vendedor 403, sem login 401); marca com 201, repetir é 200 sem duplicar; desmarca; auditoria nas duas ações", async () => {
  const db = novoDb();
  assert.equal((await marcar(db, null, EMP_REAL)).status, 401);
  assert.equal((await marcar(db, "u-v", EMP_REAL)).status, 403);
  assert.equal((await desmarcar(db, "u-v", EMP_TESTE)).status, 403);
  assert.equal(db.tabelas.empresas_teste.length, 1, "nada mudou com as tentativas negadas");
  assert.equal(db.tabelas.audit_logs.length, 0);
  const m = await marcar(db, "u-g", EMP_SO_TESTE);
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(db.tabelas.empresas_teste.length, 2);
  assert.deepEqual(db.tabelas.empresas_teste.find((x: any) => x.empresa_id === EMP_SO_TESTE).marcado_por, G);
  assert.equal((await marcar(db, "u-g", EMP_SO_TESTE)).status, 200);
  assert.equal(db.tabelas.empresas_teste.length, 2, "idempotente");
  const a = db.tabelas.audit_logs;
  assert.equal(a.length, 1, "só a marcação efetiva é auditada");
  assert.deepEqual({ acao: a[0].acao, entidade: a[0].entidade, entidade_id: a[0].entidade_id, usuario_id: a[0].usuario_id, unidade_id: a[0].unidade_id }, { acao: "empresa_teste_marcada", entidade: "empresas_visitadas", entidade_id: EMP_SO_TESTE, usuario_id: "u-g", unidade_id: U });
  assert.equal((await desmarcar(db, "u-gc", EMP_SO_TESTE)).status, 200);
  assert.equal(db.tabelas.empresas_teste.some((x: any) => x.empresa_id === EMP_SO_TESTE), false);
  assert.equal(db.tabelas.audit_logs.at(-1).acao, "empresa_teste_desmarcada");
  assert.equal((await desmarcar(db, "u-gc", EMP_SO_TESTE)).status, 200, "desmarcar de novo é inofensivo");
  assert.equal(db.tabelas.audit_logs.length, 2);
});
await caso("salvaguarda: empresa com proposta REAL ou com oportunidade não vira empresa de teste (409); proposta de teste não conta; outra unidade = 404", async () => {
  const db = novoDb();
  db.tabelas.propostas.push({ id: "p-real", numero: "OS-0001/26", modelo: "RS", empresa_visitada_id: EMP_COM_REAL, teste: false, situacao: "cancelada", vendedor_id: V, unidade_id: U });
  db.tabelas.propostas.push({ id: "p-teste", numero: "TESTE-0001/26", modelo: "RS", empresa_visitada_id: EMP_SO_TESTE, teste: true, situacao: "aceita", vendedor_id: G, unidade_id: U });
  const antes = JSON.stringify(db.tabelas.empresas_teste);
  const real = await marcar(db, "u-g", EMP_COM_REAL);
  assert.equal(real.status, 409);
  assert.match(real.body.error, /propostas reais/);
  const opp = await marcar(db, "u-g", EMP_COM_OPP);
  assert.equal(opp.status, 409);
  assert.match(opp.body.error, /oportunidades/);
  assert.equal(JSON.stringify(db.tabelas.empresas_teste), antes);
  assert.equal(db.tabelas.audit_logs.length, 0);
  assert.equal((await marcar(db, "u-g", EMP_SO_TESTE)).status, 201, "só com propostas de teste: pode (é o caso do 'cliente teste')");
  assert.equal((await marcar(db, "u-g", "99999999-9999-4999-8999-999999999999")).status, 404);
  // gestor sem acesso a todas as unidades não alcança empresa de outra unidade (responde como inexistente)
  db.tabelas.analistas_perfil.find((a: any) => a.id === GC).acesso_todas_unidades = false;
  assert.equal((await marcar(db, "u-gc", EMP_OUTRA_UNIDADE)).status, 404);
  assert.equal((await marcar(db, "u-g", EMP_OUTRA_UNIDADE)).status, 201, "quem tem todas as unidades alcança");
});
await caso("falha ao gravar a marca → 500 e nada muda; desmarcar NÃO normaliza propostas antigas e as novas passam a ser reais", async () => {
  const db = novoDb();
  db.falhas["empresas_teste.insert"] = "boom";
  assert.equal((await marcar(db, "u-g", EMP_SO_TESTE)).status, 500);
  assert.equal(db.tabelas.empresas_teste.length, 1);
  assert.equal(db.tabelas.audit_logs.length, 0);
  delete db.falhas["empresas_teste.insert"];
  const antiga = (await criar(db, "u-g", EMP_TESTE)).body.data.id as string;
  assert.equal(proposta(db, antiga).teste, true);
  assert.equal((await desmarcar(db, "u-g", EMP_TESTE)).status, 200);
  assert.equal(proposta(db, antiga).teste, true, "a proposta antiga continua de teste");
  assert.equal(proposta(db, antiga).numero, `TESTE-0001/${AA}`, "número intacto");
  const nova = await criar(db, "u-g", EMP_TESTE);
  assert.equal(nova.body.data.teste, false);
  assert.equal(nova.body.data.numero, `GT-0053/${AA}`);
  assert.equal(contadorReal(db), ULTIMO_REAL + 1);
});

// ── Migração e script de dados (texto) ───────────────────────────────────────
await caso("migração: aditiva e idempotente; unicidade (modelo, ano, sequencial, teste); contador e empresas protegidos; criar_proposta NÃO é redefinida", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_teste.sql", "utf8");
  const semComentarios = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(semComentarios, /add column if not exists teste boolean not null default false/);
  assert.match(semComentarios, /drop constraint if exists propostas_modelo_ano_seq_uq/);
  assert.match(semComentarios, /unique \(modelo, ano, sequencial, teste\)/);
  assert.match(semComentarios, /create table if not exists public\.empresas_teste[\s\S]*empresa_id\s+uuid primary key references public\.empresas_visitadas\(id\)/);
  assert.match(semComentarios, /create table if not exists public\.proposta_contadores_teste[\s\S]*check \(modelo in \('RS','MOT','TS'\)\)/);
  for (const t of ["empresas_teste", "proposta_contadores_teste"]) {
    assert.match(semComentarios, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`));
    assert.match(semComentarios, new RegExp(`alter table public\\.${t} enable row level security`));
  }
  assert.doesNotMatch(semComentarios, /create policy/i, "sem policy: só o service role");
  assert.match(semComentarios, /create or replace function public\.criar_proposta_teste\(/);
  assert.match(semComentarios, /'TESTE-' else 'TESTE-' \|\| p_modelo \|\| '-'/);
  assert.match(semComentarios, /grant execute on function public\.criar_proposta_teste\(.*\) to service_role/);
  assert.doesNotMatch(semComentarios, /create or replace function public\.criar_proposta\(/, "criar_proposta real não é tocada");
  assert.doesNotMatch(semComentarios, /\b(truncate|delete\s+from|drop\s+table|drop\s+function)\b/i);
  assert.ok(sql.trim().endsWith("commit;") && sql.includes("begin;"));
});
await caso("script de dados: só as 3 propostas (ids exatos, número e empresa conferidos), esperado = 3, aborta se não forem 3; não renomeia nada; fora da migração", () => {
  const sql = fs.readFileSync("supabase/dados_propostas_teste_marcar_existentes.sql", "utf8");
  const corpo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const id of ["afb30844-5c3e-4277-854a-26f81611c3f2", "946a038c-0a4e-484b-bcdc-455ce8dccd3c", "16a5e1a8-d854-4bc9-95eb-42db020c13f9"]) assert.ok(corpo.includes(id), id);
  for (const n of ["OS-0062/26", "OS-0063/26", "OS-0064/26"]) assert.ok(corpo.includes(n), n);
  assert.ok(corpo.includes("61cc5136-a963-484d-98ca-b895cfa3df5f"));
  assert.match(corpo, /set teste = true/);
  assert.doesNotMatch(corpo, /set\s+numero|numero\s*=\s*'TESTE/i, "o número não é renomeado");
  assert.match(corpo, /if v_linhas <> 3 then[\s\S]*raise exception/);
  assert.doesNotMatch(corpo, /\bdelete\b|\btruncate\b|\bdrop\b/i);
  const migracao = fs.readFileSync("supabase/migration_propostas_teste.sql", "utf8");
  assert.equal(migracao.includes("afb30844"), false, "o UPDATE de dados NÃO está na migração");
  assert.doesNotMatch(migracao.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"), /update\s+public\.propostas/i);
});
await caso("selo e marca: textos fixos 'TESTE'; o serviço não lê teste do corpo (schema de criação não tem o campo)", () => {
  assert.equal(TEXTO_SELO_TESTE, "TESTE");
  assert.equal(TEXTO_MARCA_TESTE, "TESTE");
  const servico = fs.readFileSync("src/lib/propostaServico.ts", "utf8");
  assert.doesNotMatch(servico, /d\.teste|d\["teste"\]|body\.teste/);
  assert.match(servico, /const comFunil = ctx\.temFunil && p\.teste !== true;/);
  const detalhe = fs.readFileSync("src/components/propostas/PropostaDetalheClient.tsx", "utf8");
  const lista = fs.readFileSync("src/components/propostas/PropostasListaClient.tsx", "utf8");
  assert.ok(detalhe.includes("<SeloTeste />") && lista.includes("<SeloTeste />") && lista.includes("Mostrar testes"));
  assert.ok(lista.includes('qs.set("teste", "1")') && lista.includes("gestor && mostrarTestes"));
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
