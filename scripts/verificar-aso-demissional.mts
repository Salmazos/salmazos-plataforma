// ASO DEMISSIONAL na rescisão: anexar depois, substituir, pendência por dias, filtro, portal (só o próprio cliente),
// aviso ao cliente só na 1ª anexação, cron diário sem duplicar e silencioso, e ASO periódico intacto.
// Rotas, páginas e cron rodam contra o banco em memória do harness (o Storage é um stub: só gera URLs/remove).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-aso-demissional.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, HOJE, dataMais, novoDb, logar, logarPortal, importar, chamar, serializar, funcionarioMot, idMot, F_D1, USUARIOS, usuario, auditoria, flush } from "./harness-mot/ambiente.mjs";
import {
  ASO_DEMISSIONAL_PRAZO_DIAS, ASO_DEMISSIONAL_CONTROLE_INICIO, entraNoAvisoInterno, diasDesdeDesligamento, asoDemissionalPendente, pendenteAlemDoPrazo, pathAsoDoFuncionario, extensaoAsoValida,
} from "../src/lib/asoDemissionalRegras";

congelarData(AGORA_ISO); // 07/10/2026
process.env.CRON_SECRET = "segredo-de-teste";
const R = {
  upload: await importar("src/app/api/rescisoes/aso-upload-url/route.ts"),
  anexar: await importar("src/app/api/rescisoes/[id]/aso-demissional/route.ts"),
  verAso: await importar("src/app/api/rescisoes/[id]/aso-url/route.ts"),
  editar: await importar("src/app/api/rescisoes/[id]/route.ts"),
  portalUrl: await importar("src/app/api/portal/funcionarios/[funcionarioId]/aso-demissional-url/route.ts"),
  portalAsoPeriodico: await importar("src/app/api/portal/funcionarios/[funcionarioId]/aso-url/route.ts"),
  paginaPortal: (await importar("src/app/portal/(app)/funcionarios/page.tsx")).default,
  cron: await importar("src/app/api/cron/rescisao-avisos/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

USUARIOS.cli2 = usuario("u-cli2", "cliente"); // portal do cliente C2
// Data-base dos cenários (os de cron rodam em 20/11/2026, depois do início do controle; ver emNovembro).
let BASE = HOJE;
const NOV = "2026-11-20";
const emNovembro = async (fn: () => Promise<void>) => {
  congelarData(`${NOV}T15:00:00.000Z`); BASE = NOV;
  try { await fn(); } finally { congelarData(AGORA_ISO); BASE = HOJE; }
};
const FD = (k: number) => `dddddddd-0000-4000-8000-${String(k).padStart(12, "0")}`;
const RD = (k: number) => `eeeeeeee-0000-4000-8000-${String(k).padStart(12, "0")}`;
const UPLOAD_OK = (fid: string, nome = "exame.pdf") => `rescisoes-aso/${fid}/aso-1700000000000-${nome}`;

// Cenário: [k, dias desde o desligamento, extras da rescisão, cliente]. Funcionário k de cliente C1 (ou C2), status desligado.
function cenario(linhas: [number, number, Record<string, unknown>?, string?][] = []) {
  const db = novoDb(); logar(db, "dir"); logarPortal(db, "cli");
  db.tabelas.funcionarios = []; db.tabelas.rescisoes = [];
  for (const [k, dias, extra, cliente] of linhas) {
    db.tabelas.funcionarios.push(funcionarioMot(FD(k), "2026-01-10", { status: "desligado", nome_completo: `Func ${k}`, ...(cliente === "C2" ? { cliente_id: "C2", empresa: "Cliente Dois" } : {}) }));
    db.tabelas.rescisoes.push({
      id: RD(k), funcionario_id: FD(k), unidade_id: "U1", empresa: cliente === "C2" ? "Cliente Dois" : "Cliente Um", data_desligamento: dataMais(BASE, -dias),
      modalidade: "pedido_demissao", entrevista_desligamento: false, funcionario_assinou: false, valor_rescisao: 100, data_pagamento_rescisao: BASE, faturado: false,
      aso_documento_path: null, aso_demissional_anexado_em: null, aso_demissional_anexado_por: null, aso_demissional_data_exame: null,
      aso_demissional_aviso_cliente_em: null, ultimo_aviso_aso_pendente_enviado_em: null, ...(extra ?? {}),
    });
  }
  db.tabelas.cliente_usuarios.push({ id: "cu2", user_id: "u-cli2", cliente_id: "C2" });
  db.tabelas.portal_avisos = [];
  db.tabelas.notificacoes_analista = [];
  db.tabelas.aviso_eventos_canais = [
    { evento: "aso_demissional_anexado_cliente", canal: "sino", ativo: true },
    { evento: "aso_demissional_anexado_cliente", canal: "popup", ativo: true },
    { evento: "rescisao_aso_pendente", canal: "sino", ativo: true },
  ];
  db.tabelas.aviso_destinatarios = [
    { id: "ad1", evento: "rescisao_aso_pendente", canal: "sino", tipo_destinatario: "usuario", usuario_id: "u-dir", email: null, nome: null, ativo: true },
    { id: "ad2", evento: "rescisao_aso_pendente", canal: "sino", tipo_destinatario: "usuario", usuario_id: "u-sup1", email: null, nome: null, ativo: true },
  ];
  return db;
}
const linha = (db: any, k: number) => db.tabelas.rescisoes.find((r: any) => r.id === RD(k));
const anexar = (db: any, k: number, corpo: Record<string, unknown>, quem = "dir") => { logar(db, quem); return chamar(R.anexar.PATCH, { metodo: "PATCH", params: { id: RD(k) }, corpo }); };
const cron = () => chamar(R.cron.GET, { headers: { authorization: "Bearer segredo-de-teste" } });
const avisosCliente = (db: any) => db.tabelas.portal_avisos.filter((a: any) => a.evento === "aso_demissional_anexado_cliente");
const sinosPendente = (db: any) => db.tabelas.notificacoes_analista.filter((a: any) => a.tipo === "rescisao_aso_pendente");
const portalUrl = (db: any, fid: string, quem = "cli") => { logarPortal(db, quem); return chamar(R.portalUrl.GET, { params: { funcionarioId: fid } }); };

await ok("regras puras: prazo único = 10, dias nunca negativos, pendência, extensões e path do próprio funcionário", () => {
  assert.equal(ASO_DEMISSIONAL_PRAZO_DIAS, 10);
  assert.equal(diasDesdeDesligamento("2026-09-26", "2026-10-07"), 11);
  assert.equal(diasDesdeDesligamento("2026-10-07", "2026-10-07"), 0);
  assert.equal(diasDesdeDesligamento("2026-10-20", "2026-10-07"), 0, "programada (futura) não fica negativa");
  assert.equal(asoDemissionalPendente({ aso_documento_path: null }), true);
  assert.equal(asoDemissionalPendente({ aso_documento_path: "x" }), false);
  assert.equal(pendenteAlemDoPrazo({ aso_documento_path: null, data_desligamento: "2026-09-28" }, "2026-10-07"), false); // 9 dias
  assert.equal(pendenteAlemDoPrazo({ aso_documento_path: null, data_desligamento: "2026-09-27" }, "2026-10-07"), true); // 10 dias
  assert.equal(pendenteAlemDoPrazo({ aso_documento_path: "x", data_desligamento: "2026-01-01" }, "2026-10-07"), false);
  for (const ok of ["a.pdf", "a.JPG", "a.jpeg", "a.png"]) assert.ok(extensaoAsoValida(ok), ok);
  for (const ruim of ["a.exe", "a.html", "a", "a.pdf.exe"]) assert.equal(extensaoAsoValida(ruim), false, ruim);
  assert.ok(pathAsoDoFuncionario(UPLOAD_OK(FD(1)), FD(1)));
  assert.equal(pathAsoDoFuncionario(UPLOAD_OK(FD(2)), FD(1)), false, "arquivo de outro funcionário");
  assert.equal(pathAsoDoFuncionario(`rescisoes-aso/${FD(1)}/../${FD(2)}/aso-1.pdf`, FD(1)), false, "path traversal");
  assert.equal(pathAsoDoFuncionario(`funcionarios/${FD(1)}/aso-1.pdf`, FD(1)), false, "outra pasta do bucket");
});

await ok("upload-url: o servidor recusa extensão fora de PDF/JPG/PNG; aceita as três, no mesmo padrão de path", async () => {
  const db = cenario([[1, 5]]); logar(db, "dir");
  const ruim = await chamar(R.upload.POST, { metodo: "POST", corpo: { funcionario_id: FD(1), nome_arquivo: "virus.exe" } });
  assert.equal(ruim.status, 400);
  const bom = await chamar(R.upload.POST, { metodo: "POST", corpo: { funcionario_id: FD(1), nome_arquivo: "Exame Final.PDF" } });
  assert.equal(bom.status, 200);
  assert.match(bom.corpo.path, new RegExp(`^rescisoes-aso/${FD(1)}/aso-\\d+-Exame_Final\\.PDF$`));
});

await ok("ANEXAR DEPOIS: só com o caminho (sem os demais campos da rescisão); grava quem/quando/data do exame e a auditoria SEM dado de saúde", async () => {
  const db = cenario([[1, 5]]);
  assert.equal(linha(db, 1).aso_documento_path, null);
  const r = await anexar(db, 1, { path: UPLOAD_OK(FD(1)), data_exame: "2026-10-01" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const l = linha(db, 1);
  assert.equal(l.aso_documento_path, UPLOAD_OK(FD(1)));
  assert.equal(l.aso_demissional_data_exame, "2026-10-01");
  assert.equal(l.aso_demissional_anexado_por, "u-dir");
  assert.ok(l.aso_demissional_anexado_em);
  assert.equal(r.corpo.data.aso_documento_path, UPLOAD_OK(FD(1)));
  const aud = auditoria(db).filter((a: any) => a.acao.startsWith("rescisao_aso_demissional"));
  assert.equal(aud.length, 1);
  assert.equal(aud[0].acao, "rescisao_aso_demissional_anexado");
  assert.equal(aud[0].entidade_id, RD(1));
  assert.deepEqual(Object.keys(aud[0].detalhes).sort(), ["data_exame_informada", "funcionario_id", "primeira_vez"]);
  assert.ok(!JSON.stringify(aud[0]).includes("exame.pdf"), "nem o nome do arquivo vai para a auditoria");
  // "Ver ASO" do painel abre com URL assinada.
  logar(db, "dir");
  const v = await chamar(R.verAso.GET, { params: { id: RD(1) } });
  assert.equal(v.status, 200); assert.ok(v.corpo.signedUrl);
});

await ok("anexar: data do exame é opcional (omitida não grava); path de OUTRO funcionário, extensão ruim, corpo vazio e sem permissão são recusados", async () => {
  const db = cenario([[1, 5], [2, 5]]);
  assert.equal((await anexar(db, 1, { path: UPLOAD_OK(FD(1)) })).status, 200);
  assert.equal(linha(db, 1).aso_demissional_data_exame, null);
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(1)) })).status, 400, "path de outro funcionário");
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(2), "a.exe") })).status, 400);
  assert.equal((await anexar(db, 2, {})).status, 400);
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(2)), data_exame: "01/10/2026" })).status, 400);
  assert.equal(linha(db, 2).aso_documento_path, null, "nada gravado nos pedidos recusados");
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(2)) }, "ana")).status, 403, "analista sem acesso ao RH");
  logar(db, null);
  assert.equal((await chamar(R.anexar.PATCH, { metodo: "PATCH", params: { id: RD(2) }, corpo: { path: UPLOAD_OK(FD(2)) } })).status, 401);
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(2)) }, "sup2")).status, 404, "supervisor de OUTRA unidade não enxerga a rescisão");
});

