// Cobrança R&S para cliente pessoa física (Fase 3): snapshot do documento e do e-mail, validação e gravação do documento na revisão, aprovar e rótulos.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-cobranca-rs-pf.mts
import assert from "node:assert/strict";
import { criarDb } from "./harness-mot/memdb.mjs";
import { gerarCobrancaCancelamentoRSSeAplicavel, gerarCobrancaRSSeAplicavel } from "../src/lib/cobrancaRS";
import * as rotaCobranca from "../src/app/api/cobrancas-rs/[id]/route";
import * as rotaAprovar from "../src/app/api/cobrancas-rs/[id]/aprovar/route";
import * as rotaCliente from "../src/app/api/clientes/[id]/route";
import { getEmailTemplate } from "../src/lib/emailTemplates";
import {
  documentoDoCliente,
  documentoJaCadastradoEmOutroCliente,
  emailDaCobranca,
  rotuloDocumento,
  tipoDocumentoDaCobranca,
  validarDocumentoDaCobranca,
} from "../src/lib/cobrancaRSDocumento";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  await fn();
  total++;
  console.log(`OK    ${nome}`);
}
const silencio = console.error;
console.error = () => undefined;

const U1 = "5b560689-559b-4b69-81c7-ecddb7431404";
const U2 = "6c671790-660c-4c7a-92d8-fdecb8c42515";
const CLI = "00000000-0000-4000-8000-000000000001";
const CLI_OUTRO = "00000000-0000-4000-8000-000000000002";
const COB = "00000000-0000-4000-8000-000000000010";
const VAGA = "00000000-0000-4000-8000-000000000020";
const CPF = "529.982.247-25";
const CPF_DIGITOS = "52998224725";
const CNPJ = "11.222.333/0001-81";
const CNPJ_DIGITOS = "11222333000181";
const OUTRO_CPF = "111.444.777-35";

// CHECK clientes_documento_coerente (cpf is null or cnpj is null): o banco recusa o UPDATE inteiro.
const checkDocumentoCoerente = (l: Record<string, unknown>) => (l.cpf && l.cnpj ? 'new row violates check constraint "clientes_documento_coerente"' : null);

function cliente(extra: Record<string, unknown> = {}) {
  return {
    id: CLI, nome: "Cliente Teste", contato_nome: "Contato", contato_telefone: "(19) 90000-0000", contato_email: "contato@teste.com.br", cidade: "Campinas", segmento: "Indústria",
    servicos: ["recrutamento_selecao"], ativo: true, tipo_pessoa: "pj", cnpj: CNPJ, cpf: null, email_nota_fiscal: null, endereco: "Rua A, 10", unidade_id: U1, ...extra,
  };
}
function banco(o: { cliente?: Record<string, unknown> | null; outros?: Record<string, unknown>[]; cobranca?: Record<string, unknown>; vaga?: Record<string, unknown> } = {}) {
  const c = o.cliente === undefined ? cliente() : o.cliente;
  const db = criarDb({
    clientes: [...(c ? [c] : []), ...(o.outros ?? [])],
    vagas: [{
      id: VAGA, titulo: "Auxiliar administrativo", tipo_servico: "recrutamento_selecao", cliente_id: c ? c.id : null, cliente_nome: c ? null : "Cliente Legado", unidade_id: U1,
      fee_rs_percentual: 45, fee_rs_prazo_cobranca: "14 dias", taxa_cancelamento: true, taxa_cancelamento_percentual: 25, salario: "2500", ...(o.vaga ?? {}),
    }],
    candidatos_vagas: [{ id: "cv-1", candidato_id: "cand-1", vaga_id: VAGA }],
    candidatos: [{ id: "cand-1", nome_completo: "Fulano de Tal" }],
    cobrancas_rs: o.cobranca === undefined ? [] : [o.cobranca],
    notificacoes_analista: [],
    audit_logs: [],
    analistas_perfil: [{ id: "a1", user_id: "user-1", unidade_id: U1, acesso_todas_unidades: true, nome_completo: "Diretora", ativo: true, nivel_acesso: "diretoria" }],
  });
  (db as any).checks = { clientes: checkDocumentoCoerente };
  return db;
}
function cobranca(extra: Record<string, unknown> = {}) {
  return {
    id: COB, tipo: "contratacao", status: "pendente_revisao", cliente_id: CLI, unidade_id: U1, vaga_id: VAGA, candidato_id: "cand-1", candidato_vaga_id: "cv-1",
    cliente_nome_snapshot: "Cliente Teste", cliente_cnpj_snapshot: null, cliente_endereco_snapshot: null, cliente_telefone_snapshot: null, cliente_email_snapshot: null,
    candidato_nome_snapshot: "Fulano de Tal", cargo: "Auxiliar administrativo", salario: 2500, data_inicio: "2026-10-01", fee_percentual: 45, prazo_cobranca: "14 dias",
    gerado_por_user_id: "user-1", ...extra,
  };
}
const usuario = { id: "user-1", email: "diretora@t.local", app_metadata: { role: "diretoria" } };
function req(metodo: string, corpo?: unknown) {
  return Object.assign(new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { nextUrl: new URL("http://x/api") });
}
async function patchCobranca(db: any, corpo: Record<string, unknown>) {
  db.usuario = usuario;
  (globalThis as any).__DB__ = db;
  const r = await rotaCobranca.PATCH(req("PATCH", corpo) as never, { params: Promise.resolve({ id: COB }) });
  return { status: r.status, body: await r.json() };
}
async function getCobranca(db: any) {
  db.usuario = usuario;
  (globalThis as any).__DB__ = db;
  const r = await rotaCobranca.GET(req("GET") as never, { params: Promise.resolve({ id: COB }) });
  return { status: r.status, body: await r.json() };
}
async function aprovar(db: any) {
  db.usuario = usuario;
  (globalThis as any).__DB__ = db;
  const r = await rotaAprovar.POST(req("POST") as never, { params: Promise.resolve({ id: COB }) });
  return { status: r.status, body: await r.json() };
}

