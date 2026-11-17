// Indicação direta de candidato SEM vaga (Portal do Cliente): o cliente indica mesmo sem vaga aberta ("A Salmazos direciona"); o analista
// direciona para uma vaga existente ou cria a vaga a partir da indicação, e a aprovação segue o fluxo de sempre. Rotas reais contra o banco
// em memória do harness; nada toca produção.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-indicacao-sem-vaga.mts (o env carrega os componentes de verdade para o teste do bloco)
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, logarPortal, importar, chamar, auditoria } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID, solicitacaoBase, emailsPara, sinos } from "./harness-mot/ambiente-indicacao.mjs";
import {
  MSG_SEM_VAGA_APROVAR, MSG_SEM_VAGA_INDISPONIVEL, avisoTaxaVagaCriada, dadosVagaDaIndicacao, ehErroSemVagaIndisponivel,
  indicacoesPendentesComMesmoTelefone, validarDirecionamento,
} from "../src/lib/indicacaoSemVaga";
import { TEMPO_CONTRATO_PADRAO } from "../src/lib/constants";

congelarData();
const R = {
  criar: await importar("src/app/api/portal/indicar-candidato/route.ts"),
  decisao: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts"),
  direcionar: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/direcionar/route.ts"),
  criarVaga: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/criar-vaga/route.ts"),
  elegiveis: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/vagas-elegiveis/route.ts"),
  analistaId: await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/route.ts"),
  analistaLista: await importar("src/app/api/solicitacoes-indicacao-candidato/route.ts"),
  minhas: await importar("src/app/api/portal/minhas-indicacoes/route.ts"),
  minhasId: await importar("src/app/api/portal/minhas-indicacoes/[id]/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const MOT = "mao_obra_temporaria", RS = "recrutamento_selecao", TERC = "terceirizacao";
const FIM_90 = "2027-01-31"; // início 2026-11-02 + 90 dias
const linhas = (db: any, t: string) => db.tabelas[t] ?? [];
const sol = (db: any, id: string) => linhas(db, "solicitacoes_indicacao_candidato").find((s: any) => s.id === id);

function cenario() {
  const db = novoDbIndicacao();
  // 2 posições: a contratação não fecha a vaga sozinha (nada de e-mail de fechamento automático nestes casos).
  db.tabelas.vagas.forEach((v: any) => { v.num_posicoes = 2; v.num_posicoes_abertas = 2; });
  db.tabelas.cobrancas_rs = [];
  db.tabelas.comissao_lancamentos = [];
  return db;
}
// Indicação SEM vaga agora traz o MESMO bloco "Dados para Admissão" do tipo escolhido (módulo admissaoObrigatorios.ts, exigido no servidor).
const BLOCO: Record<string, Record<string, unknown>> = {
  [RS]: { admissao_data_inicio: "2026-11-02", admissao_salario: 3500 },
  [MOT]: {
    admissao_data_inicio: "2026-11-02", admissao_setor: "Produção", admissao_centro_custo: "CC-0042", admissao_salario_hora: 18.5, admissao_horario: "Turno A, 08h00 às 17h00",
    admissao_turno: "Turno A", admissao_escala: "6x1", admissao_tempo_contrato: TEMPO_CONTRATO_PADRAO, admissao_vt: true, admissao_exame_responsavel: "Clínica MedTrab", admissao_qtd_dias_teste: 0,
  },
  [TERC]: {
    admissao_data_inicio: "2026-11-02", admissao_setor: "Facilities", admissao_centro_custo: "CC-0042", admissao_salario: 1800, admissao_horario: "Turno B, 08h00 às 17h00",
    admissao_turno: "Turno B", admissao_vt: false, admissao_exame_responsavel: "RH do cliente", admissao_qtd_dias_teste: 1,
  },
};
const semVagaDe = (tipo: string, extra: Record<string, unknown> = {}) => ({
  vaga_id: null, tipo_servico: tipo, candidato_nome: "Beatriz Lima", candidato_telefone: "(19) 97777-1111", admissao_funcao: "Auxiliar de produção", ...BLOCO[tipo], ...extra,
});
const SEM_VAGA = semVagaDe(MOT);
// Indicação ANTIGA (criada quando o sem vaga só pedia o mínimo): só tipo, função, nome e telefone. Simula apagando o bloco da linha recém-criada.
const COLUNAS_BLOCO = ["admissao_data_inicio", "admissao_salario", "admissao_salario_hora", "admissao_setor", "admissao_centro_custo", "admissao_horario", "admissao_turno", "admissao_escala", "admissao_tempo_contrato", "admissao_vt", "admissao_exame_responsavel", "admissao_qtd_dias_teste", "admissao_local_integracao"];
const COM_VAGA = { vaga_id: ID.V_MOT_A, candidato_nome: "Carla Dias", candidato_telefone: "(19) 96666-2222", admissao_funcao: "Operador", admissao_qtd_dias_teste: 0 };
// O memdb não aplica os DEFAULT do banco: simula status 'pendente' e created_at/updated_at (como o Postgres faria) na linha recém-criada.
const indicar = async (db: any, corpo: Record<string, unknown>, quem = "cli") => {
  logar(db, "dir"); logarPortal(db, quem);
  const antes = linhas(db, "solicitacoes_indicacao_candidato").length;
  const r = await chamar(R.criar.POST, { metodo: "POST", corpo });
  const nova = linhas(db, "solicitacoes_indicacao_candidato")[antes];
  if (r.status === 201 && nova) { nova.status ??= "pendente"; nova.created_at ??= "2026-10-07T12:00:00.000+00:00"; nova.updated_at ??= nova.created_at; }
  return r;
};
const indicarAntiga = async (db: any, corpo: Record<string, unknown> = SEM_VAGA) => {
  const r = await indicar(db, corpo);
  const nova = ultima(db);
  for (const c of COLUNAS_BLOCO) nova[c] = null;
  return r;
};
const ultima = (db: any) => linhas(db, "solicitacoes_indicacao_candidato").at(-1);
// Sem vaga, sem candidato/candidatura/encaminhamento/admissão/cobrança/comissão: nada disso nasce da indicação.
const nadaDerivado = (db: any) => linhas(db, "candidatos_vagas").length === 2 && ["encaminhamentos", "admissoes", "cobrancas_rs", "comissao_lancamentos"].every((t) => linhas(db, t).length === 0);
const tocouTabela = (db: any, tabela: string) => db.consultas.some((c: any) => c.tabela === tabela);
const decidir = (db: any, id: string, corpo: Record<string, unknown>, quem = "dir") => { logar(db, quem); return chamar(R.decisao.POST, { metodo: "POST", params: { id }, corpo }); };
const direcionar = (db: any, id: string, vagaId: string, quem = "dir") => { logar(db, quem); return chamar(R.direcionar.POST, { metodo: "POST", params: { id }, corpo: { vaga_id: vagaId } }); };
const criarVaga = (db: any, id: string, corpo: Record<string, unknown> = {}, quem = "dir") => { logar(db, quem); return chamar(R.criarVaga.POST, { metodo: "POST", params: { id }, corpo }); };

await ok("regra pura: direcionar exige mesmo cliente, vaga aberta, mesmo tipo e mesma unidade; vaga criada é privada, aberta, 1 posição; duplicidade por dígitos", () => {
  const s = { status: "pendente", vaga_id: null, cliente_id: "C1", unidade_id: "U1", tipo_servico: MOT };
  const v = { id: "v", cliente_id: "C1", status: "aberta", tipo_servico: MOT, unidade_id: "U1" };
  assert.equal(validarDirecionamento(s, v), null);
  for (const [vaga, trecho] of [[{ ...v, cliente_id: "C2" }, /cliente/], [{ ...v, status: "fechada" }, /aberta/], [{ ...v, tipo_servico: RS }, /tipo de serviço/], [{ ...v, unidade_id: "U2" }, /unidade/], [null, /não encontrada/]] as const) {
    assert.match(validarDirecionamento(s, vaga as any) ?? "", trecho);
  }
  assert.equal(validarDirecionamento({ ...s, status: "aprovada" }, v), "Esta indicação já foi decidida.");
  assert.match(validarDirecionamento({ ...s, vaga_id: "x" }, v) ?? "", /já tem vaga/);
  const d = dadosVagaDaIndicacao({ titulo: "  Auxiliar ", tipoServico: MOT, clienteId: "C1", clienteNome: "Cliente Um", unidadeId: "U1", responsavel: "Olver", cidade: "Monte Mor" });
  assert.deepEqual([d.titulo, d.status, d.num_posicoes, d.num_posicoes_abertas, d.visivel_publicamente, d.responsavel, d.unidade_id], ["Auxiliar", "aberta", 1, 1, false, "Olver", "U1"]);
  assert.equal(avisoTaxaVagaCriada(RS) !== null && avisoTaxaVagaCriada(MOT) === null && avisoTaxaVagaCriada(TERC) === null, true);
  assert.deepEqual(indicacoesPendentesComMesmoTelefone([{ id: "a", candidato_telefone: "(19) 98765-4321" }, { id: "b", candidato_telefone: "11 90000-0000" }], "19987654321"), ["a"]);
  assert.deepEqual(indicacoesPendentesComMesmoTelefone([{ id: "a", candidato_telefone: "123" }], "123"), [], "telefone curto não gera aviso falso");
});

await ok("REGRESSÃO: indicação COM vaga grava como antes (sem colunas novas), 201, sino 'para a vaga', sem aviso de duplicidade", async () => {
  const db = cenario();
  const r = await indicar(db, COM_VAGA);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(r.corpo.aviso_duplicada, false);
  const s = ultima(db);
  assert.equal(s.vaga_id, ID.V_MOT_A);
  for (const c of ["tipo_servico", "sem_vaga_origem", "direcionada_em", "direcionamento_tipo"]) assert.equal(c in s, false, `não grava ${c} no caminho com vaga`);
  const sino = sinos(db).find((x: any) => x.tipo === "nova_indicacao_candidato");
  assert.match(sino.mensagem, /indicou Carla Dias para a vaga Operador A$/);
  // Vaga de outro cliente / fechada continuam recusadas.
  assert.equal((await indicar(db, { ...COM_VAGA, vaga_id: ID.V_OUTRO_CLIENTE })).status, 404);
  assert.equal((await indicar(db, { ...COM_VAGA, vaga_id: ID.V_FECHADA })).status, 409);
});

await ok("SEM vaga é aceita (mesmo com vagas abertas): vaga_id nulo, tipo e flag gravados, unidade do cliente, nada derivado criado, sino e e-mail próprios", async () => {
  const db = cenario();
  const r = await indicar(db, SEM_VAGA);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const s = ultima(db);
  assert.deepEqual([s.vaga_id, s.tipo_servico, s.sem_vaga_origem, s.status, s.cliente_id, s.unidade_id, s.admissao_funcao], [null, MOT, true, "pendente", "C1", "U1", "Auxiliar de produção"]);
  // O bloco "Dados para Admissão" é o mesmo da indicação com vaga: tudo que o cliente informou fica gravado (não fica mais para o analista completar).
  assert.deepEqual([s.admissao_salario_hora, s.admissao_horario, s.admissao_data_inicio, s.admissao_qtd_dias_teste, s.admissao_tempo_contrato, s.admissao_turno, s.admissao_escala],
    [18.5, "Turno A, 08h00 às 17h00", "2026-11-02", 0, TEMPO_CONTRATO_PADRAO, "Turno A", "6x1"]);
  assert.equal(nadaDerivado(db), true, "sem candidatura, encaminhamento, admissão, cobrança nem comissão");
  assert.equal(linhas(db, "candidatos").length, 2, "nenhum candidato criado");
  assert.equal(["cobrancas_rs", "comissao_lancamentos"].some((t) => tocouTabela(db, t)), false);
  const sino = sinos(db).find((x: any) => x.tipo === "nova_indicacao_candidato");
  assert.equal(sino.mensagem, "Cliente Um indicou Beatriz Lima, sem vaga: aguardando direcionamento");
  assert.equal(sino.solicitacao_indicacao_id, s.id);
  assert.ok(emailsPara(db).some((e: any) => /sem vaga/.test(e.subject)));
});

await ok("SEM vaga: tipo e cargo continuam obrigatórios (tipo inválido recusado); vaga_id ausente = sem vaga; observações são gravadas", async () => {
  const db = cenario();
  assert.equal((await indicar(db, { ...SEM_VAGA, tipo_servico: undefined })).status, 400);
  assert.equal((await indicar(db, { ...SEM_VAGA, admissao_funcao: "  " })).status, 400);
  assert.equal((await indicar(db, { ...SEM_VAGA, tipo_servico: "avaliacao_psicologica" })).status, 400);
  assert.equal((await indicar(db, { ...SEM_VAGA, candidato_nome: "" })).status, 400);
  assert.equal((await indicar(db, { ...SEM_VAGA, vaga_id: undefined })).status, 201, "vaga_id ausente = sem vaga");
  assert.equal((await indicar(db, { ...SEM_VAGA, candidato_telefone: "(19) 95555-0000", admissao_observacoes: "Ex-funcionário" })).status, 201);
  assert.equal(ultima(db).admissao_observacoes, "Ex-funcionário");
});

await ok("duplicidade: mesmo cliente + mesmo telefone + pendente só AVISA (grava mesmo assim); outro cliente, decidida ou telefone diferente não avisam", async () => {
  const db = cenario();
  const r1 = await indicar(db, { ...SEM_VAGA, candidato_telefone: "19987654321" }); // S_PEND (C1) tem "(19) 98765-4321"
  assert.deepEqual([r1.status, r1.corpo.aviso_duplicada], [201, true]);
  const antes = linhas(db, "solicitacoes_indicacao_candidato").length;
  const r2 = await indicar(db, { ...SEM_VAGA, candidato_telefone: "(19) 90000-1234" });
  assert.deepEqual([r2.status, r2.corpo.aviso_duplicada], [201, false]);
  const r3 = await indicar(db, { ...SEM_VAGA, candidato_telefone: "(19) 98765-4321" }, "cliC2");
  assert.deepEqual([r3.status, r3.corpo.aviso_duplicada], [201, false], "outro cliente nunca é comparado");
  // Telefone da indicação APROVADA do seed ((19) 91234-5678 é do candidato, não da indicação): marca a S_PEND como decidida e repete.
  sol(db, ID.S_PEND).status = "recusada";
  linhas(db, "solicitacoes_indicacao_candidato").filter((x: any) => x.cliente_id === "C1" && x.status === "pendente").forEach((x: any) => { x.status = "recusada"; });
  const r4 = await indicar(db, { ...SEM_VAGA, candidato_telefone: "19987654321" });
  assert.deepEqual([r4.status, r4.corpo.aviso_duplicada], [201, false], "indicação já decidida não conta");
  assert.ok(linhas(db, "solicitacoes_indicacao_candidato").length > antes);
});

await ok("fila do analista: a sem vaga aparece (vagas nulo) para a unidade dela, não para outra unidade; GET por id funciona", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  logar(db, "dir");
  const lista = await chamar(R.analistaLista.GET, { url: "http://t/api?status=pendente" });
  const item = lista.corpo.data.find((x: any) => x.id === id);
  assert.ok(item && item.vagas === null && item.vaga_id === null && item.tipo_servico === MOT);
  logar(db, "sup2");
  const outra = await chamar(R.analistaLista.GET, { url: "http://t/api?status=pendente" });
  assert.equal(outra.corpo.data.some((x: any) => x.id === id), false, "supervisor de outra unidade não vê");
  assert.equal((await chamar(R.analistaId.GET, { params: { id } })).status, 404);
  logar(db, "dir");
  assert.equal((await chamar(R.analistaId.GET, { params: { id } })).status, 200);
});

await ok("cliente de OUTRA empresa (ou outro usuário) não vê nem edita; o dono vê 'sem vaga', 'Em análise' e pode editar", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  logar(db, "dir");
  logarPortal(db, "cliC2");
  assert.equal((await chamar(R.minhas.GET)).corpo.data.some((x: any) => x.id === id), false);
  assert.equal((await chamar(R.minhasId.GET, { params: { id } })).status, 404);
  logarPortal(db, "cli2"); // mesmo cliente, outro usuário
  assert.equal((await chamar(R.minhasId.GET, { params: { id } })).status, 404);
  logarPortal(db, "cli");
  const meu = (await chamar(R.minhas.GET)).corpo.data.find((x: any) => x.id === id);
  assert.deepEqual([meu.sem_vaga, meu.vaga_titulo, meu.pode_editar, meu.status], [true, null, true, "pendente"]);
  assert.equal("tipo_servico" in meu && false, false);
  const det = await chamar(R.minhasId.GET, { params: { id } });
  assert.deepEqual([det.status, det.corpo.data.sem_vaga, det.corpo.data.vaga_tipo_servico, det.corpo.data.pode_trocar_vaga], [200, true, MOT, false]);
});

