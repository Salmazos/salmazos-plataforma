// Gestão de Pessoas no portal do cliente.
//  - RH estável: o HTML do RH (para os mesmos dados) é igual ao congelado (fixtures/gestao-pessoas-rh.golden.json). Foi congelado ANTES do refactor `modo` (e provou RH idêntico
//    naquela etapa) e REGERADO na etapa interativa, em que o RH ganhou botões, a lista e a exportação; mudar o HTML do RH sem querer reprova;
//  - portal: o cliente_id vem SÓ da sessão (?cliente=B ignorado; sem vínculo, usuário do painel, cliente inativo e vínculo duplo saem para o login);
//  - payload ao navegador sem ids (funcionario/admissão/cliente) nem CPF/RG/PIS; só ativos; mesmos números do RH para o mesmo cliente;
//  - textos: "Dado não cadastrado" só quando há legado, nota, aviso por gráfico sem nenhum dado, nenhum texto interno do RH, gráficos para 1 a 4 ativos;
//  - provas de falha: as MESMAS provas reprovam páginas/carregadores sabotados (sem filtro de cliente, cliente vindo da URL, id no payload, sem filtro de status);
//  - varredura estática da página (sem searchParams/params) e menu.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-gestao-pessoas-portal.mts
//   (sem GP_PORTAL_FILHO o script roda a si mesmo sob TZ=UTC e TZ=America/Sao_Paulo; o relógio fica em 18/11/2026 22:30 em Brasília = 19/11 em UTC)
// Regerar o congelado do RH (só com o componente do RH sem mudança de saída): GERAR_GOLDEN=1 <mesmo comando>
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb, criarClienteServico } from "./harness-mot/memdb.mjs";
import GestaoPessoasClient from "../src/components/GestaoPessoasClient";
import { carregarGestaoPessoas, montarGestaoPessoas, paraPortal, type PessoaAtiva } from "../src/lib/gestaoPessoas";
import { CASOS_RH } from "./gestao-pessoas-fixtures.mts";

const GOLDEN = "scripts/fixtures/gestao-pessoas-rh.golden.json";
const AGORA = "2026-11-19T01:30:00Z"; // 18/11/2026 22:30 em Brasília
const HOJE = "2026-11-18";

if (!process.env.GP_PORTAL_FILHO && process.env.GERAR_GOLDEN !== "1") {
  for (const tz of ["UTC", "America/Sao_Paulo"]) {
    const saida = execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/verificar-gestao-pessoas-portal.mts"], {
      env: { ...process.env, TZ: tz, GP_PORTAL_FILHO: "1", HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8",
    });
    process.stdout.write(saida.split("\n").filter((l) => l.startsWith("OK") || l.startsWith("FALHA")).map((l) => `[${tz}] ${l}\n`).join(""));
    console.log(`[${tz}] ${saida.trim().split("\n").pop()}`);
  }
  process.exit(0);
}

congelarData(AGORA);
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");

const htmlRH = (props: (typeof CASOS_RH)[number][1], extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(GestaoPessoasClient, { ...props, ...extra } as never));

if (process.env.GERAR_GOLDEN === "1") {
  const out: Record<string, string> = {};
  for (const [nome, props] of CASOS_RH) out[nome] = htmlRH(props);
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + "\n");
  console.log(`congelado: ${Object.keys(out).length} casos em ${GOLDEN}`);
  process.exit(0);
}

// ── RH idêntico ──────────────────────────────────────────────────────────────
await ok("RH estável: o HTML renderizado dos 9 casos é igual ao congelado (sem a prop modo e com modo=\"rh\")", () => {
  const golden = JSON.parse(fonte(GOLDEN)) as Record<string, string>;
  assert.equal(Object.keys(golden).length, CASOS_RH.length);
  for (const [nome, props] of CASOS_RH) {
    assert.ok(golden[nome], `congelado existe: ${nome}`);
    assert.equal(htmlRH(props), golden[nome], `sem modo: ${nome}`);
    assert.equal(htmlRH(props, { modo: "rh" }), golden[nome], `modo=rh: ${nome}`);
  }
  assert.ok(golden[CASOS_RH[1][0]].includes("Agregado de poucas pessoas, uso interno do RH"), "o aviso do RH continua");
  assert.ok(golden[CASOS_RH[0][0]].includes("Corrija na admissão da pessoa"), "o aviso de inconsistente do RH continua");
  assert.ok(golden[CASOS_RH[0][0]].includes("Escolha uma empresa"), "o seletor do RH continua");
  assert.ok(golden[CASOS_RH[0][0]].includes(">Não informado<"), "o RH continua com 'Não informado'");
});

