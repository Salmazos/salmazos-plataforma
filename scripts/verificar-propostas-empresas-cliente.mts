// Verificação da busca de "Nova proposta" com CLIENTES sem Carteira e da rota que cria a empresa a partir do cliente (empresas/de-cliente).
// Sem banco real: tudo roda no banco em memória do harness, com dados ZZTEST. Nada toca o Supabase.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-empresas-cliente.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import * as rotaEmpresas from "@/app/api/comercial/propostas/empresas/route";
import * as rotaDeCliente from "@/app/api/comercial/propostas/empresas/de-cliente/route";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import { MSG_SEM_ACESSO_PROPOSTAS, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";
import { filtrarClientesSemCarteira, nomeNormalizado, ordenarPorAntiguidade } from "@/lib/propostaEmpresasCliente";
import { empresaDeClienteSchema } from "@/lib/schemas";
import { criarDb } from "./harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const uid = (k: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(k).padStart(12, "0")}`;
const U = uid(1), U2 = uid(2);
// Perfis: V vendedor com Funil; LIB liberado sem Funil; DIR diretoria SEM liberação (só lê); G superuser liberado (gestor que escreve, sem Funil);
// DIRL diretoria liberada com acesso a todas as unidades; SEM sem acesso; SEMUNI vendedor sem unidade; VSBC vendedor da outra unidade.
const V = uid(10), LIB = uid(11), DIR = uid(12), G = uid(13), DIRL = uid(14), SEM = uid(15), SEMUNI = uid(16), VSBC = uid(17);
const C_NOVO = uid(20), C_LIGADO = uid(21), C_OUTRA = uid(22), C_INATIVO = uid(23), C_TESTE = uid(24), C_NOME = uid(25), C_CURINGA = uid(26), C_SEM_CONTATO = uid(27), C_DECOY = uid(28);
const E_LIGADA = uid(30), E_TESTE = uid(31), E_MESMO_NOME = uid(32), E_SOLTA = uid(33);
const ANO = new Date().getFullYear();

const CLIENTES = () => [
  { id: C_NOVO, nome: "ZZTEST Cliente Novo", unidade_id: U, ativo: true, cidade: "Monte Mor", contato_nome: "Ana Contato", contato_telefone: "(19) 91111-2222", contato_email: "ana@zztest.com.br", cnpj: "11.222.333/0001-81" },
  { id: C_LIGADO, nome: "ZZTEST Cliente Ligado", unidade_id: U, ativo: true, cidade: "Campinas", contato_nome: "Beto", contato_telefone: "(19) 93333-4444", contato_email: "beto@zztest.com.br", cnpj: "22.333.444/0001-81" },
  { id: C_OUTRA, nome: "ZZTEST Cliente Outra Unidade", unidade_id: U2, ativo: true, cidade: "São Bernardo", contato_nome: "Carla", contato_telefone: "(11) 95555-6666", contato_email: "carla@zztest.com.br", cnpj: "33.444.555/0001-81" },
  { id: C_INATIVO, nome: "ZZTEST Cliente Inativo", unidade_id: U, ativo: false, cidade: "Hortolândia", contato_nome: "Davi", contato_telefone: "(19) 97777-8888", contato_email: "davi@zztest.com.br", cnpj: null },
  { id: C_TESTE, nome: "ZZTEST Cliente Com Empresa de Teste", unidade_id: U, ativo: true, cidade: "Sumaré", contato_nome: "Eva", contato_telefone: "(19) 99999-0000", contato_email: "eva@zztest.com.br", cnpj: null },
  { id: C_NOME, nome: "ZZTEST Mesmo Nome", unidade_id: U, ativo: true, cidade: "Monte Mor", contato_nome: "Fábio", contato_telefone: "(19) 90000-1111", contato_email: "fabio@zztest.com.br", cnpj: null },
  { id: C_CURINGA, nome: "ZZTEST 100%_x", unidade_id: U, ativo: true, cidade: "", contato_nome: "Gil", contato_telefone: "(19) 92222-3333", contato_email: "gil@zztest.com.br", cnpj: null },
  { id: C_DECOY, nome: "ZZTEST 100 aax", unidade_id: U, ativo: true, cidade: "Monte Mor", contato_nome: "Hugo", contato_telefone: "(19) 94444-5555", contato_email: "hugo@zztest.com.br", cnpj: null },
  { id: C_SEM_CONTATO, nome: "ZZTEST Sem Contato", unidade_id: U, ativo: true, cidade: "Monte Mor", contato_nome: "", contato_telefone: "", contato_email: "", cnpj: null },
];

function rpcCriarProposta(a: Record<string, unknown>, db: any) {
  const linha = { id: `p-${db.tabelas.propostas.length + 1}`, numero: `${a.p_sigla}-0001/26`, modelo: a.p_modelo, situacao: "rascunho", ...a, teste: false };
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}

function novoDb(extra: Record<string, unknown[]> = {}) {
  const perfil = (id: string, user: string, nome: string, extras: Record<string, unknown>) => ({ id, user_id: user, nome_completo: nome, email: `${user}@salmazos.com.br`, telefone: null, cargo: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true, ...extras });
  const db: any = criarDb({
    analistas_perfil: [
      perfil(V, "u-v", "Vendedor", { perfil_comercial: true }),
      perfil(LIB, "u-lib", "Selecionadora", {}),
      perfil(DIR, "u-dir", "Diretora", { nivel_acesso: "diretoria", acesso_todas_unidades: true }),
      perfil(G, "u-g", "Gestora Teste", { nivel_acesso: "superuser", acesso_todas_unidades: true }),
      perfil(DIRL, "u-dirl", "Diretor liberado", { nivel_acesso: "diretoria", acesso_todas_unidades: true }),
      perfil(SEM, "u-sem", "Sem acesso", {}),
      perfil(SEMUNI, "u-semuni", "Sem unidade", { perfil_comercial: true, unidade_id: null }),
      perfil(VSBC, "u-vsbc", "Vendedor SBC", { perfil_comercial: true, unidade_id: U2 }),
    ],
    usuario_acesso_customizado: [
      { analista_perfil_id: LIB, chave_aba: "comercial_propostas", liberado: true },
      { analista_perfil_id: G, chave_aba: "comercial_propostas", liberado: true },
      { analista_perfil_id: DIRL, chave_aba: "comercial_propostas", liberado: true },
    ],
    clientes: CLIENTES(),
    empresas_visitadas: [
      { id: E_SOLTA, nome: "ZZTEST Empresa Solta", cliente_id: null, unidade_id: U, created_at: "2026-01-01T00:00:00Z" },
      { id: E_LIGADA, nome: "ZZTEST Cliente Ligado", cliente_id: C_LIGADO, unidade_id: U, created_at: "2026-01-02T00:00:00Z" },
      { id: E_TESTE, nome: "ZZTEST Empresa de Teste", cliente_id: C_TESTE, unidade_id: U, created_at: "2026-01-03T00:00:00Z" },
      { id: E_MESMO_NOME, nome: "zztest mesmo nome ", cliente_id: null, unidade_id: U, created_at: "2026-01-04T00:00:00Z" },
    ],
    empresas_teste: [{ empresa_id: E_TESTE, marcado_por: G }],
    empresa_contatos: [{ id: uid(40), empresa_visitada_id: E_LIGADA, nome: "Contato da Carteira", cargo: null, principal: true }],
    oportunidades: [], lembretes: [], oportunidade_interacoes: [], propostas: [], proposta_historico: [], audit_logs: [],
    ...extra,
  });
  db.rpcs = { criar_proposta: rpcCriarProposta };
  return db;
}
type Chamada = { status: number; body: any };
async function chamar(db: any, usuario: string | null, fn: (...a: any[]) => Promise<Response>, { metodo = "GET", url = "http://x/api", corpo }: { metodo?: string; url?: string; corpo?: unknown } = {}): Promise<Chamada> {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: ["u-dir", "u-dirl", "u-g"].includes(usuario) ? (usuario === "u-g" ? "superuser" : "diretoria") : "analista" } } : null;
  globalThis.__DB__ = db;
  const req = Object.assign(new Request(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { nextUrl: new URL(url) });
  const r = await fn(req, { params: Promise.resolve({}) });
  return { status: r.status, body: await r.json() };
}
const buscar = (db: any, u: string | null, q = "") => chamar(db, u, rotaEmpresas.GET, { url: `http://x/api?q=${encodeURIComponent(q)}` });
const deCliente = (db: any, u: string | null, clienteId: unknown) => chamar(db, u, rotaDeCliente.POST, { metodo: "POST", corpo: { cliente_id: clienteId } });
const empresasDo = (db: any, clienteId: string) => db.tabelas.empresas_visitadas.filter((e: any) => e.cliente_id === clienteId);
const clientesDaBusca = (r: Chamada) => r.body.data.filter((x: any) => x.origem === "cliente");
const empresasDaBusca = (r: Chamada) => r.body.data.filter((x: any) => x.origem !== "cliente");
const TABELAS_FUNIL = ["oportunidades", "oportunidade_interacoes", "lembretes"];

