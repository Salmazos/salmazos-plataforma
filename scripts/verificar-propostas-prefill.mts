// Verificação do pré-preenchimento da proposta a partir do cadastro: rota GET empresas/[id]/prefill (no banco em memória do harness, dados ZZTEST) e as regras
// puras de preenchimento (só campos vazios, máscara do CNPJ, limpeza ao trocar de empresa). A tela é coberta em scripts/smoke-propostas-mot-ui.mts.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-prefill.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import * as rotaPrefill from "@/app/api/comercial/propostas/empresas/[id]/prefill/route";
import { MSG_SEM_ACESSO_PROPOSTAS, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";
import { aplicarPrefill, cnpjParaCampo, enderecoParaCampo, lerDadosPrefill, valoresDoCadastro, type CamposPrefill, type DadosPrefill } from "@/lib/propostaPrefill";
import { criarDb } from "./harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const uid = (k: number) => `cccccccc-cccc-4ccc-8ccc-${String(k).padStart(12, "0")}`;
const U = uid(1), U2 = uid(2);
const V = uid(10), LIB = uid(11), DIR = uid(12), G = uid(13), SEM = uid(14), SEMUNI = uid(15);
const CL_COL = uid(20), CL_DIGITOS = uid(21), CL_SEM_DADOS = uid(22), CL_OUTRA_UNIDADE = uid(23), CL_FORA_PADRAO = uid(24);
const E_COL = uid(30), E_SEM_CONTATO = uid(31), E_SEM_PRINCIPAL = uid(32), E_SEM_CLIENTE = uid(33), E_OUTRA = uid(34), E_TESTE = uid(35), E_CLIENTE_ALHEIO = uid(36), E_DIGITOS = uid(37), E_SEM_DADOS = uid(38), E_FORA_PADRAO = uid(39);

function novoDb() {
  const perfil = (id: string, user: string, nome: string, extras: Record<string, unknown>) => ({ id, user_id: user, nome_completo: nome, email: `${user}@salmazos.com.br`, telefone: null, cargo: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true, ...extras });
  return criarDb({
    analistas_perfil: [
      perfil(V, "u-v", "Vendedor", { perfil_comercial: true }),
      perfil(LIB, "u-lib", "Selecionadora", {}),
      perfil(DIR, "u-dir", "Diretora", { nivel_acesso: "diretoria", acesso_todas_unidades: true }),
      perfil(G, "u-g", "Gestora Teste", { nivel_acesso: "superuser", acesso_todas_unidades: true }),
      perfil(SEM, "u-sem", "Sem acesso", {}),
      perfil(SEMUNI, "u-semuni", "Sem unidade", { perfil_comercial: true, unidade_id: null }),
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: LIB, chave_aba: "comercial_propostas", liberado: true }, { analista_perfil_id: G, chave_aba: "comercial_propostas", liberado: true }],
    clientes: [
      { id: CL_COL, nome: "ZZTEST Colatio", unidade_id: U, ativo: true, cnpj: "21.235.881/0001-08", cidade: "Campinas", cpf: "111.222.333-44", endereco: "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140", contato_nome: "Gisele Belini", contato_telefone: "(19) 99368-2285", contato_email: "gisele@zztest.com.br" },
      { id: CL_DIGITOS, nome: "ZZTEST Só Dígitos", unidade_id: U, ativo: true, cnpj: "11222333000181", cidade: "Sumaré", contato_nome: "X", contato_telefone: "1", contato_email: "x@x" },
      { id: CL_SEM_DADOS, nome: "ZZTEST Sem Dados", unidade_id: U, ativo: true, cnpj: "   ", cidade: "  ", endereco: "   ", contato_nome: "", contato_telefone: "", contato_email: "" },
      { id: CL_OUTRA_UNIDADE, nome: "ZZTEST Cliente de Outra Unidade", unidade_id: U2, ativo: true, cnpj: "99.888.777/0001-66", cidade: "São Bernardo", contato_nome: "Y", contato_telefone: "2", contato_email: "y@y" },
      { id: CL_FORA_PADRAO, nome: "ZZTEST CNPJ Fora do Padrão", unidade_id: U, ativo: true, cnpj: "CNPJ 12.345 pendente", cidade: "Hortolândia", contato_nome: "Z", contato_telefone: "3", contato_email: "z@z" },
    ],
    empresas_visitadas: [
      { id: E_COL, nome: "ZZTEST Colatio", cliente_id: CL_COL, unidade_id: U, cidade: null },
      { id: E_SEM_CONTATO, nome: "ZZTEST Sem Contato", cliente_id: CL_COL, unidade_id: U, cidade: null },
      { id: E_SEM_PRINCIPAL, nome: "ZZTEST Sem Principal", cliente_id: null, unidade_id: U, cidade: null },
      { id: E_SEM_CLIENTE, nome: "ZZTEST Sem Cliente", cliente_id: null, unidade_id: U, cidade: "Hortolândia" },
      { id: E_OUTRA, nome: "ZZTEST Outra Unidade", cliente_id: CL_OUTRA_UNIDADE, unidade_id: U2, cidade: null },
      { id: E_TESTE, nome: "ZZTEST Empresa de Teste", cliente_id: CL_COL, unidade_id: U, cidade: null },
      { id: E_CLIENTE_ALHEIO, nome: "ZZTEST Cliente Alheio", cliente_id: CL_OUTRA_UNIDADE, unidade_id: U, cidade: null },
      { id: E_DIGITOS, nome: "ZZTEST Dígitos", cliente_id: CL_DIGITOS, unidade_id: U, cidade: null },
      { id: E_SEM_DADOS, nome: "ZZTEST Sem Dados", cliente_id: CL_SEM_DADOS, unidade_id: U, cidade: null },
      { id: E_FORA_PADRAO, nome: "ZZTEST Fora do Padrão", cliente_id: CL_FORA_PADRAO, unidade_id: U, cidade: null },
    ],
    empresas_teste: [{ empresa_id: E_TESTE, marcado_por: G }],
    empresa_contatos: [
      { id: uid(40), empresa_visitada_id: E_COL, nome: "Ana Secundária", cargo: "RH", telefone: "(19) 90000-0001", email: "ana@zztest.com.br", principal: false },
      { id: uid(41), empresa_visitada_id: E_COL, nome: "Gisele Belini", cargo: "Compras", telefone: "(19) 99368-2285", email: "gisele@zztest.com.br", principal: true },
      { id: uid(42), empresa_visitada_id: E_SEM_PRINCIPAL, nome: "Zeca", cargo: null, telefone: null, email: null, principal: false },
      { id: uid(43), empresa_visitada_id: E_SEM_PRINCIPAL, nome: "Bia", cargo: "Gerente", telefone: null, email: null, principal: false },
      { id: uid(44), empresa_visitada_id: E_TESTE, nome: "Contato de Teste", cargo: null, telefone: null, email: null, principal: true },
    ],
  });
}
type Chamada = { status: number; body: any };
async function chamar(db: any, usuario: string | null, id: string): Promise<Chamada> {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: ["u-dir", "u-g"].includes(usuario) ? (usuario === "u-g" ? "superuser" : "diretoria") : "analista" } } : null;
  globalThis.__DB__ = db;
  const req = Object.assign(new Request(`http://x/api/comercial/propostas/empresas/${id}/prefill`), { nextUrl: new URL("http://x/api") });
  const r = await rotaPrefill.GET(req, { params: Promise.resolve({ id }) });
  return { status: r.status, body: await r.json() };
}

