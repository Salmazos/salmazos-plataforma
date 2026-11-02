// Verificação do campo "Dia(s) de teste" (admissao_dia_teste): criação pelo cliente, edição, decisão (cópia para
// candidatos_vagas), aviso por e-mail e campo vazio/ausente. Roda as rotas reais contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-dia-teste.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID } from "./harness-mot/ambiente-indicacao.mjs";
import { CAMPOS_ADMISSAO, ROTULO_CAMPO, campoDaAdmissao } from "../src/lib/indicacaoEdicao";
import { portalAvaliarSchema, portalIndicarCandidatoSchema, portalEditarIndicacaoSchema } from "../src/lib/schemas";

congelarData();
const criar = await importar("src/app/api/portal/indicar-candidato/route.ts");
const editar = await importar("src/app/api/portal/minhas-indicacoes/[id]/route.ts");
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const corpo = (extra = {}) => ({
  vaga_id: ID.V_MOT_A, candidato_nome: "Fulano de Tal", candidato_telefone: "(19) 90000-1111",
  admissao_data_inicio: "2026-11-10", admissao_salario: 1800, admissao_funcao: "Auxiliar", ...extra,
});
const sol = (db: any, id: string) => db.tabelas.solicitacoes_indicacao_candidato.find((s: any) => s.id === id);

await ok("schemas: aceitam texto, vazio, null e ausência (campo opcional)", () => {
  for (const s of [portalIndicarCandidatoSchema, portalAvaliarSchema]) {
    const base: any = s === portalAvaliarSchema ? { encaminhamento_id: "11111111-1111-4111-8111-111111111111", status: "aprovado", feedback_cliente: "ok" } : { vaga_id: ID.V_MOT_A, candidato_nome: "A", candidato_telefone: "1" };
    for (const v of ["05/11 e 06/11", "", null, undefined]) {
      const r = s.safeParse({ ...base, admissao_dia_teste: v });
      assert.equal(r.success, true, JSON.stringify(r));
    }
    assert.equal(s.safeParse(base).success, true);
  }
  assert.equal(portalEditarIndicacaoSchema.safeParse({ admissao_dia_teste: "05/11" }).success, true);
});
await ok("edição pelo cliente: campo é editável, tem rótulo e conta como dado de admissão", () => {
  assert.ok((CAMPOS_ADMISSAO as readonly string[]).includes("admissao_dia_teste"));
  assert.equal((ROTULO_CAMPO as Record<string, string>).admissao_dia_teste, "Dia(s) de teste");
  assert.equal(campoDaAdmissao("admissao_dia_teste"), true);
});
await ok("criação (indicação direta): grava o texto (com trim) na solicitação", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_dia_teste: "  05/11 e 06/11  " }) });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(db.tabelas.solicitacoes_indicacao_candidato.at(-1).admissao_dia_teste, "05/11 e 06/11");
});
await ok("criação sem o campo / vazio / só espaços: grava null e nada quebra", async () => {
  for (const extra of [{}, { admissao_dia_teste: "" }, { admissao_dia_teste: "   " }, { admissao_dia_teste: null }]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo(extra) });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(db.tabelas.solicitacoes_indicacao_candidato.at(-1).admissao_dia_teste, null);
  }
});
await ok("decisão (aprovar): copia o dia de teste da solicitação para candidatos_vagas e o e-mail ao RH mostra", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  sol(db, ID.S_PEND).admissao_dia_teste = "05/11 e 06/11";
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cvNovo.admissao_dia_teste, "05/11 e 06/11");
  const html = (db.emails ?? []).map((e: any) => e.html).join("\n");
  assert.match(html, /Dia\(s\) de teste/);
  assert.match(html, /05\/11 e 06\/11/);
});
await ok("decisão sem dia de teste: copia null e o e-mail não ganha a linha", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 200);
  const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cvNovo.admissao_dia_teste ?? null, null);
  assert.doesNotMatch((db.emails ?? []).map((e: any) => e.html).join("\n"), /Dia\(s\) de teste/);
});
await ok("edição pelo cliente em indicação aprovada: salva na solicitação e propaga para candidatos_vagas", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_APROV }, corpo: { admissao_dia_teste: "07/11" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(sol(db, ID.S_APROV).admissao_dia_teste, "07/11");
  assert.equal(db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).admissao_dia_teste, "07/11");
});
await ok("edição em indicação pendente: altera só a solicitação (sem candidatura)", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_dia_teste: "05/11" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(sol(db, ID.S_PEND).admissao_dia_teste, "05/11");
});

console.log(`\n${n} verificações OK`);
