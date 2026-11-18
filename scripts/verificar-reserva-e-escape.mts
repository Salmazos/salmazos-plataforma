// Duas correções pequenas:
//  1) "Criar Vaga" com duplo clique/dois analistas: só UMA chamada reserva a solicitação pendente (UPDATE condicionado a status = 'pendente'),
//     a outra recebe 409 e NÃO cria vaga; falha depois da reserva devolve a solicitação para "pendente".
//  2) E-mail de nova solicitação do PORTAL: todo texto digitado pelo cliente sai escapado no HTML (sem escapar duas vezes o tempo de experiência).
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-reserva-e-escape.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao } from "./harness-mot/ambiente-indicacao.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb } from "./harness-mot/memdb.mjs";
import { escaparHtml } from "../src/lib/escaparHtml";

congelarData();
const rotaFromSolicitacao = await importar("src/app/api/vagas/from-solicitacao/route.ts");
const rotaRecusar = await importar("src/app/api/solicitacoes-vagas/[id]/recusar/route.ts");
const rotaPortal = await importar("src/app/api/portal/solicitar-vaga/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const lerFonte = (p: string) => fs.readFileSync(p, "utf8");
const MSG_JA_PROCESSADA = "Esta solicitação já foi processada.";

// ── 1) Reserva atômica ───────────────────────────────────────────────────────
const U1 = "U1";
const SOL = "00000000-0000-4000-8000-0000000000aa";
const banco = (extra: Record<string, unknown> = {}) => criarDb({
  solicitacoes_vagas: [{
    id: SOL, status: "pendente", origem: "portal", tipo_servico: "recrutamento_selecao", unidade_id: U1, cliente_id: null, cliente_nome: "Cliente SA",
    cargo: "Auxiliar administrativo", num_posicoes: 1, cidade: "Hortolândia", estado: "SP", salario: "2500", perfil_extra: null, confidencial: false,
    created_at: new Date().toISOString(), ...extra,
  }],
  vagas: [],
  analistas_perfil: [{ id: "a1", user_id: "user-1", unidade_id: U1, acesso_todas_unidades: false, nome_completo: "Ana Analista", ativo: true, nivel_acesso: "analista" }],
  audit_logs: [],
});
async function aprovar(db: any, id = SOL) {
  db.usuario = { id: "user-1", email: "user-1@t.local", app_metadata: { role: "analista" } };
  (globalThis as any).__DB__ = db;
  const req = Object.assign(
    new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ solicitacao_id: id }) }),
    { nextUrl: new URL("http://x/api") },
  );
  const r = await rotaFromSolicitacao.POST(req);
  return { status: r.status as number, body: (await r.json()) as any };
}
const silencio = console.error;

await ok("duplo clique (2 chamadas ao mesmo tempo): só uma cria a vaga; a outra recebe 409 'Esta solicitação já foi processada.' e não cria nada", async () => {
  const db = banco();
  const [a, b] = await Promise.all([aprovar(db), aprovar(db)]);
  const status = [a.status, b.status].sort();
  assert.deepEqual(status, [201, 409], JSON.stringify([a, b]));
  const perdedora = a.status === 409 ? a : b;
  assert.equal(perdedora.body.error, MSG_JA_PROCESSADA, "perdeu NA RESERVA (não na conferência de status): mensagem fixa em português");
  assert.equal(db.tabelas.vagas.length, 1, "uma vaga só");
  const sol = db.tabelas.solicitacoes_vagas[0];
  assert.equal(sol.status, "aprovada");
  assert.equal(sol.vaga_id, db.tabelas.vagas[0].id, "a solicitação aponta para a vaga criada");
  assert.equal(sol.aprovada_por, "Ana Analista");
});

await ok("várias chamadas simultâneas (5): exatamente 1 vaga e 4 respostas 409", async () => {
  const db = banco();
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => aprovar(db)));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 4);
  assert.ok(rs.filter((r) => r.status === 409).every((r) => r.body.error === MSG_JA_PROCESSADA));
  assert.equal(db.tabelas.vagas.length, 1);
});

await ok("chamada sequencial depois de aprovada: 409 com a mensagem de sempre (quem aprovou e quando) e nenhuma vaga nova", async () => {
  const db = banco();
  assert.equal((await aprovar(db)).status, 201);
  const r = await aprovar(db);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /^Esta solicitação já foi aprovada por Ana Analista/);
  assert.equal(db.tabelas.vagas.length, 1);
});