await ok("SUBSTITUIR: troca o arquivo, remove o antigo do Storage, mantém anexado_em/por originais e NÃO avisa o cliente de novo", async () => {
  const db = cenario([[1, 15]]);
  const r1 = await anexar(db, 1, { path: UPLOAD_OK(FD(1), "primeiro.pdf") });
  assert.equal(r1.status, 200);
  const em1 = linha(db, 1).aso_demissional_anexado_em;
  const avisos1 = avisosCliente(db).length;
  assert.equal(avisos1, 1);
  assert.equal(db.storageRemovidos, undefined, "1ª anexação: nada a remover do Storage");
  const r2 = await anexar(db, 1, { path: UPLOAD_OK(FD(1), "segundo.png"), data_exame: "2026-10-02" }, "sup1");
  assert.equal(r2.status, 200, JSON.stringify(r2.corpo));
  const l = linha(db, 1);
  assert.equal(l.aso_documento_path, UPLOAD_OK(FD(1), "segundo.png"));
  assert.equal(l.aso_demissional_anexado_em, em1, "1ª anexação preservada");
  assert.equal(l.aso_demissional_anexado_por, "u-dir");
  assert.equal(avisosCliente(db).length, 1, "trocar o arquivo não avisa o cliente de novo");
  const aud = auditoria(db).filter((a: any) => a.acao.startsWith("rescisao_aso_demissional")).map((a: any) => a.acao);
  assert.deepEqual(aud, ["rescisao_aso_demissional_anexado", "rescisao_aso_demissional_substituido"]);
  assert.deepEqual(db.storageRemovidos, [`admissao-docs/${UPLOAD_OK(FD(1), "primeiro.pdf")}`], "só o arquivo antigo saiu do Storage");
  // Falha ao remover o antigo do Storage só vira log: o ASO novo continua salvo.
  db.falhas["storage.remove"] = "boom";
  assert.equal((await anexar(db, 1, { path: UPLOAD_OK(FD(1), "terceiro.jpg") })).status, 200);
  assert.equal(linha(db, 1).aso_documento_path, UPLOAD_OK(FD(1), "terceiro.jpg"));
  assert.equal(db.storageRemovidos.length, 1, "a remoção que falhou não foi registrada");
});