// ── Banco em memória ─────────────────────────────────────────────────────────
const id = (x: number) => `${String(x).padStart(8, "0")}-0000-4000-8000-${String(x).padStart(12, "0")}`;
const CLI_A = id(1), CLI_B = id(2), CLI_C = id(3), CLI_D = id(4);
const U_A = id(101), U_B = id(102), U_SEM_VINCULO = id(103), U_DOIS = id(104), U_INATIVO = id(105), U_D = id(106), U_INTERNO = id(107);
const usuario = (uid: string) => ({ id: uid, email: `${uid}@teste.local` });

type Func = { id: string; cliente_id: string; status: string; nome_completo: string; cargo: string | null; data_admissao: string | null; admissao_id: string | null; unidade_id: string | null };
const func = (n: number, cli: string, status: string, nome: string, cargo: string, adm: string | null, admissao: number | null): Func =>
  ({ id: id(1000 + n), cliente_id: cli, status, nome_completo: nome, cargo, data_admissao: adm, admissao_id: admissao === null ? null : id(2000 + admissao), unidade_id: null });
const dp = (n: number, sexo: string | null, nasc: string | null, grau: string | null) =>
  ({ admissao_id: id(2000 + n), sexo, data_nascimento: nasc, grau_instrucao: grau, cpf: `${900 + n}.111.222-33`, rg_numero: `RG${700 + n}`, pis_pasep: `PIS${600 + n}`, cor_raca: "parda", salario: 3000 });

const FUNCS_BASE: Func[] = [
  func(1, CLI_A, "ativo", "Ana Souza", "Auxiliar de Produção", "2026-05-01", 1),
  func(2, CLI_A, "ativo", "Bruno Lima", "Auxiliar de producao", "2026-11-03", 2),
  func(3, CLI_A, "ativo", "Carla Dias", "Motorista", "2025-01-15", 3),
  func(4, CLI_A, "ativo", "Diego Reis", "Motorista", "2024-07-22", 4),
  func(5, CLI_A, "ativo", "Elisa Prado", "Vigia", "2023-09-01", 5),
  func(6, CLI_A, "desligado", "Desligado Antigo", "Vigia", "2020-01-01", 6),
  func(11, CLI_B, "ativo", "Beto Alves", "Soldador", "2026-01-10", 11),
  func(12, CLI_B, "ativo", "Bia Costa", "Soldadora", "2026-02-10", 12),
  func(13, CLI_B, "ativo", "Caio Melo", "Soldador", "2026-03-10", 13),
  func(21, CLI_D, "desligado", "Só Desligado", "Vigia", "2020-01-01", 21),
];
const DPS_BASE = [
  dp(1, "F", "1990-11-20", "medio_completo"), dp(2, "M", "1985-03-10", "fundamental_completo"), dp(3, "F", "2000-02-29", "superior_completo"),
  dp(4, "M", "1976-12-05", "medio_incompleto"), dp(5, "F", "1999-06-30", "pos_graduacao"), dp(6, "M", "1970-01-01", "medio_completo"),
  dp(11, "M", "1980-05-05", "medio_completo"), dp(12, "F", "1992-08-08", "superior_incompleto"), dp(13, "M", "1988-09-09", "medio_completo"),
  dp(21, "M", "1970-01-01", "medio_completo"),
];

function novoDb(funcs: Func[] = FUNCS_BASE, dps: unknown[] = DPS_BASE) {
  const db = criarDb({
    clientes: [
      { id: CLI_A, nome: "Alfa Indústria", unidade_id: null, ativo: true }, { id: CLI_B, nome: "Beta Logística", unidade_id: null, ativo: true },
      { id: CLI_C, nome: "Gama Suspensa", unidade_id: null, ativo: false }, { id: CLI_D, nome: "Delta Serviços", unidade_id: null, ativo: true },
    ],
    cliente_usuarios: [
      { user_id: U_A, cliente_id: CLI_A }, { user_id: U_B, cliente_id: CLI_B }, { user_id: U_DOIS, cliente_id: CLI_A }, { user_id: U_DOIS, cliente_id: CLI_B },
      { user_id: U_INATIVO, cliente_id: CLI_C }, { user_id: U_D, cliente_id: CLI_D },
    ],
    funcionarios: funcs, admissao_dados_pessoais: dps,
  });
  (globalThis as unknown as { __DB__: unknown }).__DB__ = db;
  return db;
}

const pessoasDe = (cli: string, funcs: Func[], dps: { admissao_id: string; sexo: string | null; data_nascimento: string | null; grau_instrucao: string | null }[]): PessoaAtiva[] =>
  funcs.filter((f) => f.cliente_id === cli && f.status === "ativo").map((f) => {
    const d = dps.find((x) => x.admissao_id === f.admissao_id);
    return { nome: f.nome_completo, cargo: f.cargo, dataAdmissao: f.data_admissao, sexo: d?.sexo ?? null, dataNascimento: d?.data_nascimento ?? null, grauInstrucao: d?.grau_instrucao ?? null };
  });

