// Smoke da tela Férias (aba do RH): lista, semáforo, resumo clicável, filtros, janelas (programar, em gozo / gozada, reabrir, ajustar data-base, saldo inicial com o
// 409 do período mais próximo), desabilitação por saldo pendente e exportação CSV. Sem navegador: react-test-renderer. As rotas reais são cobertas em verificar-ferias-rotas.mts.
// react-test-renderer NÃO é dependência do projeto: instalar só para rodar (npm i react-test-renderer@19.2.6 --no-save --legacy-peer-deps).
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/smoke-ferias-ui.mts
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import FeriasPageClient from "@/components/FeriasPageClient";
import { acoesDaLinha, contarFaixas, filtrarLinhasFerias, linhaNaFaixa, seloDoPrazo, validarGozo, validarProgramacao, type LinhaFerias } from "@/lib/feriasLinhas";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const HOJE = "2026-10-07";

// ── dados ───────────────────────────────────────────────────────────────────
type Parcial = Partial<LinhaFerias>;
const periodo = (numero: number, ini: string, fim: string, lim: string, extra: Partial<NonNullable<LinhaFerias["periodo"]>> = {}) => ({
  id: `per-${numero}-${ini}`, numero, aquisitivo_inicio: ini, aquisitivo_fim: fim, data_limite: lim, situacao: "a_programar" as const, gozo_inicio: null, gozo_fim: null,
  observacao: null, origem: "gerado" as const, ...extra,
});
function linha(id: string, nome: string, over: Parcial = {}): LinhaFerias {
  return {
    funcionario_id: id, nome_completo: nome, cliente_id: "cli-1", cliente_nome: "ZZTEST Cliente Um", unidade_id: "U1", unidade_nome: "Unidade Um", tipo_servico: "terceirizacao",
    efetivado_em: null, data_admissao: "2024-08-16", data_base: "2024-08-16", data_base_ajustada: false, estado: "ok", estado_rotulo: "", semaforo: "verde", dias_restantes: 312,
    saldo_confirmado: true, saldo_calculado: false, programacao_vencida: false, periodo: periodo(2, "2025-08-16", "2026-08-15", "2027-08-15"), reabrivel: null, ...over,
  };
}
const A = linha("f-a", "Ana Vencida", { semaforo: "vermelho", dias_restantes: -53, periodo: periodo(1, "2024-08-16", "2025-08-15", "2026-08-15") });
const B = linha("f-b", "Bruno Urgente", { semaforo: "vermelho", dias_restantes: 12, data_base: "2024-10-20", data_admissao: "2024-10-20", periodo: periodo(1, "2024-10-20", "2025-10-19", "2026-10-19") });
const PROG = periodo(1, "2024-12-01", "2025-11-30", "2026-11-30", { situacao: "programada", gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29", observacao: "Combinado com a RCA" });
const C = linha("f-c", "Carla Programada", {
  tipo_servico: "mao_obra_temporaria", efetivado_em: "2026-06-01", cliente_id: "cli-2", cliente_nome: "ZZTEST Cliente Dois", semaforo: "amarelo", dias_restantes: 54, data_base: "2024-12-01", data_admissao: "2024-12-01",
  periodo: PROG, reabrivel: { id: PROG.id, numero: 1, situacao: "programada", gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" },
});
const D = linha("f-d", "Davi Verde", { data_base: "2025-01-10", data_base_ajustada: true, data_admissao: "2024-08-16" });
const E = linha("f-e", "Érica Pendente", { estado: "saldo_pendente", estado_rotulo: "Saldo inicial pendente", semaforo: "cinza", dias_restantes: null, saldo_confirmado: false });
const F = linha("f-f", "Fábio Sem Data", { estado: "sem_data_base", estado_rotulo: "Informar data-base", semaforo: "cinza", dias_restantes: null, data_admissao: null, data_base: null, periodo: null, saldo_confirmado: false });
const G = linha("f-g", "Gina Futura", { estado: "ainda_nao_iniciou", estado_rotulo: "Ainda não iniciou", semaforo: "cinza", dias_restantes: null, data_base: "2026-10-09", data_admissao: "2026-10-09", periodo: null, saldo_confirmado: false });
const TODAS = [A, B, C, D, E, F, G];
const CLIENTES = [{ id: "cli-1", nome: "ZZTEST Cliente Um" }, { id: "cli-2", nome: "ZZTEST Cliente Dois" }];

// ── fetch simulado ──────────────────────────────────────────────────────────
interface Chamada { url: string; metodo: string; corpo: any }
let chamadas: Chamada[] = [];
let resposta: (c: Chamada) => { status: number; corpo?: unknown; texto?: string; cabecalhos?: Record<string, string> } = () => ({ status: 404, corpo: { error: "sem rota" } });
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const c = { url: String(url), metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : undefined };
  chamadas.push(c);
  const r = resposta(c);
  if (r === ("rede" as any)) throw new Error("offline");
  return new Response(r.texto ?? JSON.stringify(r.corpo ?? {}), { status: r.status, headers: { "Content-Type": r.texto !== undefined ? "text/csv" : "application/json", ...(r.cabecalhos ?? {}) } });
};
const listaDoServidor = (linhas: LinhaFerias[]) => ({ status: 200, corpo: { data: linhas, clientes: CLIENTES, unidades: [], resumo: {} } });

// Download simulado (a tela cria um <a download> e clica).
const baixados: { nome: string; href: string }[] = [];
(globalThis as any).document = {
  createElement: () => { const a: any = { click() { baixados.push({ nome: a.download, href: a.href }); }, remove() {} }; return a; },
  body: { appendChild() {} },
};

// ── utilidades de árvore ────────────────────────────────────────────────────
const txt = (n: TestRenderer.ReactTestInstance): string => n.children.map((c) => (typeof c === "string" ? c : txt(c))).join("");
const textoDe = (r: TestRenderer.ReactTestRenderer) => {
  const partes: string[] = [];
  const visita = (n: any) => { if (n == null) return; if (typeof n === "string") { partes.push(n); return; } (n.children ?? []).forEach(visita); };
  visita(r.toJSON());
  return partes.join(" ").replace(/\s+/g, " ");
};
const botoes = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "button");
const botao = (r: TestRenderer.ReactTestRenderer, trecho: string) => botoes(r).find((b) => txt(b).includes(trecho));
const botoesDe = (r: TestRenderer.ReactTestRenderer, trecho: string) => botoes(r).filter((b) => txt(b).includes(trecho));
const linhaDe = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.type === "tr" && n.props["data-funcionario"] === id)[0];
const nomesNaTela = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === "tr" && n.props["data-funcionario"]).map((tr) => String(tr.props["data-funcionario"]));
const clicar = async (b: TestRenderer.ReactTestInstance | undefined) => { assert.ok(b, "elemento existe"); await act(async () => { await b!.props.onClick({ stopPropagation() {} }); }); };
const campo = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.find((n) => ["input", "textarea", "select"].includes(n.type as string) && n.props.id === id);
const digitar = async (r: TestRenderer.ReactTestRenderer, id: string, valor: string) => { await act(async () => { campo(r, id).props.onChange({ target: { value: valor } }); }); };
const marcar = async (el: TestRenderer.ReactTestInstance, marcado: boolean) => { await act(async () => { el.props.onChange({ target: { checked: marcado } }); }); };
const janela = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props.role === "dialog")[0];
const alertas = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props.role === "alert").map(txt);