await ok("PENDÊNCIA na lista: 'Pendente · N dias' (N desde o desligamento), 'Ver ASO' quando anexado, 'Pendente' sem dias se programada; botão Anexar na linha; filtro 'ASO pendente'", () => {
  const tela = fs.readFileSync("src/components/RescisoesPageClient.tsx", "utf8");
  for (const t of ["Pendente · ", "Ver ASO", "Anexar ASO", "Substituir", 'value="pendente"', "ASO pendente", "asoDemissionalPendente(r)", 'searchParams.get("aso") === "pendente"', "diasDesdeDesligamento(r.data_desligamento, hojeISO)"])
    assert.ok(tela.includes(t), `tela: ${t}`);
  // A regra que a tela usa: filtro "pendente" = sem arquivo; contagem em dias corridos desde o desligamento.
  const dados = [{ aso_documento_path: null, data_desligamento: "2026-09-26" }, { aso_documento_path: "x", data_desligamento: "2026-09-26" }, { aso_documento_path: null, data_desligamento: "2026-10-20" }];
  assert.deepEqual(dados.filter(asoDemissionalPendente).map((r) => diasDesdeDesligamento(r.data_desligamento, HOJE)), [11, 0]);
  const modal = fs.readFileSync("src/components/ModalAnexarAsoDemissional.tsx", "utf8");
  for (const t of ['accept="image/jpeg,image/png,application/pdf"', "/api/rescisoes/aso-upload-url", "/aso-demissional", "Data do exame (opcional)"]) assert.ok(modal.includes(t), `modal: ${t}`);
  assert.ok(!modal.includes("window.open") && !modal.includes("console.log"), "o modal não loga nem abre nada");
});