// ── A página do portal ───────────────────────────────────────────────────────
type Pagina = (props: unknown) => Promise<ReactElement>;
const PASTA = "src/app/portal/(app)/gestao-pessoas";
const importar = async (arq: string) => ((await import(`../${arq}`)) as { default: Pagina }).default;

interface Resultado { el?: ReactElement; erro?: string }
async function abrir(pagina: Pagina, portal: string | null, props: unknown = {}, interno: string | null = null): Promise<Resultado> {
  const db = (globalThis as unknown as { __DB__: { usuarioPortal: unknown; usuario: unknown } }).__DB__;
  db.usuarioPortal = portal ? usuario(portal) : null;
  db.usuario = interno ? usuario(interno) : null;
  try { return { el: await pagina(props) }; } catch (e) { return { erro: (e as Error).message }; }
}
const propsDe = (r: Resultado) => (r.el as ReactElement<{ dados: ReturnType<typeof paraPortal>; modo: string; clientes: unknown[]; selecionadoId: unknown }>).props;
const htmlDe = (r: Resultado) => renderToStaticMarkup(r.el as ReactElement);

// Uma prova devolve a mensagem de falha ou null. As mesmas provas rodam na página real (todas null) e nas sabotadas (alguma tem de falhar).
type Prova = { categoria: "isolamento" | "payload" | "ativos"; roda: (p: Pagina) => Promise<string | null> };
const esperadoA = () => paraPortal(montarGestaoPessoas({ id: CLI_A, nome: "Alfa Indústria" }, pessoasDe(CLI_A, FUNCS_BASE, DPS_BASE), HOJE));

const PROVAS: Prova[] = [
  { categoria: "isolamento", roda: async (p) => {
    novoDb();
    const r = await abrir(p, U_A);
    if (!r.el) return `usuário A não abriu a página: ${r.erro}`;
    const d = propsDe(r).dados;
    return JSON.stringify(d) === JSON.stringify(esperadoA()) ? null : `o quadro do cliente A não é o esperado (total ${d.totalAtivos})`;
  } },
  { categoria: "isolamento", roda: async (p) => {
    novoDb();
    const r = await abrir(p, U_A, { searchParams: Promise.resolve({ cliente: CLI_B }), params: Promise.resolve({ cliente: CLI_B }) });
    if (!r.el) return `usuário A com ?cliente=B não abriu a página: ${r.erro}`;
    const d = propsDe(r).dados;
    return d.cliente.nome === "Alfa Indústria" && d.totalAtivos === 5 ? null : `?cliente=B mudou o que o usuário A vê (${d.cliente.nome}, ${d.totalAtivos} ativos)`;
  } },
  { categoria: "isolamento", roda: async (p) => {
    novoDb();
    const r = await abrir(p, U_B, { searchParams: Promise.resolve({ cliente: CLI_A }) });
    if (!r.el) return `usuário B não abriu a página: ${r.erro}`;
    return propsDe(r).dados.totalAtivos === 3 ? null : `usuário B vê ${propsDe(r).dados.totalAtivos} ativos em vez dos 3 da própria empresa`;
  } },
  { categoria: "payload", roda: async (p) => {
    novoDb();
    const r = await abrir(p, U_A);
    if (!r.el) return `não abriu: ${r.erro}`;
    const json = JSON.stringify(r.el.props);
    const proibidos = [
      ...FUNCS_BASE.flatMap((f) => [f.id, f.admissao_id ?? ""]), CLI_A, CLI_B, CLI_C, CLI_D, U_A, U_B, ...DPS_BASE.flatMap((d) => [d.cpf, d.rg_numero, d.pis_pasep]),
    ].filter(Boolean);
    const achado = proibidos.find((v) => json.includes(v));
    if (achado) return `o payload contém um valor proibido (${achado.slice(0, 12)}…)`;
    const chave = json.match(/"(funcionario_id|admissao_id|cliente_id|cpf|rg_numero|pis_pasep|cor_raca|salario|id)"\s*:/i);
    return chave ? `o payload contém a chave ${chave[1]}` : null;
  } },
  { categoria: "ativos", roda: async (p) => {
    novoDb();
    const r = await abrir(p, U_A);
    if (!r.el) return `não abriu: ${r.erro}`;
    const json = JSON.stringify(r.el.props);
    return propsDe(r).dados.totalAtivos === 5 && !json.includes("Desligado Antigo") ? null : "entrou funcionário desligado no quadro";
  } },
];

const real = await importar(`${PASTA}/page.tsx`);

await ok("isolamento: ?cliente=B (e params) na URL do usuário A é ignorado; A e B veem só o próprio quadro (mesmo conteúdo do esperado)", async () => {
  for (const prova of PROVAS.filter((x) => x.categoria === "isolamento")) assert.equal(await prova.roda(real), null);
});

