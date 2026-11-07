// Verificação dos "Dia(s) de teste": o cliente só informa SE houve e QUANTOS dias (admissao_qtd_dias_teste, smallint: NULL = não
// informado, 0 = não houve, 1 ou 2) — sem datas e sem horários. Cobre as regras puras (src/lib/diasTeste.ts), schemas,
// obrigatoriedade por serviço, criação/avaliação/edição pelo cliente, decisão (cópia para candidatos_vagas), e-mails, a exibição
// para o RH e o texto legado (admissao_dia_teste, só leitura/cópia). Roda as rotas reais contra o banco em memória do harness.
// Também cobre as telas puras: CampoDiasTeste (Não / Sim + quantidade) e BlocoDiasTesteRH (exibição do RH).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-dia-teste.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID } from "./harness-mot/ambiente-indicacao.mjs";
import { CAMPOS_ADMISSAO, ROTULO_CAMPO, campoDaAdmissao, calcularDiff, formatarValorAviso, normalizarValor } from "../src/lib/indicacaoEdicao";
import {
  MAX_DIAS_TESTE, qtdDiasTesteSchema, formatarDiasTeste, exigeRespostaDiasTeste, resolverDiasTeste, textoDiasTesteParaRH, seloDiasTeste,
} from "../src/lib/diasTeste";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BlocoDiasTesteRH from "../src/components/BlocoDiasTesteRH";
import CampoDiasTeste, {
  ESTADO_DIAS_TESTE_VAZIO, estadoDiasTesteDeValor, diasTesteParaEnvio, erroDiasTeste, type EstadoDiasTeste,
} from "../src/components/CampoDiasTeste";
import { portalAvaliarSchema, portalIndicarCandidatoSchema, portalEditarIndicacaoSchema, admissaoCreateSchema } from "../src/lib/schemas";

