// Gestão de Pessoas interativa: a LISTA filtrada (função pura, rotas do RH e do portal, CSV), com banco em memória e quadro sintético de 29 ativos.
//  - cada elemento clicável (cartões, sexo, faixa, sexo×faixa, escolaridade, cargos, "Demais cargos", "Não informado") produz uma lista do mesmo tamanho do número do gráfico;
//  - AND entre dimensões, substituição na mesma dimensão, remoção ao clicar de novo, limpar, lista vazia; "Tempo médio de casa" só ordena e alterna;
//  - aniversariantes: mês escolhido, 29/02 e virada de ano; admissão futura fora de "admitidos no mês" e do tempo de casa;
//  - isolamento: portal ignora cliente forjado, barra sem vínculo / interno / suspenso / vínculo duplo; RH respeita unidade e papel; payload sem ids/CPF/RG/PIS;
//    resposta do portal sem sexo, idade nem escolaridade;
//  - CSV: ";" + BOM, dd/mm/aaaa, fórmula neutralizada, nome do arquivo, mesmas linhas da lista, bloqueado para papel sem acesso e sem rota no portal, auditoria gravada;
//  - provas de falha: as MESMAS provas reprovam rotas sabotadas.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-gestao-pessoas-lista.mts
//   (o script roda a si mesmo sob TZ=UTC e TZ=America/Sao_Paulo; o relógio fica em 18/11/2026 22:30 em Brasília = 19/11 em UTC)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, flush } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb } from "./harness-mot/memdb.mjs";
import { limitarCargos, MAX_CARGOS_NO_GRAFICO, aniversariantesPorMes, montarGestaoPessoas, type PessoaAtiva } from "../src/lib/gestaoPessoas";
import {
  alternarFiltros, CARGO_DEMAIS, filtrarFuncionariosGestao, formatarTempoDeCasa, linhasParaPortal, linhasParaRH, LIMPAR, montarCsvRH, nomeArquivoCsv, neutralizarFormula, type FiltrosGestao,
} from "../src/lib/gestaoPessoasLista";
import { AGORA, HOJE, PESSOAS_NOVACKI } from "./gestao-pessoas-novacki-fixture.mts";

if (!process.env.GP_LISTA_FILHO) {
  for (const tz of ["UTC", "America/Sao_Paulo"]) {
    const saida = execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/verificar-gestao-pessoas-lista.mts"], {
      env: { ...process.env, TZ: tz, GP_LISTA_FILHO: "1", HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8",
    });
    process.stdout.write(saida.split("\n").filter((l) => l.startsWith("OK") || l.startsWith("FALHA") || l.startsWith("   sabotagem")).map((l) => `[${tz}] ${l}\n`).join(""));
    console.log(`[${tz}] ${saida.trim().split("\n").pop()}`);
  }
  process.exit(0);
}

congelarData(AGORA);
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");
const tam = (f: FiltrosGestao, pessoas = PESSOAS_NOVACKI) => filtrarFuncionariosGestao(pessoas, f, HOJE).length;
const nomes = (f: FiltrosGestao, pessoas = PESSOAS_NOVACKI) => filtrarFuncionariosGestao(pessoas, f, HOJE).map((l) => l.pessoa.nome);
const g = montarGestaoPessoas({ id: "x", nome: "Novacki" }, PESSOAS_NOVACKI, HOJE);

// ── Função pura: cada clique = o número do gráfico ───────────────────────────
await ok("o quadro de teste tem o formato esperado: 29 ativos, 19 M, 8 F, 2 sem cadastro, 12 admitidos no mês, 4 aniversariantes no mês, >12 cargos", () => {
  assert.equal(g.totalAtivos, 29);
  assert.deepEqual(g.porSexo, { masculino: 19, feminino: 8, naoInformado: 2 });
  assert.equal(g.admitidosNoMes, 12);
  assert.equal(g.aniversariantesPorMes[0].aniversariantes.length, 4);
  assert.ok(g.cargos.length > MAX_CARGOS_NO_GRAFICO);
});

await ok("lista aberta (sem filtro) = todos os 29 ativos, em ordem alfabética; cartão 'Funcionários ativos' (LIMPAR) volta a ela", () => {
  assert.equal(tam({}), 29);
  const ns = nomes({});
  assert.deepEqual(ns, [...ns].sort((a, b) => a.localeCompare(b, "pt-BR")));
  assert.equal(tam(alternarFiltros({ sexo: "feminino", faixa: "21_30", ordenarPorTempoDeCasa: true }, [])), 29 * 0 + tam({ sexo: "feminino", faixa: "21_30", ordenarPorTempoDeCasa: true }));
  assert.equal(tam(LIMPAR), 29);
});

await ok("sexo: M = 19, F = 8, Não informado = 2 (pizza e legenda); cada fatia produz a lista com o mesmo número", () => {
  assert.equal(tam({ sexo: "masculino" }), g.porSexo.masculino);
  assert.equal(tam({ sexo: "feminino" }), g.porSexo.feminino);
  assert.equal(tam({ sexo: "naoInformado" }), g.porSexo.naoInformado);
});

await ok("faixa etária: cada faixa (inclusive 'Idade não informada') e cada célula sexo×faixa da tabela = a lista", () => {
  for (const f of g.faixaPorSexo) {
    assert.equal(tam({ faixa: f.faixa }), f.total, `faixa ${f.faixa}`);
    assert.equal(tam({ faixa: f.faixa, sexo: "masculino" }), f.masculino, `${f.faixa} M`);
    assert.equal(tam({ faixa: f.faixa, sexo: "feminino" }), f.feminino, `${f.faixa} F`);
    assert.equal(tam({ faixa: f.faixa, sexo: "naoInformado" }), f.naoInformado, `${f.faixa} N/I`);
  }
});

await ok("escolaridade: cada grau (7) e 'Não informado' (2 legados) = a lista", () => {
  for (const e of g.escolaridade) assert.equal(tam({ escolaridade: e.grau }), e.total, e.grau);
  assert.equal(g.escolaridade.find((e) => e.naoInformado)!.total, 2);
});

