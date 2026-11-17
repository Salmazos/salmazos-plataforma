// Jornada de trabalho com compensação de horas: "Segunda a sexta-feira", "Segunda a quinta-feira + sexta reduzida" e "Segunda a sexta-feira + sábado
// reduzido", com o texto padrão gerado por um módulo único (src/lib/jornadaTrabalho.ts) e aceito pelos validadores. As escalas e os textos antigos
// (todas as grafias) continuam valendo e caem em "Personalizado"/texto livre. Rotas reais contra o banco em memória do harness; nada toca produção.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-jornada-trabalho.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID } from "./harness-mot/ambiente-indicacao.mjs";
import {
  HORAS_JORNADA_VAZIAS, MODELOS_JORNADA, ROTULO_JORNADA, ehTextoJornadaPadrao, gerarTextoJornada, horaParaInput, interpretarTextoJornada, modeloDoRotulo, normalizarHora,
} from "../src/lib/jornadaTrabalho";
import {
  ESCALAS_JORNADA, ESCALA_OPCOES_MOT, ESCALAS_VALIDAS, TURNO_OPCOES, TURNO_OPCOES_MOT, erroEscala, erroHorario, escalaValida, validarCamposAdmissao,
} from "../src/lib/admissaoCamposPadrao";
import { faltandoObrigatorios } from "../src/lib/admissaoObrigatorios";
import { HORARIO_TIPOS, HORARIO_VAZIO, gerarHorarioTexto } from "../src/lib/solicitacaoVagaCampos";
import { LIMITES_CAMPOS_EMAIL, sanitizarCampoEmail } from "../src/lib/emailPacoteContabilidade";
import { PdfWriter } from "../src/lib/pdfWriter";
import { admissaoCreateSchema, funcionarioCreateSchema, parseBody, publicoSolicitarVagaSchema } from "../src/lib/schemas";
import CamposAdmissaoPadrao from "../src/components/CamposAdmissaoPadrao";
import CamposHorasJornada from "../src/components/CamposHorasJornada";
import BotaoUsarModeloJornada from "../src/components/BotaoUsarModeloJornada";
import SeletorHorarioIniciarAdmissao from "../src/components/admissao/SeletorHorarioIniciarAdmissao";

const req = createRequire(import.meta.url);
const { renderToStaticMarkup } = req("react-dom/server");
const React = req("react");
const render = (el: unknown) => renderToStaticMarkup(el);
const lerFonte = (caminho: string) => fs.readFileSync(caminho, "utf8");

congelarData();
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const MOT = "mao_obra_temporaria", RS = "recrutamento_selecao", TERC = "terceirizacao";

const TXT_BASE = "Segunda a sexta-feira, das 08h00 às 17h00";
const TXT_A = "Segunda a quinta-feira, das 08h00 às 17h00; sexta-feira, até as 16h00";
const TXT_B = "Segunda a sexta-feira, das 08h00 às 17h00; sábado, das 08h00 às 12h00";
const ROT_BASE = "Segunda a sexta-feira", ROT_A = "Segunda a quinta-feira + sexta reduzida", ROT_B = "Segunda a sexta-feira + sábado reduzido";

// Valores REAIS já gravados hoje (todas as grafias): continuam válidos e nunca são reconhecidos como o texto padrão.
const ANTIGOS = [
  "Segunda a Sexta, 07h00 às 17h00", "Segunda a sexta das 07h00 às 17h00", "Segunda à quinta das 07h00 às 17h00 e sexta das 07h00 às 16h00",
  "Segunda a Quinta, 07h00 às 17h00 | Sexta, 07h00 às 16h00", "Segunda a quinta das 07h00 às 17:00 e sexta das 07h00  às 16h00", "Escala 6x2, das 14h00 às 22h00",
  "Segunda a sábado das 06h00 às 14h20, intervalo de 1:00", "8h00 às 17h00 e sábado das 8h00 às 12h00", "07:30 às 17:30 e sexta 07:30 às 16:30", "A combinar", "Turno B, 14h00 às 22h00",
  "Segunda à quinta-feira das 14h20 às 23h10; sexta-feira das 14h20 às 22h35; sábado das 14h2", "Horário administrativo",
];

// ── Módulo ───────────────────────────────────────────────────────────────────
await ok("textos EXATOS: segunda a sexta-feira; (A) sexta reduzida; (B) sábado reduzido — com a grafia 'sexta-feira'/'sábado'", () => {
  assert.equal(gerarTextoJornada("seg_sex", { entrada: "08:00", saida: "17:00" }), TXT_BASE);
  assert.equal(gerarTextoJornada("seg_qui_sex_reduzida", { entrada: "08:00", saida: "17:00", sextaSaida: "16:00" }), TXT_A);
  assert.equal(gerarTextoJornada("seg_sex_sab_reduzido", { entrada: "08:00", saida: "17:00", sabadoEntrada: "08:00", sabadoSaida: "12:00" }), TXT_B);
  for (const t of [TXT_BASE, TXT_A, TXT_B]) { assert.match(t, /sexta-feira/); assert.equal(/Sexta|SEXTA|sexta\b(?!-)/.test(t.replace(/Segunda a quinta-feira/, "")), false, t); }
});