congelarData();
const criar = await importar("src/app/api/portal/indicar-candidato/route.ts");
const editar = await importar("src/app/api/portal/minhas-indicacoes/[id]/route.ts");
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");
const avaliar = await importar("src/app/api/portal/avaliar/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const MOT = "mao_obra_temporaria", TERC = "terceirizacao", RS = "recrutamento_selecao";
const MSG = "Informe se houve dia(s) de teste.";
const ENC = "11111111-1111-4111-8111-111111111111";

const corpo = (extra = {}) => ({
  vaga_id: ID.V_MOT_A, candidato_nome: "Fulano de Tal", candidato_telefone: "(19) 90000-1111",
  admissao_data_inicio: "2026-11-10", admissao_salario: 1800, admissao_funcao: "Auxiliar", admissao_qtd_dias_teste: 0, ...extra,
});
const sol = (db: any, id: string) => db.tabelas.solicitacoes_indicacao_candidato.find((s: any) => s.id === id);
const ult = (db: any) => db.tabelas.solicitacoes_indicacao_candidato.at(-1);
const emails = (db: any) => (db.emails ?? []).map((e: any) => e.html).join("\n");

// ── regras puras ──
await ok("regras: MAX_DIAS_TESTE é 2; o schema aceita 0, 1 e 2 e recusa 3, negativo, fração, texto e NaN", () => {
  assert.equal(MAX_DIAS_TESTE, 2);
  for (const v of [0, 1, 2]) assert.equal(qtdDiasTesteSchema.safeParse(v).success, true, String(v));
  for (const v of [3, -1, 1.5, "1", "", NaN, null, undefined, [], {}]) assert.equal(qtdDiasTesteSchema.safeParse(v).success, false, String(v));
});
await ok("formato: null/undefined → null; 0 → 'Não houve dia de teste'; 1 → '1 dia de teste'; 2 → '2 dias de teste'", () => {
  assert.equal(formatarDiasTeste(null), null);
  assert.equal(formatarDiasTeste(undefined), null);
  assert.equal(formatarDiasTeste(0), "Não houve dia de teste");
  assert.equal(formatarDiasTeste(1), "1 dia de teste");
  assert.equal(formatarDiasTeste(2), "2 dias de teste");
  for (const lixo of [3, -1, 1.5, "1", [], {}]) assert.equal(formatarDiasTeste(lixo), null, `valor fora do domínio: ${JSON.stringify(lixo)}`);
});
await ok("obrigatoriedade por serviço: MOT e Terceirização exigem; R&S e demais não; resolverDiasTeste", () => {
  assert.equal(exigeRespostaDiasTeste(MOT), true);
  assert.equal(exigeRespostaDiasTeste(TERC), true);
  for (const t of [RS, "avaliacao_psicologica", "", null, undefined]) assert.equal(exigeRespostaDiasTeste(t), false, String(t));
  assert.deepEqual(resolverDiasTeste(MOT, undefined), { ok: false, erro: MSG });
  assert.deepEqual(resolverDiasTeste(TERC, null), { ok: false, erro: MSG });
  for (const q of [0, 1, 2]) assert.deepEqual(resolverDiasTeste(TERC, q), { ok: true, valor: q }, "0 é resposta válida, não ausência");
  assert.deepEqual(resolverDiasTeste(RS, 2), { ok: true, valor: null });
  assert.deepEqual(resolverDiasTeste(RS, undefined), { ok: true, valor: null });
});

// ── schemas ──
await ok("schemas: admissao_qtd_dias_teste opcional/nullable nos dois schemas; recusa 3, texto e fração", () => {
  const baseAv: any = { encaminhamento_id: ENC, status: "aprovado", feedback_cliente: "ok" };
  const baseInd: any = { vaga_id: ID.V_MOT_A, candidato_nome: "A", candidato_telefone: "1" };
  for (const [s, base] of [[portalAvaliarSchema, baseAv], [portalIndicarCandidatoSchema, baseInd]] as const) {
    for (const v of [0, 1, 2, null, undefined]) assert.equal(s.safeParse({ ...base, admissao_qtd_dias_teste: v }).success, true, String(v));
    for (const v of [3, -1, 1.5, "2", [], [{ data: "2026-11-05" }]]) assert.equal(s.safeParse({ ...base, admissao_qtd_dias_teste: v }).success, false, JSON.stringify(v));
    // o texto legado continua aceito (campo antigo, só leitura/cópia)
    for (const v of ["05/11 e 06/11", "", null, undefined]) assert.equal(s.safeParse({ ...base, admissao_dia_teste: v }).success, true);
  }
  assert.equal(portalEditarIndicacaoSchema.safeParse({ admissao_qtd_dias_teste: 2 }).success, true);
  assert.equal(portalEditarIndicacaoSchema.safeParse({ admissao_qtd_dias_teste: 3 }).success, false);
  assert.equal(portalEditarIndicacaoSchema.safeParse({ admissao_dia_teste: "05/11" }).success, true);
});
await ok("campos: admissao_qtd_dias_teste é editável, tem rótulo e conta como dado de admissão (o texto legado também)", () => {
  for (const c of ["admissao_qtd_dias_teste", "admissao_dia_teste"]) {
    assert.ok((CAMPOS_ADMISSAO as readonly string[]).includes(c), c);
    assert.equal((ROTULO_CAMPO as Record<string, string>)[c], "Dia(s) de teste");
    assert.equal(campoDaAdmissao(c), true);
  }
  assert.equal((CAMPOS_ADMISSAO as readonly string[]).includes("admissao_dias_teste"), false, "a jsonb antiga não existe mais");
});

// ── criação (indicação direta) ──
await ok("criação (MOT): grava 1 e 2 em admissao_qtd_dias_teste e NÃO grava o texto antigo nem a jsonb antiga", async () => {
  for (const q of [1, 2]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_qtd_dias_teste: q, admissao_dia_teste: "texto antigo" }) });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(ult(db).admissao_qtd_dias_teste, q);
    assert.equal(ult(db).admissao_dia_teste ?? null, null);
    assert.equal("admissao_dias_teste" in ult(db), false);
  }
});
await ok("criação (MOT/Terceirização): 0 ('não houve') é aceito e gravado como 0 — não vira null", async () => {
  for (const tipo of [MOT, TERC]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    db.tabelas.vagas.find((v: any) => v.id === ID.V_MOT_A).tipo_servico = tipo;
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_qtd_dias_teste: 0 }) });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.strictEqual(ult(db).admissao_qtd_dias_teste, 0);
  }
});
await ok("criação (MOT/Terceirização): ausente ou null → 400 'Informe se houve dia(s) de teste.' e nada gravado", async () => {
  for (const tipo of [MOT, TERC]) for (const extra of [{ admissao_qtd_dias_teste: undefined }, { admissao_qtd_dias_teste: null }]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    db.tabelas.vagas.find((v: any) => v.id === ID.V_MOT_A).tipo_servico = tipo;
    const antes = db.tabelas.solicitacoes_indicacao_candidato.length;
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo(extra) });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(r.corpo.error, MSG);
    assert.equal(db.tabelas.solicitacoes_indicacao_candidato.length, antes);
  }
});
await ok("criação: 3 dias, negativo, fração e texto → 400 do schema, nada gravado", async () => {
  for (const q of [3, -1, 1.5, "2"]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const antes = db.tabelas.solicitacoes_indicacao_candidato.length;
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_qtd_dias_teste: q }) });
    assert.equal(r.status, 400, JSON.stringify(q));
    assert.equal(db.tabelas.solicitacoes_indicacao_candidato.length, antes);
  }
});
await ok("criação (R&S): campo ignorado — não exige e grava null mesmo se enviado", async () => {
  for (const extra of [{ admissao_qtd_dias_teste: undefined }, { admissao_qtd_dias_teste: 2 }, { admissao_qtd_dias_teste: 0 }]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ vaga_id: ID.V_RS, ...extra }) });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.strictEqual(ult(db).admissao_qtd_dias_teste, null);
  }
});