await ok("ANEXO PELO 'EDITAR' (caminho antigo): também carimba quem/quando e avisa o cliente na 1ª vez; path de outro funcionário é recusado", async () => {
  const db = cenario([[1, 5], [2, 5]]);
  logar(db, "dir");
  const ruim = await chamar(R.editar.PATCH, { metodo: "PATCH", params: { id: RD(1) }, corpo: { aso_documento_path: UPLOAD_OK(FD(2)) } });
  assert.equal(ruim.status, 400);
  const bom = await chamar(R.editar.PATCH, { metodo: "PATCH", params: { id: RD(1) }, corpo: { aso_documento_path: UPLOAD_OK(FD(1)) } });
  assert.equal(bom.status, 200, JSON.stringify(bom.corpo));
  assert.ok(linha(db, 1).aso_demissional_anexado_em);
  assert.equal(linha(db, 1).aso_demissional_anexado_por, "u-dir");
  assert.equal(avisosCliente(db).length, 1);
  // Editar outros campos sem mexer no ASO não avisa nada.
  const outro = await chamar(R.editar.PATCH, { metodo: "PATCH", params: { id: RD(2) }, corpo: { valor_rescisao: 250 } });
  assert.equal(outro.status, 200);
  assert.equal(avisosCliente(db).length, 1);
  assert.equal(linha(db, 2).aso_demissional_anexado_em, null);
});

await ok("AVISO AO CLIENTE: sino+popup só na 1ª anexação, para o cliente da rescisão (C2 não recebe), só com o nome; canal desligado = nada", async () => {
  const db = cenario([[1, 5], [3, 5, {}, "C2"]]);
  await anexar(db, 1, { path: UPLOAD_OK(FD(1)) });
  const a = avisosCliente(db);
  assert.equal(a.length, 1);
  assert.equal(a[0].cliente_id, "C1");
  assert.equal(a[0].canal_sino, true); assert.equal(a[0].canal_popup, true);
  assert.equal(a[0].link, "/portal/funcionarios");
  assert.equal(a[0].referencia_id, RD(1));
  assert.match(a[0].mensagem, /ASO demissional de Func 1/);
  assert.ok(!/saúde|apto|inapto|CID/i.test(a[0].mensagem + a[0].titulo), "nenhum dado de saúde no aviso");
  assert.ok(linha(db, 1).aso_demissional_aviso_cliente_em);
  // Substituir não repete; reanexar o mesmo não repete.
  await anexar(db, 1, { path: UPLOAD_OK(FD(1), "b.pdf") });
  assert.equal(avisosCliente(db).length, 1);
  // Cliente 2 com o canal desligado em Configurações: anexa, mas ninguém é avisado.
  for (const c of db.tabelas.aviso_eventos_canais) if (c.evento === "aso_demissional_anexado_cliente") c.ativo = false;
  assert.equal((await anexar(db, 3, { path: UPLOAD_OK(FD(3)) })).status, 200);
  assert.equal(avisosCliente(db).filter((x: any) => x.cliente_id === "C2").length, 0);
  assert.equal(linha(db, 3).aso_demissional_aviso_cliente_em, null);
  assert.ok(linha(db, 3).aso_demissional_anexado_em, "o carimbo da 1ª anexação existe mesmo sem aviso");
  // Falha de gravação do aviso nunca derruba o anexo.
  const db2 = cenario([[1, 5]]); db2.falhas["portal_avisos.insert"] = "boom";
  assert.equal((await anexar(db2, 1, { path: UPLOAD_OK(FD(1)) })).status, 200);
  assert.ok(linha(db2, 1).aso_documento_path);
});

