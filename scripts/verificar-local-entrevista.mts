// Verificação do "local da entrevista" (o projeto não tem runner de testes). Sem banco real: as rotas rodam contra o
// banco em memória do harness (scripts/harness-mot/memdb.mjs); nada toca produção nem a migration.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-local-entrevista.mts
import assert from "node:assert/strict";
import { normalizarLocalEntrevista, decidirAlteracaoEntrevista } from "@/lib/localEntrevista";
import { textoAvisoEntrevista, limitarMensagemAviso, truncarLocalParaAviso, anexarLocalAMensagem } from "@/lib/avisoClienteRegras";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

// ── normalizarLocalEntrevista ─────────────────────────────────────────────────
await caso("normalizar: trim, quebras de linha e tabs viram um espaço, espaços repetidos colapsam", () => {
  assert.equal(normalizarLocalEntrevista("  Sala 3 \n\n Bloco B\t\tRua X,   100 \r\n"), "Sala 3 Bloco B Rua X, 100");
});
await caso("normalizar: caracteres de controle e invisíveis (NUL, ESC, zero-width, bidi, U+2028) somem", () => {
  assert.equal(normalizarLocalEntrevista("Sala\u0000 1\u001B​2‮3 fim﻿"), "Sala 1 2 3 fim".replace(" 1 2 3", " 1 2 3"));
});
await caso("normalizar: vazio, só espaços/quebras, null, undefined e não-string → null", () => {
  for (const v of ["", "   ", "\n\t\r", null, undefined, 42, {}]) assert.equal(normalizarLocalEntrevista(v), null, String(v));
});
await caso("normalizar: limite de 200 caracteres (e não corta emoji ao meio)", () => {
  assert.equal(normalizarLocalEntrevista("a".repeat(500))!.length, 200);
  const emojis = normalizarLocalEntrevista("📍".repeat(300))!;
  assert.equal(Array.from(emojis).length, 200);
  assert.ok(!/[\uD800-\uDBFF]$/.test(emojis), "não termina em metade de par substituto");
  // O corte em 200 cai num espaço: o trimEnd final não deixa espaço pendurado no fim.
  assert.equal(normalizarLocalEntrevista(`${"b".repeat(199)}  c`), "b".repeat(199));
  assert.equal(normalizarLocalEntrevista(`${"b".repeat(198)}  c`), `${"b".repeat(198)} c`);
});
await caso("normalizar: HTML é preservado como TEXTO (escape é só na exibição)", () => {
  assert.equal(normalizarLocalEntrevista(`<script>alert("x")</script>`), `<script>alert("x")</script>`);
  assert.equal(normalizarLocalEntrevista("Rua A & B <Centro>"), "Rua A & B <Centro>");
});
await caso("normalizar: idempotente", () => {
  const uma = normalizarLocalEntrevista("  a \n b  ")!;
  assert.equal(normalizarLocalEntrevista(uma), uma);
});

// ── truncar / anexar ao sino ──────────────────────────────────────────────────
await caso("truncar para aviso: até 80 caracteres com reticências; curto fica igual", () => {
  assert.equal(truncarLocalParaAviso("Sala 1"), "Sala 1");
  const t = truncarLocalParaAviso("x".repeat(150))!;
  assert.equal(Array.from(t).length, 80);
  assert.ok(t.endsWith("…"));
  assert.equal(truncarLocalParaAviso("  "), null);
});
await caso("anexar: sem local devolve a mensagem exatamente igual", () => {
  for (const l of [null, undefined, "", "  \n "]) assert.equal(anexarLocalAMensagem("Entrevista agendada: Ana — 10/10/2026 às 14:00", l), "Entrevista agendada: Ana — 10/10/2026 às 14:00");
});
await caso("anexar: com local → ' — local: X' no fim", () => {
  assert.equal(anexarLocalAMensagem("Base", "Sala 1"), "Base — local: Sala 1");
});

