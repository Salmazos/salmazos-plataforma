// Pacote da admissão com PDF PROTEGIDO (criptografado) — Rodada 1: sem dependência nova, sem descriptografar.
//  - o documento criptografado vira o motivo "pdf_protegido" (e não "erro_ao_embutir:Error"); PDF corrompido continua com o motivo genérico;
//  - a página "Documentos não incorporados automaticamente" tem o texto certo (protegido) e mantém o de sempre para os outros casos;
//  - diagnóstico /Encrypt no log: só versão, revisão, tamanho da chave, flags de permissão e se abre com senha vazia — nenhum conteúdo/nome/CPF;
//  - a rota informa (cabeçalho) quais documentos ficaram de fora e a tela avisa; "Enviar por e-mail" pede confirmação listando o que falta, sem bloquear;
//  - provas de falha: as MESMAS provas reprovam versões sabotadas.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-admissao-pdf-protegido.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { PdfWriter } from "../src/lib/pdfWriter";
import * as real from "../src/lib/pacoteOrdem";
import {
  CABECALHO_NAO_INCORPORADOS, descreverDocumentoFora, lerNaoIncorporados, mensagemPacoteSemDocumentos, naoIncorporadosDaAuditoria, serializarNaoIncorporados,
} from "../src/lib/pacoteNaoIncorporados";

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");
const MARCADOR_PESSOAL = "FULANO DE TAL 123.456.789-00";

// ── Arquivos de teste ────────────────────────────────────────────────────────
// PDF mínimo e VÁLIDO (xref correto) com um dicionário /Encrypt no trailer, como o de um PDF protegido: o pdf-lib recusa abrir. Não tem criptografia de verdade
// (nesta rodada nada é descriptografado); o /Info leva um "dado pessoal" para provar que ele nunca chega ao log.
function pdfCriptografado(o: { v?: number; r?: number; length?: number; p?: number; cfm?: string; inline?: boolean } = {}): Uint8Array {
  const { v = 2, r = 3, length = 128, p = -3904, cfm = "", inline = false } = o;
  const hex = (n: number) => "<" + "ab".repeat(n) + ">";
  const dicionario = `<< /Filter /Standard /V ${v} /R ${r} /Length ${length} /P ${p} ${cfm ? `/CF << /StdCF << /CFM /${cfm} /AuthEvent /DocOpen /Length ${length / 8} >> >> /StmF /StdCF /StrF /StdCF ` : ""}/O ${hex(32)} /U ${hex(32)} >>`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    inline ? "<< /Placeholder true >>" : dicionario, `<< /Title (${MARCADOR_PESSOAL}) /Author (Maria Secreta) >>`,
  ];
  let corpo = "%PDF-1.6\n";
  const offsets: number[] = [];
  objetos.forEach((c, i) => { offsets.push(corpo.length); corpo += `${i + 1} 0 obj\n${c}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` + offsets.map((o2) => `${String(o2).padStart(10, "0")} 00000 n \n`).join("");
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Encrypt ${inline ? dicionario : "4 0 R"} /Info 5 0 R /ID [${hex(16)}${hex(16)}] >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(corpo, "latin1"));
}
const pdfNormal = async () => { const d = await PDFDocument.create(); d.addPage([200, 200]); return new Uint8Array(await d.save()); };
const pdfCorrompido = () => new Uint8Array(Buffer.from("isto nao e um pdf", "latin1"));

const ROTULOS: Record<string, string> = { ctps_todas_paginas: "Carteira de Trabalho Digital", cpf: "CPF/CIC", rg: "Identidade RG", titulo_eleitor: "Título de Eleitor" };
const doc = (i: number, tipo: string, ext = "pdf") => ({ id: `d${i}`, tipo_documento: tipo, storage_path: `adm/${tipo}/${1000 + i}-arquivo.${ext}`, created_at: "2026-11-19T00:00:00Z" });

