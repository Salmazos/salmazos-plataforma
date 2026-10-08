// Cenários só da BRANCH: edição da indicação pelo cliente (PATCH/GET minhas-indicacoes/[id]), listagem com `pode_editar`,
// data de início na criação e proteção por updated_at na decisão. Asserções — sai com código 1 se alguma falhar.
import assert from "node:assert/strict";
import { congelarData, logar, logarPortal, importar, chamar, auditoria, HOJE, AGORA_ISO } from "./ambiente.mjs";
import { novoDbIndicacao, ID, solicitacaoBase, cvBase } from "./ambiente-indicacao.mjs";

congelarData();

const editar = await importar("src/app/api/portal/minhas-indicacoes/[id]/route.ts");
const listar = await importar("src/app/api/portal/minhas-indicacoes/route.ts");
const criar = await importar("src/app/api/portal/indicar-candidato/route.ts");
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");

let falhas = 0;
async function teste(nome, fn) {
  try { await fn(); console.log(`OK     ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n       ${String(e.message).split("\n").slice(0, 6).join("\n       ")}`); }
}

const patch = (db, id, corpo, quem = "cli") => { logarPortal(db, quem); return chamar(editar.PATCH, { metodo: "PATCH", params: { id }, corpo }); };
const detalhe = (db, id, quem = "cli") => { logarPortal(db, quem); return chamar(editar.GET, { params: { id } }); };
const sol = (db, id) => db.tabelas.solicitacoes_indicacao_candidato.find((s) => s.id === id);
const cand = (db, id) => db.tabelas.candidatos.find((c) => c.id === id);
const cv = (db, id) => db.tabelas.candidatos_vagas.find((c) => c.id === id);
const escritas = (db) => db.consultas.filter((c) => c.op !== "select");
const snapshot = (db) => JSON.stringify([db.tabelas.solicitacoes_indicacao_candidato, db.tabelas.candidatos, db.tabelas.candidatos_vagas, db.tabelas.encaminhamentos]);
const semAvisos = (db) => { assert.equal((db.emails ?? []).length, 0, "e-mail enviado"); assert.equal(db.tabelas.notificacoes_analista.length, 0, "sino gravado"); };
const html = (db) => (db.emails ?? []).map((e) => e.html).join("\n");

// ═══ Quem pode editar ═══
await teste("pendente é editável: grava só a solicitação, avisa por sino (só solicitacao_indicacao_id) e e-mail, audita sem valores", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar", admissao_salario: 1800 });
  assert.equal(r.status, 200); assert.equal(r.corpo.alterado, true);
  assert.equal(sol(db, ID.S_PEND).admissao_funcao, "Auxiliar"); assert.equal(sol(db, ID.S_PEND).admissao_salario, 1800);
  assert.equal(sol(db, ID.S_PEND).updated_at, AGORA_ISO);
  assert.deepEqual(escritas(db).map((c) => c.tabela).filter((t) => t === "candidatos_vagas" || t === "candidatos"), [], "pendente não mexe em candidato/candidatura");
  assert.equal(db.tabelas.notificacoes_analista.length, 1);
  const sino = db.tabelas.notificacoes_analista[0];
  assert.equal(sino.solicitacao_indicacao_id, ID.S_PEND); assert.ok(!("candidato_id" in sino)); assert.ok(!("vaga_id" in sino)); assert.equal(sino.user_id, null);
  assert.match(sino.mensagem, /Cliente Um alterou a indicação de Maria Souza: Salário, Função/);
  assert.ok(!/1\.?800|Auxiliar|R\$/.test(sino.mensagem), "sino só traz nomes de campos");
  assert.equal(db.emails.length, 3);
  const h = html(db);
  assert.ok(h.includes("Campo") && h.includes("Antes") && h.includes("Depois") && h.includes("Auxiliar") && h.includes("Operador"));
  assert.match(h, /R\$\s?1\.500,00\/mês/); assert.match(h, /R\$\s?1\.800,00\/mês/);
  const a = auditoria(db).filter((x) => x.acao === "indicacao_candidato_editada_cliente");
  assert.equal(a.length, 1); assert.equal(a[0].entidade, "solicitacoes_indicacao_candidato"); assert.equal(a[0].entidade_id, ID.S_PEND); assert.equal(a[0].usuario_id, "u-cli");
  assert.deepEqual(Object.keys(a[0].detalhes).sort(), ["campos_alterados", "campos_nao_propagados", "candidato_id", "cliente_id", "propagado", "status_no_momento", "vaga_trocada"]);
  assert.deepEqual(a[0].detalhes.campos_alterados, ["admissao_salario", "admissao_funcao"]); assert.equal(a[0].detalhes.status_no_momento, "pendente"); assert.equal(a[0].detalhes.propagado, null);
  assert.ok(!/Auxiliar|1800|98765/.test(JSON.stringify(a[0].detalhes)), "auditoria sem valores");
  assert.equal(db.tabelas.audit_logs.find((x) => x.acao === "indicacao_candidato_editada_cliente").usuario_nome, "Cliente Um");
  assert.equal(db.tabelas.historico_candidato.length, 0, "pendente não gera histórico de candidato");
});

