// Verificação de "aprovar indicação direta MOT/Terceirização = contratado + admissão criada" (o projeto não tem runner de testes).
// Roda a rota real contra o banco em memória do harness; nada toca produção.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-indicacao-admissao.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, auditoria, flush } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao, ID, solicitacaoBase } from "./harness-mot/ambiente-indicacao.mjs";
import { erroDataTermino, somarDiasIso, diasEntre } from "../src/lib/dataTerminoContrato";

congelarData();
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const EXISTENTE = "dddddddd-0000-4000-8000-0000000000e1";
// Data de término padrão dos testes: início da indicação (2026-11-02) + 90 dias. Passe data_fim: undefined para omitir.
const FIM_90 = "2027-01-31";
const aprovar = (id: string, corpo: Record<string, unknown> = {}) => chamar(decisao.POST, { metodo: "POST", params: { id }, corpo: { acao: "aprovar", data_fim: FIM_90, ...corpo } });
const linhas = (db: any, t: string) => db.tabelas[t] ?? [];
const sol = (db: any, id: string) => linhas(db, "solicitacoes_indicacao_candidato").find((s: any) => s.id === id);

function cenario({ tipo = "mao_obra_temporaria", vagaId = ID.V_MOT_A, solExtra = {} as Record<string, unknown> } = {}) {
  const db = novoDbIndicacao(); logar(db, "dir");
  // Duas posições: a vaga não fecha sozinha e o fechamento automático (e-mail) não entra nestes casos.
  db.tabelas.vagas.forEach((v: any) => { v.num_posicoes = 2; v.num_posicoes_abertas = 2; });
  db.tabelas.vagas.find((v: any) => v.id === vagaId).tipo_servico = tipo;
  const s = sol(db, ID.S_PEND);
  Object.assign(s, { vaga_id: vagaId, ...solExtra });
  return db;
}
const estadoBanco = (db: any) => ({
  candidatos: linhas(db, "candidatos").length,
  cvs: linhas(db, "candidatos_vagas").length,
  enc: linhas(db, "encaminhamentos").length,
  adm: linhas(db, "admissoes").length,
});

await ok("MOT novo: candidato contratado nesta vaga + admissão criada com os dados da indicação", async () => {
  const db = cenario();
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.candidato_nome, "Maria Souza");
  assert.equal(r.corpo.admissao_criada, true);
  assert.equal(r.corpo.contratado, true);
  assert.equal(estadoBanco(db).candidatos, antes.candidatos + 1);

  const cv = linhas(db, "candidatos_vagas").find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cv.etapa, "contratado");
  assert.equal(cv.data_inicio, "2026-11-02");

  const adm = linhas(db, "admissoes");
  assert.equal(adm.length, 1);
  assert.equal(adm[0].candidato_id, r.corpo.candidato_id);
  assert.equal(adm[0].vaga_id, ID.V_MOT_A);
  assert.equal(adm[0].unidade_id, "U1");
  assert.equal(adm[0].modalidade, "MOT");
  assert.equal(adm[0].funcao, "Operador");
  assert.equal(adm[0].salario, 1500);
  assert.equal(adm[0].tipo_salario, "mensal");
  assert.equal(adm[0].horario_trabalho, "Turno A, 08h00 às 17h00");
  assert.equal(adm[0].data_admissao, "2026-11-02");
  assert.equal(adm[0].entidade_contratante, "recrutamento_selecao_terceirizacao");
  assert.ok(linhas(db, "admissao_documentos").length > 0, "checklist de documentos criado");
  // turno, escala e dias de teste ficam na candidatura (fonte que as telas do RH leem)
  assert.equal(cv.admissao_turno, "Turno A");
  assert.equal(cv.admissao_escala, "6x1");

  const cand = linhas(db, "candidatos").find((c: any) => c.id === r.corpo.candidato_id);
  assert.equal(cand.status_alocacao, "alocado_mot");
  assert.equal(sol(db, ID.S_PEND).status, "aprovada");
  assert.ok(linhas(db, "historico_candidato").some((h: any) => h.tipo === "contratado"), "histórico de contratação (mesma regra do Finalizar)");

  const a = auditoria(db);
  const aprov = a.find((x: any) => x.acao === "indicacao_candidato_aprovada");
  assert.equal(aprov.detalhes.contratado, true);
  assert.equal(aprov.detalhes.admissao_id, adm[0].id);
  assert.ok(a.some((x: any) => x.acao === "candidato_finalizado" && x.detalhes.resultado === "contratado"));
  assert.ok(a.some((x: any) => x.acao === "admissao_criada" && x.entidade_id === adm[0].id));
});

