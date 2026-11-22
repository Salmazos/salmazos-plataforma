// Férias (aviso de vencimento): rotas /api/ferias/* contra o banco em memória do harness — quem entra, períodos idempotentes, saldo inicial, programar,
// em gozo / gozada / reabrir, ajuste de data-base, acesso por unidade e por exceção, exportação CSV com auditoria, "migration pendente" e o bloqueio do
// Desfazer da efetivação. As regras de data em si estão em scripts/verificar-ferias-regras.mts.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-ferias-rotas.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, HOJE, dataMais, novoDb, logar, importar, chamar, funcionarioMot, idMot, auditoria } from "./harness-mot/ambiente.mjs";

congelarData(AGORA_ISO); // 07/10/2026
const R = {
  lista: await importar("src/app/api/ferias/route.ts"),
  exportar: await importar("src/app/api/ferias/exportar/route.ts"),
  programar: await importar("src/app/api/ferias/[funcionarioId]/programar/route.ts"),
  situacao: await importar("src/app/api/ferias/[funcionarioId]/situacao/route.ts"),
  dataBase: await importar("src/app/api/ferias/[funcionarioId]/data-base/route.ts"),
  saldo: await importar("src/app/api/ferias/[funcionarioId]/saldo-inicial/route.ts"),
  efetivacao: await importar("src/app/api/funcionarios/[id]/efetivacao/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const MOT = "mao_obra_temporaria", TERC = "terceirizacao";
const id = (k: number) => idMot(800 + k);
type Extra = Record<string, unknown>;
// [k, tipo, admissão (null = sem data), extra]
function cenario(linhas: [number, string, string | null, Extra?][]) {
  const db = novoDb();
  logar(db, "dir");
  db.tabelas.funcionarios = linhas.map(([k, tipo, adm, extra]) => funcionarioMot(id(k), adm as string, { tipo_servico: tipo, nome_completo: `Func ${k}`, ...(extra ?? {}) }));
  db.tabelas.rescisoes = [];
  db.tabelas.audit_logs = [];
  db.tabelas.ferias_periodos = [];
  db.tabelas.ferias_config = [];
  db.tabelas.unidades = [{ id: "U1", nome: "Unidade Um" }, { id: "U2", nome: "Unidade Dois" }];
  return db;
}
const LISTAR = (db: any, quem = "dir", qs = "") => { logar(db, quem); return chamar(R.lista.GET, { url: `http://t/api/ferias${qs}` }); };
const SALDO = (db: any, fid: string, corpo: unknown, quem = "dir") => { logar(db, quem); return chamar(R.saldo.POST, { metodo: "POST", params: { funcionarioId: fid }, corpo }); };
const PROGRAMAR = (db: any, fid: string, corpo: unknown, quem = "dir") => { logar(db, quem); return chamar(R.programar.POST, { metodo: "POST", params: { funcionarioId: fid }, corpo }); };
const SITUACAO = (db: any, fid: string, corpo: unknown, quem = "dir") => { logar(db, quem); return chamar(R.situacao.POST, { metodo: "POST", params: { funcionarioId: fid }, corpo }); };
const DATA_BASE = (db: any, fid: string, corpo: unknown, quem = "dir") => { logar(db, quem); return chamar(R.dataBase.POST, { metodo: "POST", params: { funcionarioId: fid }, corpo }); };
const EXPORTAR = (db: any, corpo: unknown = {}, quem = "dir") => { logar(db, quem); return chamarTexto(R.exportar.POST, corpo); };
const DESFAZER = (db: any, fid: string, quem = "dir") => { logar(db, quem); return chamar(R.efetivacao.DELETE, { metodo: "DELETE", params: { id: fid } }); };
const linha = (r: any, fid: string) => r.corpo.data.find((l: any) => l.funcionario_id === fid);
const periodosDe = (db: any, fid: string) => db.tabelas.ferias_periodos.filter((p: any) => p.funcionario_id === fid).sort((a: any, b: any) => a.numero - b.numero);
const acoes = (db: any) => auditoria(db).map((a: any) => a.acao);

// A rota de exportação devolve texto (CSV), não JSON: chamada própria para ler o corpo cru e os cabeçalhos.
async function chamarTexto(handler: any, corpo: unknown) {
  const req = new Request("http://t/api/ferias/exportar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  Object.defineProperty(req, "nextUrl", { value: new URL(req.url) });
  const res = await handler(req, { params: Promise.resolve({}) });
  // res.text() descartaria o BOM; decodifica os bytes mantendo-o para provar que o arquivo sai com BOM UTF-8 (Excel brasileiro).
  const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()));
  await new Promise((r) => setTimeout(r, 0));
  await Promise.all(globalThis.__PENDENTES__ ?? []);
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* CSV */ }
  return { status: res.status, texto, json, cabecalhos: res.headers };
}

// Admissões usadas (hoje = 07/10/2026):
//  16/08/2024: períodos 1 (limite 15/08/2026, já vencido), 2 (limite 15/08/2027) e 3 (iniciado em 16/08/2026)
//  20/10/2024: período 1 com limite 19/10/2026 (12 dias: vermelho)
//  01/12/2024: período 1 com limite 30/11/2026 (54 dias: amarelo)
const ADM_VENCIDO = "2024-08-16", ADM_VERMELHO = "2024-10-20", ADM_AMARELO = "2024-12-01";

