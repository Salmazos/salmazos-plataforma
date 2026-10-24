// Verificação da contagem do aviso diário do Comercial (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-lembretes-comercial.mts
import assert from "node:assert/strict";
import { agruparEmpresasPorVendedor } from "../src/lib/lembretesComercialContagem.ts";

let n = 0;
function caso(nome: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nome}`);
}
const item = (id: string, vendedor_id: string, empresa_visitada_id: string | null = null) => ({ id, vendedor_id, empresa_visitada_id });
const tamanhos = (m: Map<string, Set<string>>) => Object.fromEntries([...m].map(([v, s]) => [v, s.size]));

caso("listas vazias: ninguém entra", () => {
  assert.equal(agruparEmpresasPorVendedor([], []).size, 0);
});
caso("só lembretes: uma empresa por vendedor, repetida conta uma vez", () => {
  const m = agruparEmpresasPorVendedor([item("l1", "v1", "e1"), item("l2", "v1", "e1"), item("l3", "v1", "e2")], []);
  assert.deepEqual(tamanhos(m), { v1: 2 });
});
caso("só oportunidades: vendedor que só tem oportunidade vencida entra", () => {
  const m = agruparEmpresasPorVendedor([], [item("o1", "v2", "e9"), item("o2", "v2", "e8")]);
  assert.deepEqual(tamanhos(m), { v2: 2 });
});
caso("lembrete e oportunidade da MESMA empresa contam 1 só", () => {
  const m = agruparEmpresasPorVendedor([item("l1", "v1", "e1")], [item("o1", "v1", "e1")]);
  assert.deepEqual(tamanhos(m), { v1: 1 });
});
caso("lembrete de uma empresa e oportunidade de outra somam", () => {
  const m = agruparEmpresasPorVendedor([item("l1", "v1", "e1")], [item("o1", "v1", "e2")]);
  assert.deepEqual(tamanhos(m), { v1: 2 });
});
caso("empresa_visitada_id nulo: cada registro conta por conta própria (lembrete e oportunidade não se fundem)", () => {
  const m = agruparEmpresasPorVendedor([item("l1", "v1"), item("l2", "v1")], [item("o1", "v1")]);
  assert.deepEqual(tamanhos(m), { v1: 3 });
  assert.deepEqual([...m.get("v1")!].sort(), ["lembrete-l1", "lembrete-l2", "oportunidade-o1"]);
});
caso("vendedores separados: a mesma empresa conta para cada um", () => {
  const m = agruparEmpresasPorVendedor([item("l1", "v1", "e1")], [item("o1", "v2", "e1"), item("o2", "v3", "e5")]);
  assert.deepEqual(tamanhos(m), { v1: 1, v2: 1, v3: 1 });
});
caso("vendedor com lembrete de uma empresa e oportunidade de outro vendedor na mesma empresa não se misturam", () => {
  const m = agruparEmpresasPorVendedor([item("l1", "v1", "e1"), item("l2", "v1", "e2")], [item("o1", "v2", "e1")]);
  assert.deepEqual(tamanhos(m), { v1: 2, v2: 1 });
});

console.log(`\n${n} casos ok`);