// ── Rota ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("empresa com contato principal e cliente: devolve o contato principal (nome e cargo), o CNPJ, o endereço (só o texto) e a cidade do cliente — e nada além disso (caso Colatio)", async () => {
  const db = novoDb();
  const r = await chamar(db, "u-v", E_COL);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { data: { contato: { nome: "Gisele Belini", cargo: "Compras" }, cnpj: "21.235.881/0001-08", endereco: "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140", cidade: "Campinas" } });
  const json = JSON.stringify(r.body);
  for (const proibido of ["99368", "gisele@", "111.222.333", "Ana Secundária", "cpf", "telefone", "email", "unidade_id", "contato_nome"]) assert.ok(!json.includes(proibido), `vazou ${proibido}`);
  assert.ok(json.includes("Rua Ribeirão Preto, 251"), "o endereço do cadastro (só o texto) sai");
  assert.deepEqual(Object.keys(r.body.data).sort(), ["cidade", "cnpj", "contato", "endereco"]);
  assert.deepEqual(Object.keys(r.body.data.contato).sort(), ["cargo", "nome"]);
});

await caso("empresa sem contato: contato null (A/C fica vazio); sem principal: o primeiro por nome; o CNPJ vem do cliente mesmo sem contato", async () => {
  const db = novoDb();
  const sem = await chamar(db, "u-v", E_SEM_CONTATO);
  assert.equal(sem.status, 200);
  assert.equal(sem.body.data.contato, null);
  assert.equal(sem.body.data.cnpj, "21.235.881/0001-08");
  const semPrincipal = await chamar(db, "u-v", E_SEM_PRINCIPAL);
  assert.deepEqual(semPrincipal.body.data.contato, { nome: "Bia", cargo: "Gerente" }, "sem principal vale o primeiro (ordem por nome)");
});