await ok("quem entra: terceirização ativa e MOT efetivado; MOT sem efetivação, desligado e R&S ficam fora", async () => {
  const db = cenario([
    [1, TERC, ADM_VENCIDO], [2, MOT, ADM_AMARELO, { efetivado_em: dataMais(HOJE, -20), efetivado_por: "u-dir" }], [3, MOT, ADM_AMARELO],
    [4, TERC, ADM_AMARELO, { status: "desligado" }], [5, "recrutamento_selecao", ADM_AMARELO], [6, MOT, ADM_AMARELO, { status: "desligado", efetivado_em: dataMais(HOJE, -20), efetivado_por: "u-dir" }],
  ]);
  const r = await LISTAR(db);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.data.map((l: any) => l.funcionario_id).sort(), [id(1), id(2)].sort());
  assert.equal(linha(r, id(2)).efetivado_em, dataMais(HOJE, -20));
});

await ok("lista cria os períodos que faltam (1 até o atual) e é idempotente: listar de novo não duplica", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await LISTAR(db);
  assert.deepEqual(periodosDe(db, id(1)).map((p: any) => [p.numero, p.aquisitivo_inicio, p.aquisitivo_fim, p.data_limite, p.situacao, p.origem]), [
    [1, "2024-08-16", "2025-08-15", "2026-08-15", "a_programar", "gerado"],
    [2, "2025-08-16", "2026-08-15", "2027-08-15", "a_programar", "gerado"],
    [3, "2026-08-16", "2027-08-15", "2028-08-15", "a_programar", "gerado"],
  ]);
  assert.equal(periodosDe(db, id(1))[0].unidade_id, "U1", "copia a unidade do funcionário");
  await LISTAR(db);
  await LISTAR(db);
  assert.equal(periodosDe(db, id(1)).length, 3);
});

await ok("estados cinza: sem data-base, ainda não iniciou (admissão futura), saldo inicial pendente — sem período vencido e sem semáforo", async () => {
  const db = cenario([[1, TERC, null], [2, TERC, dataMais(HOJE, 2)], [3, TERC, ADM_VENCIDO]]);
  const r = await LISTAR(db);
  assert.deepEqual([linha(r, id(1)).estado, linha(r, id(1)).semaforo, linha(r, id(1)).periodo], ["sem_data_base", "cinza", null]);
  assert.deepEqual([linha(r, id(2)).estado, linha(r, id(2)).semaforo, linha(r, id(2)).periodo], ["ainda_nao_iniciou", "cinza", null]);
  assert.equal(periodosDe(db, id(1)).length + periodosDe(db, id(2)).length, 0, "nenhum período gerado");
  // Período 1 já venceu (limite 15/08/2026), mas sem saldo confirmado nada é vencido: cinza e sem dias.
  const l3 = linha(r, id(3));
  assert.deepEqual([l3.estado, l3.estado_rotulo, l3.semaforo, l3.dias_restantes, l3.saldo_confirmado], ["saldo_pendente", "Saldo inicial pendente", "cinza", null, false]);
  assert.equal(r.corpo.resumo.cinza, 3);
  assert.equal(r.corpo.resumo.vermelho, 0);
});

await ok("saldo pendente só com período terminado: 11 meses de casa = 'nenhum' calculado na hora (verde, nada gravado, aceita ações); 13 meses sem saldo = cinza pendente", async () => {
  // hoje = 07/10/2026. 07/11/2025 (11 meses): período 1 termina em 06/11/2026. 07/09/2025 (13 meses): terminou em 06/09/2026.
  // 08/10/2025: o período 1 termina HOJE (não terminou). 07/10/2025: terminou ontem.
  const db = cenario([[1, TERC, "2025-11-07"], [2, TERC, "2025-09-07"], [3, TERC, "2025-10-08"], [4, TERC, "2025-10-07"]]);
  const r = await LISTAR(db);
  const l1 = linha(r, id(1));
  assert.deepEqual([l1.estado, l1.semaforo, l1.saldo_calculado, l1.saldo_confirmado, l1.periodo.numero, l1.periodo.data_limite, l1.dias_restantes],
    ["ok", "verde", true, false, 1, "2027-11-06", 395]);
  const l2 = linha(r, id(2));
  assert.deepEqual([l2.estado, l2.estado_rotulo, l2.semaforo, l2.saldo_calculado, l2.dias_restantes], ["saldo_pendente", "Saldo inicial pendente", "cinza", false, null]);
  assert.deepEqual([linha(r, id(3)).estado, linha(r, id(3)).saldo_calculado], ["ok", true], "o período termina hoje: ainda não terminou");
  assert.equal(linha(r, id(4)).estado, "saldo_pendente", "o período terminou ontem");
  assert.equal(db.tabelas.ferias_config.length, 0, "nada de saldo gravado: o 'nenhum' é calculado na hora");
  assert.deepEqual(r.corpo.resumo, { total: 4, vermelho: 0, amarelo: 0, verde: 2, cinza: 2 });

  // Sem pendência: aceita programar sem o RH ter confirmado saldo (e sem gravar saldo). Com pendência: 409.
  const p1 = periodosDe(db, id(1))[0];
  const ok1 = await PROGRAMAR(db, id(1), { periodo_id: p1.id, gozo_inicio: "2026-12-01", gozo_fim: "2026-12-20" });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.corpo));
  assert.equal(db.tabelas.ferias_config.length, 0, "programar não grava saldo");
  const p2 = periodosDe(db, id(2))[0];
  assert.equal((await PROGRAMAR(db, id(2), { periodo_id: p2.id, gozo_inicio: "2026-12-01", gozo_fim: "2026-12-20" })).status, 409);
  // Confirmar "nenhum" depois continua possível e passa a valer de verdade.
  assert.equal((await SALDO(db, id(2), { quitado_ate: null })).status, 200);
  assert.deepEqual([linha(await LISTAR(db), id(2)).estado, linha(await LISTAR(db), id(2)).saldo_calculado], ["ok", false]);
});