// ── Roda o anexar + a página (o mesmo caminho da rota) com um conjunto de arquivos ──
async function rodar(mod: typeof real, arquivos: { tipo: string; bytes: Uint8Array }[]) {
  const pdfDoc = await PDFDocument.create();
  const w = await PdfWriter.create(pdfDoc, false);
  const docs = arquivos.map((a, i) => doc(i, a.tipo));
  const porPath = new Map(docs.map((d, i) => [d.storage_path, arquivos[i].bytes]));
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  let resultado;
  try {
    resultado = await mod.anexarDocumentosAoPacote({ pdfDoc, w, admissaoId: "adm-teste", docs, labelPorTipo: (t) => ROTULOS[t] ?? t, baixar: async (p) => porPath.get(p) ?? null });
  } finally { console.error = original; }
  const desenhou = mod.desenharPaginaNaoIncorporados(w, resultado);
  const texto = (await extractText(await getDocumentProxy(new Uint8Array(await pdfDoc.save())), { mergePages: true })).text.replace(/\s+/g, " ");
  return { resultado, logs, texto, desenhou };
}

// Provas (falha ou null): as mesmas rodam no módulo real e nos sabotados.
type Prova = { categoria: "motivo" | "pagina" | "diagnostico"; roda: (mod: typeof real) => Promise<string | null> };
const PROVAS: Prova[] = [
  { categoria: "motivo", roda: async (mod) => {
    const r = await rodar(mod, [{ tipo: "ctps_todas_paginas", bytes: pdfCriptografado() }, { tipo: "cpf", bytes: await pdfNormal() }, { tipo: "rg", bytes: pdfCorrompido() }]);
    const m = r.resultado.motivosNaoIncorporados;
    if (m.length !== 2) return `esperava 2 documentos de fora (protegido e corrompido), veio ${m.length}`;
    if (m[0].motivo !== "pdf_protegido" || m[0].tipo_documento !== "ctps_todas_paginas" || m[0].rotulo !== "Carteira de Trabalho Digital") return `a CTPS protegida deveria ser pdf_protegido (veio ${JSON.stringify(m[0])})`;
    if (!m[1].motivo.startsWith("erro_ao_embutir:")) return `PDF corrompido deveria seguir com o motivo genérico (veio ${m[1].motivo})`;
    if (r.resultado.paginasIniciais.size !== 1) return "o PDF normal deveria ter sido incorporado";
    return null;
  } },
  { categoria: "pagina", roda: async (mod) => {
    const soProtegido = await rodar(mod, [{ tipo: "ctps_todas_paginas", bytes: pdfCriptografado() }]);
    const frase = "Documento protegido por senha. Não foi possível incorporá-lo ao pacote. Baixe o original no painel.";
    if (!soProtegido.texto.includes("Documentos não incorporados automaticamente") || !soProtegido.texto.includes(frase)) return `a página do PDF protegido não tem o texto certo: "${soProtegido.texto.slice(0, 160)}"`;
    if (soProtegido.texto.includes("formato não suportado")) return "a página do PDF protegido ainda diz 'formato não suportado'";
    if (!soProtegido.texto.includes("Carteira de Trabalho Digital")) return "a página não lista o documento";
    const soOutro = await rodar(mod, [{ tipo: "rg", bytes: pdfCorrompido() }]);
    if (!soOutro.texto.includes("(formato não suportado - baixe o arquivo original no painel)")) return "o texto de sempre sumiu para os outros casos"; // o PdfWriter troca o travessão por hífen (safe)
    if (soOutro.texto.includes("protegido por senha")) return "o texto de protegido apareceu para um documento que não é protegido";
    const misto = await rodar(mod, [{ tipo: "ctps_todas_paginas", bytes: pdfCriptografado() }, { tipo: "rg", bytes: pdfCorrompido() }]);
    if (!misto.texto.includes(frase) || !misto.texto.includes("formato não suportado")) return "com os dois casos, a página deveria trazer os dois textos";
    const nenhum = await rodar(mod, [{ tipo: "cpf", bytes: await pdfNormal() }]);
    return nenhum.desenhou === false ? null : "sem documento de fora não deveria criar a página";
  } },
  { categoria: "diagnostico", roda: async (mod) => {
    const r = await rodar(mod, [{ tipo: "ctps_todas_paginas", bytes: pdfCriptografado({ p: -44 }) }]);
    const log = r.logs.find((l) => l.includes("Diagnóstico /Encrypt"));
    if (!log) return "o diagnóstico /Encrypt não foi registrado";
    for (const esperado of ["v=2", "r=3", "length=128", "filtro=Standard", "abre_com_senha_vazia=nao", '"imprimir":true', '"modificar":false', '"copiar":true']) if (!log.includes(esperado)) return `o diagnóstico não traz ${esperado}: ${log.slice(0, 220)}`;
    const tudo = r.logs.join("\n");
    for (const proibido of [MARCADOR_PESSOAL, "FULANO", "123.456.789", "Maria Secreta", "arquivo.pdf", "adm/ctps", "abab"]) if (tudo.includes(proibido)) return `o log vazou "${proibido}"`;
    return null;
  } },
];