await ok("cliente edita a indicação sem vaga (função, dados de admissão) sem quebrar; NÃO escolhe vaga (a Salmazos direciona)", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  logar(db, "dir"); logarPortal(db, "cli");
  const ed = await chamar(R.minhasId.PATCH, { metodo: "PATCH", params: { id }, corpo: { admissao_funcao: "Auxiliar de logística", admissao_setor: "Expedição" } });
  assert.equal(ed.status, 200, JSON.stringify(ed.corpo));
  assert.deepEqual([sol(db, id).admissao_funcao, sol(db, id).admissao_setor, sol(db, id).vaga_id], ["Auxiliar de logística", "Expedição", null]);
  const troca = await chamar(R.minhasId.PATCH, { metodo: "PATCH", params: { id }, corpo: { vaga_id: ID.V_MOT_B } });
  assert.equal(troca.status, 400);
  assert.match(troca.corpo.error, /aguardando direcionamento/);
  assert.equal(sol(db, id).vaga_id, null);
  // Agora o tipo vem da indicação: em MOT/Terceirização o cliente não pode APAGAR a resposta de dias de teste, nem sem vaga (como com vaga).
  const semDias = await chamar(R.minhasId.PATCH, { metodo: "PATCH", params: { id }, corpo: { admissao_qtd_dias_teste: null } });
  assert.equal(semDias.status, 400, JSON.stringify(semDias.corpo));
  assert.equal(sol(db, id).admissao_qtd_dias_teste, 0, "a resposta anterior continua");
});

