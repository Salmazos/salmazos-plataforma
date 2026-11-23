// Funcionários (RH): quadros do topo por empresa + contagem no seletor; Vencimento de Contrato: ordem padrão por nome. Funções puras.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-funcionarios-resumo-empresa.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { resumirFuncionarios, opcoesEmpresasComContagem, type FuncionarioParaResumo } from "../src/lib/funcionariosResumo";
import { ordenarPorNomeContrato } from "../src/lib/contratoMotStatus";

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log(`OK ${nome}`); };
const f = (cliente_id: string | null, tipo_servico: string | null, status = "ativo", faltas: string[] = []): FuncionarioParaResumo => ({ status, cliente_id, tipo_servico, faltas_cadastro: faltas });
const MOT = "mao_obra_temporaria", TERC = "terceirizacao";
const lista = [
  f("A", MOT), f("A", MOT), f("A", TERC, "ativo", ["sexo"]), f("A", MOT, "desligado"),
  f("B", TERC), f("B", null, "ativo", ["filhos"]),
  f("C", MOT, "desligado"),
];

ok("sem filtro de empresa: só ativos, todas as empresas", () => {
  assert.deepEqual(resumirFuncionarios(lista), { total: 5, mot: 2, terceirizacao: 2, semModalidade: 1, incompletos: 2 });
  assert.deepEqual(resumirFuncionarios(lista, ""), resumirFuncionarios(lista));
});
ok("com empresa: só os ativos dela", () => {
  assert.deepEqual(resumirFuncionarios(lista, "A"), { total: 3, mot: 2, terceirizacao: 1, semModalidade: 0, incompletos: 1 });
  assert.deepEqual(resumirFuncionarios(lista, "B"), { total: 2, mot: 0, terceirizacao: 1, semModalidade: 1, incompletos: 1 });
});
ok("empresa sem ativo ou sem funcionário: tudo zero", () => {
  assert.deepEqual(resumirFuncionarios(lista, "C"), { total: 0, mot: 0, terceirizacao: 0, semModalidade: 0, incompletos: 0 });
  assert.equal(resumirFuncionarios(lista, "inexistente").total, 0);
});
ok("seletor: contagem de ativos, ordem sem acento/maiúscula, empresa com 0 continua", () => {
  const ops = opcoesEmpresasComContagem([{ id: "C", nome: "Álamo" }, { id: "A", nome: "zeta" }, { id: "B", nome: "Beta" }, { id: "D", nome: "Delta" }], lista);
  assert.deepEqual(ops.map((o) => `${o.nome} (${o.total})`), ["Álamo (0)", "Beta (2)", "Delta (0)", "zeta (3)"]);
});
ok("vencimento: nome A a Z, sem acento nem maiúscula; empate pela admissão mais antiga", () => {
  const l = [
    { nomeCompleto: "Zélia", dataAdmissao: "2026-01-01" },
    { nomeCompleto: "ana", dataAdmissao: "2026-05-01" },
    { nomeCompleto: "Ana", dataAdmissao: "2026-02-01" },
    { nomeCompleto: "Álvaro", dataAdmissao: "2026-03-01" },
    { nomeCompleto: "Bruno", dataAdmissao: "2026-03-01" },
  ];
  const copia = JSON.stringify(l);
  assert.deepEqual(ordenarPorNomeContrato(l).map((x) => `${x.nomeCompleto}|${x.dataAdmissao}`), ["Álvaro|2026-03-01", "Ana|2026-02-01", "ana|2026-05-01", "Bruno|2026-03-01", "Zélia|2026-01-01"]);
  assert.equal(JSON.stringify(l), copia, "não altera a lista recebida");
});
ok("ligação nas telas", () => {
  const tela = fs.readFileSync("src/components/FuncionariosPageClient.tsx", "utf8");
  assert.match(tela, /resumirFuncionarios\(funcionariosIniciais, filtroClienteId \|\| null\)/);
  assert.match(tela, /Todas as empresas \(\{totalTodasEmpresas\}\)/);
  assert.match(tela, /\{c\.nome\} \(\{c\.total\}\)/);
  const venc = fs.readFileSync("src/components/VencimentoContratoPageClient.tsx", "utf8");
  assert.match(venc, /useState<OrdemDiasTrabalhados \| "nome">\("nome"\)/);
});
console.log(`\n${n} verificações OK`);
