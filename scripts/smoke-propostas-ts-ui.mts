// Smoke das telas da Terceirização (TS, etapa 2D): formulário por posto com prévia ao vivo do SERVIDOR, ganho/justificativa, quem paga, campos só da diretoria, detalhe da proposta,
// aba "Percentuais da Terceirização" com simulador, e a trava de acesso (MODELOS_ATIVOS segue ["RS"]). Sem navegador: react-test-renderer. A prévia roda a lógica REAL do
// servidor (previaTs) sobre um banco em memória; só o transporte (fetch) é simulado. SEM PDF (2E).
// react-test-renderer NÃO é dependência do projeto: instalar só para rodar (npm i react-test-renderer@19.2.6 --no-save --legacy-peer-deps) e remover depois.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/smoke-propostas-ts-ui.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import React, { useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import CamposPropostaTs, {
  bloqueioTs, camposTsDeProposta, camposTsPadrao, conteudoTsDoForm, postoTsNovo, postoTsPronto, MSG_JUSTIFICATIVA_GANHO, URL_CONFIGURAR_PERCENTUAIS_TS, type CamposTsForm, type EstadoPreviaTs, type PostoForm,
} from "@/components/propostas/CamposPropostaTs";
import PercentuaisTsAdmin, { CASOS_SIMULADOR_TS, simularPostoTs } from "@/components/propostas/PercentuaisTsAdmin";
import PropostaDetalheTs, { type DetalheTs } from "@/components/propostas/PropostaDetalheTs";
import PropostaNovaClient from "@/components/propostas/PropostaNovaClient";
import PropostasListaClient from "@/components/propostas/PropostasListaClient";
import CampoMoeda from "@/components/ui/CampoMoeda";
import { MODELOS_ATIVOS, modeloDisponivel } from "@/lib/propostas";
import { MSG_PDF_TS_INDISPONIVEL, PDF_TS_DISPONIVEL, conteudoTsSchema, type LiberacaoGanhoTs } from "@/lib/propostaTs";
import { MSG_GANHO_TS_NAO_CONFIGURADO, PARAMETROS_TS_INICIAIS, calcularPostoTs, precoDoCustoTs, type ParametrosTs } from "@/lib/propostaTsCalculo";
import { previaTs } from "@/lib/propostaServico";
import { hojeSaoPaulo } from "@/lib/comercial";
import { criarClienteServico, criarDb } from "../scripts/harness-mot/memdb.mjs";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
process.env.HARNESS_PROPOSTA_TS = "1"; // o servidor de prévia deixa o vendedor usar o TS só no harness (nunca em produção)
let total = 0;
// Telas montadas por um caso (com consulta de prévia pendente) são desmontadas antes do caso seguinte.
const vivos: TestRenderer.ReactTestRenderer[] = [];
async function caso(nome: string, fn: () => Promise<void> | void) {
  for (const v of vivos.splice(0)) { try { await act(async () => { v.unmount(); }); } catch { /* já desmontada */ } }
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const HOJE = hojeSaoPaulo();
// Ganho padrão 30% sobre o custo, mínimo 20%: o Auxiliar de Limpeza 44h dá custo R$ 5.357,73, encargos R$ 1.699,22 e preço R$ 6.965,05.
const PAR_PRECO: ParametrosTs = { ...PARAMETROS_TS_INICIAIS, ganho_padrao_bp: 3000, ganho_minimo_bp: 2000 };
const PAR_ABAIXO: ParametrosTs = { ...PAR_PRECO, ganho_minimo_bp: 3500 };
const esperar = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const DEBOUNCE = 520;

// ── Servidor simulado: a prévia é a lógica REAL (previaTs); o resto das rotas responde o que o caso mandar ──
interface Chamada { url: string; metodo: string; corpo: any }
let chamadas: Chamada[] = [];
let responder: (c: Chamada) => { status: number; corpo: unknown } | Promise<{ status: number; corpo: unknown }> = () => ({ status: 404, corpo: { error: "sem rota" } });
const servidor = { gestor: true, par: PAR_PRECO as ParametrosTs | null };
let atrasos: number[] = []; // atraso (ms) de cada resposta da prévia, na ordem em que saem
function svcComParametros(par: ParametrosTs | null) {
  const db: any = criarDb({});
  db.rpcs = { parametros_ts_vigentes: () => ({ data: par ? [{ id: "p1", vigente_desde: "2026-01-01", ...par }] : [], error: null }) };
  return criarClienteServico(db) as any;
}
async function servidorPrevia(c: Chamada) {
  const res = await previaTs(svcComParametros(servidor.par), { gestor: servidor.gestor, podeEscrever: true } as any, c.corpo.conteudo);
  return res.ok ? { status: 200, corpo: { data: res.data } } : { status: res.status, corpo: { error: res.error } };
}
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const c = { url: String(url), metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : undefined };
  chamadas.push(c);
  const r = c.url.endsWith("/ts/previa") ? await servidorPrevia(c) : await responder(c);
  if (c.url.endsWith("/ts/previa")) { const a = atrasos.shift(); if (a) await new Promise((x) => setTimeout(x, a)); }
  return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
};

// ── utilidades de árvore ──
function textoDe(r: TestRenderer.ReactTestRenderer): string {
  const partes: string[] = [];
  const visita = (n: any) => { if (n == null) return; if (typeof n === "string") { partes.push(n); return; } (n.children ?? []).forEach(visita); };
  visita(r.toJSON());
  return partes.join(" ").replace(/\s+/g, " ");
}
const txt = (n: TestRenderer.ReactTestInstance): string => n.children.map((c) => (typeof c === "string" ? c : txt(c))).join("");
const botoes = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "button");
const botaoPorTexto = (r: TestRenderer.ReactTestRenderer, trecho: string) => botoes(r).find((b) => txt(b).includes(trecho));
const botaoPorLabel = (r: TestRenderer.ReactTestRenderer, label: string) => botoes(r).find((b) => b.props["aria-label"] === label);
const clicar = async (b: TestRenderer.ReactTestInstance | undefined) => { assert.ok(b, "botão existe"); await act(async () => { b!.props.onClick(); }); };
const porData = (r: TestRenderer.ReactTestRenderer, attr: string, valor?: string | number) =>
  r.root.findAll((n) => typeof n.type === "string" && (valor === undefined ? n.props[attr] !== undefined : String(n.props[attr]) === String(valor)));
const reais = (c: number) => new RegExp(`R\\$\\s?${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }).replace(/\./g, "\\.")}`);

// Auxiliar de Limpeza 44h (o caso de referência).
const AUX = (extra: Partial<PostoForm> = {}): PostoForm => ({
  ...postoTsNovo(), nome: "Auxiliar de Limpeza", salario: 1837.4,
  adicionais: [{ tipo: "insalubridade", modo: "valor", valor: 324.2, percentual: "" }, { tipo: "assiduidade", modo: "valor", valor: 315, percentual: "" }],
  beneficios: [{ tipo: "vale_transporte", rotulo: "", valor: 200, quem_paga: "salmazos" }, { tipo: "refeicao", rotulo: "", valor: 480, quem_paga: "salmazos" }, { tipo: "cesta_basica", rotulo: "", valor: 151.91, quem_paga: "salmazos" }],
  uniforme: 100, operacao: 250, ...extra,
});
const formAux = (extra: Partial<PostoForm> = {}, f: Partial<CamposTsForm> = {}): CamposTsForm => ({ ...camposTsPadrao(), itens: [AUX(extra)], ...f });

let ultimo: CamposTsForm = camposTsPadrao();
let ultimaPrevia: EstadoPreviaTs | null = null;
let definir!: (fn: (v: CamposTsForm) => CamposTsForm) => void;
function Pagina({ inicial, gestor, desabilitado }: { inicial: CamposTsForm; gestor: boolean; desabilitado?: boolean }) {
  const [v, setV] = useState(inicial);
  ultimo = v; definir = setV;
  return React.createElement(CamposPropostaTs, { valor: v, onChange: setV, gestor, desabilitado, onPrevia: (e: EstadoPreviaTs) => { ultimaPrevia = e; } });
}
async function montar(inicial = camposTsPadrao(), gestor = true, desabilitado = false) {
  chamadas = []; ultimaPrevia = null; atrasos = [];
  responder = () => ({ status: 404, corpo: { error: "sem rota" } });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(Pagina, { inicial, gestor, desabilitado })); });
  vivos.push(r);
  return r;
}
const preencher = async (fn: (v: CamposTsForm) => CamposTsForm) => { await act(async () => { definir(fn); }); await esperar(DEBOUNCE); };
const dasPrevias = () => chamadas.filter((c) => c.url.endsWith("/ts/previa"));

// ═══ Trava de acesso (não muda na 2D) ═══════════════════════════════════════════
await caso("ACESSO: MODELOS_ATIVOS continua ['RS']; o PDF do TS segue indisponível; TS só pela trava do gestor com empresa de teste (ou chave de harness fora de produção)", () => {
  assert.deepEqual(MODELOS_ATIVOS, ["RS"]);
  assert.equal(PDF_TS_DISPONIVEL, false);
  const antes = process.env.HARNESS_PROPOSTA_TS;
  delete process.env.HARNESS_PROPOSTA_TS;
  try {
    assert.equal(modeloDisponivel("TS", { gestor: false, teste: true }), false);
    assert.equal(modeloDisponivel("TS", { gestor: true, teste: false }), false);
    assert.equal(modeloDisponivel("TS", { gestor: true, teste: true }), true);
  } finally { process.env.HARNESS_PROPOSTA_TS = antes; }
});