await ok("APROVAR sem vaga é BLOQUEADO com mensagem própria (nada é criado, segue pendente); RECUSAR sem vaga sempre funciona", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  const r = await decidir(db, id, { acao: "aprovar", data_fim: FIM_90 });
  assert.deepEqual([r.status, r.corpo.error, r.corpo.codigo], [409, MSG_SEM_VAGA_APROVAR, "sem_vaga"]);
  assert.equal(sol(db, id).status, "pendente");
  assert.equal(linhas(db, "candidatos").length, 2);
  assert.equal(nadaDerivado(db), true);
  const rec = await decidir(db, id, { acao: "recusar", motivo: "Perfil fora do que o cliente precisa" });
  assert.equal(rec.status, 200, JSON.stringify(rec.corpo));
  assert.deepEqual([sol(db, id).status, sol(db, id).vaga_id], ["recusada", null]);
});

await ok("vagas elegíveis: só do mesmo cliente, abertas, mesmo tipo e mesma unidade", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  logar(db, "dir");
  const r = await chamar(R.elegiveis.GET, { params: { id } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.data.map((v: any) => v.id).sort(), [ID.V_MOT_A, ID.V_MOT_B].sort(), "fora: outro cliente, R&S, outra unidade, fechada");
  await indicar(db, semVagaDe(RS));
  assert.deepEqual((await chamar(R.elegiveis.GET, { params: { id: ultima(db).id } })).corpo.data.map((v: any) => v.id), [ID.V_RS]);
  logar(db, "sup2");
  assert.equal((await chamar(R.elegiveis.GET, { params: { id } })).status, 404);
});

await ok("DIRECIONAR: liga à vaga existente (quem, quando, como), segue pendente, nada derivado nasce; vaga inválida é recusada com a regra certa", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  for (const [vaga, status, trecho] of [
    [ID.V_OUTRO_CLIENTE, 400, /cliente/], [ID.V_FECHADA, 400, /aberta/], [ID.V_RS, 400, /tipo de serviço/], [ID.V_OUTRA_UNIDADE, 400, /unidade/],
    ["99999999-0000-4000-8000-0000000000ff", 400, /não encontrada/],
  ] as const) {
    const r = await direcionar(db, id, vaga);
    assert.equal(r.status, status, vaga);
    assert.match(r.corpo.error, trecho);
    assert.equal(sol(db, id).vaga_id, null, "nada gravado");
  }
  assert.equal((await direcionar(db, id, ID.V_MOT_B, "cli")).status, 403, "quem não tem perfil interno (ex.: usuário do portal) não direciona");
  assert.equal((await direcionar(db, id, ID.V_MOT_B, "sup2")).status, 404, "outra unidade");
  const r = await direcionar(db, id, ID.V_MOT_B);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const s = sol(db, id);
  assert.deepEqual([s.vaga_id, s.status, s.direcionamento_tipo, s.direcionada_por, s.sem_vaga_origem], [ID.V_MOT_B, "pendente", "vaga_existente", "Nome u-dir", true]);
  assert.ok(s.direcionada_em);
  assert.equal(nadaDerivado(db), true);
  assert.equal((await direcionar(db, id, ID.V_MOT_A)).status, 409, "já tem vaga");
  assert.ok(auditoria(db).some((a: any) => a.acao === "indicacao_candidato_direcionada" && a.detalhes.vaga_id === ID.V_MOT_B && a.detalhes.direcionamento_tipo === "vaga_existente"));
  sol(db, id).status = "recusada";
  const outra = await indicar(db, SEM_VAGA);
  assert.equal(outra.status, 201);
  assert.equal((await direcionar(db, id, ID.V_MOT_A)).status, 409, "decidida não direciona");
});

