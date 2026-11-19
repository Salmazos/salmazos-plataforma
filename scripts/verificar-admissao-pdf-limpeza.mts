// Pacote da admissão com PDF PROTEGIDO — limpeza com @cantoo/pdf-lib (senha vazia), só no caminho de falha. PDFs SINTÉTICOS em scripts/fixtures/pdf-protegido, criptografados por um
// implementador independente (qpdf): RC4 40/128, AES-128, AES-256 R5/R6, fluxos de objetos, linearizado, metadados em claro e 2 com senha de abertura de verdade.
//  - a limpeza abre com senha vazia, devolve um PDF sem /Encrypt, com o MESMO número de páginas, texto e imagens do original, e o pdf-lib de sempre abre e copia;
//  - senha de abertura de verdade, arquivo grande demais (> 20 MB), páginas diferentes e erro caem na página "protegido por senha" (a limpeza NUNCA tenta outra senha);
//  - PDF normal e corrompido não passam pela limpeza; o @cantoo só existe na etapa de limpeza (nunca no copyPages do pacote); a auditoria registra pdf_protegido_limpo;
//  - provas de falha: sem a conferência de páginas, sem o limite, com outra senha, misturando bibliotecas, sem a auditoria.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-admissao-pdf-limpeza.mts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { PDFDocument as PDFC } from "@cantoo/pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { PdfWriter } from "../src/lib/pdfWriter";
import * as ordemReal from "../src/lib/pacoteOrdem";
import * as limpezaReal from "../src/lib/pdfLimpezaProtecao";

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");
const FIX = "scripts/fixtures/pdf-protegido";
const fix = (nome: string) => new Uint8Array(fs.readFileSync(path.join(FIX, nome)));
const sha = (b: Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");

// ── Espiões no @cantoo: que senhas foram tentadas e quantas aberturas houve; e um interruptor que "perde" uma página na cópia ──
const espiao = { chamadas: 0, senhas: [] as unknown[], descartarUltimaPagina: false };
const carregarOriginal = PDFC.load.bind(PDFC);
(PDFC as unknown as { load: unknown }).load = async (b: Uint8Array, o?: { password?: string }) => { espiao.chamadas++; espiao.senhas.push(o?.password); return carregarOriginal(b, o as never); };
const copyOriginal = PDFC.prototype.copyPages;
PDFC.prototype.copyPages = async function (this: unknown, ...args: Parameters<typeof copyOriginal>) {
  const r = await copyOriginal.apply(this as never, args);
  return espiao.descartarUltimaPagina ? r.slice(0, -1) : r;
} as never;
const zerar = () => { espiao.chamadas = 0; espiao.senhas = []; espiao.descartarUltimaPagina = false; };

async function textos(bytes: Uint8Array) {
  const r = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
  return r.text.map((t) => t.replace(/\s+/g, " ").trim());
}
async function imagens(bytes: Uint8Array) {
  const d = await PDFDocument.load(bytes);
  const h: string[] = [];
  for (const [, o] of d.context.enumerateIndirectObjects()) if (o instanceof PDFRawStream && String(o.dict.get(PDFName.of("Subtype"))) === "/Image") h.push(sha(o.contents));
  return h.sort();
}
const bases = {
  simples: { bytes: fix("base-simples.pdf"), textos: await textos(fix("base-simples.pdf")), imagens: await imagens(fix("base-simples.pdf")) },
  objstm: { bytes: fix("base-objstm.pdf"), textos: await textos(fix("base-objstm.pdf")), imagens: await imagens(fix("base-objstm.pdf")) },
};
const SEM_SENHA_DE_ABERTURA = fs.readdirSync(FIX).filter((f) => /^(simples|objstm)\./.test(f) && !/senha-de-abertura/.test(f)).sort();
const COM_SENHA_DE_ABERTURA = fs.readdirSync(FIX).filter((f) => /senha-de-abertura/.test(f)).sort();

// ── Pacote (o mesmo caminho da rota) ─────────────────────────────────────────
const ROTULOS: Record<string, string> = { ctps_todas_paginas: "Carteira de Trabalho Digital", cpf: "CPF/CIC", rg: "Identidade RG" };
async function rodarPacote(ordem: typeof ordemReal, arquivos: { tipo: string; bytes: Uint8Array }[]) {
  const pdfDoc = await PDFDocument.create();
  const w = await PdfWriter.create(pdfDoc, false);
  const docs = arquivos.map((a, i) => ({ id: `d${i}`, tipo_documento: a.tipo, storage_path: `adm/${a.tipo}/${1000 + i}-arquivo.pdf`, created_at: "2026-11-19T00:00:00Z" }));
  const porPath = new Map(docs.map((d, i) => [d.storage_path, arquivos[i].bytes]));
  const logs: string[] = [];
  const e0 = console.error, w0 = console.warn;
  console.error = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  let resultado;
  try {
    resultado = await ordem.anexarDocumentosAoPacote({ pdfDoc, w, admissaoId: "adm-teste", docs, labelPorTipo: (t) => ROTULOS[t] ?? t, baixar: async (p) => porPath.get(p) ?? null });
  } finally { console.error = e0; console.warn = w0; }
  return { resultado, logs, pdfDoc };
}

// ── Provas (falha ou null): as mesmas rodam no código real e nos sabotados ──
interface Modulos { limpeza: typeof limpezaReal; ordem: typeof ordemReal; fonteOrdem: string; fonteRota: string }
type Prova = { categoria: "limpeza" | "senha" | "paginas" | "limite" | "pacote" | "mistura" | "auditoria"; roda: (m: Modulos) => Promise<string | null> };
const PROVAS: Prova[] = [
  { categoria: "limpeza", roda: async (m) => {
    for (const f of SEM_SENHA_DE_ABERTURA) {
      const base = f.startsWith("objstm") ? bases.objstm : bases.simples;
      zerar();
      const r = await m.limpeza.limparProtecaoPdf(fix(f));
      if (!r.ok) return `${f}: a limpeza deveria funcionar (motivo ${r.motivo})`;
      if (r.paginas !== 3) return `${f}: páginas ${r.paginas}`;
      if (Buffer.from(r.bytes).includes("/Encrypt")) return `${f}: o resultado ainda tem /Encrypt`;
      const aberto = await PDFDocument.load(r.bytes).then((d) => d.getPageCount(), () => -1);
      if (aberto !== 3) return `${f}: o pdf-lib de sempre não abriu o resultado (${aberto})`;
      if (JSON.stringify(await textos(r.bytes)) !== JSON.stringify(base.textos)) return `${f}: o texto das páginas mudou`;
      if (JSON.stringify(await imagens(r.bytes)) !== JSON.stringify(base.imagens)) return `${f}: as imagens mudaram (página em branco ou corrompida)`;
    }
    return null;
  } },
  { categoria: "senha", roda: async (m) => {
    for (const f of COM_SENHA_DE_ABERTURA) {
      zerar();
      const r = await m.limpeza.limparProtecaoPdf(fix(f));
      if (r.ok) return `${f}: PDF com senha de abertura NÃO pode ser aberto pela limpeza`;
      if (r.motivo !== "senha_de_abertura") return `${f}: motivo ${r.motivo} (esperava senha_de_abertura)`;
      if (espiao.chamadas === 0 || espiao.senhas.some((s) => s !== "")) return `${f}: a limpeza tentou outra senha além da vazia: ${JSON.stringify(espiao.senhas)}`;
    }
    return null;
  } },
  { categoria: "paginas", roda: async (m) => {
    zerar();
    espiao.descartarUltimaPagina = true; // simula uma cópia que "perde" a última página
    const r = await m.limpeza.limparProtecaoPdf(fix("simples.aes-256-r6.pdf"));
    zerar();
    if (r.ok) return "a limpeza aceitou um resultado com menos páginas que o original";
    return r.motivo === "paginas_diferentes" ? null : `motivo ${r.motivo} (esperava paginas_diferentes)`;
  } },
  { categoria: "limite", roda: async (m) => {
    const arquivo = fix("simples.aes-256-r6.pdf");
    zerar();
    const grande = new Uint8Array(m.limpeza.LIMITE_LIMPEZA_BYTES + 1);
    grande.set(arquivo);
    const r = await m.limpeza.limparProtecaoPdf(grande);
    if (r.ok || r.motivo !== "grande_demais") return `arquivo acima do limite deveria ser pulado (grande_demais), veio ${JSON.stringify(r).slice(0, 60)}`;
    if (espiao.chamadas !== 0) return "o arquivo acima do limite chegou a ser aberto pelo @cantoo";
    const noLimite = await m.limpeza.limparProtecaoPdf(arquivo, { limiteBytes: arquivo.length });
    const acima = await m.limpeza.limparProtecaoPdf(arquivo, { limiteBytes: arquivo.length - 1 });
    if (!noLimite.ok) return "exatamente no limite deveria ser processado";
    if (acima.ok || acima.motivo !== "grande_demais") return "1 byte acima do limite deveria ser pulado";
    return m.limpeza.LIMITE_LIMPEZA_BYTES === 20 * 1024 * 1024 ? null : "o limite padrão deveria ser 20 MB";
  } },
  { categoria: "pacote", roda: async (m) => {
    zerar();
    const a = await rodarPacote(m.ordem, [{ tipo: "ctps_todas_paginas", bytes: fix("simples.aes-256-r6.pdf") }, { tipo: "cpf", bytes: bases.simples.bytes }, { tipo: "rg", bytes: new Uint8Array(Buffer.from("isto nao e um pdf")) }]);
    const motivos = a.resultado.motivosNaoIncorporados;
    if (motivos.length !== 1 || motivos[0].tipo_documento !== "rg" || !motivos[0].motivo.startsWith("erro_ao_embutir:")) return `só o PDF corrompido deveria ficar de fora: ${JSON.stringify(motivos)}`;
    if (a.pdfDoc.getPageCount() !== 6) return `esperava 6 páginas (CTPS limpa + PDF normal), veio ${a.pdfDoc.getPageCount()}`;
    if (espiao.chamadas !== 1 || espiao.senhas[0] !== "") return `o @cantoo deveria abrir só a CTPS protegida (1 vez, senha vazia): ${espiao.chamadas} chamadas ${JSON.stringify(espiao.senhas)}`;
    const t = (await textos(new Uint8Array(await a.pdfDoc.save()))).join(" ");
    if ((t.match(/PAGINA 3 DE 3/g) ?? []).length !== 2) return "o conteúdo das páginas da CTPS limpa não chegou ao pacote";
    zerar();
    const b = await rodarPacote(m.ordem, [{ tipo: "ctps_todas_paginas", bytes: fix("simples.aes-256-senha-de-abertura.pdf") }]);
    if (b.resultado.motivosNaoIncorporados[0]?.motivo !== "pdf_protegido" || b.pdfDoc.getPageCount() !== 0) return "PDF com senha de abertura deveria cair em pdf_protegido (página substituta)";
    if (espiao.senhas.some((s) => s !== "")) return "tentou outra senha no pacote";
    zerar();
    const c = await rodarPacote(m.ordem, [{ tipo: "cpf", bytes: bases.simples.bytes }]);
    if (c.resultado.motivosNaoIncorporados.length !== 0 || espiao.chamadas !== 0) return "PDF normal não deveria passar pela limpeza";
    return null;
  } },
  { categoria: "auditoria", roda: async (m) => {
    zerar();
    const a = await rodarPacote(m.ordem, [{ tipo: "ctps_todas_paginas", bytes: fix("objstm.aes-256-r6.pdf") }]);
    const r = a.resultado.protecaoRemovida;
    if (r.length !== 1) return `a auditoria deveria registrar 1 limpeza, registrou ${r.length}`;
    if (JSON.stringify(Object.keys(r[0]).sort()) !== JSON.stringify(["motivo", "paginas", "rotulo", "tipo_documento"])) return `campos da auditoria: ${Object.keys(r[0])}`;
    if (r[0].motivo !== "pdf_protegido_limpo" || r[0].paginas !== 3 || r[0].tipo_documento !== "ctps_todas_paginas") return `registro da limpeza errado: ${JSON.stringify(r[0])}`;
    if (!a.logs.some((l) => l.includes("Proteção de PDF removida (senha vazia)") && l.includes("paginas=3"))) return "faltou o log da limpeza";
    if (!m.fonteRota.includes("documentos_protecao_removida: anexos.protecaoRemovida,")) return "a rota não grava documentos_protecao_removida na auditoria";
    return null;
  } },
  { categoria: "mistura", roda: async (m) => {
    if (/@cantoo/.test(m.fonteOrdem)) return "o pacote (pacoteOrdem.ts) importa o @cantoo: as duas bibliotecas se misturariam no copyPages";
    if (!/import \{[^}]*\bPDFDocument\b[^}]*\} from "pdf-lib";/.test(m.fonteOrdem)) return "o pacote deveria usar o PDFDocument do pdf-lib";
    if (!m.fonteOrdem.includes("pdfDoc.copyPages(subDoc, subDoc.getPageIndices())")) return "o copyPages do pacote mudou";
    return null;
  } },
];