await ok("recusada antes: 409 e nenhuma vaga; solicitação de outra unidade continua 404", async () => {
  const db = banco({ status: "recusada", motivo_recusa: "Fora do perfil" });
  const r = await aprovar(db);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /recusada/);
  assert.equal(db.tabelas.vagas.length, 0);
  const outra = banco({ unidade_id: "U2" });
  assert.equal((await aprovar(outra)).status, 404);
  assert.equal(outra.tabelas.solicitacoes_vagas[0].status, "pendente");
});

await ok("falha ao CRIAR a vaga (depois da reserva): erro de sempre (400), solicitação volta para 'pendente' sem vaga nem 'aprovada_por', e dá para tentar de novo", async () => {
  const db = banco();
  db.falhas["vagas.insert"] = "falha simulada";
  const r = await aprovar(db);
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "falha simulada");
  const sol = db.tabelas.solicitacoes_vagas[0];
  assert.deepEqual([sol.status, sol.vaga_id ?? null, sol.aprovada_por ?? null, sol.aprovada_em ?? null], ["pendente", null, null, null]);
  assert.equal(db.tabelas.vagas.length, 0);
  delete db.falhas["vagas.insert"];
  const de_novo = await aprovar(db);
  assert.equal(de_novo.status, 201, JSON.stringify(de_novo.body));
  assert.equal(db.tabelas.solicitacoes_vagas[0].status, "aprovada");
  assert.equal(db.tabelas.vagas.length, 1);
});

await ok("falha ao VINCULAR a vaga à solicitação: a vaga criada é desfeita e a solicitação volta para 'pendente' (nunca 'aprovada' sem vaga)", async () => {
  const db = banco();
  // 1ª operação em solicitacoes_vagas.update = reserva (passa); 2ª = vínculo (falha); 3ª = devolução (passa).
  let chamadas = 0;
  db.falhas = new Proxy({}, { get: (_alvo, chave) => (chave === "solicitacoes_vagas.update" && ++chamadas === 2 ? "falha no vínculo" : undefined) });
  console.error = () => undefined;
  try {
    const r = await aprovar(db);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "falha no vínculo");
  } finally { console.error = silencio; }
  const sol = db.tabelas.solicitacoes_vagas[0];
  assert.deepEqual([sol.status, sol.vaga_id ?? null, sol.aprovada_por ?? null], ["pendente", null, null]);
  assert.equal(db.tabelas.vagas.length, 0, "sem vaga órfã");
});

await ok("exceção inesperada depois da reserva (geração do slug) também devolve a solicitação para 'pendente'", async () => {
  const db = banco();
  // O slug consulta vagas.select: faz a consulta lançar exceção em vez de devolver erro.
  db.falhas = new Proxy({}, { get: (_alvo, chave) => { if (chave === "vagas.select") throw new Error("explodiu"); return undefined; } });
  console.error = () => undefined;
  try {
    const r = await aprovar(db);
    assert.equal(r.status, 500);
  } finally { console.error = silencio; }
  const sol = db.tabelas.solicitacoes_vagas[0];
  assert.deepEqual([sol.status, sol.vaga_id ?? null], ["pendente", null]);
  assert.equal(db.tabelas.vagas.length, 0);
});