await teste("aprovada sem admissão é editável: propaga para candidatos_vagas e candidatos, histórico, sino com candidato_id", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_APROV, { admissao_funcao: "Auxiliar", candidato_nome: "Joao Lima Jr", candidato_telefone: "(19) 90000-0000", curriculo_url: "novo.pdf" });
  assert.equal(r.status, 200);
  assert.equal(cv(db, ID.CV).admissao_funcao, "Auxiliar");
  assert.equal(cand(db, ID.CAND).nome_completo, "Joao Lima Jr"); assert.equal(cand(db, ID.CAND).telefone, "(19) 90000-0000"); assert.equal(cand(db, ID.CAND).curriculo_url, "novo.pdf");
  const hist = db.tabelas.historico_candidato;
  assert.equal(hist.length, 1); assert.equal(hist[0].candidato_id, ID.CAND); assert.equal(hist[0].tipo, "comentario_interno");
  assert.ok(!/90000|Auxiliar|novo\.pdf/.test(JSON.stringify(hist[0])), "histórico sem valores");
  const sino = db.tabelas.notificacoes_analista[0];
  assert.equal(sino.candidato_id, ID.CAND); assert.equal(sino.solicitacao_indicacao_id, ID.S_APROV); assert.ok(!("vaga_id" in sino));
  const h = html(db);
  assert.ok(h.includes("(19) *****-5678") && h.includes("(19) *****-0000"), "telefone mascarado");
  assert.ok(!h.includes("91234") && !h.includes("90000-0000"), "telefone real não vaza");
  assert.ok(h.includes("novo arquivo anexado") && !h.includes("novo.pdf"), "currículo sem caminho");
  const a = auditoria(db)[0];
  assert.equal(a.detalhes.propagado, true); assert.equal(a.detalhes.candidato_id, ID.CAND); assert.equal(a.detalhes.status_no_momento, "aprovada");
  assert.ok(h.includes(`/painel/candidato/${ID.CAND}`));
});

await teste("aprovada COM admissão ativa: não edita (409) e nada é gravado ou avisado", async () => {
  for (const status of ["aguardando_candidato", "em_preenchimento", "aprovado", "enviado_contabilidade"]) {
    const db = novoDbIndicacao();
    db.tabelas.admissoes.push({ id: "a1", candidato_id: ID.CAND, vaga_id: ID.V_MOT_A, status });
    const antes = snapshot(db);
    const r = await patch(db, ID.S_APROV, { admissao_funcao: "Auxiliar" });
    assert.equal(r.status, 409, status); assert.match(r.corpo.error, /em andamento/); assert.equal(snapshot(db), antes); semAvisos(db);
  }
});
await teste("admissão com vaga nula (FK SET NULL) do mesmo candidato também bloqueia", async () => {
  const db = novoDbIndicacao(); db.tabelas.admissoes.push({ id: "a1", candidato_id: ID.CAND, vaga_id: null, status: "aprovado" });
  assert.equal((await patch(db, ID.S_APROV, { admissao_funcao: "X" })).status, 409);
});
await teste("admissão de OUTRA vaga do mesmo candidato não bloqueia", async () => {
  const db = novoDbIndicacao(); db.tabelas.admissoes.push({ id: "a1", candidato_id: ID.CAND, vaga_id: ID.V_MOT_B, status: "aprovado" });
  assert.equal((await patch(db, ID.S_APROV, { admissao_funcao: "X" })).status, 200);
});
await teste("admissão CANCELADA libera a edição", async () => {
  const db = novoDbIndicacao(); db.tabelas.admissoes.push({ id: "a1", candidato_id: ID.CAND, vaga_id: ID.V_MOT_A, status: "cancelada" });
  const r = await patch(db, ID.S_APROV, { admissao_funcao: "X" });
  assert.equal(r.status, 200); assert.equal(cv(db, ID.CV).admissao_funcao, "X");
});
await teste("candidatura em etapa 'contratado' (Finalizar já rodou): não edita", async () => {
  const db = novoDbIndicacao(); cv(db, ID.CV).etapa = "contratado";
  const antes = snapshot(db);
  const r = await patch(db, ID.S_APROV, { admissao_funcao: "X" });
  assert.equal(r.status, 409); assert.equal(snapshot(db), antes); semAvisos(db);
});
await teste("aprovada sem candidatura encontrada falha fechado; recusada não edita", async () => {
  const db = novoDbIndicacao(); db.tabelas.candidatos_vagas = [];
  assert.equal((await patch(db, ID.S_APROV, { admissao_funcao: "X" })).status, 409);
  assert.equal((await patch(novoDbIndicacao(), ID.S_REC, { admissao_funcao: "X" })).status, 409);
});
await teste("erro ao ler admissões: falha fechado (409), nunca libera", async () => {
  const db = novoDbIndicacao(); db.falhas["admissoes.select"] = "boom";
  assert.equal((await patch(db, ID.S_APROV, { admissao_funcao: "X" })).status, 409);
});