// ── Funções puras ────────────────────────────────────────────────────────────
await caso("documento e e-mail do snapshot: PJ igual ao de sempre; PF cai no cpf; NF tem preferência e vazio cai no contato", () => {
  assert.equal(documentoDoCliente({ cnpj: CNPJ, cpf: null }), CNPJ, "PJ: cnpj");
  assert.equal(documentoDoCliente({ cnpj: null, cpf: CPF }), CPF, "PF: cpf");
  assert.equal(documentoDoCliente({ cnpj: null, cpf: null }), null);
  assert.equal(documentoDoCliente(null), null);
  for (const vazio of ["", "   "]) assert.equal(documentoDoCliente({ cnpj: vazio, cpf: CPF }), CPF, `PF com cnpj ${JSON.stringify(vazio)} cai no cpf`);
  assert.equal(emailDaCobranca({ contato_email: "contato@x.com", email_nota_fiscal: "nf@x.com" }), "nf@x.com");
  for (const nf of [null, undefined, "", "   "]) assert.equal(emailDaCobranca({ contato_email: "contato@x.com", email_nota_fiscal: nf }), "contato@x.com", JSON.stringify(nf));
  assert.equal(emailDaCobranca({ contato_email: null, email_nota_fiscal: null }), null);
  assert.equal(emailDaCobranca({ contato_email: "contato@x.com" }), "contato@x.com", "cliente sem a coluna (antes da migração) continua no contato");
});
await caso("tipo do documento vem do cadastro (nunca dos dígitos): só PF é CPF", () => {
  assert.equal(tipoDocumentoDaCobranca("pf"), "cpf");
  for (const t of ["pj", null, undefined, "", "outro"]) assert.equal(tipoDocumentoDaCobranca(t as never), "cnpj", String(t));
  assert.equal(rotuloDocumento("cpf"), "CPF");
  assert.equal(rotuloDocumento("cnpj"), "CNPJ");
});
await caso("validação do documento digitado: PF só CPF válido (grava com máscara); PF com CNPJ ou tamanho errado ou dígito inválido recusa; PJ só recusa CPF", () => {
  assert.deepEqual(validarDocumentoDaCobranca("pf", CPF_DIGITOS), { ok: true, valor: CPF });
  assert.deepEqual(validarDocumentoDaCobranca("pf", ` ${CPF} `), { ok: true, valor: CPF });
  for (const ruim of [CNPJ, CNPJ_DIGITOS, "123", "529.982.247-24", "111.111.111-11", "", "abc"]) {
    const r = validarDocumentoDaCobranca("pf", ruim);
    assert.equal(r.ok, false, `PF ${ruim}`);
  }
  assert.match((validarDocumentoDaCobranca("pf", CNPJ) as { erro: string }).erro, /pessoa física.*CPF.*não um CNPJ/);
  assert.match((validarDocumentoDaCobranca("pf", "529.982.247-24") as { erro: string }).erro, /CPF inválido/);
  // PJ: igual a antes (texto como digitado, sem conferir dígitos), exceto recusar o que é claramente um CPF
  assert.deepEqual(validarDocumentoDaCobranca("pj", CNPJ), { ok: true, valor: CNPJ });
  assert.deepEqual(validarDocumentoDaCobranca("pj", "12.345 texto livre"), { ok: true, valor: "12.345 texto livre" });
  assert.deepEqual(validarDocumentoDaCobranca("pj", "11.222.333/0001-80"), { ok: true, valor: "11.222.333/0001-80" }, "PJ não passa a conferir dígitos");
  assert.equal(validarDocumentoDaCobranca("pj", CPF).ok, false);
  assert.match((validarDocumentoDaCobranca("pj", CPF) as { erro: string }).erro, /pessoa jurídica.*CNPJ.*não um CPF/);
  // sem cadastro: nada é conferido
  assert.deepEqual(validarDocumentoDaCobranca(null, CPF), { ok: true, valor: CPF });
});
await caso("documento em outro cliente (função pura): CPF e CNPJ, ativo ou inativo; 'outra unidade' sem expor nada; o próprio cliente é ignorado", () => {
  const clientes = [
    { id: CLI, nome: "Eu", ativo: true, cpf: null, cnpj: null, unidade_id: U1 },
    { id: CLI_OUTRO, nome: "Segredo S.A.", ativo: false, cpf: CPF, cnpj: null, unidade_id: U2 },
    { id: "c3", nome: "Outra", ativo: true, cpf: null, cnpj: CNPJ, unidade_id: U1 },
  ];
  assert.deepEqual(documentoJaCadastradoEmOutroCliente(CPF_DIGITOS, "cpf", clientes, CLI, U1), { existe: true, outraUnidade: true });
  assert.deepEqual(documentoJaCadastradoEmOutroCliente(CNPJ_DIGITOS, "cnpj", clientes, CLI, U1), { existe: true, outraUnidade: false });
  assert.deepEqual(documentoJaCadastradoEmOutroCliente(OUTRO_CPF, "cpf", clientes, CLI, U1), { existe: false, outraUnidade: false });
  assert.deepEqual(documentoJaCadastradoEmOutroCliente(CPF, "cpf", [{ id: CLI, nome: "Eu", ativo: true, cpf: CPF, unidade_id: U1 }], CLI, U1), { existe: false, outraUnidade: false }, "o próprio");
  assert.deepEqual(documentoJaCadastradoEmOutroCliente("12.345 livre", "cnpj", clientes, CLI, U1), { existe: false, outraUnidade: false }, "texto livre de PJ não é comparado (como antes)");
});