await ok("INDICAÇÃO ANTIGA (só o mínimo): depois de direcionada, o fluxo é o NORMAL: analista completa os dados (422 antes), aprova e vira candidato + candidatura + contratação + admissão", async () => {
  const db = cenario();
  await indicarAntiga(db);
  const id = ultima(db).id;
  await direcionar(db, id, ID.V_MOT_A);
  const incompleta = await decidir(db, id, { acao: "aprovar", data_fim: FIM_90 });
  assert.equal(incompleta.status, 422);
  assert.equal(incompleta.corpo.codigo, "dados_admissao_incompletos");
  assert.deepEqual(incompleta.corpo.faltando, ["Salário (mensal ou por hora)", "Horário", "Data de início"]);
  logar(db, "dir");
  const ed = await chamar(R.analistaId.PATCH, { metodo: "PATCH", params: { id }, corpo: { admissao_salario: 1500, admissao_horario: "Turno A, 08h00 às 17h00", admissao_data_inicio: "2026-11-02" } });
  assert.equal(ed.status, 200, JSON.stringify(ed.corpo));
  const ok1 = await decidir(db, id, { acao: "aprovar", data_fim: FIM_90 });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.corpo));
  assert.deepEqual([ok1.corpo.contratado, ok1.corpo.admissao_criada], [true, true]);
  const s = sol(db, id);
  assert.deepEqual([s.status, !!s.candidato_id, !!s.candidatos_vaga_id], ["aprovada", true, true]);
  const cv = linhas(db, "candidatos_vagas").find((x: any) => x.id === s.candidatos_vaga_id);
  assert.equal(cv.vaga_id, ID.V_MOT_A);
  assert.equal(linhas(db, "candidatos").find((c: any) => c.id === s.candidato_id).cargo_pretendido, "Operador A");
  assert.equal(linhas(db, "admissoes").length, 1);
});

await ok("CRIAR VAGA: vaga PRIVADA, aberta, 1 posição, responsável = analista logado, unidade do cliente; indicação ligada; sem e-mail de 'nova vaga'; nunca aparece no site público", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  const vagasAntes = linhas(db, "vagas").length;
  const emailsAntes = (db.emails ?? []).length;
  const r = await criarVaga(db, id);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.aviso_taxa_rs, null, "MOT não tem taxa");
  const vaga = linhas(db, "vagas").find((v: any) => v.id === r.corpo.vaga.id);
  assert.deepEqual(
    [vaga.titulo, vaga.cliente_id, vaga.tipo_servico, vaga.unidade_id, vaga.status, vaga.num_posicoes, vaga.num_posicoes_abertas, vaga.visivel_publicamente, vaga.responsavel],
    ["Auxiliar de produção", "C1", MOT, "U1", "aberta", 1, 1, false, "Nome u-dir"]
  );
  assert.ok(vaga.slug);
  const publicas = linhas(db, "vagas").filter((v: any) => v.status === "aberta" && v.visivel_publicamente === true);
  assert.equal(publicas.some((v: any) => v.id === vaga.id), false, "o site público lista aberta + visível: esta não entra");
  assert.equal(linhas(db, "vagas").length, vagasAntes + 1);
  assert.equal((db.emails ?? []).length, emailsAntes, "nenhum e-mail de 'nova vaga' disparado");
  const s = sol(db, id);
  assert.deepEqual([s.vaga_id, s.direcionamento_tipo, s.direcionada_por, s.status], [vaga.id, "vaga_criada", "Nome u-dir", "pendente"]);
  const acoes = auditoria(db).map((a: any) => a.acao);
  assert.ok(acoes.includes("vaga_criada") && acoes.includes("indicacao_candidato_direcionada"));
  assert.equal(nadaDerivado(db), true);
  assert.equal((await criarVaga(db, id)).status, 409, "já tem vaga");
  // A vaga criada pode ser a escolhida na aprovação (tipo/unidade/cliente batem): vaga aberta é o que a decisão exige.
  assert.equal(vaga.status, "aberta");
});