await ok("PORTAL (rota): o cliente dono abre o ASO por URL assinada; outro cliente, funcionário inexistente, sem ASO e path suspeito = o MESMO 404 genérico (nunca vaza existência)", async () => {
  const db = cenario([[1, 20, { aso_documento_path: UPLOAD_OK(FD(1)) }], [2, 20], [3, 20, { aso_documento_path: UPLOAD_OK(FD(3)) }, "C2"], [4, 20, { aso_documento_path: UPLOAD_OK(FD(1)) }]]);
  const dono = await portalUrl(db, FD(1));
  assert.equal(dono.status, 200);
  assert.ok(dono.corpo.signedUrl);
  assert.match(dono.corpo.signedUrl, /\/dl\/rescisoes-aso\//, "assinada, no bucket privado");
  const outroCliente = await portalUrl(db, FD(3)); // C1 pedindo funcionário do C2
  const inexistente = await portalUrl(db, FD(99));
  const semAso = await portalUrl(db, FD(2));
  const pathAlheio = await portalUrl(db, FD(4)); // rescisão apontando para a pasta de OUTRO funcionário
  for (const r of [outroCliente, inexistente, semAso, pathAlheio]) assert.equal(r.status, 404);
  assert.deepEqual([outroCliente.corpo, semAso.corpo, pathAlheio.corpo], [inexistente.corpo, inexistente.corpo, inexistente.corpo], "corpo idêntico: não revela se existe");
  assert.equal((await portalUrl(db, FD(3), "cli2")).status, 200, "o dono do C2 abre o dele");
  assert.equal((await portalUrl(db, FD(1), "cli2")).status, 404, "e não abre o do C1");
  logarPortal(db, null);
  assert.equal((await chamar(R.portalUrl.GET, { params: { funcionarioId: FD(1) } })).status, 401);
  // Cliente só LÊ: a rota do portal não tem método de escrita e a de anexar exige papel de RH.
  for (const m of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal((R.portalUrl as any)[m], undefined, `portal sem ${m}`);
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(2)) }, "cli")).status, 403, "usuário do portal não anexa");
  const codigo = fs.readFileSync("src/app/api/portal/funcionarios/[funcionarioId]/aso-demissional-url/route.ts", "utf8");
  assert.ok(codigo.includes("createSignedUrl(rescisao.aso_documento_path, 60)"), "URL assinada de 60s");
  assert.ok(!/getPublicUrl|console\.log/.test(codigo), "sem URL pública e sem log de conteúdo");
});

await ok("PORTAL (tela Rescindidos): desligado com ASO = 'Anexado'+Ver; desligado sem ASO = 'Em andamento' (sem URL); ATIVO continua sem mudança (ASO periódico, asoDemissional nulo)", async () => {
  const db = cenario([[1, 20, { aso_documento_path: UPLOAD_OK(FD(1)) }], [2, 20]]);
  db.tabelas.funcionarios.push(funcionarioMot(FD(7), "2026-01-10", { nome_completo: "Func 7" })); // ativo
  db.tabelas.funcionario_asos = []; db.tabelas.funcionario_contratos = []; db.tabelas.admissao_dados_pessoais = []; db.tabelas.admissoes = []; db.tabelas.candidatos = []; db.tabelas.encaminhamentos = [];
  logarPortal(db, "cli");
  const arvore = serializar(await R.paginaPortal());
  const achar = (no: any): any[] | null => {
    if (!no || typeof no !== "object") return null;
    if (no.props?.funcionarios) return no.props.funcionarios;
    for (const f of Array.isArray(no.filhos) ? no.filhos : [no.filhos]) { const r = achar(f); if (r) return r; }
    return Array.isArray(no) ? no.map(achar).find(Boolean) ?? null : null;
  };
  const linhas = achar(arvore)!;
  assert.ok(linhas, "lista de funcionários na página");
  const por = (id: string) => linhas.find((l: any) => l.id === id);
  assert.deepEqual(por(FD(1)).asoDemissional, { anexado: true, url: `/api/portal/funcionarios/${FD(1)}/aso-demissional-url` });
  assert.deepEqual(por(FD(2)).asoDemissional, { anexado: false, url: null });
  assert.equal(por(FD(7)).asoDemissional, null, "ativo: nada de ASO demissional");
  assert.equal(por(FD(7)).badgeAso.label.length > 0, true, "ativo: o ASO periódico continua como era");
  assert.ok(!JSON.stringify(linhas).includes("rescisoes-aso"), "o caminho do arquivo nunca vai para a tela");
  const lista = fs.readFileSync("src/components/PortalFuncionariosListClient.tsx", "utf8");
  for (const t of ['label="Anexado"', 'label="Ver"', 'label="Em andamento"', 'Campo label="ASO Demissional"', 'Campo label="ASO Periódico"']) assert.ok(lista.includes(t), t);
});

