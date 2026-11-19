// Verificação da reativação de candidata que saiu do processo (Não tem interesse / Não compareceu) na MESMA vaga:
//   POST /api/candidatos-vagas (409 com código, sem duplicar) e POST /api/candidatos-vagas/[id]/reativar. O projeto não tem runner de testes: as rotas
//   rodam contra o banco em memória do harness (scripts/harness-mot/memdb.mjs). Nada toca o Supabase real; os dados são ZZTEST e só existem em memória.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-reativacao-candidatura.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import * as rotaLista from "@/app/api/candidatos-vagas/route";
import * as rotaReativar from "@/app/api/candidatos-vagas/[id]/reativar/route";
import { candidatoVagaReativarSchema } from "@/lib/schemas";
import { DESTINOS_REATIVACAO, ETAPAS_REATIVAVEIS, ehEtapaReativavel, getEtapaLabel } from "@/lib/etapasCandidatura";
import { diaMesDaData } from "@/components/ModalReativarCandidatura";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const U1 = "11111111-1111-4111-8111-000000000001", U2 = "11111111-1111-4111-8111-000000000002";
const ANA = "22222222-2222-4222-8222-000000000001", ANA2 = "22222222-2222-4222-8222-000000000002", DIR = "22222222-2222-4222-8222-000000000003";
const VAGA = "33333333-3333-4333-8333-000000000001", V_PAUSADA = "33333333-3333-4333-8333-000000000002", V_FECHADA = "33333333-3333-4333-8333-000000000003";
const V_CANCELADA = "33333333-3333-4333-8333-000000000004", V_OUTRA = "33333333-3333-4333-8333-000000000005", V_U2 = "33333333-3333-4333-8333-000000000006";
const CAND = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
const CV = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const ANTES = "2026-11-17T15:39:45.702Z";

type Extra = Record<string, unknown>;
const cvBase = (n: number, candidato: number, vaga: string, etapa: string, extra: Extra = {}) => ({
  id: CV(n), candidato_id: CAND(candidato), vaga_id: vaga, etapa, responsavel: "ZZTEST Responsável", observacoes: "obs antiga", motivo_reprovacao: null,
  match_score: 77, data_entrevista_salmazos: "2026-11-10", created_at: "2026-11-06T20:08:19.192Z", updated_at: ANTES, ...extra,
});

function novoDb(extra: Record<string, unknown[]> = {}) {
  const db: any = criarDb({
    unidades: [{ id: U1, slug: "hortolandia" }, { id: U2, slug: "sbc" }],
    analistas_perfil: [
      { id: ANA, user_id: "u-ana", nome_completo: "ZZTEST Andreza", nivel_acesso: "analista", unidade_id: U1, acesso_todas_unidades: false, ativo: true },
      { id: ANA2, user_id: "u-ana2", nome_completo: "ZZTEST Outra Unidade", nivel_acesso: "analista", unidade_id: U2, acesso_todas_unidades: false, ativo: true },
      { id: DIR, user_id: "u-dir", nome_completo: "ZZTEST Diretora", nivel_acesso: "diretoria", unidade_id: U1, acesso_todas_unidades: true, ativo: true },
    ],
    vagas: [
      { id: VAGA, titulo: "ZZTEST Ajudante Geral", status: "aberta", unidade_id: U1, unidades: { slug: "hortolandia" } },
      { id: V_PAUSADA, titulo: "ZZTEST Vaga pausada", status: "pausada", unidade_id: U1 },
      { id: V_FECHADA, titulo: "ZZTEST Vaga fechada", status: "fechada", unidade_id: U1 },
      { id: V_CANCELADA, titulo: "ZZTEST Vaga cancelada", status: "cancelada", unidade_id: U1 },
      { id: V_OUTRA, titulo: "ZZTEST Outra vaga", status: "aberta", unidade_id: U1 },
      { id: V_U2, titulo: "ZZTEST Vaga de outra unidade", status: "aberta", unidade_id: U2 },
    ],
    candidatos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ id: CAND(n), nome_completo: `ZZTEST Candidata ${n}`, bloqueado: false })),
    candidatos_vagas: [
      cvBase(1, 1, VAGA, "nao_tem_interesse", { motivo_reprovacao: "Disse que não tinha interesse" }),
      cvBase(2, 2, VAGA, "nao_compareceu"),
      cvBase(3, 3, VAGA, "reprovado"), cvBase(4, 4, VAGA, "reprovado_cliente"), cvBase(5, 5, VAGA, "reprovado_final"),
      cvBase(6, 6, VAGA, "triagem"), cvBase(7, 7, VAGA, "contratado"),
      cvBase(8, 8, VAGA, "nao_tem_interesse"), // candidato bloqueado (abaixo)
      cvBase(9, 9, V_PAUSADA, "nao_tem_interesse"), cvBase(10, 9, V_FECHADA, "nao_tem_interesse"), cvBase(11, 9, V_CANCELADA, "nao_tem_interesse"),
      cvBase(12, 10, V_U2, "nao_tem_interesse"),
      // Candidata 2 também está em processo ativo em OUTRA vaga (aviso, não bloqueio).
      cvBase(13, 2, V_OUTRA, "entrevista_cliente", { responsavel: "ZZTEST Colega" }),
    ],
    encaminhamentos: [{ id: "enc-1", candidato_id: CAND(1), cliente_id: "c1", vaga_id: VAGA, status: "desistiu", created_at: "2026-11-06T20:09:59Z" }],
    historico_candidato: [],
    audit_logs: [],
    ...extra,
  });
  db.tabelas.candidatos.find((c: any) => c.id === CAND(8)).bloqueado = true;
  db.rpcs = {};
  return db;
}