await ok("sem vínculo em cliente_usuarios: redireciona para /portal/login e não monta quadro", async () => {
  novoDb();
  assert.equal((await abrir(real, U_SEM_VINCULO)).erro, "REDIRECT:/portal/login");
});
await ok("sem sessão de portal: sem login algum e usuário INTERNO do painel (outro cookie) redirecionam para /portal/login", async () => {
  novoDb();
  assert.equal((await abrir(real, null)).erro, "REDIRECT:/portal/login");
  assert.equal((await abrir(real, null, {}, U_INTERNO)).erro, "REDIRECT:/portal/login", "sessão do painel não vale no portal");
});
await ok("cliente inativo: redireciona para /portal/login?suspenso=1", async () => {
  novoDb();
  assert.equal((await abrir(real, U_INATIVO)).erro, "REDIRECT:/portal/login?suspenso=1");
});
await ok("usuário com dois vínculos: não vê nada de nenhum dos dois clientes (falha fechado, vai para o login)", async () => {
  novoDb();
  const r = await abrir(real, U_DOIS);
  assert.equal(r.erro, "REDIRECT:/portal/login");
  assert.equal(r.el, undefined);
});

await ok("payload ao navegador: sem funcionario_id/admissao_id/cliente_id/CPF/RG/PIS nem qualquer id semeado (varredura do JSON serializado); só o nome da empresa", async () => {
  const prova = PROVAS.find((x) => x.categoria === "payload")!;
  assert.equal(await prova.roda(real), null);
  novoDb();
  const props = propsDe(await abrir(real, U_A));
  assert.deepEqual(props.dados.cliente, { nome: "Alfa Indústria" });
  assert.equal(props.modo, "portal");
  assert.deepEqual(props.clientes, [], "o portal não recebe a lista de empresas");
  assert.equal(props.selecionadoId, null);
  // só aniversariantes (nome, cargo, dia/mês, idade): nenhum campo além dos esperados
  const campos = new Set(props.dados.aniversariantesPorMes.flatMap((m) => m.aniversariantes.flatMap((a) => Object.keys(a))));
  assert.deepEqual([...campos].sort(), ["cargo", "completaAnos", "diaMes", "nome", "ordem"]);
});

await ok("só ativos: o desligado do mesmo cliente não entra no quadro nem nos aniversariantes", async () => {
  assert.equal(await PROVAS.find((x) => x.categoria === "ativos")!.roda(real), null);
});

await ok("mesmos números do RH para o mesmo cliente (carregarGestaoPessoas do RH x página do portal), TZ do runtime e 'hoje' de Brasília iguais", async () => {
  const db = novoDb();
  const rh = await carregarGestaoPessoas(criarClienteServico(db), { clienteId: CLI_A, unidadeRH: null, hojeISO: HOJE });
  const por = propsDe(await abrir(real, U_A)).dados;
  const { cliente: _c1, dadosInconsistentes: _d1, poucosAtivos: _p1, ...rhResto } = rh!;
  const { cliente: _c2, dadosInconsistentes: _d2, poucosAtivos: _p2, ...porResto } = por;
  assert.deepEqual(porResto, rhResto, "mesmos cartões, gráficos e aniversariantes");
  assert.equal(por.mesDeReferencia, 11, "o mês é o de Brasília (novembro), mesmo com o relógio em 19/11 em UTC");
  assert.equal(por.totalAtivos, 5);
});

// ── Textos do portal ─────────────────────────────────────────────────────────
await ok("sem legado: nenhum 'Dado não cadastrado', nenhuma nota e nenhum aviso de gráfico sem dado; textos internos do RH fora do portal", async () => {
  novoDb();
  const html = htmlDe(await abrir(real, U_A));
  assert.ok(html.includes("Gestão de Pessoas") && html.includes("Alfa Indústria"));
  for (const proibido of ["Dado não cadastrado", "Não informado", "Alguns funcionários ainda não têm este dado no cadastro.", "Dados ainda não cadastrados para esta empresa", "N/I", "Sem dado"]) assert.ok(!html.includes(proibido), proibido);
  for (const interno of ["uso interno do RH", "Agregado de poucas pessoas", "Corrija na admissão", "Escolha uma empresa", 'aria-label="Empresa"', "inconsistente"]) assert.ok(!html.includes(interno), interno);
  for (const secao of ["Distribuição por sexo", "Faixa etária por sexo", "Grau de escolaridade", "Cargos", "Aniversariantes de novembro"]) assert.ok(html.includes(secao), secao);
  assert.ok(html.includes('<select id="mes-aniversariantes"'), "o filtro de mês dos aniversariantes continua no portal");
});