await ok("cargos: cada barra do gráfico (inclusive 'Cargo não informado') e 'Demais cargos (N)' = a lista", () => {
  const barras = limitarCargos(g.cargos, MAX_CARGOS_NO_GRAFICO);
  assert.ok(barras[barras.length - 1].cargo.startsWith("Demais cargos ("));
  for (const b of barras.slice(0, -1)) assert.equal(tam({ cargo: b.cargo }), b.total, b.cargo);
  assert.equal(tam({ cargo: CARGO_DEMAIS }), barras[barras.length - 1].total);
  const naoInf = g.cargos.find((c) => c.cargo === "Cargo não informado");
  assert.equal(tam({ cargo: "Cargo não informado" }), naoInf?.total ?? 0);
  // cargo com outra grafia/acento cai no mesmo grupo (mesma normalização do gráfico)
  assert.equal(tam({ cargo: "auxiliar de producao" }), tam({ cargo: "Auxiliar de Produção" }));
  assert.equal(tam({ cargo: "Cargo que não existe" }), 0);
});

await ok("cartões: 'Admitidos no mês' = 12 e 'Aniversariantes de {mês}' = a lista de cada um dos 12 meses (respeita o mês escolhido)", () => {
  assert.equal(tam({ admitidoNoMes: true }), g.admitidosNoMes);
  g.aniversariantesPorMes.forEach((m, i) => assert.equal(tam({ aniversario: i }), m.aniversariantes.length, `mês ${m.rotulo}`));
  assert.equal(g.aniversariantesPorMes.reduce((s, m) => s + m.aniversariantes.length, 0), 27, "cada pessoa com nascimento aparece em exatamente um mês");
});

// ── Combinação de filtros ────────────────────────────────────────────────────
await ok("AND entre dimensões: Feminino + 21 a 30 = as mulheres dessa faixa; + escolaridade + cargo estreita mais; os números conferem com a tabela", () => {
  const f = alternarFiltros(alternarFiltros({}, [["sexo", "feminino"]]), [["faixa", "21_30"]]);
  assert.deepEqual(f, { sexo: "feminino", faixa: "21_30" });
  assert.equal(tam(f), g.faixaPorSexo.find((x) => x.faixa === "21_30")!.feminino);
  const pessoas = filtrarFuncionariosGestao(PESSOAS_NOVACKI, f, HOJE);
  assert.ok(pessoas.every((l) => l.pessoa.sexo === "F" && l.faixa === "21_30"));
  assert.ok(tam({ ...f, admitidoNoMes: true }) <= tam(f));
  assert.equal(tam({ sexo: "masculino", admitidoNoMes: true }), filtrarFuncionariosGestao(PESSOAS_NOVACKI, { admitidoNoMes: true }, HOJE).filter((l) => l.sexo === "masculino").length);
});

await ok("mesma dimensão SUBSTITUI e clicar de novo no valor ativo REMOVE; segmento sexo×faixa liga/desliga os dois; Limpar zera", () => {
  let f: FiltrosGestao = alternarFiltros({}, [["sexo", "feminino"]]);
  f = alternarFiltros(f, [["sexo", "masculino"]]);
  assert.deepEqual(f, { sexo: "masculino" }, "substitui");
  f = alternarFiltros(f, [["sexo", "masculino"]]);
  assert.deepEqual(f, {}, "remove");
  f = alternarFiltros({ cargo: "Motorista" }, [["faixa", "21_30"], ["sexo", "feminino"]]);
  assert.deepEqual(f, { cargo: "Motorista", faixa: "21_30", sexo: "feminino" }, "segmento aplica os dois e mantém as outras dimensões");
  f = alternarFiltros(f, [["faixa", "21_30"], ["sexo", "feminino"]]);
  assert.deepEqual(f, { cargo: "Motorista" }, "mesmo segmento de novo remove os dois");
  f = alternarFiltros({ faixa: "21_30", sexo: "masculino" }, [["faixa", "21_30"], ["sexo", "feminino"]]);
  assert.deepEqual(f, { faixa: "21_30", sexo: "feminino" }, "segmento parcialmente ativo substitui o que difere");
  assert.deepEqual(alternarFiltros({ sexo: "feminino", admitidoNoMes: true, aniversario: 2 }, []), { sexo: "feminino", admitidoNoMes: true, aniversario: 2 });
  assert.deepEqual(LIMPAR, {});
});

await ok("lista vazia: filtros que não casam com ninguém devolvem 0 linhas (a tela mostra 'Nenhum funcionário com esses filtros')", () => {
  assert.equal(tam({ sexo: "feminino", escolaridade: "nao_informado" }), 0, "as 2 sem cadastro são todas N/I, nenhuma é F");
  assert.equal(tam({ cargo: "Cargo que não existe" }), 0);
});

// ── Ordenação por tempo de casa ──────────────────────────────────────────────
await ok("'Tempo médio de casa' só ORDENA (maior para o menor, sem tempo no fim) e alterna; não filtra", () => {
  const f = alternarFiltros({}, [["ordenarPorTempoDeCasa", true]]);
  assert.deepEqual(f, { ordenarPorTempoDeCasa: true });
  const l = filtrarFuncionariosGestao(PESSOAS_NOVACKI, f, HOJE);
  assert.equal(l.length, 29, "não filtra");
  const meses = l.map((x) => x.meses);
  const comTempo = meses.filter((m): m is number => m !== null);
  assert.deepEqual(comTempo, [...comTempo].sort((a, b) => b - a), "ordem decrescente");
  assert.equal(meses[meses.length - 1], null, "a admissão futura (sem tempo) fica no fim");
  assert.deepEqual(alternarFiltros(f, [["ordenarPorTempoDeCasa", true]]), {}, "clicar de novo volta à ordem alfabética");
  assert.deepEqual(nomes({}), [...nomes({})].sort((a, b) => a.localeCompare(b, "pt-BR")));
  // combina com um filtro sem perder o filtro
  assert.equal(tam({ ordenarPorTempoDeCasa: true, sexo: "feminino" }), 8);
});

await ok("tempo de casa legível: 'Menos de 1 mês', meses, anos e meses; sem tempo (admissão futura ou vazia) = '—'", () => {
  assert.equal(formatarTempoDeCasa(null), "—");
  assert.equal(formatarTempoDeCasa(0.4), "Menos de 1 mês");
  assert.equal(formatarTempoDeCasa(1), "1 mês");
  assert.equal(formatarTempoDeCasa(7.9), "7 meses");
  assert.equal(formatarTempoDeCasa(12), "1 ano");
  assert.equal(formatarTempoDeCasa(15.2), "1 ano e 3 meses");
  assert.equal(formatarTempoDeCasa(30), "2 anos e 6 meses");
});