// ── Busca ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("busca (vendedor): clientes sem Carteira aparecem DEPOIS da Carteira, só com origem/cliente_id/nome/cidade (sem id, contatos, CNPJ, telefone nem e-mail); a Carteira segue idêntica; nada é gravado", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas);
  db.consultas.length = 0;
  const r = await buscar(db, "u-v");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const carteira = empresasDaBusca(r);
  assert.deepEqual(carteira.map((e: any) => e.id), [E_LIGADA, E_MESMO_NOME, E_SOLTA].sort((a, b) => (db.tabelas.empresas_visitadas.find((e: any) => e.id === a).nome.toLowerCase() < db.tabelas.empresas_visitadas.find((e: any) => e.id === b).nome.toLowerCase() ? -1 : 1)), "só a Carteira da unidade, sem a de teste (vendedor)");
  for (const e of carteira) assert.deepEqual(Object.keys(e).sort(), ["contatos", "id", "nome", "oportunidade_aberta"], "itens da Carteira: mesmas chaves de sempre");
  const clientes = clientesDaBusca(r);
  assert.deepEqual(clientes.map((c: any) => c.cliente_id), [C_SEM_CONTATO, C_CURINGA, C_DECOY, C_NOVO].sort((a, b) => {
    const n = (id: string) => CLIENTES().find((c) => c.id === id)!.nome;
    return n(a) < n(b) ? -1 : 1;
  }));
  for (const c of clientes) assert.ok(["origem", "cliente_id", "nome", "cidade"].every((k) => k === "cidade" || k in c) && Object.keys(c).every((k) => ["origem", "cliente_id", "nome", "cidade"].includes(k)), JSON.stringify(c));
  const novo = clientes.find((c: any) => c.cliente_id === C_NOVO);
  assert.deepEqual(novo, { origem: "cliente", cliente_id: C_NOVO, nome: "ZZTEST Cliente Novo", cidade: "Monte Mor" });
  const json = JSON.stringify(r.body);
  for (const segredo of ["ana@zztest", "91111-2222", "11.222.333", "Ana Contato"]) assert.ok(!json.includes(segredo), `vazou ${segredo}`);
  assert.deepEqual(r.body.data.map((x: any) => x.origem === "cliente"), [...r.body.data].map((x: any) => x.origem === "cliente").sort((a: boolean, b: boolean) => Number(a) - Number(b)), "Carteira primeiro, clientes depois");
  assert.ok(!clientes.some((c: any) => c.cidade === ""), "cidade vazia não vai");
  assert.deepEqual(db.tabelas, antes, "a busca não grava nada");
  assert.deepEqual(db.consultas.filter((q: any) => q.op !== "select"), []);
});