async function montar(linhas: LinhaFerias[] = TODAS, extra: Record<string, unknown> = {}) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(FeriasPageClient, { linhasIniciais: linhas, clientes: CLIENTES, hojeISO: HOJE, ...extra })); });
  return r;
}
const checkbox = (escopo: TestRenderer.ReactTestInstance) => escopo.findAll((n) => n.type === "input" && n.props.type === "checkbox");

// ═════════════════════════ LISTA ═════════════════════════
await caso("lista: uma linha por funcionário, na ordem recebida (urgência vem da API), com cliente, modalidade e datas em dd/mm/aaaa", async () => {
  const r = await montar();
  assert.deepEqual(nomesNaTela(r), TODAS.map((l) => l.funcionario_id));
  const t = textoDe(r);
  // O nome é um link para a ficha do funcionário (o harness troca o Link por um stub sem filhos: confere as props).
  const links = r.root.findAll((n) => typeof n.props.href === "string" && n.props.href.startsWith("/painel/funcionarios/"));
  assert.deepEqual(links.map((n) => [n.props.href, n.props.children]), TODAS.map((l) => [`/painel/funcionarios/${l.funcionario_id}`, l.nome_completo]));
  for (const trecho of ["ZZTEST Cliente Um", "ZZTEST Cliente Dois", "Terceirização", "MOT efetivado", "efetivado em 01/06/2026", "16/08/2024 a 15/08/2025", "15/08/2026"]) {
    assert.ok(t.includes(trecho), `falta "${trecho}"`);
  }
  // Nenhuma data ISO (aaaa-mm-dd) aparece como texto na tela (os campos de data dos formulários mostram o valor do input, não texto).
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(t), false, `data ISO na tela: ${t.match(/\d{4}-\d{2}-\d{2}/)?.[0]}`);
  const cabecalhos = r.root.findAll((n) => n.type === "th").map(txt);
  assert.deepEqual(cabecalhos, ["Funcionário", "Empresa", "Data-base", "Período aquisitivo atual", "Data-limite", "Dias restantes", "Prazo", "Situação", "Férias programadas", "Ações"]);
});