await ok("documento criptografado vira 'pdf_protegido' (PDF corrompido segue com o motivo genérico, o normal é incorporado); a lista traz o rótulo do documento", async () => {
  assert.equal(await PROVAS[0].roda(real), null);
  const e = await rodar(real, [{ tipo: "ctps_todas_paginas", bytes: pdfCriptografado() }]);
  assert.deepEqual(e.resultado.naoEmbutidos, ["Carteira de Trabalho Digital"]);
  assert.equal(e.resultado.entradas[0].motivo, "pdf_protegido");
  assert.ok(e.logs.some((l) => l.includes("Falha ao incorporar documento")), "o log de sempre continua");
});

await ok("página 'Documentos não incorporados automaticamente': texto próprio para PDF protegido, texto de sempre para os outros e os dois quando há os dois; sem página se nada ficou de fora", async () => {
  assert.equal(await PROVAS[1].roda(real), null);
});

await ok("diagnóstico no log: versão, revisão, tamanho da chave, método, flags de permissão e se abre com senha vazia; NENHUM nome, CPF, caminho ou conteúdo", async () => {
  assert.equal(await PROVAS[2].roda(real), null);
});

await ok("leitura do /Encrypt: V2/RC4, AES-128 (V4) e AES-256 (V5, R6), dicionário direto no trailer, flags de /P e arquivo sem /Encrypt", () => {
  const a = real.lerParametrosEncrypt(pdfCriptografado({ v: 2, r: 3, length: 128, p: -3904 }))!;
  assert.deepEqual([a.versao, a.revisao, a.tamanhoChaveBits, a.filtro], [2, 3, 128, "Standard"]);
  assert.deepEqual([a.permissoes!.imprimir, a.permissoes!.modificar, a.permissoes!.copiar, a.permissoes!.anotar], [false, false, false, false], "P=-3904: tudo restrito");
  const b = real.lerParametrosEncrypt(pdfCriptografado({ v: 4, r: 4, length: 128, p: -44, cfm: "AESV2" }))!;
  assert.deepEqual([b.versao, b.revisao, b.metodo], [4, 4, "AESV2"]);
  assert.deepEqual([b.permissoes!.imprimir, b.permissoes!.copiar], [true, true]);
  const c = real.lerParametrosEncrypt(pdfCriptografado({ v: 5, r: 6, length: 256, cfm: "AESV3", inline: true }))!;
  assert.deepEqual([c.versao, c.revisao, c.tamanhoChaveBits, c.metodo], [5, 6, 256, "AESV3"], "dicionário direto no trailer");
  assert.equal(real.lerParametrosEncrypt(pdfCorrompido()), null);
});