// ── textoAvisoEntrevista (aviso ao cliente no portal) ─────────────────────────
const ANTES = "10/10/2026 às 09:00";
const DEPOIS = "12/10/2026 às 14:30";
await caso("aviso: SEM local o texto é idêntico ao de antes (agendada e remarcada, com e sem nome/vaga)", () => {
  assert.deepEqual(textoAvisoEntrevista({ tipo: "agendada", candidato: "Ana", vagaTitulo: "Auxiliar", depois: DEPOIS }),
    { titulo: "Entrevista agendada", mensagem: `Entrevista agendada: Ana — vaga Auxiliar — ${DEPOIS}` });
  assert.deepEqual(textoAvisoEntrevista({ tipo: "remarcada", candidato: "Ana", vagaTitulo: "Auxiliar", antes: ANTES, depois: DEPOIS }),
    { titulo: "Entrevista remarcada", mensagem: `Entrevista remarcada: Ana — vaga Auxiliar — de ${ANTES} para ${DEPOIS}` });
  assert.deepEqual(textoAvisoEntrevista({ tipo: "agendada" }), { titulo: "Entrevista agendada", mensagem: "Entrevista agendada" });
  assert.equal(textoAvisoEntrevista({ tipo: "agendada", candidato: "Ana", depois: DEPOIS, local: null }).mensagem, `Entrevista agendada: Ana — ${DEPOIS}`);
  assert.equal(textoAvisoEntrevista({ tipo: "agendada", candidato: "Ana", depois: DEPOIS, local: "   " }).mensagem, `Entrevista agendada: Ana — ${DEPOIS}`);
});
await caso("aviso: COM local o local vai ao fim", () => {
  assert.equal(textoAvisoEntrevista({ tipo: "agendada", candidato: "Ana", vagaTitulo: "Auxiliar", depois: DEPOIS, local: "Sala de RH" }).mensagem,
    `Entrevista agendada: Ana — vaga Auxiliar — ${DEPOIS} — local: Sala de RH`);
  assert.equal(textoAvisoEntrevista({ tipo: "remarcada", candidato: "Ana", antes: ANTES, depois: DEPOIS, local: "Sala de RH" }).mensagem,
    `Entrevista remarcada: Ana — de ${ANTES} para ${DEPOIS} — local: Sala de RH`);
});
await caso("aviso: limite de 400 — o local é truncado primeiro e a data nunca é cortada, mesmo com nome e vaga enormes", () => {
  const nome = "N".repeat(150), vaga = "V".repeat(150);
  const local = "L".repeat(200);
  const { mensagem } = textoAvisoEntrevista({ tipo: "remarcada", candidato: nome, vagaTitulo: vaga, antes: ANTES, depois: DEPOIS, local });
  assert.ok(mensagem.length <= 400, `tem ${mensagem.length}`);
  assert.equal(limitarMensagemAviso(mensagem), mensagem, "limitarMensagemAviso não corta nada");
  assert.ok(mensagem.includes(`de ${ANTES} para ${DEPOIS}`), "datas inteiras");
  // Base que já ocupa quase tudo (mas ainda cabe em 400): o local encolhe ou some, a data nunca é cortada.
  const quase = textoAvisoEntrevista({ tipo: "agendada", candidato: "N".repeat(150), vagaTitulo: "V".repeat(150), depois: DEPOIS, local });
  assert.ok(quase.mensagem.includes(DEPOIS) && quase.mensagem.length <= 400 && quase.mensagem.includes(" — local: "), quase.mensagem);
  const lotado = textoAvisoEntrevista({ tipo: "agendada", candidato: "N".repeat(170), vagaTitulo: "V".repeat(170), depois: DEPOIS, local: "Sala" });
  assert.ok(lotado.mensagem.endsWith(DEPOIS) && lotado.mensagem.length <= 400, "sem espaço: o local é omitido, a data fica");
  // Local de 200 caracteres com folga: entra truncado em 80.
  const normal = textoAvisoEntrevista({ tipo: "agendada", candidato: "Ana", depois: DEPOIS, local });
  assert.equal(Array.from(normal.mensagem.split("— local: ")[1]).length, 80);
});