await caso("empresa sem cliente: CNPJ vazio (null); a cidade, se a empresa tiver, vem dela; sem nada, tudo null", async () => {
  const db = novoDb();
  const sem = await chamar(db, "u-v", E_SEM_CLIENTE);
  assert.deepEqual(sem.body.data, { contato: null, cnpj: null, endereco: null, cidade: "Hortolândia" });
  const nada = await chamar(db, "u-v", E_SEM_PRINCIPAL);
  assert.equal(nada.body.data.cnpj, null);
  assert.equal(nada.body.data.cidade, null);
  const vazio = await chamar(db, "u-v", E_SEM_DADOS);
  assert.deepEqual(vazio.body.data, { contato: null, cnpj: null, endereco: null, cidade: null }, "cadastro em branco/espaços não vira texto");
});

await caso("ENDEREÇO: usa clientes.endereco quando existir; sem endereço cai para a cidade (do cliente ou da empresa); sem endereço e sem cidade fica vazio", async () => {
  const db = novoDb();
  const campo = async (id: string) => { const r = await chamar(db, "u-v", id); assert.equal(r.status, 200); return valoresDoCadastro(lerDadosPrefill(r.body)!).cliente_endereco; };
  assert.equal(await campo(E_COL), "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140", "com endereço (Colatio): o endereço do cadastro, não a cidade");
  assert.equal(await campo(E_DIGITOS), "Sumaré", "sem endereço: a cidade do cliente");
  assert.equal(await campo(E_SEM_CLIENTE), "Hortolândia", "sem cliente e sem endereço: a cidade da empresa");
  assert.equal(await campo(E_SEM_DADOS), "", "endereço só com espaços e cidade em branco: vazio");
  assert.equal(await campo(E_SEM_PRINCIPAL), "", "sem cliente e sem cidade: vazio");
  assert.equal((await chamar(db, "u-v", E_DIGITOS)).body.data.endereco, null, "a rota devolve endereco null (a decisão é da tela)");
});

await caso("o CNPJ do cadastro sai como TEXTO, sem validar nem bloquear: dígitos, mascarado ou fora do padrão", async () => {
  const db = novoDb();
  assert.equal((await chamar(db, "u-v", E_DIGITOS)).body.data.cnpj, "11222333000181");
  assert.equal((await chamar(db, "u-v", E_FORA_PADRAO)).body.data.cnpj, "CNPJ 12.345 pendente");
  assert.equal((await chamar(db, "u-v", E_FORA_PADRAO)).status, 200);
});

await caso("outra unidade: 404 (mesmo para quem tem acesso a todas); id inexistente ou inválido: 404; cadastro de cliente de OUTRA unidade nunca é lido", async () => {
  const db = novoDb();
  for (const u of ["u-v", "u-lib", "u-g"]) {
    const r = await chamar(db, u, E_OUTRA);
    assert.equal(r.status, 404, u); assert.equal(r.body.error, "Empresa não encontrada.");
    assert.ok(!JSON.stringify(r.body).includes("99.888"));
  }
  assert.equal((await chamar(db, "u-v", uid(999))).status, 404);
  assert.equal((await chamar(db, "u-v", "nao-e-uuid")).status, 404);
  // Empresa da minha unidade ligada a um cliente de OUTRA unidade (dado inconsistente): o CNPJ dele não sai.
  const alheio = await chamar(db, "u-v", E_CLIENTE_ALHEIO);
  assert.equal(alheio.status, 200);
  assert.deepEqual(alheio.body.data, { contato: null, cnpj: null, endereco: null, cidade: null });
  assert.ok(!JSON.stringify(alheio.body).includes("99.888") && !JSON.stringify(alheio.body).includes("São Bernardo"));
});

await caso("empresa de TESTE: o vendedor (e o liberado) recebem 404, como se não existisse; o gestor recebe os dados", async () => {
  const db = novoDb();
  for (const u of ["u-v", "u-lib"]) {
    const r = await chamar(db, u, E_TESTE);
    assert.equal(r.status, 404, u);
    assert.ok(!JSON.stringify(r.body).includes("Contato de Teste"));
  }
  const g = await chamar(db, "u-g", E_TESTE);
  assert.equal(g.status, 200);
  assert.equal(g.body.data.contato.nome, "Contato de Teste");
  assert.equal(g.body.data.cnpj, "21.235.881/0001-08");
});