await ok("CRIAR VAGA: título pode ser trocado; R&S avisa da taxa; campos sensíveis NUNCA vêm do corpo (visibilidade, status, cliente, tipo) — corpo extra é recusado", async () => {
  const db = cenario();
  await indicar(db, semVagaDe(RS));
  const id = ultima(db).id;
  for (const extra of [{ visivel_publicamente: true }, { status: "fechada" }, { cliente_id: "C2" }, { tipo_servico: MOT }, { num_posicoes: 5 }]) {
    const r = await criarVaga(db, id, { titulo: "X", ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  assert.equal(linhas(db, "vagas").some((v: any) => v.titulo === "X"), false, "nenhuma vaga criada");
  const r = await criarVaga(db, id, { titulo: "Analista Contábil" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.match(r.corpo.aviso_taxa_rs, /taxa/);
  const vaga = linhas(db, "vagas").find((v: any) => v.id === r.corpo.vaga.id);
  assert.deepEqual([vaga.titulo, vaga.tipo_servico, vaga.visivel_publicamente, vaga.fee_rs_percentual ?? null], ["Analista Contábil", RS, false, null]);
  assert.equal(["cobrancas_rs", "comissao_lancamentos"].some((t) => tocouTabela(db, t)), false, "nenhuma cobrança/comissão");
});

await ok("CRIAR VAGA: cliente inativo, sem título/cargo, outra unidade e quem não tem perfil interno são recusados sem criar nada", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  const n0 = linhas(db, "vagas").length;
  assert.equal((await criarVaga(db, id, {}, "cli")).status, 403, "sem perfil interno");
  assert.equal((await criarVaga(db, id, {}, "sup2")).status, 404);
  sol(db, id).admissao_funcao = null;
  assert.equal((await criarVaga(db, id)).status, 400, "sem título nem função");
  sol(db, id).admissao_funcao = "Auxiliar";
  db.tabelas.clientes.find((c: any) => c.id === "C1").ativo = false;
  assert.equal((await criarVaga(db, id)).status, 400, "cliente inativo");
  assert.equal(linhas(db, "vagas").length, n0);
});

await ok("CRIAR VAGA: se a ligação com a indicação falha, a vaga recém-criada é APAGADA (reversão); se mudou no meio, 409 sem criar nada", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  const n0 = linhas(db, "vagas").length;
  db.falhas["solicitacoes_indicacao_candidato.update"] = { code: "XX000", message: "falha forçada" };
  const r = await criarVaga(db, id);
  assert.equal(r.status, 500);
  delete db.falhas["solicitacoes_indicacao_candidato.update"];
  assert.equal(linhas(db, "vagas").length, n0, "vaga apagada");
  assert.equal(sol(db, id).vaga_id, null);
  assert.ok(auditoria(db).some((a: any) => a.acao === "indicacao_vaga_criada_revertida"));
  // Corrida: outro analista direcionou entre a leitura e a ligação.
  db.ganchos = { "solicitacoes_indicacao_candidato.update": async () => { sol(db, id).vaga_id = ID.V_MOT_B; } };
  const corrida = await criarVaga(db, id);
  assert.equal(corrida.status, 409);
  assert.equal(linhas(db, "vagas").length, n0, "vaga apagada na corrida também");
  assert.equal(sol(db, id).vaga_id, ID.V_MOT_B, "o direcionamento do outro analista fica");
  // Reversão que também falha: avisa onde está a vaga.
  sol(db, id).vaga_id = null;
  db.falhas["solicitacoes_indicacao_candidato.update"] = { code: "XX000", message: "falha forçada" };
  db.falhas["vagas.delete"] = { code: "XX000", message: "delete falhou" };
  const dupla = await criarVaga(db, id);
  assert.equal(dupla.status, 500);
  assert.match(dupla.corpo.error, /não foi possível apagar a vaga criada/);
  assert.ok(auditoria(db).some((a: any) => a.acao === "indicacao_vaga_criada_rollback_falhou"));
});

await ok("elegíveis: vaga PRIVADA aberta (criada por outra indicação) do mesmo cliente/tipo/unidade aparece e pode receber a indicação", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const primeira = ultima(db).id;
  const c = await criarVaga(db, primeira);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const privada = linhas(db, "vagas").find((v: any) => v.id === c.corpo.vaga.id);
  assert.equal(privada.visivel_publicamente, false);
  await indicar(db, SEM_VAGA);
  const segunda = ultima(db).id;
  logar(db, "dir");
  const l = await chamar(R.elegiveis.GET, { params: { id: segunda } });
  assert.ok(l.corpo.data.some((v: any) => v.id === privada.id), "a vaga privada está na lista");
  assert.equal((await direcionar(db, segunda, privada.id)).status, 200);
  assert.equal(sol(db, segunda).vaga_id, privada.id);
});

await ok("CRIAR VAGA com título repetido: 409 com a mensagem e vaga_existente (aberta, mesmo tipo/unidade); indicação segue sem vaga; direcionar à vaga existente funciona", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  const alvo = linhas(db, "vagas").find((v: any) => v.id === ID.V_MOT_A);
  alvo.cliente_nome = "Cliente Um"; // o índice único é (titulo, cliente_nome); a vaga real sempre tem
  const n0 = linhas(db, "vagas").length;
  db.falhas["vagas.insert"] = { code: "23505", message: 'duplicate key value violates unique constraint "vagas_titulo_cliente_unique"' };
  const r = await criarVaga(db, id, { titulo: alvo.titulo });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(r.corpo.error, "Já existe uma vaga com este título para este cliente: mude o título ou direcione para a vaga existente.");
  assert.deepEqual(r.corpo.vaga_existente, { id: alvo.id, titulo: alvo.titulo });
  delete db.falhas["vagas.insert"];
  assert.equal(linhas(db, "vagas").length, n0, "nada criado");
  assert.equal(sol(db, id).vaga_id, null, "indicação segue sem vaga");
  assert.equal((await direcionar(db, id, r.corpo.vaga_existente.id)).status, 200);
  assert.equal(sol(db, id).vaga_id, alvo.id);
});

await ok("CRIAR VAGA com título repetido de vaga fechada / outra unidade / outro tipo: 409 SEM vaga_existente; outros erros de insert seguem 500 genérico", async () => {
  for (const alvoId of [ID.V_FECHADA, ID.V_OUTRA_UNIDADE, ID.V_RS]) {
    const db = cenario();
    await indicar(db, SEM_VAGA);
    const id = ultima(db).id;
    const alvo = linhas(db, "vagas").find((v: any) => v.id === alvoId);
    alvo.cliente_nome = "Cliente Um";
    db.falhas["vagas.insert"] = { code: "23505", message: 'duplicate key value violates unique constraint "vagas_titulo_cliente_unique"' };
    const r = await criarVaga(db, id, { titulo: alvo.titulo });
    assert.equal(r.status, 409, `${alvoId}: ${JSON.stringify(r.corpo)}`);
    assert.match(r.corpo.error, /fechada ou é de outra unidade ou tipo/);
    assert.equal("vaga_existente" in r.corpo, false);
    assert.equal(sol(db, id).vaga_id, null);
  }
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  for (const falha of [{ code: "23505", message: 'duplicate key value violates unique constraint "vagas_slug_key"' }, { code: "XX000", message: "falha forçada" }]) {
    db.falhas["vagas.insert"] = falha;
    const r = await criarVaga(db, id);
    assert.equal(r.status, 500);
    assert.equal(r.corpo.error, "Não foi possível criar a vaga.");
    assert.equal("vaga_existente" in r.corpo, false);
  }
});

await ok("TELA: abrir o painel 'Direcionar' busca a lista de novo (estado de carregamento); título repetido mostra 'Direcionar para essa vaga' só com vaga_existente, pelo /direcionar já existente", () => {
  const t = fs.readFileSync("src/components/IndicacaoSemVagaAcoes.tsx", "utf8");
  assert.match(t, /if \(p === "direcionar" && abrindo\) \{[^}]*setRecarregarVagas\(\(n\) => n \+ 1\)/, "recarrega ao abrir");
  assert.match(t, /Carregando vagas/);
  assert.match(t, /\{erro && vagaExistente && \(/);
  assert.match(t, /Direcionar para essa vaga/);
  assert.match(t, /direcionar\(vagaExistente\.id\)/);
  assert.equal(/vagas-elegiveis/.test(fs.readFileSync("src/components/IndicacaoSemVagaAcoes.tsx", "utf8")), true);
});

await ok("edição do analista: sem vaga só ganha vaga por Direcionar/Criar (PATCH com vaga_id é recusado); tipo editável só sem vaga", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  logar(db, "dir");
  const atalho = await chamar(R.analistaId.PATCH, { metodo: "PATCH", params: { id }, corpo: { vaga_id: ID.V_MOT_A } });
  assert.equal(atalho.status, 400);
  assert.equal(sol(db, id).vaga_id, null);
  const tipo = await chamar(R.analistaId.PATCH, { metodo: "PATCH", params: { id }, corpo: { tipo_servico: TERC } });
  assert.equal(tipo.status, 200, JSON.stringify(tipo.corpo));
  assert.equal(sol(db, id).tipo_servico, TERC);
  const comVaga = await chamar(R.analistaId.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { tipo_servico: RS } });
  assert.equal(comVaga.status, 400, "com vaga o tipo vem da vaga");
  assert.equal(sol(db, ID.S_PEND).tipo_servico, undefined);
  const trocaComVaga = await chamar(R.analistaId.PATCH, { metodo: "PATCH", params: { id: ID.S_PEND }, corpo: { vaga_id: ID.V_MOT_B } });
  assert.equal(trocaComVaga.status, 200, "troca de vaga numa indicação COM vaga segue como antes");
});

await ok("PROTEÇÃO migração ausente: sem vaga devolve 503 claro (23502/42703), outros erros seguem genéricos, o caminho COM vaga não depende das colunas novas, nada quebra", async () => {
  const db = cenario();
  assert.equal(ehErroSemVagaIndisponivel({ code: "23502", message: 'null value in column "vaga_id" of relation "solicitacoes_indicacao_candidato" violates not-null constraint' }), true);
  assert.equal(ehErroSemVagaIndisponivel({ code: "42703", message: 'column "sem_vaga_origem" of relation "solicitacoes_indicacao_candidato" does not exist' }), true);
  assert.equal(ehErroSemVagaIndisponivel({ code: "PGRST204", message: "Could not find the 'tipo_servico' column" }), true);
  assert.equal(ehErroSemVagaIndisponivel({ code: "57014", message: "statement timeout" }), false);
  assert.equal(ehErroSemVagaIndisponivel(null), false);
  db.falhas["solicitacoes_indicacao_candidato.insert"] = { code: "23502", message: 'null value in column "vaga_id" of relation "solicitacoes_indicacao_candidato" violates not-null constraint' };
  const antes = linhas(db, "solicitacoes_indicacao_candidato").length;
  const r = await indicar(db, SEM_VAGA);
  assert.deepEqual([r.status, r.corpo.error], [503, MSG_SEM_VAGA_INDISPONIVEL]);
  db.falhas["solicitacoes_indicacao_candidato.insert"] = { code: "42703", message: 'column "tipo_servico" of relation "solicitacoes_indicacao_candidato" does not exist' };
  assert.equal((await indicar(db, SEM_VAGA)).status, 503);
  db.falhas["solicitacoes_indicacao_candidato.insert"] = { code: "57014", message: "statement timeout" };
  const generico = await indicar(db, SEM_VAGA);
  assert.deepEqual([generico.status, generico.corpo.error], [400, "statement timeout"], "erro que não é de migração segue como antes");
  delete db.falhas["solicitacoes_indicacao_candidato.insert"];
  assert.equal(linhas(db, "solicitacoes_indicacao_candidato").length, antes, "nada gravado");
  // Direcionar com coluna nova ausente (uma indicação sem vaga só existe depois da migração, mas a rota não pode estourar).
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  db.falhas["solicitacoes_indicacao_candidato.update"] = { code: "42703", message: 'column "direcionada_em" of relation "solicitacoes_indicacao_candidato" does not exist' };
  const d = await direcionar(db, id, ID.V_MOT_A);
  assert.deepEqual([d.status, d.corpo.error], [503, MSG_SEM_VAGA_INDISPONIVEL]);
  const c = await criarVaga(db, id);
  assert.equal(c.status, 503);
  assert.equal(linhas(db, "vagas").filter((v: any) => v.visivel_publicamente === false && v.titulo === "Auxiliar de produção").length, 0, "vaga criada foi revertida");
  delete db.falhas["solicitacoes_indicacao_candidato.update"];
  // Leituras do portal e a contagem do painel NÃO pedem colunas novas: antes da migração continuam funcionando.
  const lista = fs.readFileSync("src/app/api/portal/minhas-indicacoes/route.ts", "utf8");
  const trecho = lista.slice(lista.indexOf(".select(\"id, candidato_nome, vaga_id"), lista.indexOf(".select(\"id, candidato_nome, vaga_id") + 200);
  for (const col of ["tipo_servico", "sem_vaga_origem", "direcionada"]) assert.equal(trecho.includes(col), false, `select de Minhas Indicações não pede ${col}`);
  const painel = fs.readFileSync("src/app/painel/vagas/page.tsx", "utf8");
  const contagem = painel.slice(painel.indexOf("indicacoesSemVagaQuery = supabase"), painel.indexOf("indicacoesSemVagaQuery = supabase") + 260);
  assert.ok(contagem.includes('.is("vaga_id", null)') && !contagem.includes("sem_vaga_origem"));
  const comVaga = await indicar(db, COM_VAGA);
  assert.equal(comVaga.status, 201, "caminho com vaga segue igual");
});

await ok("fiação das telas: formulário do portal (opção sempre disponível, tipo e cargo, aviso), Minhas Indicações, modal do analista, badge do painel", () => {
  const form = fs.readFileSync("src/app/portal/(app)/indicar-candidato/page.tsx", "utf8");
  for (const t of ["A Salmazos direciona (sem vaga)", "SEM_VAGA", "Tipo de serviço", "Cargo / função do candidato", "Isto não cria vaga nem garante a contratação", "aviso_duplicada", "if ((json.data ?? []).length === 0) setVagaId(SEM_VAGA)"]) assert.ok(form.includes(t), t);
  assert.equal(form.includes("Solicite uma vaga primeiro"), false, "o beco sem saída antigo some");
  const minhas = fs.readFileSync("src/app/portal/(app)/minhas-indicacoes/page.tsx", "utf8");
  assert.ok(minhas.includes("Em análise pela Salmazos") && minhas.includes("Sem vaga definida"));
  const modal = fs.readFileSync("src/components/ModalIndicacoesCandidato.tsx", "utf8");
  // A tela foi extraída para CartaoIndicacaoAnalista (testável); o modal só a usa. A dica de Aprovar vive em indicacaoSemVaga.ts.
  for (const t of ["Sem vaga (", "CartaoIndicacaoTopo", "BotaoAprovarIndicacao", "estadoIndicacaoAnalista"]) assert.ok(modal.includes(t), t);
  const cartao = fs.readFileSync("src/components/CartaoIndicacaoAnalista.tsx", "utf8");
  for (const t of ["IndicacaoSemVagaAcoes", "mostrarAcoesSemVaga"]) assert.ok(cartao.includes(t), t);
  assert.ok(fs.readFileSync("src/lib/indicacaoSemVaga.ts", "utf8").includes("Direcione a indicação para uma vaga (ou crie a vaga) antes de aprovar."));
  const acoes = fs.readFileSync("src/components/IndicacaoSemVagaAcoes.tsx", "utf8");
  for (const t of ["Direcionar para vaga existente", "Criar vaga a partir da indicação", "Completar dados", "privada"]) assert.ok(acoes.includes(t), t);
  assert.ok(fs.readFileSync("src/components/VagasPageClient.tsx", "utf8").includes("sem vaga"));
});

// ════════════ Bloco "Dados para Admissão" único: mesmos campos, listas, máscaras e validações com e sem vaga ════════════
const msgs = (r: any) => String(r.corpo?.error ?? "");
const COMPLETOS: [string, string][] = [[RS, "R&S"], [MOT, "MOT"], [TERC, "Terceirização"]];

await ok("SEM vaga COMPLETO por tipo (R&S, MOT, Terceirização): 201 e o bloco inteiro gravado, igual ao que a indicação com vaga grava", async () => {
  for (const [tipo] of COMPLETOS) {
    const db = cenario();
    const r = await indicar(db, semVagaDe(tipo));
    assert.equal(r.status, 201, `${tipo}: ${JSON.stringify(r.corpo)}`);
    const s = ultima(db);
    for (const [campo, valor] of Object.entries(BLOCO[tipo])) assert.deepEqual(s[campo] ?? null, tipo === RS && campo === "admissao_qtd_dias_teste" ? null : valor, `${tipo} ${campo}`);
    assert.equal(s.vaga_id, null); assert.equal(s.tipo_servico, tipo); assert.equal(nadaDerivado(db), true);
  }
});

await ok("SEM vaga FALTANDO obrigatório do tipo = 400 com a mensagem do campo (uma por uma, as mesmas da tela)", async () => {
  const casos: [string, string, string][] = [
    [RS, "admissao_data_inicio", "Informe a data de início."], [RS, "admissao_salario", "Informe o salário acordado."],
    [MOT, "admissao_setor", "Informe o setor."], [MOT, "admissao_centro_custo", "Informe o centro de custo."], [MOT, "admissao_turno", "Selecione o turno."],
    [MOT, "admissao_horario", "Informe o horário de entrada e saída."], [MOT, "admissao_escala", "Selecione a escala."], [MOT, "admissao_tempo_contrato", "Informe o tempo de contrato."],
    [MOT, "admissao_vt", "Informe se utiliza Vale Transporte."], [MOT, "admissao_exame_responsavel", "Informe o responsável pelo exame admissional."], [MOT, "admissao_data_inicio", "Informe a data de início."],
    [TERC, "admissao_salario", "Informe o salário."], [TERC, "admissao_centro_custo", "Informe o centro de custo."], [TERC, "admissao_vt", "Informe se utiliza Vale Transporte."],
    [TERC, "admissao_exame_responsavel", "Informe o responsável pelo exame admissional."],
  ];
  for (const [tipo, campo, mensagem] of casos) {
    const db = cenario();
    const antes = linhas(db, "solicitacoes_indicacao_candidato").length;
    const r = await indicar(db, semVagaDe(tipo, { [campo]: undefined }));
    assert.equal(r.status, 400, `${tipo}/${campo}: ${JSON.stringify(r.corpo)}`);
    assert.ok(msgs(r).includes(mensagem), `${tipo}/${campo}: ${msgs(r)}`);
    assert.equal(linhas(db, "solicitacoes_indicacao_candidato").length, antes, "nada gravado");
  }
  const db = cenario();
  assert.equal((await indicar(db, semVagaDe(MOT, { admissao_salario_hora: undefined }))).status, 400, "MOT sem nenhum salário");
  assert.equal((await indicar(db, semVagaDe(MOT, { admissao_salario_hora: undefined, admissao_salario: 1800 }))).status, 201, "MOT mensalista também vale");
});

await ok("SEM vaga com formato FORA DO PADRÃO = 400 (as mesmas regras de sempre: centro de custo, tempo, turno, escala, horário, salário)", async () => {
  for (const extra of [
    { admissao_centro_custo: "CC 42" }, { admissao_tempo_contrato: "6 meses" }, { admissao_turno: "noite", admissao_horario: "noite, 08h00 às 17h00" }, { admissao_escala: "5 por 2" },
    { admissao_horario: "das 8 às 17" }, { admissao_salario_hora: 5000 }, { admissao_horario: "Turno B, 08h00 às 17h00" } /* não confere com o turno A */,
  ]) {
    const db = cenario();
    const r = await indicar(db, semVagaDe(MOT, extra));
    assert.equal(r.status, 400, JSON.stringify(extra) + JSON.stringify(r.corpo));
  }
  const db = cenario();
  assert.equal((await indicar(db, semVagaDe(MOT, { admissao_escala: "5x2", admissao_tempo_contrato: "120 dias, prorrogável por mais 60 dias" }))).status, 201, "'Outro' no formato NxM e prazo dentro dos limites valem");
});

await ok("DIAS DE TESTE sem vaga usam o TIPO DA INDICAÇÃO: MOT/Terceirização exigem resposta (0 vale), R&S ignora e grava nulo", async () => {
  for (const tipo of [MOT, TERC]) {
    const db = cenario();
    const r = await indicar(db, semVagaDe(tipo, { admissao_qtd_dias_teste: undefined }));
    assert.equal(r.status, 400); assert.match(msgs(r), /dia\(s\) de teste/);
    assert.equal((await indicar(db, semVagaDe(tipo, { admissao_qtd_dias_teste: 0 }))).status, 201, "0 = 'não houve' é resposta");
    assert.equal(ultima(db).admissao_qtd_dias_teste, 0);
  }
  const db = cenario();
  assert.equal((await indicar(db, semVagaDe(RS, { admissao_qtd_dias_teste: 2 }))).status, 201);
  assert.equal(ultima(db).admissao_qtd_dias_teste, null, "R&S não tem dia de teste");
});

await ok("COM vaga NÃO foi endurecida: o corpo mínimo de sempre continua 201 (a exigência por tipo é só tela + sem vaga)", async () => {
  const db = cenario();
  const r = await indicar(db, COM_VAGA);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(ultima(db).vaga_id, ID.V_MOT_A);
  assert.equal((await indicar(db, { ...COM_VAGA, admissao_qtd_dias_teste: undefined })).status, 400, "dias de teste com vaga seguem exigidos, como antes");
});

await ok("EDIÇÃO do cliente (sem vaga completa): campo editado vale; APAGAR obrigatório = 400; indicação ANTIGA só com função segue editável sem exigência", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  logar(db, "dir"); logarPortal(db, "cli");
  const edita = (alvo: string, corpo: Record<string, unknown>) => chamar(R.minhasId.PATCH, { metodo: "PATCH", params: { id: alvo }, corpo });
  assert.equal((await edita(id, { admissao_setor: "Expedição" })).status, 200);
  const apaga = await edita(id, { admissao_centro_custo: null });
  assert.equal(apaga.status, 400, JSON.stringify(apaga.corpo)); assert.match(msgs(apaga), /centro de custo/);
  assert.equal(sol(db, id).admissao_centro_custo, "CC-0042", "nada gravado");
  assert.equal((await edita(id, { admissao_centro_custo: "CC 1" })).status, 400, "formato continua valendo");
  const antiga = cenario();
  await indicarAntiga(antiga);
  const idAntiga = ultima(antiga).id;
  logar(antiga, "dir"); logarPortal(antiga, "cli");
  assert.equal((await edita(idAntiga, { candidato_nome: "Beatriz L. Lima", admissao_funcao: "Auxiliar de logística", admissao_observacoes: "Ajuste" })).status, 200, "nome, função e observações: sem exigência");
  const mexeu = await edita(idAntiga, { admissao_setor: "Expedição" });
  assert.equal(mexeu.status, 400, JSON.stringify(mexeu.corpo)); assert.match(msgs(mexeu), /data de início/);
  const completa = await edita(idAntiga, { ...BLOCO[MOT], admissao_setor: "Expedição" });
  assert.equal(completa.status, 200, JSON.stringify(completa.corpo));
  assert.equal(sol(antiga, idAntiga).admissao_setor, "Expedição");
});

