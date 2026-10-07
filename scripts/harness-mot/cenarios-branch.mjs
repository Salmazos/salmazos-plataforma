// Cenários SÓ da branch: o que é novo (eventos MOT, rescisão programada, DELETE, 3º passo do cron) com
// asserções. Banco em memória (memdb.mjs) — ver ressalva no topo de memdb.mjs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  congelarData, novoDb, logar, logarPortal, importar, chamar, tabela, auditoria, serializar, funcionarioMot, idMot, F_D1, F_T1, F_U2, dataMais, HOJE, ROOT,
} from "./ambiente.mjs";

congelarData();
process.env.CRON_SECRET = "segredo-de-teste";

const popupPainel = await importar("src/app/api/funcionarios/vencimento-contrato/popup/route.ts");
const popupPortal = await importar("src/app/api/portal/funcionarios/vencimento-contrato/popup/route.ts");
const eventos = await importar("src/app/api/funcionarios/[id]/mot-eventos/route.ts");
const upload = await importar("src/app/api/funcionarios/[id]/mot-eventos/aditivo-upload-url/route.ts");
const arquivoUrl = await importar("src/app/api/funcionarios/[id]/mot-eventos/[eventoId]/arquivo-url/route.ts");
const corrigir = await importar("src/app/api/funcionarios/[id]/mot-eventos/[eventoId]/corrigir/route.ts");
const rescisoes = await importar("src/app/api/rescisoes/route.ts");
const rescisaoPorId = await importar("src/app/api/rescisoes/[id]/route.ts");
const cron = await importar("src/app/api/cron/rescisao-avisos/route.ts");
const paginaPainel = (await importar("src/app/painel/vencimento-contrato/page.tsx")).default;
const paginaPortal = (await importar("src/app/portal/(app)/vencimento-contrato/page.tsx")).default;
const rescisaoFuturaLib = await importar("src/lib/rescisaoProgramadaCron.ts");
void rescisaoFuturaLib;

let total = 0;
async function caso(nome, fn) {
  try {
    novoDb();
    await fn();
    total++;
    console.log(`OK    ${nome}`);
  } catch (e) {
    console.log(`FALHA ${nome}\n      ${String(e.message).split("\n").join("\n      ")}`);
    process.exitCode = 1;
  }
}

const db = () => globalThis.__DB__;
const id = (n) => idMot(n);
const POST = (funcionarioId, corpo) => chamar(eventos.POST, { metodo: "POST", params: { id: funcionarioId }, corpo });
const GET = (funcionarioId) => chamar(eventos.GET, { params: { id: funcionarioId } });
const listaPainel = async () => (await chamar(popupPainel.GET)).corpo.data.map((a) => a.funcionario_id);
const listaPortal = async () => (await chamar(popupPortal.GET)).corpo.data.map((a) => a.id);
const rescisaoBody = (funcionarioId, extra = {}) => ({
  funcionario_id: funcionarioId, empresa: "Cliente Um", data_desligamento: "2026-11-30", modalidade: "desligamento_pela_empresa",
  valor_rescisao: 1500, data_pagamento_rescisao: "2026-12-05", ...extra,
});
const statusDe = (funcionarioId) => db().tabelas.funcionarios.find((f) => f.id === funcionarioId).status;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
// Acrescenta um MOT ativo com N dias corridos desde a admissão (mesma conta de calcularDiasContratoMot).
function addMot(funcionarioId, dias, extra = {}) {
  db().tabelas.funcionarios.push(funcionarioMot(funcionarioId, dataMais(HOJE, -dias), extra));
}
const ID_P270 = "cccccccc-0000-4000-8000-000000000001";

// ── Estado de partida ────────────────────────────────────────────────────────
await caso("base: popup lista só os 2 de hoje (270+ e dia 175) — igual ao banco real", async () => {
  logar(db(), "dir");
  assert.deepEqual(await listaPainel(), [id(1), id(4)]);
});

// ── Prorrogação ──────────────────────────────────────────────────────────────
await caso("prorrogação (dia 175): grava o evento, silencia o aviso dos 180 e só ele — painel e portal", async () => {
  logar(db(), "dir"); logarPortal(db(), "cli");
  addMot(ID_P270, 262); // faixa dos 270, dentro da janela de 10 dias
  assert.deepEqual(await listaPainel(), [id(1), id(4), ID_P270]);
  const caminho = `aditivos/${id(4)}/aditivo-1-aditivo.pdf`;
  const r = await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-05", observacoes: "  aditivo assinado  ", arquivo_path: caminho, nome_arquivo_original: "aditivo.pdf" });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const linha = db().tabelas.funcionario_mot_eventos[0];
  assert.equal(linha.funcionario_id, id(4));
  assert.equal(linha.criado_por, "u-dir");
  assert.equal(linha.observacoes, "aditivo assinado");
  assert.equal(linha.arquivo_path, caminho);
  assert.deepEqual(await listaPainel(), [id(1), ID_P270]); // saiu o dos 180; o dos 270 e o excedido continuam
  assert.deepEqual(await listaPortal(), [id(1), ID_P270]);
});

