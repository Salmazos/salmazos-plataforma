// Efetivação de funcionário MOT/Terceirização: efetivado continua ATIVO, mas sai de TODOS os alertas de vencimento de contrato
// (banner >270 dias, popup do painel, tela e popup do portal, menu do portal). Desfazer devolve. Rotas e páginas rodam contra o banco
// em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-funcionario-efetivado.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, HOJE, dataMais, novoDb, logar, logarPortal, importar, chamar, serializar, funcionarioMot, idMot, auditoria, USUARIOS } from "./harness-mot/ambiente.mjs";
import { ehErroColunaAusente, consultarComEfetivacao } from "../src/lib/funcionarioEfetivacao";
import { avisoMotSilenciado, calcularVencimentoContratoMot, precisaAvisoPopupVencimentoMot } from "../src/lib/contratoMotStatus";

congelarData(AGORA_ISO); // 07/10/2026
const R = {
  efetivacao: await importar("src/app/api/funcionarios/[id]/efetivacao/route.ts"),
  popupPainel: await importar("src/app/api/funcionarios/vencimento-contrato/popup/route.ts"),
  popupPortal: await importar("src/app/api/portal/funcionarios/vencimento-contrato/popup/route.ts"),
  eventos: await importar("src/app/api/funcionarios/[id]/mot-eventos/route.ts"),
  funcionario: await importar("src/app/api/funcionarios/[id]/route.ts"),
  paginaPainel: (await importar("src/app/painel/vencimento-contrato/page.tsx")).default,
  paginaPortal: (await importar("src/app/portal/(app)/vencimento-contrato/page.tsx")).default,
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const MOT = "mao_obra_temporaria", TERC = "terceirizacao", RS = "recrutamento_selecao";
const id = (k: number) => idMot(700 + k);
function cenario(linhas: [number, string, number, Record<string, unknown>?][]) {
  const db = novoDb(); logar(db, "dir"); logarPortal(db, "cli");
  db.tabelas.funcionarios = linhas.map(([k, tipo, dias, extra]) => funcionarioMot(id(k), dataMais(HOJE, -dias), { tipo_servico: tipo, nome_completo: `Func ${k}`, ...(extra ?? {}) }));
  db.tabelas.funcionario_mot_eventos = [];
  db.tabelas.rescisoes = [];
  db.tabelas.audit_logs = [];
  return db;
}
const EFETIVAR = (db: any, fid: string, corpo: Record<string, unknown>, quem = "dir") => { logar(db, quem); return chamar(R.efetivacao.POST, { metodo: "POST", params: { id: fid }, corpo }); };
const DESFAZER = (db: any, fid: string, quem = "dir") => { logar(db, quem); return chamar(R.efetivacao.DELETE, { metodo: "DELETE", params: { id: fid } }); };
const idsPopupPainel = async (db: any) => { logar(db, "dir"); return ((await chamar(R.popupPainel.GET)).corpo.data ?? []).map((a: any) => a.funcionario_id).sort(); };
const idsPopupPortal = async (db: any) => { logar(db, "dir"); logarPortal(db, "cli"); return (await chamar(R.popupPortal.GET)).corpo.data.map((a: any) => a.id).sort(); };
const linhasPainel = async (db: any) => { logar(db, "dir"); return serializar(await R.paginaPainel()).props.linhasIniciais as any[]; };
const achar = (no: any): any => (no && typeof no === "object" ? (no.props?.linhas ? no : [].concat(no.filhos ?? []).map(achar).find(Boolean)) : undefined);
const idsTelaPortal = async (db: any) => { logar(db, "dir"); logarPortal(db, "cli"); return achar(serializar(await R.paginaPortal())).props.linhas.map((l: any) => l.id).sort(); };
// Mesma conta do banner da tela (VencimentoContratoPageClient): excedidos que NÃO estão efetivados.
const excedidos = (linhas: any[]) => linhas.filter((l) => !l.efetivadoEm && l.faixa === "limite_excedido").length;

await ok("efetivado sai da contagem >270 dias (banner) e continua na lista com efetivadoEm; desfazer volta", async () => {
  const db = cenario([[1, MOT, 300], [2, TERC, 300], [3, MOT, 100]]);
  assert.equal(excedidos(await linhasPainel(db)), 2);
  const r = await EFETIVAR(db, id(1), { data_efetivacao: HOJE, observacao: "Contratado pelo cliente" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const f1 = db.tabelas.funcionarios.find((f: any) => f.id === id(1));
  assert.deepEqual([f1.efetivado_em, f1.efetivado_por, f1.efetivado_obs, f1.status], [HOJE, USUARIOS.dir.id, "Contratado pelo cliente", "ativo"], "grava e NÃO mexe no status");
  const linhas = await linhasPainel(db);
  assert.equal(linhas.length, 3, "efetivado continua na lista");
  assert.equal(linhas.find((l) => l.id === id(1)).efetivadoEm, HOJE);
  assert.equal(excedidos(linhas), 1, "banner desconta o efetivado");
  assert.equal(db.tabelas.rescisoes.length, 0, "nenhuma rescisão criada");
  const d = await DESFAZER(db, id(1));
  assert.equal(d.status, 200, JSON.stringify(d.corpo));
  assert.equal(db.tabelas.funcionarios.find((f: any) => f.id === id(1)).efetivado_em ?? null, null);
  assert.equal(excedidos(await linhasPainel(db)), 2, "voltou à contagem");
});
await ok("efetivado sai do popup do painel, do popup do portal, da tela do portal; desfazer devolve aos três", async () => {
  const db = cenario([[1, MOT, 300], [2, MOT, 175], [3, TERC, 300]]);
  assert.deepEqual(await idsPopupPainel(db), [id(1), id(2), id(3)]);
  assert.deepEqual(await idsPopupPortal(db), [id(1), id(2)]);
  assert.deepEqual(await idsTelaPortal(db), [id(1), id(2)]);
  assert.equal((await EFETIVAR(db, id(1), { data_efetivacao: HOJE })).status, 200);
  assert.equal((await EFETIVAR(db, id(3), { data_efetivacao: HOJE })).status, 200);
  assert.deepEqual(await idsPopupPainel(db), [id(2)]);
  assert.deepEqual(await idsPopupPortal(db), [id(2)]);
  assert.deepEqual(await idsTelaPortal(db), [id(2)]);
  assert.equal(JSON.stringify(serializar(await R.paginaPortal())).includes("fetivad"), false, "portal não menciona efetivação");
  assert.equal((await DESFAZER(db, id(1))).status, 200);
  assert.deepEqual(await idsPopupPainel(db), [id(1), id(2)]);
  assert.deepEqual(await idsPopupPortal(db), [id(1), id(2)]);
  assert.deepEqual(await idsTelaPortal(db), [id(1), id(2)]);
});
await ok("data inválida é rejeitada: futura, anterior à admissão, formato ruim, ausente; nada é gravado", async () => {
  const db = cenario([[1, MOT, 100]]);
  const admissao = dataMais(HOJE, -100);
  for (const [data, trecho] of [[dataMais(HOJE, 1), /futura/], [dataMais(admissao, -1), /anterior à admissão/], ["2026-13-40", /inválida/], ["07/10/2026", /inválida/], [undefined, /./]] as const) {
    const r = await EFETIVAR(db, id(1), data === undefined ? {} : { data_efetivacao: data });
    assert.equal(r.status, 400, `${data}`);
    assert.match(r.corpo.error, trecho);
  }
  assert.equal(db.tabelas.funcionarios[0].efetivado_em ?? null, null);
  assert.equal((await EFETIVAR(db, id(1), { data_efetivacao: admissao })).status, 200, "a própria data de admissão vale");
});
await ok("funcionário desligado não pode ser efetivado nem ter efetivação desfeita; R&S recusado; inexistente 404", async () => {
  const db = cenario([[1, MOT, 300, { status: "desligado" }], [2, RS, 300], [3, MOT, 300, { status: "desligado", efetivado_em: HOJE, efetivado_por: "u-dir" }]]);
  const a = await EFETIVAR(db, id(1), { data_efetivacao: HOJE });
  assert.deepEqual([a.status, a.corpo.error], [409, "Este funcionário já está desligado."]);
  assert.equal((await EFETIVAR(db, id(2), { data_efetivacao: HOJE })).status, 400);
  assert.equal((await EFETIVAR(db, idMot(799), { data_efetivacao: HOJE })).status, 404);
  assert.equal((await DESFAZER(db, id(3))).status, 409);
  assert.equal(db.tabelas.funcionarios[0].efetivado_em ?? null, null);
});
await ok("duplo POST e DELETE sem efetivação: 409 uniforme { error }", async () => {
  const db = cenario([[1, MOT, 300]]);
  assert.equal((await DESFAZER(db, id(1))).status, 409);
  assert.equal((await EFETIVAR(db, id(1), { data_efetivacao: HOJE })).status, 200);
  const dup = await EFETIVAR(db, id(1), { data_efetivacao: dataMais(HOJE, -1) });
  assert.deepEqual([dup.status, Object.keys(dup.corpo)], [409, ["error"]]);
  assert.equal(db.tabelas.funcionarios[0].efetivado_em, HOJE, "a primeira efetivação não é sobrescrita");
});
await ok("convivência com eventos MOT: afastado e prorrogado PODEM efetivar (alertas somem, afastamento intacto); rescisão programada NÃO; Prorrogar/Afastar seguem funcionando", async () => {
  const db = cenario([[1, MOT, 300], [2, MOT, 175], [3, MOT, 300], [4, MOT, 200]]);
  logar(db, "dir");
  assert.equal((await chamar(R.eventos.POST, { metodo: "POST", params: { id: id(1) }, corpo: { tipo: "afastamento_inicio", data_evento: dataMais(HOJE, -10), tipo_beneficio: "auxilio_doenca" } })).status, 201);
  assert.equal((await chamar(R.eventos.POST, { metodo: "POST", params: { id: id(2) }, corpo: { tipo: "prorrogacao", data_evento: dataMais(HOJE, -5) } })).status, 201);
  db.tabelas.rescisoes = [{ id: "r1", funcionario_id: id(3), unidade_id: "U1", empresa: "Cliente Um", data_desligamento: dataMais(HOJE, 20) }];
  const eventosAntes = db.tabelas.funcionario_mot_eventos.length;
  assert.equal((await EFETIVAR(db, id(1), { data_efetivacao: HOJE })).status, 200, "afastado efetiva");
  assert.equal((await EFETIVAR(db, id(2), { data_efetivacao: HOJE })).status, 200, "prorrogado efetiva");
  const rr = await EFETIVAR(db, id(3), { data_efetivacao: HOJE });
  assert.deepEqual([rr.status, rr.corpo.error], [409, "Este funcionário tem rescisão programada."]);
  assert.equal(db.tabelas.funcionario_mot_eventos.length, eventosAntes, "efetivar não cria nem altera evento MOT");
  const linhas = await linhasPainel(db);
  const l1 = linhas.find((l) => l.id === id(1));
  assert.ok(l1.efetivadoEm && l1.selos.some((s: any) => s.texto.startsWith("Afastado")), "afastamento continua aparecendo como selo");
  assert.deepEqual(await idsPopupPainel(db), [], "nenhum aviso restante (os não efetivados estão silenciados por evento ou fora de janela)");
  // Ações do contrato continuam valendo para efetivado e para os demais.
  assert.equal((await chamar(R.eventos.POST, { metodo: "POST", params: { id: id(1) }, corpo: { tipo: "afastamento_fim", data_evento: HOJE } })).status, 201, "encerrar afastamento de efetivado");
  assert.equal((await chamar(R.eventos.POST, { metodo: "POST", params: { id: id(4) }, corpo: { tipo: "prorrogacao", data_evento: HOJE } })).status, 201, "prorrogar não efetivado");
});
await ok("permissão e unidade: mesmo gate do RH — dp/supervisor da unidade podem; supervisor de outra unidade 404; analista 403; sem login 401", async () => {
  const db = cenario([[1, MOT, 300], [2, MOT, 300, { unidade_id: "U2" }]]);
  assert.equal((await EFETIVAR(db, id(1), { data_efetivacao: HOJE }, "ana")).status, 403);
  assert.equal((await EFETIVAR(db, id(2), { data_efetivacao: HOJE }, "sup1")).status, 404);
  assert.equal((await EFETIVAR(db, id(1), { data_efetivacao: HOJE }, "sup1")).status, 200);
  assert.equal((await DESFAZER(db, id(2), "sup1")).status, 404);
  assert.equal((await DESFAZER(db, id(1), "ana")).status, 403);
  assert.equal((await DESFAZER(db, id(1), "sup1")).status, 200);
  assert.equal((await EFETIVAR(db, id(2), { data_efetivacao: HOJE }, "sup2")).status, 200);
  logar(db, null);
  assert.equal((await chamar(R.efetivacao.POST, { metodo: "POST", params: { id: id(1) }, corpo: { data_efetivacao: HOJE } })).status, 401);
});
await ok("auditoria: funcionario_efetivado e funcionario_efetivacao_desfeita com ids, data e quem fez", async () => {
  const db = cenario([[1, MOT, 300]]);
  await EFETIVAR(db, id(1), { data_efetivacao: dataMais(HOJE, -2), observacao: "  contratado  " });
  await DESFAZER(db, id(1));
  assert.deepEqual(auditoria(db), [
    { acao: "funcionario_efetivado", entidade: "funcionarios", entidade_id: id(1), usuario_id: USUARIOS.dir.id, detalhes: { funcionario_id: id(1), data_efetivacao: dataMais(HOJE, -2), observacao: "contratado" } },
    { acao: "funcionario_efetivacao_desfeita", entidade: "funcionarios", entidade_id: id(1), usuario_id: USUARIOS.dir.id, detalhes: { funcionario_id: id(1), data_efetivacao_anulada: dataMais(HOJE, -2) } },
  ]);
});
await ok("sem efetivação nada muda: funcionário não efetivado aparece nos mesmos alertas de antes; PATCH da ficha não grava efetivado_*", async () => {
  const db = cenario([[1, MOT, 300], [2, TERC, 265], [3, MOT, 50]]);
  assert.deepEqual(await idsPopupPainel(db), [id(1), id(2)]);
  assert.equal(excedidos(await linhasPainel(db)), 1);
  logar(db, "dir");
  await chamar(R.funcionario.PATCH, { metodo: "PATCH", params: { id: id(1) }, corpo: { efetivado_em: HOJE, efetivado_por: "x", efetivado_obs: "x" } });
  assert.equal(db.tabelas.funcionarios[0].efetivado_em ?? null, null, "PATCH genérico ignora efetivado_em");
  const v = calcularVencimentoContratoMot(dataMais(HOJE, -300));
  assert.equal(precisaAvisoPopupVencimentoMot(v, { afastadoEmAberto: false, afastadoDesde: null, diasAfastado: null, prorrogado: false, rescisaoProgramadaEm: null, efetivado: true }), false, "rede de segurança da lib");
  assert.equal(avisoMotSilenciado("limite_excedido", { afastadoEmAberto: false, afastadoDesde: null, diasAfastado: null, prorrogado: false, rescisaoProgramadaEm: null }), false);
});
await ok("coluna ausente (migração pendente, 42703): tela e popups continuam funcionando como antes; só 42703 cai no fallback", async () => {
  assert.equal(ehErroColunaAusente({ code: "42703", message: "column funcionarios.efetivado_em does not exist" }), true);
  assert.equal(ehErroColunaAusente({ code: "PGRST204", message: "Could not find the 'efetivado_obs' column" }), true);
  assert.equal(ehErroColunaAusente({ code: "57014", message: "statement timeout" }), false);
  assert.equal(ehErroColunaAusente(null), false);
  const chamadas: boolean[] = [];
  const r = await consultarComEfetivacao<{ id: string }>(async (com) => {
    chamadas.push(com);
    return com ? { data: null, error: { code: "42703", message: "column funcionarios.efetivado_em does not exist" } } : { data: [{ id: "a" }], error: null };
  }, "teste");
  assert.deepEqual([chamadas, r.data, r.efetivacaoDisponivel], [[true, false], [{ id: "a" }], false]);
  const outro = await consultarComEfetivacao<{ id: string }>(async (com) => { chamadas.push(com); return { data: null, error: { code: "57014", message: "statement timeout" } }; }, "teste");
  assert.deepEqual([outro.data, chamadas.length], [[], 3], "erro que não é coluna ausente NÃO refaz a consulta");
});
await ok("coluna ausente no banco real: as 4 consultas e o menu do portal usam o fallback (fiação)", () => {
  for (const f of [
    "src/app/painel/vencimento-contrato/page.tsx", "src/app/api/funcionarios/vencimento-contrato/popup/route.ts", "src/app/portal/(app)/vencimento-contrato/page.tsx",
    "src/app/api/portal/funcionarios/vencimento-contrato/popup/route.ts", "src/app/portal/(app)/layout.tsx",
  ]) assert.ok(fs.readFileSync(f, "utf8").includes("consultarComEfetivacao"), f);
  const painel = fs.readFileSync("src/app/painel/vencimento-contrato/page.tsx", "utf8");
  assert.equal(painel.includes('.is("efetivado_em"'), false, "tela do painel NÃO filtra efetivados (o filtro é da tela)");
  const tela = fs.readFileSync("src/components/VencimentoContratoPageClient.tsx", "utf8");
  for (const t of ['useState(false)', "Ocultar efetivados", "Efetivar", "Desfazer", "Efetivado em", "Isso remove o funcionário dos alertas de vencimento. Pode ser desfeito."]) assert.ok(tela.includes(t), t);
  assert.equal(fs.readFileSync("src/components/ContratoMotPainel.tsx", "utf8").includes("fetiv"), false, "ficha/ContratoMotPainel intocados");
});

console.log(`\n${n} verificações OK`);
