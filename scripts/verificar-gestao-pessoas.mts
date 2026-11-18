// Gestão de Pessoas (painel de RH): agregados dos funcionários ATIVOS de uma empresa, calculados na hora.
//  - funções puras: idade (limites 17/18/20/21/30/31/40/41), nulo, idade fora de 14-90, 29/02, virada de mês (UTC × Brasília), totais que fecham,
//    cargos agrupados, escolaridade com os 7 graus;
//  - carregador (memdb): só ativos, filtro por cliente_id, unidade restrita, cliente inexistente/inválido, só colunas permitidas, tempo real;
//  - provas de falha: o MESMO conjunto de verificações reprova carregadores sabotados (sem filtro de status, de unidade ou de cliente_id);
//  - acesso (papéis + ordem do gate na página), menu sem chave nova, e datas só em dd/mm/aaaa na tela.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-gestao-pessoas.mts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb, criarClienteServico } from "./harness-mot/memdb.mjs";
import {
  admitidoNoMes, agruparCargos, agruparEscolaridade, aniversariantesDoMes, aniversariantesPorMes, rotuloDoMes, carregarGestaoPessoas, classificarIdade, faixaEtaria, idadeNaData, limitarCargos,
  listarClientesComAtivos, mesesDeCasa, montarGestaoPessoas, normalizarCargo, type GestaoPessoas, type PessoaAtiva,
} from "../src/lib/gestaoPessoas";
import { podeAcessarFuncionarios } from "../src/lib/funcionariosAuth";
import GestaoPessoasClient from "../src/components/GestaoPessoasClient";

congelarData();
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");
const HOJE = "2026-11-18";

// ── Idade e faixas ───────────────────────────────────────────────────────────
await ok("idadeNaData e faixas nos limites 17/18/20/21/30/31/40/41 (no dia e no dia anterior ao aniversário)", () => {
  const casos: [string, number, string][] = [
    ["2009-11-18", 17, "abaixo_18"], ["2008-11-18", 18, "18_20"], ["2006-11-18", 20, "18_20"], ["2005-11-18", 21, "21_30"],
    ["1996-11-18", 30, "21_30"], ["1995-11-18", 31, "31_40"], ["1986-11-18", 40, "31_40"], ["1985-11-18", 41, "acima_40"],
  ];
  for (const [nasc, idade, faixa] of casos) {
    assert.equal(idadeNaData(nasc, HOJE), idade, nasc);
    assert.equal(faixaEtaria(idade), faixa, `faixa de ${idade}`);
    // um dia antes de completar: ainda a idade anterior
    const [a, m, d] = nasc.split("-");
    assert.equal(idadeNaData(`${a}-${m}-${String(Number(d) + 1).padStart(2, "0")}`, HOJE), idade - 1, `${nasc} +1 dia`);
  }
  assert.equal(faixaEtaria(null), "nao_informada");
});

await ok("nascimento nulo, vazio, inválido ou futuro = sem idade; idade fora de 14 a 90 = 'Idade não informada' + inconsistente (só preenchido)", () => {
  for (const v of [null, undefined, "", "   ", "1990-13-01", "1990-02-30", "abc", "18/11/1990", "2030-01-01"]) assert.equal(idadeNaData(v as never, HOJE), null, String(v));
  assert.deepEqual(classificarIdade(null, HOJE), { idade: null, faixa: "nao_informada", inconsistente: false }, "nulo não é inconsistente: só não informado");
  assert.deepEqual(classificarIdade("", HOJE), { idade: null, faixa: "nao_informada", inconsistente: false });
  assert.equal(classificarIdade("2026-05-01", HOJE).inconsistente, true, "idade 0");
  assert.equal(classificarIdade("2030-01-01", HOJE).inconsistente, true, "nascimento futuro");
  assert.equal(classificarIdade("1990-02-30", HOJE).inconsistente, true, "data inexistente");
  assert.equal(classificarIdade("2013-11-19", HOJE).idade, null, "13 anos");
  assert.equal(classificarIdade("2012-11-18", HOJE).idade, 14, "14 anos é o mínimo");
  assert.equal(classificarIdade("1936-11-18", HOJE).idade, 90, "90 anos é o máximo");
  assert.equal(classificarIdade("1935-11-18", HOJE).inconsistente, true, "91 anos");
  assert.equal(classificarIdade("2012-11-18", HOJE).faixa, "abaixo_18");
});

await ok("29/02: completa a idade em 01/03 nos anos comuns; aparece em 28/02 (exibindo '29/02') e em 29/02 nos bissextos", () => {
  assert.equal(idadeNaData("2000-02-29", "2027-02-28"), 26);
  assert.equal(idadeNaData("2000-02-29", "2027-03-01"), 27);
  assert.equal(idadeNaData("2000-02-29", "2028-02-29"), 28);
  assert.equal(idadeNaData("2000-02-29", "2028-02-28"), 27);
  const p = (nome: string, nasc: string): PessoaAtiva => ({ nome, cargo: "X", dataAdmissao: null, sexo: "F", dataNascimento: nasc, grauInstrucao: null });
  const pessoas = [p("Zeca", "1995-02-28"), p("Bia", "2000-02-29"), p("Ana", "1990-02-10"), p("Outra", "1990-03-01")];
  const comum = aniversariantesDoMes(pessoas, "2027-02-15");
  assert.deepEqual(comum.map((a) => [a.diaMes, a.ordem, a.nome, a.completaAnos]), [["10/02", 10, "Ana", 37], ["29/02", 28, "Bia", 27], ["28/02", 28, "Zeca", 32]], "29/02 vai para o dia 28 (ordem), exibindo 29/02; empate pelo nome");
  const bissexto = aniversariantesDoMes(pessoas, "2028-02-15");
  assert.deepEqual(bissexto.map((a) => [a.diaMes, a.ordem, a.nome]), [["10/02", 10, "Ana"], ["28/02", 28, "Zeca"], ["29/02", 29, "Bia"]]);
});

