// Asserções só da BRANCH: trava de duplicidade de clientes (bloqueio, aviso, liberação, reativação, outra unidade,
// cobrança R&S, vagas com cliente inativo, seletores, 23505).
import { congelarData, novoDbClientes, logar, importar, chamar, auditoria, estadoClientes, porNome, tabela, CLIENTE_U2, VAGA_DO_INATIVO, VAGA_NORMAL, COBRANCA, idCliente } from "./ambiente-clientes.mjs";

congelarData();
const lista = await importar("src/app/api/clientes/route.ts");
const porId = await importar("src/app/api/clientes/[id]/route.ts");
const vagas = await importar("src/app/api/vagas/route.ts");
const vagaPorId = await importar("src/app/api/vagas/[id]/route.ts");
const cobranca = await importar("src/app/api/cobrancas-rs/[id]/route.ts");

let falhas = 0;
function ok(nome, cond, detalhe) {
  if (!cond) falhas++;
  console.log(`${cond ? "OK   " : "FALHA"} ${nome}${cond || detalhe === undefined ? "" : `\n        ${JSON.stringify(detalhe).slice(0, 500)}`}`);
}
const POST = (corpo) => chamar(lista.POST, { metodo: "POST", corpo });
const PATCH = (id, corpo) => chamar(porId.PATCH, { metodo: "PATCH", params: { id }, corpo });
let seq = 0;
// O schema exige contato_nome/telefone/e-mail no cadastro: "sem sinal" = telefone e e-mail exclusivos.
const livre = () => { seq++; return { contato_nome: "Maria", contato_telefone: `(19) 95${String(seq).padStart(3, "0")}-0000`, contato_email: `livre${seq}@livre.test` }; };
const simples = (nome, extra = {}) => ({ nome, cidade: "Monte Mor", segmento: "Serviços", servicos: [], ...livre(), ...extra });
const novo = (extra = {}) => ({
  nome: "Zeta Usinagem Fina", contato_nome: "Maria", contato_telefone: "(19) 91234-0001", contato_email: "zeta@zeta-usinagem.test", cidade: "Sumaré", segmento: "Indústria", servicos: [], ...extra,
});
const total = (db) => db.tabelas.clientes.length;
const consultasClientes = (db) => db.consultas.filter((c) => c.tabela === "clientes" && c.op === "select").length;

// ── CNPJ ────────────────────────────────────────────────────────────────────────────────────────────
console.log("== CNPJ ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  const n0 = total(db);
  const alvo = porNome("Amplo"); // "00.000.008/0001-00"
  for (const formato of ["00.000.008/0001-00", "00000008000100", "00 000 008/0001-00", " 00.000.008/0001-00 "]) {
    const r = await POST(novo({ cnpj: formato, ...livre() }));
    ok(`CNPJ "${formato}" → 409 bloqueio sem liberação`, r.status === 409 && r.corpo.jaExiste === true && r.corpo.duplicidade.bloqueio === "cnpj" && r.corpo.duplicidade.podeLiberar === false && r.corpo.duplicidade.podeConfirmar === false, r);
  }
  const forcar = await POST(novo({ cnpj: "00.000.008/0001-00", ...livre(), liberar_bloqueio: true, confirmar_duplicidade: true }));
  ok("CNPJ igual: nem liberar_bloqueio nem confirmar_duplicidade (diretoria) passam", forcar.status === 409 && total(db) === n0, forcar);
  const inativo = await POST(novo({ cnpj: "00000013000100", ...livre() })); // Natural Labour (um inativo e um ativo)
  ok("CNPJ igual a cliente (ativo e inativo) → 409", inativo.status === 409 && inativo.corpo.duplicidade.bloqueio === "cnpj");
  ok("nenhuma linha criada nos bloqueios", total(db) === n0);
  ok("auditoria vazia nos bloqueios", auditoria(db).length === 0);
  void alvo;
}