// ── Geração da cobrança (snapshot) ───────────────────────────────────────────
await caso("contratação: cliente PJ fica IGUAL (snapshot cnpj; e-mail de contato quando não há e-mail da NF)", async () => {
  const db = banco();
  (globalThis as any).__DB__ = db;
  const r = await gerarCobrancaRSSeAplicavel(VAGA, "cv-1");
  assert.equal(r.criada, true, JSON.stringify(r));
  const c = db.tabelas.cobrancas_rs[0];
  assert.equal(c.cliente_cnpj_snapshot, CNPJ);
  assert.equal(c.cliente_email_snapshot, "contato@teste.com.br");
  assert.equal(c.cliente_endereco_snapshot, "Rua A, 10");
  assert.equal(c.fee_percentual, 45);
  assert.equal(c.status, "pendente_revisao");
});
await caso("contratação: cliente PF grava o CPF no snapshot (cnpj é nulo no cadastro)", async () => {
  const db = banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: CPF }) });
  (globalThis as any).__DB__ = db;
  const r = await gerarCobrancaRSSeAplicavel(VAGA, "cv-1");
  assert.equal(r.criada, true, JSON.stringify(r));
  assert.equal(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CPF);
  assert.equal(db.tabelas.cobrancas_rs[0].fee_percentual, 45);
});
await caso("contratação: e-mail da nota fiscal tem preferência (PJ e PF); vazio ou só espaços cai no contato", async () => {
  for (const tipo of ["pj", "pf"] as const) {
    const base = tipo === "pf" ? { tipo_pessoa: "pf", cnpj: null, cpf: CPF } : {};
    const comNf = banco({ cliente: cliente({ ...base, email_nota_fiscal: "nf@teste.com.br" }) });
    (globalThis as any).__DB__ = comNf;
    await gerarCobrancaRSSeAplicavel(VAGA, "cv-1");
    assert.equal(comNf.tabelas.cobrancas_rs[0].cliente_email_snapshot, "nf@teste.com.br", `${tipo}: NF`);
    for (const vazio of ["", "   ", null]) {
      const semNf = banco({ cliente: cliente({ ...base, email_nota_fiscal: vazio }) });
      (globalThis as any).__DB__ = semNf;
      await gerarCobrancaRSSeAplicavel(VAGA, "cv-1");
      assert.equal(semNf.tabelas.cobrancas_rs[0].cliente_email_snapshot, "contato@teste.com.br", `${tipo}: ${JSON.stringify(vazio)}`);
    }
  }
});
await caso("cancelamento: PJ igual (cnpj, contato); PF com CPF e e-mail da NF; taxa de 25% da vaga", async () => {
  const pj = banco();
  (globalThis as any).__DB__ = pj;
  assert.equal((await gerarCobrancaCancelamentoRSSeAplicavel(VAGA)).criada, true);
  assert.equal(pj.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CNPJ);
  assert.equal(pj.tabelas.cobrancas_rs[0].cliente_email_snapshot, "contato@teste.com.br");
  const pf = banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: CPF, email_nota_fiscal: "nf@teste.com.br" }) });
  (globalThis as any).__DB__ = pf;
  const r = await gerarCobrancaCancelamentoRSSeAplicavel(VAGA);
  assert.equal(r.criada, true, JSON.stringify(r));
  const c = pf.tabelas.cobrancas_rs[0];
  assert.equal(c.tipo, "cancelamento");
  assert.equal(c.cliente_cnpj_snapshot, CPF);
  assert.equal(c.cliente_email_snapshot, "nf@teste.com.br");
  assert.equal(c.fee_percentual, 25);
});