await caso("semáforo: Vencido, Urgente, Atenção, No prazo; cinza com o motivo escrito (saldo pendente, ainda não iniciou, informar data-base)", async () => {
  const r = await montar();
  const celulaPrazo = (id: string) => txt(linhaDe(r, id).findAll((n) => n.type === "td")[6]);
  assert.equal(celulaPrazo("f-a"), "Vencido");
  assert.equal(celulaPrazo("f-b"), "Urgente");
  assert.equal(celulaPrazo("f-c"), "Atenção");
  assert.equal(celulaPrazo("f-d"), "No prazo");
  assert.equal(celulaPrazo("f-e"), "Saldo inicial pendente");
  assert.equal(celulaPrazo("f-g"), "Ainda não iniciou");
  assert.equal(celulaPrazo("f-f"), "Informar data-base");
  const cor = (id: string) => linhaDe(r, id).findAll((n) => n.type === "td")[6].findAll((n) => n.type === "span")[0].props.style.background;
  assert.deepEqual([cor("f-a"), cor("f-c"), cor("f-d"), cor("f-e")], ["#FEE2E2", "#FEF3C7", "#D1FAE5", "#F3F4F6"]);
  const dias = (id: string) => txt(linhaDe(r, id).findAll((n) => n.type === "td")[5]);
  assert.deepEqual([dias("f-a"), dias("f-b"), dias("f-d"), dias("f-e")], ["Vencido há 53 dia(s)", "12 dia(s)", "312 dia(s)", "—"]);
});

await caso("data-base ajustada aparece com selo 'ajustada'; programada mostra as datas e a observação; 'data de início já passou' sinaliza", async () => {
  const atrasada = { ...C, programacao_vencida: true };
  const r = await montar([D, atrasada]);
  assert.ok(txt(linhaDe(r, "f-d")).includes("10/01/2025ajustada"));
  assert.equal(txt(linhaDe(r, "f-c")).includes("ajustada"), false);
  const c = txt(linhaDe(r, "f-c"));
  assert.ok(c.includes("Programada com a contabilidade") && c.includes("10/11/2026 a 29/11/2026") && c.includes("Combinado com a RCA") && c.includes("Data de início já passou"));
});

await caso("resumo do topo: Vencidos, Até 30 dias, De 31 a 90 dias, Saldo inicial pendente — contagens certas e clicáveis (aplica e remove o filtro)", async () => {
  const r = await montar();
  const card = (rotulo: string) => botao(r, rotulo)!;
  const numero = (rotulo: string) => txt(card(rotulo)).replace(rotulo, "");
  assert.deepEqual(["Vencidos", "Até 30 dias", "De 31 a 90 dias", "Saldo inicial pendente"].map(numero), ["1", "1", "1", "1"]);
  await clicar(card("Vencidos"));
  assert.deepEqual(nomesNaTela(r), ["f-a"]);
  assert.equal(card("Vencidos").props["aria-pressed"], true);
  await clicar(card("Até 30 dias"));
  assert.deepEqual(nomesNaTela(r), ["f-b"], "trocar de faixa substitui o filtro");
  await clicar(card("Saldo inicial pendente"));
  assert.deepEqual(nomesNaTela(r), ["f-e"]);
  await clicar(card("Saldo inicial pendente"));
  assert.equal(nomesNaTela(r).length, 7, "clicar de novo remove o filtro");
  assert.equal(numero("Vencidos"), "1", "as contagens seguem sobre a lista cheia");
});

await caso("filtros: busca sem acento, empresa, situação e prazo se combinam (E); 'Limpar filtros' volta tudo", async () => {
  const r = await montar();
  assert.equal(botao(r, "Limpar filtros"), undefined, "sem filtro não há botão de limpar");
  const busca = r.root.find((n) => n.type === "input" && n.props["aria-label"] === "Buscar por nome");
  await act(async () => { busca.props.onChange({ target: { value: "erica" } }); });
  assert.deepEqual(nomesNaTela(r), ["f-e"], "acha 'Érica' digitando 'erica'");
  await act(async () => { busca.props.onChange({ target: { value: "" } }); });
  const sel = (rotulo: string) => r.root.find((n) => n.type === "select" && n.props["aria-label"] === rotulo);
  await act(async () => { sel("Empresa").props.onChange({ target: { value: "cli-2" } }); });
  assert.deepEqual(nomesNaTela(r), ["f-c"]);
  await act(async () => { sel("Empresa").props.onChange({ target: { value: "" } }); sel("Situação").props.onChange({ target: { value: "programada" } }); });
  assert.deepEqual(nomesNaTela(r), ["f-c"]);
  await act(async () => { sel("Situação").props.onChange({ target: { value: "a_programar" } }); sel("Semáforo").props.onChange({ target: { value: "vermelho" } }); });
  assert.deepEqual(nomesNaTela(r), ["f-a", "f-b"]);
  await act(async () => { sel("Semáforo").props.onChange({ target: { value: "cinza" } }); });
  assert.deepEqual(nomesNaTela(r), ["f-e"], "cinza + a programar: só a Érica (saldo pendente tem período a programar)");
  await act(async () => { sel("Situação").props.onChange({ target: { value: "gozada" } }); });
  assert.deepEqual(nomesNaTela(r), [], "ninguém gozada");
  assert.ok(textoDe(r).includes("Nenhum funcionário encontrado com esses filtros."));
  await clicar(botao(r, "Limpar filtros"));
  assert.equal(nomesNaTela(r).length, 7);
});