await ok("saldo inicial 'nenhum': o período 1 vira o atual, vencido, vermelho (data-limite 15/08/2026)", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  const s = await SALDO(db, id(1), { quitado_ate: null });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  const cfg = db.tabelas.ferias_config.find((c: any) => c.funcionario_id === id(1));
  assert.ok(cfg.saldo_inicial_confirmado_em && cfg.saldo_inicial_quitado_ate === null && cfg.saldo_inicial_confirmado_por === "u-dir");
  const l = linha(await LISTAR(db), id(1));
  assert.deepEqual([l.estado, l.semaforo, l.periodo.numero, l.dias_restantes, l.saldo_confirmado], ["ok", "vermelho", 1, -53, true]);
  assert.deepEqual(auditoria(db).map((a: any) => [a.acao, a.entidade, a.entidade_id]), [["ferias_saldo_inicial", "ferias_config", id(1)]]);
});

await ok("saldo inicial com data exata: períodos até ela viram 'gozada' (origem saldo_inicial) e o próximo vira o atual (312 dias, verde)", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  const s = await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  assert.deepEqual(periodosDe(db, id(1)).map((p: any) => [p.numero, p.situacao, p.origem]), [[1, "gozada", "saldo_inicial"], [2, "a_programar", "gerado"], [3, "a_programar", "gerado"]]);
  const l = linha(await LISTAR(db), id(1));
  assert.deepEqual([l.periodo.numero, l.dias_restantes, l.semaforo], [2, 312, "verde"]);
});

await ok("saldo inicial com data que não bate: 409 com o período mais próximo; só aplica quando o RH confirma exatamente esse período", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  const r1 = await SALDO(db, id(1), { quitado_ate: "2025-09-10" });
  assert.equal(r1.status, 409);
  assert.equal(r1.corpo.code, "confirmar_periodo");
  assert.deepEqual(r1.corpo.sugestao, { numero: 1, aquisitivo_fim: "2025-08-15" });
  assert.equal(db.tabelas.ferias_config.length, 0, "nada gravado sem confirmação");
  assert.equal(periodosDe(db, id(1)).every((p: any) => p.situacao === "a_programar"), true);
  const r2 = await SALDO(db, id(1), { quitado_ate: "2025-09-10", fim_confirmado: "2026-08-15" });
  assert.equal(r2.status, 409, "confirmar outro período que não o sugerido não vale");
  const r3 = await SALDO(db, id(1), { quitado_ate: "2025-09-10", fim_confirmado: "2025-08-15" });
  assert.equal(r3.status, 200, JSON.stringify(r3.corpo));
  assert.equal(periodosDe(db, id(1))[0].situacao, "gozada");
  assert.equal(db.tabelas.ferias_config[0].saldo_inicial_quitado_ate, "2025-08-15");
  assert.equal(auditoria(db).at(-1)!.detalhes.quitado_ate_informado, "2025-09-10");
});

await ok("saldo inicial inválido: futuro, antes da data-base, sem período concluído, e funcionário sem data-base ou admissão futura", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO], [2, TERC, dataMais(HOJE, -100)], [3, TERC, null], [4, TERC, dataMais(HOJE, 2)]]);
  assert.equal((await SALDO(db, id(1), { quitado_ate: dataMais(HOJE, 1) })).status, 400);
  assert.equal((await SALDO(db, id(1), { quitado_ate: "2024-01-01" })).status, 400);
  assert.equal((await SALDO(db, id(2), { quitado_ate: dataMais(HOJE, -10) })).status, 400, "nenhum período concluído");
  assert.equal((await SALDO(db, id(3), { quitado_ate: null })).status, 409, "sem data-base");
  assert.equal((await SALDO(db, id(4), { quitado_ate: null })).status, 409, "ainda não iniciou");
  assert.equal((await SALDO(db, id(1), { quitado_ate: "2025-13-40" })).status, 400, "data impossível");
  assert.equal(db.tabelas.ferias_config.length, 0);
});

await ok("refazer o saldo inicial enquanto o RH não lançou férias: desfaz o anterior e aplica o novo", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: "2026-08-15" });
  assert.deepEqual(periodosDe(db, id(1)).map((p: any) => p.situacao), ["gozada", "gozada", "a_programar"]);
  const r = await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(periodosDe(db, id(1)).map((p: any) => [p.situacao, p.origem]), [["gozada", "saldo_inicial"], ["a_programar", "gerado"], ["a_programar", "gerado"]]);
  const r2 = await SALDO(db, id(1), { quitado_ate: null });
  assert.equal(r2.status, 200);
  assert.equal(periodosDe(db, id(1)).every((p: any) => p.situacao === "a_programar" && p.origem === "gerado"), true);
  assert.equal(auditoria(db).filter((a: any) => a.acao === "ferias_saldo_inicial").at(-1)!.detalhes.refeito, true);
});

await ok("sem saldo confirmado nenhuma ação de situação é aceita (programar, em gozo, gozada)", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await LISTAR(db);
  const p1 = periodosDe(db, id(1))[0];
  const a = await PROGRAMAR(db, id(1), { periodo_id: p1.id, gozo_inicio: dataMais(HOJE, 10), gozo_fim: dataMais(HOJE, 30) });
  assert.equal(a.status, 409);
  assert.match(a.corpo.error, /saldo inicial/i);
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "gozada", gozo_inicio: "2025-09-01", gozo_fim: "2025-09-20" })).status, 409);
  assert.equal(periodosDe(db, id(1))[0].situacao, "a_programar");
});