// ── Aniversariantes: mês escolhido, 29/02, virada de ano; admissão futura ────
await ok("aniversariantes: mês escolhido, virada de ano (31/12 em dezembro, 02/01 em janeiro) e 29/02 listado no dia 28 em ano comum (29 em bissexto)", () => {
  const dez = filtrarFuncionariosGestao(PESSOAS_NOVACKI, { aniversario: 1 }, HOJE);
  assert.ok(dez.some((l) => l.pessoa.dataNascimento === "1969-12-31"));
  const jan = filtrarFuncionariosGestao(PESSOAS_NOVACKI, { aniversario: 2 }, HOJE);
  assert.ok(jan.some((l) => l.pessoa.dataNascimento === "1990-01-02") && jan.some((l) => l.pessoa.dataNascimento === "1977-01-27"));
  assert.deepEqual(jan.map((l) => l.aniversario!.ordem), [...jan.map((l) => l.aniversario!.ordem)].sort((a, b) => a - b), "em dia/mês");
  const fev = filtrarFuncionariosGestao(PESSOAS_NOVACKI, { aniversario: 3 }, HOJE);
  const leap = fev.find((l) => l.pessoa.dataNascimento === "2000-02-29")!;
  assert.deepEqual([leap.aniversario!.diaMes, leap.aniversario!.ordem, leap.aniversario!.completaAnos], ["29/02", 28, 27], "fev/2027 é comum: dia 28, exibe 29/02");
  const so = [PESSOAS_NOVACKI[5]];
  const leap2 = filtrarFuncionariosGestao(so, { aniversario: 3 }, "2027-11-18")[0];
  assert.deepEqual([leap2.aniversario!.diaMes, leap2.aniversario!.ordem, leap2.aniversario!.completaAnos], ["29/02", 29, 28], "fev/2028 é bissexto: dia 29");
  // a lista do filtro e a lista de aniversariantes mostram as mesmas pessoas, na mesma ordem
  const doGrafico = aniversariantesPorMes(PESSOAS_NOVACKI, HOJE)[0].aniversariantes.map((a) => a.nome);
  assert.deepEqual(nomes({ aniversario: 0 }), doGrafico);
  const rh = linhasParaRH(filtrarFuncionariosGestao(PESSOAS_NOVACKI, { aniversario: 0 }, HOJE), { aniversario: 0 });
  assert.deepEqual(rh.map((r) => [r.diaMes, r.completaAnos]), aniversariantesPorMes(PESSOAS_NOVACKI, HOJE)[0].aniversariantes.map((a) => [a.diaMes, a.completaAnos]));
});

await ok("admissão futura: fora de 'admitidos no mês' e sem tempo de casa ('—'), mas continua na lista de ativos", () => {
  const futuro = PESSOAS_NOVACKI[12];
  assert.equal(futuro.dataAdmissao, "2026-11-25");
  assert.ok(!nomes({ admitidoNoMes: true }).includes(futuro.nome));
  assert.ok(nomes({}).includes(futuro.nome));
  const linha = linhasParaRH(filtrarFuncionariosGestao([futuro], {}, HOJE), {})[0];
  assert.equal(linha.tempoDeCasa, "—");
  assert.equal(linha.dataAdmissao, "25/11/2026");
});

await ok("linhas: RH com nome, cargo, admissão dd/mm/aaaa, tempo de casa, idade, sexo e escolaridade; portal só nome, cargo, admissão e tempo de casa (+ dia/mês e 'completa' no aniversário)", () => {
  const f: FiltrosGestao = {};
  const l = filtrarFuncionariosGestao(PESSOAS_NOVACKI, f, HOJE);
  const rh = linhasParaRH(l, f)[0], po = linhasParaPortal(l, f)[0];
  assert.deepEqual(Object.keys(rh).sort(), ["cargo", "dataAdmissao", "escolaridade", "filhos", "idade", "nome", "sexo", "tempoDeCasa"]);
  assert.deepEqual(Object.keys(po).sort(), ["cargo", "dataAdmissao", "filhos", "nome", "tempoDeCasa"]);
  assert.match(rh.dataAdmissao, /^\d{2}\/\d{2}\/\d{4}$/);
  const fa: FiltrosGestao = { aniversario: 0 };
  const la = filtrarFuncionariosGestao(PESSOAS_NOVACKI, fa, HOJE);
  assert.deepEqual(Object.keys(linhasParaPortal(la, fa)[0]).sort(), ["cargo", "completaAnos", "dataAdmissao", "diaMes", "filhos", "nome", "tempoDeCasa"]);
  assert.deepEqual(Object.keys(linhasParaRH(la, fa)[0]).sort(), ["cargo", "completaAnos", "dataAdmissao", "diaMes", "escolaridade", "filhos", "idade", "nome", "sexo", "tempoDeCasa"]);
});

// ── Banco em memória + rotas ─────────────────────────────────────────────────
const id = (x: number) => `${String(x).padStart(8, "0")}-0000-4000-8000-${String(x).padStart(12, "0")}`;
const UN1 = id(901), UN2 = id(902);
const CLI_N = id(1), CLI_X = id(2), CLI_S = id(3), CLI_I = id(4);
const U_SUP1 = id(101), U_SUP2 = id(102), U_SOCIO = id(103), U_ANALISTA = id(104), U_SEM_PERFIL = id(105);
const P_N = id(201), P_X = id(202), P_SEM = id(203), P_DOIS = id(204), P_SUSP = id(205), P_INTERNO = id(206);
const rhUser = (uid: string, role?: string) => ({ id: uid, email: `${uid}@teste.local`, app_metadata: role ? { role } : {} });