async function recusar(db: any, id = SOL) {
  db.usuario = { id: "user-1", email: "user-1@t.local", app_metadata: { role: "analista" } };
  (globalThis as any).__DB__ = db;
  const req = Object.assign(
    new Request("http://x/api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo_recusa: "Fora do perfil" }) }),
    { nextUrl: new URL("http://x/api") },
  );
  const r = await rotaRecusar.PATCH(req, { params: Promise.resolve({ id }) });
  return { status: r.status as number, body: (await r.json()) as any };
}

await ok("recusar: recusa a pendente (200) e grava motivo/quem/quando; sozinha, sem disputa, continua igual", async () => {
  const db = banco();
  const r = await recusar(db);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sol = db.tabelas.solicitacoes_vagas[0];
  assert.deepEqual([sol.status, sol.motivo_recusa, sol.aprovada_por], ["recusada", "Fora do perfil", "Ana Analista"]);
  assert.equal(db.tabelas.vagas.length, 0);
});

await ok("recusar × recusar ao mesmo tempo: uma passa, a outra recebe 409 'Esta solicitação já foi processada.'", async () => {
  const db = banco();
  const rs = await Promise.all([recusar(db), recusar(db)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409], JSON.stringify(rs));
  assert.equal(rs.find((r) => r.status === 409)!.body.error, MSG_JA_PROCESSADA);
  assert.equal(db.tabelas.solicitacoes_vagas[0].status, "recusada");
});

await ok("recusar × Criar Vaga ao mesmo tempo (nas duas ordens): uma só decide; NUNCA 'recusada' com vaga criada nem 'aprovada' sobrescrita", async () => {
  for (const ordem of ["aprovar-primeiro", "recusar-primeiro"] as const) {
    const db = banco();
    const [a, r] = ordem === "aprovar-primeiro" ? await Promise.all([aprovar(db), recusar(db)]) : (await Promise.all([recusar(db), aprovar(db)])).reverse();
    const sol = db.tabelas.solicitacoes_vagas[0];
    assert.equal([a.status, r.status].filter((s) => s === 409).length, 1, `${ordem}: exatamente um perde: ${JSON.stringify([a, r])}`);
    if (a.status === 201) {
      assert.equal(r.status, 409);
      assert.deepEqual([sol.status, sol.vaga_id, db.tabelas.vagas.length], ["aprovada", db.tabelas.vagas[0].id, 1], "aprovada continua aprovada, com a vaga");
    } else {
      assert.deepEqual([a.status, r.status], [409, 200]);
      assert.deepEqual([sol.status, db.tabelas.vagas.length], ["recusada", 0], "recusada sem nenhuma vaga");
    }
  }
});

await ok("recusar uma solicitação que a conferência inicial ainda via pendente mas já foi aprovada (leitura velha): 409 e a aprovação fica intacta", async () => {
  const db = banco();
  assert.equal((await aprovar(db)).status, 201);
  const antes = structuredClone(db.tabelas.solicitacoes_vagas[0]);
  // Leitura velha: a rota enxerga 'pendente' na conferência inicial; a gravação condicionada é quem barra.
  const leitura = db.tabelas.solicitacoes_vagas[0];
  let lidas = 0;
  Object.defineProperty(leitura, "status", { configurable: true, enumerable: true, get() { return lidas++ === 0 ? "pendente" : "aprovada"; }, set() {} });
  const r = await recusar(db);
  Object.defineProperty(leitura, "status", { configurable: true, enumerable: true, value: "aprovada", writable: true });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.error, MSG_JA_PROCESSADA);
  assert.deepEqual([leitura.status, leitura.vaga_id, leitura.motivo_recusa ?? null], [antes.status, antes.vaga_id, antes.motivo_recusa ?? null]);
});

await ok("fonte: a reserva (UPDATE com .eq('status','pendente') e .select) vem ANTES da criação da vaga; o update final não regrava a aprovação", () => {
  const r = lerFonte("src/app/api/vagas/from-solicitacao/route.ts");
  const reserva = r.indexOf('.eq("status", "pendente")');
  assert.ok(reserva > 0 && reserva < r.indexOf('.from("vagas")'), "reserva antes do insert da vaga");
  assert.ok(r.includes("reservada.length === 0") && r.includes("status: 409"));
  assert.ok(!/status: "aprovada",\s*\n\s*vaga_id: vaga\.id/.test(r), "o update final só grava o vaga_id");
  assert.ok(r.includes("catch (err) {\n    if (devolverReserva)"), "o catch geral também devolve a reserva");
});

await ok("tela (ModalSolicitacoesVagas): erro e 409 aparecem em toast vermelho legível, o botão destrava (finally) e a solicitação já decidida sai da lista; sucesso continua igual", () => {
  const m = lerFonte("src/components/ModalSolicitacoesVagas.tsx");
  const criar = m.slice(m.indexOf("const handleCriarVaga"), m.indexOf("const handleRecusar"));
  assert.ok(criar.includes("showToast(typeof json?.error") && criar.includes(", true);"), "mostra a mensagem do servidor como erro");
  assert.ok(criar.includes("res.status === 409") && criar.includes("setItems((prev) => prev.filter((s) => s.id !== id))"));
  assert.ok(criar.includes("} finally {\n      setActionLoading(null);"), "destrava o botão em qualquer caso");
  assert.ok(criar.includes('showToast("Vaga criada com sucesso!")'));
  const recusarFn = m.slice(m.indexOf("const handleRecusar"), m.indexOf("const abrirEdicao"));
  assert.ok(recusarFn.includes("res.status === 409") && recusarFn.includes(", true);") && recusarFn.includes("} finally {\n      setActionLoading(null);"), "recusar: 409 e erros também aparecem, sem travar");
  const rr = lerFonte("src/app/api/solicitacoes-vagas/[id]/recusar/route.ts");
  assert.ok(rr.includes('.eq("status", "pendente")') && rr.includes(".maybeSingle()") && rr.includes("if (!sol) return NextResponse.json({ error: \"Esta solicitação já foi processada.\" }, { status: 409 });"));
  assert.ok(m.includes('toastErro ? "#991B1B" : "#065F46"') && m.includes('role={toastErro ? "alert" : "status"}'));
});