// ── GET: o tipo do cliente chega ao modal ────────────────────────────────────
await caso("GET /api/cobrancas-rs/[id] traz clientes.tipo_pessoa (PF e PJ) e null sem cadastro", async () => {
  const pf = await getCobranca(banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: CPF }), cobranca: cobranca() }));
  assert.equal(pf.status, 200, JSON.stringify(pf.body));
  assert.equal(pf.body.data.clientes.tipo_pessoa, "pf");
  const pj = await getCobranca(banco({ cobranca: cobranca() }));
  assert.equal(pj.body.data.clientes.tipo_pessoa, "pj");
  const sem = await getCobranca(banco({ cliente: null, cobranca: cobranca({ cliente_id: null }) }));
  assert.equal(sem.status, 200);
  assert.equal(sem.body.data.clientes, null);
});

// ── PATCH: documento e endereço ──────────────────────────────────────────────
await caso("PATCH PF: o CPF vai para clientes.cpf (com máscara) e NUNCA para cnpj; snapshot e endereço salvos; sem avisos", async () => {
  const db = banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: null, endereco: null }), cobranca: cobranca() });
  const r = await patchCobranca(db, { cliente_cnpj: CPF_DIGITOS, cliente_endereco: "Rua B, 20" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.avisos, []);
  const c = db.tabelas.clientes[0];
  assert.equal(c.cpf, CPF);
  assert.strictEqual(c.cnpj, null, "cnpj do cliente PF nunca é preenchido");
  assert.equal(c.endereco, "Rua B, 20");
  assert.equal(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CPF);
  assert.equal(db.tabelas.cobrancas_rs[0].cliente_endereco_snapshot, "Rua B, 20");
});
await caso("PATCH PJ fica IGUAL: o documento vai para clientes.cnpj como digitado (texto livre incluso) e o endereço também", async () => {
  const db = banco({ cliente: cliente({ cnpj: null, endereco: null }), cobranca: cobranca() });
  const r = await patchCobranca(db, { cliente_cnpj: "12.345 texto livre", cliente_endereco: "Rua C, 30" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.tabelas.clientes[0].cnpj, "12.345 texto livre");
  assert.ok(!db.tabelas.clientes[0].cpf);
  assert.equal(db.tabelas.clientes[0].endereco, "Rua C, 30");
  assert.equal(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, "12.345 texto livre");
  const db2 = banco({ cliente: cliente({ cnpj: null }), cobranca: cobranca() });
  assert.equal((await patchCobranca(db2, { cliente_cnpj: CNPJ })).status, 200);
  assert.equal(db2.tabelas.clientes[0].cnpj, CNPJ);
});
await caso("PATCH PF com 14 dígitos (CNPJ) = 400 claro, sem salvar nada; PF com CPF inválido = 400; PJ com CPF = 400", async () => {
  const pf = (extra: Record<string, unknown> = {}) => banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: null, endereco: null }), cobranca: cobranca(extra) });
  for (const [rotulo, doc, esperado] of [["14 dígitos", CNPJ, /não um CNPJ/], ["14 dígitos sem máscara", CNPJ_DIGITOS, /não um CNPJ/], ["CPF inválido", "529.982.247-24", /CPF inválido/], ["curto", "123", /11 dígitos/]] as const) {
    const db = pf();
    const r = await patchCobranca(db, { cliente_cnpj: doc, cliente_endereco: "Rua D, 40", cargo: "Mudou" });
    assert.equal(r.status, 400, `${rotulo}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.error, esperado, rotulo);
    assert.equal(r.body.campo, "cliente_cnpj");
    assert.strictEqual(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, null, `${rotulo}: nada gravado na cobrança`);
    assert.strictEqual(db.tabelas.cobrancas_rs[0].cliente_endereco_snapshot, null);
    assert.equal(db.tabelas.cobrancas_rs[0].cargo, "Auxiliar administrativo");
    assert.strictEqual(db.tabelas.clientes[0].cpf, null);
    assert.strictEqual(db.tabelas.clientes[0].cnpj, null);
  }
  const pj = banco({ cobranca: cobranca(), cliente: cliente({ cnpj: null }) });
  const r = await patchCobranca(pj, { cliente_cnpj: CPF });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /pessoa jurídica.*CNPJ.*não um CPF/);
  assert.strictEqual(pj.tabelas.clientes[0].cnpj, null);
});
await caso("PATCH: o documento já gravado no snapshot continua somente leitura (o digitado é ignorado, sem validar)", async () => {
  const db = banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: CPF }), cobranca: cobranca({ cliente_cnpj_snapshot: CPF }) });
  const r = await patchCobranca(db, { cliente_cnpj: "lixo qualquer", cargo: "Novo cargo" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CPF);
  assert.equal(db.tabelas.cobrancas_rs[0].cargo, "Novo cargo");
});
await caso("PATCH: o endereço é gravado no cadastro MESMO quando o documento não pode ser (CHECK do banco ou documento já usado) e a resposta traz o aviso", async () => {
  // (a) o CHECK clientes_documento_coerente recusa o update do documento (cadastro PJ com cpf indevido): endereço separado, grava
  const inconsistente = banco({ cliente: cliente({ cnpj: null, cpf: OUTRO_CPF, endereco: null }), cobranca: cobranca() });
  const a = await patchCobranca(inconsistente, { cliente_cnpj: CNPJ, cliente_endereco: "Rua E, 50" });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(inconsistente.tabelas.clientes[0].endereco, "Rua E, 50", "o endereço gravou");
  assert.strictEqual(inconsistente.tabelas.clientes[0].cnpj, null, "o documento não gravou");
  assert.equal(inconsistente.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CNPJ, "a cobrança foi salva");
  assert.equal(a.body.avisos.length, 1);
  assert.match(a.body.avisos[0], /CNPJ não pôde ser salvo no cadastro/);
  // (b) documento já cadastrado em outro cliente da MESMA unidade
  const dup = banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: null, endereco: null }), outros: [cliente({ id: CLI_OUTRO, nome: "Maria da Silva", tipo_pessoa: "pf", cnpj: null, cpf: CPF, contato_telefone: "(11) 91111-1111", contato_email: "maria@x.com" })], cobranca: cobranca() });
  const b = await patchCobranca(dup, { cliente_cnpj: CPF, cliente_endereco: "Rua F, 60" });
  assert.equal(b.status, 200);
  assert.equal(dup.tabelas.clientes[0].endereco, "Rua F, 60");
  assert.strictEqual(dup.tabelas.clientes[0].cpf, null, "CPF de outro cliente não é gravado");
  assert.equal(dup.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CPF, "a cobrança segue salva");
  assert.match(b.body.avisos[0], /já pertence a outro cliente/);
  assert.ok(!JSON.stringify(b.body.avisos).includes("Maria"), "sem nome do outro cliente");
});
await caso("PATCH: documento já cadastrado em OUTRA unidade → só 'fale com a diretoria', sem nome, cidade, id nem telefone do outro cadastro (CPF e CNPJ)", async () => {
  for (const [rotulo, tipo, doc, outro] of [
    ["CPF", "pf", CPF, { tipo_pessoa: "pf", cnpj: null, cpf: CPF }],
    ["CNPJ", "pj", CNPJ, { tipo_pessoa: "pj", cnpj: CNPJ, cpf: null }],
  ] as const) {
    const db = banco({
      cliente: cliente({ tipo_pessoa: tipo, cnpj: null, cpf: null, endereco: null }),
      outros: [cliente({ id: CLI_OUTRO, nome: "Concorrente Secreto SA", cidade: "Monte Mor", unidade_id: U2, contato_telefone: "(19) 93333-4444", contato_email: "secreto@concorrente.com", ativo: false, ...outro })],
      cobranca: cobranca(),
    });
    const r = await patchCobranca(db, { cliente_cnpj: doc, cliente_endereco: "Rua G, 70" });
    assert.equal(r.status, 200, `${rotulo}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body.avisos, ["Este documento já está cadastrado em outra unidade. Fale com a diretoria."], rotulo);
    const texto = JSON.stringify(r.body.avisos);
    for (const proibido of ["Concorrente", "Secreto", "Monte Mor", CLI_OUTRO, "3333", "secreto@"]) assert.ok(!texto.includes(proibido), `${rotulo}: aviso não pode conter "${proibido}"`);
    assert.strictEqual(db.tabelas.clientes[0].cpf ?? null, null, `${rotulo}: documento não gravado no cadastro`);
    assert.strictEqual(db.tabelas.clientes[0].cnpj, null);
    assert.equal(db.tabelas.clientes[0].endereco, "Rua G, 70", `${rotulo}: endereço gravou`);
    assert.equal(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, doc, `${rotulo}: a cobrança foi salva`);
  }
});
await caso("PATCH sem cadastro vinculado: nada é conferido nem gravado no cadastro (como antes) e não há aviso", async () => {
  const db = banco({ cliente: null, cobranca: cobranca({ cliente_id: null }) });
  const r = await patchCobranca(db, { cliente_cnpj: CPF, cliente_endereco: "Rua H, 80" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.avisos, []);
  assert.equal(db.tabelas.cobrancas_rs[0].cliente_cnpj_snapshot, CPF);
});

// ── Aprovar ──────────────────────────────────────────────────────────────────
await caso("aprovar: PF sem CPF = 400 citando 'CPF do cliente'; PF sem endereço cita 'Endereço do cliente'; PJ continua citando 'CNPJ do cliente'", async () => {
  const pf = await aprovar(banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: null }), cobranca: cobranca() }));
  assert.equal(pf.status, 400, JSON.stringify(pf.body));
  assert.equal(pf.body.error, "Preencha antes de aprovar: CPF do cliente, Endereço do cliente.");
  const pfSoEndereco = await aprovar(banco({ cliente: cliente({ tipo_pessoa: "pf", cnpj: null, cpf: CPF }), cobranca: cobranca({ cliente_cnpj_snapshot: CPF }) }));
  assert.equal(pfSoEndereco.status, 400);
  assert.equal(pfSoEndereco.body.error, "Preencha antes de aprovar: Endereço do cliente.");
  const pj = await aprovar(banco({ cobranca: cobranca() }));
  assert.equal(pj.status, 400);
  assert.equal(pj.body.error, "Preencha antes de aprovar: CNPJ do cliente, Endereço do cliente.", "texto de PJ igual ao de antes");
  const semCadastro = await aprovar(banco({ cliente: null, cobranca: cobranca({ cliente_id: null }) }));
  assert.match(semCadastro.body.error, /CNPJ do cliente/, "sem cadastro: CNPJ, como antes");
});