await ok("MOT novo: nenhum e-mail de admissão/link para o candidato e nenhum link de WhatsApp", async () => {
  const db = cenario();
  // O candidato novo nasce sem e-mail; mesmo com e-mail cadastrado (caso vinculado, abaixo) nada de admissão sai.
  const r = await aprovar(ID.S_PEND);
  await flush();
  assert.equal(r.status, 200);
  assert.deepEqual(db.emails.filter((e: any) => e.tipo === "admissao_link"), []);
  assert.deepEqual(db.emails.filter((e: any) => /admiss[aã]o\//i.test(String(e.html))), [], "nenhum e-mail carrega link /admissao/<token>");
  assert.equal(JSON.stringify(r.corpo).includes("wa.me"), false);
  assert.equal(JSON.stringify(r.corpo).includes("token"), false);
  // Só a notificação interna que já existia para o RH (indicacao_candidato_aprovada), nunca para o candidato.
  for (const e of db.emails) assert.equal(e.tipo, "indicacao_candidato_aprovada");
  assert.ok(db.emails.every((e: any) => String(e.to).endsWith("@salmazos.com.br")), JSON.stringify(db.emails.map((e: any) => e.to)));
});

await ok("MOT vinculado a cadastro existente: sobe para contratado, admissão criada, responsável e e-mail do cadastro intactos", async () => {
  const db = cenario();
  db.tabelas.candidatos.push({ id: EXISTENTE, nome_completo: "Maria de Souza Lima", telefone: "(19) 98765-4321", email: "maria@exemplo.com", cidade: "Hortolândia", responsavel: "Rebecca Zambonini", cpf: "123.456.789-00", etapa_kanban: "banco_talentos", origem: "cadastro_rapido" });
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND, { candidato_existente_id: EXISTENTE });
  await flush();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.candidato_id, EXISTENTE);
  assert.equal(r.corpo.candidato_nome, "Maria de Souza Lima", "mensagem usa o nome do cadastro existente");
  assert.equal(estadoBanco(db).candidatos, antes.candidatos);
  const cv = linhas(db, "candidatos_vagas").find((c: any) => c.candidato_id === EXISTENTE && c.vaga_id === ID.V_MOT_A);
  assert.equal(cv.etapa, "contratado");
  assert.equal(linhas(db, "admissoes").length, 1);
  assert.equal(linhas(db, "admissoes")[0].candidato_id, EXISTENTE);
  const cand = linhas(db, "candidatos").find((c: any) => c.id === EXISTENTE);
  assert.equal(cand.responsavel, "Rebecca Zambonini");
  assert.equal(cand.email, "maria@exemplo.com");
  assert.equal(cand.nome_completo, "Maria de Souza Lima");
  // Mesmo com e-mail no cadastro, nada é enviado a ele.
  assert.deepEqual(db.emails.filter((e: any) => e.to === "maria@exemplo.com"), []);
  assert.deepEqual(db.emails.filter((e: any) => e.tipo === "admissao_link"), []);
});

await ok("Terceirização: também contrata e cria a admissão (modalidade terceirizacao)", async () => {
  const db = cenario({ tipo: "terceirizacao" });
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(linhas(db, "admissoes")[0].modalidade, "terceirizacao");
  assert.equal(linhas(db, "candidatos_vagas").find((c: any) => c.id === r.corpo.candidatos_vaga_id).etapa, "contratado");
});

await ok("MOT horista: admissão com tipo_salario=hora e o valor/hora", async () => {
  const db = cenario({ solExtra: { admissao_salario: null, admissao_salario_hora: 12.5 } });
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(linhas(db, "admissoes")[0].tipo_salario, "hora");
  assert.equal(linhas(db, "admissoes")[0].salario, 12.5);
});