// ── telefone + e-mail ───────────────────────────────────────────────────────────────────────────────
console.log("\n== Telefone + e-mail ==");
{
  const db = novoDbClientes();
  const ref = porNome("Amplo");
  const corpo = novo({ contato_telefone: ref.contato_telefone.replace("(19) ", "19").replace("-", ""), contato_email: ref.contato_email.toUpperCase() });
  logar(db, "sup1");
  const sup = await POST(corpo);
  ok("não-full: 409 bloqueio por contato, sem poder liberar", sup.status === 409 && sup.corpo.duplicidade.bloqueio === "contato" && sup.corpo.duplicidade.podeLiberar === false, sup);
  const supLib = await POST({ ...corpo, liberar_bloqueio: true });
  ok("não-full com liberar_bloqueio → 403", supLib.status === 403 && total(db) === 47, supLib);
  const supConf = await POST({ ...corpo, confirmar_duplicidade: true });
  ok("não-full com confirmar_duplicidade não vence o bloqueio", supConf.status === 409, supConf);
  logar(db, "dir");
  const dir = await POST(corpo);
  ok("full sem liberar: 409 com podeLiberar", dir.status === 409 && dir.corpo.duplicidade.podeLiberar === true && dir.corpo.duplicidade.nivel === "bloqueio", dir);
  const dirConf = await POST({ ...corpo, confirmar_duplicidade: true });
  ok("full com só confirmar_duplicidade continua bloqueado", dirConf.status === 409);
  const dirLib = await POST({ ...corpo, liberar_bloqueio: true });
  const aud = auditoria(db);
  ok("full com liberar_bloqueio → 201", dirLib.status === 201 && total(db) === 48, dirLib);
  ok("auditoria cliente_bloqueio_liberado só com ids e motivos", aud.length === 1 && aud[0].acao === "cliente_bloqueio_liberado" && aud[0].entidade_id === dirLib.corpo.data.id
    && aud[0].detalhes.existente_id === ref.id && Array.isArray(aud[0].detalhes.motivos) && !JSON.stringify(aud[0]).includes("@"), aud);
}

// ── sinal único / nome parecido ──────────────────────────────────────────────────────────────────────
console.log("\n== Aviso (um sinal) ==");
{
  const db = novoDbClientes(); logar(db, "sup1");
  const ref = porNome("Amplo");
  const soTel = novo({ contato_telefone: ref.contato_telefone, contato_email: livre().contato_email });
  const a = await POST(soTel);
  ok("só telefone → 409 aviso, pode confirmar", a.status === 409 && a.corpo.duplicidade.nivel === "aviso" && a.corpo.duplicidade.bloqueio === null && a.corpo.duplicidade.podeConfirmar === true && a.corpo.duplicidade.podeLiberar === false, a);
  const b = await POST({ ...soTel, confirmar_duplicidade: true });
  const aud = auditoria(db);
  ok("só telefone com confirmar_duplicidade → 201 + auditoria", b.status === 201 && aud.length === 1 && aud[0].acao === "cliente_duplicidade_confirmada", { b, aud });
  const soEmail = await POST(novo({ nome: "Eta Ferramentaria", contato_telefone: livre().contato_telefone, contato_email: ref.contato_email }));
  ok("só e-mail → 409 aviso", soEmail.status === 409 && soEmail.corpo.duplicidade.nivel === "aviso");
  const nomeP = await POST(simples("WGK Indústria Mecânica"));
  ok("nome parecido (WGK) → 409 aviso", nomeP.status === 409 && nomeP.corpo.duplicidade.nivel === "aviso" && nomeP.corpo.duplicidade.motivos.includes("nome"), nomeP);
  const endereco = await POST(novo({ nome: "Teta Logística", ...livre(), endereco: "Rua Teste, 100, Centro, Monte Mor/SP" }));
  ok("só endereço → 409 aviso (nunca bloqueio)", endereco.status === 409 && endereco.corpo.duplicidade.nivel === "aviso", endereco);
  const salmazos = await POST(simples("Salmazos Gestão de Pessoas"));
  ok("Salmazos Gestão… novo: no máximo aviso por nome, nunca bloqueio", salmazos.status === 201 || (salmazos.status === 409 && salmazos.corpo.duplicidade.nivel === "aviso"), salmazos);
  const rosa = await POST(simples("Rosa"));
  ok("Rosa × Rosakline: sem aviso de nome", rosa.status === 201, rosa);
}

