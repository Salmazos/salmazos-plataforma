// Verificação dos "Dia(s) de teste" ESTRUTURADOS (admissao_dias_teste, jsonb) e do texto legado (admissao_dia_teste, só
// leitura/cópia): regras puras (src/lib/diasTeste.ts), schemas, obrigatoriedade por serviço, criação pelo cliente, avaliação,
// edição, decisão (cópia para candidatos_vagas) e aviso por e-mail. Roda as rotas reais contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-dia-teste.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID } from "./harness-mot/ambiente-indicacao.mjs";
import { CAMPOS_ADMISSAO, ROTULO_CAMPO, campoDaAdmissao, calcularDiff, formatarValorAviso } from "../src/lib/indicacaoEdicao";
import {
  MAX_DIAS_TESTE, diasTesteSchema, horasDoDiaTeste, totalHorasDiasTeste, formatarDiasTeste, exigeRespostaDiasTeste, resolverDiasTeste,
} from "../src/lib/diasTeste";
import { portalAvaliarSchema, portalIndicarCandidatoSchema, portalEditarIndicacaoSchema } from "../src/lib/schemas";

congelarData();
const criar = await importar("src/app/api/portal/indicar-candidato/route.ts");
const editar = await importar("src/app/api/portal/minhas-indicacoes/[id]/route.ts");
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");
const avaliar = await importar("src/app/api/portal/avaliar/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const corpo = (extra = {}) => ({
  vaga_id: ID.V_MOT_A, candidato_nome: "Fulano de Tal", candidato_telefone: "(19) 90000-1111",
  admissao_data_inicio: "2026-11-10", admissao_salario: 1800, admissao_funcao: "Auxiliar", admissao_dias_teste: [], ...extra,
});
const sol = (db: any, id: string) => db.tabelas.solicitacoes_indicacao_candidato.find((s: any) => s.id === id);

await ok("schemas: aceitam texto, vazio, null e ausência (campo opcional)", () => {
  for (const s of [portalIndicarCandidatoSchema, portalAvaliarSchema]) {
    const base: any = s === portalAvaliarSchema ? { encaminhamento_id: "11111111-1111-4111-8111-111111111111", status: "aprovado", feedback_cliente: "ok" } : { vaga_id: ID.V_MOT_A, candidato_nome: "A", candidato_telefone: "1" };
    for (const v of ["05/11 e 06/11", "", null, undefined]) {
      const r = s.safeParse({ ...base, admissao_dia_teste: v });
      assert.equal(r.success, true, JSON.stringify(r));
    }
    assert.equal(s.safeParse(base).success, true);
  }
  assert.equal(portalEditarIndicacaoSchema.safeParse({ admissao_dia_teste: "05/11" }).success, true);
});
await ok("edição pelo cliente: campo é editável, tem rótulo e conta como dado de admissão", () => {
  assert.ok((CAMPOS_ADMISSAO as readonly string[]).includes("admissao_dia_teste"));
  assert.equal((ROTULO_CAMPO as Record<string, string>).admissao_dia_teste, "Dia(s) de teste");
  assert.equal(campoDaAdmissao("admissao_dia_teste"), true);
});
const D1 = { data: "2026-11-05", entrada: "08:00", saida: "12:00" };
const D2 = { data: "2026-11-06", entrada: "22:00", saida: "06:00" };
const ult = (db: any) => db.tabelas.solicitacoes_indicacao_candidato.at(-1);

