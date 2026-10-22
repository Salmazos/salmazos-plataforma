// Smoke da tela de Propostas (formulário de texto introdutório e cláusulas adicionais). Sem navegador: react-test-renderer.
// react-test-renderer NÃO é dependência do projeto: instalar só para rodar (npm i --no-save react-test-renderer).
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/smoke-propostas-ui.mts
import assert from "node:assert/strict";
import React, { useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import CamposProposta, { camposDeProposta, camposPadrao, conteudoDoForm, moverClausula, type CamposForm } from "@/components/propostas/CamposProposta";
import { conteudoRsSchema, TEXTO_INTRODUTORIO_PADRAO_RS, MAX_CLAUSULAS_ADICIONAIS } from "@/lib/propostaModelos";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

let ultimo: CamposForm = camposPadrao();
function Pagina({ inicial, desabilitado }: { inicial: CamposForm; desabilitado?: boolean }) {
  const [v, setV] = useState(inicial);
  ultimo = v;
  return React.createElement(CamposProposta, { valor: v, onChange: setV, desabilitado });
}
async function montar(inicial = camposPadrao(), desabilitado = false) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(Pagina, { inicial, desabilitado })); });
  return r;
}
const botoes = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "button");
const achar = (r: TestRenderer.ReactTestRenderer, rotulo: string) => botoes(r).find((b) => b.props["aria-label"] === rotulo || b.props.title === rotulo || (typeof b.children[0] === "string" && b.children.join("").startsWith(rotulo)));
const clicar = async (b: TestRenderer.ReactTestInstance | undefined) => { assert.ok(b, "botão existe"); await act(async () => { b!.props.onClick(); }); };
const textareas = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "textarea");
const digitar = async (t: TestRenderer.ReactTestInstance, valor: string) => { await act(async () => { t.props.onChange({ target: { value: valor } }); }); };
const textoDaTela = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());

await caso("nova proposta: introdução já vem preenchida com o texto padrão e 0 cláusulas", async () => {
  const r = await montar();
  assert.equal(textareas(r).length, 1);
  assert.equal(textareas(r)[0].props.value, TEXTO_INTRODUTORIO_PADRAO_RS);
  assert.equal(textareas(r)[0].props.maxLength, 1000);
  assert.deepEqual(ultimo.clausulas_adicionais, []);
});
await caso("adicionar até 10 cláusulas: numeração 1.8…1.17 e botão desabilitado no limite", async () => {
  const r = await montar();
  for (let i = 0; i < MAX_CLAUSULAS_ADICIONAIS; i++) await clicar(achar(r, "+ Adicionar cláusula"));
  assert.equal(ultimo.clausulas_adicionais.length, 10);
  const txt = textoDaTela(r);
  for (const n of ["1.8", "1.9", "1.10", "1.17"]) assert.ok(txt.includes(`"${n}"`), n);
  assert.equal(achar(r, "+ Adicionar cláusula")!.props.disabled, true);
  assert.equal(textareas(r).length, 11);
});
await caso("digitar, reordenar (↑/↓) e remover mantêm a ordem escolhida e renumeram", async () => {
  const r = await montar();
  for (let i = 0; i < 3; i++) await clicar(achar(r, "+ Adicionar cláusula"));
  const campos = () => textareas(r).slice(1);
  for (const [i, t] of ["A", "B", "C"].entries()) await digitar(campos()[i], t);
  assert.deepEqual(ultimo.clausulas_adicionais, ["A", "B", "C"]);
  await clicar(achar(r, "Descer cláusula 1.8"));
  assert.deepEqual(ultimo.clausulas_adicionais, ["B", "A", "C"]);
  await clicar(achar(r, "Subir cláusula 1.10"));
  assert.deepEqual(ultimo.clausulas_adicionais, ["B", "C", "A"]);
  assert.equal(achar(r, "Subir cláusula 1.8")!.props.disabled, true, "primeira não sobe");
  assert.equal(achar(r, "Descer cláusula 1.10")!.props.disabled, true, "última não desce");
  await clicar(achar(r, "Remover cláusula 1.9"));
  assert.deepEqual(ultimo.clausulas_adicionais, ["B", "A"]);
  assert.ok(!textoDaTela(r).includes('"1.10"'));
});
await caso("moverClausula: fora do intervalo não altera; não muta a lista original", () => {
  const l = ["a", "b", "c"];
  assert.deepEqual(moverClausula(l, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moverClausula(l, 0, -1), l);
  assert.deepEqual(moverClausula(l, 2, 3), l);
  assert.deepEqual(l, ["a", "b", "c"]);
});
await caso("aviso de caracteres omitidos aparece ao digitar emoji e some ao tirar", async () => {
  const r = await montar();
  await digitar(textareas(r)[0], "Olá 😀 equipe →");
  assert.ok(textoDaTela(r).includes("serão omitidos"));
  assert.ok(textoDaTela(r).includes("😀"));
  await digitar(textareas(r)[0], "Olá equipe");
  assert.ok(!textoDaTela(r).includes("serão omitidos"));
});
await caso("'Restaurar texto padrão' só aparece quando o texto foi alterado e restaura", async () => {
  const r = await montar();
  assert.equal(achar(r, "Restaurar texto padrão"), undefined);
  await digitar(textareas(r)[0], "Outro texto");
  await clicar(achar(r, "Restaurar texto padrão"));
  assert.equal(ultimo.texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_RS);
});
await caso("edição: proposta antiga (sem os campos novos) abre com o padrão; texto e cláusulas salvos voltam como estavam", () => {
  const antiga = camposDeProposta({ aos_cuidados: null, validade_dias: 15, conteudo: { cliente_cnpj: null } });
  assert.equal(antiga.texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_RS);
  assert.deepEqual(antiga.clausulas_adicionais, []);
  const salva = camposDeProposta({ aos_cuidados: null, validade_dias: 15, conteudo: { texto_introdutorio: "Meu texto", clausulas_adicionais: ["x", "y"] } });
  assert.equal(salva.texto_introdutorio, "Meu texto");
  assert.deepEqual(salva.clausulas_adicionais, ["x", "y"]);
  assert.equal(camposDeProposta({ aos_cuidados: null, validade_dias: 15, conteudo: { texto_introdutorio: "" } }).texto_introdutorio, "", "apagado de propósito continua vazio");
});
await caso("corpo enviado: cláusula em branco sai da lista, textos aparados, e o resultado passa no Zod do servidor", () => {
  const f = { ...camposPadrao(), texto_introdutorio: "  Olá  ", clausulas_adicionais: ["  um ", "   ", "dois"] };
  const c = conteudoDoForm(f);
  assert.equal(c.texto_introdutorio, "Olá");
  assert.deepEqual(c.clausulas_adicionais, ["um", "dois"]);
  assert.ok(conteudoRsSchema.safeParse(c).success);
  assert.ok(conteudoRsSchema.safeParse(conteudoDoForm(camposPadrao())).success);
});
await caso("campos desabilitados: sem botões de adicionar/mover/remover e textareas travadas", async () => {
  const r = await montar({ ...camposPadrao(), clausulas_adicionais: ["x"] }, true);
  assert.equal(botoes(r).length, 0);
  assert.ok(textareas(r).every((t) => t.props.disabled === true));
});
console.log(`\n${total} casos OK`);