// ═══ Troca de vaga ═══
await teste("troca de vaga só com vaga do mesmo cliente, aberta, mesmo tipo e mesma unidade", async () => {
  for (const [vaga, esperado] of [[ID.V_OUTRO_CLIENTE, /não encontrada/], [ID.V_FECHADA, /não está mais aberta/], [ID.V_RS, /mesmo tipo/], [ID.V_OUTRA_UNIDADE, /mesma unidade/]]) {
    const db = novoDbIndicacao(); const antes = snapshot(db);
    const r = await patch(db, ID.S_PEND, { vaga_id: vaga });
    assert.equal(r.status, 400, String(vaga)); assert.match(r.corpo.error, esperado); assert.equal(snapshot(db), antes); semAvisos(db);
  }
  const db = novoDbIndicacao();
  assert.equal((await patch(db, ID.S_PEND, { vaga_id: "99999999-0000-4000-8000-000000000999" })).status, 400, "vaga inexistente");
});
await teste("candidato que já está na vaga nova (outra indicação viva com o mesmo nome) é rejeitado", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_PEND, { vaga_id: ID.V_MOT_B, candidato_nome: "  ana clara " });
  assert.equal(r.status, 400); assert.match(r.corpo.error, /já está indicado/);
});
await teste("troca de vaga válida enquanto pendente: grava, unidade intacta, aviso 'título antigo → novo'", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_PEND, { vaga_id: ID.V_MOT_B });
  assert.equal(r.status, 200); assert.equal(sol(db, ID.S_PEND).vaga_id, ID.V_MOT_B); assert.equal(sol(db, ID.S_PEND).unidade_id, "U1"); assert.equal(sol(db, ID.S_PEND).cliente_id, "C1");
  const h = html(db); assert.ok(h.includes("Operador A") && h.includes("Operador B") && h.includes("Vaga")); assert.ok(!h.includes(ID.V_MOT_B));
  assert.equal(auditoria(db)[0].detalhes.vaga_trocada, true);
});
await teste("troca de vaga em indicação APROVADA é rejeitada e nada muda", async () => {
  const db = novoDbIndicacao(); const antes = snapshot(db);
  const r = await patch(db, ID.S_APROV, { vaga_id: ID.V_MOT_B });
  assert.equal(r.status, 400); assert.match(r.corpo.error, /vaga não pode ser alterada/); assert.equal(snapshot(db), antes); semAvisos(db);
});
await teste("enviar a MESMA vaga em aprovada não é troca (sem alteração)", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_APROV, { vaga_id: ID.V_MOT_A }); assert.equal(r.status, 200); assert.equal(r.corpo.alterado, false);
});

