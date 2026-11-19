// Editor de dados pessoais e filhos de funcionários SEM admissão digital (legados) + efeito na Gestão de Pessoas (RH e portal). Banco em memória.
//  - precedência: com admissao_id valem os dados da admissão (nunca misturar); sem admissão vale funcionario_perfil / funcionario_filhos; sem registro = "Não informado";
//  - os 17 legados saem de "Não informado" campo a campo conforme o RH completa (perfil com e sem filhos; sem confirmação = filhos "Não informado");
//  - permissão: mesmo gate do módulo (analista comum fora, exceção rh_funcionarios vale) e unidade (404 de outra unidade); funcionário com admissão = 409;
//  - validações: nascimento futuro/inexistente/1899 bloqueia; idade de funcionário fora de 14 a 90 = 422 e só salva com confirmado:true; filho; remover o último filho pede confirmação;
//  - auditoria (nome real, antes e depois); tabela ausente (migração pendente) = vazio na leitura e 503 na escrita; JSON do portal sem ids/CPF/RG/PIS/nascimentos exatos;
//  - arquivo de migração (RLS, sem política de cliente, constraints iguais às da admissão); provas de falha com versões sabotadas.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-gestao-pessoas-perfil.mts
//   (roda a si mesmo sob TZ=UTC e TZ=America/Sao_Paulo; relógio em 18/11/2026 22:30 em Brasília = 19/11 em UTC)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, flush } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb, criarClienteServico } from "./harness-mot/memdb.mjs";
import { GRAU_INSTRUCAO_OPTIONS } from "../src/lib/admissaoConstants";
import { carregarGestaoPessoas } from "../src/lib/gestaoPessoas";
import { avisoFilho14OuMais, avisoIdadeFuncionario, erroDeTabelaAusente, faltasDoCadastro } from "../src/lib/funcionarioPerfil";
import { AGORA, HOJE } from "./gestao-pessoas-novacki-fixture.mts";