await caso("estado vazio amigável (sem ninguém no controle) e mensagem clara quando as tabelas não existem (nada de tela quebrada)", async () => {
  const vazia = await montar([]);
  assert.ok(textoDe(vazia).includes("Nenhum funcionário no controle de férias. Entram os funcionários de Terceirização ativos"));
  assert.equal(vazia.root.findAll((n) => n.type === "table").length, 0);
  const sem = await montar([], { erroCarga: "O controle de férias ainda não está disponível neste ambiente. Tente novamente em instantes." });
  assert.deepEqual(alertas(sem), ["O controle de férias ainda não está disponível neste ambiente. Tente novamente em instantes."]);
  assert.equal(sem.root.findAll((n) => n.type === "table").length, 0, "sem tabela");
  assert.equal(botao(sem, "Exportar CSV")!.props.disabled, true, "exportar fica desabilitado");
});

// ═════════════════════════ AÇÕES POR LINHA ═════════════════════════
await caso("saldo pendente (cinza): Programar, Em gozo e Gozada desabilitados com o motivo ESCRITO; 'Informar saldo inicial' em destaque e habilitado", async () => {
  const r = await montar([E]);
  const tr = linhaDe(r, "f-e");
  const bs = tr.findAll((n) => n.type === "button");
  const por = (t: string) => bs.find((b) => txt(b) === t)!;
  for (const t of ["Programar", "Em gozo", "Gozada"]) {
    assert.equal(por(t).props.disabled, true, t);
    assert.match(por(t).props.title, /Informe o saldo inicial primeiro/);
  }
  assert.ok(txt(tr).includes("Informe o saldo inicial primeiro (fim do último período já quitado, ou \"nenhum\")."), "motivo visível na linha");
  const saldo = por("Informar saldo inicial");
  assert.equal(saldo.props.disabled, false);
  assert.equal(saldo.props.style.background, "#FFD700", "em destaque");
  await clicar(saldo);
  assert.ok(janela(r) && janela(r).props["aria-label"] === "Informar saldo inicial");
});

await caso("sem data-base: 'Ajustar data-base' em destaque; ações de férias e saldo bloqueadas com motivo; reabrir só aparece quando há o que reabrir", async () => {
  const r = await montar([F, C]);
  const tr = linhaDe(r, "f-f");
  const bs = tr.findAll((n) => n.type === "button");
  assert.equal(bs.find((b) => txt(b) === "Ajustar data-base")!.props.style.background, "#FFD700");
  assert.equal(bs.find((b) => txt(b) === "Programar")!.props.disabled, true);
  assert.ok(txt(tr).includes("Informe a data-base deste funcionário primeiro."));
  assert.equal(bs.find((b) => txt(b) === "Reabrir"), undefined, "nada para reabrir");
  assert.ok(linhaDe(r, "f-c").findAll((n) => n.type === "button").some((b) => txt(b) === "Reabrir"), "programada tem Reabrir");
});

