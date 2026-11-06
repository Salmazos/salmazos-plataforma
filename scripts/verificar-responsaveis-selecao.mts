// Verificação dos responsáveis extras de seleção no Kanban (o projeto não tem runner de testes).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-responsaveis-selecao.mts
import assert from "node:assert/strict";
import {
  nomesResponsaveisCandidatoDaUnidade, nomesCompletosDaUnidade, responsaveisDaUnidade, opcoesResponsavel,
} from "@/lib/responsaveis";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const MM = "monte-mor-hortolandia";
const TRES = ["Beatriz Soares", "Victor Eduardo", "Susy Oliveira"];
const ATUAIS_MM = [
  "Giovanni Prado", "Rebecca Zambonini", "Andreza Salmazo", "Lucas Miguel",
  "Edivan Souza Silva", "Elizabete Salmazo", "Olver Pereira dos Santos",
];

await caso("Monte Mor: os 7 atuais + os 3 extras, nesta ordem", () => {
  assert.deepEqual(nomesResponsaveisCandidatoDaUnidade(MM), [...ATUAIS_MM, ...TRES]);
});
await caso("SBC: inalterado, sem os 3", () => {
  const sbc = nomesResponsaveisCandidatoDaUnidade("sbc");
  assert.deepEqual(sbc, nomesCompletosDaUnidade("sbc"));
  assert.deepEqual(sbc, ["Victor Eduardo Oliveira", "Susana Oliveira"]);
  for (const n of TRES) assert.ok(!sbc.includes(n), n);
});
await caso("nomesCompletosDaUnidade e responsaveisDaUnidade continuam sem os 3", () => {
  for (const slug of [MM, "sbc", null, undefined]) {
    for (const n of TRES) {
      assert.ok(!nomesCompletosDaUnidade(slug).includes(n), `${n} em nomesCompletos(${slug})`);
      assert.ok(!(responsaveisDaUnidade(slug) as string[]).includes(n), `${n} em responsaveis(${slug})`);
    }
  }
  assert.deepEqual(nomesCompletosDaUnidade(MM), ATUAIS_MM);
});
await caso("sem slug (null/undefined): todos os times + extras, sem duplicados", () => {
  for (const slug of [null, undefined]) {
    const l = nomesResponsaveisCandidatoDaUnidade(slug);
    assert.equal(new Set(l).size, l.length);
    for (const n of [...nomesCompletosDaUnidade(null), ...TRES]) assert.ok(l.includes(n), n);
    assert.equal(l.length, nomesCompletosDaUnidade(null).length + TRES.length);
  }
});
await caso("slug desconhecido: só o que a unidade já tinha (nada)", () => {
  assert.deepEqual(nomesResponsaveisCandidatoDaUnidade("xyz"), []);
});
await caso("opcoesResponsavel: logado Beatriz fica primeiro", () => {
  const o = opcoesResponsavel(nomesResponsaveisCandidatoDaUnidade(MM), "Beatriz Soares", null);
  assert.equal(o[0], "Beatriz Soares");
  assert.equal(o.length, 10);
  assert.equal(new Set(o).size, 10);
});
await caso("opcoesResponsavel: valor atual fora da lista é preservado", () => {
  const o = opcoesResponsavel(nomesResponsaveisCandidatoDaUnidade(MM), "Beatriz Soares", "Fulano Legado");
  assert.equal(o[0], "Beatriz Soares");
  assert.ok(o.includes("Fulano Legado"));
});

console.log(`\n${total} caso(s) OK`);