// ═══ Data de início ═══
await teste("edição: data passada rejeitada; hoje e futura aceitas; formato/dia inválidos rejeitados", async () => {
  for (const d of ["2008-09-15", "2026-10-06"]) { const db = novoDbIndicacao(); const r = await patch(db, ID.S_PEND, { admissao_data_inicio: d }); assert.equal(r.status, 400, d); assert.match(r.corpo.error, /anterior a hoje/); semAvisos(db); }
  for (const d of ["2026-10-07", "2027-01-15"]) assert.equal((await patch(novoDbIndicacao(), ID.S_PEND, { admissao_data_inicio: d })).status, 200, d);
  for (const d of ["15/10/2026", "2026-02-31"]) assert.equal((await patch(novoDbIndicacao(), ID.S_PEND, { admissao_data_inicio: d })).status, 400, d);
});
await teste("data antiga INALTERADA não bloqueia a edição de outros campos; mudar a data antiga para outra passada bloqueia", async () => {
  const db = novoDbIndicacao(); sol(db, ID.S_PEND).admissao_data_inicio = "2008-09-15";
  const r = await patch(db, ID.S_PEND, { admissao_data_inicio: "2008-09-15", admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200); assert.equal(sol(db, ID.S_PEND).admissao_funcao, "Auxiliar"); assert.equal(sol(db, ID.S_PEND).admissao_data_inicio, "2008-09-15");
  assert.equal((await patch(db, ID.S_PEND, { admissao_data_inicio: "2008-09-16" })).status, 400);
});
await teste("criação: data passada rejeitada (400, nada gravado); hoje/sem data seguem aceitas", async () => {
  const corpo = (d) => ({ vaga_id: ID.V_MOT_A, candidato_nome: "Fulano", candidato_telefone: "(19) 90000-1111", admissao_data_inicio: d });
  const db = novoDbIndicacao(); logarPortal(db, "cli"); const antes = db.tabelas.solicitacoes_indicacao_candidato.length;
  const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo("2008-09-15") });
  assert.equal(r.status, 400); assert.match(r.corpo.error, /anterior a hoje/); assert.equal(db.tabelas.solicitacoes_indicacao_candidato.length, antes); semAvisos(db);
  assert.equal((await chamar(criar.POST, { metodo: "POST", corpo: corpo("2026-10-07") })).status, 201);
  assert.equal((await chamar(criar.POST, { metodo: "POST", corpo: corpo(null) })).status, 201);
  assert.equal((await chamar(criar.POST, { metodo: "POST", corpo: corpo("07/10/2026") })).status, 400);
});