// ── reativar ─────────────────────────────────────────────────────────────────────────────────────────
console.log("\n== Reativar ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  const inativoNL = porNome("Natural Labour ");
  const r1 = await PATCH(inativoNL.id, { ativo: true });
  ok("reativar Natural Labour (CNPJ já ativo em outro) → 409 bloqueio", r1.status === 409 && r1.corpo.duplicidade.bloqueio === "cnpj" && r1.corpo.duplicidade.podeLiberar === false, r1);
  ok("…e continua inativo", db.tabelas.clientes.find((c) => c.id === inativoNL.id).ativo === false);
  const r2 = await PATCH(inativoNL.id, { ativo: true, liberar_bloqueio: true });
  ok("…nem liberar_bloqueio libera CNPJ", r2.status === 409);
  const wgk = porNome("WGK Industria");
  const r3 = await PATCH(wgk.id, { ativo: true });
  ok("reativar WGK (tel+e-mail do WGK ativo) → 409 bloqueio por contato, full pode liberar", r3.status === 409 && r3.corpo.duplicidade.bloqueio === "contato" && r3.corpo.duplicidade.podeLiberar === true, r3);
  const r4 = await PATCH(wgk.id, { ativo: true, liberar_bloqueio: true });
  const acoes = auditoria(db).map((a) => a.acao).sort();
  ok("full libera: reativa + auditoria bloqueio_liberado e cliente_reativado", r4.status === 200 && r4.corpo.data.ativo === true && acoes.join() === "cliente_bloqueio_liberado,cliente_reativado", { r4, acoes });
  // Reativar sem coincidência nenhuma: cliente novo inativo sem sinais.
  db.tabelas.clientes.push({ id: idCliente(901), nome: "Iota Fundição", cidade: "Sumaré", ativo: false, unidade_id: "U1", cnpj: null, contato_telefone: null, contato_email: null, endereco: null, servicos: [] });
  const r5 = await PATCH(idCliente(901), { ativo: true });
  ok("reativar sem coincidência → 200 + auditoria cliente_reativado", r5.status === 200 && r5.corpo.data.ativo === true && auditoria(db).some((a) => a.acao === "cliente_reativado" && a.entidade_id === idCliente(901)), r5);
  // Resposta de POST oferece reativar quando o coincidente é inativo.
  const dup = await POST(novo({ nome: "Natural Labour Nova", contato_telefone: "(19) 90004-0000", contato_email: livre().contato_email }));
  ok("POST que coincide só com tel de ativo+inativo oferece existente ativo (aviso, sem reativar)", dup.status === 409 && dup.corpo.duplicidade.podeReativar === false, dup);
  const soInativo = await POST(simples("Teta Moldes", { contato_email: "c2@exemplo.test" }));
  ok("coincidência só com WGK ativo+inativo: sem reativar quando há ativo coincidindo", soInativo.status === 409 && soInativo.corpo.duplicidade.podeReativar === false, soInativo);
  const db2 = novoDbClientes(); logar(db2, "dir");
  db2.tabelas.clientes.find((c) => c.nome.includes("United Mills")).ativo = false; // só o inativo "Natural Labour " e este ficam
  const soI = await POST(novo({ cnpj: "00.000.013/0001-00", ...livre() }));
  ok("CNPJ só de inativos → 409 bloqueio e podeReativar", soI.status === 409 && soI.corpo.duplicidade.bloqueio === "cnpj" && soI.corpo.duplicidade.podeReativar === true && soI.corpo.duplicidade.existente.ativo === false, soI);
}