await ok("com legado (funcionário ativo sem admissão): 'Dado não cadastrado' com a nota, uma vez por gráfico afetado; sem 'Não informado'", async () => {
  novoDb([...FUNCS_BASE, func(7, CLI_A, "ativo", "Legado Sem Cadastro", "Vigia", "2022-01-01", null)]);
  const html = htmlDe(await abrir(real, U_A));
  assert.ok(html.includes("Dado não cadastrado"));
  assert.ok(!html.includes("Não informado") && !html.includes("N/I"));
  assert.equal((html.match(/Alguns funcionários ainda não têm este dado no cadastro\./g) ?? []).length, 3, "sexo, faixa etária e escolaridade");
  assert.ok(html.includes("Sem dado"), "coluna da tabela da faixa etária");
  assert.ok(html.includes("Idade não informada"), "linha da faixa etária");
});

await ok("cadastro de nascimento inconsistente: sem aviso 'corrija'; fica contado em 'Idade não informada'", async () => {
  novoDb(FUNCS_BASE, DPS_BASE.map((d) => (d.admissao_id === id(2001) ? { ...d, data_nascimento: "2026-05-01" } : d)));
  const r = await abrir(real, U_A);
  const html = htmlDe(r);
  assert.ok(!html.includes("Corrija") && !html.includes("inconsistente"));
  assert.ok(html.includes("Idade não informada"));
  assert.equal(propsDe(r).dados.dadosInconsistentes, 0, "o sinal interno nem sai do servidor");
  assert.equal(propsDe(r).dados.faixaPorSexo.find((f) => f.faixa === "nao_informada")?.total, 1);
});

await ok("nenhum funcionário com dado pessoal: cada gráfico vira 'Dados ainda não cadastrados para esta empresa' (3 avisos, sem barra e sem nota)", async () => {
  novoDb(FUNCS_BASE.map((f) => (f.cliente_id === CLI_A ? { ...f, admissao_id: null } : f)));
  const html = htmlDe(await abrir(real, U_A));
  assert.equal((html.match(/Dados ainda não cadastrados para esta empresa/g) ?? []).length, 3);
  assert.ok(!html.includes("Alguns funcionários ainda não têm") && html.includes("<canvas"), "sem nota, e ainda há o gráfico de cargos");
  assert.ok(html.includes("Cargos") && html.includes("Aniversariantes de novembro"), "cargos e aniversariantes continuam");
});

await ok("1 a 4 ativos: os gráficos de sexo, faixa etária e escolaridade aparecem normalmente, sem aviso de 'poucas pessoas'", async () => {
  novoDb();
  const html = htmlDe(await abrir(real, U_B)); // 3 ativos
  for (const secao of ["Distribuição por sexo", "Faixa etária por sexo", "Grau de escolaridade"]) assert.ok(html.includes(secao), secao);
  assert.ok((html.match(/<canvas/g) ?? []).length >= 3, "pizza, barras da faixa e da escolaridade (+ cargos)");
  assert.ok(!html.includes("poucas pessoas") && !html.includes("uso interno") && !html.includes("Dados ainda não cadastrados"));
  novoDb(FUNCS_BASE.filter((f) => f.id !== id(1002) && f.id !== id(1003) && f.id !== id(1004) && f.id !== id(1005)));
  const html1 = htmlDe(await abrir(real, U_A)); // 1 ativo
  assert.ok(html1.includes("Distribuição por sexo") && html1.includes("Grau de escolaridade") && !html1.includes("poucas pessoas"));
});

await ok("empresa sem ativos: 'Sua empresa não tem funcionários ativos no momento.' com o título e o nome da empresa", async () => {
  novoDb();
  const html = htmlDe(await abrir(real, U_D));
  assert.ok(html.includes("Sua empresa não tem funcionários ativos no momento."));
  assert.ok(html.includes("Gestão de Pessoas") && html.includes("Delta Serviços"));
  assert.ok(!html.includes("Delta Serviços não tem") && !html.includes("Escolha uma empresa"));
});