await ok("programar: grava datas, zera os avisos, audita; reprogramar troca as datas; janelas de data validadas", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" }); // período atual = 2 (aquisitivo até 15/08/2026, limite 15/08/2027)
  const p2 = periodosDe(db, id(1))[1];
  Object.assign(p2, { aviso_90_em: "2026-09-01T12:00:00Z", aviso_60_em: "2026-09-20T12:00:00Z" }); // avisos já enviados antes (simulado)
  const base = { periodo_id: p2.id };
  assert.equal((await PROGRAMAR(db, id(1), { ...base, gozo_inicio: dataMais(HOJE, -1), gozo_fim: dataMais(HOJE, 10) })).status, 400, "início no passado");
  assert.equal((await PROGRAMAR(db, id(1), { ...base, gozo_inicio: dataMais(HOJE, 10), gozo_fim: dataMais(HOJE, 5) })).status, 400, "fim antes do início");
  assert.equal((await PROGRAMAR(db, id(1), { ...base, gozo_inicio: "2027-08-16", gozo_fim: "2027-08-30" })).status, 400, "depois da data-limite");
  assert.equal((await PROGRAMAR(db, id(1), { periodo_id: periodosDe(db, id(1))[2].id, gozo_inicio: dataMais(HOJE, 10), gozo_fim: dataMais(HOJE, 30) })).status, 409, "só o período atual");
  assert.equal((await PROGRAMAR(db, id(1), { periodo_id: "nao-e-uuid", gozo_inicio: dataMais(HOJE, 10), gozo_fim: dataMais(HOJE, 30) })).status, 400);
  assert.equal(periodosDe(db, id(1))[1].situacao, "a_programar", "nada mudou nas tentativas inválidas");

  const ok1 = await PROGRAMAR(db, id(1), { ...base, gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29", observacao: "  combinado com a RCA  " });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.corpo));
  const depois = periodosDe(db, id(1))[1];
  assert.deepEqual([depois.situacao, depois.gozo_inicio, depois.gozo_fim, depois.observacao, depois.aviso_90_em ?? null, depois.aviso_60_em ?? null, depois.aviso_30_em ?? null, depois.atualizado_por],
    ["programada", "2026-11-10", "2026-11-29", "combinado com a RCA", null, null, null, "u-dir"]);
  const l = linha(await LISTAR(db), id(1));
  assert.deepEqual([l.periodo.situacao, l.periodo.gozo_inicio, l.programacao_vencida, l.semaforo], ["programada", "2026-11-10", false, "verde"], "semáforo segue a data-limite");

  const re = await PROGRAMAR(db, id(1), { ...base, gozo_inicio: "2026-12-01", gozo_fim: "2026-12-20" });
  assert.equal(re.status, 200);
  const a = auditoria(db).filter((x: any) => x.acao === "ferias_programada");
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].detalhes.reprogramacao, a[1].detalhes.reprogramacao, a[1].detalhes.anterior], [false, true, { gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" }]);
});

await ok("programação cujo início já passou sem virar em gozo: a lista sinaliza (os avisos voltam na 2D)", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  const p2 = periodosDe(db, id(1))[1];
  Object.assign(p2, { situacao: "programada", gozo_inicio: dataMais(HOJE, -3), gozo_fim: dataMais(HOJE, 10) });
  assert.equal(linha(await LISTAR(db), id(1)).programacao_vencida, true);
});

await ok("em gozo → gozada: o funcionário passa ao próximo período; datas futuras são recusadas; ordem fixa", async () => {
  const db = cenario([[1, TERC, "2024-02-29"]]); // 29/02: períodos 1 (até 27/02/2025), 2 (até 27/02/2026), 3 (iniciado 28/02/2026)
  await SALDO(db, id(1), { quitado_ate: null });
  const [p1, p2] = periodosDe(db, id(1));
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "gozada", gozo_inicio: "2026-03-01", gozo_fim: "2026-03-20" })).status, 409, "o período 2 não é o atual");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "em_gozo" })).status, 400, "sem datas de gozo");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "em_gozo", gozo_inicio: dataMais(HOJE, 5), gozo_fim: dataMais(HOJE, 20) })).status, 400, "início futuro: usar Programar");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "em_gozo", gozo_inicio: "2025-02-20", gozo_fim: "2025-03-10" })).status, 400, "início antes do fim do aquisitivo");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "em_gozo", gozo_inicio: dataMais(HOJE, -2), gozo_fim: dataMais(HOJE, 10) })).status, 200);
  assert.equal(periodosDe(db, id(1))[0].situacao, "em_gozo");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "gozada" })).status, 400, "fim ainda no futuro");
  const g = await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "gozada", gozo_inicio: "2025-03-03", gozo_fim: "2025-03-22", observacao: "ok" });
  assert.equal(g.status, 200, JSON.stringify(g.corpo));
  assert.deepEqual(periodosDe(db, id(1))[0].gozo_fim, "2025-03-22");
  const l = linha(await LISTAR(db), id(1));
  assert.deepEqual([l.periodo.numero, l.periodo.situacao], [2, "a_programar"], "gozada fecha o período 1 e o funcionário passa ao 2");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "em_gozo", gozo_inicio: "2025-03-03", gozo_fim: "2025-03-22" })).status, 409, "período gozado não volta a em gozo");
  assert.deepEqual(acoes(db).filter((a: string) => a.startsWith("ferias_")), ["ferias_saldo_inicial", "ferias_em_gozo", "ferias_gozada"]);
});

