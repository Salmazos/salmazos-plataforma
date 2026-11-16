// Pacote da contabilidade: gerar NÃO baixa o PDF sozinho (o RH recebe a cópia do e-mail em cópia); o download é um botão OPCIONAL
// ("Baixar PDF") para envio manual. A rota /pacote devolve a URL assinada normal ou, com ?baixar=1, uma que força o download com o nome
// "admissao-<candidato>.pdf". Mesmas regras de acesso de antes. Rota roda contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-pacote-download-opcional.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, novoDb, logar, importar, chamar } from "./harness-mot/ambiente.mjs";

congelarData(AGORA_ISO);
const rota = await importar("src/app/api/admissoes/[id]/pacote/route.ts");
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const ADM = "aaaaaaaa-2222-4000-8000-000000000001", ADM_SEM = "aaaaaaaa-2222-4000-8000-000000000002", ADM_U2 = "aaaaaaaa-2222-4000-8000-000000000003";
const PATH = `pacotes-contabilidade/${ADM}/pacote-1.pdf`;
function cenario() {
  const db = novoDb(); logar(db, "dir");
  db.tabelas.candidatos = [{ id: "cand1", nome_completo: "ZZTEST Conceição D'Ávila" }, { id: "cand2", nome_completo: "Outro" }];
  db.tabelas.admissoes = [
    { id: ADM, candidato_id: "cand1", unidade_id: "U1", pdf_pacote_path: PATH },
    { id: ADM_SEM, candidato_id: "cand2", unidade_id: "U1", pdf_pacote_path: null },
    { id: ADM_U2, candidato_id: "cand2", unidade_id: "U2", pdf_pacote_path: `pacotes-contabilidade/${ADM_U2}/pacote-1.pdf` },
  ];
  db.urlsAssinadas = [];
  return db;
}
const GET = (id: string, query = "") => chamar(rota.GET, { params: { id }, url: `http://t/api${query}` });

await ok("sem ?baixar: URL assinada comum (abre/visualiza), sem forçar download, TTL de 15 min — igual a antes", async () => {
  const db = cenario();
  const r = await GET(ADM);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.signedUrl.includes("download="), false);
  assert.deepEqual(db.urlsAssinadas.map((u: any) => [u.caminho, u.ttl, u.opcoes]), [[PATH, 900, undefined]]);
});
await ok("?baixar=1: URL que força o download com o nome 'admissao-<candidato sem acento>.pdf'", async () => {
  const db = cenario();
  const r = await GET(ADM, "?baixar=1");
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(db.urlsAssinadas[0].opcoes.download, "admissao-zztest-conceicao-d-avila.pdf");
  assert.equal(db.urlsAssinadas[0].caminho, PATH);
  assert.equal(db.urlsAssinadas[0].ttl, 900);
  assert.ok(r.corpo.signedUrl.includes("download=admissao-zztest-conceicao-d-avila.pdf"));
  for (const outro of ["?baixar=0", "?baixar=true", "?baixar="]) { cenario(); const x = await GET(ADM, outro); assert.equal(x.status, 200); assert.equal(x.corpo.signedUrl.includes("download="), false, outro); }
});
await ok("acesso inalterado: sem login 401, analista 403, supervisor de outra unidade 404, pacote não gerado 400", async () => {
  const db = cenario();
  logar(db, null); assert.equal((await GET(ADM, "?baixar=1")).status, 401);
  logar(db, "ana"); assert.equal((await GET(ADM, "?baixar=1")).status, 403);
  logar(db, "sup1"); assert.equal((await GET(ADM_U2, "?baixar=1")).status, 404);
  assert.equal((await GET(ADM, "?baixar=1")).status, 200, "supervisor da mesma unidade");
  logar(db, "dir");
  const sem = await GET(ADM_SEM, "?baixar=1");
  assert.deepEqual([sem.status, sem.corpo.error], [400, "Nenhum pacote foi gerado ainda para esta admissão."]);
  assert.equal(db.urlsAssinadas.length, 1, "só a chamada válida gerou URL");
});
await ok("gerar o pacote (normal e forçado) NÃO baixa mais o PDF; o botão 'Baixar PDF' é opcional e avisa do dado sensível", () => {
  const tela = fs.readFileSync("src/components/AdmissaoDetalheClient.tsx", "utf8");
  const gerar = tela.slice(tela.indexOf("const handleGerarPdf = async"), tela.indexOf("const handleCancelarAdmissao"));
  const forcar = tela.slice(tela.indexOf("const handleForcarGeracaoPacote = async"), tela.indexOf("const handleBaixarPacote"));
  for (const [nome, trecho] of [["handleGerarPdf", gerar], ["handleForcarGeracaoPacote", forcar]] as const) {
    for (const proibido of ["res.blob()", "createObjectURL", "a.download", 'createElement("a")']) assert.equal(trecho.includes(proibido), false, `${nome} não pode conter ${proibido}`);
    assert.ok(trecho.includes('setStatus("enviado_contabilidade")'), `${nome} continua marcando o status`);
    assert.ok(trecho.includes("Baixar PDF"), `${nome} avisa que o download é opcional`);
  }
  assert.ok(tela.includes("/pacote?baixar=1") && tela.includes("Baixar PDF") && tela.includes("Opcional — para envio manual"));
  const baixar = tela.slice(tela.indexOf("const handleBaixarPacote"), tela.indexOf("const handleVerPacote"));
  assert.ok(baixar.includes("dados pessoais sensíveis"), "aviso de dado sensível no download");
  assert.ok(tela.includes("setModalEmailAberto(true)") && tela.includes("Enviar por e-mail"), "envio por e-mail intacto");
});
await ok("rota gerar-pdf inalterada (mesmo contrato: segue devolvendo o PDF e gravando pdf_pacote_path); e-mail continua lendo o arquivo do Storage", () => {
  const rg = fs.readFileSync("src/app/api/admissoes/[id]/gerar-pdf/route.ts", "utf8");
  assert.ok(rg.includes('"Content-Type": "application/pdf"') && rg.includes("pdf_pacote_path: uploadPath"));
  const em = fs.readFileSync("src/app/api/admissoes/[id]/pacote/enviar-email/route.ts", "utf8");
  assert.ok(em.includes('.download(ctx.adm.pdf_pacote_path)') && em.includes("attachments:"));
});

console.log(`\n${n} verificações OK`);
