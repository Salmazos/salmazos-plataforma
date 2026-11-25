// Smoke das telas do MOT (Etapa 2D): formulário com várias funções e cálculo na tela, aba de percentuais, janela de envio e detalhe. Sem navegador: react-test-renderer.
// react-test-renderer NÃO é dependência do projeto: instalar só para rodar (npm i react-test-renderer@19.2.6 --no-save --legacy-peer-deps) e remover depois.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/smoke-propostas-mot-ui.mts
import assert from "node:assert/strict";
import React, { useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import CamposPropostaMot, {
  camposMotDeProposta, camposMotPadrao, centavosDoSalario, conteudoMotDoForm, funcaoMotNova, salariosDaPrevia, validadeMotDoForm, type CamposMotForm, type EstadoPrevia,
} from "@/components/propostas/CamposPropostaMot";
import PercentuaisMotAdmin, { percentualParaBp } from "@/components/propostas/PercentuaisMotAdmin";
import ModalMarcarEnviadaMot from "@/components/propostas/ModalMarcarEnviadaMot";
import PropostaDetalheMot, { type DetalheMot } from "@/components/propostas/PropostaDetalheMot";
import CampoMoeda from "@/components/ui/CampoMoeda";
import { FUNCAO_MOT_PADRAO, MAX_FUNCOES_MOT, TEXTO_INTRODUTORIO_PADRAO_MOT, conteudoMotSchema, montarPreviaMot, previaMotSchema, type ParametrosMotVigentes } from "@/lib/propostaMot";
import { CHAVES_PARAMETROS_MOT, PARAMETROS_MOT_INICIAIS, calcularPlanilhaMot, formatarCentavosBRL } from "@/lib/propostaMotCalculo";
import { LIMITES_PARAMETROS_MOT, montarSnapshotMot, previaDeSnapshotMot } from "@/lib/propostaMot";
import { hojeSaoPaulo } from "@/lib/comercial";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let total = 0;
// Telas montadas por um caso (com consulta de prévia pendente) são desmontadas antes do caso seguinte: um timer de um caso anterior não pode responder no meio de outro.
const vivos: TestRenderer.ReactTestRenderer[] = [];
async function caso(nome: string, fn: () => Promise<void> | void) {
  for (const v of vivos.splice(0)) { try { await act(async () => { v.unmount(); }); } catch { /* já desmontada */ } }
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const HOJE = hojeSaoPaulo();
const VIGENTES = { vigente_desde: "2026-11-19", id: "par-1", ...PARAMETROS_MOT_INICIAIS } as ParametrosMotVigentes;
const esperar = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const DEBOUNCE = 520;

// ── fetch simulado (o servidor real é coberto em verificar-propostas-mot-telas.mts) ──
interface Chamada { url: string; metodo: string; corpo: any }
let chamadas: Chamada[] = [];
let resposta: (c: Chamada) => { status: number; corpo: unknown } = () => ({ status: 404, corpo: { error: "sem rota" } });
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const c = { url: String(url), metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : undefined };
  chamadas.push(c);
  const r = resposta(c);
  return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
};
const servidorPrevia = (c: Chamada) => ({ status: 200, corpo: { data: montarPreviaMot(c.corpo.salarios_centavos, VIGENTES) } });

// ── utilidades de árvore ──
function textoDe(r: TestRenderer.ReactTestRenderer): string {
  const partes: string[] = [];
  const visita = (n: any) => { if (n == null) return; if (typeof n === "string") { partes.push(n); return; } (n.children ?? []).forEach(visita); };
  visita(r.toJSON());
  return partes.join(" ").replace(/\s+/g, " ");
}
// Texto de um nó da árvore de teste (os filhos podem ser textos ou outros nós).
const txt = (n: TestRenderer.ReactTestInstance): string => n.children.map((c) => (typeof c === "string" ? c : txt(c))).join("");
const botoes = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "button");
const botaoPorTexto = (r: TestRenderer.ReactTestRenderer, trecho: string) => botoes(r).find((b) => txt(b).includes(trecho));
const clicar = async (b: TestRenderer.ReactTestInstance | undefined) => { assert.ok(b, "botão existe"); await act(async () => { b!.props.onClick(); }); };
const porData = (r: TestRenderer.ReactTestRenderer, attr: string, valor?: string | number) =>
  r.root.findAll((n) => typeof n.type === "string" && (valor === undefined ? n.props[attr] !== undefined : String(n.props[attr]) === String(valor)));

let ultimo: CamposMotForm = camposMotPadrao();
let ultimaPrevia: EstadoPrevia | null = null;
function Pagina({ inicial, desabilitado }: { inicial: CamposMotForm; desabilitado?: boolean }) {
  const [v, setV] = useState(inicial);
  ultimo = v;
  return React.createElement(CamposPropostaMot, { valor: v, onChange: setV, desabilitado, onPrevia: (e: EstadoPrevia) => { ultimaPrevia = e; } });
}
async function montar(inicial = camposMotPadrao(), desabilitado = false) {
  chamadas = []; ultimaPrevia = null;
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(Pagina, { inicial, desabilitado })); });
  vivos.push(r);
  return r;
}
const salario = async (r: TestRenderer.ReactTestRenderer, i: number, reais: number) => {
  const campo = r.root.findAllByType(CampoMoeda)[i];
  await act(async () => { campo.props.onChange(reais); });
};