type Func = { id: string; cliente_id: string; status: string; nome_completo: string; cargo: string | null; data_admissao: string | null; admissao_id: string | null; unidade_id: string };
const funcsDe = (cli: string, un: string, base: number, pessoas: PessoaAtiva[]) => {
  const funcs: Func[] = [], dps: Record<string, unknown>[] = [], deps: Record<string, unknown>[] = [];
  pessoas.forEach((p, i) => {
    const adm = p.sexo || p.dataNascimento || p.grauInstrucao ? id(base * 100 + 5000 + i) : null;
    funcs.push({ id: id(base * 100 + 3000 + i), cliente_id: cli, status: "ativo", nome_completo: p.nome, cargo: p.cargo, data_admissao: p.dataAdmissao, admissao_id: adm, unidade_id: un });
    // filhos cadastrados na admissão, com os campos sensíveis que NUNCA podem sair (CPF, mãe, cartório) e um cônjuge, que não entra
    (p.filhos ?? []).forEach((fi, j) => deps.push({ id: id(base * 100 + 7000 + i * 10 + j), admissao_id: adm, nome: fi.nome, parentesco: j % 2 === 0 ? "filha" : "filho", data_nascimento: fi.dataNascimento, cpf: `CPFFILHO${base}${i}${j}`, nome_mae: `MAE${base}${i}${j}`, cpf_mae: `CPFMAE${base}${i}${j}`, cartorio: `CARTORIO${base}${i}${j}`, num_registro: `REG${base}${i}${j}` }));
    if (adm && i === 0) deps.push({ id: id(base * 100 + 7900), admissao_id: adm, nome: "Conjuge Teste", parentesco: "conjuge", data_nascimento: "1990-01-01", cpf: `CPFCONJ${base}`, nome_mae: null, cpf_mae: null, cartorio: null, num_registro: null });
    if (adm) dps.push({ admissao_id: adm, sexo: p.sexo, data_nascimento: p.dataNascimento, grau_instrucao: p.grauInstrucao, cpf: `${900 + i}.${base}11.222-33`, rg_numero: `RG${base}${700 + i}`, pis_pasep: `PIS${base}${600 + i}`, cor_raca: "parda", salario: 3000 });
  });
  return { funcs, dps, deps };
};
const PESSOAS_X: PessoaAtiva[] = [0, 1, 2].map((i) => ({ nome: `Outro ${i + 1}`, cargo: "Soldador", dataAdmissao: "2025-03-10", sexo: "F", dataNascimento: "1991-05-05", grauInstrucao: "superior_completo" }));
const PESSOAS_I: PessoaAtiva[] = [
  { nome: "=1+1", cargo: "=HYPERLINK(\"http://x\")", dataAdmissao: "2025-03-10", sexo: "M", dataNascimento: "1990-05-05", grauInstrucao: "medio_completo" },
  { nome: "+SUM(A1)", cargo: "-2+3", dataAdmissao: "2025-03-10", sexo: "F", dataNascimento: "1991-05-05", grauInstrucao: "medio_completo" },
  { nome: "@cmd", cargo: "Silva; João", dataAdmissao: "2025-03-10", sexo: "M", dataNascimento: "1992-05-05", grauInstrucao: "medio_completo" },
  { nome: "Normal", cargo: "Auxiliar", dataAdmissao: "2025-03-10", sexo: "F", dataNascimento: "1993-05-05", grauInstrucao: "medio_completo" },
];
const NOVACKI_NOME = "Novacki Indústria & Cia";
const ALL = [funcsDe(CLI_N, UN1, 1, PESSOAS_NOVACKI), funcsDe(CLI_X, UN2, 2, PESSOAS_X), funcsDe(CLI_I, UN1, 4, PESSOAS_I)];
const FUNCS: Func[] = [...ALL.flatMap((a) => a.funcs), { id: id(9999), cliente_id: CLI_N, status: "desligado", nome_completo: "Desligado Antigo", cargo: "Vigia", data_admissao: "2020-01-01", admissao_id: null, unidade_id: UN1 }];
const DPS = ALL.flatMap((a) => a.dps);
const DEPS = ALL.flatMap((a) => a.deps);
const IDS_PROIBIDOS = [...FUNCS.flatMap((f) => [f.id, f.admissao_id ?? ""]), CLI_N, CLI_X, CLI_S, CLI_I, UN1, UN2, ...[P_N, P_X, P_SEM, P_DOIS, P_SUSP, P_INTERNO, U_SUP1, U_SUP2, U_SOCIO, U_ANALISTA], ...DPS.flatMap((d) => [String(d.cpf), String(d.rg_numero), String(d.pis_pasep)]),
  // do filho: id, CPF, mãe, cartório, registro e a DATA DE NASCIMENTO exata (só a idade pode sair)
  ...DEPS.flatMap((d) => [String(d.id), String(d.cpf), String(d.cpf_mae ?? ""), String(d.nome_mae ?? ""), String(d.cartorio ?? ""), String(d.num_registro ?? ""), String(d.data_nascimento ?? "")])].filter(Boolean);
const CHAVES_PROIBIDAS = /"(funcionario_id|admissao_id|cliente_id|clienteId|id|cpf|rg_numero|pis_pasep|cor_raca|salario|endereco|unidade_id|data_nascimento|dataNascimento|nome_mae|cpf_mae|cartorio|num_registro|parentesco)"\s*:/i;

function novoDb() {
  const db = criarDb({
    clientes: [
      { id: CLI_N, nome: NOVACKI_NOME, unidade_id: UN1, ativo: true }, { id: CLI_X, nome: "Outra Unidade", unidade_id: UN2, ativo: true },
      { id: CLI_S, nome: "Suspensa", unidade_id: UN1, ativo: false }, { id: CLI_I, nome: "Injeção Ltda", unidade_id: UN1, ativo: true },
    ],
    cliente_usuarios: [
      { user_id: P_N, cliente_id: CLI_N }, { user_id: P_X, cliente_id: CLI_X }, { user_id: P_DOIS, cliente_id: CLI_N }, { user_id: P_DOIS, cliente_id: CLI_X }, { user_id: P_SUSP, cliente_id: CLI_S },
    ],
    funcionarios: FUNCS, admissao_dados_pessoais: DPS, admissao_dependentes: DEPS,
    analistas_perfil: [
      { id: id(301), user_id: U_SUP1, unidade_id: UN1, acesso_todas_unidades: false, nome_completo: "Supervisora Um", ativo: true },
      { id: id(302), user_id: U_SUP2, unidade_id: UN2, acesso_todas_unidades: false, nome_completo: "Supervisor Dois", ativo: true },
      { id: id(303), user_id: U_SOCIO, unidade_id: UN1, acesso_todas_unidades: true, nome_completo: "Sócio", ativo: true },
      { id: id(304), user_id: U_ANALISTA, unidade_id: UN1, acesso_todas_unidades: false, nome_completo: "Analista Sem Acesso", ativo: true },
    ],
    usuario_acesso_customizado: [], audit_logs: [],
  });
  (globalThis as unknown as { __DB__: unknown }).__DB__ = db;
  (globalThis as unknown as { __PENDENTES__: unknown[] }).__PENDENTES__ = [];
  return db as { usuario: unknown; usuarioPortal: unknown; audit_logs?: unknown; tabelas?: Record<string, Record<string, unknown>[]> };
}
const USUARIOS_RH: Record<string, ReturnType<typeof rhUser>> = { sup1: rhUser(U_SUP1, "supervisor"), sup2: rhUser(U_SUP2, "supervisor"), socio: rhUser(U_SOCIO, "diretoria"), analista: rhUser(U_ANALISTA, "analista") };
const usuarioPortal = (uid: string) => ({ id: uid, email: `${uid}@cliente.local` });

