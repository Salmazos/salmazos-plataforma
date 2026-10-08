// Cenários de indicação que DEVEM dar resultado idêntico na main e na branch: criação válida, decisão sem edição e
// listagem sem edição ("idêntico ao de hoje"). Imprime um JSON que o run-indicacao.mjs compara lado a lado.
import { congelarData, logar, logarPortal, importar, chamar, auditoria } from "./ambiente.mjs";
import { novoDbIndicacao, ID, emailsPara, sinos, solSemRuido } from "./ambiente-indicacao.mjs";

congelarData();

const criar = await importar("src/app/api/portal/indicar-candidato/route.ts");
const listar = await importar("src/app/api/portal/minhas-indicacoes/route.ts");
const decisao = await importar("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts");

const corpoCriacao = (extra = {}) => ({
  vaga_id: ID.V_MOT_A, candidato_nome: "Fulano de Tal", candidato_telefone: "(19) 90000-1111", curriculo_url: "novo.pdf",
  admissao_data_inicio: "2026-11-10", admissao_salario: 1800, admissao_setor: "Logística", admissao_funcao: "Auxiliar", admissao_vt: false,
  admissao_observacoes: "Observação", ...extra,
});

// Estado completo observável depois de cada cenário (sem ruído: cpf aleatório mascarado).
function estado(db) {
  const t = (n) => (db.tabelas[n] ?? []).map((l) => ({ ...l })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    solicitacoes: solSemRuido(db),
    candidatos: t("candidatos").map((c) => ({ ...c, cpf: String(c.cpf ?? "").startsWith("TEMP-") ? "TEMP-*" : c.cpf })),
    candidatos_vagas: t("candidatos_vagas"),
    encaminhamentos: t("encaminhamentos").map(({ criado_em, ...r }) => r),
    historico: t("historico_candidato").map(({ criado_em, ...r }) => r),
    sinos: sinos(db),
    emails: emailsPara(db),
    portal_avisos: t("portal_avisos").map(({ criado_em, ...r }) => r),
    auditoria: auditoria(db),
  };
}

const sem = (obj, ...chaves) => JSON.parse(JSON.stringify(obj, (k, v) => (chaves.includes(k) ? undefined : v)));

const cenarios = {
  async criacao_valida_mot() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao() }), ...estado(db) };
  },
  async criacao_sem_data_de_inicio() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao({ admissao_data_inicio: null }) }), ...estado(db) };
  },
  async criacao_data_de_hoje() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao({ admissao_data_inicio: "2026-10-07" }) }), ...estado(db) };
  },
  async criacao_rs_valida() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao({ vaga_id: ID.V_RS, admissao_funcao: "Analista" }) }), ...estado(db) };
  },
  async criacao_vaga_de_outro_cliente() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao({ vaga_id: ID.V_OUTRO_CLIENTE }) }), ...estado(db) };
  },
  async criacao_vaga_fechada() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao({ vaga_id: ID.V_FECHADA }) }), ...estado(db) };
  },
  async criacao_sem_nome() {
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao({ candidato_nome: "  " }) }), ...estado(db) };
  },
  async criacao_sem_login() {
    const db = novoDbIndicacao(); logarPortal(db, null);
    return { resp: await chamar(criar.POST, { metodo: "POST", corpo: corpoCriacao() }), ...estado(db) };
  },
  async listagem_sem_edicao() {
    // Só o que a tela já usava: a branch acrescenta `pode_editar`, que sai da comparação (e é afirmado em outro cenário).
    const db = novoDbIndicacao(); logarPortal(db, "cli");
    const r = await chamar(listar.GET);
    return { status: r.status, corpo: sem(r.corpo, "pode_editar") };
  },
  async listagem_outro_usuario_do_mesmo_cliente() {
    const db = novoDbIndicacao(); logarPortal(db, "cli2");
    const r = await chamar(listar.GET);
    return { status: r.status, corpo: sem(r.corpo, "pode_editar") };
  },
  async listagem_sem_login() {
    const db = novoDbIndicacao(); logarPortal(db, null);
    return await chamar(listar.GET);
  },
  async decisao_aprovar_sem_edicao() {
    const db = novoDbIndicacao(); logar(db, "dir");
    return { resp: await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } }), ...estado(db) };
  },
  async decisao_aprovar_candidato_existente() {
    const db = novoDbIndicacao(); logar(db, "dir");
    return { resp: await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_IRMA }, corpo: { acao: "aprovar", candidato_existente_id: ID.CAND_EXISTENTE } }), ...estado(db) };
  },
  async decisao_recusar_sem_edicao() {
    const db = novoDbIndicacao(); logar(db, "dir");
    return { resp: await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "recusar", motivo: "Sem perfil" } }), ...estado(db) };
  },
  async decisao_indicacao_ja_decidida() {
    const db = novoDbIndicacao(); logar(db, "dir");
    return { resp: await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_APROV }, corpo: { acao: "aprovar" } }), ...estado(db) };
  },
  async decisao_vaga_fechada() {
    const db = novoDbIndicacao(); logar(db, "dir");
    db.tabelas.vagas.find((v) => v.id === ID.V_MOT_A).status = "fechada";
    return { resp: await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } }), ...estado(db) };
  },
  async decisao_sem_login() {
    const db = novoDbIndicacao(); logar(db, null);
    return { resp: await chamar(decisao.POST, { metodo: "POST", params: { id: ID.S_PEND }, corpo: { acao: "aprovar" } }), ...estado(db) };
  },
};

const resultado = {};
for (const [nome, fn] of Object.entries(cenarios)) {
  try { resultado[nome] = await fn(); } catch (e) { resultado[nome] = { EXCECAO: String(e?.stack ?? e).slice(0, 600) }; }
}
console.log(`RESULTADO_JSON:${JSON.stringify(resultado)}`);