await ok("rótulos das listas: 'Segunda a sexta-feira', '+ sexta reduzida', '+ sábado reduzido'", () => {
  assert.deepEqual(MODELOS_JORNADA.map((m) => ROTULO_JORNADA[m]), [ROT_BASE, ROT_A, ROT_B]);
  assert.deepEqual(ESCALAS_JORNADA, [ROT_BASE, ROT_A, ROT_B]);
  assert.equal(modeloDoRotulo(ROT_A), "seg_qui_sex_reduzida"); assert.equal(modeloDoRotulo("6x1"), null); assert.equal(modeloDoRotulo(null), null);
});

await ok("horas e intervalo vêm dos campos (nada fixo): outras horas, formatos 08:00/08h00/8h00, intervalo; incompleto = vazio", () => {
  assert.equal(gerarTextoJornada("seg_sex", { entrada: "7h30", saida: "17h18" }), "Segunda a sexta-feira, das 07h30 às 17h18");
  assert.equal(gerarTextoJornada("seg_sex", { entrada: "07:00", saida: "17:00", intervalo: "intervalo de 1h" }), "Segunda a sexta-feira, das 07h00 às 17h00 (intervalo de 1h)");
  assert.equal(gerarTextoJornada("seg_qui_sex_reduzida", { entrada: "06:30", saida: "16:30", sextaSaida: "15:30", intervalo: "sem intervalo" }), "Segunda a quinta-feira, das 06h30 às 16h30; sexta-feira, até as 15h30 (sem intervalo)");
  assert.equal(gerarTextoJornada("seg_qui_sex_reduzida", { entrada: "08:00", saida: "17:00" }), "", "falta a sexta");
  assert.equal(gerarTextoJornada("seg_sex_sab_reduzido", { entrada: "08:00", saida: "17:00", sabadoEntrada: "08:00" }), "", "falta a saída de sábado");
  assert.equal(gerarTextoJornada("seg_sex", { ...HORAS_JORNADA_VAZIAS }), "");
  assert.deepEqual([normalizarHora("08:00"), normalizarHora("8h05"), normalizarHora("08h00"), normalizarHora("25:00"), normalizarHora("abc"), normalizarHora("")], ["08h00", "08h05", "08h00", "", "", ""]);
  assert.equal(horaParaInput("08h00"), "08:00");
});

await ok("ida e volta: o texto padrão é interpretado de volta com as mesmas horas (e o intervalo)", () => {
  for (const [modelo, h] of [
    ["seg_sex", { entrada: "08:00", saida: "17:00" }], ["seg_qui_sex_reduzida", { entrada: "07:00", saida: "17:00", sextaSaida: "16:00", intervalo: "intervalo de 1h15" }],
    ["seg_sex_sab_reduzido", { entrada: "08:00", saida: "18:00", sabadoEntrada: "08:00", sabadoSaida: "12:00" }],
  ] as const) {
    const texto = gerarTextoJornada(modelo, h);
    const volta = interpretarTextoJornada(texto)!;
    assert.equal(volta.modelo, modelo, texto);
    assert.equal(gerarTextoJornada(volta.modelo, volta), texto, "regerar dá o mesmo texto");
  }
  assert.deepEqual(interpretarTextoJornada(TXT_A), { modelo: "seg_qui_sex_reduzida", entrada: "08h00", saida: "17h00", sextaSaida: "16h00", intervalo: "" });
});

await ok("valor ANTIGO (todas as grafias) nunca é reconhecido como padrão: cai em 'Personalizado'/texto livre, intacto", () => {
  for (const v of ANTIGOS) assert.equal(interpretarTextoJornada(v), null, v);
  for (const v of ["Segunda a sexta-feira, das 08h00 às 25h00", "segunda a sexta-feira, das 08h00 às 17h00", "Segunda a sexta-feira das 08h00 às 17h00", `${TXT_A} extra`, "", null, undefined]) assert.equal(ehTextoJornadaPadrao(v as never), false, String(v));
});