// ── reativação: só BLOQUEIOS valem (decisão do Olver) ──────────────────────────────────────────────────
console.log("\n== Reativação: aviso não se aplica ==");
{
  const db = novoDbClientes(); logar(db, "sup1");
  const amplo = porNome("Amplo");
  const inativo = (n, extra) => { const c = { id: idCliente(n), nome: `Inativo ${n}`, cidade: "Sumaré", ativo: false, unidade_id: "U1", cnpj: null, contato_telefone: `(19) 96${n}-0000`, contato_email: `inat${n}@inat.test`, endereco: null, servicos: [], ...extra }; db.tabelas.clientes.push(c); return c.id; };
  const soTel = inativo(910, { contato_telefone: amplo.contato_telefone });
  const r1 = await PATCH(soTel, { ativo: true });
  ok("reativar com SÓ telefone igual a outro → 200 (aviso não se aplica)", r1.status === 200 && r1.corpo.data.ativo === true, r1);
  const soEmail = inativo(911, { contato_email: amplo.contato_email });
  const r2 = await PATCH(soEmail, { ativo: true });
  ok("reativar com SÓ e-mail igual a outro → 200", r2.status === 200, r2);
  const nomeP = inativo(912, { nome: "Amplo Soluções Industriais" });
  const r3 = await PATCH(nomeP, { ativo: true });
  ok("reativar com nome parecido de outro → 200", r3.status === 200, r3);
  const end = inativo(913, { endereco: "Rua Teste, 100, Centro, Monte Mor/SP" });
  const r4 = await PATCH(end, { ativo: true });
  ok("reativar com endereço igual → 200", r4.status === 200, r4);
  const cnpjConf = inativo(914, { cnpj: amplo.cnpj });
  const r5 = await PATCH(cnpjConf, { ativo: true });
  ok("reativar com CNPJ de OUTRO cliente → 409 bloqueio, mensagem de reativação, sem oferecer reativar", r5.status === 409 && r5.corpo.duplicidade.bloqueio === "cnpj" && r5.corpo.duplicidade.podeReativar === false && /Não é possível reativar/.test(r5.corpo.error), r5);
  ok("…e continua inativo", db.tabelas.clientes.find((c) => c.id === cnpjConf).ativo === false);
  const contato = inativo(915, { contato_telefone: amplo.contato_telefone, contato_email: amplo.contato_email });
  const r6 = await PATCH(contato, { ativo: true });
  ok("reativar com telefone E e-mail do mesmo cliente → 409 bloqueio (não-full, sem liberar)", r6.status === 409 && r6.corpo.duplicidade.bloqueio === "contato" && r6.corpo.duplicidade.podeLiberar === false, r6);
  const r7 = await PATCH(contato, { ativo: true, liberar_bloqueio: true });
  ok("…não-full com liberar_bloqueio → 403", r7.status === 403, r7);
  logar(db, "dir");
  const r8 = await PATCH(contato, { ativo: true });
  ok("…diretoria vê podeLiberar", r8.status === 409 && r8.corpo.duplicidade.podeLiberar === true, r8);
  const r9 = await PATCH(contato, { ativo: true, liberar_bloqueio: true });
  ok("…diretoria libera → 200", r9.status === 200 && r9.corpo.data.ativo === true, r9);
  const misto = inativo(916, {});
  const r10 = await PATCH(misto, { ativo: true, nome: "Brotto Figs Sul" });
  ok("reativar JUNTO com mudança de nome parecido → regra normal de edição (aviso 409)", r10.status === 409 && r10.corpo.duplicidade.nivel === "aviso", r10);
}