await ok("aniversariantes: só o mês de hoje, ordenados por dia, 'completa N anos', sem inconsistentes; cargo vazio vira null; mês sem ninguém = lista vazia", () => {
  const p = (nome: string, nasc: string | null, cargo: string | null = "Auxiliar"): PessoaAtiva => ({ nome, cargo, dataAdmissao: null, sexo: "M", dataNascimento: nasc, grauInstrucao: null });
  const pessoas = [p("C", "1990-11-30"), p("A", "1991-11-02", "  "), p("B", "1985-11-18"), p("D", "1990-12-01"), p("E", null), p("Bebê", "2026-11-05"), p("Futuro", "2031-11-05")];
  const r = aniversariantesDoMes(pessoas, HOJE);
  assert.deepEqual(r.map((a) => [a.diaMes, a.nome, a.completaAnos, a.cargo]), [["02/11", "A", 35, null], ["18/11", "B", 41, "Auxiliar"], ["30/11", "C", 36, "Auxiliar"]]);
  assert.deepEqual(aniversariantesDoMes(pessoas, "2026-01-10"), []);
  assert.ok(r.every((a) => /^\d{2}\/\d{2}$/.test(a.diaMes)), "só dd/mm");
});

// ── Mesmo resultado em UTC e em Brasília (virada de dia/mês perto da meia-noite) ──
const sonda = (tz: string, agora: string) => JSON.parse(execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/gestao-pessoas-sonda.mts"], { env: { ...process.env, TZ: tz, AGORA: agora, HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8" }));
await ok("virada de mês: 30/11 23:30 em Brasília (já é 01/12 em UTC) ainda é NOVEMBRO nos dois fusos; 28/02/2027 23:00 em Brasília lista o 29/02 do mês certo", () => {
  const novSP = sonda("America/Sao_Paulo", "2026-12-01T02:30:00Z"), novUTC = sonda("UTC", "2026-12-01T02:30:00Z");
  assert.deepEqual(novSP, novUTC, "igual em qualquer fuso da máquina");
  assert.equal(novSP.hoje, "2026-11-30");
  assert.deepEqual(novSP.aniversariantes, ["30/11|30|Edu|35"]);
  assert.equal(novSP.admitidoNoMes, true);
  const fevSP = sonda("America/Sao_Paulo", "2027-03-01T02:00:00Z"), fevUTC = sonda("UTC", "2027-03-01T02:00:00Z");
  assert.deepEqual(fevSP, fevUTC);
  assert.equal(fevSP.hoje, "2027-02-28");
  assert.deepEqual(fevSP.aniversariantes, ["29/02|28|Bia|27", "28/02|28|Cris|32"]);
  assert.equal(fevSP.idadeBia, 26, "ainda não completou: só em 01/03");
  const marSP = sonda("America/Sao_Paulo", "2027-03-01T05:00:00Z");
  assert.equal(marSP.hoje, "2027-03-01");
  assert.equal(marSP.idadeBia, 27);
  assert.deepEqual(marSP.aniversariantes, ["01/03|1|Dani|37"]);
});