await caso("busca: NÃO aparecem cliente já ligado, de outra unidade, inativo, com empresa de teste nem com empresa de mesmo nome sem vínculo (a empresa aparece pela Carteira)", async () => {
  const db = novoDb();
  const v = await buscar(db, "u-v");
  const ids = clientesDaBusca(v).map((c: any) => c.cliente_id);
  for (const fora of [C_LIGADO, C_OUTRA, C_INATIVO, C_TESTE, C_NOME]) assert.ok(!ids.includes(fora), `cliente ${fora} não deveria aparecer`);
  assert.ok(empresasDaBusca(v).some((e: any) => e.id === E_MESMO_NOME), "a empresa de mesmo nome aparece pela Carteira");
  assert.ok(empresasDaBusca(v).some((e: any) => e.id === E_LIGADA));
  // Vendedor: empresa de teste fora da busca; o cliente dela NÃO vira "sem Carteira".
  assert.ok(!empresasDaBusca(v).some((e: any) => e.id === E_TESTE));
  assert.ok(!JSON.stringify(v.body).includes("Empresa de Teste") && !JSON.stringify(v.body).includes("Com Empresa de Teste"));
  // Gestor: vê a empresa de teste pela Carteira (teste:true) e continua sem ver o cliente como "sem Carteira".
  const g = await buscar(db, "u-g");
  assert.equal(g.status, 200);
  assert.equal(empresasDaBusca(g).find((e: any) => e.id === E_TESTE).teste, true);
  assert.ok(!clientesDaBusca(g).some((c: any) => c.cliente_id === C_TESTE));
  assert.equal(empresasDaBusca(g).find((e: any) => e.id === E_SOLTA).teste, false);
});