const REAIS: Modulos = { limpeza: limpezaReal, ordem: ordemReal, fonteOrdem: fonte("src/lib/pacoteOrdem.ts"), fonteRota: fonte("src/app/api/admissoes/[id]/gerar-pdf/route.ts") };

await ok("a limpeza abre os 9 PDFs protegidos só por senha de proprietário (RC4 40/128, AES-128, AES-256 R5/R6, fluxo de objetos, linearizado, metadados em claro): sem /Encrypt, mesmas páginas, texto e imagens, e o pdf-lib de sempre abre", async () => {
  assert.equal(SEM_SENHA_DE_ABERTURA.length, 9);
  assert.equal(await PROVAS[0].roda(REAIS), null);
});

await ok("senha de abertura de verdade (AES-256 e RC4): a limpeza NÃO abre (senha_de_abertura) e só tentou a senha vazia", async () => {
  assert.equal(COM_SENHA_DE_ABERTURA.length, 2);
  assert.equal(await PROVAS[1].roda(REAIS), null);
});

await ok("conferência de páginas: se o documento limpo tiver menos páginas que o original, é falha (paginas_diferentes) e o documento cai na página substituta", async () => {
  assert.equal(await PROVAS[2].roda(REAIS), null);
  zerar();
  espiao.descartarUltimaPagina = true;
  const a = await rodarPacote(ordemReal, [{ tipo: "ctps_todas_paginas", bytes: fix("simples.aes-256-r6.pdf") }]);
  zerar();
  assert.equal(a.resultado.motivosNaoIncorporados[0]?.motivo, "pdf_protegido");
  assert.equal(a.resultado.protecaoRemovida.length, 0);
});