await ok("tempo de casa e admitidos no mês: admissão futura não conta em nenhum dos dois; sem new Date em data pura", () => {
  assert.equal(mesesDeCasa("2026-11-18", HOJE), 0);
  assert.equal(mesesDeCasa("2026-10-18", HOJE), 1);
  assert.equal(mesesDeCasa("2026-05-19", HOJE), 6);
  assert.equal(mesesDeCasa("2026-11-19", HOJE), null, "amanhã");
  assert.equal(mesesDeCasa("2027-01-05", HOJE), null);
  assert.equal(mesesDeCasa(null, HOJE), null);
  assert.equal(mesesDeCasa("2026-02-30", HOJE), null);
  assert.equal(admitidoNoMes("2026-11-01", HOJE), true);
  assert.equal(admitidoNoMes("2026-11-18", HOJE), true);
  assert.equal(admitidoNoMes("2026-11-25", HOJE), false, "futura (mesmo mês)");
  assert.equal(admitidoNoMes("2026-10-31", HOJE), false);
  assert.equal(admitidoNoMes("2025-11-10", HOJE), false, "mesmo mês, outro ano");
  assert.ok(!/new Date\(/.test(fonte("src/lib/gestaoPessoas.ts").replace(/\/\/.*$/gm, "")), "a lib não usa new Date");
});

// ── Cargos e escolaridade ────────────────────────────────────────────────────
await ok("cargos: grafias diferentes (caixa, acento, espaços) viram um grupo; rótulo = grafia mais frequente (empate: ordem alfabética); vazio = 'Cargo não informado'", () => {
  assert.equal(normalizarCargo("  Auxiliar   de PRODUÇÃO "), "auxiliar de producao");
  const r = agruparCargos([
    "Auxiliar de produção", "Auxiliar de Produção", "Auxiliar de Produção", "auxiliar de  producao", "TRATADOR I", "Tratador I", "Tratador I", "Controlador de acesso", "Controlador de Acesso",
    null, "", "   ",
  ]);
  assert.deepEqual(r, [{ cargo: "Auxiliar de Produção", total: 4 }, { cargo: "Cargo não informado", total: 3 }, { cargo: "Tratador I", total: 3 }, { cargo: "Controlador de acesso", total: 2 }].sort((a, b) => b.total - a.total || a.cargo.localeCompare(b.cargo, "pt-BR")));
  assert.equal(r.reduce((s, c) => s + c.total, 0), 12, "nenhuma pessoa some");
});

await ok("escolaridade: os 7 graus da constraint (com pos_graduacao e os rótulos de admissaoConstants) + 'Não informado'; valor nulo ou fora da lista vai para 'Não informado'", () => {
  const r = agruparEscolaridade(["medio_completo", "medio_completo", "pos_graduacao", null, undefined, "doutorado", "superior_completo"]);
  assert.deepEqual(r.map((l) => l.grau), ["fundamental_incompleto", "fundamental_completo", "medio_incompleto", "medio_completo", "superior_incompleto", "superior_completo", "pos_graduacao", "nao_informado"]);
  assert.deepEqual(r.map((l) => l.total), [0, 0, 0, 2, 0, 1, 1, 3]);
  assert.equal(r.find((l) => l.grau === "pos_graduacao")!.rotulo, "Pós-Graduação");
  assert.equal(r.filter((l) => l.naoInformado).length, 1);
  assert.equal(r[7].rotulo, "Não informado");
});

await ok("limitarCargos: no máximo N barras, o resto vira 'Demais cargos (k)' e a soma continua fechando", () => {
  const cargos = Array.from({ length: 15 }, (_, i) => ({ cargo: `C${i}`, total: 15 - i }));
  const r = limitarCargos(cargos, 12);
  assert.equal(r.length, 12);
  assert.deepEqual(r[11], { cargo: "Demais cargos (4)", total: 4 + 3 + 2 + 1 });
  assert.equal(r.reduce((s, c) => s + c.total, 0), cargos.reduce((s, c) => s + c.total, 0));
  assert.equal(limitarCargos(cargos.slice(0, 5), 12).length, 5);
});

await ok("totais: cada gráfico (sexo, faixa × sexo, escolaridade, cargos) fecha com totalAtivos, inclusive com não informados e inconsistentes", () => {
  const pessoas: PessoaAtiva[] = [
    { nome: "A", cargo: "Auxiliar", dataAdmissao: "2026-11-02", sexo: "M", dataNascimento: "1990-11-18", grauInstrucao: "medio_completo" },
    { nome: "B", cargo: "auxiliar", dataAdmissao: "2026-05-02", sexo: "F", dataNascimento: "2005-01-01", grauInstrucao: "pos_graduacao" },
    { nome: "C", cargo: null, dataAdmissao: "2027-01-01", sexo: null, dataNascimento: null, grauInstrucao: null },
    { nome: "D", cargo: "Auxiliar", dataAdmissao: "2026-03-02", sexo: "F", dataNascimento: "2026-05-01", grauInstrucao: "xyz" },
    { nome: "E", cargo: "Motorista", dataAdmissao: null, sexo: "M", dataNascimento: "1960-06-06", grauInstrucao: "fundamental_completo" },
  ];
  const g = montarGestaoPessoas({ id: "c1", nome: "Cliente" }, pessoas, HOJE);
  assert.equal(g.totalAtivos, 5);
  assert.deepEqual(g.porSexo, { masculino: 2, feminino: 2, naoInformado: 1 });
  assert.equal(g.faixaPorSexo.reduce((s, f) => s + f.total, 0), 5);
  for (const f of g.faixaPorSexo) assert.equal(f.masculino + f.feminino + f.naoInformado, f.total, f.rotulo);
  assert.equal(g.faixaPorSexo.reduce((s, f) => s + f.masculino, 0), g.porSexo.masculino, "colunas por sexo fecham com o gráfico de sexo");
  assert.equal(g.faixaPorSexo.reduce((s, f) => s + f.feminino, 0), g.porSexo.feminino);
  assert.equal(g.faixaPorSexo.reduce((s, f) => s + f.naoInformado, 0), g.porSexo.naoInformado);
  assert.equal(g.escolaridade.reduce((s, e) => s + e.total, 0), 5);
  assert.equal(g.cargos.reduce((s, c) => s + c.total, 0), 5);
  assert.equal(g.dadosInconsistentes, 1, "só D (idade 0); C é nulo (não informado, não inconsistente)");
  assert.equal(g.faixaPorSexo.find((f) => f.faixa === "nao_informada")!.total, 2, "C (nulo) + D (inconsistente)");
  assert.equal(g.admitidosNoMes, 1, "A; C tem admissão futura");
  const mA = mesesDeCasa("2026-11-02", HOJE)!, mB = mesesDeCasa("2026-05-02", HOJE)!, mD = mesesDeCasa("2026-03-02", HOJE)!;
  assert.equal(g.tempoMedioDeCasaMeses, Math.round(((mA + mB + mD) / 3) * 10) / 10, "C (admissão futura) e E (sem data) não entram na média");
  assert.equal(g.poucosAtivos, false, "5 ativos: não é 'poucos'");
  assert.equal(montarGestaoPessoas({ id: "c1", nome: "C" }, pessoas.slice(0, 4), HOJE).poucosAtivos, true, "menos de 5");
  assert.equal(montarGestaoPessoas({ id: "c1", nome: "C" }, [], HOJE).poucosAtivos, false, "0 ativos = estado vazio, sem aviso de 'poucos'");
});

// ── Carregador (memdb) ───────────────────────────────────────────────────────
const U1 = "5b560689-559b-4b69-81c7-ecddb7431404", U2 = "6c671790-660c-5c7a-92d8-fdeec8542515";
const CA = "11111111-1111-4111-8111-111111111111", CB = "22222222-2222-4222-8222-222222222222", CC = "33333333-3333-4333-8333-333333333333", CD = "44444444-4444-4444-8444-444444444444";
const adm = (i: number) => `aaaaaaaa-0000-4000-8000-00000000000${i}`;
function banco() {
  return criarDb({
    clientes: [
      { id: CA, nome: "Alfa Indústria", unidade_id: U1, ativo: true }, { id: CB, nome: "Beta Serviços", unidade_id: U1, ativo: true },
      { id: CC, nome: "Gama SBC", unidade_id: U2, ativo: true }, { id: CD, nome: "Delta (só desligados)", unidade_id: U1, ativo: true },
    ],
    funcionarios: [
      { id: "f1", cliente_id: CA, unidade_id: U1, status: "ativo", nome_completo: "Ana", cargo: "Auxiliar de Produção", empresa: "Acme", data_admissao: "2026-05-01", admissao_id: adm(1) },
      { id: "f2", cliente_id: CA, unidade_id: U1, status: "ativo", nome_completo: "Bruno", cargo: "Auxiliar de produção", empresa: "Acme", data_admissao: "2026-11-03", admissao_id: adm(2) },
      { id: "f3", cliente_id: CA, unidade_id: U1, status: "ativo", nome_completo: "Carla", cargo: "Motorista", empresa: "Acme", data_admissao: "2026-02-10", admissao_id: null },
      { id: "f4", cliente_id: CA, unidade_id: U1, status: "desligado", nome_completo: "Dino", cargo: "Motorista", empresa: "Acme", data_admissao: "2025-01-10", admissao_id: adm(4) },
      { id: "f5", cliente_id: CB, unidade_id: U1, status: "ativo", nome_completo: "Eva", cargo: "Faxineira", empresa: "Acme", data_admissao: "2026-08-01", admissao_id: adm(5) },
      { id: "f6", cliente_id: CA, unidade_id: U2, status: "ativo", nome_completo: "Fábio", cargo: "Vigia", empresa: "Acme", data_admissao: "2026-09-01", admissao_id: null },
      { id: "f7", cliente_id: CC, unidade_id: U2, status: "ativo", nome_completo: "Gil", cargo: "Vigia", empresa: "Gama", data_admissao: "2026-09-01", admissao_id: null },
      { id: "f8", cliente_id: CD, unidade_id: U1, status: "desligado", nome_completo: "Hugo", cargo: "Vigia", empresa: "Delta", data_admissao: "2025-09-01", admissao_id: null },
    ],
    admissao_dados_pessoais: [
      { admissao_id: adm(1), sexo: "F", data_nascimento: "1990-11-20", grau_instrucao: "medio_completo", cpf: "000", cor_raca: "x", endereco_cidade: "y" },
      { admissao_id: adm(2), sexo: "M", data_nascimento: "2005-03-10", grau_instrucao: "superior_incompleto", cpf: "000", cor_raca: "x", endereco_cidade: "y" },
      { admissao_id: adm(4), sexo: "M", data_nascimento: "1970-01-01", grau_instrucao: "pos_graduacao", cpf: "000", cor_raca: "x", endereco_cidade: "y" },
      { admissao_id: adm(5), sexo: "F", data_nascimento: "1985-12-12", grau_instrucao: "fundamental_completo", cpf: "000", cor_raca: "x", endereco_cidade: "y" },
    ],
  });
}
const svcDe = (db: any) => criarClienteServico(db);

// As verificações do carregador, reutilizáveis: com o carregador certo passam; com um sabotado, DEVEM falhar (prova de que protegem de verdade).
async function verificarCarregador(svc: any) {
  const a = await carregarGestaoPessoas(svc, { clienteId: CA, unidadeRH: U1, hojeISO: HOJE });
  assert.ok(a, "cliente da unidade carrega");
  assert.equal(a!.totalAtivos, 3, "só ATIVOS (o desligado f4 fica de fora) e só da unidade do RH (f6, de outra unidade, fica de fora)");
  assert.deepEqual(a!.porSexo, { masculino: 1, feminino: 1, naoInformado: 1 }, "f3 não tem admissão: não informado");
  assert.equal(a!.cliente.nome, "Alfa Indústria");
  const b = await carregarGestaoPessoas(svc, { clienteId: CB, unidadeRH: U1, hojeISO: HOJE });
  assert.equal(b!.totalAtivos, 1, "o filtro é cliente_id: f1..f3 têm o MESMO texto de empresa ('Acme') e não entram no cliente B");
  assert.equal(await carregarGestaoPessoas(svc, { clienteId: CC, unidadeRH: U1, hojeISO: HOJE }), null, "cliente de outra unidade: null (404)");
  const socio = await carregarGestaoPessoas(svc, { clienteId: CA, unidadeRH: null, hojeISO: HOJE });
  assert.equal(socio!.totalAtivos, 4, "sócio (todas as unidades) vê f6 também");
  assert.equal((await carregarGestaoPessoas(svc, { clienteId: CC, unidadeRH: null, hojeISO: HOJE }))!.totalAtivos, 1);
  assert.equal((await carregarGestaoPessoas(svc, { clienteId: CD, unidadeRH: U1, hojeISO: HOJE }))!.totalAtivos, 0, "só desligados = 0 ativos");
}

await ok("carregador: só ativos, filtro por cliente_id (não pelo texto da empresa), unidade restrita não vê cliente de outra unidade, sócio vê tudo", async () => {
  await verificarCarregador(svcDe(banco()));
});

await ok("carregador: cliente_id inválido (não é uuid) ou inexistente devolve null (a página responde 404)", async () => {
  const svc = svcDe(banco());
  for (const id of ["", "abc", "123", "' or 1=1 --", "11111111-1111-4111-8111-11111111111", "99999999-9999-4999-8999-999999999999"]) assert.equal(await carregarGestaoPessoas(svc, { clienteId: id, unidadeRH: null, hojeISO: HOJE }), null, id);
});

await ok("carregador: só seleciona as colunas necessárias (nunca CPF, cor/raça, endereço, RG nem salário) e a página nunca recebe esses campos", async () => {
  const db = banco();
  const log: { tabela: string; cols: string }[] = [];
  const svc = { from: (t: string) => { const q = svcDe(db).from(t); const sel = q.select.bind(q); q.select = (cols: string, ...r: unknown[]) => { log.push({ tabela: t, cols }); return sel(cols, ...r); }; return q; } };
  const g = await carregarGestaoPessoas(svc, { clienteId: CA, unidadeRH: U1, hojeISO: HOJE });
  assert.ok(log.length >= 3);
  for (const { tabela, cols } of log) assert.ok(!/cpf|cor_raca|endereco|rg_|salario|banco|estado_civil|\*/.test(cols), `${tabela}: ${cols}`);
  const texto = JSON.stringify(g);
  assert.ok(!/cpf|cor_raca|endereco|salario|rg_numero/i.test(texto) && !texto.includes("000"), "nada sensível nos agregados");
  assert.ok(!texto.includes("1990-11-20") && !texto.includes("2005-03-10"), "nenhuma data de nascimento completa no retorno (só dd/mm dos aniversariantes)");
});

await ok("seletor: só clientes ATIVOS da unidade permitida que TÊM funcionário ativo, em ordem de nome", async () => {
  const svc = svcDe(banco());
  assert.deepEqual((await listarClientesComAtivos(svc, { unidadeRH: U1 })).map((c) => c.nome), ["Alfa Indústria", "Beta Serviços"], "Delta (só desligados) e Gama (outra unidade) ficam de fora");
  assert.deepEqual((await listarClientesComAtivos(svc, { unidadeRH: null })).map((c) => c.nome), ["Alfa Indústria", "Beta Serviços", "Gama SBC"]);
  const db = banco(); db.tabelas.clientes.find((c: any) => c.id === CB).ativo = false;
  assert.deepEqual((await listarClientesComAtivos(svcDe(db), { unidadeRH: U1 })).map((c) => c.nome), ["Alfa Indústria"], "cliente inativo não aparece");
});

await ok("tempo real: completar sexo e nascimento de quem estava 'não informado' muda a página na próxima abertura (sem cache)", async () => {
  const db = banco();
  const antes = await carregarGestaoPessoas(svcDe(db), { clienteId: CA, unidadeRH: U1, hojeISO: HOJE });
  assert.deepEqual(antes!.porSexo, { masculino: 1, feminino: 1, naoInformado: 1 });
  db.tabelas.funcionarios.find((f: any) => f.id === "f3").admissao_id = adm(9);
  db.tabelas.admissao_dados_pessoais.push({ admissao_id: adm(9), sexo: "M", data_nascimento: "1980-11-02", grau_instrucao: "medio_incompleto" });
  const depois = await carregarGestaoPessoas(svcDe(db), { clienteId: CA, unidadeRH: U1, hojeISO: HOJE });
  assert.deepEqual(depois!.porSexo, { masculino: 2, feminino: 1, naoInformado: 0 });
  assert.equal(depois!.faixaPorSexo.find((f) => f.faixa === "nao_informada")!.total, 0);
  assert.deepEqual(depois!.aniversariantesPorMes[0].aniversariantes.map((a) => [a.diaMes, a.nome, a.completaAnos]), [["02/11", "Carla", 46], ["20/11", "Ana", 36]]);
});

// ── Provas de falha: os mesmos testes reprovam carregadores errados ──
function sabotar(svc: any, coluna: string) {
  const envolver = (q: any): any => new Proxy(q, {
    get(alvo, prop) {
      if (prop === "eq") return (col: string, val: unknown) => { if (col !== coluna) alvo.eq(col, val); return envolver(alvo); };
      const v = alvo[prop];
      return typeof v === "function" ? (...a: unknown[]) => { const r = v.apply(alvo, a); return r === alvo ? envolver(alvo) : r; } : v;
    },
  });
  return { from: (t: string) => envolver(svc.from(t)) };
}
await ok("PROVA DE FALHA: sem o filtro de status ('só ativos'), sem o de unidade ou sem o de cliente_id, as verificações do carregador REPROVAM", async () => {
  await verificarCarregador(svcDe(banco())); // o certo passa
  for (const coluna of ["status", "unidade_id", "cliente_id"]) {
    await assert.rejects(() => verificarCarregador(sabotar(svcDe(banco()), coluna)), `sem o filtro de ${coluna} a verificação deveria falhar`);
  }
});

// ── Acesso, menu e página ────────────────────────────────────────────────────
await ok("acesso: o mesmo gate do módulo Funcionários — superuser, diretoria, supervisor e dp entram; analista e outros papéis são negados", async () => {
  (globalThis as any).__DB__ = criarDb({ usuario_acesso_customizado: [] });
  for (const role of ["superuser", "diretoria", "supervisor", "dp"]) assert.equal(await podeAcessarFuncionarios({ id: "u", app_metadata: { role } } as never), true, role);
  for (const role of ["analista", "comercial", "cliente", undefined]) assert.equal(await podeAcessarFuncionarios({ id: "u", app_metadata: role ? { role } : {} } as never), false, String(role));
});

await ok("página: ordem do gate no servidor (login → podeAcessarFuncionarios → contextoRH → unidade → carregamento → 404), sem confiar no navegador", () => {
  const p = fonte("src/app/painel/gestao-pessoas/page.tsx");
  const ordem = ["redirect(\"/login\")", "podeAcessarFuncionarios(user)", "contextoRH(user)", "ctxRH.todasUnidades ? null : ctxRH.unidadeId", "listarClientesComAtivos(svc", "carregarGestaoPessoas(svc", "notFound()"].map((t) => p.indexOf(t));
  assert.ok(ordem.every((i) => i > 0) && ordem.every((v, i) => i === 0 || v > ordem[i - 1]), JSON.stringify(ordem));
  assert.ok(p.includes('redirect("/painel")') && p.includes("<SemAcessoPainel />"));
  assert.ok(p.includes("unidadeRH }") && p.includes("hojeISO: formatarDataISO(obterDataHojeBrasil())"), "o 'hoje' é o de Brasília");
  assert.ok(!/searchParams[^;]*unidade/i.test(p), "o navegador só informa a empresa, nunca a unidade");
  assert.ok(fonte("src/app/painel/gestao-pessoas/loading.tsx").includes("Carregando Gestão de Pessoas"));
});

await ok("menu: item 'Gestão de Pessoas' no grupo RH com requireFuncionarios e SEM chave nova de acesso", () => {
  const m = fonte("src/components/SidebarMenu.tsx");
  assert.ok(m.includes('{ label: "Gestão de Pessoas", href: "/painel/gestao-pessoas", icon: PieChart, requireFuncionarios: true },'));
  const rh = m.slice(m.indexOf('label: "RH"'), m.indexOf('label: "Financeiro"'));
  assert.ok(rh.includes("Gestão de Pessoas"));
  for (const arq of ["src/lib/abasConfig.ts", "src/lib/regraPadraoPorPapel.ts"]) assert.ok(!/gestao_pessoas|gestaoPessoas/.test(fonte(arq)), `${arq} não ganhou chave nova`);
});

// ── Tela: datas dd/mm/aaaa, avisos e estados ─────────────────────────────────
const g: GestaoPessoas = montarGestaoPessoas({ id: CA, nome: "Alfa Indústria" }, [
  { nome: "Ana", cargo: "Auxiliar de Produção", dataAdmissao: "2026-05-01", sexo: "F", dataNascimento: "1990-11-20", grauInstrucao: "medio_completo" },
  { nome: "Bia", cargo: "Motorista", dataAdmissao: "2026-02-10", sexo: "F", dataNascimento: "2000-02-29", grauInstrucao: "pos_graduacao" },
  { nome: "Bebê", cargo: "Vigia", dataAdmissao: "2026-11-02", sexo: "F", dataNascimento: "2026-05-01", grauInstrucao: null },
], HOJE);
const tela = (props: Partial<Parameters<typeof GestaoPessoasClient>[0]> = {}) => renderToStaticMarkup(createElement(GestaoPessoasClient, { clientes: [{ id: CA, nome: "Alfa Indústria" }], selecionadoId: CA, dados: g, ...props }));
await ok("tela: aniversariantes em dd/mm, nada de data em ISO, avisos de poucos ativos (< 5) e de dado inconsistente (só a quantidade, sem nome)", () => {
  const html = tela();
  assert.ok(html.includes("20/11") && html.includes("completa 36 anos"), "aniversariante de novembro em dd/mm");
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html), "nenhuma data em ISO na tela");
  assert.ok(html.includes("Agregado de poucas pessoas, uso interno do RH"), "3 ativos = poucos");
  assert.ok(html.includes("1 cadastro com data de nascimento inconsistente") && !html.includes("Bebê"), "só a contagem, sem o nome da pessoa");
  assert.ok(html.includes("Gestão de Pessoas") && html.includes("Funcionários ativos") && html.includes("Admitidos no mês") && html.includes("Tempo médio de casa") && html.includes("Aniversariantes de novembro"));
  for (const t of ["Distribuição por sexo", "Faixa etária por sexo", "Grau de escolaridade", "Cargos", "Aniversariantes de novembro", "Idade não informada", "Abaixo de 18", "Acima de 40"]) assert.ok(html.includes(t), t);
  assert.ok(!/cor\/raça|cpf|salário|endereço/i.test(html), "nada de cor/raça, CPF, salário nem endereço");
  const total = html.match(/<td[^>]*>Total<\/td>(?:<td[^>]*>\d+<\/td>){4}/);
  assert.ok(total, "linha Total da tabela de faixa etária");
  const muitos = montarGestaoPessoas({ id: CA, nome: "Alfa" }, Array.from({ length: 5 }, (_, i) => ({ nome: `P${i}`, cargo: "X", dataAdmissao: null, sexo: "M", dataNascimento: null, grauInstrucao: null })), HOJE);
  assert.ok(!tela({ dados: muitos }).includes("Agregado de poucas pessoas"), "5 ativos: sem o aviso");
});