// ── avaliação do portal ──
await ok("avaliação (aprovar): MOT sem resposta → 400 sem gravar; com 0, 1 ou 2 → grava; 3 → 400; R&S ignora", async () => {
  const montar = (vagaId: string) => {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    db.tabelas.encaminhamentos = [{ id: ENC, candidato_id: ID.CAND, vaga_id: vagaId, cliente_id: "C1", status: "aguardando" }];
    return db;
  };
  const chamarAv = (extra: any) => chamar(avaliar.PATCH, { metodo: "PATCH", corpo: { encaminhamento_id: ENC, status: "aprovado", feedback_cliente: "ok", cv_id: ID.CV, ...extra } });
  const cv = (db: any) => db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV);

  for (const extra of [{ admissao_salario: 1500 }, { admissao_qtd_dias_teste: null }]) {
    const db = montar(ID.V_MOT_A);
    const r = await chamarAv(extra);
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(r.corpo.error, MSG);
    assert.equal(db.tabelas.encaminhamentos[0].status, "aguardando", "avaliação não pode ficar pela metade");
  }
  for (const q of [0, 1, 2]) {
    const db = montar(ID.V_MOT_A);
    const r = await chamarAv({ admissao_qtd_dias_teste: q, admissao_dia_teste: "texto antigo" });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(cv(db).admissao_qtd_dias_teste, q);
    assert.notEqual(cv(db).admissao_dia_teste, "texto antigo", "texto antigo não é mais gravado");
  }
  const dbTres = montar(ID.V_MOT_A);
  assert.equal((await chamarAv({ admissao_qtd_dias_teste: 3 })).status, 400);
  assert.equal(dbTres.tabelas.encaminhamentos[0].status, "aguardando");

  const dbRs = montar(ID.V_RS);
  const r = await chamarAv({ admissao_qtd_dias_teste: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(cv(dbRs).admissao_qtd_dias_teste ?? null, null);
});
await ok("avaliação (aprovar): o e-mail ao RH mostra '2 dias de teste' / 'Não houve dia de teste' (0 aparece) e não mostra a linha em R&S", async () => {
  const rodar = async (vagaId: string, q: number | undefined) => {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    db.tabelas.encaminhamentos = [{ id: ENC, candidato_id: ID.CAND, vaga_id: vagaId, cliente_id: "C1", status: "aguardando" }];
    const r = await chamar(avaliar.PATCH, { metodo: "PATCH", corpo: { encaminhamento_id: ENC, status: "aprovado", feedback_cliente: "ok", cv_id: ID.CV, tipo_servico: vagaId === ID.V_RS ? RS : MOT, admissao_qtd_dias_teste: q, admissao_funcao: "Auxiliar" } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    return emails(db);
  };
  assert.match(await rodar(ID.V_MOT_A, 2), /Dia\(s\) de teste[\s\S]*2 dias de teste/);
  assert.match(await rodar(ID.V_MOT_A, 1), /1 dia de teste/);
  assert.match(await rodar(ID.V_MOT_A, 0), /Não houve dia de teste/);
  assert.doesNotMatch(await rodar(ID.V_RS, 2), /dias? de teste/);
});

// ── decisão do analista (cópia solicitação → candidatos_vagas) e e-mail ──
await ok("decisão (aprovar): copia admissao_qtd_dias_teste (1, 2 e 0) para candidatos_vagas, mantém o texto legado e o e-mail mostra", async () => {
  for (const [q, esperado] of [[2, /2 dias de teste/], [1, /1 dia de teste/], [0, /Não houve dia de teste/]] as const) {
    const db = novoDbIndicacao(); logar(db, "dir");
    sol(db, ID.S_PEND).admissao_qtd_dias_teste = q;
    sol(db, ID.S_PEND).admissao_dia_teste = "texto legado";
    const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar", data_fim: "2027-01-31" } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
    assert.strictEqual(cvNovo.admissao_qtd_dias_teste, q, "0 é copiado como 0, não como null");
    assert.equal(cvNovo.admissao_dia_teste, "texto legado");
    assert.match(emails(db), esperado);
    assert.equal("admissao_dias_teste" in cvNovo, false);
  }
});
await ok("decisão sem quantidade (registro antigo): copia null e o e-mail não ganha a linha de quantidade", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar", data_fim: "2027-01-31" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cvNovo.admissao_qtd_dias_teste ?? null, null);
  assert.doesNotMatch(emails(db), /Dia\(s\) de teste/);
});
await ok("decisão (legado): texto antigo continua sendo copiado e aparece no e-mail", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  sol(db, ID.S_PEND).admissao_dia_teste = "05/11 e 06/11";
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar", data_fim: "2027-01-31" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id).admissao_dia_teste, "05/11 e 06/11");
  assert.match(emails(db), /Dia\(s\) de teste/);
  assert.match(emails(db), /05\/11 e 06\/11/);
});

// ── edição pelo cliente (PATCH/GET) ──
await ok("edição (PATCH): null recusado em MOT/Terceirização (400), em indicação aprovada ou pendente; nada é apagado", async () => {
  for (const id of [ID.S_APROV, ID.S_PEND]) for (const salvo of [2, 0]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    sol(db, id).admissao_qtd_dias_teste = salvo;
    const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id }, corpo: { admissao_qtd_dias_teste: null } });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(r.corpo.error, MSG);
    assert.strictEqual(sol(db, id).admissao_qtd_dias_teste, salvo, "nada foi apagado");
  }
  const dbT = novoDbIndicacao(); logarPortal(dbT, "cli");
  dbT.tabelas.vagas.find((v: any) => v.id === ID.V_MOT_A).tipo_servico = TERC;
  const rt = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_qtd_dias_teste: null } });
  assert.equal(rt.status, 400, JSON.stringify(rt.corpo));
});
await ok("edição (PATCH): 0, 1 e 2 são aceitos; registro antigo (null) segue editável sem enviar o campo; 3 é recusado", async () => {
  for (const q of [0, 1, 2]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_qtd_dias_teste: q } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(sol(db, ID.S_PEND).admissao_qtd_dias_teste, q);
  }
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  assert.equal(sol(db, ID.S_PEND).admissao_qtd_dias_teste ?? null, null);
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_funcao: "Outra função" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(sol(db, ID.S_PEND).admissao_qtd_dias_teste ?? null, null, "campo não mexido continua não informado");
  const dbTres = novoDbIndicacao(); logarPortal(dbTres, "cli");
  assert.equal((await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_qtd_dias_teste: 3 } })).status, 400);
});
await ok("edição em indicação aprovada: troca de quantidade propaga p/ candidatos_vagas; de null para 0 também conta como alteração", async () => {
  for (const q of [2, 0]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_APROV }, corpo: { admissao_qtd_dias_teste: q } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(sol(db, ID.S_APROV).admissao_qtd_dias_teste, q);
    assert.strictEqual(db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).admissao_qtd_dias_teste, q);
  }
});
await ok("edição (PATCH) em R&S: null não é recusado (campo ignorado nesse serviço)", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  sol(db, ID.S_PEND).vaga_id = ID.V_RS;
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_qtd_dias_teste: null } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
});
await ok("edição (GET): detalhe devolve admissao_qtd_dias_teste salvo (null, 0 e 2) — 0 não vira null", async () => {
  for (const salvo of [null, 0, 2]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    sol(db, ID.S_PEND).admissao_qtd_dias_teste = salvo;
    const r = await chamar(editar.GET, { metodo: "GET", params: { id: ID.S_PEND } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(r.corpo.data.admissao_qtd_dias_teste, salvo);
  }
});
await ok("edição (legado): o texto antigo continua editável e propaga para candidatos_vagas", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_APROV }, corpo: { admissao_dia_teste: "07/11" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(sol(db, ID.S_APROV).admissao_dia_teste, "07/11");
  assert.equal(db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).admissao_dia_teste, "07/11");
});
await ok("edição: 0 é valor válido e DIFERENTE de null (diff, normalização e aviso); mesmo valor não gera alteração", () => {
  assert.strictEqual(normalizarValor("admissao_qtd_dias_teste", 0), 0);
  assert.equal(calcularDiff({ admissao_qtd_dias_teste: null }, { admissao_qtd_dias_teste: 0 }).length, 1, "null → 0 é alteração");
  assert.equal(calcularDiff({ admissao_qtd_dias_teste: 0 }, { admissao_qtd_dias_teste: null }).length, 1, "0 → null é alteração");
  assert.equal(calcularDiff({ admissao_qtd_dias_teste: 0 }, { admissao_qtd_dias_teste: 0 }).length, 0);
  assert.equal(calcularDiff({ admissao_qtd_dias_teste: 2 }, { admissao_qtd_dias_teste: 2 }).length, 0);
  assert.equal(calcularDiff({ admissao_qtd_dias_teste: 1 }, { admissao_qtd_dias_teste: 2 }).length, 1);
  assert.equal(formatarValorAviso("admissao_qtd_dias_teste", 0, "depois"), "Não houve dia de teste");
  assert.equal(formatarValorAviso("admissao_qtd_dias_teste", 1, "antes"), "1 dia de teste");
  assert.equal(formatarValorAviso("admissao_qtd_dias_teste", 2, "depois"), "2 dias de teste");
  assert.equal(formatarValorAviso("admissao_qtd_dias_teste", null, "antes"), "(vazio)");
});