await ok("R&S: comportamento antigo — aprovado_cliente, sem contratação e sem admissão", async () => {
  const db = cenario({ tipo: "recrutamento_selecao", vagaId: ID.V_RS });
  const r = await aprovar(ID.S_PEND);
  await flush();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.admissao_criada, false);
  assert.equal(r.corpo.contratado, false);
  const cv = linhas(db, "candidatos_vagas").find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cv.etapa, "aprovado_cliente");
  assert.equal(linhas(db, "admissoes").length, 0);
  assert.equal(linhas(db, "encaminhamentos").filter((e: any) => e.status === "aprovado").length, 1);
  assert.equal(auditoria(db).some((x: any) => x.acao === "candidato_finalizado"), false);
  assert.equal(auditoria(db).find((x: any) => x.acao === "indicacao_candidato_aprovada").detalhes.contratado, false);
});

await ok("falha ao criar a admissão: reverte candidato, candidatura e encaminhamento; indicação segue pendente; erro claro", async () => {
  const db = cenario();
  const antes = estadoBanco(db);
  db.falhas["admissao_documentos.insert"] = "boom docs";
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 500);
  assert.match(r.corpo.error, /admissão/i);
  assert.deepEqual(estadoBanco(db), antes);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
  assert.equal(auditoria(db).some((x: any) => x.acao === "indicacao_candidato_aprovada"), false);
  assert.ok(auditoria(db).some((x: any) => x.acao === "indicacao_candidato_erro_admissao"));
});

await ok("falha ao criar a admissão (vinculado): não apaga o cadastro existente, só o que a requisição criou", async () => {
  const db = cenario();
  db.tabelas.candidatos.push({ id: EXISTENTE, nome_completo: "Maria de Souza Lima", telefone: "(19) 98765-4321", email: "maria@exemplo.com", etapa_kanban: "banco_talentos", origem: "cadastro_rapido" });
  const antes = estadoBanco(db);
  db.falhas["admissoes.insert"] = "boom adm";
  const r = await aprovar(ID.S_PEND, { candidato_existente_id: EXISTENTE });
  assert.equal(r.status, 500);
  assert.deepEqual(estadoBanco(db), antes);
  assert.ok(linhas(db, "candidatos").some((c: any) => c.id === EXISTENTE), "cadastro existente continua lá");
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
});

await ok("falha na contratação (último passo): desfaz a aprovação e tudo que foi criado, inclusive a admissão", async () => {
  const db = cenario();
  const antes = estadoBanco(db);
  db.falhas["candidatos_vagas.update"] = "boom contratacao";
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 500);
  assert.match(r.corpo.error, /contrata/i);
  assert.deepEqual(estadoBanco(db), antes);
  const s = sol(db, ID.S_PEND);
  assert.equal(s.status, "pendente");
  assert.equal(s.candidato_id, null);
  assert.equal(s.candidatos_vaga_id, null);
  assert.equal(s.decidido_por, null);
  assert.ok(auditoria(db).some((x: any) => x.acao === "indicacao_candidato_erro_finalizacao"));
  assert.equal(db.emails.length, 0, "nenhum e-mail de fechamento/aprovação saiu antes da falha");
});

await ok("dados da admissão incompletos (MOT sem horário): 422 claro e NADA criado", async () => {
  const db = cenario({ solExtra: { admissao_horario: null } });
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 422);
  assert.equal(r.corpo.codigo, "dados_admissao_incompletos");
  assert.deepEqual(r.corpo.faltando, ["Horário"]);
  assert.deepEqual(estadoBanco(db), antes);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
});

await ok("MOT sem entidade contratante no cliente: aprova e contrata, NÃO cria admissão, devolve aviso e audita o motivo", async () => {
  const db = cenario();
  db.tabelas.clientes.find((c: any) => c.id === "C1").entidade_contratante = null;
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND);
  await flush();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.contratado, true);
  assert.equal(r.corpo.admissao_criada, false);
  assert.equal(r.corpo.admissao_id, null);
  assert.equal(r.corpo.aviso_admissao, "Cliente sem entidade contratante cadastrada. Cadastre e inicie a admissão em Admissões.");
  assert.equal(linhas(db, "admissoes").length, 0);
  assert.equal(linhas(db, "admissao_documentos").length, 0);
  const e = estadoBanco(db);
  assert.equal(e.candidatos, antes.candidatos + 1);
  assert.equal(e.cvs, antes.cvs + 1);
  assert.equal(e.enc, antes.enc + 1);
  const cv = linhas(db, "candidatos_vagas").find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cv.etapa, "contratado");
  assert.equal(cv.data_inicio, "2026-11-02");
  assert.equal(linhas(db, "candidatos").find((c: any) => c.id === r.corpo.candidato_id).status_alocacao, "alocado_mot");
  assert.equal(sol(db, ID.S_PEND).status, "aprovada");
  const aprov = auditoria(db).find((x: any) => x.acao === "indicacao_candidato_aprovada");
  assert.equal(aprov.detalhes.contratado, true);
  assert.equal(aprov.detalhes.admissao_criada, false);
  assert.equal(aprov.detalhes.admissao_nao_criada_motivo, "cliente_sem_entidade_contratante");
  assert.ok(auditoria(db).some((x: any) => x.acao === "candidato_finalizado" && x.detalhes.resultado === "contratado"));
  assert.equal(db.emails.filter((x: any) => x.tipo === "admissao_link").length, 0);
});