// ── Interface interativa (botões, lista, acessibilidade) ─────────────────────
await ok("tela: cartões e legendas são <button> com aria-pressed; região aria-live; lista 'Funcionários · …'; RH com 'Exportar lista' e portal SEM exportação", async () => {
  novoDb();
  const portalHtml = htmlDe(await abrir(real, U_A));
  assert.ok(portalHtml.includes("Funcionários · …") && portalHtml.includes('aria-live="polite"') && portalHtml.includes('role="status"'));
  assert.ok(!portalHtml.includes("Exportar") && !portalHtml.includes("exportar"), "o portal não tem exportação");
  for (const cartao of ["Funcionários ativos", "Admitidos no mês", "Tempo médio de casa", "Aniversariantes de novembro"]) {
    assert.ok(new RegExp('<button[^>]*aria-pressed="(true|false)"[^>]*>(?:(?!</button>).)*' + cartao).test(portalHtml), "cartão como botão: " + cartao);
  }
  assert.ok(/<button[^>]*aria-pressed="false"[^>]*>(?:(?!<\/button>).)*Masculino/.test(portalHtml), "legenda de sexo como botão");
  // visual dos cartões-botão: fundo claro + borda (classe gp-cartao), e o seletor de mês FORA do <button> (mexer nele não dispara o clique do cartão)
  assert.equal((portalHtml.match(/class="card gp-cartao"/g) ?? []).length, 4, "os 4 cartões de cima têm o visual de clicável");
  assert.ok(/\.card\.gp-cartao\{background:#f1f5f9;border:1px solid #cbd5e1/.test(portalHtml) && /\.card\.gp-cartao:hover\{background:#e2e8f0\}/.test(portalHtml) && /\[data-pressionado="true"\]\{border-color:#111827/.test(portalHtml));
  const botoes = [...portalHtml.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]);
  assert.ok(!botoes.some((b) => b.includes("<select") || b.includes("mes-aniversariantes")), "nenhum <button> contém o seletor de mês");
  assert.ok(/<\/button><div[^>]*><label for="mes-aniversariantes"/.test(portalHtml), "o seletor é irmão do botão do cartão, não filho");
  // botão "Ver todos" em cada um dos 4 gráficos: mesma função do cartão "Funcionários ativos" (limpar), sempre visível
  for (const secao of ["Distribuição por sexo", "Faixa etária por sexo", "Grau de escolaridade", "Cargos"]) {
    const i = portalHtml.indexOf(">" + secao + "</h2>");
    assert.ok(i > 0, secao);
    const cabeca = portalHtml.slice(i, i + 400);
    assert.ok(/<button[^>]*aria-label="Ver todos os funcionários e limpar os filtros"[^>]*>Ver todos<\/button>/.test(cabeca), "botão Ver todos em " + secao);
  }
  assert.equal((portalHtml.match(/>Ver todos<\/button>/g) ?? []).length, 4);
  assert.ok(/aria-label="Filtrar por cargo"/.test(portalHtml) && /aria-label="Filtrar por escolaridade"/.test(portalHtml), "alternativa em botões para os gráficos de barras");
  assert.ok(/aria-label="[^"]*, masculino: \d+"/.test(portalHtml), "células da tabela como botões com nome acessível");
  const rhHtml = renderToStaticMarkup(createElement(GestaoPessoasClient, { clientes: [{ id: CLI_A, nome: "Alfa Indústria" }], selecionadoId: CLI_A, dados: montarGestaoPessoas({ id: CLI_A, nome: "Alfa Indústria" }, pessoasDe(CLI_A, FUNCS_BASE, DPS_BASE), HOJE) } as never));
  assert.ok(rhHtml.includes("Exportar lista") && rhHtml.includes("Funcionários · …"));
});

await ok("fonte da tela: tudo clicável é <button>; o portal não manda cliente e não tem exportação; colunas do portal sem sexo/idade/escolaridade; cada clique chama o filtro certo", () => {
  const c = fonte("src/components/GestaoPessoasClient.tsx");
  for (let i = c.indexOf("onClick="); i >= 0; i = c.indexOf("onClick=", i + 1)) {
    const abre = c.lastIndexOf("<", i);
    const tag = /^<([A-Za-z][A-Za-z0-9]*)/.exec(c.slice(abre))?.[1];
    assert.ok(tag === "button" || tag === "Cartao", `onClick em <${tag}> (só <button> ou o Cartao, que renderiza <button>): ${c.slice(i, i + 40)}`);
  }
  assert.ok(!/<(div|span|li|td|tr|p)\b[^>]*onClick=/.test(c), "nenhum onClick em div/span/li/td/tr/p");
  assert.ok(c.includes("portal ? { filtros } : { clienteId: selecionadoId, filtros }"), "o portal manda só os filtros");
  assert.ok(c.includes('portal ? "/api/portal/gestao-pessoas/lista" : "/api/gestao-pessoas/lista"'));
  assert.ok(c.includes("{!portal && <button") && c.includes("Exportar lista") && c.includes("/api/gestao-pessoas/exportar"), "exportação só no RH");
  assert.ok(c.includes("{!portal && <><th style={th}>Idade</th><th style={th}>Sexo</th><th style={th}>Escolaridade</th></>}"), "cabeçalho: sexo, idade e escolaridade só no RH");
  assert.ok(c.includes("{!portal && <><td style={td}>{rh.idade ?? \"—\"}</td><td style={td}>{rh.sexo}</td><td style={td}>{rh.escolaridade}</td></>}"), "linhas: idem");
  const cliques = [
    "onClick={limpar} aria-label=\"Ver todos os funcionários e limpar os filtros\"",
    'aplicar(par("admitidoNoMes", true))', 'aplicar(par("ordenarPorTempoDeCasa", true))', 'aplicar(par("aniversario", indiceMes))', "onClick={limpar}",
    'aplicar(par("sexo", chave))', 'aplicar(par("sexo", itensSexo[els[0].index][0]))',
    'aplicar(par("faixa", faixasMostradas[els[0].index].faixa), par("sexo", (["masculino", "feminino", "naoInformado"] as SexoFiltro[])[els[0].datasetIndex]))',
    'aplicar(par("faixa", f.faixa), par("sexo", "masculino"))', 'aplicar(par("faixa", f.faixa), par("sexo", "feminino"))', 'aplicar(par("faixa", f.faixa), par("sexo", "naoInformado"))', 'aplicar(par("faixa", f.faixa))',
    'aplicar(par("sexo", "masculino"))', 'aplicar(par("sexo", "feminino"))', 'aplicar(par("sexo", "naoInformado"))',
    'aplicar(par("escolaridade", escolaridadeMostrada[i].grau))', 'aplicar(par("escolaridade", e.grau))',
    'aplicar(par("cargo", chaveDaBarraDeCargo(cargos[i].cargo)))', 'aplicar(par("cargo", chaveDaBarraDeCargo(c.cargo)))',
  ];
  for (const x of cliques) assert.ok(c.includes(x), "clique: " + x);
  assert.ok(c.includes("focus-visible") && c.includes('aria-label={`Remover filtro ${e.texto}`}') && c.includes("Nenhum funcionário com esses filtros") && c.includes("Limpar filtros"));
  assert.ok(c.includes("scrollIntoView") && c.includes("window.innerWidth < 768"), "rola até a lista em tela pequena");
  assert.ok(c.includes("URL.createObjectURL(await r.blob())"), "o download usa blob: preserva o BOM do CSV");
  assert.ok(!/cliente_id|clienteId/.test(c.replace(/clienteId: selecionadoId/g, "")), "o componente não manipula cliente_id além da empresa do RH");
});

// ── Varredura estática, menu e layout ────────────────────────────────────────
await ok("varredura estática: a página do portal não lê searchParams/params/URL e o cliente_id vem só de obterClienteDoPortal(); nenhuma página do portal (app) lê searchParams", () => {
  const pagina = fonte(`${PASTA}/page.tsx`);
  for (const proibido of [/searchParams/, /\bparams\b/, /useSearchParams/, /headers\(/, /cookies\(/, /request\./, /\.get\(["']cliente/, /cliente=/, /createServiceClient/, /createPortalClient/]) assert.ok(!proibido.test(pagina), String(proibido));
  assert.ok(pagina.includes("const { clienteId, service } = await obterClienteDoPortal();"));
  assert.equal((pagina.match(/clienteId/g) ?? []).length, 2, "só a declaração e a chamada do carregador");
  assert.ok(pagina.includes("unidadeRH: null") && pagina.includes("formatarDataISO(obterDataHojeBrasil())") && pagina.includes("paraPortal(dados)"));
  const lib = fonte("src/lib/portalCliente.ts");
  assert.ok(lib.includes("createPortalClient") && lib.includes('.from("cliente_usuarios")') && lib.includes(".single()") && lib.includes('/portal/login?suspenso=1') && !/searchParams|params/.test(lib));
  const ordem = (a: string, b: string) => lib.indexOf(a) < lib.indexOf(b);
  assert.ok(ordem("auth.getUser()", '.from("cliente_usuarios")') && ordem('.from("cliente_usuarios")', '.from("clientes")'));
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const arq of walk("src/app/portal/(app)").filter((a) => /\.(tsx|ts)$/.test(a))) assert.ok(!/searchParams/.test(fonte(arq)), `${arq} lê searchParams`);
});

await ok("menu: 'Gestão de Pessoas' (PieChart) logo depois de 'Funcionários', só com funcionário ATIVO (consulta nova no layout, que não conta desligado); sem chave nova de acesso", () => {
  const menu = fonte("src/components/SidebarPortal.tsx");
  assert.ok(menu.includes('const GESTAO_PESSOAS_ITEM: MenuItemDef = { label: "Gestão de Pessoas", href: "/portal/gestao-pessoas", icon: PieChart };'));
  assert.ok(/PieChart \} from "lucide-react"/.test(menu));
  const lista = menu.slice(menu.indexOf("const items = ["), menu.indexOf("const isCollapsedView"));
  assert.ok(lista.indexOf("FUNCIONARIOS_ITEM") < lista.indexOf("GESTAO_PESSOAS_ITEM") && lista.indexOf("GESTAO_PESSOAS_ITEM") < lista.indexOf("VENCIMENTO_CONTRATO_ITEM"));
  assert.ok(lista.includes("mostrarGestaoPessoas ? [GESTAO_PESSOAS_ITEM] : []"));
  const layout = fonte("src/app/portal/(app)/layout.tsx");
  const consulta = layout.slice(layout.indexOf("const { data: ativoGestao }"), layout.indexOf("const { data: motAtivos }"));
  assert.ok(consulta.includes('.eq("cliente_id", clienteUsuario.cliente_id)') && consulta.includes('.eq("status", "ativo")') && !consulta.includes('"desligado"'));
  assert.ok(layout.includes("mostrarGestaoPessoas={!!ativoGestao}"));
  assert.ok(existeSemChave(), "sem chave nova de acesso");
  function existeSemChave() { return ["src/lib/abasConfig.ts", "src/lib/regraPadraoPorPapel.ts"].every((a) => !/gestao_pessoas|gestaoPessoas/.test(fonte(a))); }
});

// ── Provas de falha: as MESMAS provas reprovam versões sabotadas ─────────────
type Sabotagem = { nome: string; categoria: Prova["categoria"]; pagina?: [string, string][]; lib?: [string, string][] };
const SABOTAGENS: Sabotagem[] = [
  { nome: "carregador sem o filtro de cliente_id", categoria: "isolamento", lib: [['.eq("cliente_id", o.clienteId).eq("status", "ativo")', '.eq("status", "ativo")']] },
  { nome: "página que aceita o cliente da URL (searchParams)", categoria: "isolamento", pagina: [[
    "export default async function PortalGestaoPessoasPage() {\n  const { clienteId, service } = await obterClienteDoPortal();",
    "export default async function PortalGestaoPessoasPage({ searchParams }: { searchParams?: Promise<{ cliente?: string }> }) {\n  const { clienteId: doUsuario, service } = await obterClienteDoPortal();\n  const clienteId = (await searchParams)?.cliente ?? doUsuario;",
  ]] },
  { nome: "payload com o id do cliente (sem paraPortal)", categoria: "payload", pagina: [["dados={paraPortal(dados)}", "dados={dados}"]] },
  { nome: "carregador sem o filtro de status ativo", categoria: "ativos", lib: [['.eq("cliente_id", o.clienteId).eq("status", "ativo")', '.eq("cliente_id", o.clienteId)']] },
];

await ok("provas de falha: cada sabotagem (sem filtro de cliente, cliente da URL, id no payload, sem filtro de status) é reprovada pela prova da sua categoria; a página real passa em todas", async () => {
  const lib = fonte("src/lib/gestaoPessoas.ts");
  const pag = fonte(`${PASTA}/page.tsx`);
  const criados: string[] = [];
  try {
    for (const [i, s] of SABOTAGENS.entries()) {
      let libSab = lib, pagSab = pag;
      for (const [de, para] of s.lib ?? []) { assert.equal(libSab.split(de).length, 2, `âncora da lib: ${de}`); libSab = libSab.replace(de, () => para); }
      for (const [de, para] of s.pagina ?? []) { assert.equal(pagSab.split(de).length, 2, `âncora da página: ${de.slice(0, 50)}`); pagSab = pagSab.replace(de, () => para); }
      if (s.lib) {
        const arqLib = `src/lib/__sab_gestaoPessoas${i}.ts`;
        fs.writeFileSync(arqLib, libSab); criados.push(arqLib);
        pagSab = pagSab.replace('import { carregarGestaoPessoas, paraPortal } from "@/lib/gestaoPessoas";', `import { carregarGestaoPessoas } from "@/lib/__sab_gestaoPessoas${i}";\nimport { paraPortal } from "@/lib/gestaoPessoas";`);
      }
      const arqPag = `${PASTA}/__sab_page${i}.tsx`;
      fs.writeFileSync(arqPag, pagSab); criados.push(arqPag);
      const sabotada = await importar(arqPag);
      const reprovadas: string[] = [];
      for (const prova of PROVAS) { const falha = await prova.roda(sabotada); if (falha) reprovadas.push(`${prova.categoria}: ${falha}`); }
      assert.ok(reprovadas.some((r) => r.startsWith(s.categoria)), `a sabotagem "${s.nome}" NÃO foi pega pela prova de ${s.categoria} (reprovou: ${JSON.stringify(reprovadas)})`);
      console.log(`   sabotagem pega — ${s.nome}: ${reprovadas.find((r) => r.startsWith(s.categoria))}`);
    }
    for (const prova of PROVAS) assert.equal(await prova.roda(real), null, `a página real reprovou em ${prova.categoria}`);
  } finally {
    for (const a of criados) fs.rmSync(a, { force: true });
  }
  for (const a of criados) assert.ok(!fs.existsSync(a), "arquivo de sabotagem removido");
});

console.log(`\n${n} verificações OK`);