// ═══ Formulário por posto ═══════════════════════════════════════════════════════
await caso("formulário novo: 1 posto com os padrões (44h, 220 h/mês, 1 efetivo), texto introdutório padrão, vencimento 15 e 30; sem CNPJ/endereço; sem salário não consulta o servidor", async () => {
  const r = await montar();
  assert.equal(ultimo.itens.length, 1);
  const p = ultimo.itens[0] as PostoForm;
  assert.deepEqual({ escala: p.escala, semanais: p.horas_semanais, mensais: p.horas_mensais, efetivos: p.efetivos }, { escala: "44h", semanais: "44", mensais: "220", efetivos: "1" });
  assert.equal(ultimo.vencimentos_dias, "15, 30");
  assert.doesNotMatch(textoDe(r), /CNPJ|Endereço/i);
  assert.match(textoDe(r), /Preencha serviço, efetivos, horas e salário/);
  await esperar(DEBOUNCE);
  assert.equal(dasPrevias().length, 0);
  // vendedor não manda ganho nem justificativa; gestor manda
  assert.deepEqual(Object.keys(conteudoTsDoForm(ultimo, { gestor: false })).sort(), ["cargo_supervisao", "clausulas_adicionais", "condicoes", "servicos", "texto_introdutorio"]);
  assert.deepEqual(Object.keys(conteudoTsDoForm(ultimo, { gestor: true })).sort(), ["cargo_supervisao", "clausulas_adicionais", "condicoes", "ganho_bp", "justificativa_ganho_minimo", "servicos", "texto_introdutorio"]);
});
await caso("PRÉVIA AO VIVO (gestor): o caso do negócio dá custo por efetivo R$ 5.357,73, quantidade 1, valor mensal e TOTAL MENSAL R$ 6.965,05 — valores do SERVIDOR; gestor vê decomposição (encargos R$ 1.699,22) e o ganho", async () => {
  const r = await montar(formAux());
  await esperar(DEBOUNCE);
  assert.equal(dasPrevias().length, 1);
  assert.deepEqual(Object.keys(dasPrevias()[0].corpo), ["conteudo"]);
  const post = dasPrevias()[0].corpo.conteudo.servicos[0].postos[0];
  assert.equal(post.salario_centavos, 183740);
  assert.deepEqual(post.adicionais, [{ tipo: "insalubridade", modo: "valor", valor_centavos: 32420 }, { tipo: "assiduidade", modo: "valor", valor_centavos: 31500 }]);
  assert.match(txt(porData(r, "data-custo-efetivo", "0-0")[0]), reais(535773));
  assert.equal(txt(porData(r, "data-quantidade", "0-0")[0]), "1");
  assert.match(txt(porData(r, "data-valor-posto", "0-0")[0]), reais(696505));
  assert.match(txt(porData(r, "data-total-mensal")[0]), reais(696505));
  assert.match(txt(porData(r, "data-linha", "encargos")[0]), reais(169922));
  assert.match(txt(porData(r, "data-ganho", 0)[0]), /30%/);
  assert.match(txt(porData(r, "data-ganho-aplicado")[0]), /30%/);
  assert.equal(porData(r, "data-abaixo-ganho").length, 0);
  // o campo do ganho vem preenchido com o padrão e o gestor não manda nada enquanto não mexer
  assert.equal(porData(r, "data-campo", "ganho")[0].props.value, "30");
  assert.equal(dasPrevias()[0].corpo.conteudo.ganho_bp, null);
  assert.equal(ultimaPrevia?.erro, null);
});
await caso("PRÉVIA (vendedor): vê SÓ função, quantidade, valor mensal por posto e total; nada de custo, decomposição, ganho, percentual; não consulta os percentuais", async () => {
  servidor.gestor = false;
  try {
    const r = await montar(formAux(), false);
    await esperar(DEBOUNCE);
    assert.match(txt(porData(r, "data-valor-posto", "0-0")[0]), reais(696505));
    assert.match(txt(porData(r, "data-total-mensal")[0]), reais(696505));
    for (const attr of ["data-decomposicao", "data-ganho", "data-ganho-aplicado", "data-custo-servico", "data-custo-efetivo", "data-linha", "data-campo-ganho"]) assert.equal(porData(r, attr).length, 0, attr);
    assert.doesNotMatch(txt(porData(r, "data-previa-ts")[0]), /%|ganho|custo|encargos|pontos-base/i);
    assert.deepEqual(Object.keys(dasPrevias()[0].corpo.conteudo).sort(), ["cargo_supervisao", "clausulas_adicionais", "condicoes", "servicos", "texto_introdutorio"], "vendedor não manda ganho nem justificativa");
    assert.equal("justificativa_preco_manual" in dasPrevias()[0].corpo.conteudo.servicos[0], false);
    assert.equal(chamadas.filter((c) => c.url.includes("/ts/parametros")).length, 0);
  } finally { servidor.gestor = true; }
});
await caso("DEBOUNCE e DESCARTE: três digitações seguidas = UMA consulta; uma resposta lenta que chega depois da digitação nova é descartada (vale só o último valor)", async () => {
  const r = await montar(formAux({ salario: 1000 }));
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ salario: 1100 })] })); });
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ salario: 1200 })] })); });
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ salario: 1300 })] })); });
  await esperar(DEBOUNCE);
  assert.equal(dasPrevias().length, 1, "uma consulta por pausa");
  assert.equal(dasPrevias()[0].corpo.conteudo.servicos[0].postos[0].salario_centavos, 130000);
  // resposta lenta (700 ms) da 1ª; a 2ª digitação chega antes dela voltar
  chamadas = []; atrasos = [700, 0];
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ salario: 1000 })] })); });
  await esperar(DEBOUNCE); // a consulta lenta já saiu e está pendente
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ salario: 2000 })] })); });
  await esperar(DEBOUNCE + 200);
  await esperar(500); // a resposta lenta chega agora
  assert.equal(dasPrevias().length, 2);
  const esperado = await previaTs(svcComParametros(PAR_PRECO), { gestor: true, podeEscrever: true } as any, conteudoTsDoForm(formAux({ salario: 2000 }), { gestor: true }));
  assert.ok(esperado.ok);
  assert.equal(ultimaPrevia?.previa?.planilha.total_mensal_centavos, esperado.ok ? esperado.data.planilha.total_mensal_centavos : -1, "a tela mostra o cálculo do ÚLTIMO valor");
  assert.match(txt(porData(r, "data-total-mensal")[0]), reais(esperado.ok ? esperado.data.planilha.total_mensal_centavos : 0));
});
await caso("ERRO AMIGÁVEL: ganho não configurado (422) fica em destaque; o gestor vê o link 'Configurar percentuais', o vendedor NÃO; o salvar fica bloqueado com a mensagem da rota", async () => {
  servidor.par = { ...PARAMETROS_TS_INICIAIS };
  try {
    const r = await montar(formAux());
    await esperar(DEBOUNCE);
    assert.equal(ultimaPrevia?.status, 422);
    assert.match(textoDe(r), /O percentual de ganho da Terceirização ainda não foi configurado pela diretoria\./);
    const link = porData(r, "data-configurar-percentuais");
    assert.equal(link.length, 1);
    assert.equal(link[0].props.href, URL_CONFIGURAR_PERCENTUAIS_TS);
    assert.equal(bloqueioTs(ultimo, ultimaPrevia!, true), MSG_GANHO_TS_NAO_CONFIGURADO);
    // o gestor que informa o ganho na própria proposta calcula mesmo sem padrão
    await act(async () => { porData(r, "data-campo", "ganho")[0].props.onChange({ target: { value: "30" } }); });
    await esperar(DEBOUNCE);
    assert.equal(ultimaPrevia?.erro, null);
    assert.match(txt(porData(r, "data-total-mensal")[0]), reais(696505));
    servidor.gestor = false;
    const v = await montar(formAux(), false);
    await esperar(DEBOUNCE);
    assert.match(textoDe(v), /ainda não foi configurado pela diretoria/);
    assert.equal(porData(v, "data-configurar-percentuais").length, 0, "vendedor não recebe o link");
  } finally { servidor.par = PAR_PRECO; servidor.gestor = true; }
});
await caso("403 vira mensagem amigável: o vendedor que mexe no preço manual recebe 'Só a diretoria pode informar o preço manual.' (não vê o campo); rede fora do ar vira mensagem simples", async () => {
  servidor.gestor = false;
  try {
    const r = await montar(formAux({ preco_manual: 8000 }), false);
    await esperar(DEBOUNCE);
    assert.equal(ultimaPrevia?.status, 403);
    assert.match(textoDe(r), /Só a diretoria pode informar o preço manual\./);
    assert.equal(porData(r, "data-campos-diretoria").length, 0);
  } finally { servidor.gestor = true; }
  const anterior = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => { throw new Error("rede"); };
  try {
    const r2 = await montar(formAux());
    await esperar(DEBOUNCE);
    assert.match(textoDe(r2), /Não foi possível calcular os valores/);
    assert.ok(ultimaPrevia?.erro);
  } finally { (globalThis as any).fetch = anterior; }
});
await caso("GANHO MÍNIMO (gestor): abaixo do mínimo aparece o aviso e a justificativa NA HORA; salvar fica bloqueado até justificar; a justificativa vai no conteúdo", async () => {
  const r = await montar(formAux({ preco_manual: 5000 }));
  await esperar(DEBOUNCE);
  assert.equal(ultimaPrevia?.erro, null);
  assert.equal(porData(r, "data-abaixo-ganho").length, 1);
  assert.match(txt(porData(r, "data-abaixo-ganho")[0]), /Abaixo do ganho mínimo \(20%\)/);
  assert.match(txt(porData(r, "data-ganho", 0)[0]), /^-/, "ganho negativo mostrado com sinal");
  assert.equal(porData(r, "data-justificativa-ganho").length, 1);
  assert.equal(bloqueioTs(ultimo, ultimaPrevia!, true), MSG_JUSTIFICATIVA_GANHO);
  const area = r.root.findAll((n) => n.type === "textarea" && n.props.maxLength === 500)[0];
  await act(async () => { area.props.onChange({ target: { value: "Cliente estratégico." } }); });
  assert.equal(bloqueioTs(ultimo, ultimaPrevia!, true), null);
  assert.equal((conteudoTsDoForm(ultimo, { gestor: true }) as any).justificativa_ganho_minimo, "Cliente estratégico.");
  // dentro do mínimo: nada disso aparece
  const ok = await montar(formAux());
  await esperar(DEBOUNCE);
  assert.equal(porData(ok, "data-justificativa-ganho").length, 0);
});
await caso("GANHO MÍNIMO (vendedor): abaixo do mínimo = bloqueio com a MENSAGEM DA ROTA (só a diretoria libera), sem campo de justificativa e sem mostrar ganho", async () => {
  servidor.par = PAR_ABAIXO;
  servidor.gestor = false;
  try {
    const r = await montar(formAux(), false);
    await esperar(DEBOUNCE);
    assert.equal(ultimaPrevia?.status, 422);
    assert.match(textoDe(r), /preço ficou abaixo do mínimo definido pela diretoria .* Só a diretoria pode liberar/);
    assert.equal(porData(r, "data-justificativa-ganho").length, 0);
    assert.equal(porData(r, "data-ganho").length, 0);
    assert.ok(bloqueioTs(ultimo, ultimaPrevia!, false));
    // o gestor, com os MESMOS percentuais, calcula normalmente e passa a precisar da justificativa
    servidor.gestor = true;
    const g = await montar(formAux(), true);
    await esperar(DEBOUNCE);
    assert.equal(ultimaPrevia?.erro, null);
    assert.equal(porData(g, "data-justificativa-ganho").length, 1);
  } finally { servidor.par = PAR_PRECO; servidor.gestor = true; }
});
await caso("CAMPOS DA DIRETORIA: preço manual e ganho sobre o custo só existem para o gestor; não há ISS, cobertura, tributos, despesas ou lucro; o ganho digitado vai em pontos-base (28,6% = 2860)", async () => {
  const g = await montar(formAux({ preco_manual: 8000, justificativa_preco_manual: "Anual" }, { ganho: "28,6" }), true);
  assert.equal(porData(g, "data-campos-diretoria").length, 1);
  assert.equal(porData(g, "data-campo-ganho").length, 1);
  assert.equal(porData(g, "data-campo", "ganho")[0].props.value, "28,6");
  assert.doesNotMatch(textoDe(g), /ISS|Cobertura|tributos|despesas|lucro/i);
  const c = conteudoTsDoForm(ultimo, { gestor: true }) as any;
  assert.equal(c.ganho_bp, 2860);
  assert.equal(c.servicos[0].preco_manual_centavos, 800000);
  assert.ok(conteudoTsSchema.safeParse(c).success);
  // texto que não é percentual é recusado pelo servidor, em vez de cair no padrão sem ninguém ver
  assert.equal(conteudoTsSchema.safeParse(conteudoTsDoForm({ ...ultimo, ganho: "28,605" }, { gestor: true })).success, false);
  // apagar o campo e sair volta ao padrão
  await act(async () => { porData(g, "data-campo", "ganho")[0].props.onChange({ target: { value: "" } }); });
  await act(async () => { porData(g, "data-campo", "ganho")[0].props.onBlur(); });
  await esperar(DEBOUNCE);
  assert.equal(ultimo.ganho, null);
  assert.equal((conteudoTsDoForm(ultimo, { gestor: true }) as any).ganho_bp, null);
  const v = await montar(formAux({ preco_manual: 8000, justificativa_preco_manual: "Anual" }, { ganho: "28,6" }), false);
  assert.equal(porData(v, "data-campos-diretoria").length + porData(v, "data-campo-ganho").length, 0);
  assert.doesNotMatch(textoDe(v), /Preço manual|Ganho sobre o custo|Só a diretoria/);
  const cv = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.equal("ganho_bp" in cv, false);
  assert.equal("justificativa_preco_manual" in cv.servicos[0], false, "vendedor não manda a justificativa (o servidor devolve a gravada)");
  assert.equal(cv.servicos[0].preco_manual_centavos, 800000, "o preço manual que a diretoria definiu viaja escondido para a edição não apagá-lo");
});
await caso("GANHO ZERO: o gestor que digita 0% vê o aviso vermelho (o cálculo segue, sujeito ao mínimo); sem digitar ou com ganho positivo não há aviso", async () => {
  const r = await montar(formAux());
  await esperar(DEBOUNCE);
  assert.equal(porData(r, "data-ganho-zero").length, 0);
  await act(async () => { porData(r, "data-campo", "ganho")[0].props.onChange({ target: { value: "0" } }); });
  await esperar(DEBOUNCE);
  const aviso = porData(r, "data-ganho-zero")[0];
  assert.equal(txt(aviso), "Ganho zero: o preço será igual ao custo");
  assert.equal(aviso.props.style.color, "#B91C1C");
  assert.match(txt(porData(r, "data-total-mensal")[0]), reais(535773), "preço igual ao custo");
  assert.equal(porData(r, "data-justificativa-ganho").length, 1, "0% está abaixo do mínimo de 20%");
  await act(async () => { porData(r, "data-campo", "ganho")[0].props.onChange({ target: { value: "0,01" } }); });
  assert.equal(porData(r, "data-ganho-zero").length, 0);
});
await caso("VÁRIOS POSTOS: adicionar, duplicar (cópia com os mesmos dados) e remover COM CONFIRMAÇÃO (remover só pede; 'Manter' cancela; 'Sim, remover' remove); limite de 10; o último posto não se remove", async () => {
  const r = await montar(formAux());
  assert.equal(botaoPorLabel(r, "Remover posto 1")?.props.disabled, true, "com 1 posto não dá para remover");
  await clicar(botaoPorTexto(r, "Adicionar posto"));
  assert.equal(ultimo.itens.length, 2);
  await clicar(botaoPorLabel(r, "Duplicar posto 1"));
  assert.equal(ultimo.itens.length, 3);
  assert.equal((ultimo.itens[1] as PostoForm).nome, "Auxiliar de Limpeza");
  assert.equal((ultimo.itens[1] as PostoForm).salario, 1837.4);
  assert.notEqual(ultimo.itens[1], ultimo.itens[0], "a cópia é independente");
  await act(async () => { definir((v) => ({ ...v, itens: v.itens.map((it, i) => (i === 1 ? { ...(it as PostoForm), nome: "Copia" } : it)) })); });
  assert.equal((ultimo.itens[0] as PostoForm).nome, "Auxiliar de Limpeza", "editar a cópia não muda o original");
  await clicar(botaoPorLabel(r, "Remover posto 2"));
  assert.equal(ultimo.itens.length, 3, "só pediu a confirmação");
  assert.match(textoDe(r), /Remover o posto 2 ?\?/);
  await clicar(botaoPorLabel(r, "Manter o posto"));
  assert.equal(ultimo.itens.length, 3);
  await clicar(botaoPorLabel(r, "Remover posto 2"));
  await clicar(botaoPorLabel(r, "Confirmar remoção do posto 2"));
  assert.equal(ultimo.itens.length, 2);
  assert.notEqual((ultimo.itens[1] as PostoForm).nome, "Copia");
  for (let i = ultimo.itens.length; i < 10; i++) await clicar(botaoPorTexto(r, "Adicionar posto"));
  assert.equal(ultimo.itens.length, 10);
  assert.equal(botaoPorTexto(r, "Adicionar posto")?.props.disabled, true);
  assert.match(textoDe(r), /limite de 10/);
  assert.equal(botaoPorLabel(r, "Duplicar posto 1")?.props.disabled, true);
});
await caso("VÁRIOS POSTOS na prévia: só os postos completos vão ao servidor (o incompleto não derruba o cálculo) e o TOTAL MENSAL soma os postos; o aviso de ganho aponta para o posto certo", async () => {
  const r = await montar(formAux());
  await act(async () => { definir((v) => ({ ...v, itens: [...v.itens, postoTsNovo(), AUX({ nome: "Copeira", efetivos: "2", preco_manual: 5000 })] })); });
  await esperar(DEBOUNCE);
  const enviado = dasPrevias()[dasPrevias().length - 1].corpo.conteudo.servicos;
  assert.equal(enviado.length, 2, "o posto em branco ficou de fora");
  assert.deepEqual(ultimaPrevia?.mapa, [0, 2]);
  assert.equal(porData(r, "data-servico").length, 2);
  assert.match(txt(porData(r, "data-valor-servico", 0)[0]), reais(696505));
  assert.equal(porData(r, "data-abaixo-ganho-posto").length, 1);
  assert.equal(porData(r, "data-abaixo-ganho-posto")[0].props["data-abaixo-ganho-posto"], 2, "o aviso aparece no posto 3 (índice 2) do formulário");
  const soma = ultimaPrevia!.previa!.planilha.servicos.reduce((t, s) => t + s.preco_centavos, 0);
  assert.equal(ultimaPrevia!.previa!.planilha.total_mensal_centavos, soma);
});
await caso("QUEM PAGA: cada benefício, uniforme/EPI e insumos tem o interruptor (Salmazos | Cliente); do cliente sai do custo e fica 'fornecido pelo cliente'; a operação não tem interruptor", async () => {
  const r = await montar(formAux({ insumos: 300 }));
  await esperar(DEBOUNCE);
  const seletor = (campo: string) => porData(r, "data-quem-paga", campo)[0];
  assert.equal(porData(r, "data-quem-paga").length, 5, "3 benefícios + uniforme + insumos");
  assert.equal(r.root.findAllByType(CampoMoeda).length, 10, "gestor: salário, 2 adicionais, 3 benefícios, uniforme, insumos, operação e preço manual");
  assert.match(txt(porData(r, "data-custo-efetivo", "0-0")[0]), reais(565773));
  let post = dasPrevias()[dasPrevias().length - 1].corpo.conteudo.servicos[0].postos[0];
  assert.deepEqual([post.insumos_quem_paga, post.uniforme_epi_quem_paga, post.beneficios[1].quem_paga], ["salmazos", "salmazos", "salmazos"]);
  for (const campo of ["insumos", "uniforme", "beneficio-1"]) await act(async () => { seletor(campo).props.onChange({ target: { value: "cliente" } }); });
  await esperar(DEBOUNCE);
  post = dasPrevias()[dasPrevias().length - 1].corpo.conteudo.servicos[0].postos[0];
  assert.deepEqual([post.insumos_quem_paga, post.uniforme_epi_quem_paga, post.beneficios[1].quem_paga], ["cliente", "cliente", "cliente"]);
  assert.match(txt(porData(r, "data-custo-efetivo", "0-0")[0]), reais(565773 - 30000 - 10000 - 48000));
  for (const chave of ["insumos", "uniforme_epi", "beneficio_2"]) assert.equal(porData(r, "data-fornecido-cliente", chave).length, 1, chave);
  assert.equal(porData(r, "data-fornecido-cliente", "operacao").length, 0);
  // benefício do cliente sem valor continua registrado; da Salmazos sem valor é ignorado
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ beneficios: [{ tipo: "assistencia_medica", rotulo: "", valor: 0, quem_paga: "cliente" }, { tipo: "ajuda_de_custo", rotulo: "", valor: 0, quem_paga: "salmazos" }] })] })); });
  const c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.deepEqual(c.servicos[0].postos[0].beneficios, [{ tipo: "assistencia_medica", quem_paga: "cliente", valor_centavos: 0 }]);
  assert.ok(conteudoTsSchema.safeParse(c).success);
});
await caso("CAMPOS DO POSTO: escala 'Outra' pede descrição; horas semanais sugerem as mensais (× 5) e ambas seguem editáveis; adicional em % vira pontos-base; linhas sem valor são ignoradas; tudo passa no schema do servidor", async () => {
  const r = await montar(formAux({ adicionais: [], beneficios: [] }));
  await act(async () => { porData(r, "data-campo", "horas_semanais")[0].props.onChange({ target: { value: "36" } }); });
  assert.equal((ultimo.itens[0] as PostoForm).horas_mensais, "180");
  await act(async () => { porData(r, "data-campo", "horas_mensais")[0].props.onChange({ target: { value: "200" } }); });
  assert.equal((ultimo.itens[0] as PostoForm).horas_mensais, "200");
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ escala: "outra", escala_texto: "", adicionais: [{ tipo: "noturno", modo: "percentual", percentual: "20" }, { tipo: "gratificacao", modo: "valor", valor: 0, percentual: "" }, { tipo: "periculosidade", modo: "percentual", percentual: "" }], beneficios: [{ tipo: "refeicao", rotulo: "", valor: 0, quem_paga: "salmazos" }] })] })); });
  assert.match(textoDe(r), /Descrição da escala/);
  let c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.equal(conteudoTsSchema.safeParse(c).success, false, "escala 'outra' sem descrição é recusada");
  await act(async () => { definir((v) => ({ ...v, itens: [{ ...(v.itens[0] as PostoForm), escala_texto: "12x36 noturna" }] })); });
  c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.deepEqual(c.servicos[0].postos[0].adicionais, [{ tipo: "noturno", modo: "percentual", percentual_bp: 2000 }]);
  assert.deepEqual(c.servicos[0].postos[0].beneficios, []);
  assert.equal(c.servicos[0].postos[0].escala_texto, "12x36 noturna");
  assert.ok(conteudoTsSchema.safeParse(c).success, JSON.stringify(conteudoTsSchema.safeParse(c)));
  // serviço = função (nome do serviço e função do posto); escopo opcional vira descrição
  const f = formAux({ escopo: "  limpeza geral  " });
  const s = (conteudoTsDoForm(f, { gestor: false }) as any).servicos[0];
  assert.equal(s.nome, "Auxiliar de Limpeza");
  assert.equal(s.postos[0].funcao, "Auxiliar de Limpeza");
  assert.equal(s.descricao, "limpeza geral");
  assert.equal((conteudoTsDoForm(formAux(), { gestor: false }) as any).servicos[0].descricao, null);
});
await caso("RÓTULO de 'Outro': o campo de texto só aparece ao escolher Outro (adicional e benefício); sem preencher o servidor recusa e a prévia espera; preenchido aparece na planilha e o valor é o mesmo de um tipo fixo; tipo fixo não manda rótulo; ida e volta na edição; caso de referência intacto", async () => {
  const r = await montar(formAux());
  await esperar(DEBOUNCE);
  assert.equal(porData(r, "data-rotulo-adicional").length, 0);
  assert.equal(porData(r, "data-rotulo-beneficio").length, 0);
  assert.match(txt(porData(r, "data-total-mensal")[0]), reais(696505), "caso de referência: total R$ 6.965,05");
  const select = (label: string) => r.root.findAll((n) => n.type === "select" && n.props["aria-label"] === label)[0];
  // Adicional 'Outro' com valor mas SEM rótulo: o servidor recusa e o posto ainda não vai para a prévia.
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ adicionais: [...AUX().adicionais, { tipo: "gratificacao", rotulo: "", modo: "valor", valor: 100, percentual: "" }] })] })); });
  await act(async () => { select("Tipo do adicional 3").props.onChange({ target: { value: "outro" } }); });
  await esperar(DEBOUNCE);
  const campo = porData(r, "data-rotulo-adicional", 2)[0];
  assert.ok(campo, "campo do rótulo aparece ao escolher Outro");
  assert.equal(campo.props.maxLength, 60);
  assert.equal(porData(r, "data-rotulo-adicional").length, 1, "só na linha 'Outro'");
  let c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.equal(c.servicos[0].postos[0].adicionais[2].rotulo, "");
  const sem = conteudoTsSchema.safeParse(c);
  assert.equal(sem.success, false);
  assert.match(JSON.stringify(sem.error?.issues), /Descreva o adicional escolhido como \\"Outro\\"/);
  assert.equal(postoTsPronto(ultimo.itens[0] as PostoForm), false, "posto com 'Outro' sem descrição não é enviado à prévia");
  // Preenche: vai no conteúdo, passa no schema e aparece na planilha com o mesmo valor de um tipo fixo.
  const antes = dasPrevias().length;
  await act(async () => { campo.props.onChange({ target: { value: "Adicional de risco" } }); });
  await esperar(DEBOUNCE);
  assert.equal(dasPrevias().length, antes + 1);
  c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.equal(c.servicos[0].postos[0].adicionais[2].rotulo, "Adicional de risco");
  assert.ok(conteudoTsSchema.safeParse(c).success, JSON.stringify(conteudoTsSchema.safeParse(c)));
  assert.match(textoDe(r), /Adicional de risco/);
  const totalOutro = txt(porData(r, "data-total-mensal")[0]);
  await act(async () => { select("Tipo do adicional 3").props.onChange({ target: { value: "gratificacao" } }); });
  await esperar(DEBOUNCE);
  assert.equal(txt(porData(r, "data-total-mensal")[0]), totalOutro, "o rótulo não entra no cálculo");
  assert.equal(porData(r, "data-rotulo-adicional").length, 0, "voltou a tipo fixo: o campo some");
  assert.ok(!("rotulo" in (conteudoTsDoForm(ultimo, { gestor: false }) as any).servicos[0].postos[0].adicionais[2]), "tipo fixo não manda rótulo");
  assert.doesNotMatch(textoDe(r), /Adicional de risco/);
  // Benefício 'Outro': mesmo comportamento.
  await act(async () => { definir((v) => ({ ...v, itens: [AUX({ beneficios: [...AUX().beneficios, { tipo: "cesta_basica", rotulo: "", valor: 50, quem_paga: "salmazos" }] })] })); });
  await act(async () => { select("Tipo do benefício 4").props.onChange({ target: { value: "outro" } }); });
  assert.equal(porData(r, "data-rotulo-beneficio", 3).length, 1);
  c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.match(JSON.stringify(conteudoTsSchema.safeParse(c).error?.issues), /Descreva o benefício escolhido como \\"Outro\\"/);
  await act(async () => { porData(r, "data-rotulo-beneficio", 3)[0].props.onChange({ target: { value: "Plano odontológico" } }); });
  await esperar(DEBOUNCE);
  assert.match(textoDe(r), /Plano odontológico/);
  // Ida e volta: o rótulo gravado volta ao formulário.
  c = conteudoTsDoForm(ultimo, { gestor: false }) as any;
  assert.ok(conteudoTsSchema.safeParse(c).success);
  const volta = camposTsDeProposta({ aos_cuidados: null, validade_dias: 15, conteudo: c });
  assert.equal((volta.itens[0] as PostoForm).beneficios[3].rotulo, "Plano odontológico");
  assert.equal((volta.itens[0] as PostoForm).beneficios[3].tipo, "outro");
});