// ═══ Formulário ══════════════════════════════════════════════════════════════
await caso("formulário MOT novo: 1 função com os padrões, texto introdutório padrão, vencimento 15 e 30, antecedência 5, 0 cláusulas — e SEM campos de CNPJ nem de endereço", async () => {
  resposta = servidorPrevia;
  const r = await montar();
  assert.equal(ultimo.funcoes.length, 1);
  assert.deepEqual({ area: ultimo.funcoes[0].area, jornada: ultimo.funcoes[0].jornada, horario: ultimo.funcoes[0].horario }, FUNCAO_MOT_PADRAO);
  assert.equal(ultimo.texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_MOT);
  assert.equal(ultimo.vencimentos_dias, "15, 30");
  assert.equal(ultimo.antecedencia_dias, "5");
  assert.equal(ultimo.clausulas_adicionais.length, 0);
  const t = textoDe(r);
  assert.doesNotMatch(t, /CNPJ|Endereço/i);
  assert.match(t, /Preencha o salário de uma função para ver o valor mensal/);
  assert.equal(chamadas.length, 0, "sem salário não consulta o servidor");
  assert.deepEqual(Object.keys(conteudoMotDoForm(camposMotPadrao())).sort(), ["cargo_supervisao", "clausulas_adicionais", "condicoes", "funcoes", "texto_introdutorio"]);
});
await caso("funções: adicionar até 20 (botão desabilita no limite) e remover até sobrar 1 (o botão de remover desabilita na última); remover mantém as outras", async () => {
  resposta = servidorPrevia;
  const r = await montar();
  assert.equal(botoes(r).find((b) => b.props["aria-label"] === "Remover função 1")?.props.disabled, true, "com 1 função não dá para remover");
  for (let i = 1; i < MAX_FUNCOES_MOT; i++) await clicar(botaoPorTexto(r, "Adicionar função"));
  assert.equal(ultimo.funcoes.length, 20);
  assert.equal(botaoPorTexto(r, "Adicionar função")?.props.disabled, true);
  assert.match(textoDe(r), /limite de 20/);
  // renomeia a 3ª e remove a 2ª: a 3ª vira 2ª
  await act(async () => { r.root.findAll((n) => n.type === "input" && n.props.value === "OPERACIONAL")[2].props.onChange({ target: { value: "TERCEIRA" } }); });
  await clicar(botoes(r).find((b) => b.props["aria-label"] === "Remover função 2"));
  assert.equal(ultimo.funcoes.length, 19);
  assert.equal(ultimo.funcoes[1].area, "TERCEIRA");
  for (let i = 0; i < 18; i++) await clicar(botoes(r).find((b) => b.props["aria-label"] === "Remover função 1"));
  assert.equal(ultimo.funcoes.length, 1);
  assert.equal(botoes(r).find((b) => b.props["aria-label"] === "Remover função 1")?.props.disabled, true);
});
await caso("cálculo na tela: R$ 1.000,00 → R$ 1.889,64 por função; a 2ª função (R$ 3.200,00) entra na BASE da planilha única (R$ 4.200,00 → total R$ 7.936,59); a tela mostra o que o servidor devolveu e bate com a calculadora", async () => {
  resposta = servidorPrevia;
  const r = await montar();
  await salario(r, 0, 1000);
  await esperar(DEBOUNCE);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "/api/comercial/propostas/mot/previa");
  assert.deepEqual(chamadas[0].corpo, { salarios_centavos: [100000] });
  assert.match(textoDe(r), /R\$\s?1\.889,64/);
  await clicar(botaoPorTexto(r, "Adicionar função"));
  await salario(r, 1, 3200);
  await esperar(DEBOUNCE);
  assert.deepEqual(chamadas[chamadas.length - 1].corpo, { salarios_centavos: [100000, 320000] });
  // Layout novo: cada função só mostra o salário; a planilha é UMA, sobre a soma dos salários, e o valor mensal total é o TOTAL N. FISCAL dela.
  assert.equal(porData(r, "data-valor-funcao").length, 0, "sem valor mensal por função");
  const salarios = porData(r, "data-salario-funcao").map((n) => txt(n));
  assert.equal(salarios.length, 2);
  assert.match(salarios[0], /1\.000,00/);
  assert.match(salarios[1], /3\.200,00/);
  assert.match(txt(porData(r, "data-base-calculo")[0]), /Base de cálculo: R\$\s?4\.200,00 \(OPERACIONAL: R\$\s?1\.000,00 \+ OPERACIONAL: R\$\s?3\.200,00\)/);
  const calc = (s: number) => calcularPlanilhaMot({ salarioCentavos: s, parametros: PARAMETROS_MOT_INICIAIS }).totalNfCentavos;
  assert.equal(calc(100000), 188964);
  assert.equal(calc(320000), 604693);
  assert.match(txt(porData(r, "data-total-mensal")[0]), /7\.936,59/);
  assert.match(txt(porData(r, "data-total-mensal")[0]), new RegExp(formatarCentavosBRL(calc(420000)).replace(/[.$]/g, "\\$&").replace("\\$ ", "\\$\\s?")));
  assert.equal(ultimaPrevia?.erro, null);
  // função sem salário: manda null na posição e não quebra
  await clicar(botaoPorTexto(r, "Adicionar função"));
  await esperar(DEBOUNCE);
  assert.deepEqual(chamadas[chamadas.length - 1].corpo, { salarios_centavos: [100000, 320000, null] });
  // a prévia só mostra valores: nenhum percentual na tela do vendedor
  assert.doesNotMatch(textoDe(r), /31,2%|3120|pontos-base|\d%/);
});
await caso("sem percentuais vigentes: a tela mostra a mensagem do servidor ('peça à diretoria para cadastrá-los') e avisa quem está em volta (o botão de criar fica bloqueado)", async () => {
  resposta = () => ({ status: 409, corpo: { error: "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los." } });
  const r = await montar();
  await salario(r, 0, 1000);
  await esperar(DEBOUNCE);
  assert.match(textoDe(r), /Peça à diretoria para cadastrá-los/);
  assert.equal(ultimaPrevia?.erro, "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los.");
  assert.equal(ultimaPrevia?.previa, null);
  // volta a funcionar quando o servidor passa a responder (corrige o salário → nova consulta)
  resposta = servidorPrevia;
  await salario(r, 0, 1500);
  await esperar(DEBOUNCE);
  assert.equal(ultimaPrevia?.erro, null);
  assert.ok(ultimaPrevia?.previa);
});
await caso("falha de rede na prévia: mensagem simples e bloqueio; resposta antiga não sobrescreve a nova (corrida)", async () => {
  (globalThis as any).fetch = async () => { throw new Error("rede"); };
  const r = await montar();
  await salario(r, 0, 1000);
  await esperar(DEBOUNCE);
  assert.match(textoDe(r), /Não foi possível calcular os valores/);
  assert.ok(ultimaPrevia?.erro);
  // restaura o fetch simulado
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const c = { url: String(url), metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : undefined };
    chamadas.push(c);
    const x = resposta(c);
    return new Response(JSON.stringify(x.corpo), { status: x.status, headers: { "Content-Type": "application/json" } });
  };
  resposta = servidorPrevia;
  await salario(r, 0, 1000);
  await salario(r, 0, 2000); // digitação rápida: só vale o último
  await esperar(DEBOUNCE);
  assert.equal(chamadas.filter((c) => c.url.includes("previa")).length, 1, "uma consulta por pausa na digitação");
  assert.deepEqual(chamadas[chamadas.length - 1].corpo, { salarios_centavos: [200000] });
});
await caso("corpo enviado: salário em CENTAVOS, descrição vazia vira null, cláusula em branco sai da lista, dias de vencimento lidos de '15, 30' e '15 e 30', e o resultado passa no Zod do servidor", () => {
  const f = camposMotPadrao();
  f.funcoes = [
    { area: " OPERACIONAL ", descricao: "  ", salario: 1000, jornada: "44h", horario: "07h às 16h" },
    { area: "ADM", descricao: "Auxiliar", salario: 1234.56, jornada: "40h", horario: "08h às 17h" },
    { area: "OUTRA", descricao: "", salario: 0.1 + 0.2, jornada: "40h", horario: "x" },
  ];
  f.clausulas_adicionais = ["  Primeira  ", "   ", "Segunda"];
  f.aos_cuidados = " Maria ";
  f.cargo_supervisao = "  ";
  const c = conteudoMotDoForm(f);
  assert.deepEqual(c.funcoes.map((x) => x.salario_centavos), [100000, 123456, 30]);
  assert.equal(c.funcoes[0].area, "OPERACIONAL");
  assert.equal(c.funcoes[0].descricao, null);
  assert.equal(c.funcoes[1].descricao, "Auxiliar");
  assert.deepEqual(c.clausulas_adicionais, ["Primeira", "Segunda"]);
  assert.equal(c.cargo_supervisao, null);
  assert.deepEqual(c.condicoes, { vencimentos_dias: [15, 30], antecedencia_dias: 5 });
  f.vencimentos_dias = "15 e 30";
  assert.deepEqual(conteudoMotDoForm(f).condicoes.vencimentos_dias, [15, 30]);
  f.vencimentos_dias = "5, 15 e 30";
  assert.deepEqual(conteudoMotDoForm(f).condicoes.vencimentos_dias, [5, 15, 30]);
  const ok = conteudoMotSchema.safeParse(conteudoMotDoForm(f));
  assert.ok(ok.success, JSON.stringify(ok.error?.issues));
  assert.equal(centavosDoSalario(19.99), 1999);
  assert.equal(validadeMotDoForm({ ...f, validade_dias: " 10 " }), "10");
  // campos obrigatórios vazios e salário zero são recusados pelo servidor (a tela não inventa valor)
  const g = camposMotPadrao();
  g.funcoes = [{ area: "", descricao: "", salario: 0, jornada: "", horario: "" }];
  assert.equal(conteudoMotSchema.safeParse(conteudoMotDoForm(g)).success, false);
  g.vencimentos_dias = "abc";
  assert.equal(conteudoMotSchema.safeParse(conteudoMotDoForm({ ...g, funcoes: f.funcoes })).success, false, "dia de vencimento inválido não passa");
  g.vencimentos_dias = "";
  assert.equal(conteudoMotSchema.safeParse(conteudoMotDoForm({ ...g, funcoes: f.funcoes })).success, false, "sem dia de vencimento não passa");
  // salários da prévia: zero vira null (função ainda sem salário)
  assert.deepEqual(salariosDaPrevia([{ ...funcaoMotNova(), salario: 0 }, { ...funcaoMotNova(), salario: 1000 }]), [null, 100000]);
});
await caso("cláusulas: adicionar (até 10), digitar, reordenar (↑/↓) e remover; aviso de caracteres que o PDF omite", async () => {
  resposta = servidorPrevia;
  const r = await montar();
  for (let i = 0; i < 10; i++) await clicar(botaoPorTexto(r, "Adicionar cláusula"));
  assert.equal(ultimo.clausulas_adicionais.length, 10);
  assert.equal(botaoPorTexto(r, "Adicionar cláusula")?.props.disabled, true);
  const areas = () => r.root.findAll((n) => n.type === "textarea" && n.props.maxLength === 600);
  await act(async () => { areas()[0].props.onChange({ target: { value: "A" } }); });
  await act(async () => { areas()[1].props.onChange({ target: { value: "B 😀" } }); });
  assert.match(textoDe(r), /não imprime estes caracteres/);
  await clicar(botoes(r).find((b) => b.props["aria-label"] === "Descer cláusula 1"));
  assert.deepEqual(ultimo.clausulas_adicionais.slice(0, 2), ["B 😀", "A"]);
  await clicar(botoes(r).find((b) => b.props["aria-label"] === "Remover cláusula 1"));
  assert.equal(ultimo.clausulas_adicionais[0], "A");
  assert.equal(ultimo.clausulas_adicionais.length, 9);
  // numeração das adicionais do MOT: continua depois das 5 fixas (1.1 a 1.5), igual ao PDF: 1.6, 1.7…, até 1.14 com 9 cláusulas
  const rotulos = r.root.findAll((n) => n.type === "strong" && /^1\.\d+$/.test(txt(n))).map((n) => txt(n));
  assert.deepEqual(rotulos, ["1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12", "1.13", "1.14"]);
});
await caso("edição: proposta MOT salva volta ao formulário como estava (funções, salário em reais, condições, cláusulas); campos desabilitados não têm botões", async () => {
  resposta = servidorPrevia;
  const conteudo = conteudoMotSchema.parse({
    funcoes: [{ area: "ADM", descricao: "Aux", salario_centavos: 123456, jornada: "J", horario: "H" }, { area: "OP", salario_centavos: 100000, jornada: "J2", horario: "H2" }],
    condicoes: { vencimentos_dias: [10, 25], antecedencia_dias: 3 }, clausulas_adicionais: ["Uma"], texto_introdutorio: "Oi", cargo_supervisao: "Gerente",
  });
  const f = camposMotDeProposta({ aos_cuidados: "Ana", validade_dias: 7, conteudo });
  assert.deepEqual(f.funcoes.map((x) => [x.area, x.descricao, x.salario]), [["ADM", "Aux", 1234.56], ["OP", "", 1000]]);
  assert.equal(f.vencimentos_dias, "10, 25");
  assert.equal(f.antecedencia_dias, "3");
  assert.deepEqual(conteudoMotDoForm(f).funcoes.map((x) => x.salario_centavos), [123456, 100000], "ida e volta sem perder centavo");
  assert.equal(camposMotDeProposta({ aos_cuidados: null, validade_dias: 10, conteudo: null }).funcoes.length, 1);
  const r = await montar(f, true);
  assert.equal(botoes(r).filter((b) => /Adicionar|Remover|Subir|Descer/.test(txt(b) + (b.props["aria-label"] ?? ""))).length, 0);
  assert.ok(r.root.findAll((n) => n.type === "textarea").every((n) => n.props.disabled === true));
});
await caso("schema da prévia: salários inteiros 1..teto, null por posição, 1..20, ao menos um salário; mensagens em português", () => {
  assert.equal(previaMotSchema.safeParse({ salarios_centavos: [100000, null] }).success, true);
  for (const ruim of [{ salarios_centavos: [] }, { salarios_centavos: [null] }, { salarios_centavos: [0] }, { salarios_centavos: [1.5] }, { salarios_centavos: ["a"] }, { salarios_centavos: Array.from({ length: 21 }, () => 1) }, {}]) {
    const r = previaMotSchema.safeParse(ruim);
    assert.equal(r.success, false, JSON.stringify(ruim));
    if (!r.success) assert.doesNotMatch(r.error.issues.map((i) => i.message).join(";"), /Invalid input|expected|received/i);
  }
});