// ── editar contato de quem já convive com gêmeo ──────────────────────────────────────────────────────
console.log("\n== Edição ==");
{
  const db = novoDbClientes(); logar(db, "sup1");
  const hewitt = porNome("Hewitt");
  const r1 = await PATCH(hewitt.id, { contato_nome: "Fulano", contato_telefone: hewitt.contato_telefone, contato_email: hewitt.contato_email, cidade: "Sumaré" });
  ok("Hewitt: reenviar o mesmo telefone/e-mail e mudar contato_nome NÃO bloqueia", r1.status === 200, r1);
  const r2 = await PATCH(hewitt.id, { contato_telefone: "(19) 93333-4444" });
  ok("Hewitt: trocar telefone para número livre NÃO bloqueia", r2.status === 200, r2);
  const r3 = await PATCH(hewitt.id, { contato_telefone: "(19) 93333-4444", contato_email: "hewitt.novo@exemplo.test" });
  ok("Hewitt: trocar os dois contatos NÃO bloqueia", r3.status === 200, r3);
  const r4 = await PATCH(hewitt.id, { contato_telefone: porNome("Amplo").contato_telefone });
  ok("Hewitt: trocar telefone para o de OUTRO cliente → aviso 409", r4.status === 409 && r4.corpo.duplicidade.nivel === "aviso", r4);
  const r5 = await PATCH(hewitt.id, { contato_telefone: porNome("Amplo").contato_telefone, contato_email: porNome("Amplo").contato_email });
  ok("Hewitt: trocar os dois para os do mesmo outro cliente → bloqueio contato", r5.status === 409 && r5.corpo.duplicidade.bloqueio === "contato", r5);
  const r6 = await PATCH(hewitt.id, { cnpj: "00.000.008/0001-00" });
  ok("Hewitt: CNPJ de outro cliente → bloqueio", r6.status === 409 && r6.corpo.duplicidade.bloqueio === "cnpj", r6);
  const r7 = await PATCH(porNome("Amplo").id, { cnpj: "00000008000100" });
  ok("editar o próprio CNPJ sem mudar o valor (outro formato) NÃO conflita consigo mesmo", r7.status === 200, r7);
  const r8 = await PATCH(porNome("Amplo").id, { nome: "Amplo Soluções" });
  ok("editar nome sem mudar de fato: livre (ignora o próprio registro)", r8.status === 200, r8);
  const r9 = await PATCH(porNome("Amplo").id, { nome: "Brotto Figs Brasil" });
  ok("trocar nome para parecido com outro (prefixo por palavra) → aviso", r9.status === 409 && r9.corpo.duplicidade.nivel === "aviso", r9);
  const r10 = await PATCH(porNome("Amplo").id, { nome: "Brotto Figs Brasil", confirmar_duplicidade: true });
  ok("…e passa com confirmar_duplicidade", r10.status === 200 && auditoria(db).some((a) => a.acao === "cliente_duplicidade_confirmada"), r10);
}

// ── outra unidade ────────────────────────────────────────────────────────────────────────────────────
console.log("\n== Outra unidade ==");
{
  const db = novoDbClientes(); logar(db, "sup1");
  const n0 = total(db);
  const r = await POST(novo({ cnpj: "99999999000199", nome: "Qualquer Nome", ...livre() }));
  const texto = JSON.stringify(r.corpo);
  ok("supervisor U1 × cliente de U2 por CNPJ → 409 bloqueio", r.status === 409 && r.corpo.duplicidade.bloqueio === "cnpj" && total(db) === n0, r);
  ok("sem vazar: existente null + outraUnidade true", r.corpo.duplicidade.existente === null && r.corpo.duplicidade.outraUnidade === true && r.corpo.duplicidade.outros.length === 0, r.corpo);
  ok("resposta não contém nome, CNPJ, telefone nem e-mail do cliente de U2", !/Metal[úu]rgica|Outra Pra[çc]a|99\.?999\.?999|88888|outrapraca/i.test(texto), texto);
  const tel = await POST(novo({ contato_telefone: "(11) 98888-7777", contato_email: "financeiro@outrapraca.test" }));
  ok("tel+e-mail de U2 → bloqueio por contato sem vazar", tel.status === 409 && tel.corpo.duplicidade.existente === null && !/Metal|outrapraca|98888/i.test(JSON.stringify(tel.corpo)), tel);
  logar(db, "dir");
  const dir = await POST(novo({ cnpj: "99999999000199", ...livre() }));
  ok("diretoria enxerga o existente de U2 (nome/cidade/ativo)", dir.status === 409 && dir.corpo.duplicidade.existente?.nome === "Metalúrgica Outra Praça" && !JSON.stringify(dir.corpo).includes("99.999") , dir);
}