await ok("com admissão criada, aviso_admissao é null (sem aviso)", async () => {
  cenario();
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.aviso_admissao, null);
  assert.equal(r.corpo.admissao_criada, true);
});

await ok("a indicação já está 'aprovada' quando a finalização roda (finalização é o último passo)", async () => {
  const db = cenario();
  // Observa o estado da indicação no instante em que a candidatura vira 'contratado'.
  let statusNaFinalizacao: string | null = null;
  const orig = db.falhas;
  Object.defineProperty(db, "falhas", {
    get() {
      return new Proxy(orig, {
        get: (t, k) => {
          if (k === "candidatos_vagas.update") statusNaFinalizacao = sol(db, ID.S_PEND).status;
          return (t as any)[k];
        },
      });
    },
  });
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(statusNaFinalizacao, "aprovada");
});

await ok("MOT sem salário: 422 claro e NADA criado", async () => {
  const db = cenario({ solExtra: { admissao_salario: null, admissao_salario_hora: null } });
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 422);
  assert.equal(r.corpo.codigo, "dados_admissao_incompletos");
  assert.deepEqual(r.corpo.faltando, ["Salário (mensal ou por hora)"]);
  assert.deepEqual(estadoBanco(db), antes);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
  assert.equal(db.emails.length, 0);
});

await ok("MOT sem função e sem data de início: 422 lista os dois; nada criado", async () => {
  const db = cenario({ solExtra: { admissao_funcao: "  ", admissao_data_inicio: null } });
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 422);
  assert.deepEqual(r.corpo.faltando, ["Função", "Data de início"]);
  assert.deepEqual(estadoBanco(db), antes);
});

// ── Data de término (MOT): obrigatória, não anterior ao início, máx. 180 dias; sempre vazia na tela, nunca deduzida do texto ──
await ok("regra pura: início 02/11/2026 — 180 dias é o limite; 181, anterior, vazia e inválida são recusadas", () => {
  const I = "2026-11-02";
  assert.equal(erroDataTermino(I, "2027-05-01"), null); // +180
  assert.match(erroDataTermino(I, "2027-05-02")!, /180 dias/); // +181
  assert.match(erroDataTermino(I, "2026-11-01")!, /anterior/);
  assert.equal(erroDataTermino(I, I), null); // mesmo dia do início passa (não é anterior)
  assert.match(erroDataTermino(I, "")!, /Informe a data de término/);
  assert.match(erroDataTermino(I, "2026-02-30")!, /inválida/);
  assert.equal(somarDiasIso(I, 90), "2027-01-31");
  assert.equal(diasEntre(I, "2027-05-01"), 180);
});