// ═══ Propagação ao cadastro do candidato ═══
await teste("Salmazos já ajustou o candidato: NÃO sobrescreve e o aviso diz isso", async () => {
  const db = novoDbIndicacao(); cand(db, ID.CAND).nome_completo = "Joao Lima da Silva";
  const r = await patch(db, ID.S_APROV, { candidato_nome: "Joao L. Lima", admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200);
  assert.equal(cand(db, ID.CAND).nome_completo, "Joao Lima da Silva"); assert.equal(sol(db, ID.S_APROV).candidato_nome, "Joao L. Lima"); assert.equal(cv(db, ID.CV).admissao_funcao, "Auxiliar");
  assert.ok(html(db).includes("já ajustado pela Salmazos"));
  const d = auditoria(db)[0].detalhes; assert.equal(d.propagado, false); assert.deepEqual(d.campos_nao_propagados, ["candidato_nome"]);
});
await teste("candidato EXISTENTE (origem diferente): nunca sobrescreve", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_APROV_EXISTENTE, { candidato_nome: "Camila D. Dias", candidato_telefone: "(19) 98888-7777", admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200);
  assert.equal(cand(db, ID.CAND_EXISTENTE).nome_completo, "Camila Dias"); assert.equal(cand(db, ID.CAND_EXISTENTE).telefone, "(19) 99999-0000");
  assert.equal(cv(db, ID.CV_EXISTENTE).admissao_funcao, "Auxiliar", "a candidatura é desta indicação: atualiza");
  assert.ok(html(db).includes("candidato já cadastrado antes desta indicação"));
});
await teste("candidato reaproveitado de OUTRA indicação (mesma origem): não sobrescreve", async () => {
  const db = novoDbIndicacao();
  db.tabelas.solicitacoes_indicacao_candidato.push(solicitacaoBase({ id: ID.S_OUTRA_DO_CAND, status: "aprovada", candidato_id: ID.CAND, candidatos_vaga_id: "outro-cv", vaga_id: ID.V_MOT_B }));
  const r = await patch(db, ID.S_APROV, { candidato_nome: "Joao Lima Jr" });
  assert.equal(r.status, 200); assert.equal(cand(db, ID.CAND).nome_completo, "Joao Lima");
});
await teste("propagação ao candidato é condicional ao valor lido: mudança no meio (corrida) não é sobrescrita", async () => {
  const db = novoDbIndicacao();
  db.ganchos = { "candidatos.update": async () => { cand(db, ID.CAND).nome_completo = "Ajuste da analista"; } };
  const r = await patch(db, ID.S_APROV, { candidato_nome: "Joao Lima Jr" });
  assert.equal(r.status, 200); assert.equal(cand(db, ID.CAND).nome_completo, "Ajuste da analista"); assert.ok(html(db).includes("já ajustado pela Salmazos"));
});
await teste("candidatura que avançou de etapa no meio: não atualiza e avisa", async () => {
  const db = novoDbIndicacao();
  db.ganchos = { "candidatos_vagas.update": async () => { cv(db, ID.CV).etapa = "contratado"; } };
  const r = await patch(db, ID.S_APROV, { admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200); assert.equal(cv(db, ID.CV).admissao_funcao, "Operador"); assert.ok(html(db).includes("já avançou de etapa"));
});
await teste("falha na propagação NÃO desfaz a edição: vai para a auditoria e para o aviso", async () => {
  const db = novoDbIndicacao(); db.falhas["candidatos_vagas.update"] = "boom";
  const r = await patch(db, ID.S_APROV, { admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200); assert.equal(sol(db, ID.S_APROV).admissao_funcao, "Auxiliar");
  assert.ok(html(db).includes("Não foi possível atualizar os dados de admissão")); assert.equal(auditoria(db)[0].detalhes.propagado, false);
  const db2 = novoDbIndicacao(); db2.falhas["candidatos.update"] = "boom";
  const r2 = await patch(db2, ID.S_APROV, { candidato_nome: "Joao Lima Jr" });
  assert.equal(r2.status, 200); assert.equal(sol(db2, ID.S_APROV).candidato_nome, "Joao Lima Jr"); assert.ok(html(db2).includes("não foi possível atualizar o cadastro do candidato"));
});
await teste("falha de aviso, e-mail, histórico ou auditoria NÃO derruba a edição", async () => {
  for (const chave of ["notificacoes_analista.insert", "sendEmail", "historico_candidato.insert", "audit_logs.insert"]) {
    const db = novoDbIndicacao(); db.falhas[chave] = "boom";
    const r = await patch(db, ID.S_APROV, { admissao_funcao: "Auxiliar" });
    assert.equal(r.status, 200, chave); assert.equal(sol(db, ID.S_APROV).admissao_funcao, "Auxiliar", chave); assert.equal(cv(db, ID.CV).admissao_funcao, "Auxiliar", chave);
  }
});

// ═══ Sem alteração, corpo, dono ═══
await teste("sem alteração = 200 sem gravar, sem avisar, sem auditar", async () => {
  for (const corpo of [{}, { admissao_funcao: "Operador" }, { candidato_nome: " Maria Souza ", admissao_salario: "1500", admissao_salario_hora: "", admissao_vt: true }]) {
    const db = novoDbIndicacao(); const antes = snapshot(db); const n0 = escritas(db).length;
    const r = await patch(db, ID.S_PEND, corpo);
    assert.equal(r.status, 200); assert.equal(r.corpo.alterado, false); assert.equal(snapshot(db), antes); assert.equal(escritas(db).length, n0); semAvisos(db); assert.equal(auditoria(db).length, 0);
  }
});
await teste("body .strict(): cliente_id, status, candidato_id e campos de decisão são rejeitados (400) e nada muda", async () => {
  for (const extra of [{ cliente_id: "C2" }, { status: "aprovada" }, { candidato_id: ID.CAND }, { decidido_por: "x" }, { motivo_recusa: "x" }, { unidade_id: "U2" }, { solicitado_por_user_id: "u-x" }, { qualquer: 1 }]) {
    const db = novoDbIndicacao(); const antes = snapshot(db);
    const r = await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar", ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra)); assert.equal(snapshot(db), antes); semAvisos(db);
  }
});
await teste("só o dono edita: outro usuário do mesmo cliente, usuário de outro cliente e anônimo não", async () => {
  const db = novoDbIndicacao(); const antes = snapshot(db);
  assert.equal((await patch(db, ID.S_PEND, { admissao_funcao: "X" }, "cli2")).status, 404);
  assert.equal((await patch(db, ID.S_PEND, { admissao_funcao: "X" }, "cliC2")).status, 404);
  assert.equal((await patch(db, ID.S_OUTRO_USER, { admissao_funcao: "X" }, "cli")).status, 404);
  assert.equal((await patch(db, ID.S_PEND, { admissao_funcao: "X" }, null)).status, 401);
  assert.equal((await patch(db, "00000000-0000-4000-8000-0000000000ff", { admissao_funcao: "X" })).status, 404);
  assert.equal(snapshot(db), antes);
});
await teste("nome/telefone em branco são rejeitados; campos de texto aceitam limpar para vazio", async () => {
  assert.equal((await patch(novoDbIndicacao(), ID.S_PEND, { candidato_nome: "  " })).status, 400);
  assert.equal((await patch(novoDbIndicacao(), ID.S_PEND, { candidato_telefone: "" })).status, 400);
  const db = novoDbIndicacao(); assert.equal((await patch(db, ID.S_PEND, { admissao_gestor: "" })).status, 200); assert.equal(sol(db, ID.S_PEND).admissao_gestor, null);
});

// ═══ Concorrência ═══
await teste("edição: Salmazos decidiu no meio (status mudou) → 409 'mudou' e nada é gravado/avisado", async () => {
  const db = novoDbIndicacao();
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { sol(db, ID.S_PEND).status = "recusada"; } };
  const r = await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 409); assert.match(r.corpo.error, /mudou/); assert.equal(sol(db, ID.S_PEND).admissao_funcao, "Operador"); semAvisos(db); assert.equal(auditoria(db).length, 0);
});
await teste("edição: outra edição no meio (updated_at mudou) → 409, mesmo com o status igual", async () => {
  const db = novoDbIndicacao();
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { sol(db, ID.S_PEND).updated_at = "2026-10-06T12:00:00.654321+00:00"; } };
  const r = await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 409); assert.equal(sol(db, ID.S_PEND).admissao_funcao, "Operador"); semAvisos(db);
});
await teste("edição aprovada que perde a corrida: 409 e NADA é propagado para candidato/candidatura", async () => {
  const db = novoDbIndicacao();
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { sol(db, ID.S_APROV).updated_at = "2026-10-06T12:00:00.654321+00:00"; } };
  const r = await patch(db, ID.S_APROV, { admissao_funcao: "Auxiliar", candidato_nome: "Joao Lima Jr" });
  assert.equal(r.status, 409); assert.equal(cv(db, ID.CV).admissao_funcao, "Operador"); assert.equal(cand(db, ID.CAND).nome_completo, "Joao Lima");
});
await teste("duas edições seguidas: a segunda lê o updated_at novo e passa", async () => {
  const db = novoDbIndicacao();
  assert.equal((await patch(db, ID.S_PEND, { admissao_funcao: "A" })).status, 200);
  assert.equal((await patch(db, ID.S_PEND, { admissao_funcao: "B" })).status, 200); assert.equal(sol(db, ID.S_PEND).admissao_funcao, "B");
});
await teste("decisão (aprovar): cliente edita DEPOIS da leitura → 409 'alterada enquanto era analisada', rollback total, continua pendente", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  const antesCand = db.tabelas.candidatos.length, antesCv = db.tabelas.candidatos_vagas.length;
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { const r = await patch(db, ID.S_PEND, { admissao_funcao: "Cargo novo do cliente" }); assert.equal(r.status, 200); logar(db, "dir"); } };
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 409); assert.match(r.corpo.error, /alterada enquanto era analisada/);
  assert.equal(sol(db, ID.S_PEND).status, "pendente"); assert.equal(db.tabelas.candidatos.length, antesCand); assert.equal(db.tabelas.candidatos_vagas.length, antesCv); assert.equal(db.tabelas.encaminhamentos.length, 0);
  const a = auditoria(db).find((x) => x.acao === "indicacao_candidato_aprovacao_concorrente"); assert.equal(a.detalhes.motivo, "alterada");
  // e aprovar de novo, já com os dados novos, funciona:
  const r2 = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r2.status, 200); assert.ok(db.tabelas.candidatos_vagas.some((c) => c.admissao_funcao === "Cargo novo do cliente"));
});
await teste("decisão (aprovar): decidida por outro analista no meio → mantém a mensagem antiga 'já foi decidida por outro analista'", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { sol(db, ID.S_PEND).status = "recusada"; } };
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 409); assert.match(r.corpo.error, /já foi decidida por outro analista/);
  assert.equal(auditoria(db).find((x) => x.acao === "indicacao_candidato_aprovacao_concorrente").detalhes.motivo, "decidida");
});
await teste("decisão (recusar): cliente edita no meio → 409 'alterada enquanto era analisada' e continua pendente", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { await patch(db, ID.S_PEND, { admissao_funcao: "Outro" }); logar(db, "dir"); } };
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "recusar", motivo: "Sem perfil" } });
  assert.equal(r.status, 409); assert.match(r.corpo.error, /alterada enquanto era analisada/); assert.equal(sol(db, ID.S_PEND).status, "pendente");
});
await teste("decisão (recusar): decidida por outro no meio → mensagem antiga", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { sol(db, ID.S_PEND).status = "aprovada"; } };
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "recusar", motivo: "x" } });
  assert.equal(r.status, 409); assert.match(r.corpo.error, /mudou de status/);
});
await teste("edição antes da decisão (sem corrida): a aprovação copia os dados editados", async () => {
  const db = novoDbIndicacao();
  assert.equal((await patch(db, ID.S_PEND, { admissao_funcao: "Cargo editado", admissao_salario: 2100 })).status, 200);
  logar(db, "dir");
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 200); const novo = db.tabelas.candidatos_vagas.find((c) => c.admissao_funcao === "Cargo editado"); assert.equal(novo.admissao_salario, 2100);
});