await caso("regras de ação (puras): em gozo só quando começa, gozada só quando termina, período em gozo não programa; ainda não iniciou bloqueia tudo", () => {
  const futura = linha("x", "X", { periodo: periodo(2, "2025-08-16", "2026-08-15", "2027-08-15", { situacao: "programada", gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" }) });
  const a = acoesDaLinha(futura, HOJE);
  assert.deepEqual([a.programar.habilitada, a.emGozo.habilitada, a.gozada.habilitada], [true, false, false]);
  assert.match(a.emGozo.motivo, /começam em 10\/11\/2026/);
  const corrente = linha("x", "X", { periodo: periodo(2, "2025-08-16", "2026-08-15", "2027-08-15", { situacao: "programada", gozo_inicio: "2026-10-01", gozo_fim: "2026-10-20" }) });
  const b = acoesDaLinha(corrente, HOJE);
  assert.deepEqual([b.emGozo.habilitada, b.gozada.habilitada], [true, false]);
  assert.match(b.gozada.motivo, /terminam em 20\/10\/2026/);
  const emGozo = linha("x", "X", { periodo: periodo(2, "2025-08-16", "2026-08-15", "2027-08-15", { situacao: "em_gozo", gozo_inicio: "2026-10-01", gozo_fim: "2026-10-05" }) });
  const c = acoesDaLinha(emGozo, HOJE);
  assert.deepEqual([c.programar.habilitada, c.emGozo.habilitada, c.gozada.habilitada], [false, false, true]);
  const nao = acoesDaLinha(G, HOJE);
  assert.deepEqual([nao.programar.habilitada, nao.informarSaldo.habilitada, nao.ajustarDataBase.habilitada, nao.saldoEmDestaque, nao.dataBaseEmDestaque], [false, false, true, false, false]);
  const ok = acoesDaLinha(D, HOJE);
  assert.deepEqual([ok.programar.habilitada, ok.emGozo.habilitada, ok.gozada.habilitada, ok.reabrir.habilitada], [true, true, true, false]);
  const alterada = acoesDaLinha(linha("x", "X", { estado: "base_alterada", estado_rotulo: "Data-base mudou: reconfirmar", semaforo: "cinza" }), HOJE);
  assert.deepEqual([alterada.dataBaseEmDestaque, alterada.programar.habilitada, alterada.informarSaldo.habilitada], [true, false, false]);
});

// ═════════════════════════ JANELAS ═════════════════════════
await caso("programar: datas limitadas (início de hoje em diante, depois do fim do aquisitivo, até a data-limite); erro e aviso em português; envia o POST certo", async () => {
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : listaDoServidor([{ ...D, periodo: periodo(2, "2025-08-16", "2026-08-15", "2027-08-15", { situacao: "programada", gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" }) }]));
  const r = await montar([D]);
  await clicar(botao(r, "Programar"));
  assert.ok(janela(r));
  const ini = campo(r, "ferias-inicio");
  assert.deepEqual([ini.props.min, ini.props.max], ["2026-10-07", "2027-08-15"], "mínimo = hoje (o aquisitivo já terminou) e máximo = data-limite");
  const confirmar = () => botoesDe(r, "Programar").find((b) => b.props.className === "btn-primary")!;
  assert.equal(confirmar().props.disabled, true, "sem datas o botão fica desabilitado");
  await digitar(r, "ferias-inicio", "2027-08-16");
  await digitar(r, "ferias-fim", "2027-08-30");
  assert.ok(alertas(r)[0].includes("A data inicial passa da data-limite (15/08/2027)"), alertas(r).join("|"));
  assert.equal(confirmar().props.disabled, true);
  await digitar(r, "ferias-inicio", "2026-10-06");
  assert.ok(alertas(r)[0].includes("não pode ser anterior a hoje"));
  await digitar(r, "ferias-inicio", "2027-08-10");
  await digitar(r, "ferias-fim", "2027-08-20");
  assert.equal(alertas(r)[0], "O fim das férias não pode passar da data-limite (15/08/2027), senão há pagamento em dobro.", "o fim depois da data-limite também bloqueia");
  assert.equal(confirmar().props.disabled, true);
  assert.equal(campo(r, "ferias-fim").props.max, "2027-08-15", "o campo do fim não passa da data-limite");
  await digitar(r, "ferias-fim", "2027-08-15");
  assert.equal(alertas(r).length, 0, "fim exatamente na data-limite vale");
  assert.equal(confirmar().props.disabled, false);
  await digitar(r, "ferias-inicio", "2026-11-10");
  await digitar(r, "ferias-fim", "2026-11-29");
  await digitar(r, "ferias-obs", "  combinado  ");
  await clicar(confirmar());
  const post = chamadas.find((c) => c.metodo === "POST")!;
  assert.equal(post.url, "/api/ferias/f-d/programar");
  assert.deepEqual(post.corpo, { periodo_id: D.periodo!.id, gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29", observacao: "combinado" });
  assert.equal(janela(r), undefined, "janela fechou");
  assert.ok(textoDe(r).includes("Férias programadas."));
  assert.ok(chamadas.some((c) => c.metodo === "GET" && c.url === "/api/ferias"), "recarregou a lista");
  assert.ok(txt(linhaDe(r, "f-d")).includes("10/11/2026 a 29/11/2026"), "a linha já mostra as datas novas");
});

await caso("programar: erro da API aparece na janela (em português), sem fechar; falha de rede também; botão volta a habilitar", async () => {
  for (const resp of [{ status: 409, corpo: { error: "A situação deste período mudou. Atualize a tela e tente de novo." } }, "rede" as any]) {
    chamadas = [];
    resposta = () => resp;
    const r = await montar([D]);
    await clicar(botao(r, "Programar"));
    await digitar(r, "ferias-inicio", "2026-11-10");
    await digitar(r, "ferias-fim", "2026-11-29");
    const confirmar = botoesDe(r, "Programar").find((b) => b.props.className === "btn-primary")!;
    await clicar(confirmar);
    assert.ok(janela(r), "continua aberta");
    assert.equal(alertas(r).length, 1);
    assert.ok(/mudou\. Atualize|Falha de conexão/.test(alertas(r)[0]), alertas(r)[0]);
    assert.equal(botoesDe(r, "Programar").find((b) => b.props.className === "btn-primary")!.props.disabled, false);
  }
});

await caso("em gozo e gozada: janela de confirmação com as datas já programadas; valida início/fim contra hoje; envia a ação certa; gozada avisa que passa ao próximo", async () => {
  const programadaAgora = linha("f-h", "Hugo Programado", { periodo: periodo(2, "2025-08-16", "2026-08-15", "2027-08-15", { situacao: "programada", gozo_inicio: "2026-10-01", gozo_fim: "2026-10-05" }) });
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : listaDoServidor([programadaAgora]));
  let r = await montar([programadaAgora]);
  await clicar(botao(r, "Em gozo"));
  assert.equal(campo(r, "gozo-inicio").props.value, "2026-10-01");
  assert.equal(campo(r, "gozo-fim").props.value, "2026-10-05");
  await clicar(botao(r, "Confirmar em gozo"));
  assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, { periodo_id: programadaAgora.periodo!.id, acao: "em_gozo", gozo_inicio: "2026-10-01", gozo_fim: "2026-10-05" });
  assert.ok(textoDe(r).includes("Férias marcadas como em gozo."));

  chamadas = [];
  r = await montar([programadaAgora]);
  await clicar(botao(r, "Gozada"));
  assert.ok(txt(janela(r)).includes("o funcionário passa ao próximo"));
  await digitar(r, "gozo-fim", "2026-10-20");
  assert.ok(alertas(r)[0].includes("As férias ainda não terminaram"));
  assert.equal(botao(r, "Confirmar gozada")!.props.disabled, true);
  await digitar(r, "gozo-fim", "2026-10-05");
  await clicar(botao(r, "Confirmar gozada"));
  assert.equal(chamadas.find((c) => c.metodo === "POST")!.corpo.acao, "gozada");
  assert.ok(textoDe(r).includes("passou ao próximo período"));
});

await caso("em gozo / gozada a partir de 'a programar': sem datas prévias a janela as pede e só habilita com datas válidas", async () => {
  const r = await montar([A]);
  await clicar(botao(r, "Gozada"));
  assert.equal(campo(r, "gozo-inicio").props.value, "");
  assert.equal(botao(r, "Confirmar gozada")!.props.disabled, true);
  await digitar(r, "gozo-inicio", "2025-09-01");
  await digitar(r, "gozo-fim", "2025-09-20");
  assert.equal(botao(r, "Confirmar gozada")!.props.disabled, false);
  await digitar(r, "gozo-inicio", "2025-08-10");
  assert.ok(alertas(r)[0].includes("depois do fim do período aquisitivo (15/08/2025)"));
});

await caso("reabrir: motivo obrigatório (mínimo 3 caracteres); usa o período reabrível (pode ser o anterior); envia acao=reabrir", async () => {
  const anteriorGozada = linha("f-i", "Iara Gozou", { reabrivel: { id: "per-anterior", numero: 1, situacao: "gozada", gozo_inicio: "2025-09-01", gozo_fim: "2025-09-20" } });
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : listaDoServidor([linha("f-i", "Iara Gozou")]));
  const r = await montar([anteriorGozada]);
  await clicar(botao(r, "Reabrir"));
  assert.ok(txt(janela(r)).includes("O período 1 está Gozada (01/09/2025 a 20/09/2025)"));
  assert.equal(botao(r, "Reabrir período")!.props.disabled, true);
  await digitar(r, "reabrir-motivo", "ab");
  assert.equal(botao(r, "Reabrir período")!.props.disabled, true);
  await digitar(r, "reabrir-motivo", "  Lançada errada  ");
  assert.equal(botao(r, "Reabrir período")!.props.disabled, false);
  await clicar(botao(r, "Reabrir período"));
  assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, { periodo_id: "per-anterior", acao: "reabrir", motivo: "Lançada errada" });
  assert.equal(janela(r), undefined);
  assert.ok(textoDe(r).includes("Período reaberto"));
});

await caso("ajustar data-base: aviso claro de que apaga períodos e zera o saldo; só envia com a confirmação marcada (confirmar_reinicio); motivo obrigatório", async () => {
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : listaDoServidor([D]));
  const r = await montar([D]);
  await clicar(botao(r, "Ajustar data-base"));
  const j = janela(r);
  assert.ok(txt(j).includes("isto apaga os períodos e zera o saldo inicial"));
  const btnOk = () => botoes(r).filter((b) => b.props.className === "btn-primary")[0];
  assert.equal(btnOk().props.disabled, true);
  await digitar(r, "data-base-nova", "2025-03-03");
  await digitar(r, "data-base-motivo", "Intervalo entre contratos");
  assert.equal(btnOk().props.disabled, true, "sem marcar a confirmação não envia");
  const caixas = checkbox(j);
  const entendi = caixas[caixas.length - 1];
  await marcar(entendi, true);
  assert.equal(btnOk().props.disabled, false);
  await clicar(btnOk());
  assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, { data_base: "2025-03-03", motivo: "Intervalo entre contratos", confirmar_reinicio: true });
  assert.ok(textoDe(r).includes("Data-base ajustada"));
});

await caso("ajustar data-base: 'voltar a usar a data de admissão' envia data nula; erro 409 da rota (férias já lançadas) aparece em português; sem data nem período não pede confirmação", async () => {
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? { status: 409, corpo: { error: "Já há férias programadas, em gozo ou gozadas deste funcionário. Reabra-as antes de ajustar a data-base." } } : listaDoServidor([D]));
  let r = await montar([D]);
  await clicar(botao(r, "Ajustar data-base"));
  const j = janela(r);
  const [voltar, entendi] = checkbox(j);
  await marcar(voltar, true);
  assert.equal(campo(r, "data-base-nova").props.disabled, true);
  await digitar(r, "data-base-motivo", "Admissão estava certa");
  await marcar(entendi, true);
  await clicar(botoes(r).filter((b) => b.props.className === "btn-primary")[0]);
  assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, { data_base: null, motivo: "Admissão estava certa", confirmar_reinicio: true });
  assert.ok(alertas(r)[0].includes("Já há férias programadas, em gozo ou gozadas"));
  assert.ok(janela(r), "continua aberta");

  // Primeiro cadastro da data-base (nada para apagar): sem aviso vermelho e sem checkbox de confirmação.
  chamadas = [];
  resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : listaDoServidor([F]));
  r = await montar([F]);
  await clicar(botao(r, "Ajustar data-base"));
  assert.equal(txt(janela(r)).includes("isto apaga"), false);
  assert.equal(checkbox(janela(r)).length, 0, "sem admissão e sem período: nenhuma caixa");
  await digitar(r, "data-base-nova", "2025-06-02");
  await digitar(r, "data-base-motivo", "Data conferida com a contabilidade");
  await clicar(botoes(r).filter((b) => b.props.className === "btn-primary")[0]);
  assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, { data_base: "2025-06-02", motivo: "Data conferida com a contabilidade" });
});

await caso("saldo inicial: 'nenhum' e data exata enviam o corpo certo", async () => {
  for (const [modo, esperado] of [["nenhum", { quitado_ate: null }], ["quitado", { quitado_ate: "2025-08-15" }]] as const) {
    chamadas = [];
    resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : listaDoServidor([E]));
    const r = await montar([E]);
    await clicar(botao(r, "Informar saldo inicial"));
    const radios = r.root.findAll((n) => n.type === "input" && n.props.type === "radio");
    await act(async () => { radios[modo === "nenhum" ? 0 : 1].props.onChange(); });
    const ok = botoes(r).find((b) => b.props.className === "btn-primary")!;
    if (modo === "quitado") {
      assert.equal(ok.props.disabled, true, "sem data não envia");
      await digitar(r, "saldo-fim", "2025-08-15");
    }
    await clicar(botoes(r).find((b) => b.props.className === "btn-primary"));
    assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, esperado, modo);
    assert.ok(textoDe(r).includes("Saldo inicial informado."));
  }
});