await caso("aprovar (sucesso): PF com CPF e endereço aprova e o e-mail enviado traz 'CPF:' e 'Cliente:'; PJ traz 'CNPJ:'", async () => {
  for (const [tipo, doc, rotulo] of [["pf", CPF, "CPF"], ["pj", CNPJ, "CNPJ"]] as const) {
    const base = tipo === "pf" ? { tipo_pessoa: "pf", cnpj: null, cpf: CPF } : {};
    const db = banco({ cliente: cliente(base), cobranca: cobranca({ cliente_cnpj_snapshot: doc, cliente_endereco_snapshot: "Rua A, 10" }) });
    db.tabelas.analistas_perfil[0].email = "diretora@t.local";
    const r = await aprovar(db);
    assert.equal(r.status, 200, `${tipo}: ${JSON.stringify(r.body)}`);
    assert.equal(db.tabelas.cobrancas_rs[0].status, "aprovada_enviada", tipo);
    const html = (db.emails ?? []).map((e: { html: string }) => e.html).join("\n");
    assert.ok(html.includes(`<strong>${rotulo}:</strong> ${doc}`), `${tipo}: linha ${rotulo}`);
    assert.ok(html.includes("<strong>Cliente:</strong> Cliente Teste"), `${tipo}: linha Cliente`);
    assert.ok(!html.includes("<strong>Empresa:</strong>"), `${tipo}: sem Empresa`);
  }
});

