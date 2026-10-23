// Smoke da tela "Candidato desistiu" (lista Aguardando início + modal). Sem navegador: react-test-renderer.
// react-test-renderer NÃO é dependência do projeto: instalar só para rodar (npm i --no-save react-test-renderer).
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/smoke-candidato-desistiu-ui.mts
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import AdmissoesClient, { type DisponivelAdmissao } from "@/components/AdmissoesClient";
import ModalCandidatoDesistiu from "@/components/ModalCandidatoDesistiu";
import ModalIniciarAdmissao from "@/components/ModalIniciarAdmissao";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const item = (status: string, id = "cv-1"): DisponivelAdmissao => ({
  id, candidato_id: "c-1", vaga_id: "v-1", data_contratado: "2026-10-22T18:54:57Z", tipo_servico_vigente: "mao_obra_temporaria",
  candidatos: { id: "c-1", nome_completo: "ZZTEST Candidato", cargo_pretendido: "Auxiliar", telefone: null },
  vagas: { id: "v-1", titulo: "ZZTEST Vaga", status, tipo_servico: "mao_obra_temporaria", cliente_id: "cl-1", clientes: { nome: "ZZTEST Cliente", entidade_contratante: null } },
});
const botoes = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "button");
const achar = (r: TestRenderer.ReactTestRenderer, texto: string) => botoes(r).find((b) => b.children.join("").includes(texto));
const textarea = (r: TestRenderer.ReactTestRenderer) => r.root.findByType("textarea");
// Texto corrido da tela: junta as folhas de texto em ordem ("(" + "1" + ")" viram "(1)", como o usuário lê).
function folhas(no: any): string {
  if (no == null) return "";
  if (typeof no === "string") return no;
  if (Array.isArray(no)) return no.map(folhas).join("");
  return folhas(no.children);
}
const texto = (r: TestRenderer.ReactTestRenderer) => folhas(r.toJSON());
const digitar = async (r: TestRenderer.ReactTestRenderer, v: string) => { await act(async () => { textarea(r).props.onChange({ target: { value: v } }); }); };

const chamadas: { url: string; corpo: any }[] = [];
function simularFetch(resposta: { ok: boolean; json: unknown } | "rede") {
  (globalThis as any).fetch = async (url: string, init: any) => {
    // GETs de outros componentes montados (ModalIniciarAdmissao) só recebem uma lista vazia; só o POST da desistência é gravado.
    if (!init?.body) return { ok: true, json: async () => ({ data: [] }) };
    chamadas.push({ url, corpo: JSON.parse(init.body) });
    if (resposta === "rede") throw new Error("offline");
    return { ok: resposta.ok, json: async () => resposta.json };
  };
}
async function montarModal(it: DisponivelAdmissao | null, onClose = () => {}, onConcluido: (r: any) => void = () => {}) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ModalCandidatoDesistiu, { item: it, onClose, onConcluido })); });
  return r;
}