// ── Validadores ──────────────────────────────────────────────────────────────
await ok("erroHorario/erroEscala: aceitam os 3 textos e as 3 escalas novas; recusam lixo; formatos antigos seguem válidos", () => {
  for (const t of [TXT_BASE, TXT_A, TXT_B, `${TXT_A} (intervalo de 1h)`, "Turno B, 14h00 às 22h00", "Horário Administrativo, 07h30 às 17h30"]) assert.equal(erroHorario(t), null, t);
  for (const t of ["das 8 às 17", "Segunda a sexta-feira, das 08h00 às 25h00", "Segunda a quinta-feira, das 08h00 às 17h00; sexta-feira, das 08h00 às 16h00", "qualquer coisa", "Segunda a sexta"]) assert.notEqual(erroHorario(t), null, t);
  for (const e of [ROT_BASE, ROT_A, ROT_B, "6x1", "6x2", "12x36 - Dia", "12x36 - Noite", "Fixa", "5x2"]) assert.equal(escalaValida(e), true, e);
  for (const e of ["Segunda a sexta", "Segunda a quinta-feira + sexta", "5 por 2"]) assert.notEqual(erroEscala(e), null, e);
  assert.deepEqual(ESCALAS_VALIDAS.slice(0, 5), ["6x1", "6x2", "12x36 - Dia", "12x36 - Noite", "Fixa"], "as escalas atuais continuam na frente, na mesma ordem");
  assert.deepEqual(ESCALA_OPCOES_MOT, ["6x1", "6x2", "12x36 - Dia", "12x36 - Noite", "Fixa", ROT_BASE, ROT_A, ROT_B, "Outro"]);
});

await ok("coerência: escala de jornada exige o horário padrão DELA; turno separado e sem prefixo no horário; formato antigo continua exigindo turno igual", () => {
  const val = (c: Record<string, string | null>) => validarCamposAdmissao(c as never).map((e) => e.campo);
  assert.deepEqual(val({ admissao_escala: ROT_A, admissao_horario: TXT_A, admissao_turno: "Turno B" }), [], "turno B + horário sem prefixo de turno: vale");
  assert.deepEqual(val({ admissao_escala: ROT_B, admissao_horario: TXT_B, admissao_turno: "Turno A" }), []);
  assert.deepEqual(val({ admissao_escala: ROT_BASE, admissao_horario: TXT_BASE }), []);
  assert.deepEqual(val({ admissao_escala: ROT_A, admissao_horario: TXT_B }), ["admissao_horario"], "escala A com horário de B");
  assert.deepEqual(val({ admissao_escala: ROT_A, admissao_horario: "Turno B, 14h00 às 22h00" }), ["admissao_horario"], "escala de jornada com horário no formato antigo");
  assert.deepEqual(val({ admissao_escala: "6x1", admissao_horario: "Turno B, 14h00 às 22h00", admissao_turno: "Turno B" }), []);
  assert.deepEqual(val({ admissao_escala: "6x1", admissao_horario: "Turno B, 14h00 às 22h00", admissao_turno: "Turno A" }), ["admissao_horario"], "formato antigo: coerência horário x turno continua");
});

await ok("obrigatórios: o horário gerado satisfaz a exigência de horário; turno continua obrigatório no MOT e na Terceirização", () => {
  const mot = { admissao_data_inicio: "2026-11-02", admissao_funcao: "X", admissao_setor: "Y", admissao_centro_custo: "CC1", admissao_salario: 1800, admissao_escala: ROT_A, admissao_tempo_contrato: "90 dias", admissao_vt: true, admissao_exame_responsavel: "Z" };
  assert.deepEqual(faltandoObrigatorios(MOT, { ...mot, admissao_turno: "Turno B", admissao_horario: TXT_A }), []);
  assert.deepEqual(faltandoObrigatorios(MOT, { ...mot, admissao_horario: TXT_A }), ["Selecione o turno."], "turno continua obrigatório");
  assert.deepEqual(faltandoObrigatorios(MOT, { ...mot, admissao_turno: "Turno B", admissao_horario: null }), ["Informe o horário de entrada e saída."]);
  const terc = { admissao_data_inicio: "2026-11-02", admissao_funcao: "X", admissao_setor: "Y", admissao_centro_custo: "CC1", admissao_salario: 1800, admissao_vt: false, admissao_exame_responsavel: "Z" };
  assert.deepEqual(faltandoObrigatorios(TERC, { ...terc, admissao_turno: "Turno B", admissao_horario: TXT_B }), []);
  assert.deepEqual(faltandoObrigatorios(TERC, { ...terc, admissao_horario: TXT_B }), ["Selecione o turno."]);
});