// ── E-mail ───────────────────────────────────────────────────────────────────
await caso("e-mail da cobrança: PJ 'Cliente:' + 'CNPJ:' (padrão); PF 'Cliente:' + 'CPF:'; nunca 'Empresa:' na cobrança gerada", () => {
  const dados = { nome: "", cargo: "Auxiliar", nomeCliente: "Fulano Ltda", clienteCnpj: CNPJ, clienteEndereco: "Rua A", clienteTelefone: "(19) 90000-0000", clienteEmail: "nf@x.com", tipoCobrancaRS: "contratacao" as const, feeValor: 1000, feeRsPercentual: 45 };
  const pj = getEmailTemplate("cobranca_rs_gerada", dados).html;
  assert.ok(pj.includes("<strong>Cliente:</strong> Fulano Ltda") && pj.includes(`<strong>CNPJ:</strong> ${CNPJ}`) && !pj.includes("<strong>Empresa:</strong>"));
  const pjExplicito = getEmailTemplate("cobranca_rs_gerada", { ...dados, clienteDocumentoRotulo: "CNPJ" }).html;
  assert.equal(pjExplicito, pj, "rótulo explícito CNPJ = padrão");
  const pf = getEmailTemplate("cobranca_rs_gerada", { ...dados, nomeCliente: "João da Silva", clienteCnpj: CPF, clienteDocumentoRotulo: "CPF" }).html;
  assert.ok(pf.includes("<strong>Cliente:</strong> João da Silva") && pf.includes(`<strong>CPF:</strong> ${CPF}`) && !pf.includes("<strong>CNPJ:</strong>"));
  const canc = getEmailTemplate("cobranca_rs_gerada", { ...dados, tipoCobrancaRS: "cancelamento", clienteDocumentoRotulo: "CPF", clienteCnpj: CPF }).html;
  assert.ok(canc.includes("<strong>CPF:</strong>"));
  // fora o rótulo, o e-mail de PJ não muda
  const sem = (h: string) => h.replace("<strong>Cliente:</strong>", "<strong>Empresa:</strong>");
  assert.ok(sem(pj).includes("<strong>Empresa:</strong> Fulano Ltda"));
});