if (!process.env.GP_PERFIL_FILHO) {
  for (const tz of ["UTC", "America/Sao_Paulo"]) {
    const saida = execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/verificar-gestao-pessoas-perfil.mts"], {
      env: { ...process.env, TZ: tz, GP_PERFIL_FILHO: "1", HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8",
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

// ── Banco em memória ─────────────────────────────────────────────────────────
const id = (x: number) => `${String(x).padStart(8, "0")}-0000-4000-8000-${String(x).padStart(12, "0")}`;
const UN1 = id(901), UN2 = id(902), CLI_A = id(1), CLI_B = id(2);
const U_SOCIO = id(103), U_SUP1 = id(101), U_SUP2 = id(102), U_ANALISTA = id(104), U_EXCECAO = id(105), U_DP = id(106), P_A = id(201);
const ADM1 = id(5001), F_ADM = id(3100), F_LB = id(3200), F_DESL = id(3300);
const LEG = (i: number) => id(3000 + i); // i = 1..17
const NASC_LEG = (i: number) => `${1979 + i}-0${(i % 9) + 1}-1${i % 9}`; // 1980..1996, datas reais e plausíveis
const rhUser = (uid: string, role: string) => ({ id: uid, email: `${uid}@t.local`, app_metadata: { role } });
const USUARIOS: Record<string, ReturnType<typeof rhUser>> = { socio: rhUser(U_SOCIO, "diretoria"), sup1: rhUser(U_SUP1, "supervisor"), sup2: rhUser(U_SUP2, "supervisor"), analista: rhUser(U_ANALISTA, "analista"), excecao: rhUser(U_EXCECAO, "analista"), dp: rhUser(U_DP, "dp") };

function novoDb() {
  const funcs = [
    ...Array.from({ length: 17 }, (_, k) => ({ id: LEG(k + 1), cliente_id: CLI_A, status: "ativo", nome_completo: `Legado ${String(k + 1).padStart(2, "0")}`, cargo: "Auxiliar", data_admissao: "2026-07-28", admissao_id: null, unidade_id: UN1 })),
    { id: F_ADM, cliente_id: CLI_A, status: "ativo", nome_completo: "Com Admissao", cargo: "Motorista", data_admissao: "2026-05-01", admissao_id: ADM1, unidade_id: UN1 },
    { id: F_DESL, cliente_id: CLI_A, status: "desligado", nome_completo: "Legado Desligado", cargo: "Vigia", data_admissao: "2025-01-01", admissao_id: null, unidade_id: UN1 },
    { id: F_LB, cliente_id: CLI_B, status: "ativo", nome_completo: "Legado Outra Unidade", cargo: "Vigia", data_admissao: "2026-07-28", admissao_id: null, unidade_id: UN2 },
  ];
  const db = criarDb({
    clientes: [{ id: CLI_A, nome: "Alfa Indústria", unidade_id: UN1, ativo: true }, { id: CLI_B, nome: "Beta", unidade_id: UN2, ativo: true }],
    cliente_usuarios: [{ user_id: P_A, cliente_id: CLI_A }],
    funcionarios: funcs,
    admissao_dados_pessoais: [{ admissao_id: ADM1, sexo: "F", data_nascimento: "1990-05-05", grau_instrucao: "medio_completo", cpf: "CPFADM", rg_numero: "RGADM", pis_pasep: "PISADM" }],
    admissao_dependentes: [{ id: id(7001), admissao_id: ADM1, nome: "Filha Admissao", parentesco: "filha", data_nascimento: "2018-01-01", cpf: "CPFFILHAADM" }],
    funcionario_perfil: [], funcionario_filhos: [],
    analistas_perfil: [
      { id: id(301), user_id: U_SOCIO, unidade_id: UN1, acesso_todas_unidades: true, nome_completo: "Sócia Diretora", ativo: true },
      { id: id(302), user_id: U_SUP1, unidade_id: UN1, acesso_todas_unidades: false, nome_completo: "Supervisora Um", ativo: true },
      { id: id(303), user_id: U_SUP2, unidade_id: UN2, acesso_todas_unidades: false, nome_completo: "Supervisor Dois", ativo: true },
      { id: id(304), user_id: U_ANALISTA, unidade_id: UN1, acesso_todas_unidades: false, nome_completo: "Analista Comum", ativo: true },
      { id: id(305), user_id: U_EXCECAO, unidade_id: UN1, acesso_todas_unidades: false, nome_completo: "Analista Com Excecao", ativo: true },
      { id: id(306), user_id: U_DP, unidade_id: UN1, acesso_todas_unidades: false, nome_completo: "Pessoa do DP", ativo: true },
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: id(305), chave_aba: "rh_funcionarios", liberado: true }],
    audit_logs: [],
  });
  (globalThis as unknown as { __DB__: unknown; __PENDENTES__: unknown[] }).__DB__ = db;
  (globalThis as unknown as { __PENDENTES__: unknown[] }).__PENDENTES__ = [];
  return db as { usuario: unknown; usuarioPortal: unknown; tabelas: Record<string, Record<string, unknown>[]>; falhas: Record<string, unknown> };
}
let DB = novoDb();
const reiniciar = () => (DB = novoDb());

// ── Rotas ────────────────────────────────────────────────────────────────────
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
interface Rotas { perfil: Handler; filhoPost: Handler; filhoPatch: Handler; filhoDelete: Handler; confirmar: Handler; portalLista: (req: Request) => Promise<Response> }
const imp = async (arq: string, nome: string) => ((await import(`../${arq}`)) as Record<string, Handler>)[nome];
const ROTA = {
  perfil: "src/app/api/funcionarios/[id]/perfil/route.ts", filhos: "src/app/api/funcionarios/[id]/filhos/route.ts",
  filho: "src/app/api/funcionarios/[id]/filhos/[filhoId]/route.ts", confirmar: "src/app/api/funcionarios/[id]/filhos/confirmar-sem-filhos/route.ts",
};
const REAIS: Rotas = {
  perfil: await imp(ROTA.perfil, "PUT"), filhoPost: await imp(ROTA.filhos, "POST"), filhoPatch: await imp(ROTA.filho, "PATCH"), filhoDelete: await imp(ROTA.filho, "DELETE"),
  confirmar: await imp(ROTA.confirmar, "POST"), portalLista: (await imp("src/app/api/portal/gestao-pessoas/lista/route.ts", "POST")) as unknown as Rotas["portalLista"],
};
type Sessao = keyof typeof USUARIOS | null;
async function chamar(h: Handler, fid: string, corpo: unknown, sessao: Sessao, extra: Record<string, string> = {}, url = "http://localhost/api/x") {
  DB.usuario = sessao ? USUARIOS[sessao] : null;
  DB.usuarioPortal = null;
  const r = await h(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { params: Promise.resolve({ id: fid, ...extra }) });
  await flush();
  return r;
}
const j = async (r: Response) => (await r.json()) as Record<string, unknown> & { data?: Record<string, unknown>; error?: string; aviso?: unknown; codigo?: string };
const tabela = (nome: string) => DB.tabelas[nome] ?? [];
const perfilDe = (fid: string) => tabela("funcionario_perfil").find((p) => p.funcionario_id === fid);
const filhosDe = (fid: string) => tabela("funcionario_filhos").filter((f) => f.funcionario_id === fid);
const auditorias = (acao?: string) => tabela("audit_logs").filter((a) => !acao || a.acao === acao);
const gestao = async () => (await carregarGestaoPessoas(criarClienteServico(DB), { clienteId: CLI_A, unidadeRH: null, hojeISO: HOJE }))!;

// ── Funções puras ────────────────────────────────────────────────────────────
await ok("avisos: idade de funcionário fora de 14 a 90 avisa (13 e 91), nas bordas (14 e 90) não; filho de 14+ só informa; tabela ausente reconhecida; faltas do cadastro", () => {
  assert.equal(avisoIdadeFuncionario("2012-11-18", HOJE), null, "14 exatos");
  assert.match(avisoIdadeFuncionario("2012-11-19", HOJE)!.mensagem, /13 anos/);
  assert.equal(avisoIdadeFuncionario("1936-11-18", HOJE), null, "90 exatos");
  assert.match(avisoIdadeFuncionario("1935-11-18", HOJE)!.mensagem, /91 anos/);
  assert.equal(avisoIdadeFuncionario("2020-05-05", HOJE)!.codigo, "idade_fora_da_faixa");
  assert.equal(avisoFilho14OuMais("2012-11-19", HOJE), null);
  assert.match(avisoFilho14OuMais("2012-11-18", HOJE)!.mensagem, /14 anos e não aparece/);
  assert.equal(erroDeTabelaAusente({ code: "42P01", message: "x" }), true);
  assert.equal(erroDeTabelaAusente({ message: "Could not find the table 'public.funcionario_perfil' in the schema cache" }), true);
  assert.equal(erroDeTabelaAusente({ message: "duplicate key" }), false);
  assert.deepEqual(faltasDoCadastro(null, null, 0), ["sexo", "data de nascimento", "grau de instrução", "filhos"]);
  assert.deepEqual(faltasDoCadastro(null, { sexo: "F", data_nascimento: "1990-01-01", grau_instrucao: "medio_completo", filhos_informado_em: null }, 0), ["filhos"]);
  assert.deepEqual(faltasDoCadastro(null, { sexo: "F", data_nascimento: "1990-01-01", grau_instrucao: "medio_completo", filhos_informado_em: "2026-11-18T10:00:00Z" }, 0), []);
  assert.deepEqual(faltasDoCadastro(null, { sexo: "F", data_nascimento: "1990-01-01", grau_instrucao: "medio_completo", filhos_informado_em: null }, 2), [], "filho cadastrado já conta como informado");
  assert.deepEqual(faltasDoCadastro(ADM1, null, 0), [], "com admissão não se aplica (selo só para sem admissão)");
});

// ── Provas (rodam nas rotas reais e nas sabotadas) ───────────────────────────
type Prova = { categoria: string; roda: (r: Rotas, carregar: typeof carregarGestaoPessoas) => Promise<string | null> };
const CORPO_OK = { sexo: "F", data_nascimento: "1985-03-12", grau_instrucao: "superior_completo" };
const PROVAS: Prova[] = [
  { categoria: "unidade", roda: async (r) => {
    reiniciar();
    const resp = await chamar(r.perfil, LEG(1), CORPO_OK, "sup2");
    if (resp.status !== 404) return `supervisor da unidade 2 editou legado da unidade 1 (status ${resp.status})`;
    if (perfilDe(LEG(1))) return "gravou perfil de outra unidade";
    const resp2 = await chamar(r.filhoPost, F_LB, { nome: "X", data_nascimento: "2020-01-01" }, "sup1");
    return resp2.status === 404 ? null : `supervisor da unidade 1 cadastrou filho em funcionário da unidade 2 (status ${resp2.status})`;
  } },
  { categoria: "papel", roda: async (r) => {
    reiniciar();
    const resp = await chamar(r.perfil, LEG(1), CORPO_OK, "analista");
    if (resp.status !== 403) return `analista comum editou (status ${resp.status})`;
    const sem = await chamar(r.perfil, LEG(1), CORPO_OK, null);
    if (sem.status !== 401) return `sem login editou (status ${sem.status})`;
    for (const quem of ["excecao", "dp", "sup1", "socio"] as const) { const o = await chamar(r.perfil, LEG(1), CORPO_OK, quem); if (o.status !== 200) return `${quem} deveria poder editar (status ${o.status})`; }
    return null;
  } },
  { categoria: "admissao", roda: async (r) => {
    reiniciar();
    for (const [rotulo, resp] of [["perfil", await chamar(r.perfil, F_ADM, CORPO_OK, "socio")], ["filho", await chamar(r.filhoPost, F_ADM, { nome: "X", data_nascimento: "2020-01-01" }, "socio")], ["confirmar", await chamar(r.confirmar, F_ADM, undefined, "socio")]] as const) {
      if (resp.status !== 409) return `${rotulo}: funcionário com admissão deveria dar 409 (deu ${resp.status})`;
    }
    return perfilDe(F_ADM) || filhosDe(F_ADM).length ? "gravou dados de funcionário com admissão" : null;
  } },
  { categoria: "validacao", roda: async (r) => {
    reiniciar();
    for (const ruim of ["2026-11-19", "2979-09-16", "2026-02-30", "1899-12-31"]) { const x = await chamar(r.perfil, LEG(2), { data_nascimento: ruim }, "socio"); if (x.status !== 400) return `nascimento ${ruim} deveria dar 400 (deu ${x.status})`; }
    const aviso = await chamar(r.perfil, LEG(2), { data_nascimento: "2020-01-01" }, "socio");
    if (aviso.status !== 422 || (await j(aviso)).aviso !== true) return `idade de 6 anos deveria dar 422 de aviso (deu ${aviso.status})`;
    if (perfilDe(LEG(2))) return "salvou idade fora da faixa sem confirmação";
    const conf = await chamar(r.perfil, LEG(2), { data_nascimento: "2020-01-01", confirmado: true }, "socio");
    if (conf.status !== 200) return `com confirmado:true deveria salvar (deu ${conf.status})`;
    const filhoFuturo = await chamar(r.filhoPost, LEG(3), { nome: "Futuro", data_nascimento: "2026-11-19" }, "socio");
    return filhoFuturo.status === 400 ? null : `filho com nascimento futuro deveria dar 400 (deu ${filhoFuturo.status})`;
  } },
  { categoria: "auditoria", roda: async (r) => {
    reiniciar();
    await chamar(r.perfil, LEG(1), CORPO_OK, "sup1");
    const a = auditorias("funcionario_perfil_editado");
    if (a.length !== 1) return `esperava 1 auditoria funcionario_perfil_editado, achou ${a.length}`;
    const d = a[0].detalhes as { diff: Record<string, { antes: unknown; depois: unknown }> };
    return a[0].usuario_nome === "Supervisora Um" && d.diff.sexo.depois === "F" && d.diff.sexo.antes === null ? null : "auditoria sem o nome real ou sem antes/depois";
  } },
  { categoria: "ultimo-filho", roda: async (r) => {
    reiniciar();
    const c = await j(await chamar(r.filhoPost, LEG(4), { nome: "Unico", data_nascimento: "2020-01-01" }, "socio"));
    const fid = (c.data as { id: string }).id;
    const sem = await chamar(r.filhoDelete, LEG(4), undefined, "socio", { filhoId: fid });
    if (sem.status !== 422) return `remover o último filho sem confirmar deveria dar 422 (deu ${sem.status})`;
    if (filhosDe(LEG(4)).length !== 1) return "removeu o último filho sem confirmação";
    const com = await chamar(r.filhoDelete, LEG(4), undefined, "socio", { filhoId: fid }, "http://localhost/api/x?confirmado=1");
    return com.status === 200 && filhosDe(LEG(4)).length === 0 ? null : `com confirmação deveria remover (status ${com.status})`;
  } },
  { categoria: "precedencia", roda: async (_r, carregar) => {
    reiniciar();
    DB.tabelas.funcionario_perfil.push({ funcionario_id: F_ADM, sexo: "M", data_nascimento: "1960-01-01", grau_instrucao: "pos_graduacao", filhos_informado_em: "2026-01-01T00:00:00Z" }); // lixo (o trigger do banco recusaria)
    DB.tabelas.funcionario_filhos.push({ id: id(8001), funcionario_id: F_ADM, nome: "Filho Fantasma", data_nascimento: "2020-02-02" });
    const g = (await carregar(criarClienteServico(DB), { clienteId: CLI_A, unidadeRH: null, hojeISO: HOJE }))!;
    if (g.porSexo.masculino !== 0 || g.porSexo.feminino !== 1) return `o perfil manual prevaleceu sobre a admissão (M=${g.porSexo.masculino}, F=${g.porSexo.feminino})`;
    if (g.escolaridade.find((e) => e.grau === "pos_graduacao")!.total !== 0) return "a instrução manual prevaleceu sobre a da admissão";
    if (g.filhos.com !== 1) return `os filhos manuais se misturaram aos da admissão (com=${g.filhos.com})`;
    return null;
  } },
];

await ok("rotas reais passam em TODAS as provas (unidade, papel, admissão 409, validações, auditoria com nome real e antes/depois, último filho, precedência)", async () => {
  for (const p of PROVAS) assert.equal(await p.roda(REAIS, carregarGestaoPessoas), null, p.categoria);
});

// ── Validações em detalhe ────────────────────────────────────────────────────
await ok("nascimento: 14 e 90 anos exatos salvam direto; 13 e 91 pedem confirmação (422); sexo e instrução só dos valores permitidos; corpo vazio = 400; sexo/instrução nulos limpam", async () => {
  reiniciar();
  for (const [nasc, status] of [["2012-11-18", 200], ["1936-11-18", 200], ["2012-11-19", 422], ["1935-11-18", 422]] as const) assert.equal((await chamar(REAIS.perfil, LEG(5), { data_nascimento: nasc }, "socio")).status, status, nasc);
  assert.equal((await chamar(REAIS.perfil, LEG(5), { sexo: "X" }, "socio")).status, 400);
  assert.equal((await chamar(REAIS.perfil, LEG(5), { grau_instrucao: "doutorado" }, "socio")).status, 400);
  assert.equal((await chamar(REAIS.perfil, LEG(5), {}, "socio")).status, 400);
  assert.equal((await chamar(REAIS.perfil, LEG(5), { sexo: "M", grau_instrucao: "medio_completo" }, "socio")).status, 200);
  assert.equal(perfilDe(LEG(5))!.sexo, "M");
  assert.equal((await chamar(REAIS.perfil, LEG(5), { sexo: null, grau_instrucao: null }, "socio")).status, 200);
  assert.deepEqual([perfilDe(LEG(5))!.sexo, perfilDe(LEG(5))!.grau_instrucao], [null, null]);
  assert.equal(perfilDe(LEG(5))!.data_nascimento, "1936-11-18", "o nascimento não enviado não muda");
  assert.equal(await (async () => (await chamar(REAIS.perfil, id(7777), CORPO_OK, "socio")).status)(), 404, "funcionário inexistente");
});

await ok("filho: nome vazio/longo, nascimento ausente/futuro/1899 = 400; 14 anos ou mais aceita com aviso; PATCH só do próprio funcionário; DELETE de filho que não é do funcionário = 404; confirmar sem filhos só sem filho", async () => {
  reiniciar();
  for (const corpo of [{ nome: "", data_nascimento: "2020-01-01" }, { nome: "A".repeat(121), data_nascimento: "2020-01-01" }, { nome: "X" }, { nome: "X", data_nascimento: "2026-11-19" }, { nome: "X", data_nascimento: "1899-12-31" }, { nome: "X", data_nascimento: "2979-09-16" }]) {
    assert.equal((await chamar(REAIS.filhoPost, LEG(6), corpo, "socio")).status, 400, JSON.stringify(corpo).slice(0, 40));
  }
  const velho = await j(await chamar(REAIS.filhoPost, LEG(6), { nome: "Mais Velho", data_nascimento: "2000-01-01" }, "socio"));
  assert.match(String(velho.aviso), /não aparece na lista/);
  const novo = await j(await chamar(REAIS.filhoPost, LEG(6), { nome: "  Criança  ", data_nascimento: "2022-02-02" }, "socio"));
  const fid = (novo.data as { id: string }).id;
  assert.equal((novo.data as { nome: string }).nome, "Criança", "nome aparado");
  assert.ok(perfilDe(LEG(6))!.filhos_informado_em, "cadastrar o primeiro filho já conta como informado");
  assert.equal((await chamar(REAIS.filhoPatch, LEG(6), { nome: "Outro Nome" }, "socio", { filhoId: fid })).status, 200);
  assert.equal(filhosDe(LEG(6)).find((f) => f.id === fid)!.nome, "Outro Nome");
  assert.equal((await chamar(REAIS.filhoPatch, LEG(7), { nome: "Invasor" }, "socio", { filhoId: fid })).status, 404, "filho de outro funcionário");
  assert.equal((await chamar(REAIS.filhoDelete, LEG(7), undefined, "socio", { filhoId: fid })).status, 404);
  assert.equal((await chamar(REAIS.filhoPatch, LEG(6), { data_nascimento: "2026-11-19" }, "socio", { filhoId: fid })).status, 400);
  assert.equal((await chamar(REAIS.filhoPatch, LEG(6), {}, "socio", { filhoId: fid })).status, 400);
  assert.equal((await chamar(REAIS.confirmar, LEG(6), undefined, "socio")).status, 409, "tem filhos: não confirma 'sem filhos'");
  // remover um filho que NÃO é o último não pede confirmação
  assert.equal((await chamar(REAIS.filhoDelete, LEG(6), undefined, "socio", { filhoId: fid })).status, 200);
  assert.equal(filhosDe(LEG(6)).length, 1);
});

await ok("confirmar sem filhos: grava a confirmação uma vez (idempotente, sem auditoria duplicada); remover o último filho mantém 'Sem filhos declarados'", async () => {
  reiniciar();
  const c1 = await chamar(REAIS.confirmar, LEG(8), undefined, "socio");
  assert.equal(c1.status, 200);
  assert.ok(perfilDe(LEG(8))!.filhos_informado_em);
  assert.equal(perfilDe(LEG(8))!.filhos_informado_por, U_SOCIO);
  const c2 = await chamar(REAIS.confirmar, LEG(8), undefined, "socio");
  assert.equal(c2.status, 200);
  assert.equal(auditorias("filhos_confirmado_sem_filhos").length, 1, "uma auditoria só");
  const g = await gestao();
  assert.equal(g.filhos.sem, 1, "o confirmado conta como 'sem filhos declarados'");
  // cadastra e remove o último filho (com confirmação): continua informado
  const f = await j(await chamar(REAIS.filhoPost, LEG(9), { nome: "Temp", data_nascimento: "2021-01-01" }, "socio"));
  await chamar(REAIS.filhoDelete, LEG(9), undefined, "socio", { filhoId: (f.data as { id: string }).id }, "http://localhost/api/x?confirmado=1");
  assert.equal(filhosDe(LEG(9)).length, 0);
  assert.equal((await gestao()).filhos.sem, 2, "sem filhos declarados também para quem removeu o último filho");
});

// ── Auditoria ────────────────────────────────────────────────────────────────
await ok("auditoria: perfil_editado (antes/depois), filho_criado (nome e nascimento), filho_editado (diff), filho_removido (antes), filhos_confirmado_sem_filhos — nome real e entidade funcionarios", async () => {
  reiniciar();
  await chamar(REAIS.perfil, LEG(10), { sexo: "M", data_nascimento: "1980-01-01", grau_instrucao: "medio_completo" }, "socio");
  await chamar(REAIS.perfil, LEG(10), { sexo: "F" }, "socio");
  const f = await j(await chamar(REAIS.filhoPost, LEG(10), { nome: "Ana", data_nascimento: "2019-05-05" }, "sup1"));
  const fid = (f.data as { id: string }).id;
  await chamar(REAIS.filhoPatch, LEG(10), { nome: "Ana Clara" }, "sup1", { filhoId: fid });
  await chamar(REAIS.filhoDelete, LEG(10), undefined, "sup1", { filhoId: fid }, "http://localhost/api/x?confirmado=1");
  await chamar(REAIS.confirmar, LEG(11), undefined, "dp");
  const todas = auditorias();
  assert.deepEqual(todas.map((a) => a.acao), ["funcionario_perfil_editado", "funcionario_perfil_editado", "funcionario_filho_criado", "funcionario_filho_editado", "funcionario_filho_removido", "filhos_confirmado_sem_filhos"]);
  assert.ok(todas.every((a) => a.entidade === "funcionarios"));
  assert.deepEqual(todas.map((a) => a.entidade_id), [LEG(10), LEG(10), LEG(10), LEG(10), LEG(10), LEG(11)]);
  assert.deepEqual(todas.map((a) => a.usuario_nome), ["Sócia Diretora", "Sócia Diretora", "Supervisora Um", "Supervisora Um", "Supervisora Um", "Pessoa do DP"], "nome real, não o e-mail");
  const d = todas.map((a) => a.detalhes as Record<string, any>);
  assert.deepEqual(d[0].diff, { sexo: { antes: null, depois: "M" }, data_nascimento: { antes: null, depois: "1980-01-01" }, grau_instrucao: { antes: null, depois: "medio_completo" } });
  assert.deepEqual(d[1].diff, { sexo: { antes: "M", depois: "F" } });
  assert.deepEqual([d[2].nome, d[2].data_nascimento], ["Ana", "2019-05-05"], "decisão do Ölver: nome e nascimento do filho no log");
  assert.deepEqual(d[3].diff, { nome: { antes: "Ana", depois: "Ana Clara" } });
  assert.deepEqual(d[4].antes, { nome: "Ana Clara", data_nascimento: "2019-05-05" });
  assert.equal(d[4].ultimo_filho, true);
  assert.equal(d[5].antes.filhos_informado_em, null);
  assert.ok(typeof d[5].depois.filhos_informado_em === "string");
  // tentativas recusadas não geram auditoria
  const antes = auditorias().length;
  await chamar(REAIS.perfil, LEG(10), { data_nascimento: "2979-09-16" }, "socio");
  await chamar(REAIS.perfil, LEG(10), CORPO_OK, "analista");
  assert.equal(auditorias().length, antes);
});

// ── Efeito na Gestão de Pessoas ──────────────────────────────────────────────
await ok("os 17 legados saem de 'Não informado' conforme o RH completa: sexo, instrução, idade/faixa/aniversariantes; filhos só quando informados (sem confirmação = 'Não informado')", async () => {
  reiniciar();
  const antes = await gestao();
  assert.equal(antes.totalAtivos, 18);
  assert.equal(antes.porSexo.naoInformado, 17);
  assert.equal(antes.escolaridade.find((e) => e.naoInformado)!.total, 17);
  assert.deepEqual([antes.filhos.com, antes.filhos.sem, antes.filhos.naoInformado], [1, 0, 17], "só quem veio por admissão tem filho informado");
  for (let i = 1; i <= 17; i++) {
    const r = await chamar(REAIS.perfil, LEG(i), { sexo: i <= 10 ? "M" : "F", data_nascimento: NASC_LEG(i), grau_instrucao: GRAU_INSTRUCAO_OPTIONS[i % GRAU_INSTRUCAO_OPTIONS.length].value }, "socio");
    assert.equal(r.status, 200, `legado ${i}`);
  }
  const meio = await gestao();
  assert.equal(meio.porSexo.naoInformado, 0, "sexo completo para os 17");
  assert.equal(meio.porSexo.masculino, 10);
  assert.equal(meio.porSexo.feminino, 8, "7 mulheres legadas + a da admissão");
  assert.equal(meio.escolaridade.find((e) => e.naoInformado)!.total, 0);
  assert.equal(meio.faixaPorSexo.find((f) => f.faixa === "nao_informada")!.total, 0);
  assert.equal(meio.aniversariantesPorMes.reduce((s, m) => s + m.aniversariantes.length, 0), 18, "todos entram nos aniversariantes");
  assert.deepEqual([meio.filhos.com, meio.filhos.sem, meio.filhos.naoInformado], [1, 0, 17], "perfil sem confirmação de filhos: filhos continuam 'Não informado'");
  // filhos: Legado 1 com 2 filhos, Legado 2 só com filho de 14, Legado 3 confirmado sem filhos
  await chamar(REAIS.filhoPost, LEG(1), { nome: "Filho Um", data_nascimento: "2019-01-01" }, "socio");
  await chamar(REAIS.filhoPost, LEG(1), { nome: "Filho Dois", data_nascimento: "2022-02-02" }, "socio");
  await chamar(REAIS.filhoPost, LEG(2), { nome: "Adolescente", data_nascimento: "2012-01-01" }, "socio");
  await chamar(REAIS.confirmar, LEG(3), undefined, "socio");
  const depois = await gestao();
  assert.deepEqual([depois.filhos.com, depois.filhos.sem, depois.filhos.naoInformado], [2, 2, 14]);
  assert.equal(depois.filhos.com + depois.filhos.sem + depois.filhos.naoInformado, depois.totalAtivos);
  assert.deepEqual(depois.filhos.comPorSexo, { masculino: 1, feminino: 1, naoInformado: 0 });
  // idade fora da faixa confirmada vira "inconsistente" (Idade não informada), como para quem veio por admissão
  await chamar(REAIS.perfil, LEG(12), { data_nascimento: "2020-01-01", confirmado: true }, "socio");
  const incons = await gestao();
  assert.equal(incons.dadosInconsistentes, 1);
  assert.equal(incons.faixaPorSexo.find((f) => f.faixa === "nao_informada")!.total, 1);
});

await ok("tabela ausente (migração pendente): a leitura trata como vazio e a Gestão abre ('Não informado'); a escrita responde 503 claro; funcionário com admissão não é afetado", async () => {
  reiniciar();
  const erro = { code: "42P01", message: 'relation "public.funcionario_perfil" does not exist' };
  DB.falhas["funcionario_perfil.select"] = erro;
  DB.falhas["funcionario_filhos.select"] = { code: "42P01", message: 'relation "public.funcionario_filhos" does not exist' };
  const g = await gestao();
  assert.equal(g.totalAtivos, 18);
  assert.equal(g.porSexo.naoInformado, 17);
  assert.deepEqual([g.filhos.com, g.filhos.sem, g.filhos.naoInformado], [1, 0, 17]);
  assert.equal(g.porSexo.feminino, 1, "o da admissão segue normal");
  for (const resp of [await chamar(REAIS.perfil, LEG(1), CORPO_OK, "socio"), await chamar(REAIS.confirmar, LEG(1), undefined, "socio")]) {
    assert.equal(resp.status, 503);
    assert.match(String((await j(resp)).error), /migração pendente/);
  }
  DB.falhas["funcionario_filhos.insert"] = { code: "42P01", message: 'relation "public.funcionario_filhos" does not exist' };
  delete DB.falhas["funcionario_perfil.select"];
  assert.equal((await chamar(REAIS.filhoPost, LEG(1), { nome: "X", data_nascimento: "2020-01-01" }, "socio")).status, 503);
  // as páginas só desestruturam `data` (erro de tabela ausente não derruba): sem throw/error nas consultas novas
  for (const arq of ["src/app/painel/funcionarios/page.tsx", "src/app/painel/funcionarios/[id]/page.tsx"]) {
    const src = fonte(arq);
    const bloco = src.slice(src.indexOf('from("funcionario_perfil")') - 200, src.indexOf('from("funcionario_filhos")') + 300);
    assert.ok(!/\bthrow\b|\berror\b/.test(bloco.replace(/\/\/.*$/gm, "")), `${arq}: consulta nova sem tratamento de erro que derrube`);
  }
});

await ok("portal: o cliente passa a ver só números e a lista que já existem (filhos com nome e idade, 'Dado não cadastrado' para quem falta); JSON sem ids, CPF, RG, PIS, nascimentos exatos, sexo/idade/escolaridade", async () => {
  reiniciar();
  for (let i = 1; i <= 17; i++) await chamar(REAIS.perfil, LEG(i), { sexo: i <= 10 ? "M" : "F", data_nascimento: NASC_LEG(i), grau_instrucao: "medio_completo" }, "socio");
  await chamar(REAIS.filhoPost, LEG(1), { nome: "Filho Um", data_nascimento: "2019-01-01" }, "socio");
  await chamar(REAIS.filhoPost, LEG(1), { nome: "Filho Dois", data_nascimento: "2022-02-02" }, "socio");
  await chamar(REAIS.filhoPost, LEG(2), { nome: "Adolescente", data_nascimento: "2012-01-01" }, "socio");
  await chamar(REAIS.confirmar, LEG(3), undefined, "socio");
  DB.usuario = null;
  DB.usuarioPortal = { id: P_A, email: "c@c.local" };
  const resp = await REAIS.portalLista(new Request("http://localhost/api/portal/gestao-pessoas/lista", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filtros: {} }) }));
  await flush();
  const txt = await resp.text();
  const lista = JSON.parse(txt) as { total: number; linhas: { nome: string; filhos: string }[] };
  assert.equal(lista.total, 18);
  const de = (nome: string) => lista.linhas.find((l) => l.nome === nome)!.filhos;
  assert.equal(de("Legado 01"), "Filho Um (7 anos), Filho Dois (4 anos)");
  assert.equal(de("Legado 02"), "Sem filhos menores de 14");
  assert.equal(de("Legado 03"), "Sem filhos declarados");
  assert.equal(de("Legado 04"), "Dado não cadastrado");
  assert.deepEqual(Object.keys(lista.linhas[0]).sort(), ["cargo", "dataAdmissao", "filhos", "nome", "tempoDeCasa"]);
  const proibidos = [
    ...tabela("funcionarios").flatMap((f) => [String(f.id), String(f.admissao_id ?? "")]), CLI_A, CLI_B, UN1, UN2, ADM1, "CPFADM", "RGADM", "PISADM", "CPFFILHAADM",
    ...Array.from({ length: 17 }, (_, k) => NASC_LEG(k + 1)), "2019-01-01", "2022-02-02", "2012-01-01", "1990-05-05", "2018-01-01", String(id(7001)),
    ...tabela("funcionario_filhos").map((f) => String(f.id)),
  ].filter(Boolean);
  const achado = proibidos.find((v) => txt.includes(v));
  assert.equal(achado, undefined, `o JSON do portal contém ${achado}`);
  assert.ok(!/"(sexo|idade|escolaridade|id|funcionario_id|admissao_id|cliente_id|cpf|data_nascimento|dataNascimento)"\s*:/i.test(txt));
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(txt), "nenhuma data ISO");
});