await caso("busca: q filtra por nome sem diferenciar maiúscula; % e _ digitados são LITERAIS; limite de 20 clientes; só a unidade do usuário (acesso a todas é ignorado)", async () => {
  const db = novoDb();
  assert.deepEqual(clientesDaBusca(await buscar(db, "u-v", "ZZTEST CLIENTE NOVO")).map((c: any) => c.cliente_id), [C_NOVO]);
  assert.deepEqual(clientesDaBusca(await buscar(db, "u-v", "100%")).map((c: any) => c.cliente_id), [C_CURINGA], "% literal: não casa 'ZZTEST 100 aax'");
  assert.deepEqual(clientesDaBusca(await buscar(db, "u-v", "100%_")).map((c: any) => c.cliente_id), [C_CURINGA]);
  assert.deepEqual(clientesDaBusca(await buscar(db, "u-v", "100_")).map((c: any) => c.cliente_id), [], "_ literal");
  assert.deepEqual((await buscar(db, "u-v", "%")).body.data.map((x: any) => x.cliente_id ?? x.id), [C_CURINGA], "'%' sozinho só casa nomes que TÊM '%'");
  assert.deepEqual((await buscar(db, "u-v", "zzz-nada")).body.data, []);
  // 25 clientes sem Carteira: devolve só 20.
  for (let i = 0; i < 25; i++) db.tabelas.clientes.push({ id: uid(100 + i), nome: `ZZTEST Lote ${String(i).padStart(2, "0")}`, unidade_id: U, ativo: true, cidade: "X", contato_nome: "", contato_telefone: "", contato_email: "" });
  assert.equal(clientesDaBusca(await buscar(db, "u-v", "ZZTEST Lote")).length, 20);
  // Acesso a todas as unidades NÃO mistura clientes de outra unidade.
  const dirl = await buscar(db, "u-dirl");
  assert.ok(!clientesDaBusca(dirl).some((c: any) => c.cliente_id === C_OUTRA));
  // A outra unidade vê só os clientes dela.
  const sbc = await buscar(db, "u-vsbc");
  assert.deepEqual(clientesDaBusca(sbc).map((c: any) => c.cliente_id), [C_OUTRA]);
});

await caso("busca: sem Funil (liberado) o item de cliente é igual; sem unidade definida a lista é vazia; falha ao ler clientes/empresas devolve erro, nunca lista incompleta", async () => {
  const db = novoDb();
  const r = await buscar(db, "u-lib");
  assert.equal(r.status, 200);
  assert.ok(clientesDaBusca(r).some((c: any) => c.cliente_id === C_NOVO));
  assert.deepEqual(empresasDaBusca(r).map((e: any) => Object.keys(e).sort()).find(() => true), ["contatos", "id", "nome"], "sem oportunidade_aberta");
  assert.deepEqual((await buscar(db, "u-semuni")).body.data, []);
  db.falhas["clientes.select"] = "boom";
  const f = await buscar(db, "u-v");
  assert.equal(f.status, 500);
  assert.ok(!("data" in f.body));
  delete db.falhas["clientes.select"];
});

await caso("filtrarClientesSemCarteira / nomeNormalizado / ordenarPorAntiguidade: regras puras", () => {
  assert.equal(nomeNormalizado("  ABC Ltda "), "abc ltda");
  const cl = [{ id: "1", nome: "Alfa" }, { id: "2", nome: "Beta" }, { id: "3", nome: "Gama" }];
  assert.deepEqual(filtrarClientesSemCarteira(cl, [{ id: "e1", nome: "Outro", cliente_id: "1" }, { id: "e2", nome: " BETA", cliente_id: null }]).map((c) => c.id), ["3"]);
  assert.deepEqual(filtrarClientesSemCarteira(cl, []).map((c) => c.id), ["1", "2", "3"]);
  assert.equal(filtrarClientesSemCarteira([{ id: "9", nome: "Alfa Ltda" }], [{ id: "e", nome: "Alfa", cliente_id: null }]).length, 1, "nome só PARECIDO não esconde o cliente");
  const l = [{ id: "b", created_at: "2026-01-02" }, { id: "a", created_at: "2026-01-02" }, { id: "z", created_at: null }, { id: "c", created_at: "2026-01-01" }];
  assert.deepEqual([...l].sort(ordenarPorAntiguidade).map((x) => x.id), ["c", "a", "b", "z"], "created_at, depois id; sem created_at é a mais nova");
});

// ── Criação a partir do cliente ───────────────────────────────────────────────────────────────────────────────────────────────