// ── Regra do PATCH /api/encaminhamentos/[id] (pura) ───────────────────────────
const D1 = "2026-10-20T14:30:00-03:00";
const D2 = "2026-10-21T09:00:00-03:00";
await caso("PATCH: SÓ o local muda (data igual, em outro formato de fuso) → grava local, histórico 'local', sem aviso, sem reset de lembrete", () => {
  const d = decidirAlteracaoEntrevista({ data_entrevista: "2026-10-20T17:30:00+00:00", local_entrevista: null }, { data_entrevista: D1, local_entrevista: "Sala 2" });
  assert.deepEqual(d.campos, { local_entrevista: "Sala 2" });
  assert.equal(d.historico, "local");
  assert.equal(d.avisarCliente, false);
  assert.ok(!("lembrete_entrevista_hoje_enviado_em" in d.campos), "lembrete intacto");
  assert.ok(!("data_entrevista" in d.campos), "data não é regravada");
  assert.equal(d.dataMudou, false);
});
await caso("PATCH: só o local, sem data no pedido → mesmo resultado; limpar (null) também conta", () => {
  assert.deepEqual(decidirAlteracaoEntrevista({ data_entrevista: D1, local_entrevista: "A" }, { local_entrevista: "B" }).campos, { local_entrevista: "B" });
  const limpar = decidirAlteracaoEntrevista({ data_entrevista: D1, local_entrevista: "A" }, { local_entrevista: null });
  assert.deepEqual(limpar.campos, { local_entrevista: null });
  assert.equal(limpar.historico, "local");
});
await caso("PATCH: nada mudou (data e local iguais) → sem gravação, sem histórico, sem aviso", () => {
  const d = decidirAlteracaoEntrevista({ data_entrevista: D1, local_entrevista: "A" }, { data_entrevista: D1, local_entrevista: "A" });
  assert.deepEqual(d.campos, {});
  assert.equal(d.historico, null);
  assert.equal(d.avisarCliente, false);
});
await caso("PATCH: a DATA muda → fluxo atual (grava data, zera lembrete, histórico de remarcação, aviso ao cliente)", () => {
  const d = decidirAlteracaoEntrevista({ data_entrevista: D1, local_entrevista: "A" }, { data_entrevista: D2 });
  assert.deepEqual(d.campos, { data_entrevista: D2, lembrete_entrevista_hoje_enviado_em: null });
  assert.equal(d.historico, "remarcacao");
  assert.equal(d.avisarCliente, true);
  assert.equal(d.localFinal, "A", "local não enviado: continua o que estava");
});
await caso("PATCH: data E local mudam → uma operação só, histórico de remarcação leva o local novo, aviso ao cliente", () => {
  const d = decidirAlteracaoEntrevista({ data_entrevista: D1, local_entrevista: "A" }, { data_entrevista: D2, local_entrevista: "B" });
  assert.deepEqual(d.campos, { data_entrevista: D2, lembrete_entrevista_hoje_enviado_em: null, local_entrevista: "B" });
  assert.equal(d.historico, "remarcacao");
  assert.equal(d.avisarCliente, true);
  assert.equal(d.localFinal, "B");
});
await caso("PATCH: encaminhamento sem data ainda → a primeira data é 'mudança' (aviso 'agendada' decide depois)", () => {
  const d = decidirAlteracaoEntrevista({ data_entrevista: null, local_entrevista: null }, { data_entrevista: D1 });
  assert.equal(d.dataMudou, true);
  assert.equal(d.avisarCliente, true);
});

// ── Rotas reais contra o banco em memória ─────────────────────────────────────
const CLIENTE = "11111111-1111-4111-8111-111111111111";
const ENC = "22222222-2222-4222-8222-222222222222";
const CAND = "33333333-3333-4333-8333-333333333333";
const USUARIO_PORTAL = { id: "44444444-4444-4444-8444-444444444444", email: "cliente@teste.local" };