await caso("EDIÇÃO: o conteúdo gravado volta ao formulário igual (ida e volta); serviço fechado e serviço com vários postos ficam preservados como estão, sem edição", () => {
  const original = conteudoTsDoForm(formAux({ preco_manual: 8000, justificativa_preco_manual: "Anual", insumos: 300, insumos_quem_paga: "cliente", uniforme_quem_paga: "cliente", escopo: "geral" }, { ganho: "28,6", justificativa_ganho: "ok" }), { gestor: true }) as any;
  const fechado = { modo: "fechado", nome: "Jardinagem", descricao: null, fechado: { descricao: "Contrato fechado", custo_centavos: 100000 }, preco_manual_centavos: null, justificativa_preco_manual: null };
  const doisPostos = { ...original.servicos[0], nome: "Dois postos", postos: [original.servicos[0].postos[0], original.servicos[0].postos[0]] };
  const bruto = { ...original, servicos: [original.servicos[0], fechado, doisPostos] };
  assert.ok(conteudoTsSchema.safeParse(bruto).success);
  const form = camposTsDeProposta({ aos_cuidados: "Ana", validade_dias: 15, conteudo: bruto });
  assert.equal(form.itens.length, 3);
  assert.deepEqual(form.itens.map((i) => i.kind), ["posto", "bloco", "bloco"]);
  assert.deepEqual(conteudoTsDoForm(form, { gestor: true }), bruto);
  assert.equal(form.ganho, "28,6");
  assert.equal(form.justificativa_ganho, "ok");
  assert.deepEqual([(form.itens[0] as PostoForm).insumos_quem_paga, (form.itens[0] as PostoForm).uniforme_quem_paga], ["cliente", "cliente"]);
  // o que o servidor filtra para o vendedor (sem ganho, sem justificativas) não derruba a tela
  const { ganho_bp: _a, justificativa_ganho_minimo: _b, ...semOcultos } = bruto;
  const filtrado = { ...semOcultos, servicos: bruto.servicos.map(({ justificativa_preco_manual: _c, ...s }: any) => s) };
  const formV = camposTsDeProposta({ aos_cuidados: "Ana", validade_dias: 15, conteudo: filtrado });
  assert.equal(formV.ganho, null);
  assert.equal((conteudoTsDoForm(formV, { gestor: false }) as any).servicos[0].preco_manual_centavos, 800000);
});

