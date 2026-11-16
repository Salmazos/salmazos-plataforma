// Certidão civil FRENTE e VERSO: o verso (certidao_civil_verso) é opcional (averbação de divórcio), tem linha/arquivo/status próprios como o
// rg_verso, mas NUNCA bloqueia envio nem pacote. Admissões antigas (sem verso) ficam como estão. Rotas rodam contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-certidao-verso.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { PdfWriter } from "@/lib/pdfWriter";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, novoDb, logar, logarPortal, importar, chamar, idMot } from "./harness-mot/ambiente.mjs";
import {
  DOCUMENTOS_ADMISSAO, TIPO_CERTIDAO_VERSO, ehVersoOpcional, contaNoProgressoDocumentos, documentoEntraNoPacote,
} from "@/lib/admissaoDocumentos";
import { anexarDocumentosAoPacote, ROTULO_RG_FRENTE_E_VERSO, ROTULO_CERTIDAO_FRENTE_E_VERSO, ordenarDocumentosPacote, type DocumentoOrdenavel } from "@/lib/pacoteOrdem";

congelarData(AGORA_ISO);
const R = {
  tokenRota: await importar("src/app/api/admissoes/token/[token]/route.ts"),
  upPublico: await importar("src/app/api/admissoes/token/[token]/documentos/[tipo]/route.ts"),
  upPainel: await importar("src/app/api/admissoes/[id]/documentos-upload/[tipo]/route.ts"),
  revisar: await importar("src/app/api/admissoes/[id]/documentos/[docId]/route.ts"),
  portalDocs: await importar("src/app/api/portal/funcionarios/[funcionarioId]/documentos/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const ADM = "aaaaaaaa-1111-4000-8000-000000000001";
const TOKEN = "tok-certidao";
const ORDEM = DOCUMENTOS_ADMISSAO.map((d) => d.tipo_documento);
const MB = 1024 * 1024;

// Admissão aberta com as linhas semeadas como a criação faz (todas as definições não-apenasPainel). `semVerso` imita uma admissão antiga.
function cenario({ semVerso = false, status = "em_preenchimento" } = {}) {
  const db = novoDb(); logar(db, "dir"); logarPortal(db, "cli");
  db.tabelas.admissoes = [{ id: ADM, token: TOKEN, status, token_expira_em: "2027-01-01T00:00:00Z", unidade_id: "U1" }];
  db.tabelas.admissao_documentos = DOCUMENTOS_ADMISSAO.filter((d) => !d.apenasPainel && !(semVerso && d.tipo_documento === TIPO_CERTIDAO_VERSO))
    .map((d, i) => ({ id: `d-${i}`, admissao_id: ADM, tipo_documento: d.tipo_documento, obrigatorio: d.obrigatorio && !d.condicional, condicional: d.condicional, status: "pendente", storage_path: null, motivo_rejeicao: null, created_at: "2026-10-01T00:00:00Z" }));
  db.tabelas.audit_logs = [];
  return db;
}
const linha = (db: any, tipo: string) => db.tabelas.admissao_documentos.find((d: any) => d.tipo_documento === tipo);
const confirmar = (tipo: string, nome = "a.jpg") => chamar(R.upPublico.PATCH, { metodo: "PATCH", params: { token: TOKEN, tipo }, corpo: { storage_path: `${ADM}/${tipo}/1-${nome}` } });
async function painelUpload(db: any, tipo: string, arquivo: File) {
  logar(db, "dir");
  const form = new FormData(); form.append("arquivo", arquivo);
  const req = new Request("http://t/api", { method: "PATCH", body: form });
  Object.defineProperty(req, "nextUrl", { value: new URL(req.url) });
  const res = await R.upPainel.PATCH(req, { params: Promise.resolve({ id: ADM, tipo }) });
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}
const arq = (nome: string, tipo: string, bytes = 100) => new File([new Uint8Array(bytes)], nome, { type: tipo });

await ok("definição: verso opcional logo depois da certidão; rótulos do candidato; label do painel/pacote da certidão NÃO muda", () => {
  const i = ORDEM.indexOf("certidao_civil");
  assert.equal(ORDEM[i + 1], TIPO_CERTIDAO_VERSO, "verso logo após a frente (ordem do pacote)");
  const frente = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === "certidao_civil")!;
  const verso = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === TIPO_CERTIDAO_VERSO)!;
  assert.equal(frente.label, "Certidão de Nascimento/Casamento/União Estável", "label original intacto");
  assert.equal(frente.obrigatorio, true);
  assert.match(frente.labelCandidato!, /Frente$/);
  assert.equal(verso.obrigatorio, false);
  assert.equal(verso.condicional, null);
  assert.match(verso.labelCandidato!, /Verso \(opcional — envie se houver averbação de divórcio\)$/);
  assert.equal(verso.versoOpcional && verso.ocultoNoPortal, true);
  assert.equal(ehVersoOpcional("rg_verso") || ehVersoOpcional("cnh_verso") || ehVersoOpcional("certidao_civil"), false, "RG/CNH verso e certidão continuam como eram");
});
await ok("migração: só amplia o CHECK (superconjunto da lista atual) e não mexe em dados", () => {
  const sql = fs.readFileSync("supabase/migration_certidao_frente_verso.sql", "utf8").replace(/--.*$/gm, "");
  const lista = (t: string) => [...t.matchAll(/'([a-z0-9_]+)'::text/g)].map((m) => m[1]);
  const antiga = lista(fs.readFileSync("supabase/migration_cnh_verso.sql", "utf8"));
  const nova = lista(sql);
  assert.deepEqual([...nova].sort(), [...antiga, TIPO_CERTIDAO_VERSO].sort());
  assert.deepEqual(ORDEM.filter((t) => !nova.includes(t)), [], "todo tipo do código é aceito pelo CHECK");
  assert.equal(/\b(insert|update|delete|truncate|drop\s+table|drop\s+column)\b/i.test(sql), false, "sem DML nem DROP de dado");
  assert.ok(/DROP CONSTRAINT IF EXISTS/.test(sql) && /ADD CONSTRAINT admissao_documentos_tipo_documento_check/.test(sql), "idempotente");
});
await ok("candidato: só a frente continua OK e o ENVIO FINAL não exige o verso", async () => {
  const db = cenario();
  for (const d of db.tabelas.admissao_documentos) if (d.obrigatorio) { d.status = "enviado"; d.storage_path = `${ADM}/${d.tipo_documento}/1-x.jpg`; }
  const r = await confirmar("certidao_civil");
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(linha(db, TIPO_CERTIDAO_VERSO).status, "pendente", "verso segue vazio");
  const envio = await chamar(R.tokenRota.PATCH, { metodo: "PATCH", params: { token: TOKEN }, corpo: { submit: true, lgpd_aceite: true } });
  assert.equal(envio.status, 200, JSON.stringify(envio.corpo));
  assert.equal(db.tabelas.admissoes[0].status, "aguardando_analise");
});
await ok("candidato: frente + verso — duas linhas com arquivo e status próprios; PDF único na frente também funciona", async () => {
  const db = cenario();
  assert.equal((await confirmar("certidao_civil", "frente.jpg")).status, 200);
  assert.equal((await confirmar(TIPO_CERTIDAO_VERSO, "verso.jpg")).status, 200);
  assert.deepEqual([linha(db, "certidao_civil").status, linha(db, TIPO_CERTIDAO_VERSO).status], ["enviado", "enviado"]);
  assert.match(linha(db, TIPO_CERTIDAO_VERSO).storage_path, new RegExp(`^${ADM}/${TIPO_CERTIDAO_VERSO}/`), "mesmo padrão de path (admissaoId/tipo/…)");
  const db2 = cenario();
  assert.equal((await confirmar("certidao_civil", "frente-e-verso.pdf")).status, 200);
  assert.deepEqual([linha(db2, "certidao_civil").status, linha(db2, TIPO_CERTIDAO_VERSO).status], ["enviado", "pendente"]);
});
await ok("tipo inválido rejeitado na rota pública (assinatura e confirmação); limites de tamanho/tipo do cliente seguem os do RG", async () => {
  cenario();
  for (const t of ["certidao_civil_xyz", "certidao_verso", "../rg"]) {
    assert.equal((await chamar(R.upPublico.POST, { metodo: "POST", params: { token: TOKEN, tipo: t }, corpo: { filename: "a.jpg" } })).status, 400, t);
    assert.equal((await chamar(R.upPublico.PATCH, { metodo: "PATCH", params: { token: TOKEN, tipo: t }, corpo: { storage_path: "x/y/1-a.jpg" } })).status, 400, t);
  }
  const assina = await chamar(R.upPublico.POST, { metodo: "POST", params: { token: TOKEN, tipo: TIPO_CERTIDAO_VERSO }, corpo: { filename: "meu verso.jpg" } });
  assert.equal(assina.status, 200);
  assert.match(assina.corpo.path, new RegExp(`^${ADM}/${TIPO_CERTIDAO_VERSO}/\\d+-meu_verso\\.jpg$`), "URL assinada do bucket privado, nome sanitizado");
  const cli = fs.readFileSync("src/components/admissao/PassoUploadDocumentos.tsx", "utf8");
  assert.ok(cli.includes("10 * 1024 * 1024") && cli.includes('["image/jpeg", "image/png", "image/heic", "application/pdf"]'), "validação do cliente: 10 MB e JPG/PNG/HEIC/PDF");
});
await ok("painel: verso inválido (tipo ou tamanho) é rejeitado; JPG/PNG/PDF/HEIC até 10 MB passam", async () => {
  const db = cenario();
  const gif = await painelUpload(db, TIPO_CERTIDAO_VERSO, arq("v.gif", "image/gif"));
  assert.deepEqual([gif.status, gif.corpo.error], [400, "Formato não aceito. Envie JPG, PNG, PDF ou HEIC."]);
  const grande = await painelUpload(db, TIPO_CERTIDAO_VERSO, arq("v.jpg", "image/jpeg", 10 * MB + 1));
  assert.deepEqual([grande.status, grande.corpo.error], [400, "Arquivo maior que 10MB."]);
  assert.equal(linha(db, TIPO_CERTIDAO_VERSO).storage_path, null, "nada gravado");
  for (const [nome, tipo] of [["v.jpg", "image/jpeg"], ["v.png", "image/png"], ["v.pdf", "application/pdf"]] as const) {
    assert.equal((await painelUpload(db, TIPO_CERTIDAO_VERSO, arq(nome, tipo))).status, 200, nome);
  }
  assert.equal((await painelUpload(db, TIPO_CERTIDAO_VERSO, arq("v.heic", "", 10))).status, 200, ".heic sem mime");
  assert.equal(Object.keys(db.arquivos).every((c) => c.startsWith(`${ADM}/${TIPO_CERTIDAO_VERSO}/`)), true);
});
await ok("aprovação do verso é SEPARADA (como o rg_verso) e não mexe na certidão; verso rejeitado não bloqueia nada", async () => {
  const db = cenario();
  await confirmar("certidao_civil"); await confirmar(TIPO_CERTIDAO_VERSO);
  const rev = (docId: string, corpo: object) => { logar(db, "dir"); return chamar(R.revisar.PATCH, { metodo: "PATCH", params: { id: ADM, docId }, corpo }); };
  assert.equal((await rev(linha(db, "certidao_civil").id, { status: "aprovado" })).status, 200);
  assert.equal((await rev(linha(db, TIPO_CERTIDAO_VERSO).id, { status: "rejeitado", motivo_rejeicao: "Ilegível" })).status, 200);
  assert.deepEqual([linha(db, "certidao_civil").status, linha(db, TIPO_CERTIDAO_VERSO).status], ["aprovado", "rejeitado"]);
  const pendentes = db.tabelas.admissao_documentos.filter((d: any) => d.obrigatorio && d.status !== "aprovado" && d.tipo_documento === "certidao_civil");
  assert.equal(pendentes.length, 0, "a certidão aprovada fecha o requisito; o verso (obrigatorio=false) nunca entra em pendências");
  assert.equal(linha(db, TIPO_CERTIDAO_VERSO).obrigatorio, false);
});
await ok("admissão ANTIGA sem a linha do verso: criada sob demanda no envio (candidato e painel); tipo obrigatório sem linha segue falhando como antes", async () => {
  const db = cenario({ semVerso: true });
  assert.equal(linha(db, TIPO_CERTIDAO_VERSO), undefined);
  const r = await confirmar(TIPO_CERTIDAO_VERSO);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual([linha(db, TIPO_CERTIDAO_VERSO).status, linha(db, TIPO_CERTIDAO_VERSO).obrigatorio], ["enviado", false]);
  assert.equal(db.tabelas.admissao_documentos.filter((d: any) => d.tipo_documento === TIPO_CERTIDAO_VERSO).length, 1);
  const db2 = cenario({ semVerso: true, status: "aprovado" });
  const p = await painelUpload(db2, TIPO_CERTIDAO_VERSO, arq("v.jpg", "image/jpeg"));
  assert.equal(p.status, 200, JSON.stringify(p.corpo));
  assert.equal(db2.tabelas.admissao_documentos.filter((d: any) => d.tipo_documento === TIPO_CERTIDAO_VERSO).length, 1);
  // sem efeito colateral nos demais tipos: apagar a linha do RG e enviar continua dando erro (comportamento de antes)
  const db3 = cenario(); db3.tabelas.admissao_documentos = db3.tabelas.admissao_documentos.filter((d: any) => d.tipo_documento !== "rg");
  assert.equal((await confirmar("rg")).status, 400);
});
await ok("portal do cliente: o verso aprovado NÃO aparece; certidão e demais documentos aprovados aparecem como hoje", async () => {
  const db = cenario({ status: "enviado_contabilidade" });
  const FUNC = idMot(901);
  db.tabelas.funcionarios.push({ id: FUNC, nome_completo: "F", cliente_id: "C1", status: "ativo", admissao_id: ADM, tipo_servico: "mao_obra_temporaria", unidade_id: "U1" });
  for (const t of ["certidao_civil", TIPO_CERTIDAO_VERSO, "rg", "rg_verso", "cpf"]) Object.assign(linha(db, t), { status: "aprovado", storage_path: `${ADM}/${t}/1-a.jpg` });
  const r = await chamar(R.portalDocs.GET, { params: { funcionarioId: FUNC } });
  assert.equal(r.status, 200);
  const rotulos = r.corpo.data.map((i: any) => i.label);
  assert.deepEqual(rotulos, ["CPF/CIC", "Identidade RG (frente)", "Identidade RG (verso)", "Certidão de Nascimento/Casamento/União Estável"]);
  assert.equal(JSON.stringify(r.corpo).includes("verso)\""), true, "RG verso segue visível (só a certidão é oculta)");
  assert.equal(rotulos.some((l: string) => l.includes("(verso)") && l.includes("Certidão")), false);
});
await ok("contadores: verso opcional SEM arquivo fica fora do N de M e do docsEnviados; com arquivo conta no N de M; lista nunca mostra 17/16", () => {
  assert.equal(contaNoProgressoDocumentos({ tipo_documento: TIPO_CERTIDAO_VERSO, storage_path: null }), false);
  assert.equal(contaNoProgressoDocumentos({ tipo_documento: TIPO_CERTIDAO_VERSO, storage_path: "a/b/1-c.jpg" }), true);
  for (const t of ["certidao_civil", "rg_verso", "reservista", "cnh_verso"]) assert.equal(contaNoProgressoDocumentos({ tipo_documento: t, storage_path: null }), true, `${t} segue contando (sem mudança)`);
  const lista = fs.readFileSync("src/app/painel/admissoes/page.tsx", "utf8");
  assert.ok(lista.includes("if (d.tipo_documento === TIPO_CERTIDAO_VERSO) continue;") && lista.includes("docsTotal: 16"), "docsEnviados ignora o verso; docsTotal segue 16");
  const painel = fs.readFileSync("src/components/AdmissaoDetalheClient.tsx", "utf8");
  assert.ok(painel.includes("documentos.filter(contaNoProgressoDocumentos).length"));
});
await ok("candidato: verso nunca aparece como pendência (revisão mostra 'Opcional — não enviado'; faltando/botão final só olham obrigatórios)", () => {
  const rev = fs.readFileSync("src/components/admissao/PassoRevisao.tsx", "utf8");
  assert.ok(rev.includes("Opcional — não enviado") && rev.includes("def?.labelCandidato"));
  const up = fs.readFileSync("src/components/admissao/PassoUploadDocumentos.tsx", "utf8");
  assert.ok(up.includes("def?.labelCandidato ?? def?.label") && up.includes("def.labelCandidato ?? def.label"));
  assert.ok(up.includes("<TituloComLado label={label} />") && up.includes("notaVersoOpcionalStyle") && up.includes("(Frente|Verso)"), "lado (Frente/Verso) e aviso do verso destacados");
  assert.ok(/<p style=\{notaVersoOpcionalStyle\}>/.test(up) && !up.includes("notaVersoOpcionalStyle}>{nota}</p>\n      )}\n\n      <div style={{ ...infoBox"), "só o verso opcional usa a caixa âmbar");
  const form = fs.readFileSync("src/components/admissao/AdmissaoFormClient.tsx", "utf8");
  assert.ok(form.includes("else if (!def.obrigatorio) return false;"), "documento não obrigatório nunca entra em 'faltando'");
});