// ── Indicações (rotas reais): com e sem vaga ─────────────────────────────────
const R = {
  criar: await importar("src/app/api/portal/indicar-candidato/route.ts"),
  minhasId: await importar("src/app/api/portal/minhas-indicacoes/[id]/route.ts"),
  analistaId: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/route.ts"),
};
const linhas = (db: any, t: string) => db.tabelas[t] ?? [];
const ultima = (db: any) => linhas(db, "solicitacoes_indicacao_candidato").at(-1);
function cenario() {
  const db = novoDbIndicacao();
  db.tabelas.vagas.forEach((v: any) => { v.num_posicoes = 2; v.num_posicoes_abertas = 2; });
  db.tabelas.cobrancas_rs = []; db.tabelas.comissao_lancamentos = [];
  return db;
}
const BASE_MOT = {
  admissao_data_inicio: "2026-11-02", admissao_setor: "Produção", admissao_centro_custo: "CC-0042", admissao_salario_hora: 18.5, admissao_turno: "Turno B", admissao_tempo_contrato: "90 dias",
  admissao_vt: true, admissao_exame_responsavel: "Clínica", admissao_qtd_dias_teste: 0,
};
const BASE_TERC = { admissao_data_inicio: "2026-11-02", admissao_setor: "Facilities", admissao_centro_custo: "CC-0042", admissao_salario: 1800, admissao_turno: "Turno B", admissao_vt: false, admissao_exame_responsavel: "RH", admissao_qtd_dias_teste: 1 };
const COM_VAGA_MOT = (extra: Record<string, unknown>) => ({ vaga_id: ID.V_MOT_A, candidato_nome: "Carla Dias", candidato_telefone: "(19) 96666-2222", admissao_funcao: "Operador", ...BASE_MOT, ...extra });
const SEM_VAGA = (tipo: string, extra: Record<string, unknown>) => ({ vaga_id: null, tipo_servico: tipo, candidato_nome: "Beatriz Lima", candidato_telefone: "(19) 97777-1111", admissao_funcao: "Auxiliar", ...(tipo === MOT ? BASE_MOT : BASE_TERC), ...extra });
const indicar = async (db: any, corpo: Record<string, unknown>) => {
  logar(db, "dir"); logarPortal(db, "cli");
  const antes = linhas(db, "solicitacoes_indicacao_candidato").length;
  const r = await chamar(R.criar.POST, { metodo: "POST", corpo });
  const nova = linhas(db, "solicitacoes_indicacao_candidato")[antes];
  if (r.status === 201 && nova) { nova.status ??= "pendente"; nova.created_at ??= "2026-10-07T12:00:00.000+00:00"; nova.updated_at ??= nova.created_at; }
  return r;
};
const ESCALA_HORARIO: [string, string][] = [[ROT_BASE, TXT_BASE], [ROT_A, TXT_A], [ROT_B, TXT_B]];

await ok("indicação COM vaga (MOT) aceita as 3 escalas novas com o horário padrão, sem prefixo de turno; grava escala, turno e horário", async () => {
  for (const [escala, horario] of ESCALA_HORARIO) {
    const db = cenario();
    const r = await indicar(db, COM_VAGA_MOT({ admissao_escala: escala, admissao_horario: horario }));
    assert.equal(r.status, 201, `${escala}: ${JSON.stringify(r.corpo)}`);
    const s = ultima(db);
    assert.deepEqual([s.admissao_escala, s.admissao_horario, s.admissao_turno], [escala, horario, "Turno B"]);
  }
});

await ok("indicação SEM vaga (MOT e Terceirização) aceita as escalas novas; Terceirização usa a jornada como opcional (sem escala = como sempre)", async () => {
  for (const [escala, horario] of ESCALA_HORARIO) {
    const mot = cenario();
    const r1 = await indicar(mot, SEM_VAGA(MOT, { admissao_escala: escala, admissao_horario: horario }));
    assert.equal(r1.status, 201, `MOT ${escala}: ${JSON.stringify(r1.corpo)}`);
    assert.deepEqual([ultima(mot).vaga_id, ultima(mot).admissao_escala, ultima(mot).admissao_horario], [null, escala, horario]);
    const terc = cenario();
    const r2 = await indicar(terc, SEM_VAGA(TERC, { admissao_escala: escala, admissao_horario: horario }));
    assert.equal(r2.status, 201, `TERC ${escala}: ${JSON.stringify(r2.corpo)}`);
    assert.equal(ultima(terc).admissao_escala, escala);
  }
  const comum = cenario();
  assert.equal((await indicar(comum, SEM_VAGA(TERC, { admissao_horario: "Turno B, 14h00 às 22h00" }))).status, 201, "Terceirização sem escala: formato antigo");
  assert.equal(ultima(comum).admissao_escala ?? null, null);
});

await ok("indicação com lixo ou incoerência é RECUSADA (400): horário fora do padrão, escala x horário trocados, formato antigo com escala de jornada", async () => {
  const casos: Record<string, unknown>[] = [
    { admissao_escala: ROT_A, admissao_horario: "Segunda a quinta das 08h00 às 17h00 e sexta das 08h00 às 16h00" },
    { admissao_escala: ROT_A, admissao_horario: TXT_B }, { admissao_escala: ROT_B, admissao_horario: TXT_BASE },
    { admissao_escala: ROT_A, admissao_horario: "Turno B, 08h00 às 17h00" }, { admissao_escala: "6x1", admissao_horario: "das 8 às 17" },
    { admissao_escala: "Segunda a sexta", admissao_horario: TXT_BASE },
  ];
  for (const c of casos) {
    assert.equal((await indicar(cenario(), COM_VAGA_MOT(c))).status, 400, `com vaga ${JSON.stringify(c)}`);
    assert.equal((await indicar(cenario(), SEM_VAGA(MOT, c))).status, 400, `sem vaga ${JSON.stringify(c)}`);
  }
});

