// Decisão de cobrança R&S na contratação: autoria (usuario_id/nome, canal) na auditoria e no histórico, sessão obrigatória para contratar, modal
// (Sim primeiro, confirmação do "Não", botão "Contratar sem cobrança") e a ação "Gerar cobrança retroativa". Rotas reais contra o banco em memória
// do harness; nada toca produção.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-decisao-cobranca-rs.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID, cvBase, solicitacaoBase } from "./harness-mot/ambiente-indicacao.mjs";
import { feeDaContratacao, rotuloBotaoContratar, textoConfirmarNaoGerar } from "../src/lib/decisaoCobrancaRS";
import DecisaoCobrancaRS from "../src/components/DecisaoCobrancaRS";

const req = createRequire(import.meta.url);
const { renderToStaticMarkup } = req("react-dom/server");
const React = req("react");

congelarData();
const R = {
  finalizar: await importar("src/app/api/candidatos-vagas/[id]/finalizar/route.ts"),
  retro: await importar("src/app/api/candidatos-vagas/[id]/gerar-cobranca-retroativa/route.ts"),
  decisao: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const linhas = (db: any, t: string) => db.tabelas[t] ?? [];
const audit = (db: any, acao: string) => linhas(db, "audit_logs").filter((a: any) => a.acao === acao);

const CV_RS = "99999999-0000-4000-8000-000000000050";
const CAND_RS = "99999999-0000-4000-8000-000000000051";
function cenario(extraCv: Record<string, unknown> = {}) {
  const db = novoDbIndicacao();
  const vaga = db.tabelas.vagas.find((v: any) => v.id === ID.V_RS);
  Object.assign(vaga, { num_posicoes: 2, num_posicoes_abertas: 2, fee_rs_percentual: 50, fee_rs_prazo_cobranca: "7", cliente_nome: "Cliente Um" });
  db.tabelas.candidatos.push({ id: CAND_RS, nome_completo: "Rita Souza", telefone: "(19) 90000-0000", etapa_kanban: "aprovado_cliente" });
  db.tabelas.candidatos_vagas.push(cvBase(CV_RS, CAND_RS, solicitacaoBase({ vaga_id: ID.V_RS }), { admissao_fee_valor: null, ...extraCv }));
  db.tabelas.cobrancas_rs = [];
  db.tabelas.comissao_lancamentos = [];
  return db;
}
const cv = (db: any) => linhas(db, "candidatos_vagas").find((c: any) => c.id === CV_RS);
const finalizar = (db: any, quem: string | null, corpo: Record<string, unknown>) => {
  logar(db, quem);
  return chamar(R.finalizar.PATCH, { metodo: "PATCH", params: { id: CV_RS }, corpo: { resultado: "contratado", data_inicio: "2026-11-17", admissao_salario: 4200, ...corpo } });
};
const retro = (db: any, quem: string | null, corpo: Record<string, unknown> = { justificativa: "Decisão tomada por engano" }) => {
  logar(db, quem);
  return chamar(R.retro.POST, { metodo: "POST", params: { id: CV_RS }, corpo });
};

// ── 1. Autoria ──
await ok("contratar R&S como 'Sim': auditoria e histórico com usuario_id, nome e canal; cobrança nasce com o autor", async () => {
  const db = cenario();
  const r = await finalizar(db, "ana", { gerar_cobranca_rs: true });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  for (const acao of ["cobranca_rs_decisao", "candidato_finalizado"]) {
    const a = audit(db, acao);
    assert.equal(a.length, 1, acao);
    assert.equal(a[0].usuario_id, "u-ana", acao); assert.equal(a[0].usuario_nome, "Nome u-ana", acao); assert.equal(a[0].detalhes.canal, "kanban_modal", acao);
  }
  const h = linhas(db, "historico_candidato").find((x: any) => x.tipo === "contratado");
  assert.equal(h.criado_por, "Nome u-ana"); assert.equal(h.metadata.usuario_id, "u-ana"); assert.equal(h.metadata.canal, "kanban_modal");
  assert.equal(linhas(db, "cobrancas_rs").length, 1); assert.equal(linhas(db, "cobrancas_rs")[0].gerado_por_user_id, "u-ana");
});
await ok("contratar como 'Não': decisão gravada com autor (era o buraco do caso de 17/11) e sem cobrança", async () => {
  const db = cenario();
  const r = await finalizar(db, "ana", { gerar_cobranca_rs: false });
  assert.equal(r.status, 200);
  assert.equal(cv(db).gerar_cobranca_rs, false); assert.ok(cv(db).decisao_cobranca_registrada_em);
  const a = audit(db, "cobranca_rs_decisao")[0];
  assert.equal(a.usuario_id, "u-ana"); assert.equal(a.usuario_nome, "Nome u-ana"); assert.equal(a.detalhes.gerar_cobranca_rs, false); assert.equal(linhas(db, "cobrancas_rs").length, 0);
});
await ok("sem taxa configurada (justificativa): admissao_finalizada_sem_fee_rs também com autoria e canal", async () => {
  const db = cenario();
  db.tabelas.vagas.find((v: any) => v.id === ID.V_RS).fee_rs_percentual = null;
  const r = await finalizar(db, "dir", { gerar_cobranca_rs: false, fee_ausente_justificativa: "Cliente negociou sem taxa" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const a = audit(db, "admissao_finalizada_sem_fee_rs")[0];
  assert.equal(a.usuario_id, "u-dir"); assert.equal(a.usuario_nome, "Nome u-dir"); assert.equal(a.detalhes.canal, "kanban_modal");
});

// ── 2. Sessão obrigatória ──
await ok("sem sessão: contratar é recusado (401) e NADA é gravado (candidatura, decisão, auditoria, histórico, alocação)", async () => {
  const db = cenario();
  const antes = JSON.stringify(cv(db));
  const r = await finalizar(db, null, { gerar_cobranca_rs: false });
  assert.equal(r.status, 401, JSON.stringify(r.corpo));
  assert.equal(JSON.stringify(cv(db)), antes);
  assert.equal(audit(db, "cobranca_rs_decisao").length + audit(db, "candidato_finalizado").length, 0);
  assert.equal(linhas(db, "historico_candidato").filter((h: any) => h.tipo === "contratado").length, 0);
  assert.equal(linhas(db, "cobrancas_rs").length, 0);
});
await ok("R&S sem a decisão continua recusado (400), com sessão", async () => {
  const db = cenario();
  const r = await finalizar(db, "ana", {});
  assert.equal(r.status, 400); assert.equal(r.corpo.requiresDecisaoCobranca, true); assert.equal(cv(db).etapa, "aprovado_cliente");
});
await ok("encerrar processo (reprovado_final) segue como antes, sem exigir a mudança", async () => {
  const db = cenario();
  logar(db, "ana");
  const r = await chamar(R.finalizar.PATCH, { metodo: "PATCH", params: { id: CV_RS }, corpo: { resultado: "reprovado_final", motivo_reprovacao: "Desistiu", responsavel_encerramento: "Ana" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.equal(cv(db).etapa, "reprovado_final");
});
await ok("aprovação de indicação direta MOT: continua contratando, agora com canal 'aprovacao_indicacao' e autoria", async () => {
  const db = novoDbIndicacao();
  db.tabelas.vagas.forEach((v: any) => { v.num_posicoes = 2; v.num_posicoes_abertas = 2; });
  logar(db, "dir");
  const r = await chamar(R.decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar", data_fim: "2027-01-31" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const fin = audit(db, "candidato_finalizado")[0];
  assert.equal(fin.usuario_id, "u-dir"); assert.equal(fin.usuario_nome, "Nome u-dir"); assert.equal(fin.detalhes.canal, "aprovacao_indicacao");
  const h = linhas(db, "historico_candidato").find((x: any) => x.tipo === "contratado");
  assert.equal(h.criado_por, "Nome u-dir"); assert.equal(h.metadata.canal, "aprovacao_indicacao");
});
await ok("aprovação de indicação direta sem sessão: 401, indicação continua pendente", async () => {
  const db = novoDbIndicacao();
  logar(db, null);
  const r = await chamar(R.decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar", data_fim: "2027-01-31" } });
  assert.equal(r.status, 401); assert.equal(linhas(db, "solicitacoes_indicacao_candidato").find((s: any) => s.id === ID.S_PEND).status, "pendente");
});
await ok("os 3 pontos de chamada no front usam fetch do mesmo modal (cookie de sessão é enviado por padrão) e o middleware exige sessão", () => {
  const modal = fs.readFileSync("src/components/ModalFinalizarProcesso.tsx", "utf8");
  assert.equal((modal.match(/\/finalizar`/g) ?? []).length, 1);
  assert.ok(!/credentials:\s*["']omit/.test(modal));
  for (const f of ["KanbanBoard", "VagaDetalheClient", "CandidatoCard"]) assert.ok(fs.readFileSync(`src/components/${f}.tsx`, "utf8").includes("ModalFinalizarProcesso"), f);
  const mw = fs.readFileSync("src/middleware.ts", "utf8");
  assert.ok(!/PUBLIC_API_PREFIXES[\s\S]{0,900}\/api\/candidatos-vagas/.test(mw.split("PUBLIC_API_POST_ONLY")[0]));
});

// ── 3. Modal ──
await ok("pergunta: 'Sim' vem ANTES de 'Não', com estilos distintos (verde x vermelho)", () => {
  const h = renderToStaticMarkup(React.createElement(DecisaoCobrancaRS, { valor: null, onChange: () => {}, fee: 2100, percentual: 50, mostrarErro: false }));
  const iSim = h.indexOf("Sim, gerar cobrança"), iNao = h.indexOf("Não gerar");
  assert.ok(iSim > -1 && iNao > iSim, "Sim antes de Não");
  assert.ok(h.includes("#16A34A") && h.includes("#B91C1C"));
  assert.ok(!h.includes("alertdialog"), "sem confirmação aberta antes do clique");
  assert.equal((h.match(/type="button"/g) ?? []).length, 2);
});
await ok("clicar em 'Não' abre a confirmação com valor e percentual; o Não só vale depois de confirmar (fonte do componente)", () => {
  const h = renderToStaticMarkup(React.createElement(DecisaoCobrancaRS, { valor: null, onChange: () => {}, fee: 2100, percentual: 50, mostrarErro: false, confirmandoInicial: true }));
  assert.ok(h.includes("Você escolheu NÃO gerar cobrança de R$ 2.100,00 (fee de 50%). Confirmar?"), h);
  assert.ok(h.includes("Confirmar: não gerar") && h.includes("Voltar"));
  const src = fs.readFileSync("src/components/DecisaoCobrancaRS.tsx", "utf8");
  assert.match(src, /onClick=\{\(\) => \{ onChange\(null\); setConfirmando\(true\); \}\}/, "clicar em Não só abre a confirmação");
  assert.match(src, /onClick=\{\(\) => \{ onChange\(false\); setConfirmando\(false\); \}\}/, "só a confirmação grava false");
});
await ok("texto da confirmação e cálculo do fee: lançado > salário x %; sem dados = aviso, nunca número inventado", () => {
  assert.equal(textoConfirmarNaoGerar({ fee: 2100, percentual: 50 }), "Você escolheu NÃO gerar cobrança de R$ 2.100,00 (fee de 50%). Confirmar?");
  assert.equal(textoConfirmarNaoGerar({ fee: 1180.5, percentual: 12.5 }), "Você escolheu NÃO gerar cobrança de R$ 1.180,50 (fee de 12,5%). Confirmar?");
  assert.match(textoConfirmarNaoGerar({ fee: null, percentual: null }), /valor ainda não calculado.*taxa não definida/);
  assert.equal(feeDaContratacao({ feeJaLancado: 900, salario: 4200, percentual: 50 }), 900);
  assert.equal(feeDaContratacao({ feeJaLancado: null, salario: 4200, percentual: 50 }), 2100);
  assert.equal(feeDaContratacao({ feeJaLancado: null, salario: null, percentual: 50 }), null);
});
await ok("botão final: 'Contratar sem cobrança' só em R&S com decisão Não; no mais o rótulo padrão", () => {
  assert.equal(rotuloBotaoContratar({ rs: true, gerar: false, padrao: "Confirmar Contratação" }), "Contratar sem cobrança");
  for (const [rs, gerar] of [[true, true], [true, null], [false, false], [false, null]] as const) assert.equal(rotuloBotaoContratar({ rs, gerar, padrao: "Confirmar Contratação" }), "Confirmar Contratação");
  const modal = fs.readFileSync("src/components/ModalFinalizarProcesso.tsx", "utf8");
  assert.ok(modal.includes("rotuloBotaoContratar") && modal.includes("<DecisaoCobrancaRS"));
});

// ── 4. Gerar cobrança retroativa ──
const contratadoNao = async (db: any) => { const r = await finalizar(db, "ana", { gerar_cobranca_rs: false }); assert.equal(r.status, 200, JSON.stringify(r.corpo)); };
await ok("retroativa (diretoria): gera 1 cobrança, decisão vira 'gerar', momento da decisão original preservado, auditoria completa", async () => {
  const db = cenario(); await contratadoNao(db);
  const decidiuEm = cv(db).decisao_cobranca_registrada_em;
  const r = await retro(db, "dir");
  assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.ok(r.corpo.cobranca_rs_id);
  assert.equal(linhas(db, "cobrancas_rs").length, 1);
  const c = linhas(db, "cobrancas_rs")[0];
  assert.equal(c.candidato_vaga_id, CV_RS); assert.equal(c.status, "pendente_revisao"); assert.equal(c.gerado_por_user_id, "u-dir"); assert.equal(c.fee_percentual, 50);
  assert.equal(cv(db).gerar_cobranca_rs, true); assert.equal(cv(db).decisao_cobranca_registrada_em, decidiuEm);
  const a = audit(db, "cobranca_rs_gerada_retroativa");
  assert.equal(a.length, 1); assert.equal(a[0].usuario_id, "u-dir"); assert.equal(a[0].usuario_nome, "Nome u-dir");
  assert.equal(a[0].detalhes.cobranca_rs_id, c.id); assert.equal(a[0].detalhes.justificativa, "Decisão tomada por engano"); assert.equal(a[0].detalhes.decisao_anterior.gerar_cobranca_rs, false);
  assert.equal(a[0].detalhes.decisao_anterior.registrada_em, decidiuEm);
});
await ok("retroativa não mexe em etapa, garantia, posições da vaga, alocação, fee nem comissão", async () => {
  const db = cenario(); await contratadoNao(db);
  const antes = JSON.stringify({ cv: { ...cv(db), gerar_cobranca_rs: 0 }, vaga: db.tabelas.vagas.find((v: any) => v.id === ID.V_RS), cand: db.tabelas.candidatos.find((x: any) => x.id === CAND_RS), hist: linhas(db, "historico_candidato"), com: linhas(db, "comissao_lancamentos") });
  const r = await retro(db, "dir"); assert.equal(r.status, 200);
  const depois = JSON.stringify({ cv: { ...cv(db), gerar_cobranca_rs: 0 }, vaga: db.tabelas.vagas.find((v: any) => v.id === ID.V_RS), cand: db.tabelas.candidatos.find((x: any) => x.id === CAND_RS), hist: linhas(db, "historico_candidato"), com: linhas(db, "comissao_lancamentos") });
  assert.equal(depois, antes);
});
await ok("guarda de duplicidade: segunda chamada recusada (409), continua 1 cobrança só", async () => {
  const db = cenario(); await contratadoNao(db);
  assert.equal((await retro(db, "dir")).status, 200);
  const r2 = await retro(db, "dir");
  assert.equal(r2.status, 409); assert.equal(linhas(db, "cobrancas_rs").length, 1); assert.equal(audit(db, "cobranca_rs_gerada_retroativa").length, 1);
});
await ok("já existindo cobrança desta candidatura (mesmo com decisão 'não'): recusa e não troca a decisão", async () => {
  const db = cenario(); await contratadoNao(db);
  db.tabelas.cobrancas_rs.push({ id: "cob-x", candidato_vaga_id: CV_RS, vaga_id: ID.V_RS, status: "paga" });
  const r = await retro(db, "dir");
  assert.equal(r.status, 409); assert.equal(cv(db).gerar_cobranca_rs, false); assert.equal(linhas(db, "cobrancas_rs").length, 1);
});
await ok("só diretoria/superuser: analista e supervisor recebem 403; sem sessão 401; nada muda", async () => {
  for (const [quem, status] of [["ana", 403], ["sup1", 403], [null, 401]] as const) {
    const db = cenario(); await contratadoNao(db);
    const r = await retro(db, quem);
    assert.equal(r.status, status, String(quem)); assert.equal(cv(db).gerar_cobranca_rs, false); assert.equal(linhas(db, "cobrancas_rs").length, 0);
  }
});
await ok("sem justificativa ou campo extra: 400; decisão 'sim' ou nula, não contratado, não R&S: 409", async () => {
  let db = cenario(); await contratadoNao(db);
  for (const corpo of [{}, { justificativa: "  " }, { justificativa: "ok motivo", extra: 1 }]) assert.equal((await retro(db, "dir", corpo as never)).status, 400, JSON.stringify(corpo));
  assert.equal(cv(db).gerar_cobranca_rs, false);
  db = cenario(); assert.equal((await finalizar(db, "ana", { gerar_cobranca_rs: true })).status, 200); assert.equal((await retro(db, "dir")).status, 409);
  db = cenario(); assert.equal((await retro(db, "dir")).status, 409); // ainda aprovado_cliente
  db = cenario({ etapa: "contratado", gerar_cobranca_rs: null }); assert.equal((await retro(db, "dir")).status, 409); // sem decisão registrada
  db = cenario({ etapa: "contratado", gerar_cobranca_rs: false });
  db.tabelas.vagas.find((v: any) => v.id === ID.V_RS).tipo_servico = "mao_obra_temporaria";
  assert.equal((await retro(db, "dir")).status, 409);
});
await ok("vaga sem taxa configurada: não gera, a decisão original é mantida (volta a 'não') e a falha fica auditada", async () => {
  const db = cenario(); await contratadoNao(db);
  db.tabelas.vagas.find((v: any) => v.id === ID.V_RS).fee_rs_percentual = null;
  const r = await retro(db, "dir");
  assert.equal(r.status, 422); assert.equal(r.corpo.motivo, "sem_fee_configurado");
  assert.equal(cv(db).gerar_cobranca_rs, false); assert.equal(linhas(db, "cobrancas_rs").length, 0);
  assert.equal(audit(db, "cobranca_rs_retroativa_nao_gerada").length, 1);
});
await ok("falha ao trocar a decisão no banco: 500 e nada alterado", async () => {
  const db = cenario(); await contratadoNao(db);
  db.falhas = { ...(db.falhas ?? {}), "candidatos_vagas.update": true };
  const r = await retro(db, "dir");
  assert.ok(r.status >= 500 || r.status === 409, String(r.status)); assert.equal(cv(db).gerar_cobranca_rs, false); assert.equal(linhas(db, "cobrancas_rs").length, 0);
});
await ok("comissão não depende de gerar_cobranca_rs (confirmado no código): comissao*.ts nunca lê o campo", () => {
  for (const f of fs.readdirSync("src/lib").filter((x) => x.startsWith("comissao"))) assert.ok(!fs.readFileSync(`src/lib/${f}`, "utf8").includes("gerar_cobranca_rs"), f);
});
await ok("tela do perfil: botão só aparece para etapa contratado com decisão 'não'; exige justificativa; só diretoria/superuser vê o campo", () => {
  const src = fs.readFileSync("src/components/PerfilEdicao.tsx", "utf8");
  assert.ok(src.includes('garantiaInfo.gerar_cobranca_rs === false && garantiaInfo.etapa === "contratado"'));
  assert.ok(src.includes("podeRemoverReprovacao &&") && src.includes("gerar-cobranca-retroativa") && src.includes("Gerar cobrança retroativa"));
});

console.log(`\n${n} verificações OK`);
