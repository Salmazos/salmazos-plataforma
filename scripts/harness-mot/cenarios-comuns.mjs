// Cenários que DEVEM dar resultado idêntico na main e na branch ("sem evento = igual ao de hoje").
// Rodado uma vez por checkout (HARNESS_ROOT); imprime um JSON que o run.mjs compara lado a lado.
import { congelarData, novoDb, logar, logarPortal, importar, chamar, tabela, auditoria, serializar, idMot, F_D1, F_T1 } from "./ambiente.mjs";

congelarData();

const popupPainel = await importar("src/app/api/funcionarios/vencimento-contrato/popup/route.ts");
const marcarVistoPainel = await importar("src/app/api/funcionarios/vencimento-contrato/popup/marcar-visto/route.ts");
const popupPortal = await importar("src/app/api/portal/funcionarios/vencimento-contrato/popup/route.ts");
const rescisoes = await importar("src/app/api/rescisoes/route.ts");
const rescisaoPorId = await importar("src/app/api/rescisoes/[id]/route.ts");
const paginaPainel = (await importar("src/app/painel/vencimento-contrato/page.tsx")).default;
const paginaPortal = (await importar("src/app/portal/(app)/vencimento-contrato/page.tsx")).default;

const rescisaoBody = (funcionarioId, extra = {}) => ({
  funcionario_id: funcionarioId, empresa: "Cliente Um", data_desligamento: "2026-10-07", modalidade: "pedido_demissao",
  valor_rescisao: 1500, data_pagamento_rescisao: "2026-10-15", ...extra,
});

async function pagina(fn) {
  try { return serializar(await fn()); } catch (e) { return { erro: String(e.message) }; }
}

const estadoRescisao = (db) => ({
  rescisoes: tabela(db, "rescisoes", ["funcionario_id", "unidade_id", "empresa", "data_desligamento", "modalidade", "valor_rescisao", "data_pagamento_rescisao", "faturado", "criado_por"]),
  funcionarios: tabela(db, "funcionarios", ["id", "status"]).filter((f) => [idMot(3), idMot(6), F_D1, F_T1].includes(f.id)),
  auditoria: auditoria(db),
  avisos: db.avisosDisparados.map((a) => ({ momento: a.momento })),
});

const cenarios = {
  async popup_painel_diretoria() {
    const db = novoDb(); logar(db, "dir");
    return await chamar(popupPainel.GET);
  },
  async popup_painel_supervisor_u1() {
    const db = novoDb(); logar(db, "sup1");
    return await chamar(popupPainel.GET);
  },
  async popup_painel_supervisor_u2() {
    const db = novoDb(); logar(db, "sup2");
    return await chamar(popupPainel.GET);
  },
  async popup_painel_analista_e_anonimo() {
    const db = novoDb();
    logar(db, "ana");
    const analista = await chamar(popupPainel.GET);
    logar(db, null);
    return { analista, anonimo: await chamar(popupPainel.GET) };
  },
  async popup_painel_marcar_visto() {
    const db = novoDb(); logar(db, "dir");
    const antes = await chamar(popupPainel.GET);
    const visto = await chamar(marcarVistoPainel.POST, { metodo: "POST" });
    const depois = await chamar(popupPainel.GET);
    return { jaVistoAntes: antes.corpo.ja_visto, visto, jaVistoDepois: depois.corpo.ja_visto, itens: depois.corpo.data.length };
  },
  async popup_portal_cliente_c1() {
    const db = novoDb(); logarPortal(db, "cli");
    return await chamar(popupPortal.GET);
  },
  async popup_portal_anonimo() {
    novoDb();
    return await chamar(popupPortal.GET);
  },
  async relatorio_painel_diretoria() {
    const db = novoDb(); logar(db, "dir");
    return await pagina(paginaPainel);
  },
  async relatorio_painel_supervisor_u1() {
    const db = novoDb(); logar(db, "sup1");
    return await pagina(paginaPainel);
  },
  async relatorio_portal_cliente_c1() {
    const db = novoDb(); logarPortal(db, "cli");
    return await pagina(paginaPortal);
  },
  async rescisao_data_de_hoje_desliga_na_hora() {
    const db = novoDb(); logar(db, "dir");
    const r = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(idMot(3), { data_desligamento: "2026-10-07" }) });
    return { status: r.status, sucesso: !!r.corpo.data, estado: estadoRescisao(db) };
  },
  async rescisao_data_passada_desliga_na_hora() {
    const db = novoDb(); logar(db, "dir");
    const r = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(idMot(6), { data_desligamento: "2026-09-30", modalidade: "efetivado" }) });
    return { status: r.status, sucesso: !!r.corpo.data, estado: estadoRescisao(db) };
  },
  async rescisao_funcionario_ja_desligado() {
    const db = novoDb(); logar(db, "dir");
    const r = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(F_D1, { data_desligamento: "2026-09-30" }) });
    return { r, estado: estadoRescisao(db) };
  },
  async rescisao_gates_e_validacao() {
    const db = novoDb();
    logar(db, null);
    const anonimo = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(idMot(3)) });
    logar(db, "ana");
    const analista = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(idMot(3)) });
    logar(db, "sup2");
    const outraUnidade = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(idMot(3)) });
    logar(db, "dir");
    const semModalidade = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody(idMot(3), { modalidade: undefined }) });
    const inexistente = await chamar(rescisoes.POST, { metodo: "POST", corpo: rescisaoBody("00000000-0000-4000-8000-00000000ffff") });
    return { anonimo, analista, outraUnidade, semModalidade, inexistente: inexistente.status, estado: estadoRescisao(db) };
  },
  async rescisao_patch_valor_sem_mexer_na_data() {
    const db = novoDb(); logar(db, "dir");
    const r = await chamar(rescisaoPorId.PATCH, { metodo: "PATCH", params: { id: "r-d1" }, corpo: { valor_rescisao: 250, faturado: true } });
    return { status: r.status, valor: r.corpo?.data?.valor_rescisao, estado: estadoRescisao(db) };
  },
  async rescisao_patch_outra_data_passada_em_desligado() {
    const db = novoDb(); logar(db, "dir");
    const r = await chamar(rescisaoPorId.PATCH, { metodo: "PATCH", params: { id: "r-d1" }, corpo: { data_desligamento: "2026-09-20" } });
    return { status: r.status, data: r.corpo?.data?.data_desligamento, estado: estadoRescisao(db) };
  },
  async rescisao_patch_gates() {
    const db = novoDb();
    logar(db, "ana");
    const analista = await chamar(rescisaoPorId.PATCH, { metodo: "PATCH", params: { id: "r-d1" }, corpo: { valor_rescisao: 1 } });
    logar(db, "sup2");
    const outraUnidade = await chamar(rescisaoPorId.PATCH, { metodo: "PATCH", params: { id: "r-d1" }, corpo: { valor_rescisao: 1 } });
    logar(db, "dir");
    const vazio = await chamar(rescisaoPorId.PATCH, { metodo: "PATCH", params: { id: "r-d1" }, corpo: {} });
    return { analista, outraUnidade, vazio };
  },
};

const resultado = {};
for (const [nome, fn] of Object.entries(cenarios)) {
  try {
    resultado[nome] = await fn();
  } catch (e) {
    resultado[nome] = { EXCECAO: String(e.stack ?? e) };
  }
}
console.log(`RESULTADO_JSON:${JSON.stringify(resultado)}`);