await ok("sem vaga: escala de jornada sem as horas (horário vazio) = 400 'Informe o horário'; turno continua obrigatório (sem turno = 400)", async () => {
  const r = await indicar(cenario(), SEM_VAGA(MOT, { admissao_escala: ROT_A, admissao_horario: null }));
  assert.equal(r.status, 400); assert.ok(String(r.corpo.error).includes("Informe o horário de entrada e saída."));
  const r2 = await indicar(cenario(), SEM_VAGA(MOT, { admissao_escala: ROT_A, admissao_horario: TXT_A, admissao_turno: undefined }));
  assert.equal(r2.status, 400); assert.ok(String(r2.corpo.error).includes("Selecione o turno."));
});

await ok("indicação com escalas e horários ANTIGOS (6x1/6x2/5x2 e 'Turno X, ...') continua aceita, com e sem vaga", async () => {
  for (const [escala, horario, turno] of [["6x1", "Turno B, 14h00 às 22h00", "Turno B"], ["6x2", "Turno A, 06h00 às 14h00", "Turno A"], ["5x2", "Horário Administrativo, 07h30 às 17h30", "Horário Administrativo"]] as const) {
    assert.equal((await indicar(cenario(), COM_VAGA_MOT({ admissao_escala: escala, admissao_horario: horario, admissao_turno: turno }))).status, 201, escala);
    assert.equal((await indicar(cenario(), SEM_VAGA(MOT, { admissao_escala: escala, admissao_horario: horario, admissao_turno: turno }))).status, 201, `sem vaga ${escala}`);
  }
});

await ok("EDIÇÃO: o cliente e o analista trocam para a escala nova com o horário padrão; formato antigo segue editável; incoerência = 400", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA(MOT, { admissao_escala: "6x1", admissao_horario: "Turno B, 14h00 às 22h00" }));
  const id = ultima(db).id;
  logar(db, "dir"); logarPortal(db, "cli");
  const cliente = (corpo: Record<string, unknown>) => chamar(R.minhasId.PATCH, { metodo: "PATCH", params: { id }, corpo });
  assert.equal((await cliente({ admissao_escala: ROT_A, admissao_horario: TXT_A })).status, 200);
  assert.deepEqual([ultima(db).admissao_escala, ultima(db).admissao_horario], [ROT_A, TXT_A]);
  assert.equal((await cliente({ admissao_horario: TXT_B })).status, 400, "horário de B com escala A");
  assert.equal((await cliente({ admissao_escala: ROT_B, admissao_horario: TXT_B })).status, 200);
  assert.equal((await cliente({ admissao_escala: "6x2", admissao_horario: "Turno B, 14h00 às 22h00" })).status, 200, "volta ao formato antigo");
  logar(db, "dir");
  const analista = (corpo: Record<string, unknown>) => chamar(R.analistaId.PATCH, { metodo: "PATCH", params: { id }, corpo });
  assert.equal((await analista({ admissao_escala: ROT_BASE, admissao_horario: TXT_BASE })).status, 200);
  assert.equal((await analista({ admissao_escala: ROT_A, admissao_horario: "Turno B, 08h00 às 17h00" })).status, 400);
});

// ── Valores antigos de cada coluna continuam válidos ─────────────────────────
await ok("DOIS textos antigos de CADA coluna continuam aceitos pelos schemas (admissões, funcionários, solicitações públicas, indicações)", () => {
  const admissao = (h: string) => parseBody(admissaoCreateSchema, { candidato_id: ID.CAND, modalidade: "mot", funcao: "X", salario: 1500, tipo_salario: "mensal", horario_trabalho: h, data_admissao: "2026-11-02", entidade_contratante: "x" });
  for (const h of ANTIGOS.slice(0, 2)) { const r = admissao(h); assert.equal(r.success || !/horario/i.test(String((r as any).error ?? "")), true, `admissoes: ${h}: ${(r as any).error}`); }
  for (const h of ["Escala 6x2, das 14h00 às 22h00", "Segunda à quinta das 07h00 às 17h00 e sexta das 07h00 às 16h00"]) {
    const r = parseBody(funcionarioCreateSchema, { nome: "Fulano", horario_trabalho: h } as never);
    assert.equal(r.success || !/horario/i.test(String((r as any).error ?? "")), true, `funcionarios: ${h}: ${(r as any).error}`);
  }
  for (const h of ["Segunda a Sexta, 07h00 às 17h00 (intervalo de 1h)", "A combinar"]) {
    const r = parseBody(publicoSolicitarVagaSchema, { horario_tipo: "seg_sex", horario_texto: h } as never);
    assert.equal(r.success || !/horario/i.test(String((r as any).error ?? "")), true, `solicitacoes: ${h}: ${(r as any).error}`);
  }
  for (const h of ["Turno B, 14h00 às 22h00", "Turno D, 06h00 às 14h00"]) assert.equal(erroHorario(h), null, `indicações: ${h}`);
  // vagas.horario é texto livre sem validador: o gerador do ModalNovaVaga só ganhou chips; os antigos seguem gerando o mesmo texto
  const m = lerFonte("src/components/ModalNovaVaga.tsx");
  assert.ok(m.includes('"Segunda a Sexta"') && m.includes('"Escala 6x1"') && m.includes('"Disponibilidade para turnos"'));
});