await ok("CRON: avisa a lista só de rescisões SEM ASO, com 10+ dias E desligadas a partir do início do controle (9 dias, programada e LEGADO não entram); 1 aviso consolidado por destinatário; sem duplicar no mesmo dia", () => emNovembro(async () => {
  assert.equal(ASO_DEMISSIONAL_CONTROLE_INICIO, "2026-11-01");
  // 20/11: #1 = 09/11 (11d), #2 = 10/11 (10d), #3 = 11/11 (9d), #4 = 01/11 (19d, exatamente o início), #5 com ASO, #6 programada,
  // #7 = 31/10 (20d, LEGADO por 1 dia), #8 = 21/09 (60d, LEGADO).
  const db = cenario([[1, 11], [2, 10], [3, 9], [4, 19], [5, 30, { aso_documento_path: UPLOAD_OK(FD(5)) }], [6, -5], [7, 20], [8, 60]]);
  const r1 = await cron();
  assert.equal(r1.status, 200, JSON.stringify(r1.corpo));
  assert.equal(r1.corpo.aso_demissional_pendentes, 3);
  assert.equal(r1.corpo.aso_demissional_destinatarios, 2);
  const s = sinosPendente(db);
  assert.equal(s.length, 2, "um aviso por destinatário (não um por rescisão)");
  assert.deepEqual(s.map((x: any) => x.user_id).sort(), ["u-dir", "u-sup1"]);
  assert.match(s[0].titulo, /3 ASOs demissionais pendentes/);
  assert.match(s[0].mensagem, /Func 4 \(Cliente Um, 19 dias\)/);
  for (const k of [3, 5, 6, 7, 8]) assert.ok(!s[0].mensagem.includes(`Func ${k} `), `Func ${k} fora do aviso`);
  assert.equal(s[0].rescisao_id, null);
  for (const k of [1, 2, 4]) assert.ok(linha(db, k).ultimo_aviso_aso_pendente_enviado_em, `rescisão ${k} marcada`);
  for (const k of [3, 5, 6, 7, 8]) assert.equal(linha(db, k).ultimo_aviso_aso_pendente_enviado_em, null, `rescisão ${k} não marcada`);
  // Segunda execução no mesmo dia: nada novo.
  await cron();
  assert.equal(sinosPendente(db).length, 2, "sem duplicar no mesmo dia");
  // Dia seguinte: repete 1x por dia enquanto pendente (a de 9 dias já chega aos 10); o legado continua de fora.
  congelarData("2026-11-21T15:00:00.000Z");
  const r3 = await cron();
  assert.equal(r3.corpo.aso_demissional_pendentes, 4);
  assert.equal(sinosPendente(db).length, 4, "mais um aviso por destinatário no dia seguinte");
  await cron();
  assert.equal(sinosPendente(db).length, 4);
  // Anexou o ASO de uma: sai da contagem do dia seguinte.
  await anexar(db, 4, { path: UPLOAD_OK(FD(4)) });
  congelarData("2026-11-22T15:00:00.000Z");
  const r4 = await cron();
  assert.equal(r4.corpo.aso_demissional_pendentes, 3, "a anexada saiu; a programada e o legado seguem fora");
}));