type Resposta = { status: number; body: any };
async function chamar(db: any, usuario: string | null, fn: (...a: any[]) => Promise<Response>, corpo: unknown, id?: string): Promise<Resposta> {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: usuario === "u-dir" ? "diretoria" : "analista" } } : null;
  globalThis.__DB__ = db;
  globalThis.__PENDENTES__ = [];
  const req = Object.assign(new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }), { nextUrl: new URL("http://x/api") });
  const r = await fn(req as any, { params: Promise.resolve({ id }) });
  await Promise.all(globalThis.__PENDENTES__ ?? []);
  await new Promise((resolve) => setImmediate(resolve));
  return { status: r.status, body: await r.json() };
}
const reativar = (db: any, n: number, corpo: unknown, usuario: string | null = "u-ana") => chamar(db, usuario, rotaReativar.POST, corpo, CV(n));
const vincular = (db: any, candidato: number, vaga = VAGA, usuario = "u-ana") => chamar(db, usuario, rotaLista.POST, { vaga_id: vaga, candidato_id: CAND(candidato), etapa: "triagem" });
const cv = (db: any, n: number) => db.tabelas.candidatos_vagas.find((c: any) => c.id === CV(n));
const snapshot = (db: any) => structuredClone(db.tabelas);

await caso("constantes: só nao_tem_interesse e nao_compareceu são reativáveis; destinos = triagem e entrevista_salmazos (nunca o cliente)", () => {
  assert.deepEqual([...ETAPAS_REATIVAVEIS], ["nao_tem_interesse", "nao_compareceu"]);
  assert.deepEqual([...DESTINOS_REATIVACAO], ["triagem", "entrevista_salmazos"]);
  for (const e of ["nao_tem_interesse", "nao_compareceu"]) assert.equal(ehEtapaReativavel(e), true);
  for (const e of ["reprovado", "reprovado_cliente", "reprovado_final", "bloqueado", "triagem", "contratado", "", null, undefined]) assert.equal(ehEtapaReativavel(e as any), false, String(e));
});
await caso("Zod: destino obrigatório e só triagem / entrevista_salmazos (nunca entrevista_cliente, aprovado_cliente, contratado)", () => {
  const ok = (c: unknown) => candidatoVagaReativarSchema.safeParse(c);
  assert.ok(ok({ destino: "triagem" }).success);
  assert.ok(ok({ destino: "entrevista_salmazos" }).success);
  for (const ruim of [{}, { destino: "" }, { destino: "entrevista_cliente" }, { destino: "aprovado_cliente" }, { destino: "contratado" }, { destino: "nao_tem_interesse" }, { destino: 1 }, null, "triagem"]) {
    assert.ok(!ok(ruim).success, JSON.stringify(ruim));
  }
});