// ── Solicitar Vaga (portal, link público, templates) ─────────────────────────
await ok("Solicitar Vaga: 'Segunda a Sexta' e as escalas atuais intactas; ganha os 2 tipos com compensação; textos gerados pelo módulo único (intervalo incluído)", () => {
  assert.deepEqual(HORARIO_TIPOS.map((t) => t.id), ["seg_sex", "seg_qui_sex_reduzida", "seg_sex_sab_reduzido", "6x1", "6x2", "12x36", "turno_fixo", "a_combinar", "personalizado"]);
  assert.equal(HORARIO_TIPOS.find((t) => t.id === "seg_sex")!.label, "Segunda a Sexta");
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "seg_sex", entrada: "08:00", saida: "17:00", intervalo: "1h" }), "Segunda a Sexta, 08h00 às 17h00 (intervalo de 1h)", "o antigo não mudou");
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "seg_qui_sex_reduzida", entrada: "08:00", saida: "17:00", sextaSaida: "16:00" }), TXT_A);
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "seg_sex_sab_reduzido", entrada: "08:00", saida: "17:00", sabadoEntrada: "08:00", sabadoSaida: "12:00" }), TXT_B);
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "seg_qui_sex_reduzida", entrada: "08:00", saida: "17:00", sextaSaida: "16:00", intervalo: "1h15" }), `${TXT_A} (intervalo de 1h15)`);
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "seg_qui_sex_reduzida", entrada: "08:00", saida: "17:00" }), "", "sem a sexta = incompleto");
  assert.equal(gerarHorarioTexto({ ...HORARIO_VAZIO, tipo: "6x2", entrada: "14:00", saida: "22:00" }), "Escala 6x2, 14h00 às 22h00");
  const portal = lerFonte("src/app/portal/(app)/solicitar-vaga/page.tsx");
  assert.ok(portal.includes("seg_qui_sex_reduzida") && portal.includes("CamposHorasJornada") && portal.includes("gerarTextoJornada"));
  assert.ok(portal.includes("sexta_saida: horSextaSaida") && portal.includes("sabado_entrada: horSabadoEntrada"), "o padrão do cliente/template guarda as horas novas");
  const publico = lerFonte("src/components/solicitacao-publica/EtapaVaga.tsx");
  assert.ok(publico.includes('"seg_qui_sex_reduzida", "seg_sex_sab_reduzido"') && publico.includes("CamposHorasJornada"));
  const schemas = lerFonte("src/lib/schemas.ts");
  assert.ok(schemas.includes("sexta_saida: z.string()") && schemas.includes("sabado_entrada: z.string()"), "o zod não descarta as horas novas do horario_padrao");
});

// ── Telas (SSR) ──────────────────────────────────────────────────────────────
const campos = (tipo: string, valores = {}) => render(React.createElement(CamposAdmissaoPadrao, { tipoServico: tipo, valores, onChange: () => {} }));
await ok("Indicar/Avaliar/edição/Completar dados (CamposAdmissaoPadrao): MOT tem as 3 opções na Escala (e as atuais); Terceirização ganha a jornada opcional; R&S não muda", () => {
  const mot = campos(MOT);
  for (const o of [ROT_BASE, ROT_A, ROT_B, "6x1", "6x2", "12x36 - Dia", "12x36 - Noite", "Fixa", "Outro"]) assert.ok(mot.includes(`>${o}</option>`), `MOT: ${o}`);
  const terc = campos(TERC);
  for (const o of [ROT_BASE, ROT_A, ROT_B, "Horário padrão (turno + entrada e saída)"]) assert.ok(terc.includes(`>${o}</option>`), `TERC: ${o}`);
  assert.ok(terc.includes("Escala 6x1") && terc.includes("Escala Fixa"), "o turno da Terceirização não mudou");
  assert.equal(campos(RS).includes("Jornada"), false); assert.equal(campos(RS).includes(ROT_A), false);
  // turno continua sendo o campo de turno (listas intactas)
  assert.deepEqual(TURNO_OPCOES_MOT, ["Turno A", "Turno B", "Turno C", "Turno D", "Horário Administrativo", "Outro"]);
  assert.equal(TURNO_OPCOES.includes("Escala 6x1"), true);
});