await caso("acesso: sem login 401; sem acesso 403; só leitura (diretoria sem liberação) 403; sem unidade 404; quem escreve (vendedor, liberado, gestor liberado) 200", async () => {
  const db = novoDb();
  assert.equal((await chamar(db, null, E_COL)).status, 401);
  const sem = await chamar(db, "u-sem", E_COL);
  assert.equal(sem.status, 403); assert.equal(sem.body.error, MSG_SEM_ACESSO_PROPOSTAS);
  const dir = await chamar(db, "u-dir", E_COL);
  assert.equal(dir.status, 403); assert.equal(dir.body.error, MSG_SO_ACOMPANHA_PROPOSTAS);
  assert.equal((await chamar(db, "u-semuni", E_COL)).status, 404);
  for (const u of ["u-v", "u-lib", "u-g"]) assert.equal((await chamar(db, u, E_COL)).status, 200, u);
});

await caso("falhas do banco: 500 com mensagem genérica (sem detalhe interno) e nada é gravado", async () => {
  for (const chave of ["empresas_visitadas.select", "empresa_contatos.select", "clientes.select", "empresas_teste.select"]) {
    const db = novoDb();
    const antes = JSON.stringify(db.tabelas);
    db.falhas[chave] = "boom detalhe interno";
    const r = await chamar(db, "u-v", E_COL);
    assert.equal(r.status, 500, chave);
    assert.equal(r.body.error, "Não foi possível carregar os dados do cadastro.");
    assert.ok(!JSON.stringify(r.body).includes("boom"));
    delete db.falhas[chave];
    assert.equal(JSON.stringify(db.tabelas), antes, "a rota só lê");
  }
});

await caso("somente leitura e SEM log de dados pessoais: nenhuma escrita no banco e nada impresso em console (nome, CNPJ, cidade, telefone)", async () => {
  const db = novoDb();
  const impresso: string[] = [];
  const originais = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of Object.keys(originais) as (keyof typeof originais)[]) console[k] = (...a: unknown[]) => { impresso.push(a.map(String).join(" ")); };
  db.consultas.length = 0;
  try {
    await chamar(db, "u-v", E_COL);
    await chamar(db, "u-v", E_OUTRA);
    await chamar(db, "u-v", E_TESTE);
    db.falhas["clientes.select"] = "erro com Gisele Belini 21.235.881/0001-08";
    await chamar(db, "u-v", E_COL);
  } finally { Object.assign(console, originais); }
  assert.deepEqual(db.consultas.filter((q: any) => q.op !== "select"), []);
  assert.deepEqual(impresso.filter((l) => /Gisele|21\.235|Campinas|99368|zztest/i.test(l)), [], "nenhum dado pessoal em log");
  const fonte = fs.readFileSync("src/app/api/comercial/propostas/empresas/[id]/prefill/route.ts", "utf8");
  assert.doesNotMatch(fonte, /console\./);
  assert.doesNotMatch(fonte, /\.(insert|update|delete|upsert)\(/);
});

// ── Regras puras ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const DADOS: DadosPrefill = { contato: { nome: "Gisele Belini", cargo: null }, cnpj: "21.235.881/0001-08", cidade: "Campinas", endereco: "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140" };
const SEM_NADA: DadosPrefill = { contato: null, cnpj: null, cidade: null, endereco: null };
const VAZIO: CamposPrefill = { aos_cuidados: "", cliente_cnpj: "", cliente_endereco: "" };

await caso("cnpjParaCampo: 14 dígitos recebem a máscara do sistema; já mascarado fica igual; fora do padrão vai como está (nunca bloqueia); vazio vira vazio; respeita o limite do campo", () => {
  assert.equal(cnpjParaCampo("21235881000108"), "21.235.881/0001-08");
  assert.equal(cnpjParaCampo("21.235.881/0001-08"), "21.235.881/0001-08");
  assert.equal(cnpjParaCampo(" 21.235.881/0001-08 "), "21.235.881/0001-08");
  assert.equal(cnpjParaCampo("CNPJ 12.345 pendente"), "CNPJ 12.345 pendente");
  assert.equal(cnpjParaCampo("12.345.678"), "12.345.678", "incompleto não é 'consertado'");
  assert.equal(cnpjParaCampo("1234567890123456"), "1234567890123456", "mais de 14 dígitos não é cortado");
  for (const v of [null, undefined, "", "   "]) assert.equal(cnpjParaCampo(v), "");
  assert.equal(cnpjParaCampo("x".repeat(80)).length, 30);
});