await ok("detecção: pela mensagem do pdf-lib ('is encrypted'), por /Encrypt nos bytes (mensagem diferente) e NÃO para PDF sem /Encrypt", async () => {
  const protegido = pdfCriptografado(), normal = await pdfNormal();
  assert.equal(real.ehPdfProtegido(new Error("Input document to `PDFDocument.load` is encrypted. You can use ..."), normal), true);
  assert.equal(real.ehPdfProtegido(new Error("mensagem nova que nao diz nada"), protegido), true, "pelos bytes");
  assert.equal(real.ehPdfProtegido(new Error("Failed to parse PDF document"), pdfCorrompido()), false);
  assert.equal(real.ehPdfProtegido(new Error("falha qualquer"), normal), false);
  assert.equal(real.ehPdfProtegido("texto solto", normal), false);
});

await ok("a rota informa os documentos de fora por cabeçalho ASCII (ida e volta com acentos), só quando há; a auditoria guarda rótulo e motivo; registros antigos (só rótulos) também são lidos", () => {
  const lista = [{ rotulo: "Carteira de Trabalho Digital (todas as páginas)", motivo: "pdf_protegido" }, { rotulo: "Título de Eleitor", motivo: "formato_nao_suportado" }];
  const valor = serializarNaoIncorporados(lista);
  assert.match(valor, /^[\x20-\x7E]+$/, "cabeçalho HTTP é ASCII");
  assert.deepEqual(lerNaoIncorporados(valor), lista);
  assert.deepEqual(lerNaoIncorporados(null), []);
  assert.deepEqual(lerNaoIncorporados("%%%lixo"), []);
  assert.deepEqual(lerNaoIncorporados(encodeURIComponent('{"nao":"lista"}')), []);
  assert.equal(descreverDocumentoFora(lista[0]), "Carteira de Trabalho Digital (todas as páginas) (protegido por senha)");
  assert.match(mensagemPacoteSemDocumentos(lista), /Pacote gerado SEM 2 documentos: .*protegido por senha.*Título de Eleitor \(formato não suportado\)/);
  assert.match(mensagemPacoteSemDocumentos([lista[0]]), /SEM 1 documento:/);
  assert.deepEqual(naoIncorporadosDaAuditoria({ documentos_nao_incorporados: ["CTPS"], motivos_nao_incorporados: [{ tipo_documento: "ctps_todas_paginas", rotulo: "CTPS", motivo: "pdf_protegido" }] }), [{ rotulo: "CTPS", motivo: "pdf_protegido" }]);
  assert.deepEqual(naoIncorporadosDaAuditoria({ documentos_nao_incorporados: ["CTPS Antiga"], motivos_nao_incorporados: [{ tipo_documento: "ctps_todas_paginas", motivo: "erro_ao_embutir:Error" }] }), [{ rotulo: "CTPS Antiga", motivo: "erro_ao_embutir:Error" }], "auditoria antiga");
  assert.deepEqual(naoIncorporadosDaAuditoria({}), []);
  assert.deepEqual(naoIncorporadosDaAuditoria(null), []);
});