await ok("com a escala escolhida aparecem as horas extras certas: A = saída de sexta; B = entrada e saída de sábado; base = nenhuma", () => {
  const h = (modelo: any) => render(React.createElement(CamposHorasJornada, { modelo, horas: {}, onChange: () => {} }));
  assert.ok(h("seg_qui_sex_reduzida").includes("Sexta-feira: saída") && !h("seg_qui_sex_reduzida").includes("Sábado"));
  const b = h("seg_sex_sab_reduzido"); assert.ok(b.includes("Sábado: entrada") && b.includes("Sábado: saída") && !b.includes("Sexta-feira"));
  assert.equal(h("seg_sex"), ""); assert.equal(h(null), "");
  // valor já salvo reabre com as horas: escala A + horário A => campo de sexta preenchido
  const aberto = campos(MOT, { admissao_escala: ROT_A, admissao_horario: TXT_A, admissao_turno: "Turno B" });
  assert.ok(aberto.includes("Sexta-feira: saída") && aberto.includes('value="16:00"') && aberto.includes('value="08:00"') && aberto.includes('value="17:00"'));
  // formato antigo reabre como sempre (entrada/saída do 'Turno X, ...'); escala antiga não mostra campos novos
  const antigo = campos(MOT, { admissao_escala: "6x1", admissao_horario: "Turno B, 14h00 às 22h00", admissao_turno: "Turno B" });
  assert.ok(antigo.includes('value="14:00"') && antigo.includes('value="22:00"') && !antigo.includes("Sexta-feira: saída"));
});

await ok("Iniciar Admissão: chips 'Segunda a sexta', sábado, todos os dias e as escalas intactos + as 2 jornadas com compensação; exceção da sexta continua; texto padrão reabre no chip", () => {
  const html = (value: string) => render(React.createElement(SeletorHorarioIniciarAdmissao, { value, onChange: () => {} }));
  const vazio = html("");
  for (const c of ["Segunda a sexta", "Segunda a sábado", "Todos os dias", "Escala 6x1", "Escala 6x2", "Escala 12x36", "Personalizado", ROT_A, ROT_B]) assert.ok(vazio.includes(`>${c}</button>`), c);
  const reaberto = html(TXT_A);
  assert.ok(reaberto.includes('value="08:00"') && reaberto.includes('value="17:00"') && reaberto.includes('value="16:00"') && reaberto.includes("Sexta-feira: saída") && reaberto.includes(TXT_A), "texto padrão volta preenchido");
  const antigo = html("Segunda à quinta das 07h00 às 17h00 e sexta das 07h00 às 16h00");
  assert.ok(antigo.includes("<textarea") && !antigo.includes("Sexta-feira: saída"), "valor antigo cai em Personalizado, intacto");
  const fonte = lerFonte("src/components/admissao/SeletorHorarioIniciarAdmissao.tsx");
  assert.ok(fonte.includes("+ Horário diferente para outro dia (ex: sexta)") && fonte.includes("ULTIMO_DIA_FAIXA"), "a exceção atual não foi removida");
});

await ok("ModalNovaVaga e ModalEditarVaga: chips atuais intactos + 2 chips com compensação, texto pelo módulo único; 'Outros' (texto livre) continua", () => {
  for (const f of ["src/components/ModalNovaVaga.tsx", "src/components/ModalEditarVaga.tsx"]) {
    const s = lerFonte(f);
    for (const c of ['"Segunda a Sexta"', '"Escala 6x1"', '"Escala 6x2"', '"Escala 12x36"', '"Disponibilidade para turnos"', '"Disponibilidade para fins de semana"', "ROTULO_JORNADA.seg_qui_sex_reduzida", "ROTULO_JORNADA.seg_sex_sab_reduzido"]) assert.ok(s.includes(c), `${f}: ${c}`);
    assert.ok(s.includes("gerarTextoJornada(modeloJornada") && s.includes("CamposHorasJornada") && s.includes("Outros (ex: Plantão noturno"), f);
  }
});

await ok("PortalAvaliacaoBtn (Avaliar): as 3 opções entram pela mesma lista, com as horas extras e o horário padrão; turno segue separado", () => {
  const s = lerFonte("src/components/PortalAvaliacaoBtn.tsx");
  assert.ok(s.includes("ESCALA_OPCOES_MOT.map") && s.includes("CamposHorasJornada") && s.includes("gerarTextoJornada(modeloEscala"));
  assert.ok(s.includes("Jornada com compensação (opcional)") && s.includes('admissao_escala: isMOT ? (escalaFinal || null) : isTerc && modeloEscala ? escalaFinal : null'));
  assert.ok(s.includes("TURNO_OPCOES_MOT.map") && s.includes("TURNO_OPCOES.map"), "turno continua sendo o seu campo");
});