// ── Migração ─────────────────────────────────────────────────────────────────
await ok("migração (arquivo, NÃO aplicada): tabelas, constraints iguais às da admissão, trigger 'só legado', RLS com service_role e analistas, SEM política de cliente, idempotente, rollback documentado", () => {
  const sql = fonte("supabase/migration_funcionario_perfil.sql");
  const semComentario = sql.replace(/^--.*$/gm, "");
  assert.ok(semComentario.includes("create table if not exists public.funcionario_perfil") && semComentario.includes("create table if not exists public.funcionario_filhos"));
  assert.ok(semComentario.includes("funcionario_id        uuid primary key references public.funcionarios(id) on delete cascade"));
  assert.ok(semComentario.includes("funcionario_id   uuid not null references public.funcionarios(id) on delete cascade"));
  assert.ok(semComentario.includes("sexo                  text check (sexo in ('M', 'F'))"));
  for (const g of GRAU_INSTRUCAO_OPTIONS) assert.ok(semComentario.includes(`'${g.value}'`), g.value);
  assert.equal([...semComentario.matchAll(/'(fundamental|medio|superior|pos)_[a-z]+'/g)].length, GRAU_INSTRUCAO_OPTIONS.length, "exatamente os 7 graus");
  for (const coluna of ["filhos_informado_em", "filhos_informado_por", "atualizado_por", "criado_por"]) assert.ok(semComentario.includes(coluna), coluna);
  assert.equal((semComentario.match(/enable row level security/g) ?? []).length, 2);
  assert.equal((semComentario.match(/create policy/g) ?? []).length, 4);
  assert.ok(semComentario.includes("to service_role") && semComentario.includes("is_analista()"));
  assert.ok(!/cliente_le_proprios|clientes_do_usuario/.test(semComentario), "sem política de cliente");
  assert.ok(semComentario.includes("create or replace function public.funcionario_so_legado()") && (semComentario.match(/execute function public\.funcionario_so_legado\(\)/g) ?? []).length === 2);
  assert.ok(semComentario.includes("f.admissao_id is not null"));
  assert.ok(!/\b(drop table|alter table public\.funcionarios|alter table public\.admissao)/.test(semComentario), "só aditiva: nenhuma alteração em tabela existente nem drop");
  assert.ok(/drop table if exists public\.funcionario_filhos/.test(sql) && /ROLLBACK/.test(sql), "rollback documentado");
  assert.equal((semComentario.match(/create trigger/g) ?? []).length, (semComentario.match(/drop trigger if exists/g) ?? []).length, "trigger idempotente");
  // nenhum código aplica a migração sozinho (só comentários citam o arquivo)
  for (const arq of fs.readdirSync("src/lib").filter((a) => a.endsWith(".ts"))) assert.ok(!fonte(`src/lib/${arq}`).replace(/\/\/.*$/gm, "").includes("migration_funcionario_perfil"), arq); // citar o arquivo em comentário é ok; executar, não
});