// ── POST /api/candidatos-vagas: continua sem duplicar; muda só a resposta ────
await caso("POST: vínculo em nao_tem_interesse / nao_compareceu → 409 com código vinculo_em_etapa_final, etapa, rótulo e id; NÃO cria segundo vínculo", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  for (const [cand, n, etapa, rotulo] of [[1, 1, "nao_tem_interesse", "Não tem Interesse"], [2, 2, "nao_compareceu", "Não Compareceu"]] as const) {
    const r = await vincular(db, cand);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual({ codigo: r.body.codigo, etapa: r.body.etapa, etapa_label: r.body.etapa_label, cv_id: r.body.cv_id }, { codigo: "vinculo_em_etapa_final", etapa, etapa_label: rotulo, cv_id: CV(n) });
    assert.equal(r.body.error, `Esta candidata está como ${rotulo} nesta vaga.`);
  }
  assert.deepEqual(snapshot(db), antes, "nada mudou: o mesmo número de vínculos, nenhuma escrita");
  assert.equal(db.tabelas.candidatos_vagas.filter((c: any) => c.vaga_id === VAGA && c.candidato_id === CAND(1)).length, 1);
});
await caso("POST: saída NÃO reativável (reprovado*) → 'A candidata está como [etapa] nesta vaga.' sem código; etapa ativa → 'já está em [etapa] nesta vaga.'", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  for (const [cand, rotulo] of [[3, "Reprovado"], [4, "Reprovado pelo Cliente"], [5, "Processo Encerrado"]] as const) {
    const r = await vincular(db, cand);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, `A candidata está como ${rotulo} nesta vaga.`);
    assert.equal(r.body.codigo, undefined, "sem oferta de reativar");
  }
  const ativa = await vincular(db, 6);
  assert.equal(ativa.status, 409);
  assert.equal(ativa.body.error, "A candidata já está em Triagem nesta vaga.");
  assert.equal(ativa.body.codigo, undefined);
  const contratada = await vincular(db, 7);
  assert.equal(contratada.body.error, "A candidata já está em Contratado nesta vaga.");
  assert.deepEqual(snapshot(db), antes);
});
await caso("POST: candidata sem vínculo continua sendo vinculada (201) e vaga pausada continua 409 — o fluxo normal não mudou", async () => {
  const db = novoDb();
  const n = db.tabelas.candidatos_vagas.length;
  const r = await vincular(db, 10, VAGA);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(db.tabelas.candidatos_vagas.length, n + 1);
  assert.equal(r.body.data.etapa, "triagem");
  const pausada = await vincular(db, 1, V_PAUSADA);
  assert.equal(pausada.status, 409);
  assert.match(pausada.body.error, /pausada/);
});