await caso("escolher cliente sem Carteira (vendedor com Funil): 201, empresa criada ligada ao cliente, contato principal copiado, cidade copiada, sem oportunidade; a proposta segue; o cliente some da busca", async () => {
  const db = novoDb();
  const antesFunil = structuredClone(TABELAS_FUNIL.map((t) => db.tabelas[t]));
  const empresasAntes = db.tabelas.empresas_visitadas.length;
  db.consultas.length = 0;
  const r = await deCliente(db, "u-v", C_NOVO);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body.data).sort(), ["cliente_id", "contatos", "id", "nome", "oportunidade_aberta"], "vendedor com Funil: oportunidade_aberta null; sem teste");
  assert.equal(r.body.data.nome, "ZZTEST Cliente Novo");
  assert.equal(r.body.data.cliente_id, C_NOVO);
  assert.equal(r.body.data.oportunidade_aberta, null);
  assert.equal(db.tabelas.empresas_visitadas.length, empresasAntes + 1, "só UMA empresa criada");
  const emp = db.tabelas.empresas_visitadas.find((e: any) => e.id === r.body.data.id);
  assert.equal(emp.unidade_id, U);
  assert.equal(emp.cliente_id, C_NOVO);
  assert.equal(emp.cidade, "Monte Mor");
  assert.equal(emp.total_visitas, 0);
  assert.equal(emp.ultimo_visitante_id, null);
  assert.equal(emp.created_by, "u-v");
  assert.equal(emp.primeira_visita_em, emp.ultima_visita_em);
  assert.ok(!Number.isNaN(Date.parse(emp.primeira_visita_em)));
  // Contato do cliente como principal.
  assert.equal(r.body.data.contatos.length, 1);
  assert.deepEqual({ nome: r.body.data.contatos[0].nome, principal: r.body.data.contatos[0].principal }, { nome: "Ana Contato", principal: true });
  const ct = db.tabelas.empresa_contatos.filter((c: any) => c.empresa_visitada_id === emp.id);
  assert.equal(ct.length, 1);
  assert.deepEqual({ nome: ct[0].nome, telefone: ct[0].telefone, email: ct[0].email, principal: ct[0].principal, unidade_id: ct[0].unidade_id, criado_por: ct[0].criado_por }, { nome: "Ana Contato", telefone: "(19) 91111-2222", email: "ana@zztest.com.br", principal: true, unidade_id: U, criado_por: V });
  assert.deepEqual(Object.keys(r.body.data.contatos[0]).sort(), ["cargo", "id", "nome", "principal"], "a resposta não traz telefone nem e-mail");
  // Sem Funil: nenhuma consulta de escrita nas tabelas do Funil; nenhuma oportunidade.
  assert.deepEqual(db.consultas.filter((q: any) => TABELAS_FUNIL.includes(q.tabela) && q.op !== "select"), []);
  assert.deepEqual(TABELAS_FUNIL.map((t) => db.tabelas[t]), antesFunil);
  // Auditoria: sem telefone, e-mail nem CNPJ.
  assert.equal(db.tabelas.audit_logs.length, 1);
  const a = db.tabelas.audit_logs[0];
  assert.deepEqual({ acao: a.acao, entidade: a.entidade, entidade_id: a.entidade_id, usuario_id: a.usuario_id, unidade_id: a.unidade_id }, { acao: "empresa_criada_via_proposta", entidade: "empresas_visitadas", entidade_id: emp.id, usuario_id: "u-v", unidade_id: U });
  assert.deepEqual(a.detalhes, { origem: "cliente", cliente_id: C_NOVO, nome: "ZZTEST Cliente Novo", com_contato: true });
  for (const segredo of ["ana@zztest", "91111", "11.222.333"]) assert.ok(!JSON.stringify(a).includes(segredo), `auditoria vazou ${segredo}`);
  // O cliente some da busca e a empresa aparece pela Carteira.
  const busca = await buscar(db, "u-v", "ZZTEST Cliente Novo");
  assert.deepEqual(clientesDaBusca(busca), []);
  assert.deepEqual(empresasDaBusca(busca).map((e: any) => e.id), [emp.id]);
  // A proposta segue normalmente com a empresa criada (aos_cuidados = contato principal, via contato_id).
  const prop = await chamar(db, "u-v", rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: emp.id, contato_id: ct[0].id } });
  assert.equal(prop.status, 201, JSON.stringify(prop.body));
  assert.equal(prop.body.data.p_empresa_visitada_id, emp.id);
  assert.equal(prop.body.data.p_cliente_nome, "ZZTEST Cliente Novo");
  assert.equal(prop.body.data.p_aos_cuidados, "Ana Contato");
});

await caso("idempotência: escolher de novo devolve a MESMA empresa com 200, sem duplicar, sem novo contato e sem nova auditoria", async () => {
  const db = novoDb();
  const a = await deCliente(db, "u-v", C_NOVO);
  const b = await deCliente(db, "u-v", C_NOVO);
  const c = await deCliente(db, "u-lib", C_NOVO);
  assert.deepEqual([a.status, b.status, c.status], [201, 200, 200]);
  assert.equal(b.body.data.id, a.body.data.id);
  assert.equal(c.body.data.id, a.body.data.id);
  assert.equal(empresasDo(db, C_NOVO).length, 1);
  assert.equal(db.tabelas.empresa_contatos.filter((x: any) => x.empresa_visitada_id === a.body.data.id).length, 1);
  assert.equal(b.body.data.contatos[0].nome, "Ana Contato");
  assert.equal(db.tabelas.audit_logs.length, 1);
  assert.deepEqual(Object.keys(c.body.data).sort(), ["cliente_id", "contatos", "id", "nome"], "sem Funil: sem oportunidade_aberta");
});

