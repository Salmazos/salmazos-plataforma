// Vencimento de Contrato: Terceirização (fase temporária de até 270 dias, contados da admissão) entra na tela e nos alertas do PAINEL, como o MOT.
// O Portal do Cliente NÃO muda: continua só com MOT. Rotas e páginas rodam contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-vencimento-contrato-terceirizacao.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, HOJE, dataMais, novoDb, logar, logarPortal, importar, chamar, serializar, funcionarioMot, idMot } from "./harness-mot/ambiente.mjs";
import { mensagemAvisoPopupVencimentoMot, calcularVencimentoContratoMot, rotuloModalidadeContrato, ehTerceirizacao, TIPOS_COM_VENCIMENTO_CONTRATO } from "../src/lib/contratoMotStatus";

congelarData(AGORA_ISO); // 07/10/2026
const R = {
  popupPainel: await importar("src/app/api/funcionarios/vencimento-contrato/popup/route.ts"),
  popupPortal: await importar("src/app/api/portal/funcionarios/vencimento-contrato/popup/route.ts"),
  eventos: await importar("src/app/api/funcionarios/[id]/mot-eventos/route.ts"),
  paginaPainel: (await importar("src/app/painel/vencimento-contrato/page.tsx")).default,
  paginaPortal: (await importar("src/app/portal/(app)/vencimento-contrato/page.tsx")).default,
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const MOT = "mao_obra_temporaria", TERC = "terceirizacao", RS = "recrutamento_selecao";
const id = (k: number) => idMot(500 + k);
// Banco só com os funcionários do cenário: [k, tipo, dias desde a admissão, extras].
function cenario(linhas: [number, string, number, Record<string, unknown>?][]) {
  const db = novoDb(); logar(db, "dir"); logarPortal(db, "cli");
  db.tabelas.funcionarios = linhas.map(([k, tipo, dias, extra]) => funcionarioMot(id(k), dataMais(HOJE, -dias), { tipo_servico: tipo, nome_completo: `Func ${k}`, ...(extra ?? {}) }));
  db.tabelas.funcionario_mot_eventos = [];
  db.tabelas.rescisoes = [];
  return db;
}
const popupPainel = async (db: any, quem = "dir") => { logar(db, quem); return (await chamar(R.popupPainel.GET)).corpo; };
const idsPainel = async (db: any, quem = "dir") => ((await popupPainel(db, quem)).data ?? []).map((a: any) => a.funcionario_id).sort();
const idsPortal = async (db: any) => { logar(db, "dir"); logarPortal(db, "cli"); return (await chamar(R.popupPortal.GET)).corpo.data.map((a: any) => a.id).sort(); };
const POST = (db: any, fid: string, corpo: Record<string, unknown>) => { logar(db, "dir"); return chamar(R.eventos.POST, { metodo: "POST", params: { id: fid }, corpo }); };

await ok("regra: mensagens da terceirização (180, perto dos 270, excedido) e a do MOT INALTERADA; rótulos de modalidade", () => {
  const v = (dias: number) => calcularVencimentoContratoMot(dataMais(HOJE, -dias));
  assert.equal(mensagemAvisoPopupVencimentoMot(v(175), TERC), "Terceirização: faltam 4 dia(s) para completar 180 dias de contrato — requer aprovação de continuidade.");
  assert.equal(mensagemAvisoPopupVencimentoMot(v(265), TERC), "Terceirização: faltam 4 dia(s) para o fim da fase temporária (270 dias) — decida: desligar ou registrar o contrato definitivo.");
  assert.equal(mensagemAvisoPopupVencimentoMot(v(300), TERC), "Terceirização: a fase temporária já passou dos 270 dias há 31 dia(s) — decida: desligar ou registrar o contrato definitivo.");
  for (const t of [MOT, undefined, null, RS]) {
    assert.equal(mensagemAvisoPopupVencimentoMot(v(300), t as string | null | undefined), "Contrato já excedeu o limite legal de 270 dias há 31 dia(s) — ação imediata necessária (efetivação ou desligamento).");
    assert.equal(mensagemAvisoPopupVencimentoMot(v(175), t as string | null | undefined), "Faltam 4 dia(s) para completar 180 dias de contrato — requer aprovação de continuidade.");
  }
  assert.deepEqual([rotuloModalidadeContrato(TERC), rotuloModalidadeContrato(MOT), rotuloModalidadeContrato(null)], ["Terceirização", "MOT", "MOT"]);
  assert.deepEqual([ehTerceirizacao(TERC), ehTerceirizacao(MOT), ehTerceirizacao(RS)], [true, false, false]);
  assert.deepEqual([...TIPOS_COM_VENCIMENTO_CONTRATO], [MOT, TERC]);
});
await ok("PAINEL (popup): terceirização entra nas mesmas janelas do MOT (180: dias 169–179; 270: 259–269; excedido 270+) e fora delas não avisa", async () => {
  const db = cenario([[1, TERC, 50], [2, TERC, 168], [3, TERC, 169], [4, TERC, 258], [5, TERC, 259], [6, TERC, 269], [7, TERC, 270], [8, TERC, 300]]);
  assert.deepEqual(await idsPainel(db), [3, 5, 6, 7, 8].map(id).sort());
  const dados = (await popupPainel(db)).data;
  assert.ok(dados.every((a: any) => a.tipo_servico === TERC && a.mensagem.startsWith("Terceirização: ")));
  assert.match(dados.find((a: any) => a.funcionario_id === id(7)).mensagem, /passou dos 270 dias há 1 dia\(s\)/);
});
await ok("PAINEL: MOT e terceirização juntos; MOT mantém o texto e o campo tipo_servico; R&S e desligado NÃO entram", async () => {
  const db = cenario([[1, MOT, 300], [2, TERC, 300], [3, RS, 300], [4, TERC, 300, { status: "desligado" }], [5, MOT, 300, { status: "desligado" }]]);
  assert.deepEqual(await idsPainel(db), [id(1), id(2)]);
  const d = (await popupPainel(db)).data;
  assert.match(d.find((a: any) => a.funcionario_id === id(1)).mensagem, /^Contrato já excedeu o limite legal de 270 dias/);
  assert.equal(d.find((a: any) => a.funcionario_id === id(1)).tipo_servico, MOT);
});
await ok("PORTAL DO CLIENTE (popup): continua SÓ com MOT — terceirização nunca aparece, em nenhuma faixa", async () => {
  const db = cenario([[1, MOT, 300], [2, TERC, 300], [3, TERC, 175], [4, TERC, 265], [5, MOT, 175]]);
  assert.deepEqual(await idsPortal(db), [id(1), id(5)]);
  assert.equal(JSON.stringify((await chamar(R.popupPortal.GET)).corpo).includes("Terceirização"), false);
});
await ok("RELATÓRIO do painel: linhas de MOT e Terceirização com tipoServico, ordenadas pelo vencimento mais próximo; o do PORTAL só tem MOT", async () => {
  const db = cenario([[1, MOT, 100], [2, TERC, 300], [3, TERC, 100], [4, RS, 300], [5, MOT, 265], [6, TERC, 10, { status: "desligado" }]]);
  logar(db, "dir");
  const linhas = serializar(await R.paginaPainel()).props.linhasIniciais;
  assert.deepEqual(linhas.map((l: any) => [l.id, l.tipoServico]), [[id(2), TERC], [id(5), MOT], [id(1), MOT], [id(3), TERC]]);
  assert.equal(linhas[0].label, "Vencido");
  logar(db, "dir"); logarPortal(db, "cli");
  // A página do portal é um <div> com a lista dentro: acha o componente que recebe `linhas`.
  const achar = (no: any): any => (no && typeof no === "object" ? (no.props?.linhas ? no : [].concat(no.filhos ?? []).map(achar).find(Boolean)) : undefined);
  const portal = achar(serializar(await R.paginaPortal())).props.linhas;
  assert.deepEqual(portal.map((l: any) => l.id).sort(), [id(1), id(5)].sort(), "portal: só MOT");
  assert.equal(JSON.stringify(portal).includes("terceirizacao"), false);
});
await ok("escopo por unidade: supervisor da U1 só vê terceirizado da U1; o da U2 não vê o da U1", async () => {
  const db = cenario([[1, TERC, 300], [2, TERC, 300, { unidade_id: "U2" }]]);
  assert.deepEqual(await idsPainel(db, "dir"), [id(1), id(2)]);
  assert.deepEqual(await idsPainel(db, "sup1"), [id(1)]);
  assert.deepEqual(await idsPainel(db, "sup2"), [id(2)]);
  assert.deepEqual(await idsPainel(db, "ana"), [], "sem acesso ao RH não recebe");
  logar(db, "ana"); assert.equal((await chamar(R.popupPainel.GET)).status, 403);
});
await ok("eventos: terceirização aceita afastamento e prorrogação; R&S e desligado continuam recusados", async () => {
  const db = cenario([[1, TERC, 175], [2, RS, 175], [3, TERC, 175, { status: "desligado" }]]);
  const prorrogacao = await POST(db, id(1), { tipo: "prorrogacao", data_evento: "2026-10-01" });
  assert.equal(prorrogacao.status, 201, JSON.stringify(prorrogacao.corpo));
  assert.equal(db.tabelas.funcionario_mot_eventos[0].funcionario_id, id(1));
  const rs = await POST(db, id(2), { tipo: "prorrogacao", data_evento: "2026-10-01" });
  assert.deepEqual([rs.status, /mão de obra temporária ou de terceirização/.test(rs.corpo.error)], [400, true]);
  assert.equal((await POST(db, id(3), { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 409);
  assert.equal(db.tabelas.funcionario_mot_eventos.length, 1, "nada gravado nos recusados");
});
await ok("silêncio vale para a terceirização: prorrogação cala só o aviso dos 180 (o dos 270 continua); afastamento em aberto cala tudo; fim reativa", async () => {
  const db = cenario([[1, TERC, 175], [2, TERC, 265], [3, TERC, 300]]);
  assert.deepEqual(await idsPainel(db), [id(1), id(2), id(3)]);
  assert.equal((await POST(db, id(1), { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 201);
  assert.equal((await POST(db, id(2), { tipo: "prorrogacao", data_evento: "2026-10-01" })).status, 201);
  assert.deepEqual(await idsPainel(db), [id(2), id(3)], "prorrogação cala só os 180");
  assert.equal((await POST(db, id(3), { tipo: "afastamento_inicio", data_evento: "2026-10-02", tipo_beneficio: "auxilio_doenca" })).status, 201);
  assert.deepEqual(await idsPainel(db), [id(2)], "afastamento em aberto cala o excedido");
  assert.equal((await POST(db, id(3), { tipo: "afastamento_fim", data_evento: "2026-10-06" })).status, 201);
  assert.deepEqual(await idsPainel(db), [id(2), id(3)], "fim do afastamento reativa");
});
await ok("rescisão programada cala o aviso da terceirização (regra única de silêncio)", async () => {
  const db = cenario([[1, TERC, 300]]);
  assert.deepEqual(await idsPainel(db), [id(1)]);
  db.tabelas.rescisoes.push({ id: "r1", funcionario_id: id(1), data_desligamento: dataMais(HOJE, 20), unidade_id: "U1" });
  assert.deepEqual(await idsPainel(db), []);
});
await ok("fiação: portal não usa a lista de modalidades do painel; telas e ficha mostram a terceirização; sem cron novo", () => {
  const portalPagina = fs.readFileSync("src/app/portal/(app)/vencimento-contrato/page.tsx", "utf8");
  const portalPopup = fs.readFileSync("src/app/api/portal/funcionarios/vencimento-contrato/popup/route.ts", "utf8");
  for (const f of [portalPagina, portalPopup]) { assert.ok(f.includes('.eq("tipo_servico", "mao_obra_temporaria")')); assert.equal(f.includes("TIPOS_COM_VENCIMENTO_CONTRATO") || f.includes("terceirizacao"), false); }
  const tela = fs.readFileSync("src/components/VencimentoContratoPageClient.tsx", "utf8");
  for (const t of ["Todas as modalidades", "Terceirização (", "<th style={TH_STYLE}>Modalidade</th>", "rotuloModalidadeContrato", "fase temporária"]) assert.ok(tela.includes(t), t);
  const ficha = fs.readFileSync("src/components/FuncionarioDetalheClient.tsx", "utf8");
  assert.ok(ficha.includes('funcionario.tipo_servico === "terceirizacao"') && ficha.includes("Contrato temporário (Terceirização)"));
  const popup = fs.readFileSync("src/components/PopupVencimentoContratoMot.tsx", "utf8");
  assert.ok(popup.includes("MOT e Terceirização") && popup.includes("modalidade={selecionado?.tipo_servico ?? null}"));
  assert.equal(fs.readFileSync("vercel.json", "utf8"), execFileSync("git", ["show", "main:vercel.json"], { encoding: "utf8" }), "vercel.json idêntico ao da main: nenhum cron novo");
});

console.log(`\n${n} verificações OK`);