// ── 2) Escape no e-mail do portal ────────────────────────────────────────────
const PERIGOSO = `<script>alert("x")</script> & <b>negrito</b> 'aspas'`;
const ESCAPADO = escaparHtml(PERIGOSO);
async function enviarPeloPortal(corpo: Record<string, unknown>) {
  const db = novoDbIndicacao(); db.tabelas.solicitacoes_vagas = []; db.tabelas.notificacoes_analista = []; logarPortal(db, "cli");
  const r = await chamar(rotaPortal.POST, { metodo: "POST", corpo });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.corpo));
  const emails = (db.emails ?? []) as { html: string; subject: string }[];
  return { db, emails };
}
const BASE = { cargo: "Auxiliar", tipo_servico: "recrutamento_selecao", cidade: "Campinas", estado: "SP", principais_atividades: "Atender clientes" };

await ok("e-mail do portal: <script>, <b>, & e aspas em cargo, cidade, salário, adicionais, requisitos, benefícios, atividades e observações saem ESCAPADOS", async () => {
  const { emails } = await enviarPeloPortal({
    ...BASE, cargo: PERIGOSO, cidade: PERIGOSO, salario: PERIGOSO, adicionais_salariais: PERIGOSO, requisitos: PERIGOSO, beneficios: PERIGOSO,
    principais_atividades: PERIGOSO, observacoes: PERIGOSO, horario_tipo: "personalizado", horario_texto: PERIGOSO,
  });
  assert.ok(emails.length > 0, "o e-mail foi gerado (se vier 0, o cenário não dispara e-mail e o teste não prova nada)");
  for (const { html } of emails) {
    assert.ok(!html.includes("<script>") && !html.includes("<b>negrito</b>"), "nenhuma tag do cliente chega crua");
    assert.ok(html.includes(ESCAPADO), "o texto escapado aparece");
    // 8 campos + cabeçalho do cargo (cartão azul) = o texto aparece várias vezes, sempre escapado
    assert.ok(html.split(ESCAPADO).length - 1 >= 9, `ocorrências escapadas: ${html.split(ESCAPADO).length - 1}`);
  }
});

await ok("e-mail do portal: texto comum sai igual (acentos, quebras de linha e white-space:pre-wrap preservados) e o assunto não muda", async () => {
  const requisitos = "• Ensino Médio\n• Experiência na função";
  const { emails } = await enviarPeloPortal({ ...BASE, cargo: "Auxiliar de Produção", requisitos, observacoes: "Início imediato" });
  assert.ok(emails.length > 0);
  for (const { html, subject } of emails) {
    assert.ok(html.includes(`white-space:pre-wrap">${requisitos}</div>`), "quebras de linha e acentos intactos");
    assert.ok(html.includes("Auxiliar de Produção") && html.includes("Início imediato"));
    assert.ok(!/&amp;(amp|lt|gt|quot|#39);/.test(html), "nada escapado duas vezes");
    assert.ok(subject.startsWith("🔔 Nova Solicitação de Vaga — "), subject);
  }
});

await ok("e-mail do portal: tempo de experiência escapado UMA vez (sem '&amp;amp;') e a linha só aparece quando preenchida", async () => {
  const { emails } = await enviarPeloPortal({ ...BASE, perfil_extra: { experiencia_minima: "6 meses & <i>mais</i>", pcd: "nao" } });
  assert.ok(emails.length > 0);
  for (const { html } of emails) {
    assert.ok(html.includes("6 meses &amp; &lt;i&gt;mais&lt;/i&gt;"), "escapado uma vez");
    assert.ok(!html.includes("&amp;amp;") && !html.includes("&amp;lt;") && !html.includes("<i>mais"));
  }
  const sem = await enviarPeloPortal({ ...BASE });
  for (const { html } of sem.emails) assert.ok(!html.includes("Tempo de experiência"));
});

await ok("fonte: o escape está em UM ponto por tipo de campo (detailRow e os 4 blocos), e o assunto continua sem escape", () => {
  const r = lerFonte("src/app/api/portal/solicitar-vaga/route.ts");
  assert.ok(r.includes("${escaparHtml(value)}</td></tr>"));
  for (const c of ["requisitos", "beneficios", "principais_atividades", "observacoes"]) assert.ok(r.includes(`\${escaparHtml(body.${c})}</div>`), c);
  assert.ok(r.includes("${escaparHtml(clienteNome)}") && r.includes("${escaparHtml(body.cargo)}"));
  assert.ok(r.includes("subject: `${confidencial ? \"🔴🔔\" : \"🔔\"} Nova Solicitação de Vaga — ${clienteNome}`"), "assunto (não é HTML) não foi alterado");
  assert.ok(!r.includes("escaparHtml(parsed.data.perfil_extra"), "o tempo de experiência não é pré-escapado (detailRow já escapa)");
});

console.log(`\n${n} verificações OK`);