await ok("telas: cartão 'Dados pessoais e filhos' na página do funcionário (só leitura com link para a admissão), selo 'Completar cadastro' e chip 'Cadastro incompleto · N' só de ativos; acessibilidade básica", () => {
  const card = fonte("src/components/FuncionarioDadosPessoais.tsx");
  for (const t of ["Salvar dados pessoais", "Este funcionário não tem filhos", '"Sem filhos declarados', "Confirmar e salvar", "+ Adicionar filho(a)", "Sim, remover", "Salvar filho", 'role="status" aria-live="polite"', 'role="alertdialog"', "htmlFor=", 'max={hojeISO}', "Este funcionário veio por admissão digital", "/painel/admissoes/"]) assert.ok(card.includes(t), t);
  assert.ok(card.includes("minHeight: 44"), "botões com área de toque de 44px");
  const detalhe = fonte("src/components/FuncionarioDetalheClient.tsx");
  assert.ok(detalhe.includes("<FuncionarioDadosPessoais funcionarioId={funcionario.id} admissaoId={funcionario.admissao_id}"));
  const lista = fonte("src/components/FuncionariosPageClient.tsx");
  assert.ok(lista.includes("Completar cadastro") && lista.includes("Cadastro incompleto · {totalIncompletos}") && lista.includes("#dados-pessoais"));
  assert.ok(lista.includes("const totalIncompletos = useMemo(() => ativos.filter((f) => f.faltas_cadastro.length > 0).length, [ativos]);"), "o chip conta só ativos");
  const pagina = fonte("src/app/painel/funcionarios/page.tsx");
  assert.ok(pagina.includes('faltas_cadastro: f.status === "ativo" ? faltasDoCadastro(') && pagina.includes('f.status === "ativo" && !f.admissao_id'), "selo e chip só olham ativos sem admissão");
});