await caso("modal: sem item não renderiza; confirmar fica desabilitado até o motivo ter 5+ caracteres", async () => {
  assert.equal((await montarModal(null)).toJSON(), null);
  const r = await montarModal(item("aberta"));
  assert.equal(achar(r, "Confirmar desistência")!.props.disabled, true);
  await digitar(r, "abc");
  assert.equal(achar(r, "Confirmar desistência")!.props.disabled, true);
  assert.ok(texto(r).includes("mínimo de 5 caracteres"));
  await digitar(r, "abcde");
  assert.equal(achar(r, "Confirmar desistência")!.props.disabled, false);
  await digitar(r, "     ");
  assert.equal(achar(r, "Confirmar desistência")!.props.disabled, true, "só espaços não vale");
});
await caso("modal: checkbox de reabrir só aparece com a vaga FECHADA e vem marcado; vaga aberta não mostra", async () => {
  const aberta = await montarModal(item("aberta"));
  assert.equal(aberta.root.findAll((n) => n.type === "input" && n.props.type === "checkbox").length, 0);
  const fechada = await montarModal(item("fechada"));
  const cbs = fechada.root.findAll((n) => n.type === "input" && n.props.type === "checkbox");
  assert.equal(cbs.length, 1);
  assert.equal(cbs[0].props.checked, true);
  assert.ok(texto(fechada).includes("Reabrir a vaga"));
});
await caso("modal: envia o POST certo (motivo aparado; reabrir_vaga só quando fechada E marcado) e chama onConcluido", async () => {
  for (const [status, marcar, esperado] of [["aberta", true, false], ["fechada", true, true], ["fechada", false, false]] as [string, boolean, boolean][]) {
    chamadas.length = 0;
    simularFetch({ ok: true, json: { resultado: "desistiu", vaga_reaberta: esperado, avisos: [] } });
    let concluido: any = null;
    const r = await montarModal(item(status), () => {}, (x) => { concluido = x; });
    await digitar(r, "  Aceitou outra proposta  ");
    if (status === "fechada") await act(async () => { r.root.findByType("input").props.onChange({ target: { checked: marcar } }); });
    await act(async () => { await achar(r, "Confirmar desistência")!.props.onClick(); });
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].url, "/api/candidatos-vagas/cv-1/desistencia");
    assert.deepEqual(chamadas[0].corpo, { motivo: "Aceitou outra proposta", reabrir_vaga: esperado }, `${status}/${marcar}`);
    assert.deepEqual(concluido, { vagaReaberta: esperado, avisos: [] });
  }
});
await caso("modal: erro do servidor (409) e falha de rede aparecem no modal, sem fechar e sem concluir; botão volta a habilitar", async () => {
  for (const resposta of [{ ok: false, json: { error: "Esta candidatura não está mais em Contratado (já foi alterada). Atualize a página." } }, "rede"] as const) {
    simularFetch(resposta);
    let concluido = false;
    const r = await montarModal(item("aberta"), () => {}, () => { concluido = true; });
    await digitar(r, "Aceitou outra proposta");
    await act(async () => { await achar(r, "Confirmar desistência")!.props.onClick(); });
    assert.equal(concluido, false);
    assert.ok(r.root.findAll((n) => n.props.role === "alert").length === 1, "mensagem de erro visível");
    assert.equal(achar(r, "Confirmar desistência")!.props.disabled, false);
  }
});
await caso("lista: botão 'Candidato desistiu' ao lado de '+ Iniciar admissão'; clicar nele abre o modal de desistência e NÃO a admissão (stopPropagation)", async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(AdmissoesClient, { admissoesIniciais: [], disponiveisIniciais: [item("aberta")] })); });
  assert.ok(texto(r).includes("+ Iniciar admissão"));
  const botao = achar(r, "Candidato desistiu")!;
  assert.ok(botao);
  let parou = false;
  await act(async () => { botao.props.onClick({ stopPropagation: () => { parou = true; } }); });
  assert.equal(parou, true, "stopPropagation chamado");
  assert.equal(r.root.findByType(ModalIniciarAdmissao).props.isOpen, false, "a admissão não abriu");
  assert.equal(r.root.findByType(ModalCandidatoDesistiu).props.item?.id, "cv-1", "o modal de desistência abriu para este candidato");
  // Clicar na linha continua abrindo a admissão.
  const linha = r.root.findAll((n) => n.props.role === "button")[0];
  await act(async () => { linha.props.onClick(); });
  assert.equal(r.root.findByType(ModalIniciarAdmissao).props.isOpen, true);
});
await caso("lista: ao concluir a desistência o candidato sai da lista, com toast e refresh", async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(AdmissoesClient, { admissoesIniciais: [], disponiveisIniciais: [item("aberta"), item("aberta", "cv-2")] })); });
  await act(async () => { achar(r, "Candidato desistiu")!.props.onClick({ stopPropagation() {} }); });
  await act(async () => { r.root.findByType(ModalCandidatoDesistiu).props.onConcluido({ vagaReaberta: true, avisos: [] }); });
  assert.ok(texto(r).includes("Aguardando início de admissão (1)"));
  assert.ok(texto(r).includes("desistência registrada e vaga reaberta"));
  assert.equal(r.root.findByType(ModalCandidatoDesistiu).props.item, null, "modal fechado");
  assert.ok(((globalThis as any).__ROUTER__ ?? []).includes("refresh"), "router.refresh() chamado");
});

console.log(`\n${total} casos OK`);
// O toast da tela agenda um setTimeout de 3s fora do act(): encerra aqui para o aviso do React não poluir a saída.
process.exit(process.exitCode ?? 0);
