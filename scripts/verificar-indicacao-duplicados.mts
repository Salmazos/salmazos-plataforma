// Verificação das tarefas de decisão da indicação direta: duplicado (telefone), sino lido e UNIQUE (vaga_id, candidato_id).
// Roda as rotas reais contra o banco em memória do harness (o projeto não tem runner de testes).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-indicacao-duplicados.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, auditoria } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID } from "./harness-mot/ambiente-indicacao.mjs";
import { avaliarDuplicidade, variantesTelefone } from "../src/lib/indicacaoDuplicados";

congelarData();
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");
const buscar = await importar("src/app/api/solicitacoes-indicacao-candidato/buscar-duplicados/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const TEL_PEND = "(19) 98765-4321"; // telefone da indicação S_PEND
const DUP = "dddddddd-0000-4000-8000-000000000001";
const DUP2 = "dddddddd-0000-4000-8000-000000000002";

// Cenário base: candidato já cadastrado com o MESMO telefone da indicação + sinos da indicação (e de outra).
function cenario({ dupNaVaga = false } = {}) {
  const db = novoDbIndicacao(); logar(db, "dir");
  db.tabelas.candidatos.push({ id: DUP, nome_completo: "Maria de Souza", telefone: TEL_PEND, cpf: "123.456.789-00", origem: "cadastro_rapido", etapa_kanban: "banco_talentos" });
  if (dupNaVaga) db.tabelas.candidatos_vagas.push({ id: "cv-dup", candidato_id: DUP, vaga_id: ID.V_MOT_A, cliente_id: "C1", etapa: "triagem" });
  db.tabelas.notificacoes_analista = [
    { id: "n1", solicitacao_indicacao_id: ID.S_PEND, lida: false },
    { id: "n2", solicitacao_indicacao_id: ID.S_PEND, lida: false },
    { id: "n3", solicitacao_indicacao_id: ID.S_IRMA, lida: false },
  ];
  return db;
}
const aprovar = (id: string, corpo: Record<string, unknown> = {}) => chamar(decisao.POST, { metodo: "POST", params: { id }, corpo: { acao: "aprovar", ...corpo } });
const sol = (db: any, id: string) => db.tabelas.solicitacoes_indicacao_candidato.find((s: any) => s.id === id);
const lidas = (db: any) => Object.fromEntries(db.tabelas.notificacoes_analista.map((x: any) => [x.id, x.lida]));

// ── 1) regras puras ──
await ok("variantesTelefone: 11 dígitos, 10 dígitos e curto/vazio", () => {
  assert.deepEqual(variantesTelefone("19987654321"), ["(19) 98765-4321"]);
  assert.equal(variantesTelefone("(19) 3456-7890").length, 2);
  assert.deepEqual(variantesTelefone("12345"), []);
  assert.deepEqual(variantesTelefone(null), []);
});
await ok("avaliarDuplicidade: sem duplicado libera; com duplicado e sem escolha bloqueia 409", () => {
  assert.equal(avaliarDuplicidade({ duplicados: [] }).ok, true);
  const d = [{ candidato_id: DUP, candidato_nome: "x", etapa_kanban: "x", criterio: "Telefone" }];
  const r = avaliarDuplicidade({ duplicados: d });
  assert.deepEqual(r.ok === false && [r.status, r.codigo], [409, "duplicado_exige_decisao"]);
  assert.equal(avaliarDuplicidade({ duplicados: d, confirmarCriarNovo: true }).ok, true);
  assert.equal(avaliarDuplicidade({ duplicados: d, candidatoExistenteId: DUP }).ok, true);
  assert.equal(avaliarDuplicidade({ duplicados: d, candidatoExistenteId: DUP, confirmarCriarNovo: true }).ok === false, true);
});

// ── 2) servidor: telefone repetido nunca decide sozinho ──
await ok("aprovar sem escolha com telefone repetido: 409, nada criado, indicação segue pendente, sinos intactos", async () => {
  const db = cenario();
  const antes = db.tabelas.candidatos.length;
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 409);
  assert.equal(r.corpo.codigo, "duplicado_exige_decisao");
  assert.deepEqual(r.corpo.duplicados.map((d: any) => d.candidato_id), [DUP]);
  assert.equal(db.tabelas.candidatos.length, antes);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
  assert.deepEqual(lidas(db), { n1: false, n2: false, n3: false });
});
await ok("vincular ao existente: 200, NÃO cria candidato, cria só candidatos_vagas, sino da indicação lido", async () => {
  const db = cenario();
  const antes = db.tabelas.candidatos.length;
  const r = await aprovar(ID.S_PEND, { candidato_existente_id: DUP });
  assert.equal(r.status, 200);
  assert.equal(db.tabelas.candidatos.length, antes);
  assert.equal(r.corpo.candidato_id, DUP);
  assert.equal(db.tabelas.candidatos_vagas.filter((c: any) => c.candidato_id === DUP && c.vaga_id === ID.V_MOT_A).length, 1);
  assert.equal(sol(db, ID.S_PEND).status, "aprovada");
  assert.deepEqual(lidas(db), { n1: true, n2: true, n3: false });
});
await ok("criar novo com confirmação explícita: 200, cria candidato e audita o override com os ids ignorados", async () => {
  const db = cenario();
  const antes = db.tabelas.candidatos.length;
  const r = await aprovar(ID.S_PEND, { confirmar_criar_novo: true });
  assert.equal(r.status, 200);
  assert.equal(db.tabelas.candidatos.length, antes + 1);
  const a = auditoria(db).find((x: any) => x.acao === "indicacao_candidato_aprovada");
  assert.equal(a.detalhes.criado_novo_apesar_de_duplicado, true);
  assert.deepEqual(a.detalhes.duplicados_ignorados, [DUP]);
});
await ok("vincular E criar novo ao mesmo tempo: 400", async () => {
  const db = cenario();
  const r = await aprovar(ID.S_PEND, { candidato_existente_id: DUP, confirmar_criar_novo: true });
  assert.equal(r.status, 400);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
});
await ok("sem match: fluxo atual (cria candidato, 200) sem precisar de confirmação", async () => {
  const db = cenario();
  db.tabelas.candidatos = db.tabelas.candidatos.filter((c: any) => c.id !== DUP);
  const antes = db.tabelas.candidatos.length;
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200);
  assert.equal(db.tabelas.candidatos.length, antes + 1);
  const a = auditoria(db).find((x: any) => x.acao === "indicacao_candidato_aprovada");
  assert.equal(a.detalhes.criado_novo_apesar_de_duplicado, false);
});
await ok("vincular a candidato que já está NESTA vaga (UNIQUE vaga_id+candidato_id): 409 e nada criado", async () => {
  const db = cenario({ dupNaVaga: true });
  const cvs = db.tabelas.candidatos_vagas.length;
  const r = await aprovar(ID.S_PEND, { candidato_existente_id: DUP });
  assert.equal(r.status, 409);
  assert.equal(db.tabelas.candidatos_vagas.length, cvs);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
  assert.deepEqual(lidas(db), { n1: false, n2: false, n3: false });
});
await ok("buscar-duplicados (GET) continua devolvendo o mesmo candidato por telefone", async () => {
  const db = cenario(); void db;
  const r = await chamar(buscar.GET, { url: `http://t/api?indicacao_id=${ID.S_PEND}` });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.duplicados.map((d: any) => [d.candidato_id, d.criterio]), [[DUP, "Telefone"]]);
});

// ── 3) sino lido ──
await ok("recusar: marca só os sinos DESTA indicação como lidos", async () => {
  const db = cenario();
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "recusar", motivo: "Sem perfil" } });
  assert.equal(r.status, 200);
  assert.deepEqual(lidas(db), { n1: true, n2: true, n3: false });
});
await ok("falha ao marcar sino NÃO derruba a decisão (aprovar e recusar): decisão gravada, resposta 200", async () => {
  for (const corpo of [{ acao: "recusar", motivo: "x" }, { acao: "aprovar", candidato_existente_id: DUP }]) {
    const db = cenario();
    // Tabela ausente faz o update de notificações falhar/lançar no banco em memória.
    delete db.tabelas.notificacoes_analista;
    const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.notEqual(sol(db, ID.S_PEND).status, "pendente");
  }
});
await ok("decisão rejeitada (409 de duplicado) não marca sino como lido", async () => {
  const db = cenario();
  await aprovar(ID.S_PEND);
  assert.equal(lidas(db).n1, false);
});

console.log(`\n${n} verificações OK`);