// ═══ Nova proposta ═══════════════════════════════════════════════════════════
const EMPRESA_REAL = { id: "e-real", nome: "Pastifício Selmi", contatos: [{ id: "c1", nome: "Ana", cargo: null, principal: true }], teste: false };
const EMPRESA_TESTE = { id: "e-teste", nome: "cliente teste", contatos: [], teste: true };
const botaoModelo = (r: TestRenderer.ReactTestRenderer, m: string) => r.root.findAll((n) => n.type === "button" && n.props["data-modelo"] === m)[0];
const escolherEmpresa = async (r: TestRenderer.ReactTestRenderer, nome: string) => { await clicar(botoes(r).find((b) => txt(b).includes(nome))); };
async function montarNova(gestor: boolean, empresas: unknown[]) {
  chamadas = []; atrasos = [];
  (globalThis as any).__ROUTER__ = [];
  const navegou: string[] = (globalThis as any).__ROUTER__;
  responder = (c) => {
    if (c.metodo === "POST" && c.url === "/api/comercial/propostas") return { status: 201, corpo: { data: { id: "novo" }, aviso: null } };
    return { status: 200, corpo: { data: empresas } };
  };
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PropostaNovaClient, { meuNome: "Olver", gestor })); });
  vivos.push(r);
  await esperar(20);
  return { r, navegou };
}
const digitarNovo = async (r: TestRenderer.ReactTestRenderer, nome: string, salario: number) => {
  await act(async () => { r.root.findAll((n) => n.type === "input" && n.props.placeholder === "Ex.: Auxiliar de Limpeza")[0].props.onChange({ target: { value: nome } }); });
  await act(async () => { r.root.findAllByType(CampoMoeda)[0].props.onChange(salario); });
  await esperar(DEBOUNCE);
};
await caso("NOVA PROPOSTA (vendedor): TS segue 'Em breve' e desabilitado, mesmo com empresa escolhida; só o R&S está disponível", async () => {
  servidor.gestor = false;
  try {
    const { r } = await montarNova(false, [EMPRESA_REAL]);
    await escolherEmpresa(r, "Pastifício Selmi");
    assert.match(txt(botaoModelo(r, "TS")), /Em breve/);
    assert.equal(botaoModelo(r, "TS").props.disabled, true);
    assert.match(textoDe(r), /CNPJ do cliente/);
  } finally { servidor.gestor = true; }
});
await caso("NOVA PROPOSTA (gestor): TS aparece como 'Em teste', só habilita com empresa de TESTE (empresa real = desabilitado); trocar para empresa real volta ao R&S sozinho", async () => {
  const { r } = await montarNova(true, [EMPRESA_REAL, EMPRESA_TESTE]);
  assert.match(txt(botaoModelo(r, "TS")), /Em teste/);
  assert.equal(botaoModelo(r, "TS").props.disabled, true);
  await escolherEmpresa(r, "Pastifício Selmi");
  assert.match(txt(botaoModelo(r, "TS")), /escolha uma empresa de teste/);
  assert.equal(botaoModelo(r, "TS").props.disabled, true);
  await clicar(botoes(r).find((b) => txt(b).includes("Trocar empresa")));
  await escolherEmpresa(r, "cliente teste");
  assert.equal(botaoModelo(r, "TS").props.disabled, false);
  await clicar(botaoModelo(r, "TS"));
  assert.match(textoDe(r), /TESTE-TS/);
  await clicar(botoes(r).find((b) => txt(b).includes("Trocar empresa")));
  await escolherEmpresa(r, "Pastifício Selmi");
  assert.match(textoDe(r), /CNPJ do cliente/);
});
await caso("NOVA PROPOSTA (gestor, empresa de teste): cria com POST de modelo TS, dinheiro em CENTAVOS, conteúdo que o servidor aceita, e vai para o detalhe", async () => {
  const { r, navegou } = await montarNova(true, [EMPRESA_TESTE]);
  await escolherEmpresa(r, "cliente teste");
  await clicar(botaoModelo(r, "TS"));
  await digitarNovo(r, "Auxiliar de Limpeza", 1837.4);
  assert.match(txt(porData(r, "data-total-mensal")[0]), /R\$/);
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  await esperar(120);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
  assert.ok(post, "criou");
  assert.equal(post.corpo.modelo, "TS");
  assert.equal(post.corpo.empresa_visitada_id, "e-teste");
  assert.equal(post.corpo.conteudo.servicos[0].postos[0].salario_centavos, 183740);
  assert.equal(post.corpo.conteudo.servicos[0].postos[0].horas_mensais, 220);
  assert.ok(conteudoTsSchema.safeParse(post.corpo.conteudo).success);
  assert.deepEqual([...navegou], ["push:/painel/comercial/propostas/novo"]);
});
await caso("NOVA PROPOSTA TS sem ganho configurado: mostra a mensagem do servidor e o 'Criar rascunho' fica desabilitado (nenhuma proposta é criada); ganho abaixo do mínimo exige a justificativa antes de criar", async () => {
  servidor.par = { ...PARAMETROS_TS_INICIAIS };
  try {
    const { r } = await montarNova(true, [EMPRESA_TESTE]);
    await escolherEmpresa(r, "cliente teste");
    await clicar(botaoModelo(r, "TS"));
    await digitarNovo(r, "Auxiliar", 1500);
    assert.match(textoDe(r), /ainda não foi configurado pela diretoria/);
    assert.equal(botaoPorTexto(r, "Criar rascunho")?.props.disabled, true);
    await clicar(botaoPorTexto(r, "Criar rascunho"));
    assert.equal(chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas").length, 0);
  } finally { servidor.par = PAR_PRECO; }
  servidor.par = PAR_ABAIXO;
  try {
    const { r } = await montarNova(true, [EMPRESA_TESTE]);
    await escolherEmpresa(r, "cliente teste");
    await clicar(botaoModelo(r, "TS"));
    await digitarNovo(r, "Auxiliar", 1500);
    assert.equal(porData(r, "data-justificativa-ganho").length, 1);
    assert.equal(botaoPorTexto(r, "Criar rascunho")?.props.disabled, true, "sem justificativa não cria");
    await act(async () => { r.root.findAll((n) => n.type === "textarea" && n.props.maxLength === 500)[0].props.onChange({ target: { value: "Cliente estratégico" } }); });
    assert.notEqual(botaoPorTexto(r, "Criar rascunho")?.props.disabled, true);
    await clicar(botaoPorTexto(r, "Criar rascunho"));
    await esperar(120);
    const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
    assert.equal(post.corpo.conteudo.justificativa_ganho_minimo, "Cliente estratégico");
  } finally { servidor.par = PAR_PRECO; }
});

// ═══ Detalhe do TS ═══════════════════════════════════════════════════════════
const CONTEUDO_TS = conteudoTsDoForm(formAux({ escopo: "limpeza geral" }), { gestor: false }) as any;
const detalheTs = (extra: Partial<DetalheTs> = {}): DetalheTs => ({
  id: "p1", numero: "TESTE-TS-0001/26", modelo: "TS", revisao_atual: 0, situacao: "rascunho", cliente_nome: "cliente teste", aos_cuidados: "Ana", empresa_visitada_id: null, conteudo: CONTEUDO_TS,
  validade_dias: 10, validade_ate: null, valor_estimado: null, enviada_em: null, updated_at: "2026-11-20T10:00:00Z", vendedor_nome: "Olver", vendedor_telefone: "1", revisoes: [], historico: [], teste: true, ...extra,
});
async function planilhaDoServidor(gestor: boolean, conteudo: any = CONTEUDO_TS, par: ParametrosTs = PAR_PRECO) {
  const res = await previaTs(svcComParametros(par), { gestor, podeEscrever: true } as any, conteudo);
  if (!res.ok) throw new Error(res.error);
  return res.data.planilha;
}
const propsDetalhe = (d: DetalheTs, planilha: unknown, extra: Record<string, unknown> = {}) => ({
  d, hoje: HOJE, gestor: false, podeEditar: true, somenteLeitura: false, temFunil: false, oportunidadeAbertaPropria: false,
  planilha: { origem: "hoje", planilha, erro: null }, aviso: null, onAviso: () => {}, onRecarregar: async () => {}, ...extra,
});
async function montarDetalhe(d: DetalheTs, planilha: unknown, extra: Record<string, unknown> = {}) {
  chamadas = []; atrasos = [];
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PropostaDetalheTs, propsDetalhe(d, planilha, extra) as any)); });
  vivos.push(r);
  return r;
}
await caso("DETALHE TS (rascunho, vendedor): postos, planilha com valores, condições, selo TESTE; 'Marcar como enviada' DESABILITADO com 'PDF da Terceirização ainda não disponível'; nenhum link de PDF; só preços", async () => {
  servidor.gestor = false;
  const planilha = await planilhaDoServidor(false);
  servidor.gestor = true;
  const r = await montarDetalhe(detalheTs(), planilha);
  const t = textoDe(r);
  assert.match(t, /TESTE-TS-0001\/26/);
  assert.match(t, /Terceirização de Serviços/);
  assert.match(t, /Auxiliar de Limpeza/);
  assert.match(t, /limpeza geral/);
  assert.match(t, /44h · 220 h\/mês/);
  assert.match(t, /Valor estimado R\$\s?6\.965,05 \(calculado hoje\)/);
  assert.match(txt(porData(r, "data-total-mensal")[0]), reais(696505));
  assert.match(t, /dia 15 e dia 30/);
  const enviar = porData(r, "data-marcar-enviada")[0];
  assert.equal(enviar.props.disabled, true);
  assert.equal(enviar.props.title, MSG_PDF_TS_INDISPONIVEL);
  assert.equal(MSG_PDF_TS_INDISPONIVEL, "PDF da Terceirização ainda não disponível");
  assert.match(txt(porData(r, "data-aviso-pdf")[0]), /PDF da Terceirização ainda não disponível/);
  assert.equal(r.root.findAll((n) => n.type === "a").length, 0, "nenhum link de PDF");
  assert.equal(porData(r, "data-ganho").length + porData(r, "data-decomposicao").length + porData(r, "data-custo-efetivo").length, 0);
  assert.doesNotMatch(txt(porData(r, "data-previa-ts")[0]), /custo|ganho|encargos/i);
  assert.ok(botaoPorTexto(r, "Editar") && botaoPorTexto(r, "Cancelar"));
  assert.equal(chamadas.length, 0);
});
await caso("DETALHE TS (gestor): vê decomposição de custo, ganho e o aviso 'Abaixo do ganho mínimo'; a liberação (quem e por quê) só aparece para ele", async () => {
  const planilha = await planilhaDoServidor(true, CONTEUDO_TS, PAR_ABAIXO);
  const liberacao: LiberacaoGanhoTs = { justificativa: "Cliente estratégico", servicos: [0], liberado_por_id: "g", liberado_por_nome: "Gestora Teste", liberado_em: "2026-11-20T12:00:00Z" };
  const r = await montarDetalhe(detalheTs(), { ...planilha, liberacao_ganho: liberacao }, { gestor: true });
  assert.equal(porData(r, "data-decomposicao").length, 1);
  assert.match(txt(porData(r, "data-linha", "encargos")[0]), reais(169922));
  assert.match(txt(porData(r, "data-ganho", 0)[0]), /30%/);
  assert.match(txt(porData(r, "data-abaixo-ganho", 0)[0]), /Abaixo do ganho mínimo/);
  assert.match(txt(porData(r, "data-liberacao-ganho")[0]), /Gestora Teste.*Cliente estratégico/);
  const v = await montarDetalhe(detalheTs(), { ...(await planilhaDoServidor(false)) });
  assert.equal(porData(v, "data-liberacao-ganho").length + porData(v, "data-abaixo-ganho").length, 0);
});
await caso("DETALHE TS enviada: revisões listadas SEM link de PDF; ações de situação aparecem; somente leitura esconde os botões; planilha da revisão", async () => {
  const revs = [{ id: "r1", revisao: 1, template_versao: 1, vendedor_nome: "Olver", created_at: "2026-11-20T12:00:00Z" }, { id: "r0", revisao: 0, template_versao: 1, vendedor_nome: "Olver", created_at: "2026-11-20T11:00:00Z" }];
  const enviada = detalheTs({ situacao: "enviada", revisao_atual: 1, valor_estimado: 6965.05, enviada_em: "2026-11-20T12:00:00Z", validade_ate: "2026-11-30", revisoes: revs });
  const planilha = await planilhaDoServidor(false);
  const r = await montarDetalhe(enviada, planilha);
  const t = textoDe(r);
  assert.match(t, /Rev\. 1.*\(atual\)/);
  assert.match(t, /Rev\. 0/);
  assert.equal(r.root.findAll((n) => n.type === "a").length, 0);
  assert.ok(botaoPorTexto(r, "Aceita") && botaoPorTexto(r, "Recusada"));
  assert.equal(porData(r, "data-marcar-enviada").length, 0);
  const rev = await montarDetalhe(enviada, planilha, { planilha: { origem: "revisao", planilha, erro: null } });
  assert.match(textoDe(rev), /Planilha desta revisão/);
  const leitura = await montarDetalhe(enviada, planilha, { somenteLeitura: true });
  assert.match(textoDe(leitura), /somente leitura/);
  assert.equal(botaoPorTexto(leitura, "Aceita"), undefined);
  assert.equal(botaoPorTexto(leitura, "Editar"), undefined);
});
await caso("DETALHE TS sem planilha (ganho não configurado): mostra o aviso; o link 'Configurar percentuais' só para o gestor", async () => {
  const sem = { origem: "hoje", planilha: null, erro: MSG_GANHO_TS_NAO_CONFIGURADO };
  const g = await montarDetalhe(detalheTs(), null, { planilha: sem, gestor: true });
  assert.match(textoDe(g), /ainda não foi configurado pela diretoria/);
  assert.equal(porData(g, "data-total-mensal").length, 0);
  const linksG = g.root.findAll((n) => n.props["data-configurar-percentuais"] !== undefined);
  assert.ok(linksG.length >= 1, "gestor vê o link");
  assert.equal(linksG[0].props.href, URL_CONFIGURAR_PERCENTUAIS_TS);
  const v = await montarDetalhe(detalheTs(), null, { planilha: sem, gestor: false });
  assert.match(textoDe(v), /ainda não foi configurado pela diretoria/);
  assert.equal(v.root.findAll((n) => n.props["data-configurar-percentuais"] !== undefined).length, 0);
});
await caso("DETALHE TS: editar abre o formulário com os dados salvos; salvar manda PATCH com updated_at e centavos; 403 e erros do servidor aparecem sem fechar a edição; vendedor não manda ganho", async () => {
  servidor.gestor = false;
  try {
    responder = (c) => (c.metodo === "PATCH" ? { status: 200, corpo: { data: {} } } : { status: 200, corpo: { data: [] } });
    const r = await montarDetalhe(detalheTs({ empresa_visitada_id: "e1" }), await planilhaDoServidor(false));
    responder = (c) => (c.metodo === "PATCH" ? { status: 200, corpo: { data: {} } } : { status: 200, corpo: { data: [] } });
    await clicar(botaoPorTexto(r, "Editar"));
    await esperar(DEBOUNCE);
    assert.equal(r.root.findAllByType(CampoMoeda).length, 9, "vendedor: salário, 2 adicionais, 3 benefícios, uniforme, insumos e operação (sem preço manual)");
    assert.match(textoDe(r), /Cálculo do valor mensal/);
    assert.equal(porData(r, "data-campos-diretoria").length, 0);
    await clicar(botaoPorTexto(r, "Salvar"));
    await esperar(20);
    const patch = chamadas.find((c) => c.metodo === "PATCH")!;
    assert.equal(patch.url, "/api/comercial/propostas/p1");
    // a prévia da edição diz qual proposta é (o servidor usa o ganho e o preço manual gravados)
    assert.deepEqual([dasPrevias()[0].corpo.proposta_id, dasPrevias()[0].corpo.posicoes], ["p1", [0]]);
    assert.equal(patch.corpo.updated_at, "2026-11-20T10:00:00Z");
    assert.equal(patch.corpo.conteudo.servicos[0].postos[0].salario_centavos, 183740);
    assert.equal("ganho_bp" in patch.corpo.conteudo, false);
    assert.ok(conteudoTsSchema.safeParse(patch.corpo.conteudo).success);
    // 403 do servidor: mensagem amigável e a edição continua aberta
    const r2 = await montarDetalhe(detalheTs({ empresa_visitada_id: "e1" }), await planilhaDoServidor(false));
    responder = (c) => (c.metodo === "PATCH" ? { status: 403, corpo: { error: "Só a diretoria e a gestão podem alterar o percentual de ganho da proposta." } } : { status: 200, corpo: { data: [] } });
    await clicar(botaoPorTexto(r2, "Editar"));
    await esperar(DEBOUNCE);
    await clicar(botaoPorTexto(r2, "Salvar"));
    await esperar(20);
    assert.match(textoDe(r2), /Só a diretoria e a gestão podem alterar o percentual de ganho da proposta\./);
    assert.match(textoDe(r2), /Cálculo do valor mensal/, "continua editando");
  } finally { servidor.gestor = true; }
});
await caso("DETALHE TS (gestor): editar com ganho abaixo do mínimo trava o 'Salvar' até a justificativa; depois o PATCH leva a justificativa e o ganho que ele vê", async () => {
  const conteudoGestor = conteudoTsDoForm(formAux({}, { ganho: "10" }), { gestor: true });
  const r = await montarDetalhe(detalheTs({ empresa_visitada_id: "e1", conteudo: conteudoGestor as any }), await planilhaDoServidor(true, conteudoGestor), { gestor: true });
  responder = (c) => (c.metodo === "PATCH" ? { status: 200, corpo: { data: {} } } : { status: 200, corpo: { data: [] } });
  await clicar(botaoPorTexto(r, "Editar"));
  await esperar(DEBOUNCE);
  assert.equal(porData(r, "data-campo", "ganho")[0].props.value, "10");
  assert.equal(porData(r, "data-justificativa-ganho").length, 1);
  assert.equal(botaoPorTexto(r, "Salvar")?.props.disabled, true);
  await act(async () => { r.root.findAll((n) => n.type === "textarea" && n.props.maxLength === 500)[0].props.onChange({ target: { value: "Cliente estratégico" } }); });
  assert.notEqual(botaoPorTexto(r, "Salvar")?.props.disabled, true);
  await clicar(botaoPorTexto(r, "Salvar"));
  await esperar(20);
  const patch = chamadas.find((c) => c.metodo === "PATCH")!;
  assert.equal(patch.corpo.conteudo.justificativa_ganho_minimo, "Cliente estratégico");
  assert.equal(patch.corpo.conteudo.ganho_bp, 1000);
});