await ok("INDICAÇÃO ANTIGA (só o mínimo) continua funcionando: aparece na fila do analista, segue sem vaga, aprovar = 409, recusar funciona", async () => {
  const db = cenario();
  await indicarAntiga(db);
  const id = ultima(db).id;
  logar(db, "dir");
  const lista = await chamar(R.analistaLista.GET, { url: "http://t/api?status=pendente" });
  const it = lista.corpo.data.find((x: any) => x.id === id);
  assert.ok(it && it.vaga_id === null && it.admissao_salario === null);
  const r = await decidir(db, id, { acao: "aprovar", data_fim: FIM_90 });
  assert.deepEqual([r.status, r.corpo.codigo], [409, "sem_vaga"]);
  assert.equal(sol(db, id).status, "pendente"); assert.equal(nadaDerivado(db), true);
  assert.equal((await decidir(db, id, { acao: "recusar", motivo: "Sem perfil" })).status, 200);
});

await ok("APROVAR sem vaga COMPLETA continua 409 (nada criado); depois de direcionar, aprova direto com os dados que o cliente já informou", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
  const id = ultima(db).id;
  const r = await decidir(db, id, { acao: "aprovar", data_fim: FIM_90 });
  assert.deepEqual([r.status, r.corpo.codigo], [409, "sem_vaga"]);
  assert.equal(nadaDerivado(db), true);
  assert.equal((await direcionar(db, id, ID.V_MOT_A)).status, 200);
  const ok1 = await decidir(db, id, { acao: "aprovar", data_fim: FIM_90 });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.corpo));
  assert.deepEqual([ok1.corpo.contratado, ok1.corpo.admissao_criada], [true, true]);
});