await ok("reabrir: exige motivo, só o último período lançado, volta a 'a programar' sem datas; saldo inicial não se reabre aqui", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO], [2, TERC, ADM_VENCIDO]]);
  // Funcionário 2: período 1 quitado pelo saldo inicial.
  await SALDO(db, id(2), { quitado_ate: "2025-08-15" });
  const [q1] = periodosDe(db, id(2));
  assert.equal((await SITUACAO(db, id(2), { periodo_id: q1.id, acao: "reabrir", motivo: "Lançado errado" })).status, 409, "saldo inicial não se reabre aqui");
  // Funcionário 1: períodos 1 e 2 lançados pelo RH (aquisitivos já encerrados: 15/08/2025 e 15/08/2026).
  await SALDO(db, id(1), { quitado_ate: null });
  const [p1, p2] = periodosDe(db, id(1));
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "gozada", gozo_inicio: "2025-09-01", gozo_fim: "2025-09-20" })).status, 200);
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "gozada", gozo_inicio: "2026-09-01", gozo_fim: "2026-09-20" })).status, 200);
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "reabrir" })).status, 400, "sem motivo");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "reabrir", motivo: "x" })).status, 400, "motivo curto demais");
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p1.id, acao: "reabrir", motivo: "Lançado errado" })).status, 409, "o 2 foi lançado depois: só o último reabre");
  const r = await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "reabrir", motivo: "Data errada, contabilidade corrigiu" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const depois = periodosDe(db, id(1))[1];
  assert.deepEqual([depois.situacao, depois.gozo_inicio, depois.gozo_fim], ["a_programar", null, null]);
  const ab = auditoria(db).find((a: any) => a.acao === "ferias_reaberta")!;
  assert.deepEqual([ab.detalhes.situacao_anterior, ab.detalhes.motivo, ab.detalhes.gozo_inicio], ["gozada", "Data errada, contabilidade corrigiu", "2026-09-01"]);
  assert.equal((await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "reabrir", motivo: "de novo" })).status, 409, "já está a programar");
  assert.equal(periodosDe(db, id(1))[0].situacao, "gozada", "o período 1 continua gozado");
});

await ok("corrida: se outra pessoa mudou o período entre a leitura e a gravação, a rota responde 409 e não sobrescreve", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  const p2 = periodosDe(db, id(1))[1];
  db.ganchos = { "ferias_periodos.update": async () => { p2.situacao = "em_gozo"; p2.gozo_inicio = dataMais(HOJE, -1); p2.gozo_fim = dataMais(HOJE, 9); } };
  const r = await PROGRAMAR(db, id(1), { periodo_id: p2.id, gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" });
  assert.equal(r.status, 409);
  assert.equal(p2.situacao, "em_gozo", "não sobrescreveu");
  assert.equal(acoes(db).includes("ferias_programada"), false);
});

await ok("data-base: ajuste exige motivo, confirmação do reinício e recalcula períodos; zera o saldo inicial; registra quem e por quê", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  assert.equal((await DATA_BASE(db, id(1), { data_base: "2025-01-10" })).status, 400, "sem motivo");
  assert.equal((await DATA_BASE(db, id(1), { data_base: "2025-01-10", motivo: "ab" })).status, 400, "motivo curto");
  assert.equal((await DATA_BASE(db, id(1), { data_base: "1980-01-01", motivo: "erro de digitação" })).status, 400, "antes de 1990");
  assert.equal((await DATA_BASE(db, id(1), { data_base: "2028-01-01", motivo: "erro de digitação" })).status, 400, "mais de 1 ano à frente");
  assert.equal((await DATA_BASE(db, id(1), { data_base: ADM_VENCIDO, motivo: "mesma data" })).status, 400, "a data já é essa");
  const sem = await DATA_BASE(db, id(1), { data_base: "2025-01-10", motivo: "Intervalo entre contratos (readmissão)" });
  assert.equal(sem.status, 409);
  assert.equal(sem.corpo.code, "confirmar_reinicio");
  assert.equal(periodosDe(db, id(1)).length, 3, "nada mudou sem confirmação");
  const r = await DATA_BASE(db, id(1), { data_base: "2025-01-10", motivo: "Intervalo entre contratos (readmissão)", confirmar_reinicio: true });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.data, { funcionario_id: id(1), data_base: "2025-01-10", data_base_ajustada: true, saldo_inicial_pendente: true, estado: "saldo_pendente" });
  const cfg = db.tabelas.ferias_config.find((c: any) => c.funcionario_id === id(1));
  assert.deepEqual([cfg.data_base_ajustada, cfg.motivo, cfg.ajustado_por, !!cfg.ajustado_em, cfg.saldo_inicial_confirmado_em, cfg.saldo_inicial_quitado_ate],
    ["2025-01-10", "Intervalo entre contratos (readmissão)", "u-dir", true, null, null]);
  assert.deepEqual(periodosDe(db, id(1)).map((p: any) => [p.numero, p.aquisitivo_inicio, p.situacao, p.origem]), [[1, "2025-01-10", "a_programar", "gerado"], [2, "2026-01-10", "a_programar", "gerado"]]);
  const l = linha(await LISTAR(db), id(1));
  assert.deepEqual([l.data_base, l.data_base_ajustada, l.data_admissao, l.estado], ["2025-01-10", true, ADM_VENCIDO, "saldo_pendente"], "a efetivação/admissão originais seguem no cadastro");
  const au = auditoria(db).find((a: any) => a.acao === "ferias_data_base_ajustada")!;
  assert.deepEqual([au.detalhes.data_base_antes, au.detalhes.data_base_depois, au.detalhes.saldo_inicial_zerado, au.detalhes.periodos_apagados, au.detalhes.periodos_quitados_apagados],
    [ADM_VENCIDO, "2025-01-10", true, 3, 1]);
  // Voltar à data de admissão: data_base nula (ou igual à admissão) remove o ajuste.
  const volta = await DATA_BASE(db, id(1), { data_base: null, motivo: "Voltou a valer a admissão", confirmar_reinicio: true });
  assert.equal(volta.status, 200, JSON.stringify(volta.corpo));
  assert.equal(db.tabelas.ferias_config.find((c: any) => c.funcionario_id === id(1)).data_base_ajustada, null);
  assert.equal(periodosDe(db, id(1))[0].aquisitivo_inicio, ADM_VENCIDO);
});