// ── Provas de falha ──────────────────────────────────────────────────────────
type Sabotagem = { nome: string; categoria: string; arquivos: { de: string; para: string; trocas: [string, string][] }[]; rotas: Partial<Record<keyof Rotas, string>>; carregador?: string };
const S = "__sabP";
const rotasDoEditor = (i: number, gate?: string) => ({
  perfil: [ROTA.perfil, `src/app/api/funcionarios/[id]/perfil/${S}${i}.ts`], filhoPost: [ROTA.filhos, `src/app/api/funcionarios/[id]/filhos/${S}${i}.ts`],
  filhoPatch: [ROTA.filho, `src/app/api/funcionarios/[id]/filhos/[filhoId]/${S}${i}p.ts`], filhoDelete: [ROTA.filho, `src/app/api/funcionarios/[id]/filhos/[filhoId]/${S}${i}d.ts`],
  confirmar: [ROTA.confirmar, `src/app/api/funcionarios/[id]/filhos/confirmar-sem-filhos/${S}${i}.ts`],
}) as Record<string, [string, string]>;

function sabotagemGate(i: number, nome: string, categoria: string, trocasGate: [string, string][]): Sabotagem {
  const r = rotasDoEditor(i);
  const gate = `src/lib/${S}${i}_gate.ts`;
  const apontar: [string, string][] = [['"@/lib/funcionarioPerfilRota"', `"@/lib/${S}${i}_gate"`]];
  return {
    nome, categoria,
    arquivos: [{ de: "src/lib/funcionarioPerfilRota.ts", para: gate, trocas: trocasGate }, ...Object.values(r).map(([de, para]) => ({ de, para, trocas: apontar }))],
    rotas: { perfil: r.perfil[1], filhoPost: r.filhoPost[1], filhoPatch: r.filhoPatch[1], filhoDelete: r.filhoDelete[1], confirmar: r.confirmar[1] },
  };
}
function sabotagemRota(i: number, nome: string, categoria: string, qual: keyof typeof ROTA_CHAVE, trocas: [string, string][]): Sabotagem {
  const r = rotasDoEditor(i);
  const chave = ROTA_CHAVE[qual];
  return { nome, categoria, arquivos: [{ de: r[chave][0], para: r[chave][1], trocas }], rotas: { [chave]: r[chave][1] } };
}
const ROTA_CHAVE = { perfil: "perfil", filhoDelete: "filhoDelete" } as const;