// ═══ Listagem: pode_editar ═══
await teste("listagem: pode_editar por situação (pendente, aprovada livre, com admissão, cancelada, contratada, recusada)", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const pega = async () => Object.fromEntries((await chamar(listar.GET)).corpo.data.map((i) => [i.id, i.pode_editar]));
  let m = await pega();
  assert.equal(m[ID.S_PEND], true); assert.equal(m[ID.S_APROV], true); assert.equal(m[ID.S_REC], false); assert.equal(m[ID.S_APROV_EXISTENTE], true);
  db.tabelas.admissoes.push({ id: "a1", candidato_id: ID.CAND, vaga_id: ID.V_MOT_A, status: "em_preenchimento" });
  m = await pega(); assert.equal(m[ID.S_APROV], false); assert.equal(m[ID.S_APROV_EXISTENTE], true, "admissão de outro candidato não afeta");
  db.tabelas.admissoes[0].status = "cancelada"; m = await pega(); assert.equal(m[ID.S_APROV], true);
  cv(db, ID.CV).etapa = "contratado"; m = await pega(); assert.equal(m[ID.S_APROV], false);
});
await teste("listagem: sem N+1 (uma leitura de candidatos_vagas e uma de admissoes para toda a lista) e sem ids internos", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(listar.GET);
  const n = (t) => db.consultas.filter((c) => c.tabela === t && c.op === "select").length;
  assert.equal(n("candidatos_vagas"), 1); assert.equal(n("admissoes"), 1);
  for (const i of r.corpo.data) { assert.ok(!("candidato_id" in i) && !("candidatos_vaga_id" in i)); assert.equal(typeof i.pode_editar, "boolean"); }
});
await teste("listagem: erro ao ler admissões esconde o botão nas aprovadas (falha fechado) e mantém o das pendentes", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli"); db.falhas["admissoes.select"] = "boom";
  const m = Object.fromEntries((await chamar(listar.GET)).corpo.data.map((i) => [i.id, i.pode_editar]));
  assert.equal(m[ID.S_PEND], true); assert.equal(m[ID.S_APROV], false);
});