await ok("regras puras: MAX_DIAS_TESTE é 2 e o limite do schema vem dele", () => {
  assert.equal(MAX_DIAS_TESTE, 2);
  const tres = [D1, D2, { data: "2026-11-07", entrada: "08:00", saida: "12:00" }];
  assert.equal(diasTesteSchema.safeParse(tres.slice(0, MAX_DIAS_TESTE)).success, true);
  assert.equal(diasTesteSchema.safeParse(tres).success, false, "o 3º dia deve ser recusado");
});
await ok("validação: data inexistente/formato, hora inválida, saída = entrada, datas repetidas", () => {
  const v = (x: any) => diasTesteSchema.safeParse([{ ...D1, ...x }]).success;
  assert.equal(v({}), true);
  for (const data of ["2026-02-30", "2026-13-01", "05/11/2026", "2026-1-5", "", "2026-11-05T00:00"]) assert.equal(v({ data }), false, data);
  for (const entrada of ["24:00", "8:00", "08:60", "", "0800"]) assert.equal(v({ entrada }), false, entrada);
  for (const saida of ["12:5", "25:00", ""]) assert.equal(v({ saida }), false, saida);
  assert.equal(v({ entrada: "08:00", saida: "08:00" }), false, "saída igual à entrada");
  assert.equal(diasTesteSchema.safeParse([D1, { ...D2, data: D1.data }]).success, false, "data repetida");
  assert.equal(diasTesteSchema.safeParse([]).success, true, "[] = não houve");
});
await ok("meia-noite: saída menor que a entrada é permitida e soma 24h-entrada+saída", () => {
  assert.equal(diasTesteSchema.safeParse([D2]).success, true);
  assert.equal(horasDoDiaTeste(D2), "8h");
  assert.equal(horasDoDiaTeste({ data: "2026-11-05", entrada: "23:30", saida: "00:15" }), "0h45");
});
await ok("horas: 4h, 7h30 e total", () => {
  assert.equal(horasDoDiaTeste(D1), "4h");
  assert.equal(horasDoDiaTeste({ data: "2026-11-05", entrada: "08:00", saida: "15:30" }), "7h30");
  assert.equal(totalHorasDiasTeste([D1, { data: "2026-11-06", entrada: "08:00", saida: "11:30" }]), "7h30");
  assert.equal(totalHorasDiasTeste([D1, D2]), "12h");
  assert.equal(totalHorasDiasTeste([]), "0h");
});
await ok("formato: null/undefined → null; [] → Não houve; linhas dd/mm/aaaa · HH:MM às HH:MM (Xh), sem new Date", () => {
  assert.equal(formatarDiasTeste(null), null);
  assert.equal(formatarDiasTeste(undefined), null);
  assert.equal(formatarDiasTeste([]), "Não houve");
  assert.equal(formatarDiasTeste([D1]), "05/11/2026 · 08:00 às 12:00 (4h)");
  assert.equal(formatarDiasTeste([D1, D2]), "05/11/2026 · 08:00 às 12:00 (4h)\n06/11/2026 · 22:00 às 06:00 (8h)");
  const tz = process.env.TZ; process.env.TZ = "America/Los_Angeles";
  try { assert.equal(formatarDiasTeste([{ ...D1, data: "2026-01-01" }]), "01/01/2026 · 08:00 às 12:00 (4h)"); } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
});
await ok("obrigatoriedade por serviço: MOT e Terceirização exigem; R&S e demais não", () => {
  assert.equal(exigeRespostaDiasTeste("mao_obra_temporaria"), true);
  assert.equal(exigeRespostaDiasTeste("terceirizacao"), true);
  for (const t of ["recrutamento_selecao", "avaliacao_psicologica", "", null, undefined]) assert.equal(exigeRespostaDiasTeste(t), false, String(t));
  assert.deepEqual(resolverDiasTeste("mao_obra_temporaria", undefined), { ok: false, erro: "Informe se houve dia(s) de teste." });
  assert.deepEqual(resolverDiasTeste("terceirizacao", null), { ok: false, erro: "Informe se houve dia(s) de teste." });
  assert.deepEqual(resolverDiasTeste("terceirizacao", []), { ok: true, valor: [] });
  assert.deepEqual(resolverDiasTeste("recrutamento_selecao", [D1]), { ok: true, valor: null });
});
await ok("criação (MOT): grava admissao_dias_teste estruturado e NÃO grava mais o texto antigo", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_dias_teste: [D1, D2], admissao_dia_teste: "texto antigo" }) });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.deepEqual(ult(db).admissao_dias_teste, [D1, D2]);
  assert.equal(ult(db).admissao_dia_teste ?? null, null);
});
await ok("criação (MOT): [] ('não houve') é aceito e gravado como []", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_dias_teste: [] }) });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.deepEqual(ult(db).admissao_dias_teste, []);
});
await ok("criação (MOT): ausente ou null → 400 'Informe se houve dia(s) de teste.' e nada gravado", async () => {
  for (const extra of [{ admissao_dias_teste: undefined }, { admissao_dias_teste: null }]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const antes = db.tabelas.solicitacoes_indicacao_candidato.length;
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo(extra) });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(r.corpo.error, "Informe se houve dia(s) de teste.");
    assert.equal(db.tabelas.solicitacoes_indicacao_candidato.length, antes);
  }
});
await ok("criação: 3 dias, data repetida e hora inválida → 400 do schema", async () => {
  const tres = [D1, D2, { data: "2026-11-07", entrada: "08:00", saida: "12:00" }];
  for (const dias of [tres, [D1, D1], [{ ...D1, entrada: "25:00" }], [{ ...D1, saida: D1.entrada }]]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ admissao_dias_teste: dias }) });
    assert.equal(r.status, 400, JSON.stringify(dias));
  }
});
await ok("criação (R&S): campo ignorado — não exige e grava null mesmo se enviado", async () => {
  for (const extra of [{ admissao_dias_teste: undefined }, { admissao_dias_teste: [D1] }]) {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(criar.POST, { metodo: "POST", corpo: corpo({ vaga_id: ID.V_RS, ...extra }) });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(ult(db).admissao_dias_teste, null);
  }
});
await ok("decisão (aprovar): copia o dia de teste da solicitação para candidatos_vagas e o e-mail ao RH mostra", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  sol(db, ID.S_PEND).admissao_dia_teste = "05/11 e 06/11";
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cvNovo.admissao_dia_teste, "05/11 e 06/11");
  const html = (db.emails ?? []).map((e: any) => e.html).join("\n");
  assert.match(html, /Dia\(s\) de teste/);
  assert.match(html, /05\/11 e 06\/11/);
});
await ok("decisão sem dia de teste: copia null e o e-mail não ganha a linha", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  assert.equal(r.status, 200);
  const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cvNovo.admissao_dia_teste ?? null, null);
  assert.doesNotMatch((db.emails ?? []).map((e: any) => e.html).join("\n"), /Dia\(s\) de teste/);
});
await ok("edição pelo cliente em indicação aprovada: salva na solicitação e propaga para candidatos_vagas", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_APROV }, corpo: { admissao_dia_teste: "07/11" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(sol(db, ID.S_APROV).admissao_dia_teste, "07/11");
  assert.equal(db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).admissao_dia_teste, "07/11");
});
await ok("edição em indicação pendente: altera só a solicitação (sem candidatura)", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { admissao_dia_teste: "05/11" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(sol(db, ID.S_PEND).admissao_dia_teste, "05/11");
});