function sabotagemSchema(i: number): Sabotagem {
  const r = rotasDoEditor(i);
  const sch = `src/lib/${S}${i}_schemas.ts`;
  const apontar: [string, string][] = [['"@/lib/schemas"', `"@/lib/${S}${i}_schemas"`]];
  return {
    nome: "schema sem a trava de nascimento futuro/1900 (aceita 2979 e amanhã)", categoria: "validacao",
    arquivos: [{ de: "src/lib/schemas.ts", para: sch, trocas: [["v <= formatarDataISO(obterDataHojeBrasil())", "true"], ["v >= NASCIMENTO_MINIMO", "true"]] }, { de: r.perfil[0], para: r.perfil[1], trocas: apontar }, { de: r.filhoPost[0], para: r.filhoPost[1], trocas: apontar }],
    rotas: { perfil: r.perfil[1], filhoPost: r.filhoPost[1] },
  };
}

const SABOTAGENS: Sabotagem[] = [
  sabotagemSchema(8),
  sabotagemGate(1, "editor sem a checagem de unidade", "unidade", [["  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, funcionarioId);\n  if (bloqueioUnidade) return bloqueioUnidade;\n", ""]]),
  sabotagemGate(2, "editor sem a checagem de papel (analista comum edita)", "papel", [["  const negado = await checarPapelFuncionarios(user);\n  if (negado) return negado;\n", ""]]),
  sabotagemGate(3, "editor que aceita funcionário com admissão (sem o 409)", "admissao", [["if (funcionario.admissao_id) {", "if (false && funcionario.admissao_id) {"]]),
  sabotagemRota(4, "rota de perfil sem a validação de idade (nunca avisa)", "validacao", "perfil", [["if (typeof campos.data_nascimento === \"string\" && !confirmado) {", "if (false && typeof campos.data_nascimento === \"string\" && !confirmado) {"]]),
  sabotagemRota(5, "rota de perfil sem auditoria", "auditoria", "perfil", [["    await auditarPerfil(p.user, id, \"funcionario_perfil_editado\", { diff: diffCampos(antes, campos) });\n", ""]]),
  sabotagemRota(6, "remover o último filho sem pedir confirmação", "ultimo-filho", "filhoDelete", [["new URL(request.url).searchParams.get(\"confirmado\") !== \"1\")", "false)"]]),
  {
    nome: "carregador que deixa o perfil manual prevalecer sobre a admissão (precedência invertida)", categoria: "precedencia", rotas: {}, carregador: `src/lib/${S}7_gestaoPessoas.ts`,
    arquivos: [{ de: "src/lib/gestaoPessoas.ts", para: `src/lib/${S}7_gestaoPessoas.ts`, trocas: [["    if (!f.admissao_id) {\n      const p = perfilManual.get(f.id);", "    if (true) {\n      const p = perfilManual.get(f.id);"], ["  const legadoIds = funcionarios.filter((fu) => !fu.admissao_id).map((fu) => fu.id);", "  const legadoIds = funcionarios.map((fu) => fu.id);"]] }],
  },
];