await ok("limite de 20 MB: arquivo acima é pulado sem nem abrir (vai para a página substituta); exatamente no limite é processado", async () => {
  assert.equal(await PROVAS[3].roda(REAIS), null);
  zerar();
  const grande = new Uint8Array(limpezaReal.LIMITE_LIMPEZA_BYTES + 1);
  grande.set(fix("simples.aes-256-r6.pdf"));
  const a = await rodarPacote(ordemReal, [{ tipo: "ctps_todas_paginas", bytes: grande }]);
  assert.equal(a.resultado.motivosNaoIncorporados[0]?.motivo, "pdf_protegido", "protegido e grande: página substituta");
  assert.equal(espiao.chamadas, 0, "o @cantoo nem foi chamado");
  assert.ok(a.logs.some((l) => l.includes("motivo=grande_demais")));
});

await ok("pacote: CTPS protegida entra limpa (1 abertura do @cantoo, senha vazia); corrompido segue 'erro_ao_embutir'; PDF normal não passa pela limpeza; senha de abertura vira 'pdf_protegido'", async () => {
  assert.equal(await PROVAS[4].roda(REAIS), null);
});

await ok("auditoria: protecaoRemovida (pdf_protegido_limpo) só com tipo, rótulo e nº de páginas, e a rota grava documentos_protecao_removida; nenhum dado pessoal", async () => {
  assert.equal(await PROVAS[5].roda(REAIS), null);
  assert.ok(!/arquivo|storage_path|adm\//.test(JSON.stringify((await rodarPacote(ordemReal, [{ tipo: "ctps_todas_paginas", bytes: fix("simples.rc4-128.pdf") }])).resultado.protecaoRemovida)));
});

await ok("sem mistura de bibliotecas: o @cantoo só é importado em pdfLimpezaProtecao.ts, que nunca copia para o pacote; versão EXATA 2.11.1 no package.json e travada no package-lock", async () => {
  assert.equal(await PROVAS[6].roda(REAIS), null);
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const importam = walk("src").filter((a) => /\.(ts|tsx)$/.test(a) && /from "@cantoo\/pdf-lib"/.test(fonte(a)));
  assert.deepEqual(importam, ["src/lib/pdfLimpezaProtecao.ts"]);
  const lib = fonte("src/lib/pdfLimpezaProtecao.ts");
  assert.ok(!lib.includes("from \"pdf-lib\"") && !/\bpdfDoc\b/.test(lib), "a limpeza não conhece o pdf-lib nem o documento do pacote");
  assert.equal((lib.match(/password:/g) ?? []).length, 1, "uma única abertura");
  assert.ok(lib.includes("{ password: SENHA_VAZIA }") && lib.includes('export const SENHA_VAZIA = "";'));
  const pkg = JSON.parse(fonte("package.json")) as { dependencies: Record<string, string> };
  assert.equal(pkg.dependencies["@cantoo/pdf-lib"], "2.11.1", "versão exata, sem ^ nem ~");
  const lock = JSON.parse(fonte("package-lock.json")) as { packages: Record<string, { version?: string; license?: string; integrity?: string }> };
  assert.equal(lock.packages["node_modules/@cantoo/pdf-lib"].version, "2.11.1");
  assert.equal(lock.packages["node_modules/@cantoo/pdf-lib"].license, "MIT");
  assert.ok(lock.packages["node_modules/@cantoo/pdf-lib"].integrity?.startsWith("sha512-"), "integridade travada no lock");
});

// ── Provas de falha ──────────────────────────────────────────────────────────
type Sab = { nome: string; categoria: Prova["categoria"]; lib?: [string, string][]; ordem?: [string, string][]; rota?: [string, string][] };
const SABS: Sab[] = [
  { nome: "sem a conferência de páginas da limpeza", categoria: "paginas", lib: [
    ['    if (copiadas.length !== paginasOriginal) return { ok: false, motivo: "paginas_diferentes" };\n', ""],
    ['    if (limpo.getPageCount() !== paginasOriginal) return { ok: false, motivo: "paginas_diferentes" };\n', ""],
  ] },
  { nome: "sem o limite de tamanho", categoria: "limite", lib: [['  if (bytes.byteLength > limite) return { ok: false, motivo: "grande_demais" };\n', ""]] },
  { nome: "tentando OUTRA senha quando a vazia falha", categoria: "senha", lib: [[
    "      original = await PDFDocumentCantoo.load(bytes, { password: SENHA_VAZIA });",
    '      try { original = await PDFDocumentCantoo.load(bytes, { password: SENHA_VAZIA }); } catch { original = await PDFDocumentCantoo.load(bytes, { password: "senha-real-de-abertura" }); }',
  ]] },
  { nome: "misturando as bibliotecas (o pacote importa o @cantoo)", categoria: "mistura", ordem: [['import { limparProtecaoPdf } from "@/lib/pdfLimpezaProtecao";', 'import { limparProtecaoPdf } from "@/lib/pdfLimpezaProtecao";\nimport { PDFDocument as MisturaCantoo } from "@cantoo/pdf-lib";\nvoid MisturaCantoo;']] },
  { nome: "sem registrar a limpeza na auditoria (lib)", categoria: "auditoria", ordem: [['          resultado.protecaoRemovida.push({ tipo_documento: doc.tipo_documento, rotulo, motivo: "pdf_protegido_limpo", paginas: limpeza.paginas });\n', ""]] },
  { nome: "rota sem gravar documentos_protecao_removida", categoria: "auditoria", rota: [["      documentos_protecao_removida: anexos.protecaoRemovida,\n", ""]] },
  { nome: "limpeza também em PDF normal/corrompido (sem checar que é protegido)", categoria: "pacote", ordem: [["          if (!ehPdfProtegido(aberturaErr, bytes)) throw aberturaErr;\n", ""]] },
];

await ok("provas de falha: cada versão sabotada (sem conferência de páginas, sem limite, outra senha, bibliotecas misturadas, sem auditoria, limpeza em PDF que não é protegido) é reprovada pela prova da sua categoria; o código real passa em todas", async () => {
  const criados: string[] = [];
  try {
    for (const [i, s] of SABS.entries()) {
      const limpezaArq = `src/lib/__sabL${i}_pdfLimpezaProtecao.ts`, ordemArq = `src/lib/__sabL${i}_pacoteOrdem.ts`;
      let lib = fonte("src/lib/pdfLimpezaProtecao.ts"), ordem = fonte("src/lib/pacoteOrdem.ts"), rota = fonte("src/app/api/admissoes/[id]/gerar-pdf/route.ts");
      const aplicar = (txt: string, trocas: [string, string][] | undefined, rotulo: string) => { for (const [de, para] of trocas ?? []) { assert.equal(txt.split(de).length, 2, `âncora ${rotulo} (${s.nome}): ${de.slice(0, 60)}`); txt = txt.replace(de, () => para); } return txt; };
      lib = aplicar(lib, s.lib, "lib"); ordem = aplicar(ordem, s.ordem, "ordem"); rota = aplicar(rota, s.rota, "rota");
      ordem = ordem.replace('"@/lib/pdfLimpezaProtecao"', `"@/lib/__sabL${i}_pdfLimpezaProtecao"`);
      fs.writeFileSync(limpezaArq, lib); fs.writeFileSync(ordemArq, ordem); criados.push(limpezaArq, ordemArq);
      const mods: Modulos = { limpeza: (await import(`../${limpezaArq}`)) as typeof limpezaReal, ordem: (await import(`../${ordemArq}`)) as typeof ordemReal, fonteOrdem: ordem, fonteRota: rota };
      const reprovadas: string[] = [];
      for (const p of PROVAS) { const f = await p.roda(mods); if (f) reprovadas.push(`${p.categoria}: ${f}`); }
      const pega = reprovadas.find((r) => r.startsWith(`${s.categoria}:`));
      assert.ok(pega, `a sabotagem "${s.nome}" NÃO foi pega (reprovou: ${JSON.stringify(reprovadas)})`);
      console.log(`   sabotagem pega — ${s.nome}: ${pega.slice(0, 160)}`);
    }
    for (const p of PROVAS) assert.equal(await p.roda(REAIS), null, `o código real reprovou em ${p.categoria}`);
  } finally { for (const a of criados) fs.rmSync(a, { force: true }); }
  for (const a of criados) assert.ok(!fs.existsSync(a), "arquivo de sabotagem removido");
});

console.log(`\n${n} verificações OK`);