// ═══ Janela "Marcar como enviada" (MOT) ══════════════════════════════════════
const PREVIA = montarPreviaMot([100000, 320000], VIGENTES);
const FUNCOES = [{ area: "OPERACIONAL", descricao: null }, { area: "ADM", descricao: "Auxiliar" }];
const propsModal = (extra: Record<string, unknown> = {}) => ({ numero: "TESTE-MOT-0001/26", clienteNome: "cliente teste", validadeDias: 10, hoje: HOJE, previa: PREVIA, erroCalculo: null, funcoes: FUNCOES, vendedorTemTelefone: true, temFunil: false, teste: true, onClose: () => {}, onConfirmar: async () => null, ...extra });
await caso("'Marcar como enviada' do MOT: SEM campo de valor; mostra cada função (salário) e o total da planilha única (R$ 7.936,59); confirmar chama o envio sem mandar valor; texto de teste diz que nada vai para o Funil", async () => {
  let confirmou = 0, argumentos: unknown[] = [];
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ModalMarcarEnviadaMot, propsModal({ onConfirmar: async (...a: unknown[]) => { confirmou++; argumentos = a; return null; } }) as any)); });
  assert.equal(r.root.findAllByType(CampoMoeda).length, 0, "ninguém digita o valor");
  assert.equal(r.root.findAll((n) => n.type === "input").length, 0);
  const t = textoDe(r);
  assert.match(t, /Salário R\$\s?1\.000,00/);
  assert.match(t, /Salário R\$\s?3\.200,00/);
  assert.equal(porData(r, "data-valor-funcao").length, 0, "sem valor mensal por função");
  assert.match(txt(porData(r, "data-total-mensal")[0]), /7\.936,59/);
  assert.match(t, /TOTAL N\. FISCAL da planilha de verbas/);
  assert.match(t, /Nada vai para o Funil/);
  assert.match(t, /Confira o cálculo acima e que o PDF enviado foi gerado a partir desta versão/);
  await clicar(botaoPorTexto(r, "Confirmar envio"));
  assert.equal(confirmou, 1);
  assert.deepEqual(argumentos, [], "nenhum valor é enviado");
});
await caso("revisão ANTIGA (snapshot sem layout_planilha): a tela segue mostrando o valor mensal de CADA função e o total como soma (R$ 7.936,57), como sempre", async () => {
  const velha = montarSnapshotMot({ numero: "X", revisao: 0, templateVersao: 1, dataEmissao: "2026-11-21", validadeDias: 15, validadeAte: "2026-12-06", clienteNome: "c", aosCuidados: null, vendedorNome: "v", vendedorTelefone: null, parametros: VIGENTES, layoutPlanilha: "por_funcao",
    conteudo: { funcoes: [100000, 320000].map((x) => ({ ...FUNCAO_MOT_PADRAO, salario_centavos: x })) } });
  const previaVelha = previaDeSnapshotMot(velha);
  assert.equal(previaVelha.unica, undefined);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ModalMarcarEnviadaMot, propsModal({ previa: previaVelha }) as any)); });
  const valores = porData(r, "data-valor-funcao").map((n) => txt(n));
  assert.equal(valores.length, 2);
  assert.match(valores[0], /1\.889,64/);
  assert.match(valores[1], /6\.046,93/);
  assert.match(txt(porData(r, "data-total-mensal")[0]), /7\.936,57/);
  assert.match(textoDe(r), /soma dos valores mensais das funções/);
});
await caso("'Marcar como enviada' do MOT: sem cálculo (sem percentuais) mostra a mensagem e o botão de confirmar fica desabilitado; erro do servidor volta a liberar o botão; proposta real com Funil promete oportunidade", async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ModalMarcarEnviadaMot, propsModal({ previa: null, erroCalculo: "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los." }) as any)); });
  assert.match(textoDe(r), /Peça à diretoria para cadastrá-los/);
  assert.equal(botaoPorTexto(r, "Confirmar envio")?.props.disabled, true);
  await act(async () => { r.update(React.createElement(ModalMarcarEnviadaMot, propsModal({ onConfirmar: async () => "Não foi possível alterar a situação." }) as any)); });
  await clicar(botaoPorTexto(r, "Confirmar envio"));
  assert.match(textoDe(r), /Não foi possível alterar a situação/);
  assert.notEqual(botaoPorTexto(r, "Confirmar envio")?.props.disabled, true, "pode tentar de novo");
  await act(async () => { r.update(React.createElement(ModalMarcarEnviadaMot, propsModal({ teste: false, temFunil: true }) as any)); });
  assert.match(textoDe(r), /Funil recebe a oportunidade/);
  await act(async () => { r.update(React.createElement(ModalMarcarEnviadaMot, propsModal({ teste: false, temFunil: false }) as any)); });
  assert.doesNotMatch(textoDe(r), /Funil/);
});

