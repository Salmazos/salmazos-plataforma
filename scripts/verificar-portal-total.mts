// Verificação do card "Total" do Início do Portal do Cliente (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-portal-total.mts
import assert from "node:assert/strict";
import { resumirPortal } from "../src/lib/portalResumo.ts";

let total = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message}`); process.exitCode = 1; }
}

// Contagem do código antigo (main): Total = emAvaliacao + TODOS os encaminhamentos.
function antigo(emTriagem: number, status: string[]) {
  return {
    total: emTriagem + status.length,
    emTriagem,
    aguardando: status.filter((s) => s === "aguardando" || s === "aguardando_agendamento_cliente").length,
    aprovados: status.filter((s) => s === "aprovado").length,
    reprovados: status.filter((s) => s === "reprovado").length,
  };
}

const TODOS = ["aguardando", "aguardando_agendamento_cliente", "aprovado", "reprovado", "desistiu"];

caso("caso real: aguardando 2 + aprovado 1 + desistiu 1 → Total 3, cards 0/2/1/0", () => {
  const r = resumirPortal(0, ["aguardando", "aguardando", "aprovado", "desistiu"]);
  assert.deepEqual(r, { total: 3, emTriagem: 0, aguardando: 2, aprovados: 1, reprovados: 0 });
  assert.equal(antigo(0, ["aguardando", "aguardando", "aprovado", "desistiu"]).total, 4);
});
caso("todos os status conhecidos (1 de cada + 2 em triagem)", () => {
  const r = resumirPortal(2, TODOS);
  assert.deepEqual(r, { total: 6, emTriagem: 2, aguardando: 2, aprovados: 1, reprovados: 1 });
});
caso("lista vazia", () => assert.equal(resumirPortal(0, []).total, 0));
caso("só desistiu → Total 0", () => {
  const r = resumirPortal(0, ["desistiu", "desistiu"]);
  assert.deepEqual(r, { total: 0, emTriagem: 0, aguardando: 0, aprovados: 0, reprovados: 0 });
  assert.equal(antigo(0, ["desistiu", "desistiu"]).total, 2);
});
caso("só em triagem", () => assert.equal(resumirPortal(3, []).total, 3));

// Invariante em todas as combinações de até 4 encaminhamentos × 0..2 em triagem.
caso("Total == soma dos 4 cards SEMPRE; antigo×novo só difere no Total, e só por 'desistiu'", () => {
  let combos = 0;
  const gerar = (prefixo: string[], n: number) => {
    if (n === 0) {
      for (const tri of [0, 1, 2]) {
        const novo = resumirPortal(tri, prefixo);
        const velho = antigo(tri, prefixo);
        assert.equal(novo.total, novo.emTriagem + novo.aguardando + novo.aprovados + novo.reprovados);
        const { total: tn, ...cardsNovo } = novo;
        const { total: tv, ...cardsVelho } = velho;
        assert.deepEqual(cardsNovo, cardsVelho, "cards individuais não podem mudar");
        const desistiram = prefixo.filter((s) => s === "desistiu").length;
        assert.equal(tv - tn, desistiram, "diferença no Total = nº de desistiu");
        combos++;
      }
      return;
    }
    for (const s of TODOS) gerar([...prefixo, s], n - 1);
  };
  for (let n = 0; n <= 4; n++) gerar([], n);
  console.log(`      (${combos} combinações verificadas)`);
});

console.log(`\n${total} casos OK${process.exitCode ? " — HÁ FALHAS" : ""}`);
