// Gestão de Pessoas: "Filhos" (admissao_dependentes, só filho/filha). Sem tabela nova.
//  - idade do filho nas bordas (13 anos e 364 dias, 14 exatos, 29/02, futuro, vazio, inválido, 2979, menos de 1 ano);
//  - estados da coluna (com / só 14+ / sem filho / legado) e o texto único textoDosFilhos (RH e portal, trocável por "só idade");
//  - os três estados somam o total de ativos (14 + 40 + 17 = 71) e batem com a lista;
//  - filtro filhos combinado em AND (Dia das Mães, Dia dos Pais, sexo, faixa, mês), com alternarFiltros;
//  - rotas (banco em memória): lista do RH e do portal, JSON do portal sem nascimento do filho, CPF, mãe, cartório, ids, cônjuge; CSV do RH com a coluna Filhos;
//  - carregador lê só admissao_id, nome, parentesco, data_nascimento; provas de falha com versões sabotadas.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-gestao-pessoas-filhos.mts
//   (roda a si mesmo sob TZ=UTC e TZ=America/Sao_Paulo; relógio em 18/11/2026 22:30 em Brasília = 19/11 em UTC)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, flush } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb } from "./harness-mot/memdb.mjs";
import { formatarIdadeFilho, montarGestaoPessoas, PORTAL_MOSTRA_NOME_DO_FILHO, situacaoDosFilhos, textoDosFilhos, type FilhoCadastrado, type PessoaAtiva } from "../src/lib/gestaoPessoas";
import { alternarFiltros, filtrarFuncionariosGestao, linhasParaPortal, linhasParaRH, type FiltrosGestao } from "../src/lib/gestaoPessoasLista";
import { AGORA, FILHOS_NOVACKI, HOJE, PESSOAS_NOVACKI } from "./gestao-pessoas-novacki-fixture.mts";