await caso("cliente que já tem empresa (ligada por cliente_id): 200 com a existente, nada criado, nada alterado", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas.empresas_visitadas);
  const r = await deCliente(db, "u-v", C_LIGADO);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.id, E_LIGADA);
  assert.equal(r.body.data.contatos[0].nome, "Contato da Carteira");
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  assert.equal(db.tabelas.audit_logs.length, 0);
});

await caso("dois cliques simultâneos: uma única empresa e um único contato; uma resposta 201 e a outra 200 com o mesmo id", async () => {
  const db = novoDb();
  const [a, b] = await Promise.all([deCliente(db, "u-v", C_NOVO), deCliente(db, "u-v", C_NOVO)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201], JSON.stringify([a.body, b.body]));
  assert.equal(a.body.data.id, b.body.data.id);
  assert.equal(empresasDo(db, C_NOVO).length, 1);
  assert.equal(db.tabelas.empresa_contatos.filter((x: any) => x.empresa_visitada_id === a.body.data.id).length, 1);
  assert.equal(db.tabelas.audit_logs.length, 1);
});

await caso("COMPENSAÇÃO: se existir OUTRA empresa MAIS ANTIGA do cliente depois do insert, só a que esta chamada criou é apagada (id exato); a mais antiga fica intacta e é devolvida com 200", async () => {
  const db = novoDb();
  const MAIS_ANTIGA = { id: uid(50), nome: "ZZTEST Cliente Novo", cliente_id: C_NOVO, unidade_id: U, created_at: "2026-02-01T00:00:00Z", total_visitas: 7 };
  // Outra pessoa insere logo ANTES do nosso insert (depois da nossa verificação inicial): simula a corrida.
  db.ganchos = { "empresas_visitadas.insert": async () => { db.tabelas.empresas_visitadas.push(structuredClone(MAIS_ANTIGA)); } };
  const antesOutras = structuredClone(db.tabelas.empresas_visitadas);
  db.consultas.length = 0;
  const r = await deCliente(db, "u-v", C_NOVO);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.id, MAIS_ANTIGA.id, "devolve a mais antiga");
  const doCliente = empresasDo(db, C_NOVO);
  assert.equal(doCliente.length, 1);
  assert.deepEqual(doCliente[0], MAIS_ANTIGA, "a mais antiga não foi tocada");
  assert.deepEqual(db.tabelas.empresas_visitadas.filter((e: any) => e.id !== MAIS_ANTIGA.id), antesOutras, "nada que já existia foi apagado");
  const apagados = db.consultas.filter((q: any) => q.op === "delete");
  assert.deepEqual(apagados, [{ tabela: "empresas_visitadas", op: "delete" }], "um único delete, em empresas_visitadas");
  assert.equal(db.tabelas.empresa_contatos.filter((c: any) => c.nome === "Ana Contato").length, 0, "o contato só é copiado para a empresa que FICA (e ela já existia sem ele)");
  assert.equal(db.tabelas.audit_logs.length, 0, "quem perdeu não audita");
});

await caso("COMPENSAÇÃO (inversa): se a empresa criada por esta chamada é a MAIS ANTIGA, ela fica (com contato e auditoria) e a outra, mais nova, NÃO é apagada por esta chamada", async () => {
  const db = novoDb();
  const MAIS_NOVA = { id: uid(51), nome: "ZZTEST Cliente Novo", cliente_id: C_NOVO, unidade_id: U, created_at: "2099-01-01T00:00:00Z" };
  // O banco real dá created_at = now() ao insert; no memdb o gancho do select seguinte carimba a nossa linha e traz a concorrente mais nova.
  db.ganchos = { "empresas_visitadas.insert": async () => { db.ganchos = { "empresas_visitadas.select": async () => {
    const nossa = db.tabelas.empresas_visitadas.find((e: any) => e.cliente_id === C_NOVO && !e.created_at);
    nossa.created_at = "2026-11-25T10:00:00Z";
    db.tabelas.empresas_visitadas.push(structuredClone(MAIS_NOVA));
  } }; } };
  db.consultas.length = 0;
  const r = await deCliente(db, "u-v", C_NOVO);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.notEqual(r.body.data.id, MAIS_NOVA.id);
  assert.ok(empresasDo(db, C_NOVO).some((e: any) => e.id === MAIS_NOVA.id), "a concorrente mais nova não é apagada por nós");
  assert.deepEqual(db.consultas.filter((q: any) => q.op === "delete"), []);
  assert.equal(db.tabelas.empresa_contatos.filter((c: any) => c.empresa_visitada_id === r.body.data.id).length, 1);
  assert.equal(db.tabelas.audit_logs.length, 1);
});