await ok("data-base de quem não tem data de admissão: o RH informa e os períodos nascem; sem data nenhuma não dá para limpar", async () => {
  const db = cenario([[1, TERC, null]]);
  assert.equal((await DATA_BASE(db, id(1), { data_base: null, motivo: "sem data" })).status, 400, "sem admissão e sem data-base");
  const r = await DATA_BASE(db, id(1), { data_base: "2025-06-02", motivo: "Data conferida com a contabilidade" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(periodosDe(db, id(1)).length, 2);
  assert.equal(linha(await LISTAR(db), id(1)).estado, "saldo_pendente");
});

await ok("admissão editada depois de gerar os períodos: 'Data-base mudou' (cinza, sem ação) até o RH reconfirmar a data-base", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: null });
  db.tabelas.funcionarios[0].data_admissao = "2024-08-20"; // alguém corrigiu a admissão no cadastro
  const l = linha(await LISTAR(db), id(1));
  assert.deepEqual([l.estado, l.semaforo, l.data_base], ["base_alterada", "cinza", "2024-08-20"]);
  assert.equal(periodosDe(db, id(1))[0].aquisitivo_inicio, ADM_VENCIDO, "a lista não reescreve período existente sozinha");
  const a = await PROGRAMAR(db, id(1), { periodo_id: periodosDe(db, id(1))[0].id, gozo_inicio: dataMais(HOJE, 5), gozo_fim: dataMais(HOJE, 25) });
  assert.equal(a.status, 409);
  const r = await DATA_BASE(db, id(1), { data_base: null, motivo: "Admissão corrigida no cadastro", confirmar_reinicio: true });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(periodosDe(db, id(1))[0].aquisitivo_inicio, "2024-08-20");
  assert.equal(linha(await LISTAR(db), id(1)).estado, "saldo_pendente");
});