// ── cobrança R&S ─────────────────────────────────────────────────────────────────────────────────────
console.log("\n== Cobrança R&S ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  const cli = porNome("Maxsoy");
  const conflito = await chamar(cobranca.PATCH, { metodo: "PATCH", params: { id: COBRANCA }, corpo: { cliente_cnpj: "00.000.008/0001-00", cliente_endereco: "Rua Qualquer, 1" } });
  const c = db.tabelas.clientes.find((x) => x.id === cli.id);
  const cob = db.tabelas.cobrancas_rs[0];
  ok("cobrança com CNPJ de outro cliente segue (200) e grava o snapshot", conflito.status === 200 && cob.cliente_cnpj_snapshot === "00.000.008/0001-00", conflito);
  ok("…mas NÃO grava cnpj/endereco no cadastro do cliente", !c.cnpj && !c.endereco, c);
  const db2 = novoDbClientes(); logar(db2, "dir");
  const livre = await chamar(cobranca.PATCH, { metodo: "PATCH", params: { id: COBRANCA }, corpo: { cliente_cnpj: "55.444.333/0001-22", cliente_endereco: "Rua Livre, 5" } });
  const c2 = db2.tabelas.clientes.find((x) => x.id === cli.id);
  ok("cobrança com CNPJ livre grava no cadastro (comportamento de sempre)", livre.status === 200 && c2.cnpj === "55.444.333/0001-22" && c2.endereco === "Rua Livre, 5", c2);
  const db3 = novoDbClientes(); logar(db3, "dir");
  db3.falhas["clientes.select"] = "boom";
  const semLeitura = await chamar(cobranca.PATCH, { metodo: "PATCH", params: { id: COBRANCA }, corpo: { cliente_cnpj: "55.444.333/0001-22" } });
  ok("falha ao ler clientes: cobrança segue, cadastro não é tocado", semLeitura.status === 200 && !db3.tabelas.clientes.find((x) => x.id === cli.id).cnpj, semLeitura);
}

// ── vagas com cliente inativo ────────────────────────────────────────────────────────────────────────
console.log("\n== Vagas ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  const inativo = porNome("Natural Labour ").id;
  const ativo = porNome("Amplo").id;
  const vaga = (cliente_id) => ({ titulo: "Auxiliar de Produção", tipo_servico: "rs", num_posicoes: 1, responsavel: "Fulano", cliente_id, status: "fechada", confidencial: false, taxa_cancelamento: false, visivel_publicamente: false });
  const v0 = db.tabelas.vagas.length;
  const nova = await chamar(vagas.POST, { metodo: "POST", corpo: vaga(inativo) });
  ok("POST /api/vagas com cliente inativo → 400 em PT-BR", nova.status === 400 && /inativo/i.test(nova.corpo.error ?? "") && db.tabelas.vagas.length === v0, nova);
  const trocar = await chamar(vagaPorId.PATCH, { metodo: "PATCH", params: { id: VAGA_NORMAL }, corpo: { cliente_id: inativo } });
  ok("PATCH de vaga trocando para cliente inativo → 400", trocar.status === 400 && /inativo/i.test(trocar.corpo.error ?? ""), trocar);
  ok("…vaga continua com o cliente de antes", db.tabelas.vagas.find((v) => v.id === VAGA_NORMAL).cliente_id === ativo);
  const manter = await chamar(vagaPorId.PATCH, { metodo: "PATCH", params: { id: VAGA_DO_INATIVO }, corpo: { cliente_id: inativo, titulo: "Operador de Máquinas" } });
  ok("PATCH mantendo o mesmo cliente inativo NÃO é barrado por inatividade", !(manter.status === 400 && /inativo/i.test(manter.corpo?.error ?? "")), manter);
  const outro = await chamar(vagaPorId.PATCH, { metodo: "PATCH", params: { id: VAGA_DO_INATIVO }, corpo: { titulo: "Só o título" } });
  ok("PATCH sem cliente_id (vaga do inativo) segue livre", !(outro.status === 400 && /inativo/i.test(outro.corpo?.error ?? "")), outro);
  const okAtivo = await chamar(vagas.POST, { metodo: "POST", corpo: vaga(ativo) });
  ok("POST /api/vagas com cliente ativo continua funcionando", okAtivo.status === 201, okAtivo);
}