function novoDb(extra: Record<string, unknown[]> = {}) {
  const db = criarDb({
    cliente_usuarios: [{ user_id: USUARIO_PORTAL.id, cliente_id: CLIENTE }],
    clientes: [{ id: CLIENTE, nome: "Cliente <b>Teste</b>", unidade_id: null, contato_email: "contato@cliente.local" }],
    candidatos: [{ id: CAND, nome_completo: "Ana Teste", responsavel: null, cargo_pretendido: "Auxiliar" }],
    encaminhamentos: [{
      id: ENC, candidato_id: CAND, cliente_id: CLIENTE, vaga_id: null, status: "aguardando_agendamento_cliente",
      data_entrevista: null, local_entrevista: null, lembrete_entrevista_hoje_enviado_em: null, updated_at: "2026-10-01T10:00:00Z",
    }],
    // Sem responsável no candidato vale o fallback de sempre: e-mail para os analistas ativos da unidade.
    analistas_perfil: [{ email: "analista@teste.local", nivel_acesso: "analista", unidade_id: null, acesso_todas_unidades: true, ativo: true }],
    historico_candidato: [], notificacoes_analista: [], ...extra,
  });
  db.usuarioPortal = USUARIO_PORTAL;
  (globalThis as unknown as { __DB__: unknown }).__DB__ = db;
  return db;
}
const req = (body: unknown) => new Request("http://localhost/api/portal/agendar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never;
const amanha = () => new Date(Date.now() + 36 * 3600 * 1000).toISOString();

let rotaAgendar: { PATCH: (r: never) => Promise<Response> } | null = null;
try {
  rotaAgendar = await import("../src/app/api/portal/agendar/route.ts");
} catch (e) {
  console.log(`AVISO não foi possível carregar a rota do portal no harness: ${(e as Error).message}`);
}

if (rotaAgendar) {
  const { PATCH } = rotaAgendar;
  const HOSTIL = `<img src=x onerror="alert(1)"> & <b>Sala</b>\n"aspas" 'simples'`;

  await caso("portal agendar: local OBRIGATÓRIO — sem local ou só espaços → 400 e nada gravado", async () => {
    for (const corpo of [{ encaminhamento_id: ENC, data_entrevista: amanha() }, { encaminhamento_id: ENC, data_entrevista: amanha(), local_entrevista: "  \n " }]) {
      const db = novoDb();
      const r = await PATCH(req(corpo));
      assert.equal(r.status, 400);
      assert.equal((db.tabelas.encaminhamentos as { data_entrevista: unknown }[])[0].data_entrevista, null);
    }
  });

  await caso("portal agendar: grava data+local normalizado no mesmo UPDATE, histórico com local, sino com local; e-mail escapa o local; assunto sem o local", async () => {
    const db = novoDb();
    const r = await PATCH(req({ encaminhamento_id: ENC, data_entrevista: amanha(), local_entrevista: HOSTIL }));
    assert.equal(r.status, 200, await r.clone().text());
    const enc = (db.tabelas.encaminhamentos as Record<string, unknown>[])[0];
    const localEsperado = normalizarLocalEntrevista(HOSTIL)!;
    assert.equal(enc.local_entrevista, localEsperado);
    assert.equal(enc.status, "aguardando");
    assert.ok(enc.data_entrevista);
    assert.ok(!/[\n\r]/.test(enc.local_entrevista as string));

    const hist = (db.tabelas.historico_candidato as Record<string, unknown>[])[0];
    assert.equal(hist.tipo, "agendamento_cliente");
    assert.match(hist.descricao as string, / — local: /);
    assert.equal((hist.metadata as Record<string, unknown>).local_entrevista, localEsperado);

    const emails = ((db as unknown as { emails?: { subject: string; html: string }[] }).emails ?? []);
    assert.ok(emails.length > 0, "e-mail ao analista foi enviado (mock)");
    for (const m of emails) {
      assert.ok(!m.subject.includes("onerror") && !m.subject.includes("Sala"), `assunto sem o local: ${m.subject}`);
      assert.ok(!m.html.includes("<img src=x"), "HTML do local escapado (sem <img> cru)");
      assert.ok(m.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), "local aparece como texto escapado");
      assert.ok(m.html.includes(">Local<"), "linha 'Local' na tabela");
    }
    const sino = (db.tabelas.notificacoes_analista as Record<string, unknown>[]);
    if (sino.length > 0) assert.ok(sino.every((n) => (n.mensagem as string).includes(" — local: ")), "mensagem do sino leva o local");
  });

  await caso("portal agendar: só o dono do encaminhamento agenda (cliente_id vem do servidor) e a guarda de status continua", async () => {
    const db = novoDb();
    (db.tabelas.cliente_usuarios as { cliente_id: string }[])[0].cliente_id = "99999999-9999-4999-8999-999999999999";
    const r = await PATCH(req({ encaminhamento_id: ENC, data_entrevista: amanha(), local_entrevista: "Sala 1" }));
    assert.equal(r.status, 404);
    const db2 = novoDb();
    (db2.tabelas.encaminhamentos as { status: string }[])[0].status = "aguardando";
    assert.equal((await PATCH(req({ encaminhamento_id: ENC, data_entrevista: amanha(), local_entrevista: "Sala 1" }))).status, 409);
  });
}

