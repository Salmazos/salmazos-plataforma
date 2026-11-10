// Lista de Funcionários (RH): ordem alfabética e busca por nome com a janela de nomes. Funções puras + ligação na tela.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-funcionarios-busca.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizarNome, compararNomes, ordenarPorNome, nomeContem } from "../src/lib/funcionariosBusca";

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log(`OK ${nome}`); };
const nomes = (l: { nome_completo: string }[]) => l.map((x) => x.nome_completo);

ok("normaliza: minúsculas, sem acento, sem espaço nas pontas", () => {
  assert.equal(normalizarNome("  ÁLVARO José  "), "alvaro jose");
  assert.equal(normalizarNome("Conceição"), "conceicao");
  assert.equal(normalizarNome("Ñandú"), "nandu");
});
ok("ordem alfabética do português: acento e maiúscula/minúscula não mudam a posição", () => {
  const f = ["Willian Felipe de Oliveira", "vania oliveira da Silva", "Álvaro Prado", "Bruna Souza", "Ícaro Dias", "Ana Lima", "alberto Reis", "Henrique Gomes", "Édson Alves", "Eduardo Nunes", "Zélia Costa"].map((nome_completo) => ({ nome_completo }));
  assert.deepEqual(nomes(ordenarPorNome(f)), ["alberto Reis", "Álvaro Prado", "Ana Lima", "Bruna Souza", "Édson Alves", "Eduardo Nunes", "Henrique Gomes", "Ícaro Dias", "vania oliveira da Silva", "Willian Felipe de Oliveira", "Zélia Costa"]);
});
ok("ordenar não altera a lista original, é estável para nomes iguais e aceita lista vazia", () => {
  const orig = [{ nome_completo: "Bia", id: 1 }, { nome_completo: "Ana", id: 2 }, { nome_completo: "ana", id: 3 }];
  const r = ordenarPorNome(orig);
  assert.deepEqual(orig.map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(r.map((x) => x.id), [2, 3, 1], "Ana e ana empatam e mantêm a ordem de entrada");
  assert.deepEqual(ordenarPorNome([]), []);
  assert.equal(compararNomes("Ana", "ana"), 0);
});
ok("busca por nome ignora acento e maiúscula e acha em qualquer parte do nome; vazio = todos", () => {
  assert.equal(nomeContem("Álvaro Prado", "alvaro"), true);
  assert.equal(nomeContem("Álvaro Prado", "ÁLV"), true);
  assert.equal(nomeContem("Vania Oliveira da Silva", "oliveira"), true);
  assert.equal(nomeContem("Vania Oliveira da Silva", "  silva "), true);
  assert.equal(nomeContem("Vania Oliveira da Silva", "souza"), false);
  assert.equal(nomeContem("Conceição Dias", "conceicao"), true);
  assert.equal(nomeContem("Qualquer", ""), true);
  assert.equal(nomeContem("Qualquer", "   "), true);
});
ok("ligação na tela: lista ordenada e janela de nomes alimentadas pelos MESMOS filtros (status/empresa/modalidade); busca sem acento", () => {
  const tela = fs.readFileSync("src/components/FuncionariosPageClient.tsx", "utf8");
  for (const t of ["ordenarPorNome(passaFiltros.filter((f) => nomeContem(f.nome_completo, busca)))", "ordenarPorNome(passaFiltros).map(", "<BuscaNomeFuncionario value={busca} onChange={setBusca} opcoes={opcoesNomes} />"]) assert.ok(tela.includes(t), t);
  const campo = fs.readFileSync("src/components/BuscaNomeFuncionario.tsx", "utf8");
  for (const t of ['role="combobox"', "ArrowDown", "Escape", '"Enter"', "ordem alfabética", "Nenhum nome encontrado.", "Limpar busca"]) assert.ok(campo.includes(t), t);
});

console.log(`\n${n} verificações OK`);