// ── seletores ────────────────────────────────────────────────────────────────────────────────────────
console.log("\n== Seletores (GET /api/clientes) ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  const todos = await chamar(lista.GET, { url: "http://t/api/clientes" });
  const ativos = await chamar(lista.GET, { url: "http://t/api/clientes?ativos=1" });
  const inativo = porNome("Natural Labour ").id;
  const com = await chamar(lista.GET, { url: `http://t/api/clientes?ativos=1&incluir=${inativo}` });
  const lixo = await chamar(lista.GET, { url: "http://t/api/clientes?ativos=1&incluir=1;drop" });
  const vagasAntes = JSON.stringify(db.tabelas.vagas);
  ok("sem parâmetro: lista completa (47), com inativos", todos.corpo.data.length === 47 && todos.corpo.data.filter((c) => !c.ativo).length === 2);
  ok("?ativos=1: 45, nenhum inativo", ativos.corpo.data.length === 45 && ativos.corpo.data.every((c) => c.ativo));
  ok("?ativos=1&incluir=<id>: 46, só o inativo pedido a mais", com.corpo.data.length === 46 && com.corpo.data.filter((c) => !c.ativo).map((c) => c.id).join() === inativo);
  ok("incluir inválido é ignorado (45) — nunca entra no filtro", lixo.status === 200 && lixo.corpo.data.length === 45, lixo);
  const inativoU2 = idCliente(950);
  db.tabelas.clientes.push({ id: inativoU2, nome: "Inativo de Outra Praça", cidade: "Santo André", ativo: false, unidade_id: "U2", cnpj: null, contato_telefone: null, contato_email: null, endereco: null, servicos: [] });
  logar(db, "sup1");
  const supIncl = await chamar(lista.GET, { url: `http://t/api/clientes?ativos=1&incluir=${inativoU2}` });
  ok("?incluir=<id de inativo de OUTRA unidade> NÃO vaza para supervisor da U1 (filtro de unidade segue valendo)", supIncl.status === 200 && !supIncl.corpo.data.some((c) => c.id === inativoU2) && supIncl.corpo.data.every((c) => c.unidade_id === "U1"), supIncl.corpo.data?.length);
  logar(db, "dir");
  const dirIncl = await chamar(lista.GET, { url: `http://t/api/clientes?ativos=1&incluir=${inativoU2}` });
  ok("…diretoria (todas as unidades) recebe o incluído", dirIncl.corpo.data.some((c) => c.id === inativoU2));
  logar(db, "sup1");
  const sup = await chamar(lista.GET, { url: "http://t/api/clientes?ativos=1" });
  ok("supervisor U1 continua restrito à própria unidade (44 ativos de U1)", sup.corpo.data.length === 44 && sup.corpo.data.every((c) => c.unidade_id === "U1"), sup.corpo.data.length);
  ok("vagas existentes ficam intactas (ainda apontam para o cliente inativo)", db.tabelas.vagas.find((v) => v.id === VAGA_DO_INATIVO).cliente_id === inativo && JSON.stringify(db.tabelas.vagas) === vagasAntes);
}