// ═══ GET de detalhe (pré-preenchimento do modal) ═══
await teste("GET detalhe: dados para o modal sem o caminho do currículo; troca de vaga só em pendente; não editável = 409; outro usuário = 404", async () => {
  const db = novoDbIndicacao();
  const r = await detalhe(db, ID.S_PEND); assert.equal(r.status, 200);
  const d = r.corpo.data;
  assert.equal(d.tem_curriculo, true); assert.ok(!("curriculo_url" in d)); assert.equal(d.pode_trocar_vaga, true); assert.equal(d.vaga_titulo, "Operador A"); assert.equal(d.vaga_tipo_servico, "mao_obra_temporaria");
  assert.equal(d.admissao_salario, 1500); assert.equal(d.candidato_telefone, "(19) 98765-4321");
  assert.ok(!("cliente_id" in d) && !("unidade_id" in d) && !("candidato_id" in d) && !("solicitado_por_user_id" in d));
  assert.equal((await detalhe(db, ID.S_APROV)).corpo.data.pode_trocar_vaga, false);
  assert.equal((await detalhe(db, ID.S_REC)).status, 409);
  assert.equal((await detalhe(db, ID.S_PEND, "cli2")).status, 404);
});

// ═══ Currículo na edição ═══
await teste("edição: curriculo_url aceita o nome gerado pela tela; rejeita '../x.pdf', 'outra-pasta/x.pdf' e afins (400, nada muda)", async () => {
  const db = novoDbIndicacao();
  const ok1 = await patch(db, ID.S_PEND, { curriculo_url: "1760000000000-k3j9x2ab.pdf" });
  assert.equal(ok1.status, 200); assert.equal(sol(db, ID.S_PEND).curriculo_url, "1760000000000-k3j9x2ab.pdf");
  for (const ruim of ["../x.pdf", "outra-pasta/x.pdf", "/x.pdf", "..", "a..b.pdf", "x y.pdf", ""]) {
    const d2 = novoDbIndicacao(); const antes = snapshot(d2);
    const r = await patch(d2, ID.S_PEND, { curriculo_url: ruim });
    assert.equal(r.status, 400, JSON.stringify(ruim)); assert.equal(snapshot(d2), antes); semAvisos(d2);
  }
});
await teste("criação NÃO mudou: curriculo_url continua aceito como antes (schema da criação intacto)", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(criar.POST, { metodo: "POST", corpo: { vaga_id: ID.V_MOT_A, candidato_nome: "Fulano", candidato_telefone: "(19) 90000-1111", curriculo_url: "pasta/x.pdf" } });
  assert.equal(r.status, 201);
});
await teste("edição: curriculo_url null remove o currículo e o aviso diz '(removido)' (sem caminho)", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_PEND, { curriculo_url: null });
  assert.equal(r.status, 200); assert.equal(sol(db, ID.S_PEND).curriculo_url, null);
  const h = html(db); assert.ok(h.includes("(removido)") && h.includes("arquivo anexado anteriormente")); assert.ok(!h.includes("curriculo-a.pdf"));
});
await teste("edição aprovada: trocar o currículo propaga ao candidato e o aviso diz 'novo arquivo anexado'", async () => {
  const db = novoDbIndicacao();
  const r = await patch(db, ID.S_APROV, { curriculo_url: "1760000000000-zz.pdf" });
  assert.equal(r.status, 200); assert.equal(cand(db, ID.CAND).curriculo_url, "1760000000000-zz.pdf"); assert.ok(html(db).includes("novo arquivo anexado"));
});