await ok("CONTROLE: o legado (antes de 01/11/2026) continua pendente na tela (dias, filtro, anexar) e anexar nele AVISA o cliente normalmente, mas nunca gera aviso interno", () => emNovembro(async () => {
  assert.equal(entraNoAvisoInterno({ aso_documento_path: null, data_desligamento: "2026-10-31" }, NOV), false, "31/10 = legado");
  assert.equal(entraNoAvisoInterno({ aso_documento_path: null, data_desligamento: "2026-07-25" }, NOV), false, "a mais antiga (25/07)");
  assert.equal(entraNoAvisoInterno({ aso_documento_path: null, data_desligamento: "2026-11-01" }, NOV), true, "o próprio início entra");
  assert.equal(entraNoAvisoInterno({ aso_documento_path: null, data_desligamento: "2026-11-12" }, NOV), false, "novembro, mas só 8 dias");
  assert.equal(entraNoAvisoInterno({ aso_documento_path: "x", data_desligamento: "2026-11-01" }, NOV), false, "com ASO");
  // Só legado pendente: o cron fica totalmente silencioso.
  const db = cenario([[1, 30], [2, 118]]);
  const r = await cron();
  assert.equal(r.status, 200);
  assert.equal(r.corpo.aso_demissional_pendentes, 0);
  assert.equal(sinosPendente(db).length, 0);
  for (const k of [1, 2]) assert.equal(linha(db, k).ultimo_aviso_aso_pendente_enviado_em, null);
  // Na tela, o legado segue pendente (a regra da coluna/filtro não olha o início do controle).
  assert.equal(asoDemissionalPendente(linha(db, 2)), true);
  assert.equal(diasDesdeDesligamento(linha(db, 2).data_desligamento, NOV), 118);
  const tela = fs.readFileSync("src/components/RescisoesPageClient.tsx", "utf8");
  assert.ok(!tela.includes("CONTROLE_INICIO") && !tela.includes("entraNoAvisoInterno"), "a tela não esconde o legado");
  // Anexar ASO ao legado funciona e o cliente é avisado normalmente (1ª anexação).
  assert.equal((await anexar(db, 2, { path: UPLOAD_OK(FD(2)) })).status, 200);
  assert.equal(avisosCliente(db).length, 1);
  assert.equal(avisosCliente(db)[0].referencia_id, RD(2));
  assert.equal(sinosPendente(db).length, 0, "e nenhum aviso interno");
  // O aviso ao cliente não consulta o início do controle.
  assert.ok(!fs.readFileSync("src/lib/asoDemissional.ts", "utf8").replace(/\/\/.*$/gm, "").includes("CONTROLE_INICIO"));
}));

await ok("CRON silencioso: sem pendência, sem lista ou canal desligado não grava nenhum aviso; a lista vazia não derruba os outros passos", () => emNovembro(async () => {
  const semPendencia = cenario([[1, 30, { aso_documento_path: UPLOAD_OK(FD(1)) }], [2, 3]]);
  const r = await cron();
  assert.equal(r.status, 200);
  assert.equal(r.corpo.aso_demissional_pendentes, 0);
  assert.equal(sinosPendente(semPendencia).length, 0);
  assert.equal(linha(semPendencia, 2).ultimo_aviso_aso_pendente_enviado_em, null);

  const semLista = cenario([[1, 15]]); semLista.tabelas.aviso_destinatarios = [];
  assert.equal((await cron()).status, 200);
  assert.equal(sinosPendente(semLista).length, 0);
  assert.equal(linha(semLista, 1).ultimo_aviso_aso_pendente_enviado_em, null, "sem destinatário nada é marcado: quando alguém entrar na lista, é avisado");

  const desligado = cenario([[1, 15]]);
  for (const c of desligado.tabelas.aviso_eventos_canais) if (c.evento === "rescisao_aso_pendente") c.ativo = false;
  await cron();
  assert.equal(sinosPendente(desligado).length, 0);

  // Falha ao gravar o aviso: nada é marcado (o cron de amanhã tenta de novo) e a resposta continua 200.
  const falha = cenario([[1, 15]]); falha.falhas["notificacoes_analista.insert"] = "boom";
  const rf = await cron();
  assert.equal(rf.status, 200);
  assert.equal(linha(falha, 1).ultimo_aviso_aso_pendente_enviado_em, null);
  falha.falhas["notificacoes_analista.insert"] = undefined;
  await cron();
  assert.equal(sinosPendente(falha).length, 2, "recuperou no dia seguinte");
}));

await ok("CRON: exige o CRON_SECRET (sem ele = 401) e continua sendo o MESMO cron das rescisões (nenhum cron novo no vercel.json)", async () => {
  cenario([]);
  assert.equal((await chamar(R.cron.GET)).status, 401);
  assert.equal((await chamar(R.cron.GET, { headers: { authorization: "Bearer errado" } })).status, 401);
  const crons = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons.map((c: any) => c.path);
  assert.equal(crons.length, 12, "continuam 12 crons");
  assert.ok(crons.includes("/api/cron/rescisao-avisos"));
  assert.ok(!crons.some((p: string) => /aso-demissional/.test(p)));
});