type Handler = (req: Request) => Promise<Response>;
interface Rotas { rhLista: Handler; rhExportar: Handler; portalLista: Handler }
const importar = async (arq: string) => ((await import(`../${arq}`)) as { POST: Handler }).POST;
const REAIS: Rotas = {
  rhLista: await importar("src/app/api/gestao-pessoas/lista/route.ts"),
  rhExportar: await importar("src/app/api/gestao-pessoas/exportar/route.ts"),
  portalLista: await importar("src/app/api/portal/gestao-pessoas/lista/route.ts"),
};
const req = (corpo: unknown) => new Request("http://localhost/api/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
async function chamar(h: Handler, corpo: unknown, sessao: { rh?: keyof typeof USUARIOS_RH | null; portal?: string | null }) {
  const db = novoDbAtual();
  db.usuario = sessao.rh ? USUARIOS_RH[sessao.rh] : null;
  db.usuarioPortal = sessao.portal ? usuarioPortal(sessao.portal) : null;
  const r = await h(req(corpo));
  await flush();
  return r;
}
let dbAtual = novoDb();
const novoDbAtual = () => dbAtual;
const reiniciar = () => { dbAtual = novoDb(); return dbAtual; };
// Response.text() descarta o BOM; para conferir o arquivo de verdade, decodifica os bytes mantendo o BOM.
const csvTexto = async (r: Response) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await r.arrayBuffer());
const json = async (r: Response) => (await r.json()) as { total: number; linhas: Record<string, unknown>[]; error?: string };

// Provas (retornam a falha ou null); as mesmas rodam nas rotas reais e nas sabotadas.
type Prova = { categoria: "isolamento" | "payload" | "csv"; roda: (r: Rotas) => Promise<string | null> };
const FORJADO = { filtros: {}, cliente_id: CLI_X, clienteId: CLI_X, empresa: "Outra Unidade", cliente: { id: CLI_X } };
const PROVAS: Prova[] = [
  { categoria: "isolamento", roda: async (r) => {
    reiniciar();
    const resp = await chamar(r.portalLista, FORJADO, { portal: P_N });
    if (resp.status !== 200) return `usuário do portal com corpo forjado recebeu ${resp.status}`;
    const j = await json(resp);
    return j.total === 29 && j.linhas.every((l) => String(l.nome).startsWith("Pessoa ")) ? null : `o portal listou ${j.total} (outra empresa entrou)`;
  } },
  { categoria: "isolamento", roda: async (r) => {
    reiniciar();
    for (const [rotulo, h] of [["lista", r.rhLista], ["exportar", r.rhExportar]] as const) {
      const resp = await chamar(h, { clienteId: CLI_X, filtros: {} }, { rh: "sup1" });
      if (resp.status !== 404) return `supervisor da unidade 1 ${rotulo} a empresa da unidade 2 e recebeu ${resp.status}`;
    }
    const ok2 = await chamar(r.rhLista, { clienteId: CLI_X, filtros: {} }, { rh: "sup2" });
    const okSocio = await chamar(r.rhLista, { clienteId: CLI_X, filtros: {} }, { rh: "socio" });
    return ok2.status === 200 && okSocio.status === 200 ? null : `supervisor da própria unidade/sócio não conseguiu listar (${ok2.status}/${okSocio.status})`;
  } },
  { categoria: "payload", roda: async (r) => {
    reiniciar();
    for (const [rotulo, resp, extra] of [
      ["portal", await chamar(r.portalLista, { filtros: { aniversario: 0 } }, { portal: P_N }), true],
      ["portal sem filtro", await chamar(r.portalLista, { filtros: {} }, { portal: P_N }), true],
      ["rh", await chamar(r.rhLista, { clienteId: CLI_N, filtros: {} }, { rh: "socio" }), false],
    ] as const) {
      const txt = await resp.text();
      const achado = IDS_PROIBIDOS.find((v) => txt.includes(v));
      if (achado) return `${rotulo}: a resposta contém o valor proibido ${achado.slice(0, 10)}…`;
      const chave = txt.match(CHAVES_PROIBIDAS);
      if (chave) return `${rotulo}: a resposta contém a chave ${chave[1]}`;
      if (extra && /"(sexo|idade|escolaridade)"\s*:|Masculino|Feminino|Fundamental|Médio|Superior|Pós-Graduação|Não informado/.test(txt)) return `${rotulo}: a resposta do portal traz sexo, idade ou escolaridade`;
    }
    return null;
  } },
  { categoria: "csv", roda: async (r) => {
    reiniciar();
    const analista = await chamar(r.rhExportar, { clienteId: CLI_N, filtros: {} }, { rh: "analista" });
    if (analista.status !== 403) return `papel sem acesso exportou (status ${analista.status})`;
    const semLogin = await chamar(r.rhExportar, { clienteId: CLI_N, filtros: {} }, { rh: null });
    if (semLogin.status !== 401) return `sem login exportou (status ${semLogin.status})`;
    const soPortal = await chamar(r.rhExportar, { clienteId: CLI_N, filtros: {} }, { rh: null, portal: P_N });
    return soPortal.status === 401 ? null : `usuário do portal exportou (status ${soPortal.status})`;
  } },
  { categoria: "csv", roda: async (r) => {
    reiniciar();
    const resp = await chamar(r.rhExportar, { clienteId: CLI_I, filtros: {} }, { rh: "socio" });
    if (resp.status !== 200) return `exportação da empresa de teste falhou (${resp.status})`;
    const celulas = (await resp.text()).replace(/^﻿/, "").split("\r\n").flatMap((l) => l.split(";"));
    const perigosa = celulas.find((c) => /^[=+\-@]/.test(c.replace(/^"/, "")));
    return perigosa ? `célula começa com fórmula: ${perigosa.slice(0, 15)}` : null;
  } },
];

await ok("rotas reais: todas as provas de isolamento, payload e CSV passam", async () => {
  for (const p of PROVAS) assert.equal(await p.roda(REAIS), null, p.categoria);
});

await ok("RH: a lista de cada elemento (sexo, faixa, escolaridade, cargo, cartões) vinda da ROTA tem o mesmo tamanho do gráfico; a ordem do tempo de casa vale na resposta", async () => {
  reiniciar();
  const pedir = async (filtros: FiltrosGestao) => json(await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros }, { rh: "sup1" }));
  assert.equal((await pedir({})).total, 29);
  assert.equal((await pedir({ sexo: "masculino" })).total, 19);
  assert.equal((await pedir({ sexo: "feminino" })).total, 8);
  assert.equal((await pedir({ sexo: "naoInformado" })).total, 2);
  assert.equal((await pedir({ admitidoNoMes: true })).total, 12);
  assert.equal((await pedir({ aniversario: 0 })).total, 4);
  for (const f of g.faixaPorSexo) assert.equal((await pedir({ faixa: f.faixa })).total, f.total, f.faixa);
  for (const e of g.escolaridade) assert.equal((await pedir({ escolaridade: e.grau })).total, e.total, e.grau);
  for (const c of limitarCargos(g.cargos, MAX_CARGOS_NO_GRAFICO)) assert.equal((await pedir({ cargo: c.cargo.startsWith("Demais") ? CARGO_DEMAIS : c.cargo })).total, c.total, c.cargo);
  assert.equal((await pedir({ sexo: "feminino", faixa: "21_30" })).total, g.faixaPorSexo.find((x) => x.faixa === "21_30")!.feminino);
  assert.equal((await pedir({ cargo: "Cargo que não existe" })).total, 0);
  const o = await pedir({ ordenarPorTempoDeCasa: true });
  assert.equal(o.linhas[o.linhas.length - 1].tempoDeCasa, "—");
  const rh = (await pedir({})).linhas[0];
  assert.deepEqual(Object.keys(rh).sort(), ["cargo", "dataAdmissao", "escolaridade", "filhos", "idade", "nome", "sexo", "tempoDeCasa"]);
});

await ok("RH: papel sem acesso (analista) e sem login são barrados; corpo inválido = 400; empresa inexistente = 404; desligado não entra", async () => {
  reiniciar();
  assert.equal((await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros: {} }, { rh: "analista" })).status, 403);
  assert.equal((await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros: {} }, { rh: null })).status, 401);
  assert.equal((await chamar(REAIS.rhLista, { filtros: {} }, { rh: "socio" })).status, 400, "sem empresa");
  assert.equal((await chamar(REAIS.rhLista, { clienteId: "nao-e-uuid", filtros: {} }, { rh: "socio" })).status, 400);
  assert.equal((await chamar(REAIS.rhLista, { clienteId: id(777), filtros: {} }, { rh: "socio" })).status, 404);
  assert.equal((await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros: { sexo: "outro" } }, { rh: "socio" })).status, 400);
  assert.equal((await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros: { aniversario: 12 } }, { rh: "socio" })).status, 400);
  const todos = await json(await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros: {} }, { rh: "socio" }));
  assert.ok(!todos.linhas.some((l) => l.nome === "Desligado Antigo"));
});