// ── Pacote da contabilidade ──
async function png(cor: number) { return sharp({ create: { width: 40, height: 60, channels: 3, background: { r: cor, g: 90, b: 90 } } }).png().toBuffer(); }
const doc = (tipo: string, n2: number, ext = "png", extra: Partial<DocumentoOrdenavel & { status: string }> = {}) => ({ id: `${tipo}-${n2}`, tipo_documento: tipo, storage_path: `A/${tipo}/${n2}-x.${ext}`, created_at: "2026-10-01T00:00:00Z", status: "enviado", ...extra });
async function montar(docs: ReturnType<typeof doc>[], fonte: Record<string, Uint8Array | Buffer>) {
  const pdfDoc = await PDFDocument.create();
  const w = await PdfWriter.create(pdfDoc);
  const baixados: string[] = [];
  const ordenados = ordenarDocumentosPacote(docs.filter(documentoEntraNoPacote), ORDEM);
  const r = await anexarDocumentosAoPacote({
    pdfDoc, w, admissaoId: "A", docs: ordenados, labelPorTipo: (t) => DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === t)?.label ?? t,
    baixar: async (p) => { baixados.push(p); return fonte[p] ? new Uint8Array(fonte[p]) : null; },
  });
  return { r, baixados, paginas: pdfDoc.getPageCount() };
}
await ok("pacote: com verso, entra logo depois da frente com rótulo próprio; sem verso, não quebra e nada muda", async () => {
  const [a, b] = [await png(10), await png(200)];
  const f = doc("certidao_civil", 1), v = doc(TIPO_CERTIDAO_VERSO, 2), cpf = doc("cpf", 3);
  const com = await montar([v, cpf, f], { [f.storage_path]: a, [v.storage_path]: b, [cpf.storage_path]: a });
  assert.deepEqual(com.r.entradas.map((e) => e.rotulo), ["CPF/CIC", "Certidão de Nascimento/Casamento/União Estável", "Certidão de Nascimento/Casamento/União Estável (verso)"]);
  assert.equal(com.r.naoEmbutidos.length, 0);
  assert.equal(com.paginas, 3 + 1, "3 documentos + a página inicial do PdfWriter");
  const sem = await montar([cpf, f], { [f.storage_path]: a, [cpf.storage_path]: a });
  assert.deepEqual(sem.r.entradas.map((e) => e.rotulo), ["CPF/CIC", "Certidão de Nascimento/Casamento/União Estável"]);
  assert.equal(sem.paginas, 2 + 1);
  const vazio = await montar([cpf, f, doc(TIPO_CERTIDAO_VERSO, 9, "png", { storage_path: null as unknown as string })], { [f.storage_path]: a, [cpf.storage_path]: a });
  assert.equal(vazio.r.entradas.length, 2, "linha do verso sem arquivo não gera entrada");
});
await ok("pacote: verso REJEITADO não entra (só ele); documento rejeitado de outro tipo continua entrando como antes", async () => {
  const a = await png(10);
  const f = doc("certidao_civil", 1), v = doc(TIPO_CERTIDAO_VERSO, 2, "png", { status: "rejeitado" }), res = doc("reservista", 3, "png", { status: "rejeitado" });
  const { r } = await montar([f, v, res], { [f.storage_path]: a, [v.storage_path]: a, [res.storage_path]: a });
  assert.deepEqual(r.entradas.map((e) => e.tipo_documento), ["reservista", "certidao_civil"]);
  assert.equal(documentoEntraNoPacote({ tipo_documento: TIPO_CERTIDAO_VERSO, status: "enviado", storage_path: "x" }), true);
  assert.equal(documentoEntraNoPacote({ tipo_documento: TIPO_CERTIDAO_VERSO, status: "aprovado", storage_path: "x" }), true);
  const rota = fs.readFileSync("src/app/api/admissoes/[id]/gerar-pdf/route.ts", "utf8");
  assert.ok(rota.includes(".filter(documentoEntraNoPacote)"), "gerar-pdf usa o filtro");
});
await ok("pacote: frente e verso IDÊNTICOS viram um só ('frente e verso'), sem baixar duas vezes; distintos continuam dois; RG segue igual", async () => {
  const [a, b] = [await png(10), await png(200)];
  const f = doc("certidao_civil", 1), v = doc(TIPO_CERTIDAO_VERSO, 2), rg = doc("rg", 3), rgv = doc("rg_verso", 4);
  const igual = await montar([f, v], { [f.storage_path]: a, [v.storage_path]: a });
  assert.deepEqual(igual.r.entradas.map((e) => e.rotulo), [ROTULO_CERTIDAO_FRENTE_E_VERSO]);
  assert.equal(igual.baixados.length, 2, "cada arquivo baixado uma vez (a comparação reaproveita os bytes)");
  assert.equal(igual.paginas, 1 + 1, "um só documento");
  const dif = await montar([f, v], { [f.storage_path]: a, [v.storage_path]: b });
  assert.equal(dif.r.entradas.length, 2);
  const duplo = await montar([f, v, rg, rgv], { [f.storage_path]: a, [v.storage_path]: a, [rg.storage_path]: b, [rgv.storage_path]: b });
  assert.deepEqual(duplo.r.entradas.map((e) => e.rotulo), [ROTULO_RG_FRENTE_E_VERSO, ROTULO_CERTIDAO_FRENTE_E_VERSO]);
  const soRg = await montar([rg, rgv, f], { [rg.storage_path]: b, [rgv.storage_path]: b, [f.storage_path]: a });
  assert.deepEqual(soRg.r.entradas.map((e) => e.rotulo), [ROTULO_RG_FRENTE_E_VERSO, "Certidão de Nascimento/Casamento/União Estável"]);
});
await ok("regressão: admissão antiga (certidão aprovada, sem verso) — nenhuma pendência nova, nenhum contador muda, pacote idêntico", async () => {
  const antiga = DOCUMENTOS_ADMISSAO.filter((d) => d.tipo_documento !== TIPO_CERTIDAO_VERSO && !d.apenasPainel)
    .map((d, i) => ({ id: `o${i}`, tipo_documento: d.tipo_documento, obrigatorio: d.obrigatorio && !d.condicional, status: "aprovado", storage_path: `A/${d.tipo_documento}/1-x.png` }));
  assert.equal(antiga.filter((d) => d.obrigatorio && d.status !== "aprovado").length, 0, "sem pendência obrigatória");
  assert.equal(antiga.filter(contaNoProgressoDocumentos).length, antiga.length, "N de M igual ao de antes");
  // Imagens diferentes por documento: arquivos idênticos de RG frente/verso se unem (regra que já existia), e aqui queremos 1 entrada por documento.
  const fonte = Object.fromEntries(await Promise.all(antiga.map(async (d, i) => [d.storage_path, await png(i * 10)] as const)));
  const { r } = await montar(antiga.map((d) => doc(d.tipo_documento, 1)), fonte);
  assert.equal(r.entradas.some((e) => e.tipo_documento === TIPO_CERTIDAO_VERSO), false);
  assert.equal(r.entradas.length, antiga.length);
});

console.log(`\n${n} verificações OK`);