await caso("regras: cliente de outra unidade 404; inativo 409; inexistente 404; id inválido 400; corpo vazio 400 — nada criado em nenhum", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas.empresas_visitadas);
  const outra = await deCliente(db, "u-v", C_OUTRA);
  assert.equal(outra.status, 404); assert.equal(outra.body.error, "Cliente não encontrado.");
  const dirl = await deCliente(db, "u-dirl", C_OUTRA);
  assert.equal(dirl.status, 404, "acesso a todas as unidades é ignorado");
  assert.equal((await deCliente(db, "u-v", C_INATIVO)).status, 409);
  assert.match((await deCliente(db, "u-v", C_INATIVO)).body.error, /inativo/);
  assert.equal((await deCliente(db, "u-v", uid(999))).status, 404);
  for (const ruim of ["abc", "", null, 123, undefined]) assert.equal((await deCliente(db, "u-v", ruim)).status, 400, String(ruim));
  assert.equal((await chamar(db, "u-v", rotaDeCliente.POST, { metodo: "POST" })).status, 400);
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  assert.equal(db.tabelas.audit_logs.length, 0);
  // A outra unidade cria a do seu cliente.
  const sbc = await deCliente(db, "u-vsbc", C_OUTRA);
  assert.equal(sbc.status, 201);
  assert.equal(db.tabelas.empresas_visitadas.find((e: any) => e.id === sbc.body.data.id).unidade_id, U2);
});

await caso("cliente com empresa de MESMO NOME sem vínculo: 409 orientando a escolher a da Carteira; nunca liga em silêncio; nada criado", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas.empresas_visitadas);
  const r = await deCliente(db, "u-v", C_NOME);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Escolha a empresa da Carteira/);
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  assert.equal(db.tabelas.empresas_visitadas.find((e: any) => e.id === E_MESMO_NOME).cliente_id, null, "empresa continua sem vínculo");
  assert.equal(db.tabelas.audit_logs.length, 0);
});

await caso("cliente cuja empresa é de TESTE: vendedor recebe 404 (e nada é criado); gestor recebe 200 com a empresa e teste:true; empresa recém-criada traz teste:false para o gestor e nunca nasce de teste", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas.empresas_visitadas);
  const v = await deCliente(db, "u-v", C_TESTE);
  assert.equal(v.status, 404); assert.equal(v.body.error, "Cliente não encontrado.");
  assert.ok(!JSON.stringify(v.body).includes("Teste"), "não revela a empresa de teste");
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  const g = await deCliente(db, "u-g", C_TESTE);
  assert.equal(g.status, 200);
  assert.equal(g.body.data.id, E_TESTE);
  assert.equal(g.body.data.teste, true);
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  // Empresa nova (gestor): teste:false, não marcada em empresas_teste; sem Funil (gestor liberado) → sem oportunidade_aberta.
  const nova = await deCliente(db, "u-g", C_NOVO);
  assert.equal(nova.status, 201);
  assert.equal(nova.body.data.teste, false);
  assert.ok(!db.tabelas.empresas_teste.some((t: any) => t.empresa_id === nova.body.data.id));
  assert.ok(!("oportunidade_aberta" in nova.body.data));
  // Vendedor comum nunca recebe a chave `teste`.
  const v2 = await deCliente(db, "u-v", C_SEM_CONTATO);
  assert.ok(!("teste" in v2.body.data));
});

await caso("contato: cliente sem nome de contato cria a empresa sem contato; falha ao gravar o contato NÃO derruba a criação (201, empresa existe, contatos vazios)", async () => {
  const db = novoDb();
  const sem = await deCliente(db, "u-v", C_SEM_CONTATO);
  assert.equal(sem.status, 201);
  assert.deepEqual(sem.body.data.contatos, []);
  assert.equal(db.tabelas.audit_logs[0].detalhes.com_contato, false);
  assert.equal(db.tabelas.empresa_contatos.filter((c: any) => c.empresa_visitada_id === sem.body.data.id).length, 0);
  assert.equal(db.tabelas.empresas_visitadas.find((e: any) => e.id === sem.body.data.id).cidade, "Monte Mor");
  db.falhas["empresa_contatos.insert"] = "boom";
  const falha = await deCliente(db, "u-v", C_NOVO);
  assert.equal(falha.status, 201, JSON.stringify(falha.body));
  assert.deepEqual(falha.body.data.contatos, []);
  assert.equal(empresasDo(db, C_NOVO).length, 1);
  assert.equal(db.tabelas.audit_logs[1].detalhes.com_contato, false);
  // cidade vazia no cliente vira null (nunca string vazia).
  delete db.falhas["empresa_contatos.insert"];
  const curinga = await deCliente(db, "u-v", C_CURINGA);
  assert.equal(db.tabelas.empresas_visitadas.find((e: any) => e.id === curinga.body.data.id).cidade, null);
});