await caso("saldo inicial, 409 com o período mais próximo: mostra a sugestão, pede confirmação e reenvia com fim_confirmado; 'Voltar' corrige a data", async () => {
  const msg = "10/09/2025 não é o fim de nenhum período aquisitivo. O período mais próximo termina em 15/08/2025 (período 1). Confirme para usar essa data.";
  chamadas = [];
  resposta = (c) => {
    if (c.metodo === "GET") return listaDoServidor([E]);
    return c.corpo.fim_confirmado === "2025-08-15"
      ? { status: 200, corpo: { data: {} } }
      : { status: 409, corpo: { error: msg, code: "confirmar_periodo", sugestao: { numero: 1, aquisitivo_fim: "2025-08-15" }, informado: "2025-09-10" } };
  };
  const r = await montar([E]);
  await clicar(botao(r, "Informar saldo inicial"));
  await digitar(r, "saldo-fim", "2025-09-10");
  await clicar(botoes(r).find((b) => b.props.className === "btn-primary"));
  assert.equal(alertas(r)[0], msg, "mostra a sugestão da rota");
  assert.ok(botao(r, "Usar 15/08/2025 (período 1)"));
  assert.equal(r.root.findAll((n) => n.type === "input" && n.props.id === "saldo-fim").length, 0, "o formulário some enquanto pede a confirmação");
  // Voltar: o formulário volta com a data digitada.
  await clicar(botao(r, "Voltar e corrigir a data"));
  assert.equal(alertas(r).length, 0);
  assert.equal(campo(r, "saldo-fim").props.value, "2025-09-10");
  await clicar(botoes(r).find((b) => b.props.className === "btn-primary"));
  // Confirmar: reenvia com a data informada E a data do período sugerido.
  await clicar(botao(r, "Usar 15/08/2025 (período 1)"));
  const posts = chamadas.filter((c) => c.metodo === "POST");
  assert.deepEqual(posts[0].corpo, { quitado_ate: "2025-09-10" });
  assert.deepEqual(posts.at(-1)!.corpo, { quitado_ate: "2025-09-10", fim_confirmado: "2025-08-15" });
  assert.equal(janela(r), undefined, "fechou");
  assert.ok(textoDe(r).includes("Saldo inicial informado."));
});