// ── POST /api/candidatos-vagas/[id]/reativar ─────────────────────────────────
for (const destino of ["triagem", "entrevista_salmazos"] as const) {
  await caso(`reativar → ${destino}: MESMO vínculo muda de etapa, updated_at atualizado, motivo limpo; nada duplicado nem tocado fora disso`, async () => {
    const db = novoDb();
    const antes = snapshot(db);
    const r = await reativar(db, 1, { destino });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual({ id: r.body.data.id, etapa: r.body.data.etapa, anterior: r.body.etapa_anterior }, { id: CV(1), etapa: destino, anterior: "nao_tem_interesse" });
    const c = cv(db, 1);
    assert.equal(c.etapa, destino);
    assert.equal(c.motivo_reprovacao, null, "motivo antigo limpo do vínculo");
    assert.ok(new Date(c.updated_at).getTime() > new Date(ANTES).getTime(), "updated_at atualizado (o SLA não nasce estourado)");
    assert.ok(Date.now() - new Date(c.updated_at).getTime() < 60_000);
    // Não mexe em match_score, observações, data da entrevista nem nos demais campos.
    assert.deepEqual({ match: c.match_score, obs: c.observacoes, ent: c.data_entrevista_salmazos, resp: c.responsavel, criado: c.created_at },
      { match: 77, obs: "obs antiga", ent: "2026-11-10", resp: "ZZTEST Responsável", criado: "2026-11-06T20:08:19.192Z" });
    assert.equal(db.tabelas.candidatos_vagas.length, antes.candidatos_vagas.length, "nenhum vínculo criado");
    assert.deepEqual(db.tabelas.encaminhamentos, antes.encaminhamentos, "encaminhamento intacto (continua 'desistiu')");
    assert.deepEqual(db.tabelas.candidatos, antes.candidatos);
    assert.deepEqual(db.tabelas.vagas, antes.vagas);
    const outros = db.tabelas.candidatos_vagas.filter((x: any) => x.id !== CV(1));
    assert.deepEqual(outros, antes.candidatos_vagas.filter((x: any) => x.id !== CV(1)), "os demais vínculos não mudam");
  });
}
await caso("reativar nao_compareceu → triagem funciona igual (sem motivo a limpar)", async () => {
  const db = novoDb();
  const r = await reativar(db, 2, { destino: "triagem" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(cv(db, 2).etapa, "triagem");
  assert.equal(r.body.etapa_anterior, "nao_compareceu");
});
await caso("reativar: histórico COM autor e metadata completa; auditoria com a unidade da vaga; sem e-mail nem aviso", async () => {
  const db = novoDb();
  const r = await reativar(db, 1, { destino: "triagem" });
  assert.equal(r.status, 200);
  const h = db.tabelas.historico_candidato;
  assert.equal(h.length, 1);
  assert.deepEqual({ candidato_id: h[0].candidato_id, tipo: h[0].tipo, criado_por: h[0].criado_por }, { candidato_id: CAND(1), tipo: "etapa_alterada", criado_por: "u-ana@t.local" });
  assert.match(h[0].descricao, /^Reativada: Não tem Interesse → Triagem/);
  assert.deepEqual(h[0].metadata, {
    cv_id: CV(1), vaga_id: VAGA, etapa_anterior: "nao_tem_interesse", etapa_nova: "triagem", reativado: true, motivo_reprovacao_anterior: "Disse que não tinha interesse",
    data_entrevista_salmazos_anterior: "2026-11-10",
  });
  const a = db.tabelas.audit_logs;
  assert.equal(a.length, 1);
  assert.deepEqual({ acao: a[0].acao, entidade: a[0].entidade, entidade_id: a[0].entidade_id, usuario_id: a[0].usuario_id, usuario_nome: a[0].usuario_nome, unidade_id: a[0].unidade_id },
    { acao: "candidatura_reativada", entidade: "candidatos_vagas", entidade_id: CV(1), usuario_id: "u-ana", usuario_nome: "ZZTEST Andreza", unidade_id: U1 });
  assert.equal(a[0].detalhes.motivo_reprovacao_anterior, "Disse que não tinha interesse");
  for (const tabela of ["notificacoes_analista", "emails_enviados", "lembretes"]) assert.equal(db.tabelas[tabela]?.length ?? 0, 0, `sem ${tabela}`);
  assert.deepEqual(db.avisosDisparados, [], "nenhum aviso disparado");
});
await caso("reativar: metadata do histórico leva data_entrevista_salmazos_anterior SÓ quando existe; a data NÃO é apagada do vínculo (nenhum destino)", async () => {
  for (const destino of ["triagem", "entrevista_salmazos"] as const) {
    const com = novoDb();
    assert.equal((await reativar(com, 1, { destino })).status, 200);
    assert.equal(com.tabelas.historico_candidato[0].metadata.data_entrevista_salmazos_anterior, "2026-11-10", destino);
    assert.equal(cv(com, 1).data_entrevista_salmazos, "2026-11-10", "a data continua no vínculo");
    assert.equal(com.tabelas.audit_logs.length, 1);
  }
  const sem = novoDb();
  cv(sem, 1).data_entrevista_salmazos = null;
  assert.equal((await reativar(sem, 1, { destino: "entrevista_salmazos" })).status, 200);
  assert.equal("data_entrevista_salmazos_anterior" in sem.tabelas.historico_candidato[0].metadata, false, "sem data, a chave nem aparece");
  assert.equal(cv(sem, 1).data_entrevista_salmazos, null);
  const semCampo = novoDb();
  delete cv(semCampo, 2).data_entrevista_salmazos;
  assert.equal((await reativar(semCampo, 2, { destino: "triagem" })).status, 200);
  assert.equal("data_entrevista_salmazos_anterior" in semCampo.tabelas.historico_candidato[0].metadata, false);
});
await caso("POST 409 leva a data da entrevista Salmazos do vínculo (ou null) para a tela avisar; nada é gravado", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  const com = await vincular(db, 1);
  assert.equal(com.status, 409);
  assert.equal(com.body.data_entrevista_salmazos, "2026-11-10");
  const db2 = novoDb();
  cv(db2, 2).data_entrevista_salmazos = null;
  const sem = await vincular(db2, 2);
  assert.equal(sem.body.data_entrevista_salmazos, null);
  assert.deepEqual(snapshot(db), antes);
});
await caso("diaMesDaData: AAAA-MM-DD vira DD/MM; vazio ou fora do formato não gera aviso", () => {
  assert.equal(diaMesDaData("2026-11-10"), "10/11");
  assert.equal(diaMesDaData("2026-01-05"), "05/01");
  assert.equal(diaMesDaData("2026-11-10T00:00:00Z"), "10/11");
  for (const ruim of [null, undefined, "", "10/11/2026", "abc"]) assert.equal(diaMesDaData(ruim), null, String(ruim));
});
await caso("reativar: destino inválido ou ausente → 400 e NADA muda (inclusive entrevista_cliente e aprovado_cliente)", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  for (const corpo of [{}, { destino: "entrevista_cliente" }, { destino: "aprovado_cliente" }, { destino: "contratado" }, { destino: "" }, { destino: 5 }, null]) {
    const r = await reativar(db, 1, corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  assert.deepEqual(snapshot(db), antes);
});
await caso("reativar: etapa NÃO reativável (reprovado*, bloqueado, triagem, contratado) → 409 e nada muda", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  for (const n of [3, 4, 5, 6, 7]) {
    const r = await reativar(db, n, { destino: "triagem" });
    assert.equal(r.status, 409, `cv ${n}`);
    assert.match(r.body.error, /não pode ser reativada/);
  }
  assert.deepEqual(snapshot(db), antes);
  db.tabelas.candidatos_vagas[0].etapa = "bloqueado";
  assert.equal((await reativar(db, 1, { destino: "triagem" })).status, 409);
});
await caso("reativar: segunda reativação da mesma candidata → 409 e nenhum histórico/auditoria duplicado", async () => {
  const db = novoDb();
  assert.equal((await reativar(db, 1, { destino: "triagem" })).status, 200);
  const depois1 = snapshot(db);
  const r2 = await reativar(db, 1, { destino: "entrevista_salmazos" });
  assert.equal(r2.status, 409);
  assert.deepEqual(snapshot(db), depois1);
  assert.equal(db.tabelas.historico_candidato.length, 1);
  assert.equal(db.tabelas.audit_logs.length, 1);
});
await caso("reativar: corrida — outra pessoa muda a etapa entre a leitura e a gravação → 409, nada é sobrescrito, sem histórico", async () => {
  const db = novoDb();
  // Gancho do harness: roda ANTES do UPDATE, como uma segunda pessoa que acabou de reativar para Entrevista Salmazos.
  db.ganchos = { "candidatos_vagas.update": async () => { cv(db, 1).etapa = "entrevista_salmazos"; cv(db, 1).motivo_reprovacao = null; } };
  const r = await reativar(db, 1, { destino: "triagem" });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(r.body.error, /já foi alterada/);
  assert.equal(cv(db, 1).etapa, "entrevista_salmazos", "a mudança da outra pessoa fica");
  assert.equal(db.tabelas.historico_candidato.length, 0);
  assert.equal(db.tabelas.audit_logs.length, 0);
});
await caso("reativar: outra unidade → 404 (não confirma que existe); sem login → 401; sem perfil de analista → 403; diretoria (todas as unidades) pode", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  assert.equal((await reativar(db, 1, { destino: "triagem" }, "u-ana2")).status, 404);
  assert.equal((await reativar(db, 1, { destino: "triagem" }, null)).status, 401);
  assert.equal((await reativar(db, 1, { destino: "triagem" }, "u-sem-perfil")).status, 403);
  assert.deepEqual(snapshot(db), antes);
  assert.equal((await reativar(db, 12, { destino: "triagem" }, "u-ana2")).status, 200, "analista da unidade da vaga pode");
  assert.equal((await reativar(db, 1, { destino: "triagem" }, "u-dir")).status, 200);
});
await caso("reativar: candidato BLOQUEADO → 409 e nada muda", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  const r = await reativar(db, 8, { destino: "triagem" });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /bloqueado/);
  assert.deepEqual(snapshot(db), antes);
});
await caso("reativar: vaga PAUSADA ou ENCERRADA (fechada/cancelada) → 409 com a mensagem pedida e nada muda", async () => {
  const db = novoDb();
  const antes = snapshot(db);
  const pausada = await reativar(db, 9, { destino: "triagem" });
  assert.equal(pausada.status, 409);
  assert.equal(pausada.body.error, "A vaga está pausada. Reabra a vaga antes de reativar a candidata.");
  for (const n of [10, 11]) {
    const r = await reativar(db, n, { destino: "triagem" });
    assert.equal(r.status, 409, `cv ${n}`);
    assert.equal(r.body.error, "A vaga está encerrada. Reabra a vaga antes de reativar a candidata.");
  }
  assert.deepEqual(snapshot(db), antes);
});
await caso("reativar: outro vínculo ATIVO em outra vaga só AVISA na resposta (a reativação acontece); sem outro vínculo, lista vazia", async () => {
  const db = novoDb();
  const r = await reativar(db, 2, { destino: "triagem" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.avisos.outros_processos, [{ vaga_titulo: "ZZTEST Outra vaga", etapa: "entrevista_cliente", responsavel: "ZZTEST Colega" }]);
  assert.equal(cv(db, 2).etapa, "triagem");
  const limpo = await reativar(novoDb(), 1, { destino: "triagem" });
  assert.deepEqual(limpo.body.avisos.outros_processos, []);
});
await caso("reativar: vínculo inexistente → 404; falha ao gravar → 500 e nada alterado (sem histórico nem auditoria)", async () => {
  const db = novoDb();
  assert.equal((await chamar(db, "u-dir", rotaReativar.POST, { destino: "triagem" }, CV(999))).status, 404);
  const db2 = novoDb();
  const antes = snapshot(db2);
  db2.falhas["candidatos_vagas.update"] = "boom";
  const r = await reativar(db2, 1, { destino: "triagem" });
  assert.equal(r.status, 500);
  assert.deepEqual(snapshot(db2), antes);
});

await caso("o endpoint não toca no encaminhamento nem envia e-mail: a fonte não referencia encaminhamentos, sendEmail nem notificações", () => {
  const fonte = fs.readFileSync("src/app/api/candidatos-vagas/[id]/reativar/route.ts", "utf8");
  assert.doesNotMatch(fonte, /encaminhamentos|sendEmail|enviarEmail|notificacoes|lembretes|sincronizarEncaminhamento/);
  assert.match(fonte, /checarAcessoCandidatoVaga/);
});
await caso("telas: Banco e ModalAdicionar tratam vinculo_em_etapa_final; o erro do 'interesse' não é mais silencioso; o modal só oferece triagem e entrevista_salmazos", () => {
  const banco = fs.readFileSync("src/components/BancoCandidatosClient.tsx", "utf8");
  const adicionar = fs.readFileSync("src/components/ModalAdicionarCandidatoVaga.tsx", "utf8");
  const modal = fs.readFileSync("src/components/ModalReativarCandidatura.tsx", "utf8");
  assert.equal((banco.match(/vinculo_em_etapa_final/g) ?? []).length, 2, "handleEncaminhar e handleInteresseEncaminhar");
  assert.doesNotMatch(banco, /console\.error\("\[interesse encaminhar\]"/);
  assert.match(banco, /interesseModal\.erro/);
  assert.match(adicionar, /vinculo_em_etapa_final/);
  assert.match(modal, /Esta candidata está como \{etapaLabel\} nesta vaga\. Reativar\?/);
  assert.match(modal, /Para enviar ao cliente, reative e depois use Encaminhar ao cliente\./);
  assert.match(modal, /useState<DestinoReativacao>\("triagem"\)/);
  assert.doesNotMatch(modal, /entrevista_cliente|aprovado_cliente/);
  assert.match(modal, /fundoDeFormulario\(\)/);
  // Aviso da data: só com o destino Entrevista Salmazos E com data; o texto é o combinado.
  assert.ok(modal.includes('destino === "entrevista_salmazos" && diaMesDaData(dataEntrevistaSalmazos)'), "o aviso só aparece com o destino Entrevista Salmazos e com data");
  assert.ok(modal.includes("Há uma entrevista Salmazos registrada em {diaMesDaData(dataEntrevistaSalmazos)}. Atualize a data depois da reativação."));
  assert.ok(banco.includes("dataEntrevistaSalmazos={reativar.dataEntrevistaSalmazos}"));
  assert.ok(adicionar.includes("dataEntrevistaSalmazos={reativar.dataEntrevistaSalmazos}"));
  assert.equal((banco.match(/json\.data_entrevista_salmazos/g) ?? []).length, 2, "os dois caminhos do Banco repassam a data");
  const endpoint = fs.readFileSync("src/app/api/candidatos-vagas/[id]/reativar/route.ts", "utf8");
  assert.ok(!/data_entrevista_salmazos:\s*null/.test(endpoint), "o servidor nunca apaga a data");
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