await ok("portal: lista só da empresa da sessão (corpo forjado ignorado) com 29 ativos; sem sexo/idade/escolaridade; aniversário traz dia/mês e 'completa N anos'", async () => {
  reiniciar();
  const r = await chamar(REAIS.portalLista, FORJADO, { portal: P_N });
  const j = await json(r);
  assert.equal(r.status, 200);
  assert.equal(j.total, 29);
  assert.deepEqual(Object.keys(j.linhas[0]).sort(), ["cargo", "dataAdmissao", "filhos", "nome", "tempoDeCasa"]);
  const a = await json(await chamar(REAIS.portalLista, { filtros: { aniversario: 0, sexo: "feminino" } }, { portal: P_N }));
  assert.ok(a.total >= 0 && a.linhas.every((l) => "diaMes" in l && "completaAnos" in l));
  const outro = await json(await chamar(REAIS.portalLista, { filtros: {} }, { portal: P_X }));
  assert.equal(outro.total, 3, "o usuário da outra empresa vê só as 3 pessoas dela");
});

await ok("portal: sem vínculo, sem sessão de portal, usuário INTERNO (só sessão do painel), cliente suspenso e vínculo duplo são barrados (nenhuma linha)", async () => {
  reiniciar();
  const casos: [string, { rh?: keyof typeof USUARIOS_RH | null; portal?: string | null }, number][] = [
    ["sem vínculo", { portal: P_SEM }, 403], ["sem sessão", {}, 401], ["interno do painel", { rh: "socio" }, 401], ["cliente suspenso", { portal: P_SUSP }, 403], ["dois vínculos", { portal: P_DOIS }, 403],
  ];
  for (const [nome, sessao, status] of casos) {
    const r = await chamar(REAIS.portalLista, { filtros: {} }, sessao);
    assert.equal(r.status, status, nome);
    assert.ok(!("linhas" in (await json(r))), `${nome}: sem linhas`);
  }
  assert.equal((await chamar(REAIS.portalLista, { filtros: { sexo: "x" } }, { portal: P_N })).status, 400);
});

// ── CSV ──────────────────────────────────────────────────────────────────────
await ok("CSV: ';' e BOM UTF-8, datas dd/mm/aaaa, fórmula neutralizada, quebra de linha CRLF, nome do arquivo e mesmas linhas da lista filtrada", async () => {
  reiniciar();
  const filtros: FiltrosGestao = { sexo: "feminino", faixa: "21_30" };
  const resp = await chamar(REAIS.rhExportar, { clienteId: CLI_N, filtros }, { rh: "socio" });
  assert.equal(resp.status, 200);
  assert.equal(resp.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(resp.headers.get("Content-Disposition"), 'attachment; filename="gestao-pessoas-novacki-industria-cia-18-11-2026.csv"');
  const bruto = await csvTexto(resp);
  assert.ok(bruto.startsWith("﻿"), "BOM");
  const linhas = bruto.slice(1).split("\r\n").filter(Boolean);
  assert.equal(linhas[0], "Nome;Cargo;Data de admissão;Tempo de casa;Idade;Sexo;Escolaridade;Filhos");
  const lista = await json(await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros }, { rh: "socio" }));
  assert.equal(linhas.length - 1, lista.total, "mesmo número de linhas da lista filtrada");
  assert.ok(linhas.slice(1).every((l) => /;\d{2}\/\d{2}\/\d{4};/.test(l) && !/\d{4}-\d{2}-\d{2}/.test(l)), "datas dd/mm/aaaa");
  assert.ok(linhas.slice(1).every((l) => l.split(";").length === 8 && l.includes(";Feminino;")));
  // com filtro de aniversariantes, as duas colunas extras
  const a = (await (await chamar(REAIS.rhExportar, { clienteId: CLI_N, filtros: { aniversario: 0 } }, { rh: "socio" })).text()).slice(1).split("\r\n");
  assert.ok(a[0].endsWith(";Aniversário;Completa (anos)"));
  assert.equal(a.filter(Boolean).length - 1, 4);
});