// ── 23505 e falhas ───────────────────────────────────────────────────────────────────────────────────
console.log("\n== Erros do banco ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  db.unicos = { clientes: ["cidade"] }; // simula o índice único disparando DEPOIS de a checagem em memória passar (corrida)
  const r = await POST(novo({ nome: "Kappa Fundições", cidade: "Cidade Exclusiva", ...livre() }));
  ok("insert ok quando o índice não conflita", r.status === 201);
  const r2 = await POST(novo({ nome: "Lambda Fundições", cidade: "Cidade Exclusiva", ...livre() }));
  ok("23505 no INSERT → 409 amigável (sem texto cru)", r2.status === 409 && r2.corpo.error === "Já existe um cliente ativo com este CNPJ." && !/duplicate|constraint/i.test(JSON.stringify(r2.corpo)), r2);
  db.falhas["clientes.insert"] = "relation clientes violates something internal";
  const r3 = await POST(novo({ nome: "Mu Fundições" }));
  ok("erro genérico no INSERT → 500 com frase genérica", r3.status === 500 && !/violates|internal/i.test(JSON.stringify(r3.corpo)), r3);
  delete db.falhas["clientes.insert"];
  db.falhas["clientes.update"] = { code: "23505", message: 'duplicate key value violates unique constraint "clientes_cnpj_ativo_unico"' };
  const r4 = await PATCH(porNome("Amplo").id, { cidade: "Outra" });
  ok("23505 no UPDATE → 409 amigável", r4.status === 409 && !/duplicate|constraint/i.test(JSON.stringify(r4.corpo)), r4);
  delete db.falhas["clientes.update"];
  db.falhas["clientes.select"] = "boom interno";
  const r5 = await POST(novo({ nome: "Ni Fundições" }));
  ok("falha ao ler clientes na checagem → 500 genérico, nada gravado", r5.status === 500 && !/boom/i.test(JSON.stringify(r5.corpo)) && total(db) === 48, r5);
  delete db.falhas["clientes.select"];
}

// ── consulta única ───────────────────────────────────────────────────────────────────────────────────
console.log("\n== Consultas ==");
{
  const db = novoDbClientes(); logar(db, "dir");
  db.consultas.length = 0;
  await POST(novo({ nome: "Pi Fundições", contato_telefone: "(19) 90001-0000", contato_email: livre().contato_email }));
  const sel = db.consultas.filter((c) => c.tabela === "clientes" && c.op === "select").length;
  ok("POST /api/clientes faz UMA consulta de clientes (select)", sel === 1, sel);
  db.consultas.length = 0;
  await PATCH(porNome("Amplo").id, { nome: "Amplo Novo Nome", cnpj: "00.000.008/0001-00" });
  ok("PATCH /api/clientes/[id] com campo de identidade: UMA consulta de clientes", consultasClientes(db) === 1, consultasClientes(db));
  db.consultas.length = 0;
  await PATCH(porNome("Amplo").id, { cidade: "Sumaré" });
  ok("PATCH sem campo de identidade: ZERO consultas de clientes (select)", consultasClientes(db) === 0, consultasClientes(db));
  db.consultas.length = 0;
  await POST(simples("Rho Fundições Especiais"));
  ok("cadastro sem coincidência: continua com UMA consulta de clientes", consultasClientes(db) === 1, consultasClientes(db));
}

// ── papéis sem acesso ────────────────────────────────────────────────────────────────────────────────
console.log("\n== Acesso ==");
{
  const db = novoDbClientes(); logar(db, null);
  const r = await POST(novo());
  ok("anônimo → 401", r.status === 401, r);
  logar(db, "cli");
  const portal = await POST(novo());
  ok("usuário do portal não recebe checagem nenhuma (nega antes)", portal.status === 401 || portal.status === 403, portal);
}

console.log(`\n${falhas === 0 ? "TODAS AS ASSERÇÕES PASSARAM" : `${falhas} ASSERÇÃO(ÕES) FALHARAM`}`);
process.exitCode = falhas ? 1 : 0;