// ── Telas de texto livre: botão "Usar modelo" ────────────────────────────────
await ok("botão 'Usar modelo': fechado só mostra o botão; aberto oferece os 3 modelos e gera o texto padrão; o campo de texto continua como era", () => {
  const fechado = render(React.createElement(BotaoUsarModeloJornada, { onAplicar: () => {} }));
  assert.ok(fechado.includes("+ Usar modelo") && !fechado.includes("<select"));
  const src = lerFonte("src/components/BotaoUsarModeloJornada.tsx");
  for (const m of MODELOS_JORNADA) assert.ok(src.includes("MODELOS_JORNADA.map") && ROTULO_JORNADA[m]);
  assert.ok(src.includes("gerarTextoJornada(modelo, horas)") && src.includes("onAplicar(texto)"));
  for (const [arquivo, antigo] of [
    ["src/components/AdmissaoDetalheClient.tsx", 'atualizarCampoDadosAdmissao("horario", e.target.value)} className="input-field text-sm" />'],
    ["src/components/ModalEditarFuncionario.tsx", 'placeholder="Ex: 06h às 15h"'],
    ["src/components/FormularioEdicaoSolicitacao.tsx", 'onChange={(e) => set("horario_texto", e.target.value)} className={inputCls} />'],
  ] as const) {
    const s = lerFonte(arquivo);
    assert.ok(s.includes(antigo), `${arquivo}: o campo de texto atual segue igual`);
    assert.ok(s.includes("<BotaoUsarModeloJornada"), `${arquivo}: botão presente`);
  }
});

await ok("botão 'Usar modelo' ABERTO: oferece os 3 modelos, entrada e saída e as horas do modelo (sexta no 1º modelo composto); sem horas completas não aplica", () => {
  const aberto = render(React.createElement(BotaoUsarModeloJornada, { onAplicar: () => {}, abertoInicial: true }));
  for (const m of MODELOS_JORNADA) assert.ok(aberto.includes(`>${ROTULO_JORNADA[m]}</option>`), ROTULO_JORNADA[m]);
  assert.ok(aberto.includes("Entrada") && aberto.includes("Saída") && aberto.includes("Aplicar no campo") && /<button[^>]*disabled=""[^>]*>Aplicar no campo/.test(aberto), "botão Aplicar desabilitado sem horas");
  assert.equal(aberto.includes("Texto:"), false, "sem horas, nenhuma prévia");
});

// ── E-mail da contabilidade e PDF ────────────────────────────────────────────
await ok("e-mail da contabilidade: os textos (inclusive com intervalo) cabem nos 200 caracteres e saem sem corte", () => {
  assert.equal(LIMITES_CAMPOS_EMAIL.horario, 200);
  const longos = [
    gerarTextoJornada("seg_qui_sex_reduzida", { entrada: "17:00", saida: "02:30", sextaSaida: "00:04", intervalo: "intervalo de 12h00 às 13h00" }),
    gerarTextoJornada("seg_sex_sab_reduzido", { entrada: "14:20", saida: "23:10", sabadoEntrada: "14:20", sabadoSaida: "22:35", intervalo: "intervalo de 12h00 às 13h00" }),
    TXT_A, TXT_B, TXT_BASE,
  ];
  for (const t of longos) { assert.ok(t.length < 120, `${t.length}: ${t}`); assert.equal(sanitizarCampoEmail(t, LIMITES_CAMPOS_EMAIL.horario), t, t); }
});

await ok("PDF da admissão: o texto longo QUEBRA LINHA no campo (não corta nem estoura): 3 colunas, coluna estreita e texto completo gravado", async () => {
  const doc = await PDFDocument.create();
  const w = await PdfWriter.create(doc);
  const longo = gerarTextoJornada("seg_sex_sab_reduzido", { entrada: "14:20", saida: "23:10", sabadoEntrada: "14:20", sabadoSaida: "22:35", intervalo: "intervalo de 12h00 às 13h00" });
  w.y = 700;
  const curto = 700;
  w.formFieldRow([{ label: "Salário", value: "R$ 2.500,00" }, { label: "Horário de trabalho", value: "Turno B, 14h00 às 22h00" }, { label: "Data de admissão", value: "02/11/2026" }]);
  const quedaCurta = curto - w.y;
  w.y = 700;
  w.formFieldRow([{ label: "Salário", value: "R$ 2.500,00" }, { label: "Horário de trabalho", value: longo }, { label: "Data de admissão", value: "02/11/2026" }]);
  const quedaLonga = 700 - w.y;
  assert.ok(quedaLonga > quedaCurta, `o texto longo ocupa mais linhas (${quedaLonga} > ${quedaCurta}): quebrou em vez de cortar`);
  const bytes = await doc.save();
  assert.ok(bytes.length > 500);
  const pdfSrc = lerFonte("src/lib/admissaoDocumentosPdf.ts");
  assert.ok(pdfSrc.includes('{ label: "Horário de trabalho", value: d.horario_trabalho }'), "os dois pontos do PDF seguem lendo o mesmo campo");
});

console.log(`\n${n} verificações OK`);
