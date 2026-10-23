// Verificação do "Candidato desistiu" (POST /api/candidatos-vagas/[id]/desistencia). O projeto não tem runner de testes:
// as rotas rodam contra o banco em memória do harness (scripts/harness-mot/memdb.mjs). Nada toca o Supabase real; os dados são
// ZZTEST e só existem em memória (nada a limpar no fim).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-candidato-desistiu.mts
import assert from "node:assert/strict";
import * as rota from "@/app/api/candidatos-vagas/[id]/desistencia/route";
import { candidatoVagaDesistenciaSchema } from "@/lib/schemas";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const U1 = "11111111-1111-4111-8111-000000000001", U2 = "11111111-1111-4111-8111-000000000002";
const DIR = "22222222-2222-4222-8222-000000000001", ANA = "22222222-2222-4222-8222-000000000002", ANA_U1 = "22222222-2222-4222-8222-000000000003";
const CLI = "33333333-3333-4333-8333-000000000001";
const V_MOT = "44444444-4444-4444-8444-000000000001", V_FECHADA = "44444444-4444-4444-8444-000000000002", V_TERC = "44444444-4444-4444-8444-000000000003";
const V_RS = "44444444-4444-4444-8444-000000000004", V_CANCELADA = "44444444-4444-4444-8444-000000000005", V_OUTRA_UNIDADE = "44444444-4444-4444-8444-000000000006";
const V_OUTRA = "44444444-4444-4444-8444-000000000007", V_EXTRA = "44444444-4444-4444-8444-000000000008";
const CAND = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const CV = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`;

const INICIO = "2026-10-24", FIM = "2027-01-22";
const candidatoAlocado = (id: string, titulo: string, inicio = INICIO, extra: Record<string, unknown> = {}) => ({
  id, nome_completo: `ZZTEST Candidato ${id.slice(-2)}`, status_alocacao: "alocado_mot", alocacao_cliente_nome: "ZZTEST Cliente", alocacao_vaga_titulo: titulo,
  alocacao_data_inicio: inicio, alocacao_data_fim: FIM, alocacao_tipo_servico: "mao_obra_temporaria", alocacao_renovavel: false, etapa_kanban: "aprovado_cliente", ...extra,
});
const cvContratado = (n: number, candidato: number, vaga: string, extra: Record<string, unknown> = {}) => ({
  id: CV(n), candidato_id: CAND(candidato), vaga_id: vaga, etapa: "contratado", data_inicio: INICIO, data_fim: FIM, motivo_reprovacao: null, observacoes: null, ...extra,
});

function novoDb(extra: Record<string, unknown[]> = {}) {
  const db: any = criarDb({
    analistas_perfil: [
      { id: DIR, user_id: "u-dir", nome_completo: "ZZTEST Diretora", nivel_acesso: "diretoria", unidade_id: U1, acesso_todas_unidades: true, ativo: true },
      { id: ANA, user_id: "u-ana", nome_completo: "ZZTEST Analista", nivel_acesso: "analista", unidade_id: U1, acesso_todas_unidades: false, ativo: true },
      { id: ANA_U1, user_id: "u-ana-u1", nome_completo: "ZZTEST Analista liberada", nivel_acesso: "analista", unidade_id: U1, acesso_todas_unidades: false, ativo: true },
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: ANA_U1, chave_aba: "rh_admissoes", liberado: true }],
    clientes: [{ id: CLI, nome: "ZZTEST Cliente" }],
    vagas: [
      { id: V_MOT, titulo: "ZZTEST Auxiliar de Expedição", status: "aberta", tipo_servico: "mao_obra_temporaria", cliente_id: CLI, unidade_id: U1, num_posicoes: 10, num_posicoes_abertas: 7, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: null },
      { id: V_FECHADA, titulo: "ZZTEST Conferente", status: "fechada", tipo_servico: "mao_obra_temporaria", cliente_id: CLI, unidade_id: U1, num_posicoes: 3, num_posicoes_abertas: 0, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: "2026-10-20T00:00:00Z" },
      { id: V_TERC, titulo: "ZZTEST Porteiro", status: "aberta", tipo_servico: "terceirizacao", cliente_id: CLI, unidade_id: U1, num_posicoes: 5, num_posicoes_abertas: 3, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: null },
      { id: V_RS, titulo: "ZZTEST Analista R&S", status: "aberta", tipo_servico: "recrutamento_selecao", cliente_id: CLI, unidade_id: U1, num_posicoes: 2, num_posicoes_abertas: 1, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: null },
      { id: V_CANCELADA, titulo: "ZZTEST Vaga cancelada", status: "cancelada", tipo_servico: "mao_obra_temporaria", cliente_id: CLI, unidade_id: U1, num_posicoes: 2, num_posicoes_abertas: 1, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: "2026-10-01T00:00:00Z" },
      { id: V_OUTRA_UNIDADE, titulo: "ZZTEST Vaga de outra unidade", status: "aberta", tipo_servico: "mao_obra_temporaria", cliente_id: CLI, unidade_id: U2, num_posicoes: 4, num_posicoes_abertas: 3, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: null },
      { id: V_EXTRA, titulo: "ZZTEST Vaga extra", status: "aberta", tipo_servico: "mao_obra_temporaria", cliente_id: CLI, unidade_id: U1, num_posicoes: 10, num_posicoes_abertas: 8, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: null },
      { id: V_OUTRA, titulo: "ZZTEST Outra vaga do mesmo candidato", status: "aberta", tipo_servico: "mao_obra_temporaria", cliente_id: CLI, unidade_id: U1, num_posicoes: 3, num_posicoes_abertas: 2, data_abertura: "2026-09-01T00:00:00Z", data_fechamento: null },
    ],
    candidatos: [
      candidatoAlocado(CAND(1), "ZZTEST Auxiliar de Expedição"),
      candidatoAlocado(CAND(2), "ZZTEST Auxiliar de Expedição"),
      candidatoAlocado(CAND(3), "ZZTEST Auxiliar de Expedição"),
      candidatoAlocado(CAND(10), "ZZTEST Conferente"), candidatoAlocado(CAND(11), "ZZTEST Conferente"), candidatoAlocado(CAND(12), "ZZTEST Conferente"),
      candidatoAlocado(CAND(20), "ZZTEST Porteiro", INICIO, { status_alocacao: "alocado_terceirizacao", alocacao_tipo_servico: "terceirizacao" }),
      candidatoAlocado(CAND(30), "ZZTEST Analista R&S", INICIO, { status_alocacao: "alocado_rs" }),
      // Alocado em OUTRA vaga (a alocação mais recente ganhou): desistir desta candidatura não pode pisar nela.
      candidatoAlocado(CAND(40), "ZZTEST Outra vaga do mesmo candidato", "2026-11-10"),
      candidatoAlocado(CAND(41), "ZZTEST Vaga extra", "2026-11-02"),
      candidatoAlocado(CAND(50), "ZZTEST Vaga cancelada"),
      candidatoAlocado(CAND(60), "ZZTEST Vaga de outra unidade"),
    ],
    candidatos_vagas: [
      cvContratado(1, 1, V_MOT), cvContratado(2, 2, V_MOT), cvContratado(3, 3, V_MOT),
      cvContratado(10, 10, V_FECHADA), cvContratado(11, 11, V_FECHADA), cvContratado(12, 12, V_FECHADA),
      cvContratado(20, 20, V_TERC),
      cvContratado(30, 30, V_RS),
      cvContratado(40, 40, V_EXTRA), cvContratado(41, 40, V_OUTRA, { data_inicio: "2026-11-10" }),
      cvContratado(42, 41, V_EXTRA),
      cvContratado(50, 50, V_CANCELADA),
      cvContratado(60, 60, V_OUTRA_UNIDADE),
    ],
    encaminhamentos: [
      { id: "enc-1", candidato_id: CAND(1), cliente_id: CLI, vaga_id: V_MOT, status: "aprovado", created_at: "2026-10-20T10:00:00Z" },
      { id: "enc-2", candidato_id: CAND(2), cliente_id: CLI, vaga_id: V_MOT, status: "aprovado", created_at: "2026-10-20T10:00:00Z" },
      { id: "enc-10", candidato_id: CAND(10), cliente_id: CLI, vaga_id: V_FECHADA, status: "aprovado", created_at: "2026-10-20T10:00:00Z" },
      { id: "enc-20", candidato_id: CAND(20), cliente_id: CLI, vaga_id: V_TERC, status: "aprovado", created_at: "2026-10-20T10:00:00Z" },
      // Mesmo candidato, outro cliente/vaga: não pode ser tocado.
      { id: "enc-40-outra", candidato_id: CAND(40), cliente_id: CLI, vaga_id: V_OUTRA, status: "aprovado", created_at: "2026-10-21T10:00:00Z" },
      { id: "enc-40", candidato_id: CAND(40), cliente_id: CLI, vaga_id: V_EXTRA, status: "aprovado", created_at: "2026-10-20T10:00:00Z" },
    ],
    admissoes: [],
    historico_candidato: [],
    audit_logs: [],
    ...extra,
  });
  db.rpcs = {};
  return db;
}

type Resposta = { status: number; body: any };
async function chamar(db: any, usuario: string | null, id: string, corpo: unknown): Promise<Resposta> {
  const papel = usuario === "u-dir" ? "diretoria" : "analista";
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: papel } } : null;
  globalThis.__DB__ = db;
  globalThis.__PENDENTES__ = [];
  const req = Object.assign(new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }), { nextUrl: new URL("http://x/api") });
  const r = await rota.POST(req as any, { params: Promise.resolve({ id }) });
  await Promise.all(globalThis.__PENDENTES__ ?? []);
  await new Promise((resolve) => setImmediate(resolve)); // registrarHistorico é fire-and-forget
  return { status: r.status, body: await r.json() };
}
const cv = (db: any, n: number) => db.tabelas.candidatos_vagas.find((c: any) => c.id === CV(n));
const vaga = (db: any, id: string) => db.tabelas.vagas.find((v: any) => v.id === id);
const candidato = (db: any, n: number) => db.tabelas.candidatos.find((c: any) => c.id === CAND(n));
const enc = (db: any, id: string) => db.tabelas.encaminhamentos.find((e: any) => e.id === id);
const MOTIVO = "Aceitou outra proposta e avisou por telefone";
const intacto = (db: any, antes: any) => assert.deepEqual(db.tabelas, antes, "nenhuma tabela mudou");

// ── Validação do corpo ───────────────────────────────────────────────────────
await caso("Zod: motivo obrigatório (mínimo 5 caracteres, aparado, máx. 500); reabrir_vaga só booleano", () => {
  const ok = (c: unknown) => candidatoVagaDesistenciaSchema.safeParse(c);
  assert.ok(ok({ motivo: MOTIVO }).success);
  assert.equal(ok({ motivo: "  abcde  " }).data?.motivo, "abcde");
  assert.ok(ok({ motivo: MOTIVO, reabrir_vaga: true }).success);
  for (const ruim of [{}, { motivo: "" }, { motivo: "    " }, { motivo: "abcd" }, { motivo: "x".repeat(501) }, { motivo: 123 }, { motivo: MOTIVO, reabrir_vaga: "sim" }, null])
    assert.ok(!ok(ruim).success, JSON.stringify(ruim));
});

// ── Caminho feliz: MOT com a vaga aberta (o caso real) ───────────────────────
await caso("MOT, vaga aberta: candidatura → Não tem Interesse (motivo gravado, datas zeradas), alocação desfeita, encaminhamento 'desistiu', posições 7→8, histórico e auditoria", async () => {
  const db = novoDb();
  const r = await chamar(db, "u-dir", CV(1), { motivo: MOTIVO });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual({ ...r.body }, { resultado: "desistiu", vaga_reaberta: false, avisos: [] });
  const c = cv(db, 1);
  assert.equal(c.etapa, "nao_tem_interesse");
  assert.equal(c.motivo_reprovacao, MOTIVO);
  assert.equal(c.data_inicio, null);
  assert.equal(c.data_fim, null);
  const cand = candidato(db, 1);
  assert.equal(cand.status_alocacao, "disponivel");
  for (const k of ["alocacao_cliente_nome", "alocacao_vaga_titulo", "alocacao_data_inicio", "alocacao_data_fim", "alocacao_tipo_servico"]) assert.equal(cand[k], null, k);
  assert.equal(cand.alocacao_renovavel, false);
  assert.equal(enc(db, "enc-1").status, "desistiu");
  assert.equal(vaga(db, V_MOT).num_posicoes_abertas, 8, "10 posições − 2 contratados restantes");
  assert.equal(vaga(db, V_MOT).status, "aberta");
  const [h] = db.tabelas.historico_candidato;
  assert.equal(db.tabelas.historico_candidato.length, 1);
  assert.equal(h.candidato_id, CAND(1));
  assert.equal(h.tipo, "etapa_alterada");
  assert.match(h.descricao, /desistiu antes do início da admissão/);
  assert.match(h.descricao, new RegExp(MOTIVO));
  assert.equal(h.metadata.motivo, MOTIVO);
  assert.equal(h.metadata.cv_id, CV(1));
  const audit = db.tabelas.audit_logs.filter((a: any) => a.acao === "candidato_desistiu_antes_da_admissao");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].entidade, "candidatos_vagas");
  assert.equal(audit[0].entidade_id, CV(1));
  assert.equal(audit[0].usuario_id, "u-dir");
  assert.equal(audit[0].usuario_nome, "ZZTEST Diretora");
  assert.equal(audit[0].detalhes.motivo, MOTIVO);
  // Os outros contratados da mesma vaga não são tocados.
  assert.equal(cv(db, 2).etapa, "contratado");
  assert.equal(candidato(db, 2).status_alocacao, "alocado_mot");
  assert.equal(enc(db, "enc-2").status, "aprovado");
});

// ── Vaga fechada ─────────────────────────────────────────────────────────────
await caso("MOT, vaga FECHADA + reabrir_vaga=true: vaga volta a 'aberta' (data_fechamento nula), posições recalculadas sem fechar sozinha, auditoria da reabertura", async () => {
  const db = novoDb();
  const r = await chamar(db, "u-dir", CV(10), { motivo: MOTIVO, reabrir_vaga: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.vaga_reaberta, true);
  const v = vaga(db, V_FECHADA);
  assert.equal(v.status, "aberta");
  assert.equal(v.data_fechamento, null);
  assert.equal(v.data_abertura, "2026-09-01T00:00:00Z", "a data de abertura original não muda");
  assert.equal(v.num_posicoes_abertas, 1, "3 posições − 2 contratados");
  assert.equal(cv(db, 10).etapa, "nao_tem_interesse");
  assert.equal(enc(db, "enc-10").status, "desistiu");
  const reab = db.tabelas.audit_logs.filter((a: any) => a.acao === "vaga_atualizada");
  assert.equal(reab.length, 1);
  assert.deepEqual({ a: reab[0].detalhes.status_anterior, n: reab[0].detalhes.status_novo, o: reab[0].detalhes.origem }, { a: "fechada", n: "aberta", o: "desistencia_antes_da_admissao" });
  assert.equal(db.tabelas.audit_logs.find((a: any) => a.acao === "candidato_desistiu_antes_da_admissao").detalhes.vaga_reaberta, true);
  assert.equal(db.tabelas.historico_candidato[0].metadata.vaga_reaberta, true);
});
await caso("MOT, vaga FECHADA sem confirmar (reabrir_vaga ausente/false): NUNCA reabre; só recalcula as posições", async () => {
  for (const corpo of [{ motivo: MOTIVO }, { motivo: MOTIVO, reabrir_vaga: false }]) {
    const db = novoDb();
    const r = await chamar(db, "u-dir", CV(10), corpo);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.vaga_reaberta, false);
    assert.equal(vaga(db, V_FECHADA).status, "fechada");
    assert.equal(vaga(db, V_FECHADA).data_fechamento, "2026-10-20T00:00:00Z");
    assert.equal(vaga(db, V_FECHADA).num_posicoes_abertas, 1);
    assert.equal(db.tabelas.audit_logs.filter((a: any) => a.acao === "vaga_atualizada").length, 0);
  }
});
await caso("reabrir_vaga=true com a vaga já aberta ou CANCELADA: ignorado (vaga cancelada nunca é reaberta)", async () => {
  const db = novoDb();
  const a = await chamar(db, "u-dir", CV(2), { motivo: MOTIVO, reabrir_vaga: true });
  assert.equal(a.status, 200);
  assert.equal(a.body.vaga_reaberta, false, "já estava aberta");
  const c = await chamar(db, "u-dir", CV(50), { motivo: MOTIVO, reabrir_vaga: true });
  assert.equal(c.status, 200);
  assert.equal(c.body.vaga_reaberta, false);
  assert.equal(vaga(db, V_CANCELADA).status, "cancelada");
  assert.equal(vaga(db, V_CANCELADA).data_fechamento, "2026-10-01T00:00:00Z");
});

// ── Terceirização ────────────────────────────────────────────────────────────
await caso("Terceirização: mesmo fluxo (etapa, alocação, encaminhamento, posições 3→5)", async () => {
  const db = novoDb();
  const r = await chamar(db, "u-dir", CV(20), { motivo: MOTIVO });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(cv(db, 20).etapa, "nao_tem_interesse");
  assert.equal(candidato(db, 20).status_alocacao, "disponivel");
  assert.equal(enc(db, "enc-20").status, "desistiu");
  assert.equal(vaga(db, V_TERC).num_posicoes_abertas, 5, "5 posições − 0 contratados");
});

// ── Idempotência e bloqueios ─────────────────────────────────────────────────
await caso("idempotência: o 2º clique recebe 409 e não repete nada (1 histórico, 1 auditoria, posições iguais)", async () => {
  const db = novoDb();
  assert.equal((await chamar(db, "u-dir", CV(1), { motivo: MOTIVO })).status, 200);
  const antes = structuredClone(db.tabelas);
  const r = await chamar(db, "u-dir", CV(1), { motivo: "Outro motivo qualquer" });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /não está mais em Contratado/);
  intacto(db, antes);
  assert.equal(cv(db, 1).motivo_reprovacao, MOTIVO, "o motivo original não é sobrescrito");
});
await caso("corrida: se a etapa muda entre a leitura e a gravação, o update condicional não pega nada e nenhum efeito colateral acontece", async () => {
  const db = novoDb();
  db.ganchos = { "candidatos_vagas.update": async () => { cv(db, 1).etapa = "reprovado_final"; } };
  const antes = structuredClone(db.tabelas);
  antes.candidatos_vagas.find((c: any) => c.id === CV(1)).etapa = "reprovado_final";
  const r = await chamar(db, "u-dir", CV(1), { motivo: MOTIVO });
  assert.equal(r.status, 409);
  intacto(db, antes);
});
await caso("bloqueio por admissão existente (mesmo candidato + vaga) → 409 orientando cancelar a admissão; nada muda", async () => {
  const db = novoDb({ admissoes: [{ id: "adm-1", candidato_id: CAND(1), vaga_id: V_MOT, status: "cancelada" }] });
  const antes = structuredClone(db.tabelas);
  const r = await chamar(db, "u-dir", CV(1), { motivo: MOTIVO });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Cancele a admissão/);
  intacto(db, antes);
  // Admissão do MESMO candidato em OUTRA vaga não bloqueia.
  const db2 = novoDb({ admissoes: [{ id: "adm-2", candidato_id: CAND(1), vaga_id: V_OUTRA, status: "aguardando_candidato" }] });
  assert.equal((await chamar(db2, "u-dir", CV(1), { motivo: MOTIVO })).status, 200);
});
await caso("bloqueio R&S → 409 'fluxo de R&S ainda não suportado aqui'; nada muda (nem alocação, nem posições)", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas);
  const r = await chamar(db, "u-dir", CV(30), { motivo: MOTIVO });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /R&S ainda não suportado/);
  intacto(db, antes);
  const db2 = novoDb();
  vaga(db2, V_RS).tipo_servico = null;
  const antes2 = structuredClone(db2.tabelas);
  const r2 = await chamar(db2, "u-dir", CV(30), { motivo: MOTIVO });
  assert.equal(r2.status, 409);
  intacto(db2, antes2);
});
await caso("candidatura em outra etapa (ex.: aprovado_cliente) → 409; id inexistente → 404; nada muda", async () => {
  const db = novoDb();
  cv(db, 1).etapa = "aprovado_cliente";
  const antes = structuredClone(db.tabelas);
  assert.equal((await chamar(db, "u-dir", CV(1), { motivo: MOTIVO })).status, 409);
  assert.equal((await chamar(db, "u-dir", CV(999), { motivo: MOTIVO })).status, 404);
  intacto(db, antes);
});

// ── Alocação em outra vaga ───────────────────────────────────────────────────
await caso("alocação do candidato em OUTRA vaga não é pisada (mesmo candidato com duas contratações)", async () => {
  const db = novoDb();
  const r = await chamar(db, "u-dir", CV(40), { motivo: MOTIVO });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(cv(db, 40).etapa, "nao_tem_interesse");
  assert.equal(cv(db, 41).etapa, "contratado", "a outra contratação segue de pé");
  const cand = candidato(db, 40);
  assert.equal(cand.status_alocacao, "alocado_mot", "a alocação atual é da outra vaga");
  assert.equal(cand.alocacao_vaga_titulo, "ZZTEST Outra vaga do mesmo candidato");
  assert.equal(cand.alocacao_data_inicio, "2026-11-10");
  assert.equal(enc(db, "enc-40").status, "desistiu", "só o encaminhamento DESTA vaga");
  assert.equal(enc(db, "enc-40-outra").status, "aprovado", "o da outra vaga fica como está");
});
await caso("mesma vaga mas outra data de início na alocação → também não é tocada (não é desta colocação)", async () => {
  const db = novoDb();
  const r = await chamar(db, "u-dir", CV(42), { motivo: MOTIVO });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(candidato(db, 41).status_alocacao, "alocado_mot");
  assert.equal(candidato(db, 41).alocacao_data_inicio, "2026-11-02");
});

// ── Falhas parciais ──────────────────────────────────────────────────────────
await caso("falha ao gravar a candidatura → 500 e NENHUM efeito colateral (alocação, encaminhamento, posições, histórico, auditoria)", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas);
  db.falhas["candidatos_vagas.update"] = "boom";
  const erro = console.error; console.error = () => {};
  const r = await chamar(db, "u-dir", CV(1), { motivo: MOTIVO });
  console.error = erro;
  assert.equal(r.status, 500);
  assert.match(r.body.error, /Nada foi alterado/);
  intacto(db, antes);
});
await caso("falha parcial (encaminhamento) → 200 com 'avisos', log do erro, e o resto é concluído", async () => {
  const db = novoDb();
  db.falhas["encaminhamentos.update"] = "boom";
  const logs: string[] = []; const erro = console.error; console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  const r = await chamar(db, "u-dir", CV(1), { motivo: MOTIVO });
  console.error = erro;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.avisos, ["encaminhamento ao cliente"]);
  assert.ok(logs.some((l) => l.includes("Falha parcial") && l.includes("encaminhamento ao cliente")));
  assert.equal(cv(db, 1).etapa, "nao_tem_interesse");
  assert.equal(candidato(db, 1).status_alocacao, "disponivel");
  assert.equal(vaga(db, V_MOT).num_posicoes_abertas, 8);
  assert.equal(db.tabelas.audit_logs.find((a: any) => a.acao === "candidato_desistiu_antes_da_admissao").detalhes.avisos[0], "encaminhamento ao cliente");
});
await caso("falha parcial (alocação do candidato) → 200 com aviso; candidatura e posições seguem corretas", async () => {
  const db = novoDb();
  db.falhas["candidatos.update"] = "boom";
  const erro = console.error; console.error = () => {};
  const r = await chamar(db, "u-dir", CV(1), { motivo: MOTIVO });
  console.error = erro;
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.avisos, ["alocação do candidato"]);
  assert.equal(cv(db, 1).etapa, "nao_tem_interesse");
  assert.equal(vaga(db, V_MOT).num_posicoes_abertas, 8);
});

// ── Acesso ───────────────────────────────────────────────────────────────────
await caso("acesso: sem login → 401; analista sem a aba de Admissões → 403; nada muda", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas);
  assert.equal((await chamar(db, null, CV(1), { motivo: MOTIVO })).status, 401);
  assert.equal((await chamar(db, "u-ana", CV(1), { motivo: MOTIVO })).status, 403);
  intacto(db, antes);
});
await caso("acesso por unidade: analista liberada na aba só desiste de candidatura da PRÓPRIA unidade (outra unidade → 404)", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas);
  assert.equal((await chamar(db, "u-ana-u1", CV(60), { motivo: MOTIVO })).status, 404);
  intacto(db, antes);
  assert.equal((await chamar(db, "u-ana-u1", CV(1), { motivo: MOTIVO })).status, 200);
});
await caso("corpo inválido (motivo ausente/curto, JSON vazio) → 400 e nada muda", async () => {
  const db = novoDb();
  const antes = structuredClone(db.tabelas);
  for (const corpo of [{}, { motivo: "" }, { motivo: "abc" }, { motivo: "   " }]) assert.equal((await chamar(db, "u-dir", CV(1), corpo)).status, 400, JSON.stringify(corpo));
  intacto(db, antes);
});

console.log(`\n${total} casos OK`);