await ok("REGRESSÃO — ASO PERIÓDICO intacto: a rota do portal só serve ativo, o cron lembrete-vencimento-aso e funcionario_asos não foram tocados", async () => {
  const db = cenario([[1, 20, { aso_documento_path: UPLOAD_OK(FD(1)) }]]);
  db.tabelas.funcionarios.push(funcionarioMot(FD(8), "2026-01-10", { nome_completo: "Func 8" }));
  db.tabelas.funcionario_asos = [
    { id: "aso-p1", funcionario_id: FD(8), data_exame: "2026-09-01", arquivo_path: `funcionarios/${FD(8)}/aso-periodico.pdf`, excluido_em: null },
    { id: "aso-p2", funcionario_id: FD(1), data_exame: "2026-09-01", arquivo_path: `funcionarios/${FD(1)}/aso-periodico.pdf`, excluido_em: null },
  ];
  logarPortal(db, "cli");
  const ativo = await chamar(R.portalAsoPeriodico.GET, { params: { funcionarioId: FD(8) } });
  assert.equal(ativo.status, 200); assert.match(ativo.corpo.signedUrl, /aso-periodico\.pdf/);
  const desligado = await chamar(R.portalAsoPeriodico.GET, { params: { funcionarioId: FD(1) } });
  assert.equal(desligado.status, 404, "a rota do ASO periódico continua travada a funcionário ativo");
  // A rota nova nunca devolve o ASO periódico, e a antiga nunca devolve o demissional.
  assert.ok(!(await portalUrl(db, FD(1))).corpo.signedUrl.includes("aso-periodico"));
  // Arquivos do ASO periódico não foram alterados nesta entrega.
  for (const f of ["src/app/api/cron/lembrete-vencimento-aso/route.ts", "src/lib/dispararAvisoAsoPeriodico.ts", "src/app/api/portal/funcionarios/[funcionarioId]/aso-url/route.ts"]) {
    const modificado = (await import("node:child_process")).execFileSync("git", ["status", "--porcelain", "--", f], { encoding: "utf8" }).trim();
    assert.equal(modificado, "", `${f} não foi tocado`);
  }
  const fonte = ["src/lib/asoDemissional.ts", "src/lib/asoDemissionalRegras.ts", "src/lib/asoDemissionalCron.ts", "src/app/api/rescisoes/[id]/aso-demissional/route.ts", "src/app/api/portal/funcionarios/[funcionarioId]/aso-demissional-url/route.ts"]
    .map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.ok(!/funcionario_asos|lembrete-vencimento-aso/.test(fonte.replace(/\/\/.*$/gm, "")), "o código novo não lê nem escreve funcionario_asos");
});

await ok("MIGRAÇÃO: aditiva e idempotente, 5 colunas nulas, sem RLS/policy/drop/backfill e sem dado de saúde", () => {
  const sql = fs.readFileSync("supabase/migration_aso_demissional.sql", "utf8");
  const codigo = sql.replace(/--.*$/gm, "");
  const colunas = [...codigo.matchAll(/add column if not exists (\w+) (\w+) null/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(colunas, [
    "aso_demissional_anexado_em:timestamptz", "aso_demissional_anexado_por:uuid", "aso_demissional_data_exame:date",
    "aso_demissional_aviso_cliente_em:timestamptz", "ultimo_aviso_aso_pendente_enviado_em:timestamptz",
  ]);
  assert.ok(!/policy|row level|enable row|drop |delete |truncate|alter table (?!public\.rescisoes)|update public/i.test(codigo), "nada de RLS/drop/delete/update");
  assert.ok(!/default/i.test(codigo.split("insert into")[0]), "colunas sem default (NULL)");
  assert.equal((codigo.match(/on conflict/gi) ?? []).length, 2, "os dois inserts de configuração são idempotentes");
  assert.ok(/not exists/i.test(codigo), "a carga de destinatários também é idempotente");
});

await ok("CATÁLOGO: os 2 eventos aparecem em Configurações > Avisos (grupos e canais certos; o do cliente sem lista de pessoas)", async () => {
  const c = await import("../src/lib/avisosCatalogo");
  assert.ok(c.EVENTOS_POR_GRUPO.rescisao.includes("rescisao_aso_pendente"));
  assert.ok(c.EVENTOS_POR_GRUPO.avisos_cliente.includes("aso_demissional_anexado_cliente"));
  assert.deepEqual([...c.canaisDoEvento("rescisao_aso_pendente")], ["sino"]);
  assert.deepEqual([...c.canaisDoEvento("aso_demissional_anexado_cliente")], ["sino", "popup"]);
  assert.equal(c.eventoSemLista("aso_demissional_anexado_cliente"), true);
  assert.equal(c.eventoSemLista("rescisao_aso_pendente"), false, "o interno tem lista de pessoas");
  assert.ok(c.NOTA_EVENTO.rescisao_aso_pendente && c.NOTA_EVENTO.aso_demissional_anexado_cliente);
});

await flush();
console.log(`\n${n} casos ok`);
