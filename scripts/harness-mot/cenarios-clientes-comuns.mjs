// Cenários de clientes que DEVEM dar resultado idêntico na main e na branch: cadastro sem coincidência,
// edição sem campo de identidade, inativar sem coincidência, listagem sem filtro. Imprime JSON pro run-clientes.mjs.
import { congelarData, novoDbClientes, logar, importar, chamar, auditoria, estadoClientes, porNome } from "./ambiente-clientes.mjs";

congelarData();
const lista = await importar("src/app/api/clientes/route.ts");
const porId = await importar("src/app/api/clientes/[id]/route.ts");

const novo = (extra = {}) => ({
  nome: "Zeta Usinagem Fina", contato_nome: "Maria", contato_telefone: "(19) 91234-0001", contato_email: "zeta@zeta-usinagem.test",
  cidade: "Sumaré", segmento: "Indústria", servicos: ["terceirizacao"], cnpj: "11.222.333/0001-81", endereco: "Rua das Palmeiras, 10, Sumaré",
  ...extra,
});

const estado = (db) => ({ clientes: estadoClientes(db), auditoria: auditoria(db) });

const cenarios = {
  async cadastro_sem_coincidencia_diretoria() {
    const db = novoDbClientes(); logar(db, "dir");
    return { resp: await chamar(lista.POST, { metodo: "POST", corpo: novo() }), ...estado(db) };
  },
  async cadastro_sem_coincidencia_supervisor() {
    const db = novoDbClientes(); logar(db, "sup1");
    return { resp: await chamar(lista.POST, { metodo: "POST", corpo: novo() }), ...estado(db) };
  },
  async cadastro_sem_cnpj_nem_contato() {
    const db = novoDbClientes(); logar(db, "sup1");
    return { resp: await chamar(lista.POST, { metodo: "POST", corpo: { nome: "Omega Plásticos Especiais", cidade: "Monte Mor", segmento: "Indústria" } }), ...estado(db) };
  },
  async edicao_sem_campo_de_identidade() {
    const db = novoDbClientes(); logar(db, "dir");
    const id = porNome("Amplo").id;
    const resp = await chamar(porId.PATCH, { metodo: "PATCH", params: { id }, corpo: { cidade: "Campinas", segmento: "Serviços", contato_nome: "Outro Contato", servicos: ["rs"], responsavel_comercial: "Fulano" } });
    return { resp, ...estado(db) };
  },
  async edicao_de_cliente_que_convive_com_gemeo_sem_mexer_em_contato() {
    const db = novoDbClientes(); logar(db, "sup1");
    const id = porNome("Hewitt").id;
    const resp = await chamar(porId.PATCH, { metodo: "PATCH", params: { id }, corpo: { cidade: "Sumaré", contato_nome: "Novo Nome de Contato" } });
    return { resp, ...estado(db) };
  },
  async inativar_sem_coincidencia() {
    const db = novoDbClientes(); logar(db, "dir");
    const id = porNome("Amplo").id;
    return { resp: await chamar(porId.PATCH, { metodo: "PATCH", params: { id }, corpo: { ativo: false } }), ...estado(db) };
  },
  async listagem_sem_filtro_continua_igual() {
    const db = novoDbClientes(); logar(db, "dir");
    const dir = await chamar(lista.GET, { url: "http://t/api/clientes" });
    logar(db, "sup2");
    const sup2 = await chamar(lista.GET, { url: "http://t/api/clientes" });
    return { dirTotal: dir.corpo.data.length, dirInativos: dir.corpo.data.filter((c) => !c.ativo).length, sup2: sup2.corpo.data.map((c) => c.id) };
  },
  async anonimo_e_sem_acesso() {
    const db = novoDbClientes(); logar(db, null);
    const anonimoPost = await chamar(lista.POST, { metodo: "POST", corpo: novo() });
    const anonimoPatch = await chamar(porId.PATCH, { metodo: "PATCH", params: { id: porNome("Amplo").id }, corpo: { cidade: "X" } });
    return { anonimoPost, anonimoPatch, ...estado(db) };
  },
};

const saida = {};
for (const [nome, fn] of Object.entries(cenarios)) {
  try { saida[nome] = await fn(); } catch (e) { saida[nome] = { EXCECAO: String(e.stack ?? e).slice(0, 600) }; }
}
console.log(`RESULTADO_JSON:${JSON.stringify(saida)}`);