// ── Estáticas: rota e tela ───────────────────────────────────────────────────
function provaRota(src: string): string | null {
  if (!src.includes("desenharPaginaNaoIncorporados(w, anexos)")) return "a rota não usa a página nova";
  if (src.includes("(formato não suportado — baixe o arquivo original no painel)")) return "o texto antigo continua fixo na rota";
  if (!/\[CABECALHO_NAO_INCORPORADOS\]: serializarNaoIncorporados\(motivosNaoIncorporados\)/.test(src) || !/motivosNaoIncorporados\.length > 0 \? \{/.test(src)) return "a rota não devolve o cabeçalho (só quando há documento de fora)";
  if (!src.includes("motivos_nao_incorporados: motivosNaoIncorporados")) return "a auditoria não guarda os motivos";
  if (!/"Content-Type": "application\/pdf"/.test(src) || !src.includes("new NextResponse(Buffer.from(pdfBytes)")) return "o download do PDF mudou";
  return null;
}
function provaTela(src: string): string | null {
  if ((src.match(/lerNaoIncorporados\(res\.headers\.get\(CABECALHO_NAO_INCORPORADOS\)\)/g) ?? []).length !== 2) return "os dois botões de gerar (normal e forçado) deveriam ler o cabeçalho";
  if ((src.match(/showToast\(mensagemPacoteSemDocumentos\(fora\), 15000\)/g) ?? []).length !== 2) return "o aviso do pacote sem documento não aparece nos dois fluxos";
  if (!src.includes("⚠️ Faltam documentos neste pacote") || !src.includes("descreverDocumentoFora(d)")) return "falta o aviso em destaque no cartão do pacote";
  if (!src.includes("(docsForaDoPacote.length > 0 ? setConfirmarEnvioFaltando(true) : setModalEmailAberto(true))")) return "'Enviar por e-mail' não pede confirmação quando falta documento";
  if (!src.includes("O pacote está incompleto") || !src.includes("Estes documentos NÃO estão no PDF que será enviado:") || !src.includes('role="alertdialog"')) return "falta o diálogo de confirmação listando o que falta";
  if (!src.includes("{ setConfirmarEnvioFaltando(false); setModalEmailAberto(true); }}>Enviar mesmo assim")) return "a confirmação não deixa enviar mesmo assim (não pode bloquear)";
  if (!src.includes("naoIncorporadosDaAuditoria(auditLogs.find((l) => ACOES_PACOTE_GERADO.includes(l.acao))?.detalhes)")) return "ao abrir a tela, o aviso não vem da auditoria do último pacote";
  return null;
}

await ok("rota (cabeçalho, página nova, auditoria, download inalterado) e tela (aviso no toast e em destaque, confirmação antes de enviar por e-mail sem bloquear)", () => {
  assert.equal(provaRota(fonte("src/app/api/admissoes/[id]/gerar-pdf/route.ts")), null);
  assert.equal(provaTela(fonte("src/components/AdmissaoDetalheClient.tsx")), null);
  assert.equal(CABECALHO_NAO_INCORPORADOS, "X-Documentos-Nao-Incorporados");
});

// ── Provas de falha ──────────────────────────────────────────────────────────
type SabLib = { nome: string; categoria: Prova["categoria"]; trocas: [string, string][] };
const SAB_LIB: SabLib[] = [
  { nome: "sem a detecção de PDF protegido (volta ao motivo genérico)", categoria: "motivo", trocas: [['if (ext === "pdf" && ehPdfProtegido(err, bytes)) {', 'if (false && ext === "pdf" && ehPdfProtegido(err, bytes)) {']] },
  { nome: "página do protegido com o texto antigo ('formato não suportado')", categoria: "pagina", trocas: [["grupo(TEXTO_PDF_PROTEGIDO, lista.filter((m) => m.motivo === MOTIVO_PDF_PROTEGIDO));", "grupo(TEXTO_FORMATO_NAO_SUPORTADO, lista.filter((m) => m.motivo === MOTIVO_PDF_PROTEGIDO));"]] },
  { nome: "diagnóstico que vaza conteúdo do documento no log", categoria: "diagnostico", trocas: [["abre_com_senha_vazia=${abreComSenhaVazia}`,", "abre_com_senha_vazia=${abreComSenhaVazia} conteudo=${Buffer.from(bytes).toString(\"latin1\").slice(0, 1200)}`,"]] },
  { nome: "sem o diagnóstico /Encrypt", categoria: "diagnostico", trocas: [["        await diagnosticarCriptografia(bytes, admissaoId, doc.tipo_documento);\n", ""]] },
];
type SabTexto = { nome: string; tipo: "rota" | "tela"; arquivo: string; trocas: [string, string][] };
const SAB_TEXTO: SabTexto[] = [
  { nome: "rota sem o cabeçalho dos documentos de fora", tipo: "rota", arquivo: "src/app/api/admissoes/[id]/gerar-pdf/route.ts", trocas: [["...(motivosNaoIncorporados.length > 0 ? { [CABECALHO_NAO_INCORPORADOS]: serializarNaoIncorporados(motivosNaoIncorporados) } : {}),", ""]] },
  { nome: "rota com o texto antigo fixo (sem a página nova)", tipo: "rota", arquivo: "src/app/api/admissoes/[id]/gerar-pdf/route.ts", trocas: [["desenharPaginaNaoIncorporados(w, anexos);", 'w.drawText("(formato não suportado — baixe o arquivo original no painel)", w.regular, 9, GRAY);']] },
  { nome: "tela que não lê o cabeçalho no fluxo forçado", tipo: "tela", arquivo: "src/components/AdmissaoDetalheClient.tsx", trocas: [["      const fora = lerNaoIncorporados(res.headers.get(CABECALHO_NAO_INCORPORADOS));\n      setNaoIncorporadosRecentes(fora);\n      if (fora.length > 0) showToast(mensagemPacoteSemDocumentos(fora), 15000);\n      else showToast(\"⚠️ Pacote gerado com pendências", "      const fora: DocumentoForaDoPacote[] = [];\n      setNaoIncorporadosRecentes(fora);\n      showToast(\"⚠️ Pacote gerado com pendências"]] },
  { nome: "'Enviar por e-mail' sem a confirmação (abre direto)", tipo: "tela", arquivo: "src/components/AdmissaoDetalheClient.tsx", trocas: [["(docsForaDoPacote.length > 0 ? setConfirmarEnvioFaltando(true) : setModalEmailAberto(true))", "setModalEmailAberto(true)"]] },
  { nome: "confirmação que BLOQUEIA o envio (sem 'Enviar mesmo assim')", tipo: "tela", arquivo: "src/components/AdmissaoDetalheClient.tsx", trocas: [["{ setConfirmarEnvioFaltando(false); setModalEmailAberto(true); }}>Enviar mesmo assim", "{ setConfirmarEnvioFaltando(false); }}>Entendi"]] },
];

await ok("provas de falha: cada versão sabotada (sem detecção, página antiga, log que vaza conteúdo, sem diagnóstico, rota sem cabeçalho/com texto antigo, tela sem aviso, envio sem confirmação ou bloqueado) é reprovada; as reais passam", async () => {
  const criados: string[] = [];
  try {
    for (const [i, s] of SAB_LIB.entries()) {
      let src = fonte("src/lib/pacoteOrdem.ts");
      for (const [de, para] of s.trocas) { assert.equal(src.split(de).length, 2, `âncora (${s.nome}): ${de.slice(0, 60)}`); src = src.replace(de, () => para); }
      const arq = `src/lib/__sab_pacoteOrdem_${i}.ts`;
      fs.writeFileSync(arq, src); criados.push(arq);
      const mod = (await import(`../${arq}`)) as typeof real;
      const reprovadas: string[] = [];
      for (const p of PROVAS) { const f = await p.roda(mod); if (f) reprovadas.push(`${p.categoria}: ${f}`); }
      const pega = reprovadas.find((r) => r.startsWith(`${s.categoria}:`));
      assert.ok(pega, `a sabotagem "${s.nome}" NÃO foi pega (reprovou: ${JSON.stringify(reprovadas)})`);
      console.log(`   sabotagem pega — ${s.nome}: ${pega.slice(0, 150)}`);
    }
    for (const p of PROVAS) assert.equal(await p.roda(real), null, `o módulo real reprovou em ${p.categoria}`);
  } finally { for (const a of criados) fs.rmSync(a, { force: true }); }
  for (const s of SAB_TEXTO) {
    let src = fonte(s.arquivo);
    for (const [de, para] of s.trocas) { assert.equal(src.split(de).length, 2, `âncora (${s.nome}): ${de.slice(0, 60)}`); src = src.replace(de, () => para); }
    const falha = (s.tipo === "rota" ? provaRota : provaTela)(src);
    assert.ok(falha, `a sabotagem "${s.nome}" NÃO foi pega`);
    console.log(`   sabotagem pega — ${s.nome}: ${falha}`);
  }
  for (const a of criados) assert.ok(!fs.existsSync(a), "arquivo de sabotagem removido");
});

console.log(`\n${n} verificações OK`);