await ok("CSV: injeção de fórmula (= + - @) ganha apóstrofo; célula com ';' ou aspas é entre aspas; nome do arquivo sem acento e com a data de hoje de Brasília", async () => {
  reiniciar();
  const t = await csvTexto(await chamar(REAIS.rhExportar, { clienteId: CLI_I, filtros: {} }, { rh: "socio" }));
  for (const esperado of ["'=1+1;", "'+SUM(A1);", "'@cmd;", ";'-2+3;", '"\'=HYPERLINK(""http://x"")"', '"Silva; João"']) assert.ok(t.includes(esperado), `contém ${esperado}`);
  assert.equal(neutralizarFormula("=A1"), "'=A1");
  assert.equal(neutralizarFormula("Maria"), "Maria");
  assert.equal(nomeArquivoCsv("Açaí & Cia. Ltda", "2026-11-18"), "gestao-pessoas-acai-cia-ltda-18-11-2026.csv");
  assert.equal(nomeArquivoCsv("###", "2026-01-05"), "gestao-pessoas-empresa-05-01-2026.csv");
  const csv = montarCsvRH([{ nome: "Ana", cargo: null, dataAdmissao: "01/01/2026", tempoDeCasa: "1 mês", idade: null, sexo: "Feminino", escolaridade: "Não informado", filhos: "Sem filhos declarados" }], false);
  assert.equal(csv, "﻿Nome;Cargo;Data de admissão;Tempo de casa;Idade;Sexo;Escolaridade;Filhos\r\nAna;;01/01/2026;1 mês;;Feminino;Não informado;Sem filhos declarados\r\n");
});

await ok("CSV: bloqueado para papel sem acesso, sem login e para o portal (sem rota de exportação no portal); auditoria gravada com quem, empresa, quantidade e filtros", async () => {
  const db = reiniciar();
  for (const [rh, portal, status] of [["analista", null, 403], [null, null, 401], [null, P_N, 401]] as const) assert.equal((await chamar(REAIS.rhExportar, { clienteId: CLI_N, filtros: {} }, { rh, portal })).status, status);
  const sem = (db as unknown as { dados?: Record<string, unknown[]> }).dados;
  void sem;
  const antes = await auditoria();
  assert.equal(antes.length, 0, "nada foi registrado nas tentativas barradas");
  const filtros: FiltrosGestao = { sexo: "masculino", admitidoNoMes: true };
  const ok200 = await chamar(REAIS.rhExportar, { clienteId: CLI_N, filtros }, { rh: "sup1" });
  assert.equal(ok200.status, 200);
  const regs = await auditoria();
  assert.equal(regs.length, 1);
  const lista = await json(await chamar(REAIS.rhLista, { clienteId: CLI_N, filtros }, { rh: "sup1" }));
  assert.deepEqual([regs[0].acao, regs[0].entidade, regs[0].entidade_id, regs[0].usuario_id, regs[0].usuario_nome], ["exportar", "gestao_pessoas", CLI_N, U_SUP1, "Supervisora Um"]);
  assert.deepEqual(regs[0].detalhes, { empresa: NOVACKI_NOME, linhas: lista.total, filtros });
  // o portal não tem nenhuma rota de exportação
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  assert.deepEqual(walk("src/app/api/portal").filter((a) => /exportar|export|csv|xlsx/i.test(a)), []);
  assert.ok(!/csv|exportar/i.test(fonte("src/app/api/portal/gestao-pessoas/lista/route.ts").replace(/\/\/.*$/gm, "")), "a rota do portal não gera arquivo");
});
async function auditoria() {
  const { criarClienteServico } = await import("./harness-mot/memdb.mjs");
  const { data } = await criarClienteServico(dbAtual).from("audit_logs").select("*");
  return (data ?? []) as Record<string, unknown>[];
}

await ok("varredura: a rota do portal só lê filtros (sem clienteId/cliente_id do corpo), usa resolverClienteDoPortal e o RH usa o gate na ordem login → papel → unidade → corpo → empresa", () => {
  const portal = fonte("src/app/api/portal/gestao-pessoas/lista/route.ts");
  assert.ok(portal.includes("resolverClienteDoPortal()") && portal.includes("clienteId: r.clienteId, unidadeRH: null"));
  assert.ok(!/corpo\.data\.(clienteId|cliente_id)|body\.|searchParams|params/.test(portal));
  const rh = fonte("src/lib/gestaoPessoasRH.ts");
  const ordem = ["auth.getUser()", "checarPapelFuncionarios(user)", "contextoRH(user)", "ctx.todasUnidades ? null : ctx.unidadeId", "parseBody(gestaoPessoasListaRHSchema", "carregarPessoasAtivas("].map((t) => rh.indexOf(t));
  assert.ok(ordem.every((x) => x >= 0) && ordem.every((x, i) => i === 0 || x > ordem[i - 1]), `ordem do gate: ${ordem}`);
  for (const rota of ["lista", "exportar"]) assert.ok(fonte(`src/app/api/gestao-pessoas/${rota}/route.ts`).includes("prepararGestaoRH(request)"));
  assert.ok(fonte("src/lib/gestaoPessoas.ts").includes("export function ocorrenciaDeAniversario"), "a regra de aniversário é a mesma da lista de aniversariantes");
});