await ok("MOT: a data de término informada vai para a candidatura e para a alocação (e para o histórico)", async () => {
  const db = cenario();
  const r = await aprovar(ID.S_PEND, { data_fim: "2027-01-31" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const cv = linhas(db, "candidatos_vagas").find((c: any) => c.id === r.corpo.candidatos_vaga_id);
  assert.equal(cv.data_fim, "2027-01-31");
  assert.equal(linhas(db, "candidatos").find((c: any) => c.id === r.corpo.candidato_id).alocacao_data_fim, "2027-01-31");
  assert.ok(linhas(db, "historico_candidato").some((h: any) => h.tipo === "contratado" && /até 31\/01\/2027/.test(h.descricao)));
});

await ok("MOT sem data de término: 422 e NADA criado (o texto 'admissao_tempo_contrato' não é usado para deduzir)", async () => {
  const db = cenario({ solExtra: { admissao_tempo_contrato: "180 dias, prorrogável por mais 90 dias" } });
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND, { data_fim: undefined });
  assert.equal(r.status, 422);
  assert.equal(r.corpo.codigo, "data_termino_invalida");
  assert.match(r.corpo.error, /Informe a data de término/);
  assert.deepEqual(estadoBanco(db), antes);
  assert.equal(sol(db, ID.S_PEND).status, "pendente");
});

await ok("MOT com data de término anterior ao início: 422 e nada criado", async () => {
  const db = cenario();
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND, { data_fim: "2026-11-01" });
  assert.equal(r.status, 422);
  assert.match(r.corpo.error, /anterior/);
  assert.deepEqual(estadoBanco(db), antes);
});

await ok("MOT com 181 dias: 422; com exatamente 180 dias: aprova", async () => {
  const db = cenario();
  const antes = estadoBanco(db);
  const r181 = await aprovar(ID.S_PEND, { data_fim: "2027-05-02" });
  assert.equal(r181.status, 422);
  assert.match(r181.corpo.error, /180 dias/);
  assert.deepEqual(estadoBanco(db), antes);
  const r180 = await aprovar(ID.S_PEND, { data_fim: "2027-05-01" });
  assert.equal(r180.status, 200, JSON.stringify(r180.corpo));
  assert.equal(linhas(db, "candidatos_vagas").find((c: any) => c.id === r180.corpo.candidatos_vaga_id).data_fim, "2027-05-01");
});

await ok("formato inválido de data_fim: 400 pelo schema e nada criado", async () => {
  const db = cenario();
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND, { data_fim: "31/01/2027" });
  assert.equal(r.status, 400);
  assert.deepEqual(estadoBanco(db), antes);
});

await ok("MOT vinculado a cadastro existente também exige a data de término", async () => {
  const db = cenario();
  db.tabelas.candidatos.push({ id: EXISTENTE, nome_completo: "Maria de Souza Lima", telefone: "(19) 98765-4321", email: "m@x.com", etapa_kanban: "banco_talentos", origem: "cadastro_rapido" });
  const antes = estadoBanco(db);
  const r = await aprovar(ID.S_PEND, { candidato_existente_id: EXISTENTE, data_fim: undefined });
  assert.equal(r.status, 422);
  assert.deepEqual(estadoBanco(db), antes);
});

await ok("Terceirização exige a mesma data de término (obrigatória, até 180 dias) e a grava", async () => {
  const db = cenario({ tipo: "terceirizacao" });
  const antes = estadoBanco(db);
  const sem = await aprovar(ID.S_PEND, { data_fim: undefined });
  assert.equal(sem.status, 422);
  assert.equal(sem.corpo.codigo, "data_termino_invalida");
  const longa = await aprovar(ID.S_PEND, { data_fim: "2027-05-02" });
  assert.equal(longa.status, 422);
  assert.deepEqual(estadoBanco(db), antes);
  const ok180 = await aprovar(ID.S_PEND, { data_fim: "2027-05-01" });
  assert.equal(ok180.status, 200, JSON.stringify(ok180.corpo));
  assert.equal(linhas(db, "candidatos_vagas").find((c: any) => c.id === ok180.corpo.candidatos_vaga_id).data_fim, "2027-05-01");
  assert.equal(linhas(db, "admissoes")[0].modalidade, "terceirizacao");
});

await ok("R&S não exige data de término (e não a grava)", async () => {
  const db = cenario({ tipo: "recrutamento_selecao", vagaId: ID.V_RS });
  const r = await aprovar(ID.S_PEND, { data_fim: undefined });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(linhas(db, "candidatos_vagas").find((c: any) => c.id === r.corpo.candidatos_vaga_id).data_fim ?? null, null);
});

await ok("R&S não exige dados de admissão: indicação sem horário/salário aprova como antes", async () => {
  const db = cenario({ tipo: "recrutamento_selecao", vagaId: ID.V_RS, solExtra: { admissao_horario: null, admissao_salario: null, admissao_funcao: null } });
  const r = await aprovar(ID.S_PEND);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(linhas(db, "admissoes").length, 0);
});

console.log(`\n${n} verificações OK`);
void solicitacaoBase;