await ok("tela: estados vazio (empresa sem ativos / nenhuma empresa / nada escolhido) e seletor com as empresas", () => {
  const vazio = montarGestaoPessoas({ id: CD, nome: "Delta" }, [], HOJE);
  assert.ok(tela({ dados: vazio, selecionadoId: CD }).includes("Delta não tem funcionários ativos no momento."));
  assert.ok(tela({ dados: null, selecionadoId: null }).includes("Escolha uma empresa para ver as pessoas dela"));
  assert.ok(tela({ dados: null, selecionadoId: null, clientes: [] }).includes("Nenhuma empresa com funcionários ativos."));
  const html = tela();
  assert.ok(html.includes("Escolha uma empresa…") && html.includes("Alfa Indústria") && html.includes('aria-label="Empresa"'));
});


// ── Aniversariantes dos 12 meses (filtro de mês) ─────────────────────────────
const pp = (nome: string, nasc: string | null, cargo: string | null = "Auxiliar"): PessoaAtiva => ({ nome, cargo, dataAdmissao: null, sexo: "M", dataNascimento: nasc, grauInstrucao: null });
const lista = (r: ReturnType<typeof aniversariantesPorMes>, k: number) => r[k].aniversariantes.map((a) => [a.diaMes, a.nome, a.completaAnos]);