await ok("ajuste de data-base e refazer saldo são travados quando o RH já lançou férias", async () => {
  const db = cenario([[1, TERC, ADM_VENCIDO]]);
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  const p2 = periodosDe(db, id(1))[1];
  await PROGRAMAR(db, id(1), { periodo_id: p2.id, gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" });
  const a = await DATA_BASE(db, id(1), { data_base: "2025-01-10", motivo: "Tentativa", confirmar_reinicio: true });
  assert.equal(a.status, 409);
  assert.match(a.corpo.error, /Reabra/);
  const b = await SALDO(db, id(1), { quitado_ate: null });
  assert.equal(b.status, 409);
  assert.equal(periodosDe(db, id(1))[1].situacao, "programada", "nada foi mexido");
});

await ok("acesso: sem login 401; analista sem acesso ao RH 403; supervisor só da própria unidade (lista e ações); exceção individual vale nos dois sentidos", async () => {
  const db = cenario([[1, TERC, ADM_AMARELO], [2, TERC, ADM_AMARELO, { unidade_id: "U2", cliente_id: "C3", empresa: "Cliente Tres" }]]);
  logar(db, null);
  assert.equal((await chamar(R.lista.GET)).status, 401);
  assert.equal((await LISTAR(db, "ana")).status, 403);
  assert.deepEqual((await LISTAR(db, "dir")).corpo.data.map((l: any) => l.funcionario_id).sort(), [id(1), id(2)].sort());
  assert.deepEqual((await LISTAR(db, "sup1")).corpo.data.map((l: any) => l.funcionario_id), [id(1)]);
  assert.deepEqual((await LISTAR(db, "sup2")).corpo.data.map((l: any) => l.funcionario_id), [id(2)]);
  assert.equal((await SALDO(db, id(2), { quitado_ate: null }, "sup1")).status, 404, "outra unidade: 404, não confirma que existe");
  assert.equal((await DATA_BASE(db, id(2), { data_base: "2025-01-10", motivo: "teste", confirmar_reinicio: true }, "sup1")).status, 404);
  assert.equal((await PROGRAMAR(db, id(1), { periodo_id: "x" }, "ana")).status, 403);
  assert.equal(db.tabelas.ferias_config.length, 0);
  // Exceção individual em usuario_acesso_customizado (chave rh_funcionarios): libera a analista e bloqueia o supervisor.
  db.tabelas.usuario_acesso_customizado.push({ analista_perfil_id: "p-u-ana", chave_aba: "rh_funcionarios", liberado: true });
  db.tabelas.usuario_acesso_customizado.push({ analista_perfil_id: "p-u-sup1", chave_aba: "rh_funcionarios", liberado: false });
  assert.equal((await LISTAR(db, "ana")).status, 200, "liberada por exceção");
  assert.equal((await LISTAR(db, "sup1")).status, 403, "bloqueado por exceção");
});

await ok("funcionário fora do controle (MOT sem efetivação) não aceita nenhuma ação", async () => {
  const db = cenario([[1, MOT, ADM_AMARELO]]);
  for (const r of [
    await SALDO(db, id(1), { quitado_ate: null }),
    await PROGRAMAR(db, id(1), { periodo_id: id(1), gozo_inicio: dataMais(HOJE, 5), gozo_fim: dataMais(HOJE, 25) }),
    await DATA_BASE(db, id(1), { data_base: "2025-01-10", motivo: "teste", confirmar_reinicio: true }),
  ]) assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(db.tabelas.ferias_periodos.length + db.tabelas.ferias_config.length, 0);
  assert.equal((await SALDO(db, "bbbbbbbb-0000-4000-8000-0000000000ff", { quitado_ate: null })).status, 404, "id que não existe");
});

await ok("filtros e ordem da lista: vermelho (vencido primeiro) → amarelo → verde → cinza; cliente, situação, semáforo, busca e a_vencer", async () => {
  const db = cenario([
    [1, TERC, ADM_VENCIDO, { nome_completo: "Ana Vencida" }], [2, TERC, ADM_VERMELHO, { nome_completo: "Bruno Vermelho" }], [3, TERC, ADM_AMARELO, { nome_completo: "Carla Amarela", cliente_id: "C2", empresa: "Cliente Dois" }],
    [4, TERC, "2025-12-01", { nome_completo: "Davi Verde" }], [5, TERC, ADM_AMARELO, { nome_completo: "Érica Pendente" }],
  ]);
  // O filtro de cliente exige uuid (como no banco real): o cliente "Cliente Uuid" é criado aqui e vinculado à Carla.
  const CLIENTE_UUID = idMot(950);
  db.tabelas.clientes.push({ id: CLIENTE_UUID, nome: "Cliente Uuid", unidade_id: "U1", ativo: true });
  db.tabelas.funcionarios[2].cliente_id = CLIENTE_UUID;
  for (const k of [1, 2, 3, 4]) await SALDO(db, id(k), { quitado_ate: null });
  const r = await LISTAR(db);
  assert.deepEqual(r.corpo.data.map((l: any) => [l.nome_completo, l.semaforo, l.dias_restantes]), [
    ["Ana Vencida", "vermelho", -53], ["Bruno Vermelho", "vermelho", 12], ["Carla Amarela", "amarelo", 54], ["Davi Verde", "verde", 419], ["Érica Pendente", "cinza", null],
  ]);
  assert.deepEqual(r.corpo.resumo, { total: 5, vermelho: 2, amarelo: 1, verde: 1, cinza: 1 });
  assert.deepEqual(r.corpo.clientes.map((c: any) => c.nome), ["Cliente Um", "Cliente Uuid"]);
  assert.deepEqual(r.corpo.unidades, [{ id: "U1", nome: "Unidade Um" }]);
  const nomes = async (qs: string) => (await LISTAR(db, "dir", qs)).corpo.data.map((l: any) => l.nome_completo);
  assert.deepEqual(await nomes(`?cliente_id=${CLIENTE_UUID}`), ["Carla Amarela"]);
  assert.equal((await LISTAR(db, "dir", "?cliente_id=C2")).status, 400, "cliente_id precisa ser uuid");
  assert.deepEqual(await nomes("?semaforo=vermelho"), ["Ana Vencida", "Bruno Vermelho"]);
  assert.deepEqual(await nomes("?a_vencer=1"), ["Ana Vencida", "Bruno Vermelho", "Carla Amarela"]);
  assert.deepEqual(await nomes("?busca=erica"), ["Érica Pendente"], "busca sem acento");
  assert.deepEqual(await nomes("?situacao=a_programar&semaforo=verde"), ["Davi Verde"]);
  assert.equal((await LISTAR(db, "dir", "?situacao=inventada")).status, 400);
});

await ok("exportação CSV: mesma lista da tela, colunas pedidas, BOM, auditoria (quem, quantidade, filtros), recorte de unidade e neutralização de fórmula", async () => {
  const db = cenario([
    [1, TERC, ADM_VENCIDO, { nome_completo: "Ana Vencida" }], [2, TERC, ADM_AMARELO, { nome_completo: "=Soma(1;1) Perigo" }],
    [3, TERC, "2025-12-01", { nome_completo: "Davi Verde" }], [4, TERC, ADM_AMARELO, { nome_completo: "Zé U2", unidade_id: "U2", cliente_id: "C3", empresa: "Cliente Tres" }],
  ]);
  for (const k of [1, 2, 3, 4]) await SALDO(db, id(k), { quitado_ate: null });
  const p1 = periodosDe(db, id(2))[0];
  Object.assign(p1, { situacao: "programada", gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" });
  db.tabelas.audit_logs = [];
  const r = await EXPORTAR(db, { a_vencer: true });
  assert.equal(r.status, 200, r.texto);
  assert.match(r.cabecalhos.get("content-type"), /text\/csv/);
  assert.equal(r.cabecalhos.get("content-disposition"), 'attachment; filename="ferias-a-vencer-07-10-2026.csv"');
  assert.equal(r.texto.charCodeAt(0), 0xfeff, "BOM UTF-8");
  const linhas = r.texto.slice(1).trim().split("\r\n").map((l: string) => l.split(";"));
  assert.deepEqual(linhas[0], ["Funcionário", "Cliente", "Unidade", "Admissão", "Data-base", "Período atual", "Data-limite", "Dias restantes", "Situação", "Início programado", "Fim programado"]);
  assert.equal(linhas.length, 4, "cabeçalho + 3 a vencer (Ana vencida, o 'perigo' e o da U2)");
  assert.deepEqual(linhas[1], ["Ana Vencida", "Cliente Um", "Unidade Um", "16/08/2024", "16/08/2024", "16/08/2024 a 15/08/2025", "15/08/2026", "Vencido há 53 dia(s)", "A programar", "", ""]);
  // Célula que começa com = vira texto (apóstrofo na frente); o ";" dentro do nome obriga a célula inteira a ir entre aspas.
  const perigo = r.texto.split("\r\n").find((l: string) => l.includes("Perigo"))!;
  assert.ok(perigo.startsWith("\"'=Soma(1;1) Perigo\";"), perigo);
  assert.ok(perigo.includes(";Programada com a contabilidade;10/11/2026;29/11/2026"), perigo);
  const a = auditoria(db).filter((x: any) => x.acao === "exportar");
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].entidade, a[0].usuario_id, a[0].detalhes.linhas, a[0].detalhes.filtros], ["ferias", "u-dir", 3, { a_vencer: true }]);
  assert.equal(JSON.stringify(a[0].detalhes).includes("Ana"), false, "auditoria sem nome de funcionário");
  const sup = await EXPORTAR(db, { a_vencer: true }, "sup1");
  assert.equal(sup.texto.includes("Zé U2"), false, "supervisor só exporta a própria unidade");
  assert.equal(sup.cabecalhos.get("content-disposition"), 'attachment; filename="ferias-a-vencer-07-10-2026.csv"');
  const todos = await EXPORTAR(db, {});
  assert.equal(todos.cabecalhos.get("content-disposition"), 'attachment; filename="ferias-07-10-2026.csv"');
  assert.equal(todos.texto.trim().split("\r\n").length, 5, "sem filtro: cabeçalho + 4");
  assert.equal((await EXPORTAR(db, { a_vencer: "sim" })).status, 400);
  assert.equal((await EXPORTAR(db, {}, "ana")).status, 403);
  logar(db, null);
  assert.equal((await chamarTexto(R.exportar.POST, {})).status, 401);
});

await ok("migration ainda não aplicada: lista e ações respondem 503 com mensagem clara (sem 500) e o Desfazer da efetivação segue como antes", async () => {
  const db = cenario([[1, TERC, ADM_AMARELO], [2, MOT, ADM_AMARELO, { efetivado_em: dataMais(HOJE, -20), efetivado_por: "u-dir" }]]);
  db.falhas["ferias_periodos.select"] = { code: "42P01", message: 'relation "public.ferias_periodos" does not exist' };
  const l = await LISTAR(db);
  assert.equal(l.status, 503);
  assert.match(l.corpo.error, /ainda não está disponível/);
  assert.equal((await SALDO(db, id(1), { quitado_ate: null })).status, 503);
  assert.equal((await DATA_BASE(db, id(1), { data_base: "2025-01-10", motivo: "teste", confirmar_reinicio: true })).status, 503);
  const d = await DESFAZER(db, id(2));
  assert.equal(d.status, 200, JSON.stringify(d.corpo));
  assert.equal(db.tabelas.funcionarios[1].efetivado_em ?? null, null);
  // Erro de verdade (não é "tabela ausente") NÃO vira migração pendente: 500 genérico, sem vazar a mensagem do banco.
  db.falhas["ferias_periodos.select"] = { code: "57014", message: "canceling statement due to statement timeout" };
  const e = await LISTAR(db);
  assert.equal(e.status, 500);
  assert.equal(JSON.stringify(e.corpo).includes("timeout"), false);
  const d2 = await DESFAZER(db, id(1));
  assert.equal(d2.status, 409, "terceirização que nunca foi efetivada segue sem Desfazer (como antes)");
});

await ok("Desfazer a efetivação é BLOQUEADO com férias programada, em gozo ou gozada (inclui saldo inicial); liberado só com 'a programar'; terceirização nunca efetivada não muda", async () => {
  const db = cenario([[1, MOT, ADM_VENCIDO, { efetivado_em: dataMais(HOJE, -20), efetivado_por: "u-dir" }], [2, TERC, ADM_AMARELO]]);
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" }); // período 1 gozada por saldo inicial
  const d1 = await DESFAZER(db, id(1));
  assert.equal(d1.status, 409);
  assert.match(d1.corpo.error, /férias programadas, em gozo ou gozadas/);
  assert.ok(db.tabelas.funcionarios[0].efetivado_em, "continua efetivado");
  await SALDO(db, id(1), { quitado_ate: null }); // refaz: tudo volta a 'a programar'
  await SALDO(db, id(1), { quitado_ate: "2025-08-15" });
  const p2 = periodosDe(db, id(1))[1];
  await PROGRAMAR(db, id(1), { periodo_id: p2.id, gozo_inicio: "2026-11-10", gozo_fim: "2026-11-29" });
  assert.equal((await DESFAZER(db, id(1))).status, 409, "programada");
  await SITUACAO(db, id(1), { periodo_id: p2.id, acao: "reabrir", motivo: "Cancelada pelo cliente" });
  assert.equal((await DESFAZER(db, id(1))).status, 409, "o período 1 ainda está quitado pelo saldo inicial");
  await SALDO(db, id(1), { quitado_ate: null });
  const livre = await DESFAZER(db, id(1));
  assert.equal(livre.status, 200, JSON.stringify(livre.corpo));
  assert.equal(db.tabelas.funcionarios[0].efetivado_em ?? null, null);
  assert.ok(acoes(db).includes("funcionario_efetivacao_desfeita"));
  // Fora do controle (MOT sem efetivação): sai da lista e as ações respondem 409; os períodos antigos ficam guardados.
  assert.deepEqual((await LISTAR(db)).corpo.data.map((l: any) => l.funcionario_id), [id(2)]);
  assert.equal((await DESFAZER(db, id(2))).status, 409, "terceirização nunca efetivada: segue como antes");
});

console.log(`\n${n} verificações das rotas de férias passaram.`);