if (!process.env.GP_FILHOS_FILHO) {
  for (const tz of ["UTC", "America/Sao_Paulo"]) {
    const saida = execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/verificar-gestao-pessoas-filhos.mts"], {
      env: { ...process.env, TZ: tz, GP_FILHOS_FILHO: "1", HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8",
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
const k = (nome: string, dataNascimento: string | null): FilhoCadastrado => ({ nome, dataNascimento });
const um = (nasc: string | null, hoje = HOJE) => situacaoDosFilhos([k("Filho", nasc)], hoje);

// ── Idade do filho nas bordas ────────────────────────────────────────────────
await ok("idade do filho: 13 anos e 364 dias ENTRA (13 anos); 14 anos exatos NÃO aparece; menos de 1 ano; 1 ano; 8 anos", () => {
  const quase = um("2012-11-19");
  assert.deepEqual([quase.estado, quase.menores[0].idade], ["com", 13], "faltam 364 dias para os 14: ainda é menor");
  assert.equal(textoDosFilhos(quase, "rh"), "Filho (13 anos)");
  const catorze = um("2012-11-18");
  assert.deepEqual([catorze.estado, catorze.menores.length, catorze.cadastrados], ["sem", 0, 1], "14 completos hoje: sai da lista");
  assert.equal(textoDosFilhos(catorze, "rh"), "Sem filhos menores de 14");
  assert.equal(textoDosFilhos(um("2026-11-18"), "rh"), "Filho (menos de 1 ano)", "nasceu hoje");
  assert.equal(textoDosFilhos(um("2026-01-01"), "rh"), "Filho (menos de 1 ano)");
  assert.equal(textoDosFilhos(um("2025-11-18"), "rh"), "Filho (1 ano)");
  assert.equal(textoDosFilhos(um("2025-11-19"), "rh"), "Filho (menos de 1 ano)", "falta 1 dia para 1 ano");
  assert.equal(textoDosFilhos(um("2018-03-10"), "rh"), "Filho (8 anos)");
  assert.equal(formatarIdadeFilho(0), "menos de 1 ano");
  assert.equal(formatarIdadeFilho(1), "1 ano");
  assert.equal(formatarIdadeFilho(13), "13 anos");
});

await ok("idade do filho em 29/02 (a mesma conta dos funcionários): completa em 01/03 nos anos comuns; 14 anos só em 01/03", () => {
  assert.equal(um("2016-02-29", "2027-02-28").menores[0].idade, 10, "28/02/2027: ainda 10");
  assert.equal(um("2016-02-29", "2027-03-01").menores[0].idade, 11, "01/03/2027: 11");
  assert.equal(um("2016-02-29", "2028-02-29").menores[0].idade, 12, "29/02/2028 (bissexto): 12");
  assert.equal(um("2012-02-29", "2026-02-28").estado, "com", "13 anos em 28/02/2026");
  assert.equal(um("2012-02-29", "2026-03-01").estado, "sem", "14 anos em 01/03/2026: sai");
});

await ok("nascimento vazio, inválido, futuro ou 2979: 'Nome (idade não informada)' e a pessoa CONTA como tendo filho; passado absurdo (14+) não aparece; nada quebra", () => {
  for (const ruim of [null, "", "   ", "abc", "2026-02-30", "2026-13-01", "18/11/2020", "2027-01-01", "2026-11-19", "2979-09-16", "9999-12-31"]) {
    const s = um(ruim as string | null);
    assert.equal(s.estado, "com", `conta como filho: ${String(ruim)}`);
    assert.equal(s.menores[0].idade, null, String(ruim));
    assert.equal(textoDosFilhos(s, "rh"), "Filho (idade não informada)");
  }
  assert.equal(um("1800-01-01").estado, "sem", "ano absurdo no passado = 226 anos: fora da lista");
  assert.equal(um("1900-06-06").estado, "sem");
});

// ── Estados da coluna e texto único ──────────────────────────────────────────
await ok("estados: com filho (do mais velho ao mais novo, idade desconhecida por último) / só 14+ / admissão sem filho / legado; legado NUNCA vira 'sem filhos'", () => {
  const com = situacaoDosFilhos([k("João", "2023-05-20"), k("Maria", "2018-03-10"), k("Futuro", "2030-01-01"), k("Grande", "2000-01-01")], HOJE);
  assert.equal(textoDosFilhos(com, "rh"), "Maria (8 anos), João (3 anos), Futuro (idade não informada)");
  assert.equal(com.cadastrados, 4);
  assert.equal(textoDosFilhos(situacaoDosFilhos([k("Grande", "2000-01-01")], HOJE), "rh"), "Sem filhos menores de 14");
  assert.equal(textoDosFilhos(situacaoDosFilhos([], HOJE), "rh"), "Sem filhos declarados");
  for (const legado of [null, undefined]) {
    const s = situacaoDosFilhos(legado, HOJE);
    assert.equal(s.estado, "naoInformado");
    assert.equal(textoDosFilhos(s, "rh"), "Não informado");
    assert.equal(textoDosFilhos(s, "portal"), "Dado não cadastrado", "no portal 'Não informado' vira 'Dado não cadastrado', como no resto da tela");
  }
  assert.notEqual(situacaoDosFilhos(null, HOJE).estado, "sem");
  // mesmo nome repetido e espaços sobrando
  assert.equal(textoDosFilhos(situacaoDosFilhos([k("  Ana   Clara ", "2020-01-01")], HOJE), "rh"), "Ana Clara (6 anos)");
});

await ok("texto único e trocável: o portal usa PORTAL_MOSTRA_NOME_DO_FILHO; com false mostra só a idade e o RH continua com nome (cópia temporária do módulo)", async () => {
  assert.equal(PORTAL_MOSTRA_NOME_DO_FILHO, true, "decisão do Ölver: portal com nome e idade");
  const s = situacaoDosFilhos([k("Maria", "2018-03-10"), k("João", "2023-05-20")], HOJE);
  assert.equal(textoDosFilhos(s, "portal"), "Maria (8 anos), João (3 anos)");
  const copia = "src/lib/__sab_filhos_txt.ts";
  const orig = fonte("src/lib/gestaoPessoas.ts");
  assert.equal(orig.split("PORTAL_MOSTRA_NOME_DO_FILHO = true").length, 2);
  fs.writeFileSync(copia, orig.replace("PORTAL_MOSTRA_NOME_DO_FILHO = true", "PORTAL_MOSTRA_NOME_DO_FILHO = false"));
  try {
    const m = (await import(`../${copia}`)) as typeof import("../src/lib/gestaoPessoas");
    const s2 = m.situacaoDosFilhos([k("Maria", "2018-03-10"), k("João", "2023-05-20")], HOJE);
    assert.equal(m.textoDosFilhos(s2, "portal"), "8 anos, 3 anos", "portal só com a idade");
    assert.equal(m.textoDosFilhos(s2, "rh"), "Maria (8 anos), João (3 anos)", "RH segue com nome");
  } finally { fs.rmSync(copia, { force: true }); }
  const lista = fonte("src/lib/gestaoPessoasLista.ts");
  assert.ok(!lista.includes("formatarIdadeFilho"), "a lista/CSV não montam texto de filho por conta própria: só textoDosFilhos");
});

// ── Agregados: os três estados somam o total ─────────────────────────────────
await ok("Novacki (sintético, 29 ativos): com 12 (8 M + 4 F), sem 15 (inclui 1 só com filho de 14+), não informado 2; soma = 29 e cada estado bate com a lista filtrada", () => {
  const g = montarGestaoPessoas({ id: "x", nome: "N" }, PESSOAS_NOVACKI, HOJE);
  assert.deepEqual(g.filhos, { com: 12, sem: 15, naoInformado: 2, comPorSexo: { masculino: 8, feminino: 4, naoInformado: 0 } });
  assert.equal(g.filhos.com + g.filhos.sem + g.filhos.naoInformado, g.totalAtivos);
  for (const estado of ["com", "sem", "naoInformado"] as const) assert.equal(filtrarFuncionariosGestao(PESSOAS_NOVACKI, { filhos: estado }, HOJE).length, g.filhos[estado], estado);
  assert.equal(filtrarFuncionariosGestao(PESSOAS_NOVACKI, {}, HOJE).length, 29);
});

await ok("quadro com os números reais (14 com + 40 sem + 17 legados = 71): a soma fecha, 6 mães e 8 pais; o '1 só com filho de 14+' fica em 'sem'", () => {
  const pessoas: PessoaAtiva[] = [];
  const base = { cargo: "Auxiliar", dataAdmissao: "2025-01-10", dataNascimento: "1990-05-05", grauInstrucao: "medio_completo" };
  for (let i = 0; i < 14; i++) pessoas.push({ ...base, nome: `Com ${i}`, sexo: i < 6 ? "F" : "M", filhos: [k("Filho", i % 2 ? "2018-03-10" : "2022-07-07")] });
  pessoas.push({ ...base, nome: "So14", sexo: "M", filhos: [k("Grande", "2011-01-01")] });
  for (let i = 0; i < 39; i++) pessoas.push({ ...base, nome: `Sem ${i}`, sexo: i % 2 ? "F" : "M", filhos: [] });
  for (let i = 0; i < 17; i++) pessoas.push({ nome: `Legado ${i}`, cargo: "Vigia", dataAdmissao: "2022-01-01", sexo: null, dataNascimento: null, grauInstrucao: null, filhos: null });
  const g = montarGestaoPessoas({ id: "x", nome: "Real" }, pessoas, HOJE);
  assert.equal(g.totalAtivos, 71);
  assert.deepEqual([g.filhos.com, g.filhos.sem, g.filhos.naoInformado], [14, 40, 17]);
  assert.equal(g.filhos.com + g.filhos.sem + g.filhos.naoInformado, 71);
  assert.deepEqual(g.filhos.comPorSexo, { masculino: 8, feminino: 6, naoInformado: 0 });
  for (const e of ["com", "sem", "naoInformado"] as const) assert.equal(filtrarFuncionariosGestao(pessoas, { filhos: e }, HOJE).length, g.filhos[e]);
});

// ── Filtros combinados ───────────────────────────────────────────────────────
await ok("filtros: Dia das Mães (F + com) = 4 e Dia dos Pais (M + com) = 8; AND com faixa, mês e cargo; substituição de sexo mantém 'filhos'; remover volta", () => {
  const tam = (f: FiltrosGestao) => filtrarFuncionariosGestao(PESSOAS_NOVACKI, f, HOJE).length;
  let f = alternarFiltros({}, [["sexo", "feminino"], ["filhos", "com"]]);
  assert.deepEqual(f, { sexo: "feminino", filhos: "com" });
  assert.equal(tam(f), 4);
  f = alternarFiltros(f, [["sexo", "masculino"], ["filhos", "com"]]);
  assert.deepEqual(f, { sexo: "masculino", filhos: "com" }, "Dia dos Pais substitui o sexo");
  assert.equal(tam(f), 8);
  assert.deepEqual(alternarFiltros(f, [["sexo", "masculino"], ["filhos", "com"]]), {}, "o mesmo atalho de novo remove os dois");
  assert.equal(tam({ filhos: "com", sexo: "naoInformado" }), 0, "legado (sexo N/I) não tem filhos informados");
  assert.equal(tam({ filhos: "naoInformado", sexo: "naoInformado" }), 2);
  assert.equal(tam({ filhos: "sem", sexo: "naoInformado" }), 0, "legado nunca cai em 'sem'");
  const comFaixa = filtrarFuncionariosGestao(PESSOAS_NOVACKI, { filhos: "com", faixa: "21_30" }, HOJE);
  assert.ok(comFaixa.every((l) => l.filhos.estado === "com" && l.faixa === "21_30"));
  assert.ok(tam({ filhos: "com", admitidoNoMes: true }) <= 12 && tam({ filhos: "com", cargo: "Cargo que não existe" }) === 0);
  assert.equal(tam({ filhos: "com", aniversario: 0 }), filtrarFuncionariosGestao(PESSOAS_NOVACKI, { aniversario: 0 }, HOJE).filter((l) => l.filhos.estado === "com").length);
});

await ok("linhas da lista: a coluna Filhos traz nome e idade (RH e portal) e nunca a data de nascimento do filho; as pessoas conhecidas têm o texto esperado", () => {
  const f: FiltrosGestao = {};
  const l = filtrarFuncionariosGestao(PESSOAS_NOVACKI, f, HOJE);
  const rh = linhasParaRH(l, f), po = linhasParaPortal(l, f);
  const de = (lista: { nome: string; filhos: string }[], nome: string) => lista.find((x) => x.nome === nome)!.filhos;
  assert.equal(de(rh, "Pessoa 01"), "Maria (8 anos), João (3 anos)");
  assert.equal(de(po, "Pessoa 01"), "Maria (8 anos), João (3 anos)");
  assert.equal(de(rh, "Pessoa 02"), "Sem filhos menores de 14");
  assert.equal(de(rh, "Pessoa 03"), "Bissexta (10 anos)");
  assert.equal(de(rh, "Pessoa 04"), "Quase Catorze (13 anos)");
  assert.equal(de(rh, "Pessoa 05"), "Um Ano (1 ano), Recém (menos de 1 ano)");
  assert.equal(de(rh, "Pessoa 06"), "Doze (12 anos)", "o filho de 18 não aparece");
  assert.equal(de(rh, "Pessoa 09"), "Futuro (idade não informada)");
  assert.equal(de(rh, "Pessoa 10"), "Sem filhos declarados");
  assert.equal(de(rh, "Pessoa 28"), "Não informado");
  assert.equal(de(po, "Pessoa 28"), "Dado não cadastrado");
  assert.ok(!JSON.stringify(po).match(/\d{4}-\d{2}-\d{2}/) && !JSON.stringify(rh).match(/\d{4}-\d{2}-\d{2}/), "nenhuma data ISO nas linhas");
  assert.equal(Object.keys(FILHOS_NOVACKI).length, 13);
});

// ── Rotas com banco em memória ───────────────────────────────────────────────
const id = (x: number) => `${String(x).padStart(8, "0")}-0000-4000-8000-${String(x).padStart(12, "0")}`;
const UN = id(901), CLI = id(1), CLI_OUTRO = id(2);
const U_SOCIO = id(103), U_ANALISTA = id(104), P_N = id(201), P_OUTRO = id(202);
type Func = { id: string; cliente_id: string; status: string; nome_completo: string; cargo: string | null; data_admissao: string | null; admissao_id: string | null; unidade_id: string };

function semear(extra: PessoaAtiva[] = []) {
  const funcs: Func[] = [], dps: Record<string, unknown>[] = [], deps: Record<string, unknown>[] = [];
  [...PESSOAS_NOVACKI, ...extra].forEach((p, i) => {
    const adm = p.filhos === null || p.filhos === undefined ? null : id(5000 + i);
    funcs.push({ id: id(3000 + i), cliente_id: CLI, status: "ativo", nome_completo: p.nome, cargo: p.cargo, data_admissao: p.dataAdmissao, admissao_id: adm, unidade_id: UN });
    if (!adm) return;
    dps.push({ admissao_id: adm, sexo: p.sexo, data_nascimento: p.dataNascimento, grau_instrucao: p.grauInstrucao, cpf: `CPFFUNC${i}`, rg_numero: `RG${i}`, pis_pasep: `PIS${i}` });
    (p.filhos ?? []).forEach((fi, j) => deps.push({ id: id(7000 + i * 10 + j), admissao_id: adm, nome: fi.nome, parentesco: j % 2 ? "filho" : "filha", data_nascimento: fi.dataNascimento, cpf: `CPFFILHO${i}${j}`, nome_mae: `MAEFILHO${i}${j}`, cpf_mae: `CPFMAE${i}${j}`, cartorio: `CARTORIO${i}${j}`, num_registro: `REG${i}${j}` }));
    // cônjuge e "outro" com nascimento recente: só o PARENTESCO pode impedir que entrem na coluna Filhos
    if (i === 0) {
      deps.push({ id: id(7900), admissao_id: adm, nome: "Conjuge Teste", parentesco: "conjuge", data_nascimento: "2020-01-01", cpf: "CPFCONJ", nome_mae: null, cpf_mae: null, cartorio: null, num_registro: null });
      deps.push({ id: id(7901), admissao_id: adm, nome: "Outro Parente", parentesco: "outro", data_nascimento: "2021-01-01", cpf: "CPFOUTRO", nome_mae: null, cpf_mae: null, cartorio: null, num_registro: null });
    }
  });
  funcs.push({ id: id(9998), cliente_id: CLI_OUTRO, status: "ativo", nome_completo: "Outra Empresa Pessoa", cargo: "Vigia", data_admissao: "2024-01-10", admissao_id: id(5998), unidade_id: UN });
  deps.push({ id: id(7998), admissao_id: id(5998), nome: "Filho De Outra Empresa", parentesco: "filho", data_nascimento: "2020-05-05", cpf: "CPFOUTRAEMP", nome_mae: "MAEOUTRA", cpf_mae: null, cartorio: null, num_registro: null });
  dps.push({ admissao_id: id(5998), sexo: "F", data_nascimento: "1990-01-01", grau_instrucao: "medio_completo", cpf: "CPFEMPOUTRA", rg_numero: "RGX", pis_pasep: "PISX" });
  const db = criarDb({
    clientes: [{ id: CLI, nome: "Novacki Indústria & Cia", unidade_id: UN, ativo: true }, { id: CLI_OUTRO, nome: "Outra Empresa", unidade_id: UN, ativo: true }],
    cliente_usuarios: [{ user_id: P_N, cliente_id: CLI }, { user_id: P_OUTRO, cliente_id: CLI_OUTRO }],
    funcionarios: funcs, admissao_dados_pessoais: dps, admissao_dependentes: deps,
    analistas_perfil: [{ id: id(303), user_id: U_SOCIO, unidade_id: UN, acesso_todas_unidades: true, nome_completo: "Sócio", ativo: true }, { id: id(304), user_id: U_ANALISTA, unidade_id: UN, acesso_todas_unidades: false, nome_completo: "Analista", ativo: true }],
    usuario_acesso_customizado: [], audit_logs: [],
  });
  (globalThis as unknown as { __DB__: unknown; __PENDENTES__: unknown[] }).__DB__ = db;
  (globalThis as unknown as { __PENDENTES__: unknown[] }).__PENDENTES__ = [];
  return { db: db as { usuario: unknown; usuarioPortal: unknown }, deps, dps, funcs };
}
const SEED = semear();
const PROIBIDOS = [
  ...SEED.deps.flatMap((d) => [String(d.id), String(d.cpf), String(d.cpf_mae ?? ""), String(d.nome_mae ?? ""), String(d.cartorio ?? ""), String(d.num_registro ?? ""), String(d.data_nascimento ?? "")]),
  ...SEED.dps.flatMap((d) => [String(d.admissao_id), String(d.cpf), String(d.rg_numero), String(d.pis_pasep)]), ...SEED.funcs.flatMap((f) => [f.id]), CLI, CLI_OUTRO, UN,
  "Conjuge Teste", "Outro Parente", "Filho De Outra Empresa",
].filter(Boolean);
const CHAVES = /"(id|funcionario_id|admissao_id|cliente_id|clienteId|cpf|cpf_mae|rg_numero|pis_pasep|nome_mae|cartorio|num_registro|parentesco|data_nascimento|dataNascimento|nascimento)"\s*:/i;

type Handler = (req: Request) => Promise<Response>;
interface Rotas { rhLista: Handler; rhExportar: Handler; portalLista: Handler }
const importar = async (arq: string) => ((await import(`../${arq}`)) as { POST: Handler }).POST;
const REAIS: Rotas = {
  rhLista: await importar("src/app/api/gestao-pessoas/lista/route.ts"),
  rhExportar: await importar("src/app/api/gestao-pessoas/exportar/route.ts"),
  portalLista: await importar("src/app/api/portal/gestao-pessoas/lista/route.ts"),
};
const rhUser = (uid: string, role: string) => ({ id: uid, email: `${uid}@t.local`, app_metadata: { role } });
const dbAtual = () => (globalThis as unknown as { __DB__: { usuario: unknown; usuarioPortal: unknown } }).__DB__;
async function chamar(h: Handler, corpo: unknown, sessao: { rh?: "socio" | "analista" | null; portal?: string | null }) {
  const banco = dbAtual();
  banco.usuario = sessao.rh === "socio" ? rhUser(U_SOCIO, "diretoria") : sessao.rh === "analista" ? rhUser(U_ANALISTA, "analista") : null;
  banco.usuarioPortal = sessao.portal ? { id: sessao.portal, email: "c@c.local" } : null;
  const r = await h(new Request("http://localhost/api/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));
  await flush();
  return r;
}
type Lista = { total: number; linhas: Record<string, string>[] };
const lista = async (h: Handler, corpo: unknown, sessao: Parameters<typeof chamar>[2]) => (await (await chamar(h, corpo, sessao)).json()) as Lista;

// Provas (falha ou null): as MESMAS rodam nas rotas reais e nas sabotadas.
type Prova = { categoria: "estados" | "payload"; roda: (r: Rotas) => Promise<string | null> };
const PROVAS: Prova[] = [
  { categoria: "estados", roda: async (r) => {
    const rh = await lista(r.rhLista, { clienteId: CLI, filtros: {} }, { rh: "socio" });
    const texto = (nome: string, l: Lista = rh) => l.linhas.find((x) => x.nome === nome)?.filhos;
    const esperado: [string, string][] = [["Pessoa 01", "Maria (8 anos), João (3 anos)"], ["Pessoa 02", "Sem filhos menores de 14"], ["Pessoa 06", "Doze (12 anos)"], ["Pessoa 09", "Futuro (idade não informada)"], ["Pessoa 10", "Sem filhos declarados"], ["Pessoa 28", "Não informado"], ["Pessoa 29", "Não informado"]];
    for (const [nome, t] of esperado) if (texto(nome) !== t) return `coluna Filhos de ${nome}: "${texto(nome)}" (esperado "${t}")`;
    for (const [e, total] of [["com", 12], ["sem", 15], ["naoInformado", 2]] as const) { const l = await lista(r.rhLista, { clienteId: CLI, filtros: { filhos: e } }, { rh: "socio" }); if (l.total !== total) return `filhos=${e}: ${l.total} (esperado ${total})`; }
    const po = await lista(r.portalLista, { filtros: {} }, { portal: P_N });
    if (texto("Pessoa 28", po) !== "Dado não cadastrado") return `portal: legado deveria ser "Dado não cadastrado" (veio "${texto("Pessoa 28", po)}")`;
    if (po.total !== 29) return `portal listou ${po.total}`;
    return null;
  } },
  { categoria: "payload", roda: async (r) => {
    for (const [rotulo, resp] of [["portal", await chamar(r.portalLista, { filtros: {} }, { portal: P_N })], ["portal+filtro", await chamar(r.portalLista, { filtros: { filhos: "com", aniversario: 0 } }, { portal: P_N })], ["rh", await chamar(r.rhLista, { clienteId: CLI, filtros: {} }, { rh: "socio" })]] as const) {
      const txt = await resp.text();
      const achado = PROIBIDOS.find((v) => txt.includes(v));
      if (achado) return `${rotulo}: a resposta contém "${achado.slice(0, 14)}"`;
      const chave = txt.match(CHAVES);
      if (chave) return `${rotulo}: a resposta contém a chave ${chave[1]}`;
      if (/\d{4}-\d{2}-\d{2}/.test(txt)) return `${rotulo}: data em ISO na resposta`;
    }
    return null;
  } },
];

await ok("rotas reais passam em todas as provas; lista do RH e do portal com o filtro 'filhos': 12 / 15 / 2, Dia das Mães 4, Dia dos Pais 8, só a empresa da sessão", async () => {
  for (const p of PROVAS) assert.equal(await p.roda(REAIS), null, p.categoria);
  const pedir = async (filtros: FiltrosGestao) => (await lista(REAIS.rhLista, { clienteId: CLI, filtros }, { rh: "socio" })).total;
  assert.equal(await pedir({ filhos: "com" }), 12);
  assert.equal(await pedir({ filhos: "sem" }), 15);
  assert.equal(await pedir({ filhos: "naoInformado" }), 2);
  assert.equal(await pedir({ filhos: "com", sexo: "feminino" }), 4);
  assert.equal(await pedir({ filhos: "com", sexo: "masculino" }), 8);
  const portalCom = await lista(REAIS.portalLista, { filtros: { filhos: "com" }, cliente_id: CLI_OUTRO }, { portal: P_N });
  assert.equal(portalCom.total, 12, "corpo forjado ignorado");
  assert.ok(portalCom.linhas.every((l) => !l.nome.startsWith("Outra")), "nada da outra empresa");
  const outro = await lista(REAIS.portalLista, { filtros: {} }, { portal: P_OUTRO });
  assert.deepEqual(outro.linhas.map((l) => l.filhos), ["Filho De Outra Empresa (6 anos)"], "o usuário da outra empresa vê só o filho do próprio quadro");
  assert.equal((await chamar(REAIS.portalLista, { filtros: { filhos: "talvez" } }, { portal: P_N })).status, 400);
});

await ok("portal: a resposta tem nome, cargo, admissão, tempo de casa e filhos (sem sexo, idade nem escolaridade); cônjuge e 'outro' parente nunca entram; só filho/filha", async () => {
  const po = await lista(REAIS.portalLista, { filtros: {} }, { portal: P_N });
  assert.deepEqual(Object.keys(po.linhas[0]).sort(), ["cargo", "dataAdmissao", "filhos", "nome", "tempoDeCasa"]);
  const txt = JSON.stringify(po);
  assert.ok(!txt.includes("Conjuge Teste") && !txt.includes("Outro Parente"));
  assert.ok(!/"(sexo|idade|escolaridade)"\s*:/.test(txt));
  const p1 = po.linhas.find((l) => l.nome === "Pessoa 01")!;
  assert.equal(p1.filhos, "Maria (8 anos), João (3 anos)", "o cônjuge de Pessoa 01 (nascido em 2020) não aparece como filho");
});

await ok("CSV do RH: coluna 'Filhos' com o mesmo texto e critério da lista, mesma neutralização de fórmula e auditoria; bloqueado para papel sem acesso", async () => {
  const filtros: FiltrosGestao = { filhos: "com" };
  const resp = await chamar(REAIS.rhExportar, { clienteId: CLI, filtros }, { rh: "socio" });
  assert.equal(resp.status, 200);
  const bruto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await resp.arrayBuffer());
  assert.ok(bruto.startsWith("﻿"));
  const linhas = bruto.slice(1).split("\r\n").filter(Boolean);
  assert.ok(linhas[0].endsWith(";Escolaridade;Filhos"), linhas[0]);
  const lst = await lista(REAIS.rhLista, { clienteId: CLI, filtros }, { rh: "socio" });
  assert.equal(linhas.length - 1, lst.total, "mesmo número de linhas da lista filtrada");
  for (const l of lst.linhas) assert.ok(linhas.some((c) => c.startsWith(`${l.nome};`) && c.endsWith(`;${l.filhos.includes(";") ? `"${l.filhos}"` : l.filhos}`)), `CSV tem o mesmo texto de Filhos de ${l.nome}`);
  assert.equal((await chamar(REAIS.rhExportar, { clienteId: CLI, filtros }, { rh: "analista" })).status, 403);
  // fórmula: nome de filho que começa com "=" é neutralizado como qualquer célula
  semear([{ nome: "Formula Pai", cargo: "Vigia", dataAdmissao: "2025-01-10", sexo: "M", dataNascimento: "1990-05-05", grauInstrucao: "medio_completo", filhos: [k("=HYPERLINK(1)", "2021-01-01")] }]);
  const t = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await (await chamar(REAIS.rhExportar, { clienteId: CLI, filtros: { filhos: "com" } }, { rh: "socio" })).arrayBuffer());
  assert.ok(t.includes("'=HYPERLINK(1) (5 anos)"), "célula de filho neutralizada com apóstrofo");
  assert.ok(![...t.matchAll(/(^|;)=/gm)].length, "nenhuma célula começa com =");
  const db = dbAtual() as unknown as { tabelas: Record<string, Record<string, unknown>[]> };
  const reg = db.tabelas.audit_logs.filter((a) => a.acao === "exportar");
  assert.ok(reg.length >= 1 && reg.every((r) => r.entidade === "gestao_pessoas" && (r.detalhes as { filtros: unknown }).filtros !== undefined), "auditoria gravada com os filtros");
  assert.deepEqual(reg[reg.length - 1].detalhes, { empresa: "Novacki Indústria & Cia", linhas: reg[reg.length - 1] && (reg[reg.length - 1].detalhes as { linhas: number }).linhas, filtros: { filhos: "com" } });
});
semear(); // volta ao quadro padrão para os testes seguintes

await ok("carregador: lê SÓ admissao_id, nome, parentesco e data_nascimento de admissao_dependentes (filho/filha); nenhuma coluna sensível nem cônjuge", () => {
  const src = fonte("src/lib/gestaoPessoas.ts");
  const selects = [...src.matchAll(/from\("admissao_dependentes"\)\.select\("([^"]+)"\)([^;]*);/g)];
  assert.equal(selects.length, 1, "um único acesso a admissao_dependentes");
  assert.equal(selects[0][1], "admissao_id, nome, parentesco, data_nascimento");
  assert.ok(selects[0][2].includes('.in("parentesco", ["filho", "filha"])'));
  assert.ok(!/select\("\*"\)/.test(src), "nenhum select(*)");
  assert.ok(!/(cpf_mae|nome_mae|cartorio|num_registro|num_livro|num_folha|local_nascimento|declaracao_nascido_vivo)/.test(src.replace(/\/\/.*$/gm, "")), "nenhuma coluna sensível no carregador");
});

await ok("tela: quinto cartão 'Com filhos menores de 14' com os atalhos fora do botão; coluna Filhos na lista (RH e portal); atalhos acessíveis", () => {
  const c = fonte("src/components/GestaoPessoasClient.tsx");
  for (const t of ['titulo="Com filhos menores de 14"', "valor={String(dados.filhos.com)}", "Dia das Mães", "Dia dos Pais", "Sem filhos declarados", 'aria-label="Atalhos de filhos"', "<th style={th}>Filhos</th>", "<td style={td}>{l.filhos}</td>"]) assert.ok(c.includes(t), t);
  assert.ok(c.includes("(!portal || dados.filhos.naoInformado > 0) &&"), "no portal o atalho 'Dado não cadastrado' some quando é 0");
  assert.ok(c.indexOf('aria-label="Atalhos de filhos"') > c.indexOf("controle={"), "os atalhos são o `controle` do cartão (irmão do botão principal)");
});

// ── Provas de falha ──────────────────────────────────────────────────────────
type Sabotagem = { nome: string; categoria: Prova["categoria"]; gp?: [string, string][]; lista?: [string, string][] };
const SABOTAGENS: Sabotagem[] = [
  { nome: "legado tratado como 'sem filhos' (array vazio em vez de null)", categoria: "estados", gp: [["filhos: f.admissao_id ? (filhosPorAdmissao.get(f.admissao_id) ?? []) : null", "filhos: filhosPorAdmissao.get(f.admissao_id ?? \"\") ?? []"]] },
  { nome: "sem o corte de 14 anos (filho de 14+ aparece)", categoria: "estados", gp: [["if (idade === null || idade < IDADE_LIMITE_FILHO) menores.push", "if (true) menores.push"]] },
  { nome: "cônjuge e outros parentes entram como filho (sem o filtro de parentesco)", categoria: "estados", gp: [['.in("parentesco", ["filho", "filha"]);', ";"]] },
  { nome: "portal com a data de nascimento do filho", categoria: "payload", lista: [["filhos: textoDosFilhos(l.filhos, \"portal\"),", "filhos: textoDosFilhos(l.filhos, \"portal\") + \" \" + (l.pessoa.filhos ?? []).map((x) => x.dataNascimento).join(\",\"),"]] },
  { nome: "portal com o CPF do filho (select de colunas a mais, repassado na linha)", categoria: "payload", gp: [['.select("admissao_id, nome, parentesco, data_nascimento")', '.select("admissao_id, nome, parentesco, data_nascimento, cpf")'], ["lista.push({ nome: d.nome, dataNascimento: d.data_nascimento });", "lista.push({ nome: d.nome + \" \" + (d as unknown as { cpf: string }).cpf, dataNascimento: d.data_nascimento });"]] },
];

await ok("provas de falha: cada versão sabotada (legado como 'sem filhos', sem corte de 14, cônjuge como filho, nascimento do filho e CPF no portal) é reprovada; as reais passam", async () => {
  const criados: string[] = [];
  try {
    for (const [i, s] of SABOTAGENS.entries()) {
      const gpNome = `src/lib/__sabF${i}_gestaoPessoas.ts`, listaNome = `src/lib/__sabF${i}_gestaoPessoasLista.ts`, rhNome = `src/lib/__sabF${i}_gestaoPessoasRH.ts`;
      let gp = fonte("src/lib/gestaoPessoas.ts"), li = fonte("src/lib/gestaoPessoasLista.ts");
      for (const [de, para] of s.gp ?? []) { assert.equal(gp.split(de).length, 2, `âncora gp (${s.nome}): ${de.slice(0, 50)}`); gp = gp.replace(de, () => para); }
      for (const [de, para] of s.lista ?? []) { assert.equal(li.split(de).length, 2, `âncora lista (${s.nome}): ${de.slice(0, 50)}`); li = li.replace(de, () => para); }
      li = li.split('"@/lib/gestaoPessoas"').join(`"@/lib/__sabF${i}_gestaoPessoas"`);
      const rh = fonte("src/lib/gestaoPessoasRH.ts").split('"@/lib/gestaoPessoas"').join(`"@/lib/__sabF${i}_gestaoPessoas"`).split('"@/lib/gestaoPessoasLista"').join(`"@/lib/__sabF${i}_gestaoPessoasLista"`);
      const rotas: Record<string, string> = {};
      for (const [chave, arq] of [["rhLista", "src/app/api/gestao-pessoas/lista/route.ts"], ["portalLista", "src/app/api/portal/gestao-pessoas/lista/route.ts"]] as const) {
        const alvo = arq.replace("route.ts", `__sabF${i}.ts`);
        fs.writeFileSync(alvo, fonte(arq).split('"@/lib/gestaoPessoasRH"').join(`"@/lib/__sabF${i}_gestaoPessoasRH"`).split('"@/lib/gestaoPessoasLista"').join(`"@/lib/__sabF${i}_gestaoPessoasLista"`).split('"@/lib/gestaoPessoas"').join(`"@/lib/__sabF${i}_gestaoPessoas"`));
        criados.push(alvo); rotas[chave] = alvo;
      }
      for (const [arq, txt] of [[gpNome, gp], [listaNome, li], [rhNome, rh]] as const) { fs.writeFileSync(arq, txt); criados.push(arq); }
      const sab: Rotas = { ...REAIS, rhLista: await importar(rotas.rhLista), portalLista: await importar(rotas.portalLista) };
      const reprovadas: string[] = [];
      for (const p of PROVAS) { const f = await p.roda(sab); if (f) reprovadas.push(`${p.categoria}: ${f}`); }
      const pega = reprovadas.find((r) => r.startsWith(s.categoria));
      assert.ok(pega, `a sabotagem "${s.nome}" NÃO foi pega (reprovou: ${JSON.stringify(reprovadas)})`);
      console.log(`   sabotagem pega — ${s.nome}: ${pega}`);
    }
    for (const p of PROVAS) assert.equal(await p.roda(REAIS), null, `as rotas reais reprovaram em ${p.categoria}`);
  } finally { for (const a of criados) fs.rmSync(a, { force: true }); }
  for (const a of criados) assert.ok(!fs.existsSync(a), "arquivo de sabotagem removido");
});

console.log(`\n${n} verificações OK`);