await ok("schemas: admissao_dias_teste opcional/nullable nos dois schemas, recusa 3 dias e formato inválido", () => {
  const baseAv: any = { encaminhamento_id: "11111111-1111-4111-8111-111111111111", status: "aprovado", feedback_cliente: "ok" };
  const baseInd: any = { vaga_id: ID.V_MOT_A, candidato_nome: "A", candidato_telefone: "1" };
  for (const base of [baseAv, baseInd]) {
    const s = base === baseAv ? portalAvaliarSchema : portalIndicarCandidatoSchema;
    for (const v of [[D1], [], null, undefined]) assert.equal(s.safeParse({ ...base, admissao_dias_teste: v }).success, true);
    assert.equal(s.safeParse({ ...base, admissao_dias_teste: [D1, D2, { ...D1, data: "2026-11-09" }] }).success, false);
    assert.equal(s.safeParse({ ...base, admissao_dias_teste: "05/11" }).success, false);
  }
  assert.equal(portalEditarIndicacaoSchema.safeParse({ admissao_dias_teste: [D1] }).success, true);
});
await ok("decisão (aprovar): copia admissao_dias_teste (inclusive []) para candidatos_vagas, mantém o texto antigo e o e-mail mostra", async () => {
  for (const [dias, esperado] of [[[D1, D2], /05\/11\/2026 · 08:00 às 12:00 \(4h\)<br>06\/11\/2026/], [[], /Não houve/]] as const) {
    const db = novoDbIndicacao(); logar(db, "dir");
    sol(db, ID.S_PEND).admissao_dias_teste = dias;
    sol(db, ID.S_PEND).admissao_dia_teste = "texto legado";
    const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
    assert.deepEqual(cvNovo.admissao_dias_teste, dias);
    assert.equal(cvNovo.admissao_dia_teste, "texto legado");
    assert.match((db.emails ?? []).map((e: any) => e.html).join("\n"), esperado);
  }
});
await ok("decisão sem admissao_dias_teste (registro antigo): copia null e o e-mail não ganha a linha", async () => {
  const db = novoDbIndicacao(); logar(db, "dir");
  const r = await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } });
  const cvNovo = db.tabelas.candidatos_vagas.find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cvNovo.admissao_dias_teste ?? null, null);
  assert.doesNotMatch((db.emails ?? []).map((e: any) => e.html).join("\n"), /Dia\(s\) de teste/);
});
await ok("edição pelo cliente: troca de dias de teste propaga p/ candidatos_vagas; mesmo valor não gera alteração; [] difere de null", async () => {
  const db = novoDbIndicacao(); logarPortal(db, "cli");
  const r = await chamar(editar.PATCH, { metodo: "PATCH", params: { id: ID.S_APROV }, corpo: { admissao_dias_teste: [D1] } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(sol(db, ID.S_APROV).admissao_dias_teste, [D1]);
  assert.deepEqual(db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV).admissao_dias_teste, [D1]);
  assert.equal(calcularDiff({ admissao_dias_teste: [D1] }, { admissao_dias_teste: [{ ...D1 }] }).length, 0);
  assert.equal(calcularDiff({ admissao_dias_teste: null }, { admissao_dias_teste: [] }).length, 1);
  assert.equal(formatarValorAviso("admissao_dias_teste", [D1, D2], "depois"), "05/11/2026 · 08:00 às 12:00 (4h); 06/11/2026 · 22:00 às 06:00 (8h)");
  assert.equal(formatarValorAviso("admissao_dias_teste", [], "depois"), "Não houve");
});
await ok("avaliação do portal (aprovar): MOT sem resposta → 400 sem gravar; com [] ou dias → grava admissao_dias_teste; R&S ignora", async () => {
  const montar = (vagaId: string) => {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    db.tabelas.encaminhamentos = [{ id: "11111111-1111-4111-8111-111111111111", candidato_id: ID.CAND, vaga_id: vagaId, cliente_id: "C1", status: "aguardando" }];
    return db;
  };
  const chamarAv = (db: any, extra: any) => chamar(avaliar.PATCH, { metodo: "PATCH", corpo: { encaminhamento_id: "11111111-1111-4111-8111-111111111111", status: "aprovado", feedback_cliente: "ok", cv_id: ID.CV, ...extra } });
  const cv = (db: any) => db.tabelas.candidatos_vagas.find((c: any) => c.id === ID.CV);

  let db = montar(ID.V_MOT_A);
  let r = await chamarAv(db, { admissao_salario: 1500 });
  assert.equal(r.status, 400, JSON.stringify(r.corpo));
  assert.equal(r.corpo.error, "Informe se houve dia(s) de teste.");
  assert.equal(db.tabelas.encaminhamentos[0].status, "aguardando", "avaliação não pode ficar pela metade");

  for (const dias of [[], [D1, D2]]) {
    db = montar(ID.V_MOT_A);
    r = await chamarAv(db, { admissao_dias_teste: dias, admissao_dia_teste: "texto antigo" });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(cv(db).admissao_dias_teste, dias);
    assert.notEqual(cv(db).admissao_dia_teste, "texto antigo", "texto antigo não é mais gravado");
  }

  db = montar(ID.V_RS);
  r = await chamarAv(db, { admissao_dias_teste: [D1] });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(cv(db).admissao_dias_teste ?? null, null);
});

console.log(`\n${n} verificações OK`);