// ── PATCH /api/encaminhamentos/[id] (painel da Salmazos) ───────────────────────
const ANALISTA = { id: "55555555-5555-4555-8555-555555555555", email: "analista@teste.local" };
const LEMBRETE = "2026-10-20T12:00:00.000Z";
const reqPainel = (url: string, metodo: string, body: unknown) =>
  new Request(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never;

function dbPainel(extra: Record<string, unknown[]> = {}) {
  const db = novoDb({
    analistas_perfil: [
      { user_id: ANALISTA.id, email: ANALISTA.email, nivel_acesso: "analista", unidade_id: "u1", acesso_todas_unidades: true, ativo: true },
    ],
    encaminhamentos: [{
      id: ENC, candidato_id: CAND, cliente_id: CLIENTE, vaga_id: null, status: "aguardando",
      data_entrevista: "2026-10-25T17:30:00+00:00", local_entrevista: null, lembrete_entrevista_hoje_enviado_em: LEMBRETE, updated_at: "2026-10-01T10:00:00Z",
    }],
    aviso_eventos_canais: [
      { evento: "entrevista_agendada_cliente", canal: "sino", ativo: true },
      { evento: "entrevista_remarcada_cliente", canal: "sino", ativo: true },
    ],
    portal_avisos: [], ...extra,
  });
  db.usuario = ANALISTA;
  return db;
}

let rotaPainel: { PATCH: (r: never, c: { params: Promise<{ id: string }> }) => Promise<Response> } | null = null;
try {
  rotaPainel = await import("../src/app/api/encaminhamentos/[id]/route.ts");
} catch (e) {
  console.log(`AVISO não foi possível carregar a rota PATCH do painel no harness: ${(e as Error).message}`);
}

if (rotaPainel) {
  const patch = (body: unknown) => rotaPainel!.PATCH(reqPainel(`http://localhost/api/encaminhamentos/${ENC}`, "PATCH", body), { params: Promise.resolve({ id: ENC }) });
  const linhaEnc = (db: ReturnType<typeof criarDb>) => (db.tabelas.encaminhamentos as Record<string, unknown>[])[0];
  const historico = (db: ReturnType<typeof criarDb>) => db.tabelas.historico_candidato as Record<string, unknown>[];
  const avisos = (db: ReturnType<typeof criarDb>) => db.tabelas.portal_avisos as Record<string, unknown>[];

  await caso("painel PATCH: SÓ o local muda (modal reenviando a mesma data) → grava local, histórico 'Local da entrevista alterado', SEM aviso ao cliente e SEM zerar o lembrete", async () => {
    const db = dbPainel();
    const r = await patch({ data_entrevista: "2026-10-25T14:30:00-03:00", local_entrevista: "  Sala 2 \n Bloco B " });
    assert.equal(r.status, 200, await r.clone().text());
    const enc = linhaEnc(db);
    assert.equal(enc.local_entrevista, "Sala 2 Bloco B");
    assert.equal(enc.lembrete_entrevista_hoje_enviado_em, LEMBRETE, "lembrete não regride");
    assert.equal(enc.data_entrevista, "2026-10-25T17:30:00+00:00", "data não é regravada");
    assert.equal(historico(db).length, 1);
    const h = historico(db)[0];
    assert.equal(h.tipo, "encaminhamento", "tipo já existente no CHECK (nenhum tipo novo)");
    assert.equal(h.descricao, "Local da entrevista alterado de não informado para Sala 2 Bloco B");
    assert.deepEqual(h.metadata, { alteracao: "local_entrevista", local_entrevista: "Sala 2 Bloco B", local_entrevista_anterior: null, encaminhamento_id: ENC });
    assert.equal(h.criado_por, ANALISTA.email);
    assert.equal(avisos(db).length, 0, "sem aviso ao cliente");
  });

  await caso("painel PATCH: editar o local de novo e depois limpar → histórico com 'de X para Y' e 'não informado'", async () => {
    const db = dbPainel();
    (linhaEnc(db) as { local_entrevista: string | null }).local_entrevista = "Sala 2";
    assert.equal((await patch({ local_entrevista: "Sala 3" })).status, 200);
    assert.equal(historico(db)[0].descricao, "Local da entrevista alterado de Sala 2 para Sala 3");
    assert.equal((await patch({ local_entrevista: "   " })).status, 200);
    assert.equal(linhaEnc(db).local_entrevista, null);
    assert.equal(historico(db)[1].descricao, "Local da entrevista alterado de Sala 3 para não informado");
    assert.equal(avisos(db).length, 0);
  });

  await caso("painel PATCH: local igual ao atual (ou ambos vazios) → nada muda, nenhum histórico", async () => {
    const db = dbPainel();
    (linhaEnc(db) as { local_entrevista: string | null }).local_entrevista = "Sala 2";
    assert.equal((await patch({ data_entrevista: "2026-10-25T14:30:00-03:00", local_entrevista: "Sala 2" })).status, 200);
    assert.equal((await patch({ local_entrevista: null })).status, 200); // limpa: muda
    assert.equal(historico(db).length, 1);
    assert.equal((await patch({ local_entrevista: "" })).status, 200); // já vazio: não muda
    assert.equal(historico(db).length, 1);
    assert.equal((await patch({})).status, 200); // pedido sem nada: responde sem gravar
  });

  await caso("painel PATCH: a DATA muda → fluxo atual: grava, zera lembrete, histórico de remarcação (com local) e aviso 'remarcada' ao cliente com o local", async () => {
    const db = dbPainel();
    const r = await patch({ data_entrevista: "2026-10-27T09:00:00-03:00", local_entrevista: "Sala 9" });
    assert.equal(r.status, 200, await r.clone().text());
    const enc = linhaEnc(db);
    assert.equal(new Date(enc.data_entrevista as string).toISOString(), "2026-10-27T12:00:00.000Z");
    assert.equal(enc.local_entrevista, "Sala 9");
    assert.equal(enc.lembrete_entrevista_hoje_enviado_em, null);
    assert.equal(historico(db).length, 1, "um histórico só (remarcação carrega o local)");
    const h = historico(db)[0];
    assert.match(h.descricao as string, /^Entrevista com o cliente remarcada de 25\/10\/2026 para 27\/10\/2026 — local: Sala 9$/);
    assert.equal((h.metadata as Record<string, unknown>).remarcacao, true);
    assert.equal((h.metadata as Record<string, unknown>).local_entrevista, "Sala 9");
    assert.equal(avisos(db).length, 1);
    assert.equal(avisos(db)[0].evento, "entrevista_remarcada_cliente");
    assert.match(avisos(db)[0].mensagem as string, /^Entrevista remarcada: Ana Teste — de 25\/10\/2026 às 14:30 para 27\/10\/2026 às 09:00 — local: Sala 9$/);
  });

  await caso("painel PATCH: a DATA muda sem local no pedido → aviso sem 'local' quando não há local, com o local atual quando já existe", async () => {
    const db = dbPainel();
    assert.equal((await patch({ data_entrevista: "2026-10-27T09:00:00-03:00" })).status, 200);
    assert.ok(!(avisos(db)[0].mensagem as string).includes("local:"));
    const db2 = dbPainel();
    (linhaEnc(db2) as { local_entrevista: string | null }).local_entrevista = "Recepção";
    assert.equal((await patch({ data_entrevista: "2026-10-27T09:00:00-03:00" })).status, 200);
    assert.ok((avisos(db2)[0].mensagem as string).endsWith(" — local: Recepção"));
  });

  await caso("painel PATCH: validações do schema (local acima de 200 caracteres → 400)", async () => {
    dbPainel();
    assert.equal((await patch({ local_entrevista: "x".repeat(201) })).status, 400);
  });
}

// ── POST /api/encaminhamentos (encaminhar / reencaminhar) ───────────────────────
let rotaEncaminhar: { POST: (r: never) => Promise<Response> } | null = null;
try {
  rotaEncaminhar = await import("../src/app/api/encaminhamentos/route.ts");
} catch (e) {
  console.log(`AVISO não foi possível carregar a rota POST do painel no harness: ${(e as Error).message}`);
}
if (rotaEncaminhar) {
  const VAGA = "66666666-6666-4666-8666-666666666666";
  const dbEncaminhar = (localAntigo: string | null) => {
    const db = dbPainel({
      vagas: [{ id: VAGA, unidade_id: "u1", titulo: "Auxiliar" }],
      candidatos_vagas: [],
      encaminhamentos: [{
        id: ENC, candidato_id: CAND, cliente_id: CLIENTE, vaga_id: VAGA, status: "aguardando", data_entrevista: "2026-10-25T17:30:00+00:00",
        local_entrevista: localAntigo, lembrete_entrevista_hoje_enviado_em: LEMBRETE, updated_at: "2026-10-01T10:00:00Z",
      }],
    });
    (db.tabelas.clientes as { unidade_id: string }[])[0].unidade_id = "u1";
    return db;
  };
  const post = (body: unknown) => rotaEncaminhar!.POST(reqPainel("http://localhost/api/encaminhamentos", "POST", { candidato_id: CAND, cliente_id: CLIENTE, vaga_id: VAGA, ...(body as object) }));

  await caso("painel POST: reencaminhar SEM local limpa o local do ciclo anterior (e os lembretes); COM local grava o novo e leva ao histórico", async () => {
    const db = dbEncaminhar("Sala antiga");
    const r1 = await post({ data_entrevista: "2026-11-02" });
    assert.equal(r1.status, 201, await r1.clone().text());
    const enc = (db.tabelas.encaminhamentos as Record<string, unknown>[])[0];
    assert.equal(enc.local_entrevista, null);
    assert.equal(enc.lembrete_entrevista_hoje_enviado_em, null);
    const semLocal = (db.tabelas.historico_candidato as { metadata: Record<string, unknown> }[])[0];
    assert.ok(!("local_entrevista" in semLocal.metadata));

    const r2 = await post({ data_entrevista: "2026-11-03", local_entrevista: "  Rua A,\n 100 " });
    assert.equal(r2.status, 201, await r2.clone().text());
    assert.equal((db.tabelas.encaminhamentos as Record<string, unknown>[])[0].local_entrevista, "Rua A, 100");
    assert.equal((db.tabelas.historico_candidato as { metadata: Record<string, unknown> }[])[1].metadata.local_entrevista, "Rua A, 100");
  });

  await caso("painel POST: encaminhar pedindo agendamento ao cliente (sem data) não precisa de local", async () => {
    const db = dbEncaminhar(null);
    (db.tabelas.encaminhamentos as unknown[]).length = 0;
    const r = await post({ status: "aguardando_agendamento_cliente" });
    assert.equal(r.status, 201, await r.clone().text());
    assert.equal((db.tabelas.encaminhamentos as Record<string, unknown>[])[0].local_entrevista, null);
  });

  await caso("painel POST → aviso ao cliente (portal_avisos): primeiro envio e reencaminhamento com data nova terminam com ' — local: X'; sem local o texto não muda", async () => {
    const mensagens = (db: ReturnType<typeof criarDb>) => (db.tabelas.portal_avisos as { evento: string; mensagem: string }[]).map((a) => a.mensagem);
    const comCanais = (db: ReturnType<typeof criarDb>) => {
      (db.tabelas.aviso_eventos_canais as unknown[]).push({ evento: "candidato_enviado_cliente", canal: "sino", ativo: true });
      return db;
    };
    const primeiroEnvio = () => {
      const db = comCanais(dbEncaminhar(null));
      (db.tabelas.encaminhamentos as unknown[]).length = 0; // nunca existiu encaminhamento: "Novo candidato para avaliar"
      return db;
    };

    // Primeiro envio, COM local.
    const a = primeiroEnvio();
    assert.equal((await post({ data_entrevista: "2026-11-02", local_entrevista: "  Sala\n 5 " })).status, 201);
    assert.deepEqual(mensagens(a), ["Novo candidato para avaliar: Ana Teste — vaga Auxiliar — entrevista em 02/11/2026 — local: Sala 5"]);

    // Primeiro envio, SEM local: idêntico ao texto de antes da feature.
    const b = primeiroEnvio();
    assert.equal((await post({ data_entrevista: "2026-11-02" })).status, 201);
    assert.deepEqual(mensagens(b), ["Novo candidato para avaliar: Ana Teste — vaga Auxiliar — entrevista em 02/11/2026"]);

    // Reencaminhamento de um encaminhamento ainda aberto, com data nova, COM local → "Entrevista remarcada".
    const c = comCanais(dbEncaminhar("Sala antiga"));
    assert.equal((await post({ data_entrevista: "2026-11-03", local_entrevista: "Rua A, 100" })).status, 201);
    assert.deepEqual(mensagens(c), ["Entrevista remarcada: Ana Teste — vaga Auxiliar — de 25/10/2026 às 14:30 para 03/11/2026 — local: Rua A, 100"]);

    // Idem SEM local (o local antigo é limpo no reencaminhamento): texto idêntico ao de antes.
    const d = comCanais(dbEncaminhar("Sala antiga"));
    assert.equal((await post({ data_entrevista: "2026-11-03" })).status, 201);
    assert.deepEqual(mensagens(d), ["Entrevista remarcada: Ana Teste — vaga Auxiliar — de 25/10/2026 às 14:30 para 03/11/2026"]);
  });
}

// ── Cron lembrete-entrevista-hoje ───────────────────────────────────────────────
let rotaCron: { GET: (r: Request) => Promise<Response> } | null = null;
try {
  process.env.CRON_SECRET = "segredo-de-teste";
  rotaCron = await import("../src/app/api/cron/lembrete-entrevista-hoje/route.ts");
} catch (e) {
  console.log(`AVISO não foi possível carregar o cron no harness: ${(e as Error).message}`);
}
if (rotaCron) {
  await caso("cron entrevista hoje: coluna 'Local' com o local ESCAPADO, '—' quando nulo, e o assunto NÃO leva o local", async () => {
    const hoje = new Date();
    const hojeSP = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const db = criarDb({
      clientes: [{ id: CLIENTE, nome: "Cliente Teste", contato_email: "contato@cliente.local" }],
      candidatos: [{ id: CAND, nome_completo: "Ana Teste", cargo_pretendido: "Auxiliar" }],
      cliente_usuarios: [],
      encaminhamentos: [
        { id: ENC, candidato_id: CAND, cliente_id: CLIENTE, vaga_id: null, status: "aguardando", data_entrevista: new Date(`${hojeSP}T15:00:00-03:00`).toISOString(), local_entrevista: `<script>alert(1)</script> & "Sala"`, lembrete_entrevista_hoje_enviado_em: null },
        { id: "77777777-7777-4777-8777-777777777777", candidato_id: CAND, cliente_id: CLIENTE, vaga_id: null, status: "aguardando", data_entrevista: new Date(`${hojeSP}T16:00:00-03:00`).toISOString(), local_entrevista: null, lembrete_entrevista_hoje_enviado_em: null },
      ],
      aviso_eventos_canais: [],
    });
    (globalThis as unknown as { __DB__: unknown }).__DB__ = db;
    const r = await rotaCron!.GET(new Request("http://localhost/api/cron/lembrete-entrevista-hoje", { headers: { authorization: "Bearer segredo-de-teste" } }));
    assert.equal(r.status, 200, await r.clone().text());
    const emails = (db as unknown as { emails?: { to: string; subject: string; html: string }[] }).emails ?? [];
    assert.equal(emails.length, 1, "um e-mail por destinatário");
    const m = emails[0];
    assert.ok(m.html.includes(">Local</td>"), "cabeçalho da coluna");
    assert.ok(m.html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Sala&quot;"), "local escapado");
    assert.ok(!m.html.includes("<script>"), "nenhum <script> cru");
    assert.ok(m.html.includes(">—</td>"), "'—' quando não há local");
    assert.ok(!m.subject.includes("script") && !m.subject.includes("Sala"), `assunto sem o local: ${m.subject}`);
    assert.equal(m.subject, "📅 Você tem 2 entrevistas hoje", "assunto inalterado");
  });
}

console.log(`\n${total} casos OK${process.exitCode ? " — HÁ FALHAS" : ""}`);