await ok("12 meses: começam no mês corrente e vão até o mesmo mês do ano seguinte menos um; rótulo traz o ano só nos meses do ano seguinte", () => {
  const r = aniversariantesPorMes([], HOJE);
  assert.equal(r.length, 12);
  assert.deepEqual(r.map((m) => m.rotulo), ["novembro", "dezembro", "janeiro de 2027", "fevereiro de 2027", "março de 2027", "abril de 2027", "maio de 2027", "junho de 2027", "julho de 2027", "agosto de 2027", "setembro de 2027", "outubro de 2027"]);
  assert.deepEqual(r.map((m) => [m.mes, m.ano]).slice(0, 4), [[11, 2026], [12, 2026], [1, 2027], [2, 2027]]);
  assert.equal(r[0].mes, 11, "abre no mês corrente (hoje de Brasília)");
  const janeiro = aniversariantesPorMes([], "2026-01-10");
  assert.deepEqual(janeiro.map((m) => m.rotulo), ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"], "em janeiro todos são do ano corrente");
  assert.equal(rotuloDoMes(12, 2026, 2026), "dezembro");
  assert.equal(rotuloDoMes(1, 2027, 2026), "janeiro de 2027");
});

await ok("'completa N anos' é o da PRÓXIMA ocorrência: mês já passado neste ano vira o ano seguinte; o mês corrente mantém quem já fez aniversário (idade que completou)", () => {
  const r = aniversariantesPorMes([pp("Corrente", "1990-11-02"), pp("Dez", "1990-12-20"), pp("Jan", "1990-01-15"), pp("Mar", "1990-03-05"), pp("Out", "1990-10-31")], HOJE);
  assert.deepEqual(lista(r, 0), [["02/11", "Corrente", 36]], "2 de novembro já passou, continua listado com a idade que completou (2026 − 1990)");
  assert.deepEqual(lista(r, 1), [["20/12", "Dez", 36]]);
  assert.deepEqual(lista(r, 2), [["15/01", "Jan", 37]], "janeiro de 2027: 2027 − 1990");
  assert.deepEqual(lista(r, 4), [["05/03", "Mar", 37]]);
  assert.deepEqual(lista(r, 11), [["31/10", "Out", 37]], "outubro já passou neste ano: vira outubro de 2027");
  assert.equal(r[11].rotulo, "outubro de 2027");
});

await ok("virada de ano (dezembro → janeiro): a lista de janeiro é do ano seguinte e o último mês é novembro do ano seguinte", () => {
  const r = aniversariantesPorMes([pp("Jan", "1990-01-15"), pp("Dez", "1985-12-30"), pp("Nov", "2000-11-01")], "2026-12-10");
  assert.deepEqual(r.map((m) => m.rotulo).slice(0, 3), ["dezembro", "janeiro de 2027", "fevereiro de 2027"]);
  assert.equal(r[11].rotulo, "novembro de 2027");
  assert.deepEqual(lista(r, 0), [["30/12", "Dez", 41]]);
  assert.deepEqual(lista(r, 1), [["15/01", "Jan", 37]]);
  assert.deepEqual(lista(r, 11), [["01/11", "Nov", 27]], "novembro já passou: 2027 − 2000");
});

await ok("29/02: em ano comum aparece no dia 28 exibindo '29/02'; quando a próxima ocorrência cai em ano bissexto fica no dia 29 e completa a idade daquele ano", () => {
  const pessoas = [pp("Bia", "2000-02-29"), pp("Cris", "1995-02-28"), pp("Dani", "1996-02-29")];
  const comum = aniversariantesPorMes(pessoas, "2027-01-20")[1];
  assert.equal(comum.rotulo, "fevereiro");
  assert.deepEqual(comum.aniversariantes.map((a) => [a.diaMes, a.ordem, a.nome, a.completaAnos]), [["29/02", 28, "Bia", 27], ["28/02", 28, "Cris", 32], ["29/02", 28, "Dani", 31]]);
  const proximoBissexto = aniversariantesPorMes(pessoas, "2027-11-18")[3];
  assert.equal(proximoBissexto.rotulo, "fevereiro de 2028");
  assert.deepEqual(proximoBissexto.aniversariantes.map((a) => [a.diaMes, a.ordem, a.nome, a.completaAnos]), [["28/02", 28, "Cris", 33], ["29/02", 29, "Bia", 28], ["29/02", 29, "Dani", 32]], "2028 é bissexto: 29/02 fica no dia 29");
  assert.deepEqual(aniversariantesPorMes(pessoas, "2028-02-15")[0].aniversariantes.map((a) => a.ordem), [28, 29, 29]);
});

await ok("as 12 listas somam EXATAMENTE os ativos com nascimento plausível (cada pessoa em um só mês); inconsistente, nulo e futuro ficam fora de todas", () => {
  const pessoas = [
    pp("P1", "1990-01-10"), pp("P2", "1991-02-11"), pp("P3", "1992-03-12"), pp("P4", "1993-04-13"), pp("P5", "1994-05-14"), pp("P6", "1995-06-15"),
    pp("P7", "1996-07-16"), pp("P8", "1997-08-17"), pp("P9", "1998-09-18"), pp("P10", "1999-10-19"), pp("P11", "2000-11-20"), pp("P12", "2001-12-21"),
    pp("P13", "2000-02-29"), pp("P14", "2012-11-18"), pp("P15", "1936-11-18"),
    pp("Bebê", "2026-05-01"), pp("Treze", "2013-11-19"), pp("Noventa e um", "1935-11-18"), pp("Futuro", "2030-01-01"), pp("Inexistente", "1990-02-30"), pp("Nulo", null), pp("Vazio", ""),
  ];
  const plausiveis = pessoas.filter((p) => classificarIdade(p.dataNascimento, HOJE).idade !== null).map((p) => p.nome);
  assert.equal(plausiveis.length, 15);
  const r = aniversariantesPorMes(pessoas, HOJE);
  const todos = r.flatMap((m) => m.aniversariantes.map((a) => a.nome));
  assert.equal(todos.length, 15, "soma das 12 listas");
  assert.deepEqual([...todos].sort(), [...plausiveis].sort());
  assert.equal(new Set(todos).size, todos.length, "ninguém aparece em dois meses");
  for (const fora of ["Bebê", "Treze", "Noventa e um", "Futuro", "Inexistente", "Nulo", "Vazio"]) assert.ok(!todos.includes(fora), fora);
  const g = montarGestaoPessoas({ id: "c", nome: "C" }, pessoas, HOJE);
  assert.equal(g.aniversariantesPorMes.reduce((s, m) => s + m.aniversariantes.length, 0), 15);
  assert.equal(g.faixaPorSexo.filter((f) => f.faixa !== "nao_informada").reduce((s, f) => s + f.total, 0), 15, "mesma regra de plausibilidade das faixas etárias");
  assert.equal(aniversariantesDoMes(pessoas, HOJE).length, r[0].aniversariantes.length, "aniversariantesDoMes = o primeiro dos 12");
});

await ok("virada de ano em UTC e em Brasília: 31/12 às 23h30 de Brasília (já é 01/01 em UTC) abre em DEZEMBRO e a lista de janeiro é a do ano seguinte; igual nos dois fusos", () => {
  const dezSP = sonda("America/Sao_Paulo", "2027-01-01T02:30:00Z"), dezUTC = sonda("UTC", "2027-01-01T02:30:00Z");
  assert.deepEqual(dezSP, dezUTC);
  assert.equal(dezSP.hoje, "2026-12-31");
  assert.deepEqual(dezSP.rotulosDosMeses.slice(0, 3), ["dezembro", "janeiro de 2027", "fevereiro de 2027"]);
  assert.equal(dezSP.rotulosDosMeses[11], "novembro de 2027");
  assert.ok(dezSP.meses.includes("dezembro=01/12|1|Flavia|34,31/12|31|Gil|46"), "dezembro de 2026: 2026 − 1992 e 2026 − 1980");
  assert.ok(dezSP.meses.includes("novembro de 2027=30/11|30|Edu|36"), "novembro já passou: vira novembro de 2027 (2027 − 1991)");
  const janSP = sonda("America/Sao_Paulo", "2027-01-01T05:00:00Z"), janUTC = sonda("UTC", "2027-01-01T05:00:00Z");
  assert.deepEqual(janSP, janUTC);
  assert.equal(janSP.hoje, "2027-01-01");
  assert.equal(janSP.rotulosDosMeses[0], "janeiro", "já é janeiro de 2027: sem sufixo de ano");
  assert.equal(janSP.rotulosDosMeses[11], "dezembro");
  const fevSP = sonda("America/Sao_Paulo", "2027-03-01T02:00:00Z"), fevUTC = sonda("UTC", "2027-03-01T02:00:00Z");
  assert.deepEqual(fevSP, fevUTC);
  assert.equal(fevSP.rotulosDosMeses[0], "fevereiro", "28/02 às 23h em Brasília ainda é fevereiro");
});

const tela2 = (indiceMesInicial: number, pessoas: PessoaAtiva[] = [pp("Ana", "1990-11-20"), pp("Bia", "2000-02-29"), pp("Caio", "1988-01-15", "Motorista")]) =>
  renderToStaticMarkup(createElement(GestaoPessoasClient, { clientes: [{ id: CA, nome: "Alfa" }], selecionadoId: CA, dados: montarGestaoPessoas({ id: CA, nome: "Alfa" }, pessoas, HOJE), indiceMesInicial }));
await ok("tela: abre no mês corrente; cartão e lista seguem o mês escolhido; seletor com os 12 meses (ano nos do ano seguinte); mês vazio; acessível; sem ISO", () => {
  const padrao = tela2(0);
  assert.ok(padrao.includes("Aniversariantes de novembro") && padrao.includes("20/11") && padrao.includes("completa 36 anos"), "mês corrente por padrão");
  assert.ok(padrao.includes("mês atual"));
  assert.ok(/<option value="0" selected[^>]*>novembro<\/option>/.test(padrao), "a opção do mês corrente vem selecionada");
  for (const rotulo of ["novembro", "dezembro", "janeiro de 2027", "fevereiro de 2027", "outubro de 2027"]) assert.ok(padrao.includes(`>${rotulo}</option>`), rotulo);
  assert.equal((padrao.match(/<option value="\d+"/g) ?? []).length, 12, "12 opções de mês (o seletor de empresa usa value de uuid)");
  assert.ok(padrao.includes('<label for="mes-aniversariantes"') && padrao.includes('<select id="mes-aniversariantes"'), "rótulo associado ao select: acessível por teclado e leitor de tela");
  assert.equal((padrao.match(/id="mes-aniversariantes"/g) ?? []).length, 1, "um único seletor de mês (a lista não tem outro)");
  // o seletor está DENTRO do cartão "Aniversariantes de {mês}" e a lista (seção abaixo) só segue o mês escolhido
  const cartao = padrao.slice(padrao.indexOf("Aniversariantes de novembro"), padrao.indexOf("Distribuição por sexo"));
  assert.ok(cartao.includes('<select id="mes-aniversariantes"') && cartao.includes("mês atual"), "seletor dentro do cartão");
  const secaoLista = padrao.slice(padrao.indexOf("<section", padrao.indexOf("Grau de escolaridade")));
  const aposCartao = padrao.slice(padrao.indexOf("Distribuição por sexo"));
  assert.ok(!aposCartao.includes("<select"), "nenhum seletor depois do cartão (a lista não tem o seu)");
  assert.ok(secaoLista.includes("Aniversariantes de novembro"), "o título da lista segue o mês escolhido");
  const jan = tela2(2);
  assert.ok(jan.includes("Aniversariantes de janeiro de 2027") && jan.includes("15/01") && jan.includes("completa 39 anos") && !jan.includes("20/11"), "o cartão e a lista seguem o mês escolhido, com a idade do ano seguinte");
  assert.ok(!jan.includes("escolha o mês na lista abaixo") && !jan.includes("mês atual"), "sem a antiga mensagem; 'mês atual' só no mês corrente");
  const vazio = tela2(3);
  assert.ok(vazio.includes("Nenhum aniversariante em fevereiro de 2027.") === false, "fevereiro de 2027 tem a Bia (29/02 no dia 28)");
  const mesVazio = tela2(5);
  assert.ok(mesVazio.includes("Nenhum aniversariante em abril de 2027."), "mês sem ninguém");
  assert.ok(mesVazio.includes("Aniversariantes de abril de 2027"), "o rótulo do cartão diz o mês escolhido");
  for (const h of [padrao, jan, vazio, mesVazio]) assert.ok(!/\d{4}-\d{2}-\d{2}/.test(h), "nada em ISO");
  assert.ok(vazio.includes("29/02") && vazio.includes("completa 27 anos"), "29/02 exibido como 29/02");
});

await ok("trocar de empresa volta para o mês corrente: a página remonta a tela com key = empresa", () => {
  const p = fonte("src/app/painel/gestao-pessoas/page.tsx");
  assert.ok(p.includes('<GestaoPessoasClient key={dados?.cliente.id ?? "nenhuma"}'));
  const c = fonte("src/components/GestaoPessoasClient.tsx");
  assert.ok(c.includes("useState(indiceMesInicial)") && c.includes("indiceMesInicial = 0"), "o padrão é 0 = mês corrente");
  assert.ok(!/localStorage|sessionStorage/.test(c), "o mês escolhido não é guardado entre aberturas");
});

console.log(`\n${n} verificações OK`);