await ok("CRIAR VAGA PRÉ-PREENCHIDA: salário (formato do parseSalarioFixo) e horário da indicação (setor fica de fora); tipo, status, visibilidade, posições e responsável seguem fixados; antiga gera vaga como antes", async () => {
  const { parseSalarioFixo } = await import("../src/lib/constants");
  for (const [tipo, esperadoSalario, esperadoNumero] of [[TERC, "R$ 1.800,00", 1800], [RS, "R$ 3.500,00", 3500]] as const) {
    const db = cenario();
    await indicar(db, semVagaDe(tipo, tipo === TERC ? { admissao_setor: "Facilities" } : { admissao_setor: "Administrativo" }));
    const r = await criarVaga(db, ultima(db).id);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const vaga = linhas(db, "vagas").find((v: any) => v.id === r.corpo.vaga.id);
    assert.equal(vaga.salario, esperadoSalario); assert.equal(parseSalarioFixo(vaga.salario), esperadoNumero, "o parser do sistema lê de volta o mesmo valor");
    assert.equal(vaga.horario ?? null, tipo === TERC ? "Turno B, 08h00 às 17h00" : null);
    assert.equal(vaga.observacoes, "Criada a partir de indicação direta de cliente.", "texto genérico: sem nome de candidato nem setor (observacoes aparece na página pública)");
    assert.equal(JSON.stringify(vaga).includes("Beatriz") || JSON.stringify(vaga).includes("Lima"), false, "nome do candidato em nenhum campo da vaga");
    assert.equal(JSON.stringify(vaga).includes("Facilities") || JSON.stringify(vaga).includes("Administrativo"), false, "setor em nenhum campo da vaga");
    assert.deepEqual([vaga.tipo_servico, vaga.status, vaga.num_posicoes, vaga.num_posicoes_abertas, vaga.visivel_publicamente, vaga.responsavel], [tipo, "aberta", 1, 1, false, "Nome u-dir"]);
  }
  const hora = cenario();
  await indicar(hora, SEM_VAGA);
  const rh = await criarVaga(hora, ultima(hora).id);
  const vagaHora = linhas(hora, "vagas").find((v: any) => v.id === rh.corpo.vaga.id);
  assert.equal(vagaHora.salario, "R$ 18,50/hora"); assert.equal(parseSalarioFixo(vagaHora.salario), null, "salário por hora nunca é lido como mensal");
  const antiga = cenario();
  await indicarAntiga(antiga);
  const ra = await criarVaga(antiga, ultima(antiga).id);
  assert.equal(ra.status, 200);
  const vagaAntiga = linhas(antiga, "vagas").find((v: any) => v.id === ra.corpo.vaga.id);
  assert.equal(vagaAntiga.salario ?? null, null); assert.equal(vagaAntiga.horario ?? null, null);
  assert.equal(vagaAntiga.observacoes, "Criada a partir de indicação direta de cliente.");
});