// ═══ Aba de percentuais ══════════════════════════════════════════════════════
const ontem = new Date(Date.UTC(Number(HOJE.slice(0, 4)), Number(HOJE.slice(5, 7)) - 1, Number(HOJE.slice(8, 10)) - 1)).toISOString().slice(0, 10);
const linha = (extra: Record<string, unknown> = {}) => ({ id: "par-1", vigente_desde: "2026-11-19", ...PARAMETROS_MOT_INICIAIS, alterado_por: null, created_at: "2026-11-19T18:42:12Z", alterado_por_nome: "Diretora X", ...extra });
const DADOS = () => ({ hoje: HOJE, vigentes: linha(), historico: [linha()], limites: LIMITES_PARAMETROS_MOT });
await caso("percentualParaBp: '31,2' → 3120, '0,65' → 65, '8' → 800, '10.5' → 1050; mais de 2 casas, texto, vazio e negativo → null (sem ponto flutuante)", () => {
  assert.equal(percentualParaBp("31,2"), 3120);
  assert.equal(percentualParaBp("0,65"), 65);
  assert.equal(percentualParaBp("8"), 800);
  assert.equal(percentualParaBp("10.5"), 1050);
  assert.equal(percentualParaBp(" 12,34 "), 1234);
  assert.equal(percentualParaBp("0"), 0);
  assert.equal(percentualParaBp("1.1"), 110);
  for (const ruim of ["1,234", "abc", "", "-1", "1,2,3", "1e2", "%"]) assert.equal(percentualParaBp(ruim), null, ruim);
});
async function montarAba(dados: unknown = DADOS(), postar?: (c: Chamada) => { status: number; corpo: unknown }) {
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? (postar ?? (() => ({ status: 201, corpo: { data: linha({ id: "n" }) } })))(c) : { status: 200, corpo: dados });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PercentuaisMotAdmin)); });
  vivos.push(r);
  await esperar(20);
  return r;
}
const campoData = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "input" && n.props.type === "date")[0];
await caso("aba de percentuais: mostra a vigência de hoje (em %), o histórico com quem cadastrou, formulário já preenchido com os de hoje; NÃO tem botão de editar nem de apagar", async () => {
  const r = await montarAba();
  assert.equal(chamadas[0].url, "/api/comercial/propostas/mot/parametros");
  const t = textoDe(r);
  assert.match(t, /Vigência de hoje/);
  assert.match(t, /Em vigor desde 19\/11\/2026/);
  assert.equal(porData(r, "data-vigente").length, 10);
  assert.match(txt(porData(r, "data-vigente", "taxa_administrativa_bp")[0]), /10%/);
  assert.match(txt(porData(r, "data-vigente", "inss_patronal_bp")[0]), /31,2%/);
  assert.match(txt(porData(r, "data-vigente", "ret_pis_bp")[0]), /0,65%/);
  assert.match(t, /Diretora X/);
  assert.match(t, /\(em vigor\)/);
  assert.equal(porData(r, "data-campo").length, 10);
  assert.equal(porData(r, "data-campo", "inss_patronal_bp")[0].props.value, "31,2");
  assert.equal(botoes(r).filter((b) => /Editar|Excluir|Apagar|Remover/i.test(txt(b))).length, 0);
  assert.deepEqual(botoes(r).map((b) => txt(b).replace(/[\["\]]/g, "")), ["Cadastrar nova vigência"]);
});
await caso("aba de percentuais: sem data → pede a data; data passada → 'não pode começar antes de hoje'; percentual com 3 casas ou acima do limite → mensagem do campo; nada é enviado ao servidor em nenhum desses casos", async () => {
  const r = await montarAba();
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /Informe a data de início da vigência/);
  await act(async () => { campoData(r).props.onChange({ target: { value: ontem } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /A vigência não pode começar antes de hoje: os percentuais que já valeram não são reescritos\./);
  await act(async () => { campoData(r).props.onChange({ target: { value: HOJE } }); });
  await act(async () => { porData(r, "data-campo", "fgts_bp")[0].props.onChange({ target: { value: "8,555" } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /FGTS: informe o percentual com até 2 casas/);
  await act(async () => { porData(r, "data-campo", "fgts_bp")[0].props.onChange({ target: { value: "50" } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /FGTS passa do limite de 10%/);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0, "nada foi enviado");
});
await caso("aba de percentuais: cadastrar pede confirmação ('não dá para editar nem apagar'), envia a data e os 10 percentuais em PONTOS-BASE, e depois recarrega com aviso de sucesso", async () => {
  const dia = new Date(Date.UTC(Number(HOJE.slice(0, 4)), Number(HOJE.slice(5, 7)) - 1, Number(HOJE.slice(8, 10)) + 30)).toISOString().slice(0, 10);
  const r = await montarAba();
  await act(async () => { campoData(r).props.onChange({ target: { value: dia } }); });
  await act(async () => { porData(r, "data-campo", "taxa_administrativa_bp")[0].props.onChange({ target: { value: "15,5" } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  assert.match(textoDe(r), /Confirma cadastrar estes percentuais a partir de/);
  assert.match(textoDe(r), /não dá para editar nem apagar/);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0, "ainda não enviou");
  await clicar(botaoPorTexto(r, "Voltar"));
  assert.equal(botaoPorTexto(r, "Sim, cadastrar"), undefined);
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  await clicar(botaoPorTexto(r, "Sim, cadastrar"));
  await esperar(20);
  const post = chamadas.filter((c) => c.metodo === "POST");
  assert.equal(post.length, 1);
  assert.equal(post[0].corpo.vigente_desde, dia);
  assert.equal(post[0].corpo.taxa_administrativa_bp, 1550);
  assert.equal(post[0].corpo.inss_patronal_bp, 3120);
  assert.equal(post[0].corpo.ret_pis_bp, 65);
  assert.deepEqual(Object.keys(post[0].corpo).sort(), ["vigente_desde", ...CHAVES_PARAMETROS_MOT].sort());
  assert.match(textoDe(r), /Nova vigência cadastrada/);
  assert.ok(chamadas.filter((c) => c.metodo === "GET").length >= 2, "recarregou a lista");
});
await caso("aba de percentuais: data repetida → mostra a mensagem do servidor (409) e não cadastra; erro genérico mostra 'nada foi alterado'", async () => {
  const dia = new Date(Date.UTC(Number(HOJE.slice(0, 4)), Number(HOJE.slice(5, 7)) - 1, Number(HOJE.slice(8, 10)) + 5)).toISOString().slice(0, 10);
  const r = await montarAba(DADOS(), () => ({ status: 409, corpo: { error: "Já existe uma vigência com esta data. Escolha outra data." } }));
  await act(async () => { campoData(r).props.onChange({ target: { value: dia } }); });
  await clicar(botaoPorTexto(r, "Cadastrar nova vigência"));
  await clicar(botaoPorTexto(r, "Sim, cadastrar"));
  await esperar(20);
  assert.match(textoDe(r), /Já existe uma vigência com esta data\. Escolha outra data\./);
  assert.doesNotMatch(textoDe(r), /Nova vigência cadastrada/);
  assert.equal(botaoPorTexto(r, "Sim, cadastrar"), undefined, "a confirmação fecha para a pessoa trocar a data");
  const r2 = await montarAba(DADOS(), () => ({ status: 500, corpo: { error: "Não foi possível salvar os percentuais. Nada foi alterado." } }));
  await act(async () => { campoData(r2).props.onChange({ target: { value: dia } }); });
  await clicar(botaoPorTexto(r2, "Cadastrar nova vigência"));
  await clicar(botaoPorTexto(r2, "Sim, cadastrar"));
  await esperar(20);
  assert.match(textoDe(r2), /Nada foi alterado/);
});
await caso("aba de percentuais: acesso negado (não é diretoria) mostra só a mensagem; sem vigência hoje avisa que as propostas não podem ser calculadas; vigência futura aparece como (futura)", async () => {
  const r = await montarAba(undefined, undefined);
  resposta = () => ({ status: 403, corpo: { error: "Só a diretoria acessa os percentuais do MOT." } });
  let n!: TestRenderer.ReactTestRenderer;
  await act(async () => { n = TestRenderer.create(React.createElement(PercentuaisMotAdmin)); });
  vivos.push(n);
  await esperar(20);
  assert.match(textoDe(n), /Só a diretoria acessa os percentuais do MOT/);
  assert.equal(botoes(n).length, 0);
  const futura = linha({ id: "f", vigente_desde: "2999-01-01" });
  const r2 = await montarAba({ hoje: HOJE, vigentes: null, historico: [futura], limites: LIMITES_PARAMETROS_MOT });
  assert.match(textoDe(r2), /Não há percentuais em vigor hoje/);
  assert.match(textoDe(r2), /\(futura\)/);
  void r;
});

// ═══ Detalhe do MOT ══════════════════════════════════════════════════════════
const CONTEUDO = conteudoMotSchema.parse({ funcoes: [{ area: "OPERACIONAL", salario_centavos: 100000, jornada: "Conforme CCT", horario: "Turnos A/B/C" }, { area: "ADM", descricao: "Auxiliar", salario_centavos: 320000, jornada: "40h", horario: "08h" }], clausulas_adicionais: ["Cláusula especial."] });
const detalheMot = (extra: Partial<DetalheMot> = {}): DetalheMot => ({
  id: "p1", numero: "TESTE-MOT-0001/26", modelo: "MOT", revisao_atual: 0, situacao: "rascunho", cliente_nome: "cliente teste", aos_cuidados: "Ana", empresa_visitada_id: null, conteudo: CONTEUDO,
  validade_dias: 10, validade_ate: null, valor_estimado: null, enviada_em: null, updated_at: "2026-11-20T10:00:00Z", vendedor_nome: "Olver", vendedor_telefone: "1", revisoes: [], historico: [], teste: true, ...extra,
});
const propsDetalhe = (d: DetalheMot, extra: Record<string, unknown> = {}) => ({
  d, hoje: HOJE, podeEditar: true, somenteLeitura: false, temFunil: false, oportunidadeAbertaPropria: false,
  planilha: { origem: "hoje", previa: PREVIA, erro: null }, aviso: null, onAviso: () => {}, onRecarregar: async () => {}, ...extra,
});
async function montarDetalhe(d: DetalheMot, extra: Record<string, unknown> = {}) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PropostaDetalheMot, propsDetalhe(d, extra) as any)); });
  vivos.push(r);
  return r;
}
await caso("detalhe MOT (rascunho de teste): funções, planilha com os valores calculados, condições, cláusula numerada 1., selo TESTE, SEM CNPJ/endereço; 'PDF do MOT em breve' desabilitado e nenhum link para a rota de PDF", async () => {
  const r = await montarDetalhe(detalheMot());
  const t = textoDe(r);
  assert.match(t, /TESTE-MOT-0001\/26/);
  assert.match(t, /TESTE/);
  assert.match(t, /Mão de Obra Temporária/);
  assert.match(t, /Conforme CCT/);
  assert.equal(porData(r, "data-funcao").length, 2);
  assert.match(t, /Base de cálculo: R\$\s?4\.200,00/);
  assert.match(t, /Valor estimado R\$\s?7\.936,59/);
  assert.match(txt(porData(r, "data-total-mensal")[0]), /7\.936,59/);
  assert.match(t, /dia 15 e dia 30/);
  assert.match(t, /1\.6\s?Cláusula especial\./);
  assert.doesNotMatch(t, /CNPJ|Endereço/);
  assert.doesNotMatch(t, /\d,\d+%|pontos-base/, "sem percentuais na tela do vendedor");
  assert.doesNotMatch(t, /PDF do MOT em breve/);
  const links = r.root.findAll((n) => n.type === "a" && n.props["data-pdf-mot"] !== undefined);
  assert.equal(links.length, 1, "rascunho: só o link do PDF do rascunho");
  assert.equal(links[0].props.href, "/api/comercial/propostas/p1/pdf");
  assert.match(txt(links[0]), /Gerar PDF do rascunho/);
  assert.equal(r.root.findAll((n) => n.type === "button" && n.props["data-pdf-mot"] !== undefined).length, 0, "nenhum botão desabilitado de PDF");
  assert.ok(botaoPorTexto(r, "Marcar como enviada") && botaoPorTexto(r, "Editar") && botaoPorTexto(r, "Cancelar"));
});
await caso("detalhe MOT: PDF como o R&S — rascunho 'Gerar PDF do rascunho'; enviada 'Gerar PDF (Rev. N)' e 'Ver PDF' por revisão com ?rev=N; cancelada que nunca foi enviada não tem PDF", async () => {
  const revs = [{ id: "r1", revisao: 1, template_versao: 1, vendedor_nome: "Olver", created_at: "2026-11-20T12:00:00Z" }, { id: "r0", revisao: 0, template_versao: 1, vendedor_nome: "Olver", created_at: "2026-11-20T11:00:00Z" }];
  const r = await montarDetalhe(detalheMot({ situacao: "enviada", revisao_atual: 1, revisoes: revs, valor_estimado: 7936.57, enviada_em: "2026-11-20T12:00:00Z", validade_ate: "2026-11-30" }));
  const links = r.root.findAll((n) => n.type === "a" && n.props["data-pdf-mot"] !== undefined);
  assert.deepEqual(links.map((a) => a.props.href), ["/api/comercial/propostas/p1/pdf", "/api/comercial/propostas/p1/pdf?rev=1", "/api/comercial/propostas/p1/pdf?rev=0"]);
  assert.match(txt(links[0]), /Gerar PDF \(Rev\. 1\)/);
  assert.match(txt(links[1]), /Ver PDF/);
  assert.ok(links.every((a) => a.props.target === "_blank"));
  const cancelada = await montarDetalhe(detalheMot({ situacao: "cancelada", revisoes: [] }));
  assert.equal(cancelada.root.findAll((n) => n.type === "a" && n.props["data-pdf-mot"] !== undefined).length, 0, "sem envio não há PDF");
  const canceladaEnviada = await montarDetalhe(detalheMot({ situacao: "cancelada", revisoes: [revs[1]] }));
  assert.equal(canceladaEnviada.root.findAll((n) => n.type === "a" && n.props["data-pdf-mot"] !== undefined).length, 2, "cancelada que foi enviada mantém os PDFs das revisões");
});
await caso("detalhe MOT enviada: valor estimado vem do servidor; planilha é a da revisão; somente leitura esconde os botões de ação", async () => {
  const enviada = detalheMot({ situacao: "enviada", revisao_atual: 1, valor_estimado: 7936.57, enviada_em: "2026-11-20T12:00:00Z", validade_ate: "2026-11-30", revisoes: [{ id: "r1", revisao: 1, template_versao: 1, vendedor_nome: "Olver", created_at: "2026-11-20T12:00:00Z" }, { id: "r0", revisao: 0, template_versao: 1, vendedor_nome: "Olver", created_at: "2026-11-20T11:00:00Z" }] });
  const r = await montarDetalhe(enviada, { planilha: { origem: "revisao", previa: PREVIA, erro: null } });
  const t = textoDe(r);
  assert.match(t, /Planilha desta revisão/);
  assert.match(t, /7\.936,57/);
  assert.equal(porData(r, "data-pdf-mot").length, 3, "link do topo + 2 revisões");
  assert.ok(botaoPorTexto(r, "Aceita") && botaoPorTexto(r, "Recusada"));
  assert.equal(botaoPorTexto(r, "Marcar como enviada"), undefined);
  const leitura = await montarDetalhe(enviada, { somenteLeitura: true });
  assert.match(textoDe(leitura), /somente leitura/);
  assert.equal(botaoPorTexto(leitura, "Aceita"), undefined);
  assert.equal(botaoPorTexto(leitura, "Editar"), undefined);
});
await caso("detalhe MOT: 'Marcar como enviada' abre a janela do MOT (sem campo de valor) e o envio manda só { para: 'enviada' }; o erro 'sem percentuais' aparece sem recarregar a tela", async () => {
  chamadas = [];
  resposta = () => ({ status: 409, corpo: { error: "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los." } });
  let recarregou = 0;
  const r = await montarDetalhe(detalheMot(), { onRecarregar: async () => { recarregou++; } });
  await clicar(botaoPorTexto(r, "Marcar como enviada"));
  assert.equal(r.root.findAllByType(CampoMoeda).length, 0);
  assert.match(textoDe(r), /Valor mensal total/);
  await clicar(botaoPorTexto(r, "Confirmar envio"));
  await esperar(20);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "/api/comercial/propostas/p1/situacao");
  assert.deepEqual(chamadas[0].corpo, { para: "enviada" });
  assert.match(textoDe(r), /Peça à diretoria para cadastrá-los/);
  assert.equal(recarregou, 0, "a mensagem de percentuais não recarrega a proposta");
});
await caso("detalhe MOT sem planilha (sem percentuais no rascunho): mostra o aviso em vez da planilha e a janela de envio não deixa confirmar", async () => {
  const r = await montarDetalhe(detalheMot(), { planilha: { origem: "hoje", previa: null, erro: "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los." } });
  assert.match(textoDe(r), /Peça à diretoria para cadastrá-los/);
  assert.equal(porData(r, "data-total-mensal").length, 0);
  await clicar(botaoPorTexto(r, "Marcar como enviada"));
  assert.equal(botaoPorTexto(r, "Confirmar envio")?.props.disabled, true);
});
await caso("detalhe MOT: editar abre o formulário MOT com os dados salvos e salvar manda PATCH com updated_at, salário em centavos e o mesmo formato de conteúdo (sem CNPJ/endereço)", async () => {
  chamadas = [];
  resposta = (c) => (c.metodo === "PATCH" ? { status: 200, corpo: { data: {} } } : c.url.includes("previa") ? servidorPrevia(c) : { status: 200, corpo: { data: [] } });
  const r = await montarDetalhe(detalheMot({ empresa_visitada_id: "e1" }));
  await clicar(botaoPorTexto(r, "Editar"));
  await esperar(DEBOUNCE);
  assert.equal(r.root.findAllByType(CampoMoeda).length, 2);
  assert.match(textoDe(r), /Cálculo do valor mensal/);
  await clicar(botaoPorTexto(r, "Salvar"));
  await esperar(20);
  const patch = chamadas.find((c) => c.metodo === "PATCH")!;
  assert.ok(patch);
  assert.equal(patch.url, "/api/comercial/propostas/p1");
  assert.equal(patch.corpo.updated_at, "2026-11-20T10:00:00Z");
  assert.deepEqual(patch.corpo.conteudo.funcoes.map((f: any) => f.salario_centavos), [100000, 320000]);
  assert.equal("cliente_cnpj" in patch.corpo.conteudo, false);
  assert.ok(conteudoMotSchema.safeParse(patch.corpo.conteudo).success);
});


await caso("detalhe MOT enviada: ao editar o aviso diz que o valor estimado passa a ser o da nova revisão; depois de salvar, o aviso do Funil devolvido pelo servidor aparece", async () => {
  chamadas = [];
  resposta = (c) => (c.metodo === "PATCH" ? { status: 200, corpo: { data: {}, aviso: "O valor do Funil não pôde ser atualizado." } } : c.url.includes("previa") ? servidorPrevia(c) : { status: 200, corpo: { data: [] } });
  const avisos: (string | null)[] = [];
  const enviada = detalheMot({ situacao: "enviada", revisao_atual: 0, valor_estimado: 7936.57, enviada_em: "2026-11-20T12:00:00Z", validade_ate: "2026-11-30" });
  const r = await montarDetalhe(enviada, { onAviso: (a: string | null) => avisos.push(a) });
  await clicar(botaoPorTexto(r, "Editar"));
  await esperar(DEBOUNCE);
  assert.match(textoDe(r), /Isto vai gerar a Rev. 1 ?. A revisão anterior continua guardada.*O valor estimado passa a ser o da nova revisão./);
  await clicar(botaoPorTexto(r, "Salvar e gerar Rev. 1"));
  await esperar(40);
  assert.equal(avisos.length, 1);
  assert.match(String(avisos[0]), /Revisão 1 emitida. Gere o PDF desta revisão para enviar ao cliente. O valor do Funil não pôde ser atualizado./);
  // rascunho: sem o aviso de revisão
  const rasc = await montarDetalhe(detalheMot());
  await clicar(botaoPorTexto(rasc, "Editar"));
  assert.doesNotMatch(textoDe(rasc), /valor estimado passa a ser/);
  // desmonta: o formulário aberto tem consulta de prévia pendente e não pode vazar para os casos seguintes
  await act(async () => { r.unmount(); rasc.unmount(); });
});

// ═══ Tela "Nova proposta": seletor de modelo e envio ═════════════════════════
import PropostaNovaClient from "@/components/propostas/PropostaNovaClient";
const EMPRESA_REAL = { id: "e-real", nome: "Pastifício Selmi", contatos: [{ id: "c1", nome: "Ana", cargo: null, principal: true }] };
const EMPRESA_TESTE = { id: "e-teste", nome: "cliente teste", contatos: [], teste: true };
const EMPRESA_REAL_GESTOR = { ...EMPRESA_REAL, teste: false };
async function montarNova(gestor: boolean, empresas: unknown[]) {
  chamadas = [];
  // O harness troca next/navigation por um roteador que só registra as chamadas em globalThis.__ROUTER__ (scripts/harness-mot/mocks/next-navigation.mjs).
  (globalThis as any).__ROUTER__ = [];
  const navegou: string[] = (globalThis as any).__ROUTER__;
  resposta = (c) => {
    if (c.url.includes("/previa")) return servidorPrevia(c);
    if (c.metodo === "POST" && c.url === "/api/comercial/propostas") return { status: 201, corpo: { data: { id: "novo" }, aviso: null } };
    return { status: 200, corpo: { data: empresas } };
  };
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(PropostaNovaClient, { meuNome: "Olver", gestor })); });
  vivos.push(r);
  await esperar(20);
  return { r, navegou };
}
const rotuloDoModelo = (r: TestRenderer.ReactTestRenderer, m: string) => txt(r.root.findAll((n) => n.type === "button" && n.props["data-modelo"] === m)[0]);
const botaoModelo = (r: TestRenderer.ReactTestRenderer, m: string) => r.root.findAll((n) => n.type === "button" && n.props["data-modelo"] === m)[0];
const escolherEmpresa = async (r: TestRenderer.ReactTestRenderer, nome: string) => { await clicar(botoes(r).find((b) => txt(b).includes(nome))); };
await caso("Nova proposta (vendedor): MOT e TS seguem 'Em breve' e desabilitados, mesmo com empresa escolhida; só o R&S está disponível; o formulário é o do R&S", async () => {
  const { r } = await montarNova(false, [EMPRESA_REAL]);
  await escolherEmpresa(r, "Pastifício Selmi");
  assert.match(rotuloDoModelo(r, "RS"), /Disponível/);
  for (const m of ["MOT", "TS"]) { assert.match(rotuloDoModelo(r, m), /Em breve/); assert.equal(botaoModelo(r, m).props.disabled, true); }
  assert.match(textoDe(r), /CNPJ do cliente/);
  assert.equal(r.root.findAllByType(CampoMoeda).length, 0);
});
await caso("Nova proposta (gestor): MOT e TS aparecem como 'Em teste' e só habilitam com empresa de TESTE; em empresa real ficam desabilitados (a 2D liberou o TS na mesma trava do MOT)", async () => {
  const { r } = await montarNova(true, [EMPRESA_REAL_GESTOR, EMPRESA_TESTE]);
  assert.match(rotuloDoModelo(r, "MOT"), /Em teste/);
  assert.equal(botaoModelo(r, "MOT").props.disabled, true, "sem empresa escolhida");
  await escolherEmpresa(r, "Pastifício Selmi");
  assert.match(rotuloDoModelo(r, "MOT"), /escolha uma empresa de teste/);
  assert.equal(botaoModelo(r, "MOT").props.disabled, true, "empresa real");
  assert.match(rotuloDoModelo(r, "TS"), /escolha uma empresa de teste/);
  assert.equal(botaoModelo(r, "TS").props.disabled, true, "empresa real");
  await clicar(botoes(r).find((b) => txt(b).includes("Trocar empresa")));
  await escolherEmpresa(r, "cliente teste");
  assert.equal(botaoModelo(r, "MOT").props.disabled, false);
  assert.equal(botaoModelo(r, "TS").props.disabled, false);
  assert.equal(rotuloDoModelo(r, "MOT"), "Mão de Obra TemporáriaEm teste");
  assert.equal(rotuloDoModelo(r, "TS"), "Terceirização de ServiçosEm teste");
});
await caso("Nova proposta (gestor, empresa de teste): escolher MOT troca para o formulário MOT (sem CNPJ/endereço), cria com POST de modelo MOT em centavos e vai para o detalhe; o botão fica travado sem percentuais; trocar para empresa real volta ao R&S", async () => {
  const { r, navegou } = await montarNova(true, [EMPRESA_REAL_GESTOR, EMPRESA_TESTE]);
  await escolherEmpresa(r, "cliente teste");
  await clicar(botaoModelo(r, "MOT"));
  const t = textoDe(r);
  assert.match(t, /Modelo em teste: esta proposta sai como TESTE-MOT/);
  assert.match(t, /Funções/);
  assert.doesNotMatch(t, /CNPJ|Endereço/);
  await act(async () => { r.root.findAllByType(CampoMoeda)[0].props.onChange(1000); });
  await esperar(DEBOUNCE);
  assert.match(textoDe(r), /1\.889,64/);
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  await esperar(120);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
  assert.ok(post, "criou");
  assert.equal(post.corpo.modelo, "MOT");
  assert.equal(post.corpo.empresa_visitada_id, "e-teste");
  assert.deepEqual(post.corpo.conteudo.funcoes.map((f: any) => f.salario_centavos), [100000]);
  assert.ok(conteudoMotSchema.safeParse(post.corpo.conteudo).success);
  assert.deepEqual([...navegou], ["push:/painel/comercial/propostas/novo"]);
  // empresa real → o modelo volta ao R&S sozinho
  const outro = await montarNova(true, [EMPRESA_REAL_GESTOR, EMPRESA_TESTE]);
  await escolherEmpresa(outro.r, "cliente teste");
  await clicar(botaoModelo(outro.r, "MOT"));
  await clicar(botoes(outro.r).find((b) => txt(b).includes("Trocar empresa")));
  await escolherEmpresa(outro.r, "Pastifício Selmi");
  assert.match(textoDe(outro.r), /CNPJ do cliente/);
  assert.equal(outro.r.root.findAllByType(CampoMoeda).length, 0);
});
await caso("Nova proposta MOT sem percentuais vigentes: mostra a mensagem do servidor e o 'Criar rascunho' fica desabilitado (nenhuma proposta é criada)", async () => {
  const { r } = await montarNova(true, [EMPRESA_TESTE]);
  await escolherEmpresa(r, "cliente teste");
  await clicar(botaoModelo(r, "MOT"));
  resposta = (c) => (c.url.includes("/previa") ? { status: 409, corpo: { error: "Não há percentuais do MOT vigentes para esta data. Peça à diretoria para cadastrá-los." } } : { status: 201, corpo: { data: { id: "x" } } });
  chamadas = [];
  await act(async () => { r.root.findAllByType(CampoMoeda)[0].props.onChange(1000); });
  await esperar(DEBOUNCE);
  assert.match(textoDe(r), /Peça à diretoria para cadastrá-los/);
  assert.equal(botaoPorTexto(r, "Criar rascunho")?.props.disabled, true);
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  assert.equal(chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas").length, 0);
});
await caso("Nova proposta R&S: o corpo enviado é o de sempre (modelo RS, conteúdo R&S com CNPJ/endereço/condições), idêntico ao de antes da 2D", async () => {
  const { r } = await montarNova(false, [EMPRESA_REAL]);
  await escolherEmpresa(r, "Pastifício Selmi");
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  await esperar(20);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
  assert.equal(post.corpo.modelo, "RS");
  assert.deepEqual(Object.keys(post.corpo).sort(), ["aos_cuidados", "contato_id", "conteudo", "empresa_visitada_id", "modelo", "validade_dias"]);
  assert.deepEqual(Object.keys(post.corpo.conteudo).sort(), ["clausulas_adicionais", "cliente_cnpj", "cliente_endereco", "condicoes", "texto_introdutorio"]);
});

// ═══ Tela "Nova proposta": clientes cadastrados sem Carteira ═════════════════════════════════════════════════
const CLIENTE_SEM_CARTEIRA = { origem: "cliente", cliente_id: "c-novo", nome: "ZZTEST Cliente Novo", cidade: "Monte Mor" };
const EMPRESA_CRIADA = { id: "e-criada", nome: "ZZTEST Cliente Novo", cliente_id: "c-novo", contatos: [{ id: "ct-1", nome: "Ana Contato", cargo: null, principal: true }], oportunidade_aberta: null };
const botoesDeCliente = (r: TestRenderer.ReactTestRenderer) => botoes(r).filter((b) => b.props["data-origem"] === "cliente");
const aoDeClienteResponde = (corpo: { status: number; corpo: unknown }) => {
  const anterior = resposta;
  resposta = (c) => (c.url === "/api/comercial/propostas/empresas/de-cliente" ? corpo : anterior(c));
};
await caso("Nova proposta: o cliente sem Carteira aparece com o selo 'Cliente cadastrado' (empresas da Carteira seguem sem selo); o item não tem id de empresa e nada é criado só de listar", async () => {
  const { r } = await montarNova(false, [EMPRESA_REAL, CLIENTE_SEM_CARTEIRA]);
  const cli = botoesDeCliente(r);
  assert.equal(cli.length, 1);
  assert.match(txt(cli[0]), /ZZTEST Cliente Novo/);
  assert.match(txt(cli[0]), /Monte Mor/);
  assert.match(txt(cli[0]), /Cliente cadastrado/);
  const carteira = botoes(r).find((b) => txt(b).includes("Pastifício Selmi"))!;
  assert.doesNotMatch(txt(carteira), /Cliente cadastrado/);
  assert.equal(carteira.props["data-origem"], undefined);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0, "só a busca (GET) aconteceu");
});
await caso("Nova proposta: clicar no cliente chama a rota de-cliente com o cliente_id e segue com a EMPRESA REAL devolvida (A/C = contato principal); o 'Criar rascunho' envia o id da empresa real, nunca o do cliente", async () => {
  const { r } = await montarNova(false, [CLIENTE_SEM_CARTEIRA]);
  aoDeClienteResponde({ status: 201, corpo: { data: EMPRESA_CRIADA } });
  chamadas = [];
  await clicar(botoesDeCliente(r)[0]);
  await esperar(20);
  const de = chamadas.filter((c) => c.url === "/api/comercial/propostas/empresas/de-cliente");
  assert.equal(de.length, 1);
  assert.equal(de[0].metodo, "POST");
  assert.deepEqual(de[0].corpo, { cliente_id: "c-novo" });
  assert.match(textoDe(r), /ZZTEST Cliente Novo/);
  assert.ok(botaoPorTexto(r, "Trocar empresa"), "a empresa foi escolhida");
  assert.ok(r.root.findAll((n) => n.type === "input" && n.props.value === "Ana Contato").length >= 1, "A/C preenchido com o contato principal");
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  await esperar(20);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
  assert.ok(post, "criou a proposta");
  assert.equal(post.corpo.empresa_visitada_id, "e-criada");
  assert.equal(post.corpo.contato_id, "ct-1");
  assert.equal(post.corpo.aos_cuidados, "Ana Contato");
  assert.ok(!JSON.stringify(post.corpo).includes("c-novo"), "o id do cliente nunca vai na proposta");
  // Trocar de empresa: o cliente já tem empresa e não volta a aparecer como cliente.
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  assert.equal(botoesDeCliente(r).length, 0);
});
await caso("Nova proposta: clique duplo no cliente faz UMA chamada; erro do servidor (409/404) aparece na tela e nenhuma empresa é escolhida; o cliente continua na lista", async () => {
  const { r } = await montarNova(false, [CLIENTE_SEM_CARTEIRA]);
  aoDeClienteResponde({ status: 409, corpo: { error: "Já existe uma empresa com este nome na Carteira. Escolha a empresa da Carteira na lista; ela não é ligada ao cliente automaticamente." } });
  chamadas = [];
  const b = botoesDeCliente(r)[0];
  await act(async () => { b.props.onClick(); b.props.onClick(); });
  await esperar(20);
  assert.equal(chamadas.filter((c) => c.url === "/api/comercial/propostas/empresas/de-cliente").length, 1, "clique duplo = uma chamada");
  assert.match(textoDe(r), /Escolha a empresa da Carteira na lista/);
  assert.equal(botaoPorTexto(r, "Trocar empresa"), undefined, "nenhuma empresa escolhida");
  assert.equal(botoesDeCliente(r).length, 1);
  assert.equal(botoesDeCliente(r)[0].props.disabled, false, "botão destravado depois do erro");
  // Falha de rede: mensagem genérica e destravado.
  const anterior = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => { throw new Error("rede"); };
  await clicar(botoesDeCliente(r)[0]);
  await esperar(20);
  (globalThis as any).fetch = anterior;
  assert.match(textoDe(r), /Não foi possível preparar este cliente/);
  assert.equal(botoesDeCliente(r)[0].props.disabled, false);
});
await caso("Nova proposta (gestor): a empresa criada do cliente vem com teste:false e o botão 'Marcar como empresa de teste' aparece; o modelo MOT continua desabilitado (empresa real)", async () => {
  const { r } = await montarNova(true, [CLIENTE_SEM_CARTEIRA]);
  aoDeClienteResponde({ status: 201, corpo: { data: { ...EMPRESA_CRIADA, teste: false } } });
  await clicar(botoesDeCliente(r)[0]);
  await esperar(20);
  assert.ok(botaoPorTexto(r, "Marcar como empresa de teste"));
  assert.equal(botaoModelo(r, "MOT").props.disabled, true);
});

// ═══ Tela "Nova proposta": pré-preenchimento a partir do cadastro (A/C, CNPJ, endereço) ═══════════════════════════════════════════
const EMP_A = { id: "e-a", nome: "ZZTEST Empresa A", contatos: [{ id: "ca1", nome: "Ana Principal", cargo: "RH", principal: true }, { id: "ca2", nome: "Zé Segundo", cargo: null, principal: false }] };
const EMP_B = { id: "e-b", nome: "ZZTEST Empresa B", contatos: [] };
const EMP_C = { id: "e-c", nome: "ZZTEST Empresa C", contatos: [{ id: "cc1", nome: "Carla Contato", cargo: null, principal: true }] };
const ENDERECO_A = "Rua Ribeirão Preto, 251, Térreo — Jardim do Trevo, Campinas - SP, CEP 13030-140";
const PREFILL: Record<string, unknown> = {
  "e-a": { contato: { nome: "Ana Principal", cargo: "RH" }, cnpj: "21235881000108", endereco: ENDERECO_A, cidade: "Campinas" },
  "e-b": { contato: null, cnpj: null, endereco: null, cidade: null },
  "e-c": { contato: { nome: "Carla Contato", cargo: null }, cnpj: "CNPJ pendente", endereco: null, cidade: "Sumaré" },
};
const prefillDe = (url: string) => PREFILL[url.split("/empresas/")[1]?.split("/")[0] ?? ""];
async function montarComPrefill(gestor = false, empresas: unknown[] = [EMP_A, EMP_B, EMP_C]) {
  const m = await montarNova(gestor, empresas);
  const anterior = resposta;
  resposta = (c) => (c.metodo === "GET" && c.url.endsWith("/prefill") ? { status: 200, corpo: { data: prefillDe(c.url) } } : anterior(c));
  return m;
}
const campoPorLimite = (r: TestRenderer.ReactTestRenderer, max: number) => r.root.findAll((n) => n.type === "input" && n.props.maxLength === max)[0];
const valorAC = (r: TestRenderer.ReactTestRenderer) => campoPorLimite(r, 200).props.value;
const valorCnpj = (r: TestRenderer.ReactTestRenderer) => campoPorLimite(r, 30).props.value;
const valorEndereco = (r: TestRenderer.ReactTestRenderer) => campoPorLimite(r, 300).props.value;
const tres = (r: TestRenderer.ReactTestRenderer) => [valorAC(r), valorCnpj(r), valorEndereco(r)];
const digitarNo = async (campo: TestRenderer.ReactTestInstance, valor: string) => { await act(async () => { campo.props.onChange({ target: { value: valor } }); }); };
const chamadasPrefill = () => chamadas.filter((c) => c.url.endsWith("/prefill"));

await caso("pré-preenchimento: empresa com contato principal e cliente preenche A/C (principal), CNPJ (com a máscara do sistema) e endereço (o do cadastro); tudo segue editável; uma única consulta leve", async () => {
  const { r } = await montarComPrefill();
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await esperar(20);
  assert.deepEqual(tres(r), ["Ana Principal", "21.235.881/0001-08", ENDERECO_A]);
  assert.equal(chamadasPrefill().length, 1);
  assert.equal(chamadasPrefill()[0].url, "/api/comercial/propostas/empresas/e-a/prefill");
  assert.equal(chamadasPrefill()[0].metodo, "GET");
  for (const n of [campoPorLimite(r, 200), campoPorLimite(r, 30), campoPorLimite(r, 300)]) assert.ok(!n.props.disabled && !n.props.readOnly, "continua editável");
  // Editar e criar: o corpo enviado é o do formulário (o que está na tela), não o do cadastro.
  await digitarNo(campoPorLimite(r, 30), "21.235.881/0001-08 (matriz)");
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  await esperar(20);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
  assert.equal(post.corpo.aos_cuidados, "Ana Principal");
  assert.equal(post.corpo.conteudo.cliente_cnpj, "21.235.881/0001-08 (matriz)");
  assert.equal(post.corpo.conteudo.cliente_endereco, ENDERECO_A);
});
await caso("pré-preenchimento: empresa sem contato e sem cliente deixa A/C, CNPJ e endereço VAZIOS; sem endereço o campo recebe a cidade; CNPJ fora do padrão vem como texto, sem bloquear", async () => {
  const { r } = await montarComPrefill();
  await escolherEmpresa(r, "ZZTEST Empresa B");
  await esperar(20);
  assert.deepEqual(tres(r), ["", "", ""]);
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  await escolherEmpresa(r, "ZZTEST Empresa C");
  await esperar(20);
  assert.deepEqual(tres(r), ["Carla Contato", "CNPJ pendente", "Sumaré"]);
});
await caso("TROCA DE EMPRESA reinicia A/C, CNPJ e endereço, MESMO os digitados: digitar nos três na empresa A e trocar para a B não deixa NADA de A; para a C vêm os dados da C", async () => {
  const { r } = await montarComPrefill();
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await esperar(20);
  await digitarNo(campoPorLimite(r, 200), "Maria do Financeiro");
  await digitarNo(campoPorLimite(r, 30), "99.999.999/0001-99");
  await digitarNo(campoPorLimite(r, 300), "Rua do Vendedor, 10");
  assert.deepEqual(tres(r), ["Maria do Financeiro", "99.999.999/0001-99", "Rua do Vendedor, 10"]);
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  await escolherEmpresa(r, "ZZTEST Empresa B");
  await esperar(20);
  assert.deepEqual(tres(r), ["", "", ""], "empresa sem dados: nada da A sobra, nem o digitado");
  assert.ok(!JSON.stringify(r.toJSON()).includes("Maria do Financeiro") && !JSON.stringify(r.toJSON()).includes("99.999.999") && !JSON.stringify(r.toJSON()).includes("Rua do Vendedor"));
  // Digita na B e troca para a C: de novo, só os dados da C.
  await digitarNo(campoPorLimite(r, 30), "11.111.111/0001-11");
  await digitarNo(campoPorLimite(r, 300), "Endereço da B digitado");
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  await escolherEmpresa(r, "ZZTEST Empresa C");
  await esperar(20);
  assert.deepEqual(tres(r), ["Carla Contato", "CNPJ pendente", "Sumaré"]);
  // E o corpo enviado é o da empresa atual.
  await clicar(botaoPorTexto(r, "Criar rascunho"));
  await esperar(20);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/comercial/propostas")!;
  assert.equal(post.corpo.empresa_visitada_id, "e-c");
  assert.deepEqual([post.corpo.aos_cuidados, post.corpo.conteudo.cliente_cnpj, post.corpo.conteudo.cliente_endereco], ["Carla Contato", "CNPJ pendente", "Sumaré"]);
});
await caso("MESMA empresa: o que o vendedor digitou ANTES da resposta do cadastro não é sobrescrito; os campos que continuam vazios são preenchidos", async () => {
  const { r } = await montarComPrefill();
  let liberar!: () => void;
  const portao = new Promise<void>((ok) => { liberar = ok; });
  const antes = (globalThis as any).fetch;
  (globalThis as any).fetch = async (u: string, i?: RequestInit) => { if (String(u).endsWith("/prefill")) await portao; return antes(u, i); };
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await digitarNo(campoPorLimite(r, 30), "CNPJ digitado antes");
  await digitarNo(campoPorLimite(r, 200), "Maria digitou o A/C");
  assert.deepEqual(tres(r), ["Maria digitou o A/C", "CNPJ digitado antes", ""]);
  await act(async () => { liberar(); await new Promise((ok) => setTimeout(ok, 20)); });
  (globalThis as any).fetch = antes;
  assert.deepEqual(tres(r), ["Maria digitou o A/C", "CNPJ digitado antes", ENDERECO_A], "digitado fica; só o endereço (vazio) foi preenchido");
});
await caso("RESPOSTA ATRASADA de uma empresa já trocada é descartada: escolher A e logo a C mostra só os dados da C; e a resposta da A que chega depois da troca não entra", async () => {
  const { r } = await montarComPrefill();
  const a = botoes(r).find((b) => txt(b).includes("ZZTEST Empresa A"))!;
  const c = botoes(r).find((b) => txt(b).includes("ZZTEST Empresa C"))!;
  await act(async () => { a.props.onClick(); c.props.onClick(); });
  await esperar(30);
  assert.deepEqual(tres(r), ["Carla Contato", "CNPJ pendente", "Sumaré"]);
  assert.equal(chamadasPrefill().length, 2);
  // A resposta da A fica presa; a troca para a B acontece; a resposta da A é liberada DEPOIS e não pode aparecer.
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  let liberar!: () => void;
  const portao = new Promise<void>((ok) => { liberar = ok; });
  const antes = (globalThis as any).fetch;
  (globalThis as any).fetch = async (u: string, i?: RequestInit) => { if (String(u).includes("/e-a/prefill")) await portao; return antes(u, i); };
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  await escolherEmpresa(r, "ZZTEST Empresa B");
  await esperar(20);
  assert.deepEqual(tres(r), ["", "", ""]);
  await act(async () => { liberar(); await new Promise((ok) => setTimeout(ok, 20)); });
  (globalThis as any).fetch = antes;
  assert.deepEqual(tres(r), ["", "", ""], "resposta atrasada da A descartada");
});
await caso("pré-preenchimento: se a consulta falha (erro, rede ou formato estranho) os campos ficam como estão — A/C da lista e o resto vazio — sem mensagem de erro e sem travar o 'Criar rascunho'", async () => {
  const { r } = await montarComPrefill();
  const anterior = resposta;
  resposta = (c) => (c.url.endsWith("/prefill") ? { status: 500, corpo: { error: "x" } } : anterior(c));
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await esperar(20);
  assert.deepEqual(tres(r), ["Ana Principal", "", ""]);
  assert.doesNotMatch(textoDe(r), /Não foi possível carregar os dados do cadastro/);
  assert.equal(botaoPorTexto(r, "Criar rascunho")?.props.disabled, false);
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  resposta = (c) => (c.url.endsWith("/prefill") ? { status: 200, corpo: { data: [1, 2] } } : anterior(c));
  await escolherEmpresa(r, "ZZTEST Empresa C");
  await esperar(20);
  assert.deepEqual([valorCnpj(r), valorEndereco(r)], ["", ""], "formato fora do esperado é ignorado");
  const antes = (globalThis as any).fetch;
  (globalThis as any).fetch = async (u: string, i?: RequestInit) => { if (String(u).endsWith("/prefill")) throw new Error("rede"); return antes(u, i); };
  await clicar(botaoPorTexto(r, "Trocar empresa"));
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await esperar(20);
  (globalThis as any).fetch = antes;
  assert.equal(valorAC(r), "Ana Principal");
});
await caso("pré-preenchimento (gestor, MOT): o A/C da empresa de teste chega também ao formulário MOT; o MOT não tem CNPJ nem endereço", async () => {
  const empresaTeste = { id: "e-a", nome: "ZZTEST Empresa A", contatos: EMP_A.contatos, teste: true };
  const { r } = await montarComPrefill(true, [empresaTeste]);
  await escolherEmpresa(r, "ZZTEST Empresa A");
  await esperar(20);
  await clicar(botaoModelo(r, "MOT"));
  assert.ok(r.root.findAll((n) => n.type === "input" && n.props.value === "Ana Principal").length >= 1, "A/C no formulário MOT");
  assert.doesNotMatch(textoDe(r), /CNPJ do cliente|Endereço do cliente/);
});

console.log(`\n${total} casos OK (incl. Nova proposta)${process.exitCode ? " (com FALHAS acima)" : ""}`);