// ═══ Indicação sem unidade (não deveria existir: a coluna é NOT NULL) ═══
await teste("unidade_id nulo na indicação: aviso usa a unidade da VAGA (nada de e-mail para outra unidade) e a edição passa", async () => {
  const db = novoDbIndicacao(); sol(db, ID.S_PEND).unidade_id = null;
  const r = await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200);
  assert.deepEqual(db.emails.map((e) => e.to).sort(), ["u-ana@salmazos.test", "u-dir@salmazos.test", "u-sup1@salmazos.test"], "sem a analista da outra unidade (u-sup2)");
  assert.deepEqual(db.tabelas.notificacoes_analista.map((n) => n.unidade_id), ["U1"]);
});
await teste("unidade_id nulo e leitura da vaga falhando: a edição passa mesmo assim (aviso sem filtro, só log)", async () => {
  const db = novoDbIndicacao(); sol(db, ID.S_PEND).unidade_id = null; db.falhas["vagas.select"] = "boom";
  const r = await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar" });
  assert.equal(r.status, 200); assert.equal(sol(db, ID.S_PEND).admissao_funcao, "Auxiliar");
});
await teste("unidade_id presente: o aviso continua pela unidade da indicação (comportamento de sempre)", async () => {
  const db = novoDbIndicacao();
  await patch(db, ID.S_PEND, { admissao_funcao: "Auxiliar" });
  assert.equal(db.emails.length, 3); assert.deepEqual(db.tabelas.notificacoes_analista.map((n) => n.unidade_id), ["U1"]);
});

console.log(falhas ? `\n${falhas} cenário(s) FALHARAM` : "\nTodos os cenários da branch passaram.");
process.exitCode = falhas ? 1 : 0;