await caso("prorrogação NÃO silencia a faixa dos 270 nem o excedido", async () => {
  logar(db(), "dir");
  addMot(ID_P270, 262);
  for (const f of [ID_P270, id(1)]) assert.equal((await POST(f, { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 201);
  assert.deepEqual(await listaPainel(), [id(1), id(4), ID_P270], "270 e excedido continuam (o dia 175 não foi prorrogado)");
});

await caso("auditoria só com ids e tipo (nada de benefício/observação)", async () => {
  logar(db(), "dir");
  await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "auxilio_doenca", observacoes: "segredo-de-saude" });
  const a = auditoria(db()).filter((x) => x.acao === "funcionario_mot_evento_registrado");
  assert.equal(a.length, 1);
  assert.deepEqual(Object.keys(a[0].detalhes).sort(), ["funcionario_id", "tipo"]);
  assert.ok(!JSON.stringify(auditoria(db())).includes("segredo-de-saude"));
  assert.ok(!JSON.stringify(auditoria(db())).includes("auxilio_doenca"));
});

await caso("prorrogação: só uma válida por funcionário (409); 'resumo.prorrogado' esconde o botão; Corrigir libera de novo", async () => {
  logar(db(), "dir");
  assert.equal((await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 201);
  const dup = await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-05", observacoes: "de novo" });
  assert.equal(dup.status, 409);
  assert.match(dup.corpo.error, /já tem uma prorrogação registrada/);
  assert.equal(db().tabelas.funcionario_mot_eventos.length, 1, "a segunda não foi gravada");
  // outro funcionário não é afetado
  assert.equal((await POST(id(5), { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 201);
  // o painel recebe prorrogado=true → acoesDisponiveisMot esconde "Prorrogar"
  const g = (await GET(id(4))).corpo.data;
  assert.equal(g.resumo.prorrogado, true);
  const prorrogacaoId = g.eventos[0].id;
  // erro de lançamento: Corrigir anula, o resumo some e a prorrogação certa pode entrar
  logar(db(), "sup1");
  assert.equal((await chamar(corrigir.POST, { metodo: "POST", params: { id: id(4), eventoId: prorrogacaoId }, corpo: { motivo: "data errada" } })).status, 403);
  logar(db(), "dir");
  assert.equal((await chamar(corrigir.POST, { metodo: "POST", params: { id: id(4), eventoId: prorrogacaoId }, corpo: { motivo: "data errada" } })).status, 201);
  assert.equal((await GET(id(4))).corpo.data.resumo, null);
  assert.equal((await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-03" })).status, 201);
  assert.equal((await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-04" })).status, 409);
  const validas = db().tabelas.funcionario_mot_eventos.filter((e) => e.funcionario_id === id(4) && e.tipo === "prorrogacao" && e.corrige_evento_id === null);
  assert.equal(validas.length, 2, "a anulada + a nova (a linha de correção não conta)");
});

// ── Afastamento ──────────────────────────────────────────────────────────────
await caso("afastamento: silencia o aviso (270+) no painel e no portal; só silencia — contagem real e relatório seguem", async () => {
  logar(db(), "dir"); logarPortal(db(), "cli");
  const r = await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "auxilio_doenca", observacoes: "INSS" });
  assert.equal(r.status, 201);
  assert.deepEqual(await listaPainel(), [id(4)]);
  assert.deepEqual(await listaPortal(), [id(4)]);

  const painel = serializar(await paginaPainel()).props.linhasIniciais.find((l) => l.id === id(1));
  const dias = diasEntre("2025-01-10", HOJE);
  assert.equal(painel.faixa, "limite_excedido"); // faixa real preservada
  assert.equal(painel.diasTrabalhados, diasEntre("2024-11-04", HOJE)); // contagem real não pausa
  assert.deepEqual(painel.selos.map((s) => s.texto), [`Afastado (${dias} dias)`]);

  const portalJson = JSON.stringify(serializar(await paginaPortal()));
  assert.ok(portalJson.includes("Em acompanhamento"));
  for (const proibido of ["Afastado", "afastamento", "auxilio", "INSS", "selos", "Prorrogado"]) assert.ok(!portalJson.includes(proibido), `portal vazou: ${proibido}`);
  assert.ok(!JSON.stringify((await chamar(popupPortal.GET)).corpo).match(/afast|INSS|auxilio/i));
});

await caso("afastamento: fim reativa o aviso; fim sem aberto = 409; segundo início = 409; fim antes do início = 400", async () => {
  logar(db(), "dir");
  assert.equal((await POST(id(1), { tipo: "afastamento_fim", data_evento: "2026-10-01" })).status, 409); // nada em aberto
  assert.equal((await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2026-02-10", tipo_beneficio: "acidentario" })).status, 201);
  assert.equal((await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2026-03-10", tipo_beneficio: "outro" })).status, 409);
  const antes = await POST(id(1), { tipo: "afastamento_fim", data_evento: "2026-02-01" });
  assert.equal(antes.status, 400);
  assert.match(antes.corpo.error, /anterior ao início/);
  assert.deepEqual(await listaPainel(), [id(4)]);
  assert.equal((await POST(id(1), { tipo: "afastamento_fim", data_evento: "2026-03-01" })).status, 201);
  assert.deepEqual(await listaPainel(), [id(1), id(4)]); // aviso voltou
  assert.equal((await POST(id(1), { tipo: "afastamento_fim", data_evento: "2026-03-02" })).status, 409);
});

// ── Validações de POST ───────────────────────────────────────────────────────
await caso("POST: datas (futura, antes da admissão), tipo, benefício, anexo, funcionário desligado/terceirizado", async () => {
  logar(db(), "dir");
  const ruim = async (funcionarioId, corpo, status, rx) => {
    const r = await POST(funcionarioId, corpo);
    assert.equal(r.status, status, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.corpo)}`);
    if (rx) assert.match(r.corpo.error, rx);
  };
  await ruim(id(4), { tipo: "prorrogacao", data_evento: dataMais(HOJE, 1) }, 400, /futura/);
  await ruim(id(4), { tipo: "prorrogacao", data_evento: "2026-04-15" }, 400, /anterior à admissão/);
  await ruim(id(4), { tipo: "prorrogacao", data_evento: "2026-13-40" }, 400);
  await ruim(id(4), { tipo: "encerramento", data_evento: "2026-10-01" }, 400);
  await ruim(id(4), { tipo: "afastamento_inicio", data_evento: "2026-10-01" }, 400, /benefício/);
  await ruim(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", tipo_beneficio: "outro" }, 400);
  await ruim(id(4), { tipo: "afastamento_inicio", data_evento: "2026-10-01", tipo_beneficio: "outro", arquivo_path: `aditivos/${id(4)}/x.pdf` }, 400);
  await ruim(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", arquivo_path: `aditivos/${id(5)}/aditivo.pdf` }, 400, /Anexo inválido/);
  await ruim(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", arquivo_path: `contratos/${id(4)}/contrato.pdf` }, 400, /Anexo inválido/);
  await ruim(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", arquivo_path: `aditivos/${id(4)}/../${id(5)}/x.pdf` }, 400, /Anexo inválido/);
  await ruim(F_D1, { tipo: "prorrogacao", data_evento: "2026-09-01" }, 409, /desligado/);
  await ruim(F_T1, { tipo: "prorrogacao", data_evento: "2026-09-01" }, 400, /mão de obra temporária/);
  assert.equal(db().tabelas.funcionario_mot_eventos.length, 0, "nada gravado nos casos inválidos");
});

await caso("POST: funcionario_id/cliente_id/criado_por do body são ignorados (tudo derivado no servidor)", async () => {
  logar(db(), "dir");
  const r = await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", funcionario_id: id(5), cliente_id: "C2", criado_por: "u-outro", id: "x" });
  assert.equal(r.status, 201);
  const linha = db().tabelas.funcionario_mot_eventos[0];
  assert.equal(linha.funcionario_id, id(4));
  assert.equal(linha.criado_por, "u-dir");
  assert.ok(!("cliente_id" in linha));
  assert.notEqual(linha.id, "x");
});

await caso("gates: anônimo 401, analista 403, supervisor de outra unidade 404, supervisor da unidade 201 — em todas as rotas novas", async () => {
  const corpo = { tipo: "prorrogacao", data_evento: "2026-10-01" };
  logar(db(), null);
  assert.equal((await POST(id(4), corpo)).status, 401);
  assert.equal((await GET(id(4))).status, 401);
  assert.equal((await chamar(upload.POST, { metodo: "POST", params: { id: id(4) }, corpo: {} })).status, 401);
  logar(db(), "ana");
  assert.equal((await POST(id(4), corpo)).status, 403);
  assert.equal((await GET(id(4))).status, 403);
  assert.equal((await chamar(upload.POST, { metodo: "POST", params: { id: id(4) }, corpo: {} })).status, 403);
  logar(db(), "sup2");
  assert.equal((await POST(id(4), corpo)).status, 404);
  assert.equal((await GET(id(4))).status, 404);
  assert.equal((await chamar(upload.POST, { metodo: "POST", params: { id: id(4) }, corpo: {} })).status, 404);
  logar(db(), "sup1");
  assert.equal((await POST(id(4), corpo)).status, 201);
  assert.equal((await GET(id(4))).status, 200);
  logar(db(), "sup2");
  assert.equal((await POST(F_U2, corpo)).status, 201); // supervisor da outra unidade, no funcionário DELE
});

await caso("GET histórico: dados do funcionário, hoje, eventos com anulado/eh_correcao, resumo e pode_corrigir", async () => {
  logar(db(), "dir");
  await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "outro" });
  const r = await GET(id(1));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.data.hoje, HOJE);
  assert.equal(r.corpo.data.funcionario.id, id(1));
  assert.equal(r.corpo.data.funcionario.clientes.nome, "Cliente Um");
  assert.equal(r.corpo.data.eventos.length, 1);
  assert.equal(r.corpo.data.eventos[0].criado_por_nome, "Nome u-dir");
  assert.equal(r.corpo.data.resumo.afastadoEmAberto, true);
  assert.equal(r.corpo.data.pode_corrigir, true);
  logar(db(), "sup1");
  assert.equal((await GET(id(1))).corpo.data.pode_corrigir, false);
});

// ── Aditivo (anexo) ──────────────────────────────────────────────────────────
await caso("aditivo: upload em aditivos/ (nunca contratos/), nada em funcionario_contratos, signed URL só do próprio funcionário", async () => {
  logar(db(), "dir");
  const up = await chamar(upload.POST, { metodo: "POST", params: { id: id(4) }, corpo: { nome_arquivo: "Aditivo 1º termo.pdf" } });
  assert.equal(up.status, 200);
  assert.match(up.corpo.path, new RegExp(`^aditivos/${id(4)}/aditivo-\\d+-Aditivo_1__termo\\.pdf$`));
  assert.ok(!up.corpo.path.startsWith("contratos/"));
  assert.ok(!db().consultas.some((c) => c.tabela === "funcionario_contratos"));
  const ev = await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", arquivo_path: up.corpo.path, nome_arquivo_original: "Aditivo.pdf" });
  const eventoId = ev.corpo.data.id;
  const url = await chamar(arquivoUrl.GET, { params: { id: id(4), eventoId } });
  assert.equal(url.status, 200);
  assert.ok(url.corpo.signedUrl.endsWith(up.corpo.path));
  assert.equal((await chamar(arquivoUrl.GET, { params: { id: id(5), eventoId } })).status, 404); // evento é de outro funcionário
  assert.ok(!db().consultas.some((c) => c.tabela === "funcionario_contratos"));
});

// ── Correção (anulação) ──────────────────────────────────────────────────────
await caso("correção: só FULL_ACCESS, linha compensatória, nunca update/delete; aviso volta; 409 em dobro", async () => {
  logar(db(), "dir");
  const ev = await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "outro" });
  const eventoId = ev.corpo.data.id;
  assert.deepEqual(await listaPainel(), [id(4)]);
  const C = (quem, params, corpo) => { logar(db(), quem); return chamar(corrigir.POST, { metodo: "POST", params, corpo }); };
  assert.equal((await C(null, { id: id(1), eventoId }, { motivo: "x" })).status, 401);
  assert.equal((await C("ana", { id: id(1), eventoId }, { motivo: "x" })).status, 403);
  assert.equal((await C("sup1", { id: id(1), eventoId }, { motivo: "x" })).status, 403); // gate de RH passa, FULL_ACCESS não
  assert.equal((await C("dir", { id: id(1), eventoId }, { motivo: "  " })).status, 400);
  assert.equal((await C("dir", { id: id(5), eventoId }, { motivo: "x" })).status, 404); // evento de outro funcionário
  const ok = await C("dir", { id: id(1), eventoId }, { motivo: "lançado por engano" });
  assert.equal(ok.status, 201);
  const linhas = db().tabelas.funcionario_mot_eventos;
  assert.equal(linhas.length, 2);
  const compensatoria = linhas[1];
  assert.equal(compensatoria.corrige_evento_id, eventoId);
  assert.equal(compensatoria.tipo, "afastamento_inicio");
  assert.equal(compensatoria.tipo_beneficio ?? null, null);
  assert.equal(linhas[0].id, eventoId, "evento original preservado");
  assert.deepEqual(await listaPainel(), [id(1), id(4)]); // anulado → aviso volta
  assert.equal((await C("dir", { id: id(1), eventoId }, { motivo: "de novo" })).status, 409);
  assert.equal((await C("dir", { id: id(1), eventoId: compensatoria.id }, { motivo: "corrigir a correção" })).status, 409);
  assert.ok(!db().consultas.some((c) => c.tabela === "funcionario_mot_eventos" && (c.op === "update" || c.op === "delete")));
  const hist = (await GET(id(1))).corpo.data.eventos;
  assert.deepEqual(hist.map((e) => [e.anulado, e.eh_correcao]).sort(), [[false, true], [true, false]].sort());
  const a = auditoria(db()).find((x) => x.acao === "funcionario_mot_evento_corrigido");
  assert.deepEqual(Object.keys(a.detalhes).sort(), ["evento_corrigido_id", "funcionario_id", "tipo"]);
});

await caso("correção de um início deixa um 'fim' órfão sem afastar ninguém", async () => {
  logar(db(), "dir");
  const ini = await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "outro" });
  await POST(id(1), { tipo: "afastamento_fim", data_evento: "2025-02-10" });
  await chamar(corrigir.POST, { metodo: "POST", params: { id: id(1), eventoId: ini.corpo.data.id }, corpo: { motivo: "erro" } });
  assert.deepEqual(await listaPainel(), [id(1), id(4)]);
  const r = (await GET(id(1))).corpo.data.resumo;
  assert.equal(r, null, "sem afastamento aberto, sem prorrogação, sem rescisão: sem resumo");
});

// ── Rescisão programada ──────────────────────────────────────────────────────
await caso("rescisão com data FUTURA: grava, mantém 'ativo', silencia o aviso, auditoria marca programada", async () => {
  logar(db(), "dir"); logarPortal(db(), "cli");
  const r = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1)) });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(statusDe(id(1)), "ativo");
  assert.equal(db().tabelas.rescisoes.filter((x) => x.funcionario_id === id(1)).length, 1);
  assert.deepEqual(db().avisosDisparados.map((a) => a.momento), ["lancamento"]);
  const a = auditoria(db()).find((x) => x.acao === "rescisao_criada");
  assert.equal(a.detalhes.programada, true);
  assert.equal(a.detalhes.data_desligamento, "2026-11-30");
  assert.deepEqual(await listaPainel(), [id(4)]);
  assert.deepEqual(await listaPortal(), [id(4)]);
  const selos = serializar(await paginaPainel()).props.linhasIniciais.find((l) => l.id === id(1)).selos.map((s) => s.texto);
  assert.deepEqual(selos, ["Rescisão programada 30/11"]);
  const portalJson = JSON.stringify(serializar(await paginaPortal()));
  assert.ok(!portalJson.includes("Rescisão programada") && !portalJson.includes("selos"));
});

await caso("rescisão futura: 409 no segundo lançamento; prorrogação/afastamento viram 409; fim de afastamento ainda aceito", async () => {
  logar(db(), "dir");
  await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "outro" });
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1)) })).status, 200);
  const dup = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1), { data_desligamento: "2026-12-30" }) });
  assert.equal(dup.status, 409);
  assert.match(dup.corpo.error, /30\/11\/2026/);
  assert.equal(db().tabelas.rescisoes.filter((x) => x.funcionario_id === id(1)).length, 1);
  assert.equal((await POST(id(1), { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 409);
  assert.equal((await POST(id(1), { tipo: "afastamento_fim", data_evento: "2026-10-01" })).status, 201);
});

await caso("rescisão com data de HOJE ou passada desliga no ato (como antes)", async () => {
  logar(db(), "dir");
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(3), { data_desligamento: HOJE }) })).status, 200);
  assert.equal(statusDe(id(3)), "desligado");
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(6), { data_desligamento: "2026-09-01" }) })).status, 200);
  assert.equal(statusDe(id(6)), "desligado");
  const a = auditoria(db()).filter((x) => x.acao === "rescisao_criada");
  assert.ok(a.every((x) => !("programada" in x.detalhes)));
});

await caso("data de desligamento mal formatada é recusada (comparação é por string AAAA-MM-DD)", async () => {
  logar(db(), "dir");
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(3), { data_desligamento: "2026-12-9" }) })).status, 400);
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(3), { data_desligamento: "09/12/2026" }) })).status, 400);
  assert.equal(statusDe(id(3)), "ativo");
});

await caso("PATCH da data: ativo+programada aceita qualquer data; data que chegou desliga; desligado não ganha data futura", async () => {
  logar(db(), "dir");
  const rid = (await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1)) })).corpo.data.id;
  const P = (corpo) => chamar(rescisaoPorId.PATCH, { metodo: "PATCH", params: { id: rid }, corpo });
  assert.equal((await P({ data_desligamento: "2026-12-15" })).status, 200);
  assert.equal(statusDe(id(1)), "ativo");
  assert.equal((await P({ valor_rescisao: 999 })).status, 200); // outros campos seguem como antes
  assert.equal(statusDe(id(1)), "ativo");
  const hoje = await P({ data_desligamento: HOJE });
  assert.equal(hoje.status, 200);
  assert.equal(statusDe(id(1)), "desligado");
  assert.equal(auditoria(db()).filter((x) => x.acao === "rescisao_atualizada").at(-1).detalhes.funcionario_desligado, true);
  const futuro = await P({ data_desligamento: "2026-12-31" });
  assert.equal(futuro.status, 400);
  assert.match(futuro.corpo.error, /já desligado/);
  assert.equal((await P({ data_desligamento: "2026-09-01" })).status, 200); // data passada em desligado: como antes
});

await caso("DELETE: só FULL_ACCESS, só programada (data futura + funcionário ativo); auditoria; aviso volta", async () => {
  logar(db(), "dir");
  const rid = (await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1)) })).corpo.data.id;
  const D = (quem, rescisaoId = rid) => { logar(db(), quem); return chamar(rescisaoPorId.DELETE, { metodo: "DELETE", params: { id: rescisaoId } }); };
  assert.equal((await D(null)).status, 401);
  assert.equal((await D("ana")).status, 403);
  assert.equal((await D("sup1")).status, 403);
  assert.equal(db().tabelas.rescisoes.filter((x) => x.id === rid).length, 1);
  assert.equal((await D("dir", "r-d1")).status, 409); // já efetivada (data passada, desligado)
  assert.equal((await D("dir", "nao-existe")).status, 404);
  assert.equal((await D("dir")).status, 200);
  assert.equal(db().tabelas.rescisoes.filter((x) => x.id === rid).length, 0);
  assert.equal(statusDe(id(1)), "ativo");
  const a = auditoria(db()).find((x) => x.acao === "rescisao_programada_cancelada");
  assert.equal(a.entidade_id, rid);
  assert.equal(a.detalhes.funcionario_id, id(1));
  logar(db(), "dir");
  assert.deepEqual(await listaPainel(), [id(1), id(4)]);
});

await caso("DELETE recusa: data que chegou (mesmo com funcionário ainda ativo) e funcionário já desligado", async () => {
  logar(db(), "dir");
  const hoje = (await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1), { data_desligamento: dataMais(HOJE, 1) }) })).corpo.data.id;
  // vira o dia: a data programada passa a ser "hoje" antes do cron das 6h
  db().tabelas.rescisoes.find((r) => r.id === hoje).data_desligamento = HOJE;
  const r1 = await chamar(rescisaoPorId.DELETE, { metodo: "DELETE", params: { id: hoje } });
  assert.equal(r1.status, 409);
  const futura = (await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(2), { data_desligamento: "2026-12-30" }) })).corpo.data.id;
  db().tabelas.funcionarios.find((f) => f.id === id(2)).status = "desligado";
  assert.equal((await chamar(rescisaoPorId.DELETE, { metodo: "DELETE", params: { id: futura } })).status, 409);
  assert.equal(db().tabelas.rescisoes.filter((x) => [hoje, futura].includes(x.id)).length, 2);
});

await caso("rescisão: corrida no guard é barrada pelo índice único (23505 → 409 amigável); sem o índice o duplicado passaria", async () => {
  logar(db(), "dir");
  db().unicos = { rescisoes: ["funcionario_id"] }; // como depois de aplicar migration_rescisoes_funcionario_unico.sql
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1)) })).status, 200);
  // O guard (select) "não enxerga" a linha da outra requisição: é exatamente a janela do check-then-insert.
  db().falhas["rescisoes.select"] = "leitura atrasada";
  const barrada = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1), { data_desligamento: "2026-12-30" }) });
  assert.equal(barrada.status, 409);
  assert.equal(barrada.corpo.error, "Este funcionário já tem uma rescisão lançada.");
  assert.ok(!JSON.stringify(barrada.corpo).match(/duplicate|constraint|unico/i), "sem texto cru do banco");
  assert.equal(db().tabelas.rescisoes.filter((x) => x.funcionario_id === id(1)).length, 1);
  assert.deepEqual(db().avisosDisparados.map((a) => a.momento), ["lancamento"], "a segunda não disparou aviso");
  assert.equal(auditoria(db()).filter((x) => x.acao === "rescisao_criada").length, 1, "a segunda não gerou auditoria");
  assert.equal(statusDe(id(1)), "ativo");
  // contraprova: sem o índice, a mesma corrida cria a linha duplicada (é o que o índice impede)
  delete db().unicos;
  assert.equal((await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1), { data_desligamento: "2026-12-30" }) })).status, 200);
  assert.equal(db().tabelas.rescisoes.filter((x) => x.funcionario_id === id(1)).length, 2);
});

await caso("rescisão: outros erros do insert seguem como antes (400 com a mensagem), só o 23505 vira 409", async () => {
  logar(db(), "dir");
  db().falhas["rescisoes.insert"] = { code: "23503", message: "violates foreign key" };
  const r = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(3)) });
  assert.equal(r.status, 400);
  assert.equal(r.corpo.error, "violates foreign key");
});

// ── Erros de banco/Storage nas rotas novas: log no servidor + frase genérica ─
await caso("rotas novas: erro de banco/Storage → console.error com prefixo da rota e frase genérica (nunca texto cru)", async () => {
  logar(db(), "dir");
  const CRU = 'relation "tabela_secreta" violates constraint xyz_fkey (SQLSTATE 23503)';
  const logs = [];
  const original = console.error;
  console.error = (...a) => { logs.push(a.map(String).join(" ")); };
  const limpo = (r, genericaRx, prefixo, operacao) => {
    assert.equal(r.status, 500, `${prefixo}: ${JSON.stringify(r.corpo)}`);
    assert.match(r.corpo.error, genericaRx, prefixo);
    const texto = JSON.stringify(r.corpo);
    for (const proibido of ["tabela_secreta", "SQLSTATE", "xyz_fkey", "violates", "relation"]) assert.ok(!texto.includes(proibido), `${prefixo}: vazou "${proibido}"`);
    assert.ok(logs.some((l) => l.includes(prefixo) && l.includes(CRU) && (!operacao || l.includes(operacao))), `${prefixo}: log do servidor sem a mensagem real. Logs: ${logs.join(" | ")}`);
  };
  try {
    // GET (histórico)
    db().falhas["funcionario_mot_eventos.select"] = CRU;
    limpo(await GET(id(4)), /Não foi possível carregar o histórico/, "[mot-eventos GET]");
    // POST: leitura dos eventos
    limpo(await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01" }), /Não foi possível registrar o evento/, "[mot-eventos POST]", "Erro ao buscar eventos");
    delete db().falhas["funcionario_mot_eventos.select"];
    // POST: gravação
    db().falhas["funcionario_mot_eventos.insert"] = CRU;
    limpo(await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01" }), /Não foi possível registrar o evento/, "[mot-eventos POST]", "Erro ao gravar evento");
    delete db().falhas["funcionario_mot_eventos.insert"];
    assert.equal(db().tabelas.funcionario_mot_eventos.length, 0);
    // corrigir
    const ev = await POST(id(1), { tipo: "afastamento_inicio", data_evento: "2025-01-10", tipo_beneficio: "outro" });
    db().falhas["funcionario_mot_eventos.insert"] = CRU;
    limpo(await chamar(corrigir.POST, { metodo: "POST", params: { id: id(1), eventoId: ev.corpo.data.id }, corpo: { motivo: "erro" } }), /Não foi possível registrar a correção/, "[mot-eventos/corrigir]");
    delete db().falhas["funcionario_mot_eventos.insert"];
    assert.equal(db().tabelas.funcionario_mot_eventos.length, 1, "nenhuma linha de correção gravada");
    // upload do aditivo (Storage)
    db().falhas["storage.upload"] = CRU;
    limpo(await chamar(upload.POST, { metodo: "POST", params: { id: id(4) }, corpo: { nome_arquivo: "a.pdf" } }), /Não foi possível preparar o envio do aditivo/, "[mot-eventos/aditivo-upload-url]");
    delete db().falhas["storage.upload"];
    // leitura do aditivo (Storage)
    const comAnexo = await POST(id(4), { tipo: "prorrogacao", data_evento: "2026-10-01", arquivo_path: `aditivos/${id(4)}/aditivo-1-a.pdf`, nome_arquivo_original: "a.pdf" });
    db().falhas["storage.url"] = CRU;
    limpo(await chamar(arquivoUrl.GET, { params: { id: id(4), eventoId: comAnexo.corpo.data.id } }), /Não foi possível abrir o aditivo/, "[mot-eventos/arquivo-url]");
    delete db().falhas["storage.url"];
  } finally {
    console.error = original;
  }
});

// ── Cron: 3º passo ───────────────────────────────────────────────────────────
const CRON = () => chamar(cron.GET, { headers: { authorization: "Bearer segredo-de-teste" } });
function seedRescisaoPendente(funcionarioId, data) {
  db().tabelas.rescisoes.push({
    id: `r-${funcionarioId.slice(-2)}`, funcionario_id: funcionarioId, unidade_id: "U1", empresa: "Cliente Um", data_desligamento: data,
    modalidade: "pedido_demissao", valor_rescisao: 1, data_pagamento_rescisao: "2027-01-01", faturado: false,
  });
}

await caso("cron: sem segredo 401; efetiva só quem chegou (<= hoje, Brasília); roda 2x e é idempotente", async () => {
  assert.equal((await chamar(cron.GET)).status, 401);
  seedRescisaoPendente(id(2), HOJE);
  seedRescisaoPendente(id(3), dataMais(HOJE, -1));
  seedRescisaoPendente(id(5), dataMais(HOJE, 1));
  const um = await CRON();
  assert.equal(um.status, 200);
  assert.equal(um.corpo.desligamentos_efetivados, 2);
  assert.deepEqual([statusDe(id(2)), statusDe(id(3)), statusDe(id(5))], ["desligado", "desligado", "ativo"]);
  const dois = await CRON();
  assert.equal(dois.corpo.desligamentos_efetivados, 0);
  assert.deepEqual([statusDe(id(2)), statusDe(id(3)), statusDe(id(5))], ["desligado", "desligado", "ativo"]);
  assert.equal(statusDe(F_D1), "desligado");
  assert.equal(statusDe(id(4)), "ativo"); // sem rescisão: intocado
  for (const k of ["vencimento_rescisao_enviados", "vencimento_rescisao_falhados", "vencimento_guia_enviados", "vencimento_guia_falhados"]) assert.ok(k in um.corpo, `chave antiga ${k}`);
});

await caso("cron: falha no 3º passo é isolada (200, passos antigos intactos) e se recupera no dia seguinte", async () => {
  seedRescisaoPendente(id(2), dataMais(HOJE, -3));
  // um aviso de vencimento que o passo antigo precisa continuar enviando
  db().tabelas.rescisoes.push({ id: "r-venc", funcionario_id: id(6), unidade_id: "U1", empresa: "X", data_desligamento: "2027-03-01", modalidade: "pedido_demissao",
    valor_rescisao: 5, data_pagamento_rescisao: HOJE, faturado: false, ultimo_aviso_vencimento_rescisao_enviado_em: null });
  db().falhas["funcionarios.update"] = "banco fora do ar";
  const quebrado = await CRON();
  assert.equal(quebrado.status, 200);
  assert.equal(quebrado.corpo.desligamentos_efetivados, 0);
  assert.equal(quebrado.corpo.vencimento_rescisao_enviados, 1, "passo de aviso antigo continua funcionando");
  assert.deepEqual(db().avisosDisparados.map((a) => a.momento), ["vencimento_rescisao"]);
  assert.equal(statusDe(id(2)), "ativo");
  delete db().falhas["funcionarios.update"];
  const dia2 = await CRON();
  assert.equal(dia2.corpo.desligamentos_efetivados, 1, "auto-recuperação: critério é <= hoje, não = hoje");
  assert.equal(statusDe(id(2)), "desligado");
  db().falhas["rescisoes.select"] = "tabela fora do ar";
  const semTabela = await CRON();
  assert.equal(semTabela.status, 200, "erro de leitura também não derruba a resposta");
});

await caso("rescisão programada que chega ao dia: depois do cron o aviso nem existe mais (status desligado) e nada fica 'ativo com rescisão vencida'", async () => {
  logar(db(), "dir");
  const rid = (await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(id(1), { data_desligamento: dataMais(HOJE, 1) }) })).corpo.data.id;
  assert.deepEqual(await listaPainel(), [id(4)]);
  db().tabelas.rescisoes.find((r) => r.id === rid).data_desligamento = HOJE; // o dia chegou
  assert.deepEqual(await listaPainel(), [id(4)], "entre 00:00 e o cron das 6h continua calado");
  assert.equal((await CRON()).corpo.desligamentos_efetivados, 1);
  assert.equal(statusDe(id(1)), "desligado");
  assert.deepEqual(await listaPainel(), [id(4)]);
});

// ── Sem N+1, sem custo novo ──────────────────────────────────────────────────
await caso("popup: exatamente 1 select em eventos e 1 em rescisões, com 33 ou com 133 funcionários (sem N+1)", async () => {
  logar(db(), "dir");
  const contar = async () => {
    db().consultas.length = 0;
    await chamar(popupPainel.GET);
    const n = (tabela) => db().consultas.filter((c) => c.tabela === tabela && c.op === "select").length;
    return { eventos: n("funcionario_mot_eventos"), rescisoes: n("rescisoes") };
  };
  const pequeno = await contar();
  for (let i = 0; i < 100; i++) addMot(`dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`, 20 + i);
  const grande = await contar();
  assert.deepEqual(pequeno, { eventos: 1, rescisoes: 1 });
  assert.deepEqual(grande, { eventos: 1, rescisoes: 1 });
});

await caso("popup/relatórios: se a tabela nova ainda não existe (migration não aplicada), cai no comportamento de antes", async () => {
  logar(db(), "dir"); logarPortal(db(), "cli");
  db().falhas["funcionario_mot_eventos.select"] = 'relation "funcionario_mot_eventos" does not exist';
  assert.deepEqual(await listaPainel(), [id(1), id(4)]);
  assert.deepEqual(await listaPortal(), [id(1), id(4)]);
  assert.equal(serializar(await paginaPainel()).props.linhasIniciais.length, 32); // 31 da U1 + 1 da U2 (diretoria vê todas)
});

// ── Datas de borda (fuso de Brasília) ────────────────────────────────────────
await caso("borda de fuso: 23:30 BRT do dia 07 ainda é dia 07; 00:00 BRT do dia 08 já é dia 08 (rescisão de 08/10)", async () => {
  const lib = await importar("src/lib/rescisaoProgramada.ts");
  const Real = globalThis.__DateReal__;
  assert.equal(lib.hojeBrasiliaISO(new Real("2026-10-08T02:30:00Z")), "2026-10-07");
  assert.equal(lib.hojeBrasiliaISO(new Real("2026-10-08T03:00:00Z")), "2026-10-08");
  assert.equal(lib.dataJaChegou("2026-10-08", lib.hojeBrasiliaISO(new Real("2026-10-08T02:30:00Z"))), false);
  assert.equal(lib.dataJaChegou("2026-10-08", lib.hojeBrasiliaISO(new Real("2026-10-08T03:00:00Z"))), true);
  assert.equal(lib.dataJaChegou("2026-10-06", "2026-10-07"), true); // ontem
  assert.equal(lib.dataJaChegou("2026-10-07", "2026-10-07"), true); // hoje
  assert.equal(lib.dataJaChegou("2026-10-08", "2026-10-07"), false); // amanhã
  assert.equal(lib.dataEhFutura("2026-10-07", "2026-10-07"), false);
});

// ── Provas estáticas: nenhum custo novo ──────────────────────────────────────
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
await caso("sem cron novo: vercel.json idêntico ao da main e nenhuma pasta nova em api/cron", async () => {
  assert.equal(readFileSync(`${ROOT}/vercel.json`, "utf8"), git("show", "main:vercel.json"));
  const cronDirs = (ref) => git("ls-tree", "-d", "--name-only", ref, "src/app/api/cron/").split("\n").filter(Boolean).sort();
  const noDisco = git("ls-files", "-co", "--exclude-standard", "src/app/api/cron/").split("\n").filter(Boolean).map((p) => p.split("/").slice(0, 5).join("/"));
  assert.deepEqual([...new Set(noDisco)].sort(), cronDirs("main"));
});

await caso("sem polling/Realtime/IA/rede externa nos arquivos novos ou alterados", async () => {
  const alterados = new Set([
    ...git("diff", "--name-only", "main").split("\n"),
    ...git("ls-files", "-o", "--exclude-standard").split("\n"),
  ].filter((p) => p.startsWith("src/") || p.startsWith("supabase/")));
  assert.ok(alterados.size > 10, "lista de arquivos veio vazia");
  const proibidos = [/setInterval/, /setTimeout/, /EventSource/, /WebSocket/, /\.channel\(/, /realtime/i, /anthropic/i, /openai/i, /fetch\(\s*["'`]https?:/, /new Worker/];
  const achados = [];
  for (const p of alterados) {
    const texto = readFileSync(`${ROOT}/${p}`, "utf8");
    for (const rx of proibidos) if (rx.test(texto)) achados.push(`${p}: ${rx}`);
  }
  assert.deepEqual(achados, []);
});

await caso("cliente_id nunca é lido do request nas rotas novas", async () => {
  const rotas = git("ls-files", "-o", "--exclude-standard", "src/app/api/funcionarios/[id]/mot-eventos").split("\n").filter(Boolean);
  assert.equal(rotas.length, 4);
  for (const p of rotas) {
    const texto = readFileSync(`${ROOT}/${p}`, "utf8");
    assert.ok(!/(body|corpo|parsed\.data|d)\.cliente_id/.test(texto), `${p} lê cliente_id do request`);
    assert.ok(!/(body|corpo)\.funcionario_id/.test(texto), `${p} lê funcionario_id do request`);
  }
});

console.log(`\n${total} casos OK${process.exitCode ? " (HÁ FALHAS)" : ""}`);
void F_U2;