// ── exibição para o RH/DP (somente leitura) ──
await ok("RH: 1 e 2 → '1 dia de teste'/'2 dias de teste', destacados; o texto antigo é ignorado quando há quantidade", () => {
  assert.deepEqual(textoDiasTesteParaRH(2, null, MOT), { linhas: ["2 dias de teste"], destacar: true });
  assert.deepEqual(textoDiasTesteParaRH(1, null, TERC), { linhas: ["1 dia de teste"], destacar: true });
  assert.deepEqual(textoDiasTesteParaRH(1, "texto antigo", MOT), { linhas: ["1 dia de teste"], destacar: true });
  assert.equal("total" in textoDiasTesteParaRH(2, null, MOT)!, false, "sem total: não há horas");
});
await ok("RH: 0 → 'Não houve dia de teste', sem destaque (mesmo com texto antigo)", () => {
  for (const legado of [null, "texto antigo"]) assert.deepEqual(textoDiasTesteParaRH(0, legado, MOT), { linhas: ["Não houve dia de teste"], destacar: false });
});
await ok("RH: null com texto antigo → mostra o texto antigo (trim), em qualquer serviço", () => {
  for (const tipo of [MOT, TERC, RS, null]) assert.deepEqual(textoDiasTesteParaRH(null, "  05/11 e 06/11  ", tipo), { linhas: ["05/11 e 06/11"], destacar: false });
  assert.deepEqual(textoDiasTesteParaRH(undefined, "07/11", MOT)!.linhas, ["07/11"]);
});
await ok("RH: null sem texto → 'Não informado pelo cliente' só em MOT/Terceirização; R&S e sem serviço não mostram nada", () => {
  for (const legado of [null, undefined, "", "   "]) {
    assert.deepEqual(textoDiasTesteParaRH(null, legado, MOT), { linhas: ["Não informado pelo cliente"], destacar: false });
    assert.equal(textoDiasTesteParaRH(null, legado, TERC)!.linhas[0], "Não informado pelo cliente");
    assert.equal(textoDiasTesteParaRH(null, legado, RS), null);
    assert.equal(textoDiasTesteParaRH(null, legado, null), null);
  }
  for (const lixo of ["lixo", 3, -1, 1.5, [], {}]) assert.equal(textoDiasTesteParaRH(lixo, null, RS), null, `fora do domínio: ${JSON.stringify(lixo)}`);
  assert.equal(textoDiasTesteParaRH(3, null, MOT)!.linhas[0], "Não informado pelo cliente", "valor fora de 0..2 é tratado como não informado");
});
await ok("RH: selo da lista só com teste ('1 dia(s)', '2 dia(s)'); 0, null e fora do domínio não ganham selo", () => {
  assert.equal(seloDiasTeste(2), "2 dia(s)");
  assert.equal(seloDiasTeste(1), "1 dia(s)");
  for (const v of [0, null, undefined, 3, -1, "2", []]) assert.equal(seloDiasTeste(v), null, String(v));
});
await ok("RH: admissão → candidatura pelo par (candidato, vaga): lê quantidade/legado, ignora outras vagas e candidatos e admissão sem candidatura", async () => {
  const { buscarDiasTestePorAdmissao } = await importar("src/lib/diasTesteAdmissao.ts");
  const db = novoDbIndicacao();
  const A = "cccccccc-0000-4000-8000-000000000001", B = "cccccccc-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003", E = "cccccccc-0000-4000-8000-000000000004";
  const cv = (candidato_id: string, vaga_id: string, extra = {}) => ({ id: `cv-${candidato_id}-${vaga_id}`, candidato_id, vaga_id, etapa: "contratado", ...extra });
  db.tabelas.candidatos_vagas = [
    cv("CAND1", ID.V_MOT_A, { admissao_qtd_dias_teste: 2, admissao_dia_teste: "legado" }),
    cv("CAND1", ID.V_MOT_B, { admissao_qtd_dias_teste: 0, admissao_dia_teste: null }),   // outra vaga do mesmo candidato
    cv("CAND2", ID.V_MOT_A, { admissao_qtd_dias_teste: null, admissao_dia_teste: "só texto" }), // outro candidato, mesma vaga
  ];
  // Mesmo cliente em memória que as rotas recebem no harness (o módulo real depende de next/headers).
  // @ts-expect-error módulo .mjs do harness, sem tipos
  const { createServiceClient } = await import("./harness-mot/mocks/supabase-server.mjs");
  const r = await buscarDiasTestePorAdmissao(createServiceClient(), [
    { id: A, candidato_id: "CAND1", vaga_id: ID.V_MOT_A },
    { id: B, candidato_id: "CAND1", vaga_id: ID.V_MOT_B },
    { id: C, candidato_id: "CAND2", vaga_id: ID.V_MOT_A },
    { id: E, candidato_id: "CAND2", vaga_id: ID.V_MOT_B }, // sem candidatura
  ]);
  assert.deepEqual(r.get(A), { qtd: 2, legado: "legado" });
  assert.deepEqual(r.get(B), { qtd: 0, legado: null }, "0 continua 0");
  assert.deepEqual(r.get(C), { qtd: null, legado: "só texto" });
  assert.equal(r.has(E), false, "admissão sem candidatura não herda dados de outra vaga/candidato");
  assert.equal((await buscarDiasTestePorAdmissao(createServiceClient(), [{ id: "x", candidato_id: "CAND1", vaga_id: null }])).size, 0);
});