await ok("módulo único de obrigatórios (tela + servidor): mensagens por tipo, salário horista/mensalista, e quando a edição passa a exigir", async () => {
  const { faltandoObrigatorios, mexeNosDadosDeAdmissao } = await import("../src/lib/admissaoObrigatorios");
  assert.deepEqual(faltandoObrigatorios(RS, {}), ["Informe a data de início.", "Informe a função confirmada.", "Informe o salário acordado."]);
  assert.equal(faltandoObrigatorios(MOT, BLOCO[MOT] as never).length, 1, "só a função falta (o bloco não a traz)");
  assert.deepEqual(faltandoObrigatorios(MOT, { ...BLOCO[MOT], admissao_funcao: "x" } as never), []);
  assert.deepEqual(faltandoObrigatorios(TERC, { ...BLOCO[TERC], admissao_funcao: "x" } as never), []);
  assert.deepEqual(faltandoObrigatorios("outro", {}), []);
  assert.deepEqual(faltandoObrigatorios(null, {}), []);
  assert.equal(mexeNosDadosDeAdmissao(["candidato_nome", "admissao_funcao", "admissao_observacoes"]), false);
  assert.equal(mexeNosDadosDeAdmissao(["admissao_setor"]), true);
});

await ok("BLOCO único nos dois modos (SSR): mesmos controles e ORDEM com e sem vaga; sem vaga só omite 'Função' (vem do cartão); tempo de contrato é SELEÇÃO, sem texto livre", async () => {
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const { renderToStaticMarkup } = req("react-dom/server");
  const React = req("react");
  const Bloco = (await import("../src/components/BlocoDadosAdmissao")).default;
  const { dadosVazios } = await import("../src/lib/admissaoForm");
  const html = (tipo: string, ocultarFuncao: boolean) => renderToStaticMarkup(React.createElement(Bloco, { tipoServico: tipo, valores: dadosVazios(tipo), onChange: () => {}, ocultarFuncao }));
  const rotulos = (h: string) => [...h.matchAll(/<label[^>]*>([^<]+)</g)].map((m) => m[1].replace(/\s*\*$/, "").trim()).filter(Boolean);
  const ESPERADO_MOT = ["Data de Início", "Função", "Setor", "Centro de custo", "Salário por hora", "Salário mensal", "Horário de entrada", "Horário de saída", "Turno", "Escala", "Tempo de contrato", "Vale Transporte?", "Exame Admissional — Responsável", "Local/Data/Hora da Integração", "Observações"];
  for (const tipo of [MOT, TERC, RS]) {
    const com = rotulos(html(tipo, false));
    const sem = rotulos(html(tipo, true));
    assert.deepEqual(sem, com.filter((r) => r !== "Função" && r !== "Função confirmada"), `${tipo}: sem vaga = com vaga menos a função`);
  }
  const mot = rotulos(html(MOT, false));
  for (const r of ESPERADO_MOT.filter((x) => x !== "Salário mensal")) assert.ok(mot.includes(r) || html(MOT, false).includes(r), `MOT: ${r}`);
  const h = html(MOT, false);
  assert.ok(h.includes('type="time"') && h.includes("12x36 - Noite") && h.includes("Turno D") && h.includes("Salário por hora"));
  assert.ok(h.includes("Outro prazo") && h.includes("180 dias, prorrogável por mais 90 dias"), "tempo de contrato: padrão ou outro prazo");
  assert.equal(/<input[^>]*value="180 dias/.test(h), false, "sem input de texto livre com o prazo");
  const terc = html(TERC, false);
  assert.ok(terc.includes("Escala 6x1") && !terc.includes("Tempo de contrato") && !terc.includes("Escala</label>"), "Terceirização: turno combinado, sem escala nem tempo");
  const rs = html(RS, false);
  assert.ok(rs.includes("Período de Experiência") && rs.includes("30 dias") && rs.includes("Gestor Direto") && !rs.includes("Centro de custo"));
  // Asterisco só no que o tipo exige (mesma lista do módulo de obrigatórios); R&S pede só o salário, Terceirização não tem escala nem tempo.
  assert.ok(["Centro de custo *", "Horário de entrada *", "Horário de saída *", "Turno *", "Escala *", "Tempo de contrato *"].every((t) => h.includes(t)), "MOT");
  assert.ok(terc.includes("Centro de custo *") && terc.includes("Turno *") && terc.includes("Salário mensal *") && !/>Escala[ *]*</.test(terc), "Terceirização");
  assert.ok(rs.includes("Salário mensal *") && !rs.includes("Centro de custo") && !rs.includes("Turno"), "R&S: só o salário");
  assert.ok(html(MOT, true).includes("Observações") && !/>Função\s*\*?</.test(html(MOT, true)));
});

await ok("FIAÇÃO do formulário: um único bloco para os dois modos, cargo único alimenta a função, seletor com 'sem vaga' no topo e valor padrão vazio, validação pelo módulo único", () => {
  const form = fs.readFileSync("src/app/portal/(app)/indicar-candidato/page.tsx", "utf8");
  assert.equal((form.match(/<BlocoDadosAdmissao/g) ?? []).length, 1, "um único uso do bloco (serve a vaga e o sem vaga)");
  assert.ok(form.includes("ocultarFuncao={semVaga}") && form.includes("value={dados.funcao}"), "cargo do cartão = função do bloco");
  assert.equal((form.match(/Cargo \/ função do candidato/g) ?? []).length, 1);
  assert.ok(form.includes("faltandoObrigatorios") && form.includes("validarCamposAdmissao") && form.includes("colunasDeDados"));
  assert.equal(/admCentroCusto|admTurnoSelecionado|admEscalaSelecionada|admTempoContrato/.test(form), false, "sem os estados duplicados de antes");
  const iSelecione = form.indexOf('<option value="">Selecione...</option>');
  const iSem = form.indexOf("<option value={SEM_VAGA}>A Salmazos direciona (sem vaga)</option>");
  const iVagas = form.indexOf("{vagas.map((v) => (");
  assert.ok(iSelecione > -1 && iSelecione < iSem && iSem < iVagas, "ordem: Selecione... → sem vaga → vagas abertas");
  assert.ok(form.includes('const [vagaId, setVagaId] = useState("");'), "valor padrão continua vazio");
  assert.ok(form.includes("if ((json.data ?? []).length === 0) setVagaId(SEM_VAGA)"), "sem nenhuma vaga aberta, continua selecionando 'sem vaga'");
  const modal = fs.readFileSync("src/components/ModalEditarIndicacaoCliente.tsx", "utf8");
  assert.ok(modal.includes("<BlocoDadosAdmissao") && !modal.includes('campoTexto("admissao_periodo_experiencia"') && !modal.includes('campoTexto("admissao_tempo_contrato"'));
  const avaliacao = fs.readFileSync("src/components/PortalAvaliacaoBtn.tsx", "utf8");
  assert.equal(avaliacao.includes("BlocoDadosAdmissao"), false, "PortalAvaliacaoBtn fica fora desta mudança");
});


console.log(`\n${n} verificações OK`);