// ── Provas de falha ──────────────────────────────────────────────────────────
type Sabotagem = { nome: string; categoria: Prova["categoria"]; arquivos: { de: string; para: string; trocas: [string, string][] }[]; rotas: Partial<Record<keyof Rotas, string>> };
const SAB = "__sab";
const SABOTAGENS: Sabotagem[] = [
  { nome: "carregador sem o filtro de cliente_id (portal)", categoria: "isolamento", rotas: { portalLista: `src/app/api/portal/gestao-pessoas/lista/${SAB}1.ts` }, arquivos: [
    { de: "src/lib/gestaoPessoas.ts", para: `src/lib/${SAB}1_gestaoPessoas.ts`, trocas: [['.eq("cliente_id", o.clienteId).eq("status", "ativo")', '.eq("status", "ativo")']] },
    { de: "src/app/api/portal/gestao-pessoas/lista/route.ts", para: `src/app/api/portal/gestao-pessoas/lista/${SAB}1.ts`, trocas: [['"@/lib/gestaoPessoas"', `"@/lib/${SAB}1_gestaoPessoas"`]] },
  ] },
  { nome: "rota do portal que aceita o cliente_id do corpo", categoria: "isolamento", rotas: { portalLista: `src/app/api/portal/gestao-pessoas/lista/${SAB}2.ts` }, arquivos: [
    { de: "src/app/api/portal/gestao-pessoas/lista/route.ts", para: `src/app/api/portal/gestao-pessoas/lista/${SAB}2.ts`, trocas: [
      ["const corpo = parseBody(gestaoPessoasListaPortalSchema, await request.json().catch(() => null));", "const bruto = await request.json().catch(() => null);\n    const corpo = parseBody(gestaoPessoasListaPortalSchema, bruto);"],
      ["{ clienteId: r.clienteId, unidadeRH: null }", "{ clienteId: (bruto as { cliente_id?: string })?.cliente_id ?? r.clienteId, unidadeRH: null }"],
    ] },
  ] },
  { nome: "RH sem a checagem de unidade (lista e exportação da empresa de outra unidade)", categoria: "isolamento", rotas: { rhLista: `src/app/api/gestao-pessoas/lista/${SAB}3.ts`, rhExportar: `src/app/api/gestao-pessoas/exportar/${SAB}3.ts` }, arquivos: [
    { de: "src/lib/gestaoPessoasRH.ts", para: `src/lib/${SAB}3_gestaoPessoasRH.ts`, trocas: [["const unidadeRH = ctx.todasUnidades ? null : ctx.unidadeId;", "const unidadeRH = null;"]] },
    { de: "src/app/api/gestao-pessoas/lista/route.ts", para: `src/app/api/gestao-pessoas/lista/${SAB}3.ts`, trocas: [['"@/lib/gestaoPessoasRH"', `"@/lib/${SAB}3_gestaoPessoasRH"`]] },
    { de: "src/app/api/gestao-pessoas/exportar/route.ts", para: `src/app/api/gestao-pessoas/exportar/${SAB}3.ts`, trocas: [['"@/lib/gestaoPessoasRH"', `"@/lib/${SAB}3_gestaoPessoasRH"`]] },
  ] },
  { nome: "resposta do portal com o id do cliente", categoria: "payload", rotas: { portalLista: `src/app/api/portal/gestao-pessoas/lista/${SAB}4.ts` }, arquivos: [
    { de: "src/app/api/portal/gestao-pessoas/lista/route.ts", para: `src/app/api/portal/gestao-pessoas/lista/${SAB}4.ts`, trocas: [["NextResponse.json({ total: linhas.length, linhas: linhasParaPortal(linhas, filtros) }", "NextResponse.json({ total: linhas.length, cliente_id: r.clienteId, linhas: linhasParaPortal(linhas, filtros) }"]] },
  ] },
  { nome: "resposta do portal com sexo, idade e escolaridade (linhas do RH)", categoria: "payload", rotas: { portalLista: `src/app/api/portal/gestao-pessoas/lista/${SAB}5.ts` }, arquivos: [
    { de: "src/app/api/portal/gestao-pessoas/lista/route.ts", para: `src/app/api/portal/gestao-pessoas/lista/${SAB}5.ts`, trocas: [["linhasParaPortal(linhas, filtros)", "linhasParaRH(linhas, filtros)"], ["filtrarFuncionariosGestao, linhasParaPortal }", "filtrarFuncionariosGestao, linhasParaPortal, linhasParaRH }"]] },
  ] },
  { nome: "exportação sem a barreira de papel (qualquer analista exporta)", categoria: "csv", rotas: { rhExportar: `src/app/api/gestao-pessoas/exportar/${SAB}6.ts` }, arquivos: [
    { de: "src/lib/gestaoPessoasRH.ts", para: `src/lib/${SAB}6_gestaoPessoasRH.ts`, trocas: [["  const negado = await checarPapelFuncionarios(user);\n  if (negado) return negado;\n", ""], ['import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";\n', ""]] },
    { de: "src/app/api/gestao-pessoas/exportar/route.ts", para: `src/app/api/gestao-pessoas/exportar/${SAB}6.ts`, trocas: [['"@/lib/gestaoPessoasRH"', `"@/lib/${SAB}6_gestaoPessoasRH"`]] },
  ] },
  { nome: "CSV sem neutralizar fórmula", categoria: "csv", rotas: { rhExportar: `src/app/api/gestao-pessoas/exportar/${SAB}7.ts` }, arquivos: [
    { de: "src/lib/gestaoPessoasLista.ts", para: `src/lib/${SAB}7_gestaoPessoasLista.ts`, trocas: [["return /^[=+\\-@\\t\\r]/.test(valor) ? `'${valor}` : valor;", "return valor;"]] },
    { de: "src/app/api/gestao-pessoas/exportar/route.ts", para: `src/app/api/gestao-pessoas/exportar/${SAB}7.ts`, trocas: [['"@/lib/gestaoPessoasLista"', `"@/lib/${SAB}7_gestaoPessoasLista"`]] },
  ] },
];

await ok("provas de falha: cada rota sabotada (sem filtro de cliente_id, cliente do corpo, sem checagem de unidade, id no payload, sexo/idade no portal, CSV sem barreira, sem neutralizar fórmula) é reprovada; as reais passam", async () => {
  const criados: string[] = [];
  try {
    for (const s of SABOTAGENS) {
      for (const a of s.arquivos) {
        let t = fonte(a.de);
        for (const [de, para] of a.trocas) { assert.equal(t.split(de).length, 2, `âncora (${s.nome}): ${de.slice(0, 60)}`); t = t.replace(de, () => para); }
        fs.writeFileSync(a.para, t); criados.push(a.para);
      }
      const rotas: Rotas = { ...REAIS };
      for (const [k, arq] of Object.entries(s.rotas)) rotas[k as keyof Rotas] = await importar(arq!);
      const reprovadas: string[] = [];
      for (const p of PROVAS) { const f = await p.roda(rotas); if (f) reprovadas.push(`${p.categoria}: ${f}`); }
      const pega = reprovadas.find((r) => r.startsWith(s.categoria));
      assert.ok(pega, `a sabotagem "${s.nome}" NÃO foi pega (reprovou: ${JSON.stringify(reprovadas)})`);
      console.log(`   sabotagem pega — ${s.nome}: ${pega}`);
    }
    for (const p of PROVAS) assert.equal(await p.roda(REAIS), null, `as rotas reais reprovaram em ${p.categoria}`);
  } finally {
    for (const a of criados) fs.rmSync(a, { force: true });
  }
  for (const a of criados) assert.ok(!fs.existsSync(a), "arquivo de sabotagem removido");
});

console.log(`\n${n} verificações OK`);