await caso("falhas: erro ao ler cliente, empresas de teste, Carteira ou ao inserir → 500 com mensagem e NADA criado", async () => {
  for (const chave of ["clientes.select", "empresas_teste.select", "empresas_visitadas.select", "empresas_visitadas.insert"]) {
    const db = novoDb();
    const antes = structuredClone(db.tabelas.empresas_visitadas);
    db.falhas[chave] = "boom";
    const r = await deCliente(db, "u-v", C_NOVO);
    assert.equal(r.status, 500, chave);
    assert.match(r.body.error, /Nada foi criado|Não foi possível/, chave);
    assert.ok(!JSON.stringify(r.body).includes("boom"), "sem detalhe interno");
    assert.deepEqual(db.tabelas.empresas_visitadas, antes, chave);
    assert.equal(db.tabelas.audit_logs.length, 0);
  }
});

// ── Acesso ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("matriz de acesso: sem login 401; sem acesso 403; só leitura (diretoria sem liberação) 403 na busca e na criação; sem unidade 400 na criação; nada criado", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas.empresas_visitadas);
  const chamadas: [string, (u: string | null) => Promise<Chamada>][] = [
    ["busca GET", (u) => buscar(db, u)],
    ["de-cliente POST", (u) => deCliente(db, u, C_NOVO)],
  ];
  for (const [nome, rodar] of chamadas) {
    assert.equal((await rodar(null)).status, 401, `${nome} sem login`);
    const sem = await rodar("u-sem");
    assert.equal(sem.status, 403, nome); assert.equal(sem.body.error, MSG_SEM_ACESSO_PROPOSTAS, nome);
    const dir = await rodar("u-dir");
    assert.equal(dir.status, 403, `${nome} só leitura`); assert.equal(dir.body.error, MSG_SO_ACOMPANHA_PROPOSTAS, nome);
  }
  const semUnidade = await deCliente(db, "u-semuni", C_NOVO);
  assert.equal(semUnidade.status, 400);
  assert.deepEqual(db.tabelas.empresas_visitadas, antes);
  assert.equal(db.tabelas.audit_logs.length, 0);
  // Quem escreve (vendedor, liberado, gestor liberado, diretoria liberada) cria.
  for (const [u, cliente] of [["u-lib", C_NOVO], ["u-g", C_SEM_CONTATO], ["u-dirl", C_CURINGA]] as const) assert.equal((await deCliente(db, u, cliente)).status, 201, u);
});

await caso("schema do corpo: só cliente_id (uuid); campos extras (nome, unidade, cliente) são ignorados — o servidor lê tudo do cadastro do cliente", async () => {
  assert.equal(empresaDeClienteSchema.safeParse({ cliente_id: C_NOVO }).success, true);
  assert.equal(empresaDeClienteSchema.safeParse({}).success, false);
  assert.equal(empresaDeClienteSchema.safeParse({ cliente_id: "x" }).success, false);
  const db = novoDb();
  const r = await chamar(db, "u-v", rotaDeCliente.POST, { metodo: "POST", corpo: { cliente_id: C_NOVO, nome: "Forjado", unidade_id: U2, cliente_nome: "Outro" } });
  assert.equal(r.status, 201);
  const emp = db.tabelas.empresas_visitadas.find((e: any) => e.id === r.body.data.id);
  assert.equal(emp.nome, "ZZTEST Cliente Novo");
  assert.equal(emp.unidade_id, U);
});

await caso("a rota nova e o helper não tocam em Funil, MOT/TS, PDF nem nos arquivos proibidos; nada é carregado em massa", () => {
  const rota = fs.readFileSync("src/app/api/comercial/propostas/empresas/de-cliente/route.ts", "utf8");
  const helper = fs.readFileSync("src/lib/propostaEmpresasCliente.ts", "utf8");
  for (const f of [rota, helper]) {
    assert.doesNotMatch(f, /from "@\/lib\/propostaServico"|propostaMot|propostaTs|propostaPdf|oportunidadeEtapa|carteiraClientes|\.from\("oportunidades"\)\s*\.(insert|update|delete)|\.from\("lembretes"\)/);
  }
  assert.doesNotMatch(rota, /\.upsert\(|\.update\(/);
  assert.equal((rota.match(/\.delete\(\)/g) ?? []).length, 1, "um único delete, só da linha criada por esta chamada");
  assert.match(rota, /\.delete\(\)\.eq\("id", criada\.id\)/, "o delete é por id exato da linha criada nesta execução");
  assert.equal((rota.match(/\.insert\(/g) ?? []).length, 2, "só empresa e contato");
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