await ok("provas de falha: cada versão sabotada (sem unidade, sem papel, admissão aceita, sem aviso de idade, sem auditoria, último filho sem confirmar, precedência invertida) é reprovada pela prova da sua categoria; as reais passam", async () => {
  const criados: string[] = [];
  try {
    for (const s of SABOTAGENS) {
      for (const a of s.arquivos) {
        let t = fonte(a.de);
        for (const [de, para] of a.trocas) { assert.equal(t.split(de).length, 2, `âncora (${s.nome}): ${de.slice(0, 60)}`); t = t.replace(de, () => para); }
        fs.writeFileSync(a.para, t); criados.push(a.para);
      }
      const rotas: Rotas = { ...REAIS };
      for (const [k, arq] of Object.entries(s.rotas)) rotas[k as keyof Rotas] = (await imp(arq!, k === "filhoPost" ? "POST" : k === "filhoPatch" ? "PATCH" : k === "filhoDelete" ? "DELETE" : k === "perfil" ? "PUT" : "POST")) as never;
      const carregar = s.carregador ? ((await import(`../${s.carregador}`)) as { carregarGestaoPessoas: typeof carregarGestaoPessoas }).carregarGestaoPessoas : carregarGestaoPessoas;
      const reprovadas: string[] = [];
      for (const p of PROVAS) { const f = await p.roda(rotas, carregar); if (f) reprovadas.push(`${p.categoria}: ${f}`); }
      const pega = reprovadas.find((r) => r.startsWith(`${s.categoria}:`));
      assert.ok(pega, `a sabotagem "${s.nome}" NÃO foi pega (reprovou: ${JSON.stringify(reprovadas)})`);
      console.log(`   sabotagem pega — ${s.nome}: ${pega}`);
    }
    for (const p of PROVAS) assert.equal(await p.roda(REAIS, carregarGestaoPessoas), null, `as rotas reais reprovaram em ${p.categoria}`);
  } finally { for (const a of criados) fs.rmSync(a, { force: true }); }
  for (const a of criados) assert.ok(!fs.existsSync(a), "arquivo de sabotagem removido");
});

console.log(`\n${n} verificações OK`);