await caso("saldo inicial: outro erro da rota (data futura) aparece em português dentro da janela", async () => {
  resposta = () => ({ status: 400, corpo: { error: "A data do último período quitado não pode ser futura." } });
  const r = await montar([E]);
  await clicar(botao(r, "Informar saldo inicial"));
  await digitar(r, "saldo-fim", "2026-10-07");
  await clicar(botoes(r).find((b) => b.props.className === "btn-primary"));
  assert.deepEqual(alertas(r), ["A data do último período quitado não pode ser futura."]);
});

// ═════════════════════════ EXPORTAR ═════════════════════════
await caso("exportar CSV: POST em /api/ferias/exportar com os MESMOS filtros da tela (inclusive a faixa do resumo); baixa o arquivo com o nome da rota", async () => {
  chamadas = [];
  baixados.length = 0;
  resposta = () => ({ status: 200, texto: "﻿Funcionário;Cliente\r\n", cabecalhos: { "Content-Disposition": 'attachment; filename="ferias-a-vencer-07-10-2026.csv"' } });
  const r = await montar();
  await clicar(botao(r, "Vencidos"));
  const busca = r.root.find((n) => n.type === "input" && n.props["aria-label"] === "Buscar por nome");
  await act(async () => { busca.props.onChange({ target: { value: " ana " } }); });
  await clicar(botao(r, "Exportar CSV"));
  const post = chamadas.find((c) => c.metodo === "POST")!;
  assert.equal(post.url, "/api/ferias/exportar");
  assert.deepEqual(post.corpo, { faixa: "vencidos", busca: "ana" });
  assert.equal(baixados.length, 1);
  assert.equal(baixados[0].nome, "ferias-a-vencer-07-10-2026.csv");
  assert.ok(textoDe(r).includes("Arquivo gerado."));
});