await caso("enderecoParaCampo: endereço do cadastro; sem ele a cidade; sem nada vazio; espaços não contam; respeita o limite do campo", () => {
  assert.equal(enderecoParaCampo("Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140", "Campinas"), "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140");
  assert.equal(enderecoParaCampo("  Rua A, 1  ", "Campinas"), "Rua A, 1");
  assert.equal(enderecoParaCampo(null, "  Campinas "), "Campinas");
  assert.equal(enderecoParaCampo("   ", "Campinas"), "Campinas", "endereço só com espaços cai para a cidade");
  assert.equal(enderecoParaCampo(null, null), "");
  assert.equal(enderecoParaCampo("  ", "  "), "");
  assert.equal(enderecoParaCampo("E".repeat(400), null).length, 300);
});

await caso("aplicarPrefill: preenche A/C, CNPJ (mascarado) e endereço (do cadastro) quando vazios; empresa sem dados deixa tudo vazio (nada inventado)", () => {
  assert.deepEqual(aplicarPrefill(VAZIO, DADOS), { aos_cuidados: "Gisele Belini", cliente_cnpj: "21.235.881/0001-08", cliente_endereco: "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140" });
  assert.deepEqual(aplicarPrefill(VAZIO, { ...DADOS, endereco: null }), { aos_cuidados: "Gisele Belini", cliente_cnpj: "21.235.881/0001-08", cliente_endereco: "Campinas" });
  assert.deepEqual(aplicarPrefill(VAZIO, { ...DADOS, endereco: null, cidade: null }).cliente_endereco, "");
  assert.deepEqual(aplicarPrefill(VAZIO, SEM_NADA), VAZIO);
});

await caso("aplicarPrefill (MESMA empresa): campo DIGITADO nunca é sobrescrito (em branco/espaços conta como vazio); os outros campos vazios são preenchidos; reaplicar não muda nada", () => {
  const digitado: CamposPrefill = { aos_cuidados: "Maria do Financeiro", cliente_cnpj: "", cliente_endereco: "   " };
  const r = aplicarPrefill(digitado, DADOS);
  assert.equal(r.aos_cuidados, "Maria do Financeiro");
  assert.equal(r.cliente_cnpj, "21.235.881/0001-08");
  assert.equal(r.cliente_endereco, "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140", "só espaços conta como vazio");
  assert.deepEqual(aplicarPrefill({ aos_cuidados: "A", cliente_cnpj: "B", cliente_endereco: "C" }, DADOS), { aos_cuidados: "A", cliente_cnpj: "B", cliente_endereco: "C" });
  assert.deepEqual(aplicarPrefill(r, { contato: { nome: "Outro", cargo: null }, cnpj: "99", cidade: "Outra", endereco: "Outro endereço" }), r, "reaplicar sobre o preenchido não muda nada");
  const original = { ...digitado };
  aplicarPrefill(digitado, DADOS);
  assert.deepEqual(digitado, original, "não muta a entrada");
});

await caso("lerDadosPrefill: só aceita o formato da rota; qualquer outra coisa (lista, texto, número, nulo) é ignorada; valores não-texto viram null", () => {
  assert.deepEqual(lerDadosPrefill({ data: { contato: { nome: "A", cargo: "B" }, cnpj: "1", cidade: "C", endereco: "D" } }), { contato: { nome: "A", cargo: "B" }, cnpj: "1", cidade: "C", endereco: "D" });
  assert.deepEqual(lerDadosPrefill({ data: { contato: null, cnpj: null, cidade: null, endereco: null } }), SEM_NADA);
  assert.deepEqual(lerDadosPrefill({ data: { contato: { nome: 5 }, cnpj: 7, cidade: {}, endereco: [] } }), SEM_NADA);
  for (const ruim of [null, undefined, "x", 3, [], { data: [] }, { data: "x" }, { data: null }, {}]) assert.equal(lerDadosPrefill(ruim), null, JSON.stringify(ruim));
  assert.deepEqual(valoresDoCadastro({ contato: { nome: "N".repeat(300), cargo: null }, cnpj: null, cidade: "C".repeat(400), endereco: null }), { aos_cuidados: "N".repeat(200), cliente_cnpj: "", cliente_endereco: "C".repeat(300) });
});

await caso("o snapshot e o servidor não mudam: nada em propostaServico/propostaModelos/schemas conhece o pré-preenchimento; a rota nova é a única mudança de servidor", () => {
  for (const f of ["src/lib/propostaServico.ts", "src/lib/propostaModelos.ts", "src/lib/schemas.ts", "src/lib/propostaMot.ts", "src/lib/propostaTs.ts"]) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /propostaPrefill|prefill/i, f);
  }
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