// ── CampoDiasTeste (portal e ajuste do RH): helpers, render e interação ──
const render = (valor: EstadoDiasTeste, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(CampoDiasTeste, { valor, onChange: () => {}, ...extra }));
// O componente não usa hooks: chamá-lo devolve a árvore de elementos, onde dá para achar os handlers.
function achar(no: any, teste: (el: any) => boolean, achados: any[] = []): any[] {
  if (Array.isArray(no)) { no.forEach((x) => achar(x, teste, achados)); return achados; }
  if (!no || typeof no !== "object" || !("props" in no)) return achados;
  if (teste(no)) achados.push(no);
  achar((no as ReactElement<any>).props?.children, teste, achados);
  return achados;
}
const arvore = (valor: EstadoDiasTeste, onChange: (e: EstadoDiasTeste) => void) => (CampoDiasTeste as any)({ valor, onChange });

await ok("CampoDiasTeste: helpers — sem resposta → null; Não → 0; Sim → a quantidade; erros de cada caso", () => {
  assert.equal(diasTesteParaEnvio(ESTADO_DIAS_TESTE_VAZIO), null);
  assert.strictEqual(diasTesteParaEnvio({ resposta: "nao", qtd: null }), 0);
  assert.strictEqual(diasTesteParaEnvio({ resposta: "sim", qtd: 1 }), 1);
  assert.strictEqual(diasTesteParaEnvio({ resposta: "sim", qtd: 2 }), 2);
  assert.equal(diasTesteParaEnvio({ resposta: "sim", qtd: null }), null, "Sim sem quantidade não vira 0");
  assert.equal(erroDiasTeste(ESTADO_DIAS_TESTE_VAZIO), "Informe se houve dia(s) de teste.");
  assert.equal(erroDiasTeste({ resposta: "sim", qtd: null }), "Informe a quantidade de dias de teste.");
  assert.equal(erroDiasTeste({ resposta: "nao", qtd: null }), null);
  assert.equal(erroDiasTeste({ resposta: "sim", qtd: 1 }), null);
  assert.equal(erroDiasTeste({ resposta: "sim", qtd: 2 }), null);
});
await ok("CampoDiasTeste: estado a partir do valor salvo — null → sem resposta; 0 → Não; 1 e 2 → Sim + quantidade; lixo → sem resposta", () => {
  assert.deepEqual(estadoDiasTesteDeValor(null), { resposta: "", qtd: null });
  assert.deepEqual(estadoDiasTesteDeValor(undefined), { resposta: "", qtd: null });
  assert.deepEqual(estadoDiasTesteDeValor(0), { resposta: "nao", qtd: null });
  assert.deepEqual(estadoDiasTesteDeValor(1), { resposta: "sim", qtd: 1 });
  assert.deepEqual(estadoDiasTesteDeValor(2), { resposta: "sim", qtd: 2 });
  for (const lixo of [3, -1, 1.5, "1", [], {}]) assert.deepEqual(estadoDiasTesteDeValor(lixo), { resposta: "", qtd: null }, JSON.stringify(lixo));
  for (const q of [0, 1, 2]) assert.strictEqual(diasTesteParaEnvio(estadoDiasTesteDeValor(q)), q, "ida e volta");
});
await ok("CampoDiasTeste (render): sem pré-seleção e sem select; Sim mostra 'Quantos dias?' com Selecione, 1 dia e 2 dias (até MAX_DIAS_TESTE)", () => {
  const vazio = render(ESTADO_DIAS_TESTE_VAZIO);
  assert.doesNotMatch(vazio, /checked/);
  assert.doesNotMatch(vazio, /<select/);
  const nao = render({ resposta: "nao", qtd: null });
  assert.doesNotMatch(nao, /<select/);
  const sim = render({ resposta: "sim", qtd: null });
  assert.match(sim, /Quantos dias\?/);
  assert.match(sim, /<option value=""( selected="")?>Selecione<\/option>/);
  assert.match(sim, />1 dia</);
  assert.match(sim, />2 dias</);
  assert.equal((sim.match(/<option /g) ?? []).length, 1 + MAX_DIAS_TESTE, "Selecione + uma opção por quantidade possível");
  assert.doesNotMatch(sim, /<input type="date"|<input type="time"/, "sem data nem horário");
  assert.match(render({ resposta: "sim", qtd: 2 }), /<option value="2" selected="">2 dias<\/option>/);
});
await ok("CampoDiasTeste (render): mostrarErro — sem resposta pinta o grupo; Sim sem quantidade pinta o select; sem mostrarErro nada", () => {
  const a = render(ESTADO_DIAS_TESTE_VAZIO, { mostrarErro: true });
  assert.match(a, /Informe se houve dia\(s\) de teste\./);
  assert.match(a, /#EF4444/);
  const b = render({ resposta: "sim", qtd: null }, { mostrarErro: true });
  assert.match(b, /Informe a quantidade de dias de teste\./);
  assert.match(b, /#EF4444/);
  const ok1 = render({ resposta: "sim", qtd: 1 }, { mostrarErro: true });
  assert.doesNotMatch(ok1, /#EF4444|Informe/);
  assert.doesNotMatch(render(ESTADO_DIAS_TESTE_VAZIO, { mostrarErro: false }), /#EF4444|Informe se houve/);
});
await ok("CampoDiasTeste (render): className e style dos inputs são repassados ao select", () => {
  const html = render({ resposta: "sim", qtd: null }, { inputClassName: "input-field", inputStyle: { border: "1px solid #E5E7EB" } });
  assert.match(html, /<select[^>]*class="input-field"/);
  assert.match(html, /border:1px solid #E5E7EB/);
});
await ok("CampoDiasTeste (interação): Não → Não/0; Sim → pede quantidade; escolher 1 e 2; voltar a 'Selecione'; Sim→Não descarta a quantidade", () => {
  let ultimo: EstadoDiasTeste | null = null;
  const t = (st: EstadoDiasTeste) => arvore(st, (e) => { ultimo = e; });
  const radios = (st: EstadoDiasTeste) => achar(t(st), (el) => el.type === "input" && el.props.type === "radio");
  const select = (st: EstadoDiasTeste) => achar(t(st), (el) => el.type === "select")[0];

  const [rNao, rSim] = radios(ESTADO_DIAS_TESTE_VAZIO);
  rNao.props.onChange();
  assert.deepEqual(ultimo, { resposta: "nao", qtd: null });
  assert.strictEqual(diasTesteParaEnvio(ultimo!), 0);
  rSim.props.onChange();
  assert.deepEqual(ultimo, { resposta: "sim", qtd: null });
  assert.equal(erroDiasTeste(ultimo!), "Informe a quantidade de dias de teste.", "Sim sem quantidade continua bloqueando");

  select({ resposta: "sim", qtd: null }).props.onChange({ target: { value: "1" } });
  assert.deepEqual(ultimo, { resposta: "sim", qtd: 1 });
  select({ resposta: "sim", qtd: 1 }).props.onChange({ target: { value: "2" } });
  assert.deepEqual(ultimo, { resposta: "sim", qtd: 2 });
  assert.strictEqual(diasTesteParaEnvio(ultimo!), 2);
  select({ resposta: "sim", qtd: 2 }).props.onChange({ target: { value: "" } });
  assert.deepEqual(ultimo, { resposta: "sim", qtd: null });

  radios({ resposta: "sim", qtd: 2 })[1].props.onChange();
  assert.deepEqual(ultimo, { resposta: "sim", qtd: 2 }, "marcar Sim de novo mantém a quantidade");
  radios({ resposta: "sim", qtd: 2 })[0].props.onChange();
  assert.deepEqual(ultimo, { resposta: "nao", qtd: null }, "Sim → Não descarta a quantidade");
});
await ok("CampoDiasTeste: obrigatoriedade por serviço — só MOT/Terceirização exigem; Não (0) satisfaz; o servidor recusa null", () => {
  for (const tipo of [MOT, TERC]) {
    assert.equal(exigeRespostaDiasTeste(tipo), true);
    assert.deepEqual(resolverDiasTeste(tipo, diasTesteParaEnvio(ESTADO_DIAS_TESTE_VAZIO)), { ok: false, erro: MSG });
    assert.deepEqual(resolverDiasTeste(tipo, diasTesteParaEnvio({ resposta: "nao", qtd: null })), { ok: true, valor: 0 });
    assert.deepEqual(resolverDiasTeste(tipo, diasTesteParaEnvio({ resposta: "sim", qtd: 2 })), { ok: true, valor: 2 });
  }
  assert.deepEqual(resolverDiasTeste(RS, diasTesteParaEnvio({ resposta: "sim", qtd: 2 })), { ok: true, valor: null }, "R&S ignora");
});

// ── BlocoDiasTesteRH (exibição do RH) ──
const bloco = (qtd: unknown, legado: string | null, tipo: string | null) => renderToStaticMarkup(createElement(BlocoDiasTesteRH, { qtd, legado, tipo }));
await ok("BlocoDiasTesteRH: 1 e 2 → bloco âmbar 'a pagar na folha' com '1 dia de teste' / '2 dias de teste' (sem total, sem horas)", () => {
  for (const [q, texto] of [[1, "1 dia de teste"], [2, "2 dias de teste"]] as const) {
    const h = bloco(q, "texto antigo", MOT);
    assert.match(h, /Dia\(s\) de teste \(a pagar na folha\)/);
    assert.match(h, /#FFFBEB/);
    assert.match(h, new RegExp(texto));
    assert.doesNotMatch(h, /Total|texto antigo|\d{2}:\d{2}/);
  }
});
await ok("BlocoDiasTesteRH: 0, texto antigo e 'não informado' (MOT/Terceirização) aparecem sem destaque", () => {
  for (const [q, l, t, texto] of [[0, null, MOT, "Não houve dia de teste"], [0, "texto antigo", TERC, "Não houve dia de teste"], [null, "05/11 e 06/11", MOT, "05/11 e 06/11"], [null, null, MOT, "Não informado pelo cliente"], [null, null, TERC, "Não informado pelo cliente"]] as const) {
    const h = bloco(q, l, t);
    assert.match(h, new RegExp(texto));
    assert.match(h, /Dia\(s\) de teste:/);
    assert.doesNotMatch(h, /a pagar na folha|#FFFBEB/);
  }
});
await ok("BlocoDiasTesteRH: R&S sem quantidade nem texto não renderiza nada; texto antigo em R&S ainda aparece", () => {
  assert.equal(bloco(null, null, RS), "");
  assert.equal(bloco(null, "  ", RS), "");
  assert.equal(bloco(undefined, null, null), "");
  assert.match(bloco(null, "05/11", RS), /05\/11/);
});

// ── RH ajusta a quantidade ao iniciar a admissão (POST /api/admissoes) ──
await ok("admissão (RH ajusta a quantidade): schema aceita 0..2 e recusa 3; grava na candidatura de origem com auditoria; sem a chave não mexe", async () => {
  const base = { candidato_id: ID.CAND, vaga_id: ID.V_MOT_A, modalidade: "MOT", funcao: "Auxiliar", salario: 1800, horario_trabalho: "08:00 às 17:00", data_admissao: "2026-11-10", entidade_contratante: "X" };
  for (const q of [0, 1, 2]) assert.equal(admissaoCreateSchema.safeParse({ ...base, admissao_qtd_dias_teste: q }).success, true, String(q));
  for (const q of [3, -1, 1.5, "1", null]) assert.equal(admissaoCreateSchema.safeParse({ ...base, admissao_qtd_dias_teste: q }).success, false, JSON.stringify(q));
  assert.equal(admissaoCreateSchema.safeParse(base).success, true);

  const rota = await importar("src/app/api/admissoes/route.ts");
  const montar = (qtdSalva: number | null) => {
    const db = novoDbIndicacao(); logar(db, "dir");
    db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).vaga_id = ID.V_MOT_A;
    db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).admissao_qtd_dias_teste = qtdSalva;
    return db;
  };
  const cvDe = (db: any) => db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV);
  for (const [salvo, novo] of [[null, 2], [2, 0], [1, 2], [0, 1]] as const) {
    const db = montar(salvo);
    const r = await chamar(rota.POST, { metodo: "POST", corpo: { ...base, admissao_qtd_dias_teste: novo } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(cvDe(db).admissao_qtd_dias_teste, novo, `${salvo} → ${novo}`);
    const aud = (db.tabelas.audit_logs ?? []).find((l: any) => l.acao === "admissao_qtd_dias_teste_ajustada_pelo_rh");
    assert.ok(aud, "auditoria do ajuste");
    assert.deepEqual({ antes: aud.detalhes.antes, depois: aud.detalhes.depois }, { antes: salvo, depois: novo });
  }
  const dbSem = montar(2);
  const rSem = await chamar(rota.POST, { metodo: "POST", corpo: base });
  assert.equal(rSem.status, 200, JSON.stringify(rSem.corpo));
  assert.strictEqual(cvDe(dbSem).admissao_qtd_dias_teste, 2, "sem a chave a candidatura não é tocada");
  assert.equal((dbSem.tabelas.audit_logs ?? []).some((l: any) => l.acao === "admissao_qtd_dias_teste_ajustada_pelo_rh"), false);
  const dbIgual = montar(1);
  await chamar(rota.POST, { metodo: "POST", corpo: { ...base, admissao_qtd_dias_teste: 1 } });
  assert.equal((dbIgual.tabelas.audit_logs ?? []).some((l: any) => l.acao === "admissao_qtd_dias_teste_ajustada_pelo_rh"), false, "mesmo valor: nada a auditar");
});

console.log(`\n${n} verificações OK`);