await caso("e-mails de cobrança atrasada, aguardando validação, paga e cancelada: 'Cliente:' no lugar de 'Empresa:' (só o rótulo), com PF e PJ", () => {
  const dados = { nome: "", cargo: "Auxiliar", nomeCliente: "Fulano Ltda", nomeCandidato: "Fulano de Tal", tipoCobrancaRS: "contratacao" as const, feeValor: 1000, dataVencimento: "2026-11-01", diasAtraso: 3, diasParado: 2, dataPagamento: "2026-11-02", justificativaCancelamento: "Desistiu" };
  for (const nome of ["cobranca_rs_atrasada", "cobranca_rs_aguardando_validacao", "cobranca_rs_paga", "cobranca_rs_cancelada"] as const) {
    for (const nomeCliente of ["Fulano Ltda", "João da Silva"]) {
      const html = getEmailTemplate(nome, { ...dados, nomeCliente }).html;
      assert.ok(html.includes(`<strong>Cliente:</strong> ${nomeCliente}`), `${nome}: rótulo Cliente`);
      assert.ok(!html.includes("<strong>Empresa:</strong>"), `${nome}: sem Empresa`);
    }
  }
});

// ── Cadastro do cliente: o e-mail do snapshot acompanha NF/contato ──────────
await caso("editar o cliente recalcula o e-mail das cobranças: NF tem preferência; sem NF vale o contato (PJ como antes)", async () => {
  async function editar(db: any, corpo: Record<string, unknown>) {
    db.usuario = usuario;
    (globalThis as any).__DB__ = db;
    const r = await rotaCliente.PATCH(req("PATCH", corpo) as never, { params: Promise.resolve({ id: CLI }) });
    return { status: r.status, body: await r.json() };
  }
  const semNf = banco({ cobranca: cobranca({ cliente_email_snapshot: "antigo@x.com" }) });
  assert.equal((await editar(semNf, { contato_email: "novo@x.com" })).status, 200);
  assert.equal(semNf.tabelas.cobrancas_rs[0].cliente_email_snapshot, "novo@x.com", "PJ sem NF: igual a antes");
  const comNf = banco({ cliente: cliente({ email_nota_fiscal: "nf@x.com" }), cobranca: cobranca({ cliente_email_snapshot: "nf@x.com" }) });
  assert.equal((await editar(comNf, { contato_email: "outro-contato@x.com" })).status, 200);
  assert.equal(comNf.tabelas.cobrancas_rs[0].cliente_email_snapshot, "nf@x.com", "mudar o contato não derruba o e-mail da NF");
  assert.equal((await editar(comNf, { email_nota_fiscal: "nf2@x.com" })).status, 200);
  assert.equal(comNf.tabelas.cobrancas_rs[0].cliente_email_snapshot, "nf2@x.com");
  assert.equal((await editar(comNf, { email_nota_fiscal: "" })).status, 200);
  assert.equal(comNf.tabelas.cobrancas_rs[0].cliente_email_snapshot, "outro-contato@x.com", "NF limpa volta para o contato");
  const outraEdicao = banco({ cliente: cliente({ email_nota_fiscal: "nf@x.com" }), cobranca: cobranca({ cliente_email_snapshot: "nf@x.com" }) });
  assert.equal((await editar(outraEdicao, { cidade: "Jundiaí" })).status, 200);
  assert.equal(outraEdicao.tabelas.cobrancas_rs[0].cliente_email_snapshot, "nf@x.com", "edição sem e-mail não mexe no snapshot");
});

console.error = silencio;
console.log(`\n${total} casos OK`);
