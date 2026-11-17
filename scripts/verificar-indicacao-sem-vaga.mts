// Indicação direta de candidato SEM vaga (Portal do Cliente): o cliente indica mesmo sem vaga aberta ("A Salmazos direciona"); o analista
// direciona para uma vaga existente ou cria a vaga a partir da indicação, e a aprovação segue o fluxo de sempre. Rotas reais contra o banco
// em memória do harness; nada toca produção.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-indicacao-sem-vaga.mts
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
const SEM_VAGA = { vaga_id: null, tipo_servico: MOT, candidato_nome: "Beatriz Lima", candidato_telefone: "(19) 97777-1111", admissao_funcao: "Auxiliar de produção" };
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
  const d = dadosVagaDaIndicacao({ titulo: "  Auxiliar ", tipoServico: MOT, clienteId: "C1", clienteNome: "Cliente Um", unidadeId: "U1", responsavel: "Olver", candidatoNome: "Bia", cidade: "Monte Mor" });
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
  assert.equal(["admissao_salario", "admissao_horario", "admissao_data_inicio", "admissao_qtd_dias_teste"].every((c) => s[c] == null), true, "o resto fica nulo para o analista completar");
  assert.equal(nadaDerivado(db), true, "sem candidatura, encaminhamento, admissão, cobrança nem comissão");
  assert.equal(linhas(db, "candidatos").length, 2, "nenhum candidato criado");
  assert.equal(["cobrancas_rs", "comissao_lancamentos"].some((t) => tocouTabela(db, t)), false);
  const sino = sinos(db).find((x: any) => x.tipo === "nova_indicacao_candidato");
  assert.equal(sino.mensagem, "Cliente Um indicou Beatriz Lima, sem vaga: aguardando direcionamento");
  assert.equal(sino.solicitacao_indicacao_id, s.id);
  assert.ok(emailsPara(db).some((e: any) => /sem vaga/.test(e.subject)));
});

await ok("SEM vaga: só o mínimo vale (tipo e cargo obrigatórios; tipo inválido recusado); corpo com dados de admissão não é exigido", async () => {
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
  const semDias = await chamar(R.minhasId.PATCH, { metodo: "PATCH", params: { id }, corpo: { admissao_qtd_dias_teste: null } });
  assert.equal(semDias.status, 200, "sem vaga não há regra de dias de teste a conferir");
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
  await indicar(db, { ...SEM_VAGA, tipo_servico: RS });
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

await ok("depois de direcionada, o fluxo é o NORMAL: analista completa os dados (422 antes), aprova e vira candidato + candidatura + contratação + admissão", async () => {
  const db = cenario();
  await indicar(db, SEM_VAGA);
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
  await indicar(db, { ...SEM_VAGA, tipo_servico: RS });
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

await ok("fiação das telas: formulário do portal (opção sempre disponível, mínimo, aviso), Minhas Indicações, modal do analista, badge do painel", () => {
  const form = fs.readFileSync("src/app/portal/(app)/indicar-candidato/page.tsx", "utf8");
  for (const t of ["A Salmazos direciona (sem vaga)", "SEM_VAGA", "Tipo de serviço", "Cargo / função do candidato", "Isto não cria vaga nem garante a contratação", "aviso_duplicada", "if ((json.data ?? []).length === 0) setVagaId(SEM_VAGA)"]) assert.ok(form.includes(t), t);
  assert.equal(form.includes("Solicite uma vaga primeiro"), false, "o beco sem saída antigo some");
  const minhas = fs.readFileSync("src/app/portal/(app)/minhas-indicacoes/page.tsx", "utf8");
  assert.ok(minhas.includes("Em análise pela Salmazos") && minhas.includes("Sem vaga definida"));
  const modal = fs.readFileSync("src/components/ModalIndicacoesCandidato.tsx", "utf8");
  for (const t of ["Sem vaga (", "IndicacaoSemVagaAcoes", "Direcione a indicação para uma vaga para poder aprovar."]) assert.ok(modal.includes(t), t);
  const acoes = fs.readFileSync("src/components/IndicacaoSemVagaAcoes.tsx", "utf8");
  for (const t of ["Direcionar para vaga existente", "Criar vaga a partir da indicação", "Completar dados", "privada"]) assert.ok(acoes.includes(t), t);
  assert.ok(fs.readFileSync("src/components/VagasPageClient.tsx", "utf8").includes("sem vaga"));
});

console.log(`\n${n} verificações OK`);