await caso("exportar CSV: erro da rota aparece na tela; desabilitado quando o filtro não deixa nenhuma linha", async () => {
  resposta = () => ({ status: 403, corpo: { error: "Acesso restrito à equipe de RH." } });
  const r = await montar();
  await clicar(botao(r, "Exportar CSV"));
  assert.deepEqual(alertas(r), ["Acesso restrito à equipe de RH."]);
  const busca = r.root.find((n) => n.type === "input" && n.props["aria-label"] === "Buscar por nome");
  await act(async () => { busca.props.onChange({ target: { value: "ninguém com esse nome" } }); });
  assert.equal(botao(r, "Exportar CSV")!.props.disabled, true);
});

await caso("depois de uma ação, se a recarga da lista falha, a tela avisa em português (não quebra e não perde a mensagem de sucesso da ação)", async () => {
  resposta = (c) => (c.metodo === "POST" ? { status: 200, corpo: { data: {} } } : { status: 503, corpo: { error: "O controle de férias ainda não está disponível neste ambiente. Tente novamente em instantes." } });
  const r = await montar([D]);
  await clicar(botao(r, "Programar"));
  await digitar(r, "ferias-inicio", "2026-11-10");
  await digitar(r, "ferias-fim", "2026-11-29");
  await clicar(botoesDe(r, "Programar").find((b) => b.props.className === "btn-primary"));
  assert.deepEqual(alertas(r), ["O controle de férias ainda não está disponível neste ambiente. Tente novamente em instantes."]);
  assert.equal(janela(r), undefined);
});

// ═════════════════════════ REGRAS PURAS DA TELA ═════════════════════════
await caso("faixas do resumo somam sem repetir: vencido, 0 a 30, 31 a 90 e pendente; cinza sem prazo não entra em nenhuma além da pendente", () => {
  assert.deepEqual(contarFaixas(TODAS), { vencidos: 1, ate30: 1, ate90: 1, pendente: 1 });
  const limites = (d: number) => linhaNaFaixa({ estado: "ok", dias_restantes: d }, "vencidos") ? "vencidos" : linhaNaFaixa({ estado: "ok", dias_restantes: d }, "ate30") ? "ate30" : linhaNaFaixa({ estado: "ok", dias_restantes: d }, "ate90") ? "ate90" : "nenhuma";
  assert.deepEqual([-1, 0, 30, 31, 90, 91].map(limites), ["vencidos", "ate30", "ate30", "ate90", "ate90", "nenhuma"]);
  assert.equal(filtrarLinhasFerias(TODAS, { faixa: "pendente" }).length, 1);
  assert.equal(filtrarLinhasFerias(TODAS, { faixa: "ate90", semaforo: "amarelo" }).length, 1);
  assert.equal(seloDoPrazo(A).rotulo, "Vencido");
});

await caso("validações dos modais espelham as rotas (programar: hoje, aquisitivo, data-limite; gozo: já começou / já terminou)", () => {
  const p = { aquisitivo_fim: "2026-08-15", data_limite: "2027-08-15" };
  assert.match(validarProgramacao(p, "2026-10-06", "2026-10-20", HOJE).erro!, /anterior a hoje/);
  assert.match(validarProgramacao({ aquisitivo_fim: "2026-11-30", data_limite: "2027-11-30" }, "2026-11-30", "2026-12-10", HOJE).erro!, /depois do fim do período aquisitivo \(30\/11\/2026\)/);
  assert.match(validarProgramacao(p, "2027-08-16", "2027-08-30", HOJE).erro!, /passa da data-limite \(15\/08\/2027\)/);
  assert.equal(validarProgramacao(p, "2027-08-10", "2027-08-15", HOJE).erro, null, "fim na própria data-limite vale");
  assert.equal(validarProgramacao(p, "2027-08-10", "2027-08-20", HOJE).erro, "O fim das férias não pode passar da data-limite (15/08/2027), senão há pagamento em dobro.");
  assert.equal(validarProgramacao(p, "2027-08-10", "2027-08-20", HOJE).aviso, null);
  assert.match(validarProgramacao(p, "2026-10-20", "2026-10-10", HOJE).erro!, /data final não pode ser anterior/);
  assert.match(validarGozo(p, "em_gozo", "2026-10-08", "2026-10-20", HOJE).erro!, /ainda não começaram/);
  assert.equal(validarGozo(p, "em_gozo", "2026-10-01", "2026-10-20", HOJE).erro, null, "em gozo pode terminar no futuro");
  assert.match(validarGozo(p, "gozada", "2026-10-01", "2026-10-20", HOJE).erro!, /ainda não terminaram/);
});

console.log(`\n${total} casos OK`);
process.exit(process.exitCode ?? 0);