// ═══ Aba "Percentuais da Terceirização" ══════════════════════════════════════
const LINHA = (extra: Record<string, unknown> = {}) => ({ id: "pts-1", vigente_desde: "2026-11-25", ...PARAMETROS_TS_INICIAIS, alterado_por: null, created_at: "2026-11-25T10:00:00Z", alterado_por_nome: null, ...extra });
const DADOS = () => ({ hoje: HOJE, vigentes: LINHA(), historico: [LINHA()] });
const DIGITADOS: Record<string, string> = { fgts_bp: "8", inss_bp: "23", multa_fgts_bp: "40", ganho_padrao_bp: "30", ganho_minimo_bp: "20" };
async function montarAba(dados: unknown = DADOS(), postar?: (c: Chamada) => { status: number; corpo: unknown }, props: Record<string, unknown> = {}) {
  chamadas = []; atrasos = [];
  responder = (c) => (c.metodo === "POST" ? (postar ?? (() => ({ status: 201, corpo: { data: LINHA({ id: "n" }) } })))(c) : { status: 200, corpo: dados });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PercentuaisTsAdmin, props)); });
  vivos.push(r);
  await esperar(20);
  return r;
}
const campoPct = (r: TestRenderer.ReactTestRenderer, k: string) => porData(r, "data-campo", k)[0];
const digitar = async (r: TestRenderer.ReactTestRenderer, valores: Record<string, string>) => { for (const [k, v] of Object.entries(valores)) await act(async () => { campoPct(r, k).props.onChange({ target: { value: v } }); }); };
const diaFuturo = new Date(Date.UTC(Number(HOJE.slice(0, 4)), Number(HOJE.slice(5, 7)) - 1, Number(HOJE.slice(8, 10)) + 5)).toISOString().slice(0, 10);
await caso("ABA: vigência de hoje, aviso de que o ganho ainda não foi configurado, histórico com quem cadastrou, formulário com os de hoje e o interruptor LIGADO; sem tributos, despesas ou lucro; NÃO existe editar nem apagar", async () => {
  const r = await montarAba({ hoje: HOJE, vigentes: LINHA(), historico: [LINHA({ alterado_por_nome: "Diretora" })] });
  assert.equal(chamadas[0].url, "/api/comercial/propostas/ts/parametros");
  const t = textoDe(r);
  assert.match(t, /Vigência de hoje/);
  assert.match(t, /Em vigor desde 25\/11\/2026/);
  assert.match(t, /ganho padrão ainda não foi configurado/);
  assert.equal(porData(r, "data-vigente").length, 6);
  assert.match(txt(porData(r, "data-vigente", "inss_bp")[0]), /23%/);
  assert.match(txt(porData(r, "data-vigente", "fgts_bp")[0]), /8%/);
  assert.match(txt(porData(r, "data-vigente", "encargos_sobre_adicionais")[0]), /Sim/);
  assert.equal(campoPct(r, "inss_bp").props.value, "23");
  assert.equal(campoPct(r, "encargos_sobre_adicionais").props.checked, true);
  assert.match(t, /Encargos também sobre os adicionais e horas extras/);
  assert.match(t, /Diretora/);
  assert.match(t, /\(em vigor\)/);
  assert.doesNotMatch(t, /ISS|PIS|COFINS|IRPJ|CSLL|[Dd]espesas|[Ll]ucro|[Cc]obertura|[Mm]argem/);
  assert.equal(botoes(r).filter((b) => /editar|apagar|excluir|remover/i.test(txt(b))).length, 0);
  assert.equal(r.root.findAll((n) => n.type === "input").length, 7, "data + 5 percentuais + interruptor");
});
await caso("SIMULADOR: os casos da planilha (LIMPEZA, Maxsoy, PORTEIRO 2025 e 2026) dão custo, encargos e preço com o ganho digitado, o interruptor muda a base, pela MESMA função pura do servidor, sem rota e sem gravar", async () => {
  const r = await montarAba();
  assert.match(txt(porData(r, "data-sim-preco")[0]), /—/, "sem ganho: sem preço");
  chamadas = [];
  await digitar(r, DIGITADOS);
  const escolher = async (codigo: string) => { await act(async () => { campoPct(r, "caso_simulador").props.onChange({ target: { value: codigo } }); }); };
  const confere = (custo: number, encargos: number, preco: number) => {
    assert.match(txt(porData(r, "data-sim-custo")[0]), reais(custo));
    assert.match(txt(porData(r, "data-sim-encargos")[0]), reais(encargos));
    assert.match(txt(porData(r, "data-sim-preco")[0]), reais(preco));
  };
  assert.deepEqual(CASOS_SIMULADOR_TS.map((c) => c.rotulo), ["LIMPEZA", "LIMPEZA Maxsoy", "PORTEIRO 2025", "PORTEIRO 2026"]);
  confere(286802, 68611, 372843);
  await escolher("maxsoy"); confere(590660, 157586, 767858);
  await escolher("porteiro2025"); confere(363662, 89194, 472761);
  await escolher("porteiro2026"); confere(243426, 84735, 316454);
  await act(async () => { campoPct(r, "encargos_sobre_adicionais").props.onChange({ target: { checked: false } }); });
  confere(227302, 68611, precoDoCustoTs(227302, 3000));
  await escolher("porteiro2025"); confere(343079, 68611, precoDoCustoTs(343079, 3000));
  await escolher("maxsoy"); confere(501685, 68611, precoDoCustoTs(501685, 3000));
  assert.equal(chamadas.length, 0, "o simulador não chama o servidor");
  await digitar(r, { ganho_padrao_bp: "28,6" });
  assert.match(txt(porData(r, "data-sim-preco")[0]), reais(precoDoCustoTs(501685, 2860)));
  await digitar(r, { inss_bp: "5,555" });
  assert.equal(porData(r, "data-sim-incompleto").length, 1);
  // é a mesma função pura (não uma conta própria da tela)
  const posto = CASOS_SIMULADOR_TS[0].posto;
  const sim = simularPostoTs(posto, PAR_PRECO);
  const direto = calcularPostoTs(posto, PAR_PRECO);
  assert.deepEqual(sim, { custo: direto.custoUnitCentavos, encargos: direto.encargosCentavos, preco: precoDoCustoTs(direto.custoUnitCentavos, 3000) });
  const fonte = fs.readFileSync("src/components/propostas/PercentuaisTsAdmin.tsx", "utf8");
  assert.match(fonte, /from "@\/lib\/propostaTsCalculo"/);
  assert.match(fonte, /calcularPostoTs\(/);
  assert.match(fonte, /precoDoCustoTs\(/);
});
await caso("ABA: cadastrar pede confirmação, envia a data, os 5 percentuais em PONTOS-BASE e o interruptor (nova vigência, sempre POST) e depois recarrega com aviso de sucesso; 'Voltar' não envia", async () => {
  const r = await montarAba();
  await digitar(r, { ...DIGITADOS, ganho_padrao_bp: "28,6" });
  await act(async () => { campoPct(r, "encargos_sobre_adicionais").props.onChange({ target: { checked: false } }); });
  await act(async () => { porData(r, "data-campo", "vigente_desde")[0].props.onChange({ target: { value: diaFuturo } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /não dá para editar nem apagar/);
  await clicar(botaoPorTexto(r, "Voltar"));
  assert.equal(botaoPorTexto(r, "Sim, cadastrar"), undefined);
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  await clicar(botaoPorTexto(r, "Sim, cadastrar"));
  await esperar(20);
  const post = chamadas.filter((c) => c.metodo === "POST");
  assert.equal(post.length, 1);
  assert.equal(post[0].url, "/api/comercial/propostas/ts/parametros");
  assert.deepEqual(post[0].corpo, { vigente_desde: diaFuturo, fgts_bp: 800, inss_bp: 2300, multa_fgts_bp: 4000, ganho_padrao_bp: 2860, ganho_minimo_bp: 2000, encargos_sobre_adicionais: false });
  assert.match(textoDe(r), /Nova vigência cadastrada/);
  assert.ok(chamadas.filter((c) => c.metodo === "GET").length >= 2, "recarregou");
  assert.equal(chamadas.filter((c) => ["PUT", "PATCH", "DELETE"].includes(c.metodo)).length, 0);
});
await caso("ABA: validações antes de enviar (sem data, data passada, mais de 2 casas, percentual acima do limite) mostram a mensagem do campo e NADA é enviado; 409 (data repetida) e erro genérico viram mensagem amigável", async () => {
  const r = await montarAba();
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /Informe a data de início da vigência/);
  const ontem = new Date(Date.UTC(Number(HOJE.slice(0, 4)), Number(HOJE.slice(5, 7)) - 1, Number(HOJE.slice(8, 10)) - 1)).toISOString().slice(0, 10);
  await act(async () => { porData(r, "data-campo", "vigente_desde")[0].props.onChange({ target: { value: ontem } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /não pode começar antes de hoje/);
  await act(async () => { porData(r, "data-campo", "vigente_desde")[0].props.onChange({ target: { value: diaFuturo } }); });
  await digitar(r, { inss_bp: "5,555" });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /INSS: informe o percentual com até 2 casas/);
  await digitar(r, { inss_bp: "150" });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /INSS passa do limite de 100%/);
  await digitar(r, { inss_bp: "23", ganho_padrao_bp: "1001" });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /Ganho padrão sobre o custo passa do limite de 1000%|Ganho padrão sobre o custo passa do limite de 1\.000%/);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0);
  const r409 = await montarAba(DADOS(), () => ({ status: 409, corpo: { error: "Já existe uma vigência com esta data. Escolha outra data." } }));
  await digitar(r409, DIGITADOS);
  await act(async () => { porData(r409, "data-campo", "vigente_desde")[0].props.onChange({ target: { value: diaFuturo } }); });
  await clicar(botaoPorTexto(r409, "Cadastrar nova vigência"));
  await clicar(botaoPorTexto(r409, "Sim, cadastrar"));
  await esperar(20);
  assert.match(textoDe(r409), /Já existe uma vigência com esta data\. Escolha outra data\./);
  assert.doesNotMatch(textoDe(r409), /Nova vigência cadastrada/);
  assert.equal(botaoPorTexto(r409, "Sim, cadastrar"), undefined, "a confirmação fecha para trocar a data");
  const r500 = await montarAba(DADOS(), () => ({ status: 500, corpo: { error: "Não foi possível salvar os percentuais. Nada foi alterado." } }));
  await digitar(r500, DIGITADOS);
  await act(async () => { porData(r500, "data-campo", "vigente_desde")[0].props.onChange({ target: { value: diaFuturo } }); });
  await clicar(botaoPorTexto(r500, "Cadastrar nova vigência"));
  await clicar(botaoPorTexto(r500, "Sim, cadastrar"));
  await esperar(20);
  assert.match(textoDe(r500), /Nada foi alterado/);
});
await caso("ABA: ganho mínimo maior que o padrão mostra a mensagem, desabilita o salvar e nada é enviado; igual ao padrão libera", async () => {
  const r = await montarAba();
  await digitar(r, { ...DIGITADOS, ganho_padrao_bp: "20", ganho_minimo_bp: "20,01" });
  await act(async () => { porData(r, "data-campo", "vigente_desde")[0].props.onChange({ target: { value: diaFuturo } }); });
  assert.match(txt(porData(r, "data-erro-minimo")[0]), /O ganho mínimo não pode ser maior que o ganho padrão\./);
  assert.equal(botaoPorTexto(r, "Cadastrar nova vigência")?.props.disabled, true);
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.equal(botaoPorTexto(r, "Sim, cadastrar"), undefined);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0);
  await digitar(r, { ganho_minimo_bp: "20" });
  assert.equal(porData(r, "data-erro-minimo").length, 0);
  assert.notEqual(botaoPorTexto(r, "Cadastrar nova vigência")?.props.disabled, true);
});
await caso("ABA: acesso negado (403) mostra só a mensagem da rota e nenhum botão; sem vigência hoje avisa; vigência futura aparece como (futura); somente leitura (podeEditar=false) mostra vigência e histórico sem formulário", async () => {
  chamadas = [];
  responder = () => ({ status: 403, corpo: { error: "Só a diretoria e a gestão acessam os percentuais da Terceirização." } });
  let n!: TestRenderer.ReactTestRenderer;
  await act(async () => { n = TestRenderer.create(React.createElement(PercentuaisTsAdmin)); });
  vivos.push(n);
  await esperar(20);
  assert.match(textoDe(n), /Só a diretoria e a gestão acessam os percentuais da Terceirização/);
  assert.equal(botoes(n).length, 0);
  const r2 = await montarAba({ hoje: HOJE, vigentes: null, historico: [LINHA({ id: "f", vigente_desde: "2999-01-01" })] });
  assert.match(textoDe(r2), /Não há percentuais em vigor hoje/);
  assert.match(textoDe(r2), /\(futura\)/);
  const leitura = await montarAba(DADOS(), undefined, { podeEditar: false });
  assert.equal(porData(leitura, "data-vigente").length, 6);
  assert.equal(porData(leitura, "data-campo").length, 0);
  assert.equal(botaoPorTexto(leitura, "Cadastrar nova vigência"), undefined);
  assert.match(textoDe(leitura), /Histórico/);
});

// ═══ Lista: abas ═════════════════════════════════════════════════════════════
async function montarLista(gestor: boolean, abaInicial?: string) {
  chamadas = [];
  responder = (c) => (c.url.includes("/ts/parametros") ? { status: 200, corpo: DADOS() } : { status: 200, corpo: { data: [], hoje: HOJE } });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PropostasListaClient, { podeCriar: true, gestor, vendedores: [], abaInicial })); });
  vivos.push(r);
  await esperar(20);
  return r;
}
await caso("LISTA: a aba 'Percentuais da Terceirização' fica ao lado da do MOT e SÓ o gestor a vê; ?aba=percentuais-ts abre nela (o link 'Configurar percentuais'); vendedor nunca abre, mesmo com a aba na URL", async () => {
  const g = await montarLista(true);
  const nomes = botoes(g).map((b) => txt(b));
  assert.ok(nomes.indexOf("Percentuais da Terceirização") === nomes.indexOf("Percentuais do MOT") + 1, "ao lado da aba do MOT");
  assert.equal(porData(g, "data-percentuais-ts").length, 0);
  await clicar(botaoPorTexto(g, "Percentuais da Terceirização"));
  await esperar(20);
  assert.equal(porData(g, "data-percentuais-ts").length, 1);
  const direto = await montarLista(true, "percentuais-ts");
  await esperar(20);
  assert.equal(porData(direto, "data-percentuais-ts").length, 1);
  assert.ok(chamadas.some((c) => c.url === "/api/comercial/propostas/ts/parametros"));
  const v = await montarLista(false, "percentuais-ts");
  assert.equal(botaoPorTexto(v, "Percentuais da Terceirização"), undefined);
  assert.equal(botaoPorTexto(v, "Percentuais do MOT"), undefined);
  assert.equal(porData(v, "data-percentuais-ts").length, 0);
  assert.equal(chamadas.filter((c) => c.url.includes("/ts/parametros")).length, 0, "vendedor nunca consulta os percentuais");
  const url = URL_CONFIGURAR_PERCENTUAIS_TS;
  assert.equal(url, "/painel/comercial/propostas?aba=percentuais-ts");
});

console.log(`\n${total} casos OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
