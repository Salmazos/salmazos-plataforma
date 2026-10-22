// Verificação de Propostas (o projeto não tem runner de testes). Sem banco real: tudo roda em memória.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
import {
  SITUACOES, TRANSICOES, podeTransicionar, ehFinal, modoEdicao, modeloDisponivel, somarDiasUteis, calcularValidadeAte,
  diasRestantes, deveVencer, formatarNumeroProposta, numeroComRevisao, etapaAposSituacao, textoFollowUp,
  SITUACOES_ESCOLHIDAS_PELO_VENDEDOR, type SituacaoProposta,
} from "@/lib/propostas";
import {
  condicoesRsSchema, conteudoRsSchema, PADROES_RS, validarConteudo, itensRs, montarSnapshot, snapshotPropostaSchema,
  MENSAGEM_MODELO_INDISPONIVEL, TEMPLATE_VERSAO_ATUAL, TEXTO_INTRODUTORIO_PADRAO_RS, FRASE_EFEITO_RS, ASSINATURA_RS, itensAdicionais,
  MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL, MAX_TEXTO_INTRODUTORIO,
} from "@/lib/propostaModelos";
import { textoDesenhavel, caracteresOmitidos, paragrafosDesenhaveis } from "@/lib/propostaTexto";
import { execFileSync } from "node:child_process";
import { decodePDFRawStream, PDFRef, PDFDict, PDFArray } from "pdf-lib";
import { hojeSaoPaulo } from "@/lib/comercial";
import { ENDERECOS_RODAPE_PROPOSTA } from "@/lib/propostaAssets";
import { ENDERECO_FISCAL_SALMAZOS } from "@/lib/admissaoConstants";
import { gerarPdfProposta, calcularGrade, carregarLogosClientes, prepararLogoCliente, quebrar, CAIXA_LOGO_W, CAIXA_LOGO_H } from "@/lib/propostaPdf";
import { CW } from "@/lib/pdfWriter";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import * as rotaId from "@/app/api/comercial/propostas/[id]/route";
import * as rotaSit from "@/app/api/comercial/propostas/[id]/situacao/route";
import * as rotaPdf from "@/app/api/comercial/propostas/[id]/pdf/route";
import * as rotaPainel from "@/app/api/comercial/propostas/painel/route";
import * as rotaEmpresas from "@/app/api/comercial/propostas/empresas/route";
import * as rotaEmpresaContatos from "@/app/api/comercial/propostas/empresas/[id]/contatos/route";
import { podeAcessarPropostas, listarQuemPodeEscreverPropostas } from "@/lib/propostasAcesso";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";
import { ABAS_POR_CHAVE } from "@/lib/abasConfig";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

// ── Transições ───────────────────────────────────────────────────────────────
await caso("transições: tabela completa (válidas e inválidas)", () => {
  const validas: Record<string, string[]> = {
    rascunho: ["enviada", "cancelada"],
    enviada: ["em_negociacao", "aceita", "recusada", "vencida", "cancelada"],
    em_negociacao: ["aceita", "recusada", "vencida", "cancelada"],
    aceita: [], recusada: [], vencida: [], cancelada: [],
  };
  for (const de of SITUACOES) for (const para of SITUACOES) {
    assert.equal(podeTransicionar(de, para), validas[de].includes(para), `${de} → ${para}`);
  }
});
await caso("transições: aceita/recusada/vencida/cancelada são finais; rascunho nunca volta; ninguém vai para rascunho", () => {
  for (const s of ["aceita", "recusada", "vencida", "cancelada"] as SituacaoProposta[]) assert.ok(ehFinal(s), s);
  assert.ok(!ehFinal("rascunho") && !ehFinal("enviada") && !ehFinal("em_negociacao"));
  for (const s of SITUACOES) assert.ok(!TRANSICOES[s].includes("rascunho"), s);
});
await caso("vencida nunca é escolhida pelo vendedor; modo de edição por situação", () => {
  assert.ok(!SITUACOES_ESCOLHIDAS_PELO_VENDEDOR.includes("vencida"));
  assert.equal(modoEdicao("rascunho"), "rascunho");
  assert.equal(modoEdicao("enviada"), "revisao");
  assert.equal(modoEdicao("em_negociacao"), "revisao");
  for (const s of ["aceita", "recusada", "vencida", "cancelada"] as SituacaoProposta[]) assert.equal(modoEdicao(s), null);
});

// ── somarDiasUteis ───────────────────────────────────────────────────────────
// 2026-10-16 = sexta, 2026-10-17 = sábado, 2026-10-18 = domingo, 2026-10-19 = segunda.
await caso("somarDiasUteis: sexta + 1 = segunda", () => assert.equal(somarDiasUteis("2026-10-16", 1), "2026-10-19"));
await caso("somarDiasUteis: sábado + 1 = segunda; domingo + 1 = segunda", () => {
  assert.equal(somarDiasUteis("2026-10-17", 1), "2026-10-19");
  assert.equal(somarDiasUteis("2026-10-18", 1), "2026-10-19");
});
await caso("somarDiasUteis: +3 atravessando o fim de semana (quinta → terça; sexta → quarta)", () => {
  assert.equal(somarDiasUteis("2026-10-15", 3), "2026-10-20");
  assert.equal(somarDiasUteis("2026-10-16", 3), "2026-10-21");
});
await caso("somarDiasUteis: +3 dentro da semana, +0 devolve a mesma data, +10 = duas semanas", () => {
  assert.equal(somarDiasUteis("2026-10-19", 3), "2026-10-22");
  assert.equal(somarDiasUteis("2026-10-16", 0), "2026-10-16");
  assert.equal(somarDiasUteis("2026-10-19", 10), "2026-11-02");
});
await caso("somarDiasUteis: resultado nunca cai em sábado/domingo (varre 60 dias × 1..8)", () => {
  let d = "2026-10-01";
  for (let i = 0; i < 60; i++) {
    for (let n = 1; n <= 8; n++) {
      const dia = new Date(`${somarDiasUteis(d, n)}T12:00:00Z`).getUTCDay();
      assert.ok(dia !== 0 && dia !== 6, `${d} + ${n}`);
    }
    d = calcularValidadeAte(d, 1);
  }
});
await caso("somarDiasUteis: recusa dias negativo ou fracionado", () => {
  assert.throws(() => somarDiasUteis("2026-10-16", -1));
  assert.throws(() => somarDiasUteis("2026-10-16", 1.5));
});

// ── Validade e vencimento ────────────────────────────────────────────────────
await caso("validade: 15 dias corridos a partir da emissão; virada de mês e de ano", () => {
  assert.equal(calcularValidadeAte("2026-10-20", 15), "2026-11-04");
  assert.equal(calcularValidadeAte("2026-12-20", 15), "2027-01-04");
});
await caso("diasRestantes: positivo, zero no último dia, negativo depois", () => {
  assert.equal(diasRestantes("2026-11-04", "2026-10-20"), 15);
  assert.equal(diasRestantes("2026-11-04", "2026-11-04"), 0);
  assert.equal(diasRestantes("2026-11-04", "2026-11-05"), -1);
});
await caso("deveVencer: só enviada/em negociação, só depois do último dia, sem validade não vence", () => {
  assert.equal(deveVencer("enviada", "2026-11-04", "2026-11-04"), false);
  assert.equal(deveVencer("enviada", "2026-11-04", "2026-11-05"), true);
  assert.equal(deveVencer("em_negociacao", "2026-11-04", "2026-11-05"), true);
  for (const s of ["rascunho", "aceita", "recusada", "vencida", "cancelada"] as SituacaoProposta[]) assert.equal(deveVencer(s, "2026-01-01", "2026-11-05"), false, s);
  assert.equal(deveVencer("enviada", null, "2026-11-05"), false);
});

// ── Número ───────────────────────────────────────────────────────────────────
await caso("número: RS-0053/26, preenchimento de zeros, ano de 2 dígitos e Rev.", () => {
  assert.equal(formatarNumeroProposta("RS", 2026, 53), "RS-0053/26");
  assert.equal(formatarNumeroProposta("MOT", 2027, 1), "MOT-0001/27");
  assert.equal(formatarNumeroProposta("RS", 2026, 12345), "RS-12345/26");
  assert.equal(numeroComRevisao("RS-0053/26", 0), "RS-0053/26");
  assert.equal(numeroComRevisao("RS-0053/26", 2), "RS-0053/26 – Rev. 2");
  assert.equal(textoFollowUp("RS-0053/26"), "Follow-up da proposta RS-0053/26");
});

// ── Efeito no Funil ──────────────────────────────────────────────────────────
await caso("funil: enviada move só de fases anteriores; nunca retrocede; ganho/perdido não são tocados", () => {
  for (const e of ["prospeccao", "contato_feito", "reuniao_visita"]) assert.equal(etapaAposSituacao("enviada", e), "proposta_enviada", e);
  for (const e of ["proposta_enviada", "negociacao", "ganho", "perdido"]) assert.equal(etapaAposSituacao("enviada", e), null, e);
});
await caso("funil: em negociação só vira negociacao a partir de proposta_enviada", () => {
  assert.equal(etapaAposSituacao("em_negociacao", "proposta_enviada"), "negociacao");
  for (const e of ["prospeccao", "contato_feito", "reuniao_visita", "negociacao", "ganho", "perdido"]) assert.equal(etapaAposSituacao("em_negociacao", e), null, e);
});
await caso("funil: aceita → ganho; recusada → perdido; vencida/cancelada/rascunho não mexem", () => {
  for (const e of ["proposta_enviada", "negociacao"]) {
    assert.equal(etapaAposSituacao("aceita", e), "ganho");
    assert.equal(etapaAposSituacao("recusada", e), "perdido");
  }
  for (const s of ["vencida", "cancelada", "rascunho"] as SituacaoProposta[]) assert.equal(etapaAposSituacao(s, "proposta_enviada"), null, s);
  assert.equal(etapaAposSituacao("aceita", "ganho"), null);
});

// ── Modelos e Zod ────────────────────────────────────────────────────────────
await caso("modelos: só RS disponível; MOT e TS recusados com a mensagem padrão", () => {
  assert.ok(modeloDisponivel("RS"));
  for (const m of ["MOT", "TS", "XX", ""]) assert.ok(!modeloDisponivel(m), m);
  for (const m of ["MOT", "TS"]) assert.deepEqual(validarConteudo(m, {}), { ok: false, error: MENSAGEM_MODELO_INDISPONIVEL });
});
await caso("R&S: padrões 45 / 55 / 8 / 25 / 14", () => {
  assert.deepEqual(PADROES_RS, {
    taxa_sem_reposicao_pct: 45, taxa_com_reposicao_pct: 55, prazo_envio_curriculos_dias_uteis: 8, taxa_cancelamento_pct: 25, prazo_faturamento_dias: 14,
  });
  assert.deepEqual(conteudoRsSchema.parse({}).condicoes, PADROES_RS);
  assert.deepEqual(conteudoRsSchema.parse({ condicoes: { taxa_sem_reposicao_pct: 40 } }).condicoes, { ...PADROES_RS, taxa_sem_reposicao_pct: 40 });
});
const CAMPOS_PCT = ["taxa_sem_reposicao_pct", "taxa_com_reposicao_pct", "taxa_cancelamento_pct"];
const CAMPOS_DIAS = ["prazo_envio_curriculos_dias_uteis", "prazo_faturamento_dias"];
await caso("R&S: percentuais > 0 e <= 100 (bordas aceitas; 0, 0%, fora da faixa e texto recusados)", () => {
  for (const campo of CAMPOS_PCT) {
    for (const ok of [0.01, 100, 37.5, "45", " 45 "]) assert.ok(condicoesRsSchema.safeParse({ [campo]: ok }).success, `${campo}=${JSON.stringify(ok)}`);
    for (const ruim of [0, "0", -1, 100.01, 101, "abc", true, [], {}]) assert.ok(!condicoesRsSchema.safeParse({ [campo]: ruim }).success, `${campo}=${JSON.stringify(ruim)}`);
  }
});
await caso("R&S: prazos inteiros positivos (0, negativo, fracionado, acima de 365 e texto recusados)", () => {
  for (const campo of CAMPOS_DIAS) {
    for (const ok of [1, 8, 30, 365, "5"]) assert.ok(condicoesRsSchema.safeParse({ [campo]: ok }).success, `${campo}=${JSON.stringify(ok)}`);
    for (const ruim of [0, "0", -3, 2.5, 366, "x"]) assert.ok(!condicoesRsSchema.safeParse({ [campo]: ruim }).success, `${campo}=${JSON.stringify(ruim)}`);
  }
});
await caso("R&S: campo apagado ('', só espaços, null) é ERRO nos 5 campos, nunca 0 nem o padrão silencioso", () => {
  for (const campo of [...CAMPOS_PCT, ...CAMPOS_DIAS]) {
    for (const vazio of ["", "  ", "\t\n", null]) {
      const r = condicoesRsSchema.safeParse({ [campo]: vazio });
      assert.ok(!r.success, `${campo}=${JSON.stringify(vazio)} deveria falhar`);
      assert.ok(r.error.issues.some((i) => i.path[0] === campo && /^Informe o (percentual|prazo em dias)\.$/.test(i.message)), `${campo}: ${r.error.issues[0].message}`);
    }
  }
});
await caso("R&S: campo ausente (undefined) usa o padrão; objeto vazio e condicoes ausente também", () => {
  for (const campo of [...CAMPOS_PCT, ...CAMPOS_DIAS]) {
    const r = condicoesRsSchema.parse({ [campo]: undefined });
    assert.equal((r as Record<string, number>)[campo], (PADROES_RS as Record<string, number>)[campo], campo);
  }
  assert.deepEqual(condicoesRsSchema.parse({}), PADROES_RS);
  assert.deepEqual(conteudoRsSchema.parse({}).condicoes, PADROES_RS);
});
await caso("R&S: percentual apagado no conteúdo da proposta falha com mensagem legível (não vira 0%)", () => {
  const r = validarConteudo("RS", { condicoes: { taxa_cancelamento_pct: "" } });
  assert.ok(!r.ok && r.error.includes("condicoes.taxa_cancelamento_pct: Informe o percentual."), JSON.stringify(r));
  assert.ok(!validarConteudo("RS", { condicoes: { taxa_cancelamento_pct: 0 } }).ok);
});
await caso("validarConteudo RS: aceita CNPJ/endereço opcionais e devolve erro legível", () => {
  const ok = validarConteudo("RS", { cliente_cnpj: "00.000.000/0001-00", condicoes: { prazo_faturamento_dias: 21 } });
  assert.ok(ok.ok && ok.data.condicoes.prazo_faturamento_dias === 21 && ok.data.condicoes.taxa_sem_reposicao_pct === 45);
  const ruim = validarConteudo("RS", { condicoes: { taxa_cancelamento_pct: 150 } });
  assert.ok(!ruim.ok && ruim.error.includes("condicoes.taxa_cancelamento_pct: Use um percentual maior que 0 e até 100."));
});

// ── Texto fixo ───────────────────────────────────────────────────────────────
await caso("texto R&S: itens 1.1 a 1.7 em ordem, com os valores configurados (nunca fixos no texto)", () => {
  const itens = itensRs({ taxa_sem_reposicao_pct: 40, taxa_com_reposicao_pct: 50, prazo_envio_curriculos_dias_uteis: 5, taxa_cancelamento_pct: 20, prazo_faturamento_dias: 30 });
  assert.deepEqual(itens.map((i) => i.numero), ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"]);
  assert.equal(itens[0].texto, "Taxa de 40% sobre 1º salário – Vagas sem reposição; Taxa de 50% sobre 1º salário – Vagas c/ 01 reposição dentro dos primeiros 30 dias;");
  assert.equal(itens[1].texto, "Os currículos serão enviados em até 5 dias úteis;");
  assert.ok(itens[2].texto.includes("taxa de 20% sobre o 1º salário da vaga em questão;"));
  assert.ok(itens[3].texto.includes("com até 30 dias de vencimento;"));
  assert.ok(itens[6].texto.startsWith("INSTRUMENTOS DE AVALIAÇÃO PSICOLÓGICA (Adicionais, se necessário):"));
  const padrao = itensRs(PADROES_RS);
  assert.ok(padrao[0].texto.includes("45%") && padrao[0].texto.includes("55%"));
  assert.ok(padrao[1].texto.includes("8 dias úteis") && padrao[2].texto.includes("25%") && padrao[3].texto.includes("14 dias"));
});
await caso("texto R&S: percentual fracionado usa vírgula", () => {
  assert.ok(itensRs({ ...PADROES_RS, taxa_sem_reposicao_pct: 37.5 })[0].texto.startsWith("Taxa de 37,5% sobre"));
});

// ── Snapshot ─────────────────────────────────────────────────────────────────
await caso("snapshot: reúne tudo o que o PDF usa e passa no próprio schema", () => {
  const s = montarSnapshot({
    modelo: "RS", numero: "RS-0053/26", revisao: 0, templateVersao: 1, dataEmissao: "2026-10-20", validadeDias: 15, validadeAte: "2026-11-04",
    clienteNome: "Empresa X", aosCuidados: "  Ana  ", conteudo: { cliente_cnpj: " 11.111.111/0001-11 ", cliente_endereco: "", condicoes: { prazo_faturamento_dias: 21 } },
    vendedorNome: "Vendedor", vendedorTelefone: "  ",
  });
  assert.deepEqual(s, {
    modelo: "RS", numero: "RS-0053/26", revisao: 0, template_versao: 1, data_emissao: "2026-10-20", cliente_nome: "Empresa X",
    cliente_cnpj: "11.111.111/0001-11", cliente_endereco: null, aos_cuidados: "Ana", condicoes: { ...PADROES_RS, prazo_faturamento_dias: 21 },
    validade_dias: 15, validade_ate: "2026-11-04", vendedor_nome: "Vendedor", vendedor_telefone: null,
    texto_introdutorio: TEXTO_INTRODUTORIO_PADRAO_RS, clausulas_adicionais: [],
  });
  assert.ok(snapshotPropostaSchema.safeParse(JSON.parse(JSON.stringify(s))).success);
});


// ═══════════════════════════ PDF: grade de logos de clientes ═══════════════════════════

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proposta-pdf-"));
const png = async (w: number, h: number, cor: string, borda = 6) =>
  sharp({ create: { width: w + borda * 2, height: h + borda * 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: w, height: h, channels: 4, background: cor } }).png().toBuffer(), left: borda, top: borda }]).png().toBuffer();
const pastaClientes = path.join(tmp, "clientes");
fs.mkdirSync(pastaClientes);
fs.writeFileSync(path.join(pastaClientes, "b_alta.png"), await png(100, 400, "#cc2222"));
fs.writeFileSync(path.join(pastaClientes, "A_larga.PNG"), await png(400, 50, "#2255cc"));
fs.writeFileSync(path.join(pastaClientes, "c_pequena.jpg"), await sharp({ create: { width: 92, height: 44, channels: 3, background: "#22aa44" } }).jpeg().toBuffer());
fs.writeFileSync(path.join(pastaClientes, "quebrada.png"), "isto nao e uma imagem");
fs.writeFileSync(path.join(pastaClientes, "leia-me.txt"), "ignorado");
const snapBase = montarSnapshot({
  modelo: "RS", numero: "RS-0053/26", revisao: 0, templateVersao: 1, dataEmissao: "2026-10-20", validadeDias: 15, validadeAte: "2026-11-04",
  clienteNome: "Empresa X", aosCuidados: null, conteudo: {}, vendedorNome: "Vendedor", vendedorTelefone: null,
});
async function contarPaginasEImagens(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  let imagens = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) imagens++;
  }
  return { paginas: doc.getPageCount(), imagens };
}
const avisos: string[] = [];
const warnOriginal = console.warn;

await caso("grade: pasta com 3 PNG/JPG + 1 corrompido + 1 .txt → PDF gerado, corrompido e .txt ignorados (com aviso)", async () => {
  console.warn = (...a: unknown[]) => { avisos.push(a.join(" ")); };
  try {
    const bytes = await gerarPdfProposta(snapBase, { pastaCabecalho: path.join(tmp, "nao-existe"), pastaClientes });
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const { paginas, imagens } = await contarPaginasEImagens(bytes);
    assert.equal(paginas, 2, "página 1 + página dos clientes");
    assert.equal(imagens, 3, "só as 3 imagens válidas (sem cabeçalho)");
  } finally { console.warn = warnOriginal; }
  assert.ok(avisos.some((a) => a.includes("quebrada.png")), "avisou do arquivo corrompido");
  assert.ok(!avisos.some((a) => a.includes("leia-me")), ".txt nem é lido");
});
await caso("grade: ordem alfabética sem diferenciar maiúscula/minúscula (A_larga.PNG, b_alta.png, c_pequena.jpg)", async () => {
  console.warn = () => {};
  try { assert.deepEqual((await carregarLogosClientes(pastaClientes)).map((l) => l.nome), ["A_larga.PNG", "b_alta.png", "c_pequena.jpg"]); }
  finally { console.warn = warnOriginal; }
});
await caso("grade: logos 100x400, 400x50 e 92x44 cabem na caixa 300x120 (sem passar de 2x de ampliação)", async () => {
  console.warn = () => {};
  try {
    const dims: Record<string, [number, number]> = {};
    for (const l of await carregarLogosClientes(pastaClientes)) { const m = await sharp(l.png).metadata(); dims[l.nome] = [m.width!, m.height!]; }
    assert.deepEqual(dims["b_alta.png"], [30, 120]);
    assert.deepEqual(dims["A_larga.PNG"], [300, 38]);
    assert.deepEqual(dims["c_pequena.jpg"], [184, 88]);
    for (const [w, h] of Object.values(dims)) assert.ok(w <= CAIXA_LOGO_W && h <= CAIXA_LOGO_H);
  } finally { console.warn = warnOriginal; }
});
await caso("grade: PNG com transparência vira fundo branco (sem alfa) e a margem em volta é aparada", async () => {
  const saida = await prepararLogoCliente(await png(200, 60, "#000000", 40));
  const m = await sharp(saida).metadata();
  assert.equal(m.hasAlpha, false);
  assert.equal(m.width, 300, "200x60 aparado → ampliado ao teto da caixa (1,5x)");
  const { data, info } = await sharp(saida).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([data[0], data[1], data[2]], [0, 0, 0], "o primeiro pixel já é o logo (margem aparada)");
  assert.equal(info.channels, 3);
});
await caso("grade: logo GRANDE (3375x6000 RGBA com margens transparentes) cabe na caixa 300x120, sem alfa e com a margem aparada", async () => {
  const bloco = await sharp({ create: { width: 2000, height: 700, channels: 4, background: "#cc2222" } }).png().toBuffer();
  const grande = await sharp({ create: { width: 3375, height: 6000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bloco, left: 700, top: 2500 }]).png().toBuffer();
  const saida = await prepararLogoCliente(grande);
  const m = await sharp(saida).metadata();
  assert.ok(m.width! <= CAIXA_LOGO_W && m.height! <= CAIXA_LOGO_H, `${m.width}x${m.height}`);
  assert.equal(m.width, CAIXA_LOGO_W, "o lado limitante encosta na caixa");
  assert.equal(m.hasAlpha, false);
  const { data, info } = await sharp(saida).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [data[(y * info.width + x) * info.channels], data[(y * info.width + x) * info.channels + 1], data[(y * info.width + x) * info.channels + 2]];
  // A proporção do logo (2000x700) se mantém sem sobra de margem: 300 de largura dá ~105 de altura (a borda suaviza 1px).
  assert.ok(Math.abs(m.height! - 105) <= 2, `altura ${m.height}`);
  for (const [x, y] of [[3, 3], [info.width - 4, 3], [3, info.height - 4], [info.width - 4, info.height - 4]]) {
    const [r, g, b] = px(x, y);
    assert.ok(r > 180 && g < 80 && b < 80, `a 3px do canto (${x},${y}) já é o logo, sem margem branca: ${[r, g, b]}`);
  }
});
await caso("quebra: palavra sem espaços (endereço de 120 caracteres) é dividida por caractere e nenhuma linha passa da margem", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const longa = "Rua".padEnd(120, "abcdefghijklmnopqrstuvwxyz");
  assert.equal(longa.length, 120);
  for (const [texto, largura] of [[longa, CW], [`Endereço: ${longa} fim`, CW], [longa, CW - 60], ["a ".repeat(30) + longa, 200]] as [string, number][]) {
    const linhas = quebrar(texto, font, 10.5, largura);
    assert.ok(linhas.length >= 2, "precisou quebrar");
    for (const l of linhas) assert.ok(font.widthOfTextAtSize(l, 10.5) <= largura + 1e-6, `linha de ${font.widthOfTextAtSize(l, 10.5).toFixed(1)}pt > ${largura}: ${l}`);
    assert.equal(linhas.join("").replace(/ /g, ""), texto.replace(/ /g, ""), "nenhum caractere se perde");
  }
  assert.deepEqual(quebrar("curto e normal", font, 10.5, CW), ["curto e normal"]);
});
await caso("quebra: o PDF com endereço de 120 caracteres sem espaço é gerado (sem estourar)", async () => {
  const s2 = { ...snapBase, cliente_endereco: "R".repeat(120), cliente_cnpj: "9".repeat(120) };
  const bytes = await gerarPdfProposta(s2, { pastaCabecalho: path.join(tmp, "x"), pastaClientes: path.join(tmp, "x") });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
});
await caso("grade: células iguais, 4 por linha, última linha centralizada (14 logos = 4+4+4+2)", () => {
  const g = calcularGrade(14);
  assert.deepEqual(g.linhas.map((l) => l.xs.length), [4, 4, 4, 2]);
  for (const l of g.linhas) {
    const centro = (l.xs[0] + (l.xs[l.xs.length - 1] + g.celulaW)) / 2;
    assert.ok(Math.abs(centro - 595.28 / 2) < 0.01, `linha centralizada (${centro})`);
  }
  assert.ok(Math.abs(g.celulaH / g.celulaW - CAIXA_LOGO_H / CAIXA_LOGO_W) < 1e-9, "todas as células têm a proporção 300x120");
  const xs = g.linhas[0].xs;
  for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - (xs[1] - xs[0])) < 1e-9, "mesmo passo entre células");
});
await caso("grade: muitos logos paginam (60 logos → mais de 2 páginas)", async () => {
  const cheia = path.join(tmp, "muitos");
  fs.mkdirSync(cheia);
  const um = await png(120, 40, "#334455");
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(cheia, `l${String(i).padStart(2, "0")}.png`), um);
  const { paginas } = await contarPaginasEImagens(await gerarPdfProposta(snapBase, { pastaCabecalho: path.join(tmp, "x"), pastaClientes: cheia }));
  assert.ok(paginas >= 3, `paginas=${paginas}`);
});
await caso("grade: pasta vazia, só com .txt ou inexistente → PDF de 1 página (sem a página de clientes)", async () => {
  const vazia = path.join(tmp, "vazia"); fs.mkdirSync(vazia);
  const soTxt = path.join(tmp, "so-txt"); fs.mkdirSync(soTxt); fs.writeFileSync(path.join(soTxt, "a.txt"), "x");
  for (const pasta of [vazia, soTxt, path.join(tmp, "inexistente")]) {
    const { paginas } = await contarPaginasEImagens(await gerarPdfProposta(snapBase, { pastaCabecalho: path.join(tmp, "x"), pastaClientes: pasta }));
    assert.equal(paginas, 1, pasta);
  }
});
await caso("cabeçalho: com PNG na pasta usa a imagem; sem pasta cai na faixa preta com texto dourado (sem quebrar)", async () => {
  const cab = path.join(tmp, "cab"); fs.mkdirSync(cab);
  fs.writeFileSync(path.join(cab, "logo.png"), await png(800, 360, "#FFD700", 20));
  const sem = await contarPaginasEImagens(await gerarPdfProposta(snapBase, { pastaCabecalho: path.join(tmp, "nao"), pastaClientes: path.join(tmp, "nao") }));
  const com = await contarPaginasEImagens(await gerarPdfProposta(snapBase, { pastaCabecalho: cab, pastaClientes: path.join(tmp, "nao") }));
  assert.equal(sem.imagens, 0);
  assert.ok(com.imagens >= 1);
});
await caso("rodapé: exatamente as 4 linhas aprovadas (3 unidades + site/Instagram), sem o endereço fiscal; não quebra a paginação", async () => {
  assert.deepEqual(ENDERECOS_RODAPE_PROPOSTA, [
    "Rua Hipólito Piva, nº 30 – Centro – Monte Mor | SP – Tel.: 19 – 3217-7899",
    "Rua Zacarias Costa Camargo, nº 752 – Remanso Campineiro – Hortolândia | SP – Tel.: 19 – 3819-3919",
    "Rua Jurubatuba, nº 336 – Centro – São Bernardo do Campo | SP – Tel.: 11 – 96695-4751",
    "www.salmazos.com.br | @salmazosrh",
  ]);
  assert.ok(!ENDERECOS_RODAPE_PROPOSTA.includes(ENDERECO_FISCAL_SALMAZOS));
  const { paginas } = await contarPaginasEImagens(await gerarPdfProposta(snapBase, { pastaCabecalho: path.join(tmp, "x"), pastaClientes: path.join(tmp, "x") }));
  assert.equal(paginas, 1);
});
await caso("PDF: sem telefone do vendedor omite a linha; texto longo e caracteres fora do WinAnsi não derrubam", async () => {
  const longo = { ...snapBase, cliente_nome: "Empresa ".repeat(60) + "→ ✓ 😀", aos_cuidados: "Fulano ".repeat(40), vendedor_telefone: null };
  const bytes = await gerarPdfProposta(longo, { pastaCabecalho: path.join(tmp, "x"), pastaClientes: path.join(tmp, "x") });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  await assert.rejects(() => gerarPdfProposta({ ...snapBase, modelo: "MOT" }), /Modelo ainda não disponível/);
});

// ═══════════════════════════ Texto introdutório, cláusulas adicionais, frase, marca d'água, sanitização ═══════════════════════════

const CABECALHO_REAL = path.join(process.cwd(), "public", "propostas", "cabecalho");
const SEM_PASTA = path.join(tmp, "x");
const snapV2 = (conteudo: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  ...montarSnapshot({
    modelo: "RS", numero: "RS-0053/26", revisao: 0, templateVersao: 2, dataEmissao: "2026-10-20", validadeDias: 15, validadeAte: "2026-11-04",
    clienteNome: "Empresa X", aosCuidados: "Ana", conteudo, vendedorNome: "Vendedor de Teste", vendedorTelefone: "(19) 99999-0000",
  }),
  ...extra,
});
const gerarV2 = (snap: any, comLogo = true) => gerarPdfProposta(snap, { pastaCabecalho: comLogo ? CABECALHO_REAL : SEM_PASTA, pastaClientes: SEM_PASTA });
function textoPdfPorPagina(bytes: Uint8Array): string[] {
  const f = path.join(tmp, `t-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, bytes);
  return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }).split("\f").slice(0, -1);
}
const TEM_PDFTOTEXT = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();
// Conta quantas vezes cada página desenha uma imagem (operador Do) e se há transparência (ExtGState com ca).
async function operacoesPorPagina(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((pg) => {
    let texto = "";
    const conts = pg.node.Contents();
    const lista: any[] = conts instanceof PDFArray ? conts.asArray().map((r) => doc.context.lookup(r)) : conts ? [conts] : [];
    for (const c of lista) texto += Buffer.from(decodePDFRawStream(c as PDFRawStream).decode()).toString("latin1") + "\n";
    const gs = [...texto.matchAll(/\/(GS\d+) gs/g)].length;
    const opacidades: number[] = [];
    const res = pg.node.Resources();
    const ext = res?.lookup(PDFName.of("ExtGState"), PDFDict);
    if (ext) for (const k of ext.keys()) { const d = ext.lookup(k, PDFDict); const ca = d.get(PDFName.of("ca")); if (ca) opacidades.push(Number(ca.toString())); }
    return { desenhosDeImagem: [...texto.matchAll(/\/\S+ Do\b/g)].length, opacidades, gs };
  });
}

await caso("sanitização: nenhum caractere de 0 a U+30FF (e blocos de emoji) derruba a Helvetica; emoji some sem deixar espaço duplo", async () => {
  const doc = await PDFDocument.create();
  const fontes = [await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold)];
  const faixas: [number, number][] = [[0, 0x30ff], [0x1f000, 0x1faff], [0xe000, 0xe0ff], [0xff00, 0xffef]];
  let n = 0;
  for (const [a, b] of faixas) for (let cp = a; cp <= b; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const t = textoDesenhavel(`a${String.fromCodePoint(cp)}b`);
    for (const f of fontes) f.widthOfTextAtSize(t, 10.5); // lança se algum caractere não for codificável
    n++;
  }
  assert.ok(n > 14000, `${n} pontos de código testados`);
  assert.equal(textoDesenhavel("a 😀 b"), "a b");
  assert.equal(textoDesenhavel("Prezados 😀, ok 🚀."), "Prezados, ok.", "sem espaço sobrando antes da pontuação");
  assert.equal(textoDesenhavel("a , b"), "a , b", "sem omissão, o texto do vendedor não é mexido");
  assert.equal(textoDesenhavel("fam\u{1F468}\u200d\u{1F469}\u200d\u{1F467}ília \u2764\uFE0F ok"), "família ok");
  assert.equal(textoDesenhavel("Ölver Álvaro Ção — “aspas” ‘simples’ – € • …"), "Ölver Álvaro Ção — “aspas” ‘simples’ – € • …");
  assert.equal(textoDesenhavel("ő ū Ž ł"), "o u Ž", "acento fora do Latin-1 vira a letra base; o que não decompõe é omitido");
  assert.equal(textoDesenhavel("a‑b − c"), "a-b - c");
  assert.equal(textoDesenhavel(null), "");
  assert.deepEqual(caracteresOmitidos("ok 😀 ✓ → ok 😀"), ["😀", "✓", "→"]);
  assert.deepEqual(caracteresOmitidos("Só “texto” normal — e acentos çãé"), []);
  assert.deepEqual(paragrafosDesenhaveis("Um\n\n  Dois 😀 \r\nTrês"), ["Um", "Dois", "Três"]);
});
await caso("itens adicionais: numeração em sequência depois da 1.7 (1.8, 1.9, 1.10…)", () => {
  assert.deepEqual(itensAdicionais(["a", "b", "c"]).map((i) => i.numero), ["1.8", "1.9", "1.10"]);
  assert.equal(itensAdicionais(Array(10).fill("x"))[9].numero, "1.17");
  assert.deepEqual(itensAdicionais([]), []);
  assert.equal(itensRs(PADROES_RS).at(-1)!.numero, "1.7");
});
await caso("Zod: introdução ≤1000, até 10 cláusulas de ≤600, cláusula vazia/só emoji recusada, campos ausentes têm padrão", () => {
  const ok = (c: unknown) => conteudoRsSchema.safeParse(c);
  assert.deepEqual(ok({}).data?.clausulas_adicionais, []);
  assert.equal(ok({}).data?.texto_introdutorio, undefined);
  assert.ok(ok({ texto_introdutorio: "x".repeat(MAX_TEXTO_INTRODUTORIO) }).success);
  assert.ok(!ok({ texto_introdutorio: "x".repeat(MAX_TEXTO_INTRODUTORIO + 1) }).success);
  assert.ok(ok({ texto_introdutorio: "   " }).success, "vazio é aceito (o PDF usa o padrão)");
  assert.ok(!ok({ texto_introdutorio: "😀😀" }).success, "só emoji não tem o que imprimir");
  assert.ok(ok({ clausulas_adicionais: Array(MAX_CLAUSULAS_ADICIONAIS).fill("c".repeat(MAX_CLAUSULA_ADICIONAL)) }).success);
  assert.ok(!ok({ clausulas_adicionais: Array(MAX_CLAUSULAS_ADICIONAIS + 1).fill("c") }).success, "11 cláusulas");
  assert.ok(!ok({ clausulas_adicionais: ["c".repeat(MAX_CLAUSULA_ADICIONAL + 1)] }).success, "601 caracteres");
  assert.ok(!ok({ clausulas_adicionais: ["ok", "  "] }).success, "cláusula em branco");
  assert.ok(!ok({ clausulas_adicionais: ["🙂"] }).success, "cláusula só com emoji");
  assert.ok(!ok({ clausulas_adicionais: "texto" }).success);
  assert.deepEqual(ok({ clausulas_adicionais: ["  a  "] }).data?.clausulas_adicionais, ["a"], "aparada");
});
await caso("snapshot: introdução vazia/em branco usa o padrão; texto próprio é mantido; cláusulas entram no snapshot", () => {
  assert.equal(snapV2({ texto_introdutorio: "  " }).texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_RS);
  assert.equal(snapV2({ texto_introdutorio: "" }).texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_RS);
  assert.equal(snapV2({}).texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_RS);
  assert.equal(snapV2({ texto_introdutorio: " Olá, tudo bem? " }).texto_introdutorio, "Olá, tudo bem?");
  assert.deepEqual(snapV2({ clausulas_adicionais: ["Primeira", "Segunda"] }).clausulas_adicionais, ["Primeira", "Segunda"]);
  assert.ok(snapshotPropostaSchema.safeParse(JSON.parse(JSON.stringify(snapV2({ clausulas_adicionais: ["x"] })))).success);
  assert.ok(TEXTO_INTRODUTORIO_PADRAO_RS.length <= MAX_TEXTO_INTRODUTORIO);
  assert.ok(snapshotPropostaSchema.safeParse({ ...JSON.parse(JSON.stringify(snapBase)), texto_introdutorio: undefined, clausulas_adicionais: undefined }).success, "snapshot v1 sem os campos novos continua válido");
});
await caso("PDF v2: logo maior, marca d'água (opacidade 8%) em TODAS as páginas, mais uma imagem de cabeçalho só na 1ª", async () => {
  const longa = "Cláusula adicional de teste com bastante texto para ocupar linhas e forçar a quebra de página no documento. ".repeat(5).trim().slice(0, MAX_CLAUSULA_ADICIONAL);
  const bytes = await gerarV2(snapV2({ clausulas_adicionais: Array(10).fill(longa) }));
  const ops = await operacoesPorPagina(bytes);
  assert.ok(ops.length >= 2, `paginas=${ops.length}`);
  assert.equal(ops[0].desenhosDeImagem, 2, "página 1: logo do cabeçalho + marca d'água");
  for (const o of ops.slice(1)) assert.equal(o.desenhosDeImagem, 1, "demais páginas: só a marca d'água");
  for (const o of ops) assert.ok(o.opacidades.includes(0.08), `opacidade 0,08 em todas as páginas: ${o.opacidades}`);
});
await caso("PDF v2 sem logo na pasta: não quebra (sem marca d'água) e mantém o texto", async () => {
  const bytes = await gerarV2(snapV2({}), false);
  const { imagens } = await contarPaginasEImagens(bytes);
  assert.equal(imagens, 0);
});
await caso("PDF v1 (revisão já emitida) continua no layout antigo: sem introdução, frase, cláusulas adicionais nem marca d'água", async () => {
  const v1 = { ...snapV2({ clausulas_adicionais: ["Não deve aparecer"], texto_introdutorio: "Nem esta" }), template_versao: 1 };
  const bytes = await gerarV2(v1);
  const ops = await operacoesPorPagina(bytes);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].desenhosDeImagem, 1, "só o logo do cabeçalho");
  assert.deepEqual(ops[0].opacidades, []);
  const legado: any = JSON.parse(JSON.stringify(v1));
  delete legado.texto_introdutorio; delete legado.clausulas_adicionais;
  assert.equal(new TextDecoder().decode((await gerarV2(legado)).slice(0, 5)), "%PDF-", "snapshot gravado antes dos campos novos existirem");
  if (TEM_PDFTOTEXT) {
    const [pg] = textoPdfPorPagina(bytes);
    for (const proibido of ["Prezados", FRASE_EFEITO_RS, "Não deve aparecer", "1.8"]) assert.ok(!pg.includes(proibido), proibido);
    assert.ok(pg.includes("1.7") && pg.includes("Validade da proposta"));
  }
});
await caso("PDF v2 (texto): introdução própria e cláusulas 1.8…1.10 aparecem em ordem; frase de efeito inteira numa linha entre a introdução e a 1.1", async () => {
  if (!TEM_PDFTOTEXT) return;
  const bytes = await gerarV2(snapV2({ texto_introdutorio: "Olá, equipe.\nSegundo parágrafo.", clausulas_adicionais: ["Alfa extra", "Beta extra", "Gama extra"] }));
  const [pg] = textoPdfPorPagina(bytes);
  const linhas = pg.split("\n");
  const idx = (t: string) => linhas.findIndex((l) => l.includes(t));
  assert.ok(idx("Olá, equipe.") >= 0 && idx("Segundo parágrafo.") > idx("Olá, equipe."));
  assert.ok(idx(FRASE_EFEITO_RS) > idx("Segundo parágrafo."), "frase inteira em UMA linha, depois da introdução");
  assert.ok(idx("1.1") > idx(FRASE_EFEITO_RS), "e antes da cláusula 1.1");
  assert.ok(!pg.includes("Prezados"), "o texto padrão não aparece quando há texto próprio");
  assert.ok(idx("1.7") < idx("1.8") && idx("1.8") < idx("1.9") && idx("1.9") < idx("1.10"));
  assert.ok(linhas[idx("1.8")].includes("Alfa extra") && linhas[idx("1.9")].includes("Beta extra") && linhas[idx("1.10")].includes("Gama extra"));
  assert.ok(idx("Validade da proposta") > idx("1.10"));
  const padrao = textoPdfPorPagina(await gerarV2(snapV2({})))[0];
  assert.ok(padrao.includes("Prezados,") && padrao.includes("Ficamos à disposição para qualquer esclarecimento."));
});
await caso("PDF v2 (segurança): emoji, aspas curvas, travessão e símbolos em introdução, cláusulas e campos não derrubam; texto desenhável é preservado", async () => {
  const especial = "Reunião às 9h 😀 — “confirmada” ‘ok’ • 5% ✓ → ★ ñ ő 日本 \u200d é ç ã";
  const bytes = await gerarV2(snapV2({ texto_introdutorio: especial, clausulas_adicionais: [especial, "🙂 só depois do emoji", "Palavra".padEnd(MAX_CLAUSULA_ADICIONAL, "X")] }, { cliente_nome: especial, aos_cuidados: especial, vendedor_nome: "José 😀 Ölver" }));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  if (!TEM_PDFTOTEXT) return;
  const todo = textoPdfPorPagina(bytes).join("\n");
  for (const t of ["Reunião às 9h", "“confirmada”", "5%", "só depois do emoji", "José", "Ölver"]) assert.ok(todo.includes(t), t);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(todo), "nenhum emoji no PDF");
});
await caso("PDF v2 (paginação): textos longos quebram sem passar da margem; a assinatura nunca é cortada nem partida entre páginas (varredura de tamanhos)", async () => {
  if (!TEM_PDFTOTEXT) return;
  let paginasMax = 0;
  for (let palavras = 0; palavras <= 160; palavras += 8) {
    for (const nClausulas of [0, 3, 10]) {
      const clausula = Array.from({ length: palavras + 1 }, (_, i) => `palavra${i}`).join(" ").slice(0, MAX_CLAUSULA_ADICIONAL);
      const intro = Array.from({ length: palavras * 3 + 1 }, (_, i) => `texto${i}`).join(" ").slice(0, MAX_TEXTO_INTRODUTORIO);
      const pgs = textoPdfPorPagina(await gerarV2(snapV2({ texto_introdutorio: intro, clausulas_adicionais: Array(nClausulas).fill(clausula) })));
      paginasMax = Math.max(paginasMax, pgs.length);
      const onde = (t: string) => pgs.map((p, i) => (p.includes(t) ? i : -1)).filter((i) => i >= 0);
      const assin = [onde("SALMAZOS – Recrutamento"), onde("Vendedor de Teste"), onde("(19) 99999-0000")];
      for (const a of assin) assert.equal(a.length, 1, `assinatura presente uma vez (palavras=${palavras}, n=${nClausulas})`);
      assert.ok(assin[0][0] === assin[1][0] && assin[1][0] === assin[2][0], `bloco da assinatura numa só página (palavras=${palavras}, n=${nClausulas}): ${assin.map((a) => a[0])}`);
      assert.deepEqual(onde("Validade da proposta").length, 1);
      for (const t of ["texto0", "1.1", "1.7"]) assert.ok(pgs.join("\n").includes(t), t);
    }
  }
  assert.ok(paginasMax >= 2, "a varredura chegou a produzir mais de uma página");
});
await caso("PDF v2: a frase de efeito cabe numa linha na largura útil (sem reduzir abaixo de 8pt) e a assinatura ganha respiro (v2 > v1)", async () => {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  assert.ok(bold.widthOfTextAtSize(FRASE_EFEITO_RS, 8) <= CW);
  assert.equal(quebrar(FRASE_EFEITO_RS, bold, 8, CW).length, 1);
  if (!TEM_PDFTOTEXT) return;
  const y = async (snap: any) => {
    const f = path.join(tmp, `bbox-${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(f, await gerarV2(snap));
    const x = execFileSync("pdftotext", ["-bbox", f, "-"], { encoding: "utf8" });
    const pos = (w: string) => Number([...x.matchAll(new RegExp(`yMin="([\\d.]+)"[^>]*>${w}<`, "g"))].pop()![1]);
    return { validade: pos("Validade"), assinatura: pos("SALMAZOS") };
  };
  const v2 = await y(snapV2({}));
  const v1 = await y({ ...snapV2({}), template_versao: 1 });
  assert.ok(v2.assinatura - v2.validade > v1.assinatura - v1.validade + 25, `v2=${v2.assinatura - v2.validade} v1=${v1.assinatura - v1.validade}`);
});

// ═══════════════════════════ API: rotas de Propostas contra o banco em memória ═══════════════════════════

const U = "11111111-1111-4111-8111-111111111111", U2 = "11111111-1111-4111-8111-222222222222";
const V = "22222222-2222-4222-8222-222222222222", V2 = "33333333-3333-4333-8333-333333333333", DIR = "44444444-4444-4444-8444-444444444444";
const EMP = "55555555-5555-4555-8555-555555555555", EMP_OUTRA_UNIDADE = "55555555-5555-4555-8555-666666666666";
const CT = "66666666-6666-4666-8666-666666666666", CT_FORA = "66666666-6666-4666-8666-777777777777";
// Perfis da liberação individual (aba comercial_propostas em usuario_acesso_customizado).
const LIB = "77777777-7777-4777-8777-000000000001", SEM = "77777777-7777-4777-8777-000000000002", INA = "77777777-7777-4777-8777-000000000003";
const DIRL = "77777777-7777-4777-8777-000000000004", DIRB = "77777777-7777-4777-8777-000000000005", PERDEU = "77777777-7777-4777-8777-000000000006";
const HOJE = hojeSaoPaulo();
const ANO = Number(HOJE.slice(0, 4));
const AA = String(ANO).slice(-2);
const IMUTAVEIS = ["proposta_revisoes", "proposta_historico"];

// Imita criar_proposta do banco com fórmula própria (independente de formatarNumeroProposta): contador por modelo+ano.
function rpcCriarProposta(a: Record<string, unknown>, db: ReturnType<typeof criarDb>) {
  if (!["RS", "MOT", "TS"].includes(a.p_modelo as string)) return { data: null, error: { message: `Modelo de proposta inválido: ${a.p_modelo}` } };
  (db as any).rpcChamadas.push(a);
  const cont = db.tabelas.proposta_contadores;
  let c = cont.find((x: any) => x.modelo === a.p_modelo && x.ano === ANO);
  if (!c) { c = { modelo: a.p_modelo, ano: ANO, ultimo: 0 }; cont.push(c); }
  c.ultimo += 1;
  const agora = new Date().toISOString();
  const linha = {
    id: crypto.randomUUID(), numero: `${a.p_modelo}-${String(c.ultimo).padStart(4, "0")}/${String(ANO).slice(-2)}`, modelo: a.p_modelo, ano: ANO, sequencial: c.ultimo,
    revisao_atual: 0, situacao: "rascunho", unidade_id: a.p_unidade_id, vendedor_id: a.p_vendedor_id, empresa_visitada_id: a.p_empresa_visitada_id, oportunidade_id: a.p_oportunidade_id,
    cliente_nome: a.p_cliente_nome, aos_cuidados: a.p_aos_cuidados, conteudo: a.p_conteudo, template_versao: a.p_template_versao, validade_dias: a.p_validade_dias,
    validade_ate: null, valor_estimado: null, enviada_em: null, created_at: agora, updated_at: agora,
  };
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}

function novoDb(extra: Record<string, unknown[]> = {}) {
  const db: any = criarDb({
    analistas_perfil: [
      { id: V, user_id: "u-v", nome_completo: "Vendedor", telefone: "(19) 99999-0000", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
      { id: V2, user_id: "u-v2", nome_completo: "Outro", telefone: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
      { id: DIR, user_id: "u-dir", nome_completo: "Diretora", telefone: null, nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      { id: LIB, user_id: "u-lib", nome_completo: "Selecionadora", telefone: "(19) 98888-0000", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true },
      { id: SEM, user_id: "u-sem", nome_completo: "Sem acesso", telefone: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true },
      { id: INA, user_id: "u-ina", nome_completo: "Inativa", telefone: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: false },
      { id: DIRL, user_id: "u-dirl", nome_completo: "Diretor liberado", telefone: null, nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      { id: DIRB, user_id: "u-dirb", nome_completo: "Diretor bloqueado", telefone: null, nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      { id: PERDEU, user_id: "u-perdeu", nome_completo: "Ex-vendedor", telefone: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: false, ativo: true },
    ],
    usuario_acesso_customizado: [],
    empresas_visitadas: [{ id: EMP, nome: "Empresa X", cliente_id: null, unidade_id: U }, { id: EMP_OUTRA_UNIDADE, nome: "Empresa Y", cliente_id: null, unidade_id: U2 }],
    empresa_contatos: [{ id: CT, nome: "Ana Contato", empresa_visitada_id: EMP }, { id: CT_FORA, nome: "Fora", empresa_visitada_id: EMP_OUTRA_UNIDADE }],
    oportunidades: [], lembretes: [], oportunidade_interacoes: [], propostas: [], proposta_revisoes: [], proposta_historico: [],
    proposta_contadores: [{ modelo: "RS", ano: ANO, ultimo: 52 }],
    ...extra,
  });
  db.rpcs = { criar_proposta: rpcCriarProposta };
  db.rpcChamadas = [];
  db.imutaveis = IMUTAVEIS;
  db.cascatas = { oportunidades: [{ tabela: "oportunidade_interacoes", col: "oportunidade_id" }] };
  db.unicos = undefined;
  return db;
}
type Chamada = { status: number; body: any };
async function chamar(db: any, usuario: string | null, fn: (...a: any[]) => Promise<Response>, { metodo = "GET", url = "http://x/api", corpo, id }: { metodo?: string; url?: string; corpo?: unknown; id?: string } = {}): Promise<Chamada> {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: ["u-dir", "u-dirl", "u-dirb"].includes(usuario) ? "diretoria" : "analista" } } : null;
  globalThis.__DB__ = db;
  const req = Object.assign(new Request(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { nextUrl: new URL(url) });
  const r = await fn(req, { params: Promise.resolve({ id }) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, body: tipo.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
}
const criar = (db: any, corpo: Record<string, unknown> = {}, usuario = "u-v") => chamar(db, usuario, rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP, ...corpo } });
const situacao = (db: any, id: string, corpo: Record<string, unknown>, usuario = "u-v") => chamar(db, usuario, rotaSit.POST, { metodo: "POST", id, corpo });
const detalhe = (db: any, id: string, usuario = "u-v") => chamar(db, usuario, rotaId.GET, { id });
const proposta = (db: any, id: string) => db.tabelas.propostas.find((p: any) => p.id === id);
const opps = (db: any) => db.tabelas.oportunidades;
const SEMENTE_OPP = (extra: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(), unidade_id: U, vendedor_id: V, empresa: "Empresa X", empresa_visitada_id: EMP, contato_id: null, etapa: "contato_feito",
  proxima_acao: "Ligar", proxima_acao_em: "2030-01-10", valor_estimado: null, servico_interesse: null, fechada_em: null, motivo_perda: null,
  motivo_perda_categoria: null, updated_at: "2026-10-01T10:00:00.000Z", ...extra,
});
async function enviar(db: any, valor = 5000, corpoCriar: Record<string, unknown> = {}) {
  const c = await criar(db, corpoCriar);
  const id = c.body.data.id as string;
  const r = await situacao(db, id, { para: "enviada", valor_estimado: valor });
  return { id, r, numero: c.body.data.numero as string };
}

await caso("criar: número vem do rpc e segue a regra RS-0053/26; campos de identidade vêm do servidor, não do corpo", async () => {
  const db = novoDb();
  const forjado = { vendedor_id: V2, unidade_id: U2, cliente_nome: "Forjado", numero: "RS-9999/26", situacao: "aceita", p_modelo: "TS" };
  const r = await criar(db, { ...forjado, contato_id: CT });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `RS-0053/${AA}`);
  if (ANO === 2026) assert.equal(r.body.data.numero, "RS-0053/26");
  assert.equal(r.body.data.situacao, "rascunho");
  assert.equal(r.body.data.vendedor_id, V);
  assert.equal(r.body.data.unidade_id, U);
  assert.equal(r.body.data.cliente_nome, "Empresa X");
  assert.equal(r.body.data.aos_cuidados, "Ana Contato");
  assert.equal(r.body.data.validade_dias, 15);
  assert.equal(r.body.data.template_versao, TEMPLATE_VERSAO_ATUAL);
  assert.equal(TEMPLATE_VERSAO_ATUAL, 2);
  assert.deepEqual(r.body.data.conteudo.condicoes, PADROES_RS);
  assert.deepEqual(r.body.data.conteudo.clausulas_adicionais, []);
  assert.equal(db.rpcChamadas.length, 1);
  assert.equal(db.rpcChamadas[0].p_vendedor_id, V);
  assert.equal(db.rpcChamadas[0].p_modelo, "RS");
  const r2 = await criar(db);
  assert.equal(r2.body.data.numero, `RS-0054/${AA}`);
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "rascunho").length, 2);
});
await caso("criar: MOT e TS → 400 'Modelo ainda não disponível.'; modelo inexistente → 400; contador intacto", async () => {
  const db = novoDb();
  for (const modelo of ["MOT", "TS"]) {
    const r = await criar(db, { modelo });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "Modelo ainda não disponível.");
  }
  assert.equal((await criar(db, { modelo: "XX" })).status, 400);
  assert.equal(db.rpcChamadas.length, 0);
  assert.equal(db.tabelas.proposta_contadores[0].ultimo, 52);
});
await caso("criar: percentual apagado → 400 'Informe o percentual.' (nada é criado)", async () => {
  const db = novoDb();
  const r = await criar(db, { conteudo: { condicoes: { taxa_sem_reposicao_pct: "" } } });
  assert.equal(r.status, 400);
  assert.ok(r.body.error.includes("Informe o percentual."), r.body.error);
  assert.equal(db.tabelas.propostas.length, 0);
});
await caso("criar: gestor sem perfil comercial → 403; sem login → 401; empresa de outra unidade → 404; contato de outra empresa → 400", async () => {
  const db = novoDb();
  assert.equal((await criar(db, {}, "u-dir")).status, 403);
  assert.equal((await chamar(db, null, rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })).status, 401);
  assert.equal((await criar(db, { empresa_visitada_id: EMP_OUTRA_UNIDADE })).status, 404);
  assert.equal((await criar(db, { contato_id: CT_FORA })).status, 400);
  assert.equal(db.tabelas.propostas.length, 0);
});
await caso("criar: oportunidade aberta de OUTRO vendedor só avisa (não bloqueia, não vincula); a do próprio é vinculada", async () => {
  const dbOutro = novoDb({ oportunidades: [SEMENTE_OPP({ vendedor_id: V2, etapa: "reuniao_visita" })] });
  const r = await criar(dbOutro);
  assert.equal(r.status, 201);
  assert.match(r.body.aviso, /Já existe uma oportunidade aberta para esta empresa \(vendedor: Outro/);
  assert.equal(r.body.data.oportunidade_id, null);
  const propria = SEMENTE_OPP();
  const dbProprio = novoDb({ oportunidades: [propria] });
  const r2 = await criar(dbProprio);
  assert.equal(r2.body.aviso, null);
  assert.equal(r2.body.data.oportunidade_id, propria.id);
});

await caso("enviar: sem valor → 400 e a proposta continua rascunho (nada no Funil)", async () => {
  const db = novoDb();
  const c = await criar(db);
  const r = await situacao(db, c.body.data.id, { para: "enviada" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /valor estimado/i);
  assert.equal((await situacao(db, c.body.data.id, { para: "enviada", valor_estimado: 0 })).status, 400);
  assert.equal(proposta(db, c.body.data.id).situacao, "rascunho");
  assert.equal(opps(db).length, 0);
  assert.equal(db.tabelas.lembretes.length, 0);
});
await caso("enviar: empresa sem oportunidade aberta → CRIA oportunidade em proposta_enviada, follow-up +3 dias úteis e Rev. 0", async () => {
  const db = novoDb();
  const { id, r, numero } = await enviar(db, 7500);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = proposta(db, id);
  assert.equal(p.situacao, "enviada");
  assert.equal(p.valor_estimado, 7500);
  assert.equal(p.validade_ate, calcularValidadeAte(HOJE, 15));
  assert.ok(p.enviada_em);
  assert.equal(opps(db).length, 1);
  const o = opps(db)[0];
  assert.deepEqual(
    { etapa: o.etapa, vendedor_id: o.vendedor_id, unidade_id: o.unidade_id, empresa_visitada_id: o.empresa_visitada_id, valor: o.valor_estimado, servico: o.servico_interesse, acao: o.proxima_acao, em: o.proxima_acao_em },
    { etapa: "proposta_enviada", vendedor_id: V, unidade_id: U, empresa_visitada_id: EMP, valor: 7500, servico: "Recrutamento e Seleção", acao: `Follow-up da proposta ${numero}`, em: somarDiasUteis(HOJE, 3) },
  );
  assert.equal(p.oportunidade_id, o.id);
  const l = db.tabelas.lembretes;
  assert.equal(l.length, 1);
  assert.deepEqual(
    { tipo: l[0].tipo, status: l[0].status, oportunidade_id: l[0].oportunidade_id, empresa: l[0].empresa_visitada_id, vendedor: l[0].vendedor_id, texto: l[0].texto, data: l[0].data_lembrete },
    { tipo: "retorno", status: "pendente", oportunidade_id: o.id, empresa: EMP, vendedor: V, texto: `Follow-up da proposta ${numero}`, data: somarDiasUteis(HOJE, 3) },
  );
  assert.equal(db.tabelas.proposta_revisoes.length, 1);
  const rev = db.tabelas.proposta_revisoes[0];
  assert.equal(rev.revisao, 0);
  assert.ok(snapshotPropostaSchema.safeParse(rev.conteudo).success);
  assert.equal(rev.conteudo.numero, numero);
  assert.equal(rev.conteudo.vendedor_nome, "Vendedor");
  assert.equal(rev.conteudo.vendedor_telefone, "(19) 99999-0000");
  assert.equal(rev.conteudo.data_emissao, HOJE);
  assert.equal(rev.conteudo.validade_ate, p.validade_ate);
  assert.ok(db.tabelas.proposta_historico.some((h: any) => h.de === "rascunho" && h.para === "enviada" && h.autor_id === V));
});
const CLIENTE = "99999999-9999-4999-8999-aaaaaaaaaaaa";
await caso("enviar: oportunidade CRIADA leva o cliente_id da empresa (quando existe) e a anotação de origem no histórico do Funil", async () => {
  const db = novoDb();
  db.tabelas.empresas_visitadas.find((e: any) => e.id === EMP).cliente_id = CLIENTE;
  const { id, r, numero } = await enviar(db);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = opps(db)[0];
  assert.equal(o.cliente_id, CLIENTE);
  const notas = db.tabelas.oportunidade_interacoes.filter((i: any) => i.oportunidade_id === o.id);
  assert.equal(notas.length, 1);
  assert.deepEqual({ tipo: notas[0].tipo, autor: notas[0].autor_id, desc: notas[0].descricao }, { tipo: "anotacao", autor: V, desc: `Oportunidade criada ao marcar a proposta ${numero} como enviada.` });
  assert.equal(proposta(db, id).oportunidade_id, o.id);
});
await caso("enviar: empresa sem cliente vinculado → cliente_id null; falha ao gravar a anotação só registra erro (não desfaz o envio)", async () => {
  const db = novoDb();
  const erros: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => { erros.push(a.join(" ")); };
  try {
    db.falhas["oportunidade_interacoes.insert"] = "boom";
    const { id, r } = await enviar(db);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(proposta(db, id).situacao, "enviada");
    assert.equal(opps(db)[0].cliente_id, null);
    assert.equal(db.tabelas.oportunidade_interacoes.length, 0);
  } finally { console.error = original; }
  assert.ok(erros.some((e) => e.includes("Anotação de origem")), "registrou o erro");
});
await caso("enviar: se a Rev. 0 falhar, o desfazer remove a oportunidade criada E o histórico dela (cascata); a anotação de origem não sobra", async () => {
  const db = novoDb();
  const c = await criar(db);
  db.falhas["proposta_revisoes.insert"] = "boom";
  const r = await situacao(db, c.body.data.id, { para: "enviada", valor_estimado: 5000 });
  assert.equal(r.status, 500);
  assert.equal(opps(db).length, 0);
  assert.equal(db.tabelas.oportunidade_interacoes.length, 0, "interações da oportunidade apagada caíram junto");
  assert.equal(proposta(db, c.body.data.id).situacao, "rascunho");
});
await caso("enviar: oportunidade aberta do próprio vendedor em fase anterior → MOVE para proposta_enviada (mesmo id, sem segunda)", async () => {
  const o = SEMENTE_OPP({ etapa: "contato_feito" });
  const db = novoDb({ oportunidades: [o] });
  const { id, r, numero } = await enviar(db, 3000);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(opps(db).length, 1);
  assert.equal(opps(db)[0].id, o.id);
  assert.equal(opps(db)[0].etapa, "proposta_enviada");
  assert.equal(opps(db)[0].proxima_acao, `Follow-up da proposta ${numero}`);
  assert.equal(proposta(db, id).oportunidade_id, o.id);
  assert.ok(db.tabelas.oportunidade_interacoes.some((i: any) => i.tipo === "mudanca_etapa" && /Contato feito → Proposta enviada/.test(i.descricao)));
});
await caso("enviar: oportunidade já em proposta_enviada → etapa não muda; atualiza ação, data, valor e REAPROVEITA o lembrete pendente (sem duplicar)", async () => {
  const o = SEMENTE_OPP({ etapa: "proposta_enviada", valor_estimado: 100, servico_interesse: "Outro serviço", proxima_acao: "Antiga", proxima_acao_em: "2030-01-01" });
  const numeroEsperado = `RS-0053/${AA}`;
  const db = novoDb({
    oportunidades: [o],
    lembretes: [{ id: "l-existente", oportunidade_id: o.id, tipo: "retorno", status: "pendente", texto: `Follow-up da proposta ${numeroEsperado}`, data_lembrete: "2000-01-01", vendedor_id: V }],
  });
  const { id, r, numero } = await enviar(db, 9000);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(numero, numeroEsperado);
  const x = opps(db)[0];
  assert.deepEqual({ etapa: x.etapa, valor: x.valor_estimado, acao: x.proxima_acao, em: x.proxima_acao_em }, { etapa: "proposta_enviada", valor: 9000, acao: `Follow-up da proposta ${numero}`, em: somarDiasUteis(HOJE, 3) });
  assert.equal(db.tabelas.oportunidade_interacoes.length, 0, "sem mudança de etapa não há registro de fase");
  assert.equal(db.tabelas.lembretes.length, 1, "o lembrete existente foi reaproveitado");
  assert.equal(db.tabelas.lembretes[0].id, "l-existente");
  assert.equal(db.tabelas.lembretes[0].data_lembrete, somarDiasUteis(HOJE, 3));
  assert.equal(proposta(db, id).oportunidade_id, o.id);
});
await caso("enviar: oportunidade aberta de OUTRO vendedor → 409 com a mensagem do Funil; proposta segue rascunho; nada gravado", async () => {
  const db = novoDb({ oportunidades: [SEMENTE_OPP({ vendedor_id: V2, etapa: "reuniao_visita" })] });
  const { id, r } = await enviar(db);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Já existe uma oportunidade aberta para esta empresa \(vendedor: Outro, fase: Reunião\/Visita\)/);
  assert.equal(proposta(db, id).situacao, "rascunho");
  assert.equal(proposta(db, id).enviada_em, null);
  assert.equal(opps(db).length, 1);
  assert.equal(db.tabelas.lembretes.length, 0);
  assert.equal(db.tabelas.proposta_revisoes.length, 0);
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "enviada").length, 0);
});
await caso("enviar: empresa só com oportunidade ganho/perdido → CRIA nova em proposta_enviada e não reabre a antiga", async () => {
  const antiga = SEMENTE_OPP({ etapa: "perdido", fechada_em: "2026-01-01T00:00:00.000Z", motivo_perda_categoria: "sem_retorno" });
  const ganha = SEMENTE_OPP({ etapa: "ganho", fechada_em: "2026-02-01T00:00:00.000Z", valor_estimado: 10, servico_interesse: "X" });
  const db = novoDb({ oportunidades: [antiga, ganha] });
  const copiaAntes = structuredClone([antiga, ganha]);
  const { id, r } = await enviar(db);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(opps(db).length, 3);
  assert.deepEqual(opps(db).slice(0, 2), copiaAntes, "as antigas ficam exatamente como estavam");
  const nova = opps(db)[2];
  assert.equal(nova.etapa, "proposta_enviada");
  assert.equal(proposta(db, id).oportunidade_id, nova.id);
});
await caso("enviar: se o lembrete não puder ser criado → 500, proposta volta a rascunho, Funil desfeito (criada some / movida é restaurada), sem Rev.", async () => {
  const dbNova = novoDb();
  dbNova.falhas["lembretes.insert"] = "boom";
  const a = await enviar(dbNova);
  assert.equal(a.r.status, 500);
  assert.equal(proposta(dbNova, a.id).situacao, "rascunho");
  assert.equal(proposta(dbNova, a.id).enviada_em, null);
  assert.equal(opps(dbNova).length, 0, "a oportunidade criada foi desfeita");
  assert.equal(dbNova.tabelas.proposta_revisoes.length, 0);

  const o = SEMENTE_OPP({ etapa: "contato_feito" });
  const dbMov = novoDb({ oportunidades: [structuredClone(o)] });
  dbMov.falhas["lembretes.insert"] = "boom";
  const b = await enviar(dbMov);
  assert.equal(b.r.status, 500);
  assert.equal(proposta(dbMov, b.id).situacao, "rascunho");
  const restaurada = opps(dbMov)[0];
  assert.deepEqual({ etapa: restaurada.etapa, acao: restaurada.proxima_acao, valor: restaurada.valor_estimado }, { etapa: "contato_feito", acao: "Ligar", valor: null });
});
await caso("enviar: se a Rev. 0 não puder ser gravada → 500 e tudo é desfeito (proposta rascunho, Funil e follow-up desfeitos)", async () => {
  const db = novoDb();
  const c = await criar(db);
  db.falhas["proposta_revisoes.insert"] = "boom";
  const r = await situacao(db, c.body.data.id, { para: "enviada", valor_estimado: 5000 });
  assert.equal(r.status, 500);
  assert.equal(proposta(db, c.body.data.id).situacao, "rascunho");
  assert.equal(opps(db).length, 0);
  assert.ok(db.tabelas.lembretes.every((l: any) => l.status === "cancelado"), "follow-up cancelado");
  delete db.falhas["proposta_revisoes.insert"];
  const ok = await situacao(db, c.body.data.id, { para: "enviada", valor_estimado: 5000 });
  assert.equal(ok.status, 200, "depois da falha dá para enviar normalmente");
  assert.equal(db.tabelas.proposta_revisoes.length, 1);
});
await caso("enviar: corrida (outra pessoa muda a proposta entre a leitura e a gravação) → 409 e nada é gravado", async () => {
  const db = novoDb();
  const c = await criar(db);
  const id = c.body.data.id;
  db.ganchos = { "propostas.update": async () => { proposta(db, id).situacao = "cancelada"; } };
  const r = await situacao(db, id, { para: "enviada", valor_estimado: 5000 });
  assert.equal(r.status, 409);
  assert.equal(opps(db).length, 0);
  assert.equal(db.tabelas.proposta_revisoes.length, 0);
});

await caso("situação: 'vencida' → 400 (automática); 'rascunho' → 400; transições fora da tabela → 409", async () => {
  const db = novoDb();
  const c = await criar(db);
  const id = c.body.data.id;
  const v = await situacao(db, id, { para: "vencida" });
  assert.equal(v.status, 400);
  assert.match(v.body.error, /automática/);
  assert.equal((await situacao(db, id, { para: "rascunho" })).status, 400);
  for (const para of ["em_negociacao", "aceita", "recusada"]) {
    const r = await situacao(db, id, { para, motivo_perda_categoria: "sem_retorno" });
    assert.equal(r.status, 409, para);
  }
  assert.equal((await situacao(db, id, { para: "cancelada" })).status, 200);
  for (const para of ["enviada", "em_negociacao", "aceita", "recusada", "cancelada"]) {
    assert.equal((await situacao(db, id, { para, valor_estimado: 1, motivo_perda_categoria: "sem_retorno" })).status, 409, `cancelada → ${para}`);
  }
  assert.equal((await situacao(db, id, { para: "inexistente" })).status, 400);
});
await caso("em negociação: oportunidade em proposta_enviada vai para negociacao; follow-up continua pendente", async () => {
  const db = novoDb();
  const { id, numero } = await enviar(db);
  const r = await situacao(db, id, { para: "em_negociacao" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).situacao, "em_negociacao");
  assert.equal(opps(db)[0].etapa, "negociacao");
  assert.equal(db.tabelas.lembretes.find((l: any) => l.texto === `Follow-up da proposta ${numero}`).status, "pendente");
});
await caso("aceita → oportunidade ganho e cancela SÓ o follow-up desta proposta (outros lembretes ficam)", async () => {
  const db = novoDb();
  const { id, numero } = await enviar(db, 12000);
  db.tabelas.lembretes.push(
    { id: "outro-1", oportunidade_id: opps(db)[0].id, tipo: "retorno", status: "pendente", texto: "Follow-up da proposta RS-0001/26" },
    { id: "outro-2", oportunidade_id: null, tipo: "retorno", status: "pendente", texto: `Follow-up da proposta ${numero}` },
  );
  const r = await situacao(db, id, { para: "aceita" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).situacao, "aceita");
  assert.equal(opps(db)[0].etapa, "ganho");
  assert.ok(opps(db)[0].fechada_em);
  assert.equal(db.tabelas.lembretes.find((l: any) => l.texto === `Follow-up da proposta ${numero}` && l.oportunidade_id === opps(db)[0].id).status, "cancelado");
  assert.equal(db.tabelas.lembretes.find((l: any) => l.id === "outro-1").status, "pendente");
  assert.equal(db.tabelas.lembretes.find((l: any) => l.id === "outro-2").status, "pendente");
});
await caso("recusada: 'outro' exige texto; sem motivo, quem tem Funil e oportunidade aberta própria é barrado pelo 'perdido' do Funil (nada muda); com categoria → oportunidade perdido (+ reconectar +90) e follow-up cancelado", async () => {
  const db = novoDb();
  const { id, numero } = await enviar(db);
  const semMotivo = await situacao(db, id, { para: "recusada" });
  assert.equal(semMotivo.status, 400);
  assert.match(semMotivo.body.error, /motivo/i);
  assert.equal((await situacao(db, id, { para: "recusada", motivo_perda_categoria: "outro" })).status, 400);
  assert.equal(proposta(db, id).situacao, "enviada");
  assert.equal(opps(db)[0].etapa, "proposta_enviada");
  const r = await situacao(db, id, { para: "recusada", motivo_perda_categoria: "valor_acima_orcamento", observacao: "Achou caro" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).situacao, "recusada");
  const o = opps(db)[0];
  assert.deepEqual({ etapa: o.etapa, cat: o.motivo_perda_categoria }, { etapa: "perdido", cat: "valor_acima_orcamento" });
  const reconectar = db.tabelas.lembretes.find((l: any) => l.tipo === "reconectar");
  assert.equal(reconectar.status, "pendente");
  assert.equal(reconectar.data_lembrete, calcularValidadeAte(HOJE, 90));
  assert.equal(db.tabelas.lembretes.find((l: any) => l.texto === `Follow-up da proposta ${numero}`).status, "cancelado");
  const h = db.tabelas.proposta_historico.find((x: any) => x.para === "recusada");
  assert.match(h.observacao, /Valor acima do orçamento/);
});
await caso("recusada: se o Funil falhar (perda não grava) a proposta volta ao que era", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  db.falhas["lembretes.insert"] = "boom";
  const r = await situacao(db, id, { para: "recusada", motivo_perda_categoria: "sem_retorno" });
  assert.equal(r.status, 500);
  assert.equal(proposta(db, id).situacao, "enviada");
  assert.equal(opps(db)[0].etapa, "proposta_enviada");
});
await caso("cancelada: não mexe na oportunidade, só cancela o follow-up pendente (rascunho e enviada)", async () => {
  const db = novoDb();
  const { id, numero } = await enviar(db);
  const r = await situacao(db, id, { para: "cancelada", observacao: "Cliente desistiu" });
  assert.equal(r.status, 200);
  assert.equal(opps(db)[0].etapa, "proposta_enviada");
  assert.equal(db.tabelas.lembretes.find((l: any) => l.texto === `Follow-up da proposta ${numero}`).status, "cancelado");
  const c = await criar(db);
  assert.equal((await situacao(db, c.body.data.id, { para: "cancelada" })).status, 200);
});
await caso("aceita/recusada quando a oportunidade aberta é de OUTRO vendedor: proposta muda, Funil não é tocado, com aviso", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  opps(db)[0].vendedor_id = V2;
  const r = await situacao(db, id, { para: "aceita" });
  assert.equal(r.status, 200);
  assert.match(r.body.aviso, /outro vendedor/);
  assert.equal(opps(db)[0].etapa, "proposta_enviada");
});

await caso("editar rascunho: no lugar (sem revisão), com validação de percentual e de contato", async () => {
  const db = novoDb();
  const c = await criar(db);
  const id = c.body.data.id;
  const upd = (corpo: Record<string, unknown>, usuario = "u-v") => chamar(db, usuario, rotaId.PATCH, { metodo: "PATCH", id, corpo });
  const ok = await upd({ updated_at: proposta(db, id).updated_at, validade_dias: 30, conteudo: { cliente_cnpj: "11", condicoes: { taxa_sem_reposicao_pct: 40 } }, contato_id: CT });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(proposta(db, id).revisao_atual, 0);
  assert.equal(proposta(db, id).validade_dias, 30);
  assert.equal(proposta(db, id).conteudo.condicoes.taxa_sem_reposicao_pct, 40);
  assert.equal(proposta(db, id).aos_cuidados, "Ana Contato");
  assert.equal(db.tabelas.proposta_revisoes.length, 0);
  assert.equal((await upd({ updated_at: proposta(db, id).updated_at, conteudo: { condicoes: { taxa_cancelamento_pct: "" } } })).status, 400);
  assert.equal((await upd({ updated_at: proposta(db, id).updated_at, contato_id: CT_FORA })).status, 400);
  assert.equal((await upd({ updated_at: "2000-01-01T00:00:00.000Z", validade_dias: 20 })).status, 409, "versão velha");
  assert.equal(proposta(db, id).validade_dias, 30);
  assert.equal(proposta(db, id).cliente_nome, "Empresa X", "cliente não é editável pelo corpo");
  const forjar = await upd({ updated_at: proposta(db, id).updated_at, cliente_nome: "X", numero: "RS-1/26", vendedor_id: V2, situacao: "aceita" });
  assert.equal(forjar.status, 200);
  assert.deepEqual({ n: proposta(db, id).numero, v: proposta(db, id).vendedor_id, s: proposta(db, id).situacao, c: proposta(db, id).cliente_nome }, { n: c.body.data.numero, v: V, s: "rascunho", c: "Empresa X" });
});
await caso("editar proposta enviada: cria Rev. 1 (mesmo número), Rev. 0 fica idêntica, validade recomeça de hoje", async () => {
  const db = novoDb();
  const { id, numero } = await enviar(db);
  const rev0Antes = structuredClone(db.tabelas.proposta_revisoes[0]);
  proposta(db, id).validade_ate = "2026-10-21"; // ainda válida, mas perto de vencer
  const r = await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, validade_dias: 20, conteudo: { condicoes: { taxa_sem_reposicao_pct: 40 } } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = proposta(db, id);
  assert.equal(p.numero, numero);
  assert.equal(p.revisao_atual, 1);
  assert.equal(p.situacao, "enviada");
  assert.equal(p.validade_ate, calcularValidadeAte(HOJE, 20));
  assert.equal(db.tabelas.proposta_revisoes.length, 2);
  assert.deepEqual(db.tabelas.proposta_revisoes[0], rev0Antes, "Rev. 0 intacta");
  const rev1 = db.tabelas.proposta_revisoes[1];
  assert.equal(rev1.revisao, 1);
  assert.equal(rev1.conteudo.condicoes.taxa_sem_reposicao_pct, 40);
  assert.equal(db.tabelas.proposta_revisoes[0].conteudo.condicoes.taxa_sem_reposicao_pct, 45);
  assert.equal(rev1.conteudo.numero, numero);
  assert.ok(db.tabelas.proposta_historico.some((h: any) => /Revisão 1 emitida/.test(h.observacao)));
  // Duas edições seguidas com a MESMA versão: a segunda perde (409) e não cria Rev. 2.
  const velha = await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: "2000-01-01T00:00:00.000Z", validade_dias: 10 } });
  assert.equal(velha.status, 409);
  assert.equal(db.tabelas.proposta_revisoes.length, 2);
});
await caso("conteúdo novo (API): criar com introdução e cláusulas grava no conteudo; editar rascunho no lugar; enviada gera Rev. 1 com o snapshot novo e Rev. 0 intacta", async () => {
  const db = novoDb();
  const conteudo = { texto_introdutorio: "Olá!", clausulas_adicionais: ["Primeira", "Segunda"] };
  const c = await criar(db, { conteudo });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const id = c.body.data.id;
  assert.deepEqual(proposta(db, id).conteudo.clausulas_adicionais, ["Primeira", "Segunda"]);
  assert.equal(proposta(db, id).conteudo.texto_introdutorio, "Olá!");
  const upd = (corpo: Record<string, unknown>) => chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo });
  const r1 = await upd({ updated_at: proposta(db, id).updated_at, conteudo: { ...conteudo, clausulas_adicionais: ["Segunda", "Primeira", "Terceira"] } });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.deepEqual(proposta(db, id).conteudo.clausulas_adicionais, ["Segunda", "Primeira", "Terceira"], "ordem escolhida");
  assert.equal(db.tabelas.proposta_revisoes.length, 0, "rascunho não gera revisão");
  const e = await situacao(db, id, { para: "enviada", valor_estimado: 5000 });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  const rev0 = structuredClone(db.tabelas.proposta_revisoes[0]);
  assert.deepEqual(rev0.conteudo.clausulas_adicionais, ["Segunda", "Primeira", "Terceira"]);
  assert.equal(rev0.conteudo.texto_introdutorio, "Olá!");
  assert.equal(rev0.template_versao, TEMPLATE_VERSAO_ATUAL);
  const r2 = await upd({ updated_at: proposta(db, id).updated_at, conteudo: { texto_introdutorio: "", clausulas_adicionais: ["Só esta"] } });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.deepEqual(db.tabelas.proposta_revisoes[0], rev0, "Rev. 0 intacta");
  assert.deepEqual(db.tabelas.proposta_revisoes[1].conteudo.clausulas_adicionais, ["Só esta"]);
  assert.equal(db.tabelas.proposta_revisoes[1].conteudo.texto_introdutorio, TEXTO_INTRODUTORIO_PADRAO_RS, "vazio → padrão no snapshot");
});
await caso("conteúdo novo (API): 11 cláusulas, 601 caracteres, introdução >1000, cláusula vazia/só emoji → 400 e nada grava; proposta aceita/recusada não edita", async () => {
  const db = novoDb();
  for (const conteudo of [
    { clausulas_adicionais: Array(11).fill("x") }, { clausulas_adicionais: ["x".repeat(601)] }, { texto_introdutorio: "x".repeat(1001) },
    { clausulas_adicionais: [""] }, { clausulas_adicionais: ["😀"] }, { texto_introdutorio: "😀" },
  ]) assert.equal((await criar(db, { conteudo })).status, 400, JSON.stringify(conteudo).slice(0, 60));
  assert.equal(db.tabelas.propostas.length, 0);
  const { id } = await enviar(db);
  await situacao(db, id, { para: "aceita" });
  const r = await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, conteudo: { clausulas_adicionais: ["x"] } } });
  assert.equal(r.status, 409);
  assert.deepEqual(proposta(db, id).conteudo.clausulas_adicionais ?? [], []);
});
await caso("editar: falha ao gravar a revisão → proposta volta ao estado anterior (sem revisão pela metade)", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  const antes = structuredClone(proposta(db, id));
  db.falhas["proposta_revisoes.insert"] = "boom";
  const r = await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: antes.updated_at, validade_dias: 40, conteudo: { condicoes: { taxa_sem_reposicao_pct: 10 } } } });
  assert.equal(r.status, 500);
  const p = proposta(db, id);
  assert.deepEqual({ rev: p.revisao_atual, dias: p.validade_dias, ate: p.validade_ate, c: p.conteudo }, { rev: 0, dias: antes.validade_dias, ate: antes.validade_ate, c: antes.conteudo });
});
await caso("editar: proposta aceita/recusada/vencida/cancelada → 409 (não edita mais)", async () => {
  for (const final of ["aceita", "recusada", "vencida", "cancelada"]) {
    const db = novoDb();
    const c = await criar(db);
    proposta(db, c.body.data.id).situacao = final;
    const r = await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id: c.body.data.id, corpo: { updated_at: proposta(db, c.body.data.id).updated_at, validade_dias: 5 } });
    assert.equal(r.status, 409, final);
  }
});

await caso("vencimento: a listagem vence enviada/em negociação expiradas (sem cron), 1x só, com histórico sem autor e follow-up cancelado", async () => {
  const db = novoDb();
  const a = await enviar(db);
  const b = await enviar(db, 100, { empresa_visitada_id: EMP });
  // b: outra empresa não existe no seed; reaproveita a EMP (oportunidade do mesmo vendedor já aberta)
  proposta(db, a.id).validade_ate = calcularValidadeAte(HOJE, -1);
  proposta(db, b.id).situacao = "em_negociacao";
  proposta(db, b.id).validade_ate = calcularValidadeAte(HOJE, -3);
  const rascunho = await criar(db);
  const aceita = await criar(db);
  proposta(db, aceita.body.data.id).situacao = "aceita";
  proposta(db, aceita.body.data.id).validade_ate = "2000-01-01";
  const l1 = await chamar(db, "u-v", rotaLista.GET);
  assert.equal(l1.status, 200);
  assert.equal(proposta(db, a.id).situacao, "vencida");
  assert.equal(proposta(db, b.id).situacao, "vencida");
  assert.equal(proposta(db, rascunho.body.data.id).situacao, "rascunho");
  assert.equal(proposta(db, aceita.body.data.id).situacao, "aceita");
  const h1 = db.tabelas.proposta_historico.filter((h: any) => h.para === "vencida");
  assert.equal(h1.length, 2);
  assert.ok(h1.every((h: any) => h.autor_id === null && h.observacao === "Validade expirada."));
  assert.equal(db.tabelas.lembretes.find((l: any) => l.texto === `Follow-up da proposta ${a.numero}`).status, "cancelado");
  const snapshot = structuredClone(db.tabelas.propostas);
  await chamar(db, "u-v", rotaLista.GET);
  await detalhe(db, a.id);
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "vencida").length, 2, "idempotente");
  assert.deepEqual(db.tabelas.propostas.map((p: any) => p.situacao), snapshot.map((p: any) => p.situacao));
  assert.equal(opps(db)[0].etapa, "proposta_enviada", "vencer não mexe no Funil");
});
await caso("vencimento: o detalhe também varre; no último dia de validade ainda está válida; depois de vencida não aceita 'aceita' (409)", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  proposta(db, id).validade_ate = HOJE;
  assert.equal((await detalhe(db, id)).body.data.situacao, "enviada");
  proposta(db, id).validade_ate = calcularValidadeAte(HOJE, -1);
  const d = await detalhe(db, id);
  assert.equal(d.body.data.situacao, "vencida");
  assert.equal((await situacao(db, id, { para: "aceita" })).status, 409);
});

await caso("acesso: outro vendedor recebe 404 (GET, PATCH, situação, PDF); gestor lê (somenteLeitura) mas escreve → 403", async () => {
  const db = novoDb();
  const c = await criar(db);
  const id = c.body.data.id;
  assert.equal((await detalhe(db, id, "u-v2")).status, 404);
  assert.equal((await chamar(db, "u-v2", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, validade_dias: 9 } })).status, 404);
  assert.equal((await situacao(db, id, { para: "cancelada" }, "u-v2")).status, 404);
  assert.equal((await chamar(db, "u-v2", rotaPdf.GET, { id })).status, 404);
  assert.equal(proposta(db, id).situacao, "rascunho");
  assert.equal(proposta(db, id).validade_dias, 15);
  const g = await detalhe(db, id, "u-dir");
  assert.equal(g.status, 200);
  assert.equal(g.body.somenteLeitura, true);
  assert.equal(g.body.podeEditar, false);
  assert.equal((await chamar(db, "u-dir", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at } })).status, 403);
  assert.equal((await situacao(db, id, { para: "cancelada" }, "u-dir")).status, 403);
  assert.equal((await detalhe(db, "inexistente")).status, 404);
});
await caso("listagem: vendedor só vê as próprias; gestor vê todas e filtra por situação/vendedor; sem login 401", async () => {
  const db = novoDb();
  await criar(db);
  await criar(db, {}, "u-v2");
  const minha = await chamar(db, "u-v", rotaLista.GET);
  assert.equal(minha.body.data.length, 1);
  assert.equal(minha.body.data[0].vendedor_nome, "Vendedor");
  assert.equal(minha.body.somenteLeitura, false);
  const todas = await chamar(db, "u-dir", rotaLista.GET);
  assert.equal(todas.body.data.length, 2);
  assert.equal(todas.body.somenteLeitura, true);
  assert.equal((await chamar(db, "u-dir", rotaLista.GET, { url: `http://x/api?vendedor=${V2}` })).body.data.length, 1);
  assert.equal((await chamar(db, "u-dir", rotaLista.GET, { url: "http://x/api?situacao=aceita" })).body.data.length, 0);
  assert.equal((await chamar(db, null, rotaLista.GET)).status, 401);
});
await caso("painel: gestor vê totais por situação/modelo/vendedor, valor em aberto e propostas vencendo em 7 dias; vendedor → 403", async () => {
  const db = novoDb();
  await criar(db);
  const a = await enviar(db, 800);
  const b = await enviar(db, 200);
  proposta(db, a.id).validade_ate = calcularValidadeAte(HOJE, 5);
  proposta(db, b.id).validade_ate = calcularValidadeAte(HOJE, 30);
  const r = await chamar(db, "u-dir", rotaPainel.GET);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 3);
  assert.deepEqual(r.body.por_situacao, { rascunho: 1, enviada: 2 });
  assert.deepEqual(r.body.por_modelo, { RS: 3 });
  assert.equal(r.body.valor_em_aberto, 1000);
  assert.equal(r.body.por_vendedor[0].vendedor_nome, "Vendedor");
  assert.equal(r.body.por_vendedor[0].valor_aberto, 1000);
  assert.deepEqual(r.body.vencendo_em_7_dias.map((v: any) => v.numero), [a.numero]);
  assert.equal(r.body.vencendo_em_7_dias[0].vendedor_nome, "Vendedor");
  assert.equal((await chamar(db, "u-v", rotaPainel.GET)).status, 403);
});
await caso("PDF (rota): rascunho usa o conteúdo atual; Rev. 0 e Rev. 1 saem dos snapshots; rev inexistente 404; rev inválida 400", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  const pdf = (rev?: string) => chamar(db, "u-v", rotaPdf.GET, { id, url: `http://x/api${rev === undefined ? "" : `?rev=${rev}`}` });
  const atual = await pdf();
  assert.equal(atual.status, 200);
  assert.equal(new TextDecoder().decode((atual.body as Uint8Array).slice(0, 5)), "%PDF-");
  assert.equal((await pdf("0")).status, 200);
  assert.equal((await pdf("7")).status, 404);
  assert.equal((await pdf("abc")).status, 400);
  assert.equal((await pdf("-1")).status, 400);
  await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, conteudo: { condicoes: { taxa_sem_reposicao_pct: 40 } } } });
  assert.equal((await pdf("1")).status, 200);
  const r = await criar(db, {});
  assert.equal((await chamar(db, "u-v", rotaPdf.GET, { id: r.body.data.id })).status, 200, "rascunho gera PDF do conteúdo atual");
});
await caso("imutabilidade e permanência: nenhum update/delete em proposta_revisoes/proposta_historico e nenhum delete em propostas, em todo o teste de API", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  await chamar(db, "u-v", rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, validade_dias: 25 } });
  await situacao(db, id, { para: "em_negociacao" });
  await situacao(db, id, { para: "aceita" });
  const c2 = await criar(db);
  await situacao(db, c2.body.data.id, { para: "cancelada" });
  proposta(db, id).validade_ate = "2000-01-01";
  await chamar(db, "u-v", rotaLista.GET);
  for (const q of db.consultas) {
    if (IMUTAVEIS.includes(q.tabela)) assert.ok(q.op === "insert" || q.op === "select", `${q.tabela}.${q.op}`);
    if (q.tabela === "propostas") assert.ok(q.op !== "delete", "propostas.delete");
  }
  assert.ok(db.consultas.some((q: any) => q.tabela === "proposta_revisoes" && q.op === "insert"));
  assert.ok(db.consultas.some((q: any) => q.tabela === "proposta_historico" && q.op === "insert"));
  assert.equal(db.tabelas.propostas.length, 2);
});


// ═══════════════════ Acesso liberado individualmente (usuario_acesso_customizado, chave comercial_propostas) ═══════════════════

const CHAVE_ABA = "comercial_propostas";
const MSG_SEM_ACESSO = "Você não tem acesso a Propostas.";
const MSG_SO_ACOMPANHA = "Seu perfil só acompanha as propostas, não cria.";
const liberar = (db: any, analista: string, liberado: boolean) => db.tabelas.usuario_acesso_customizado.push({ analista_perfil_id: analista, chave_aba: CHAVE_ABA, liberado });
const TABELAS_FUNIL = ["oportunidades", "oportunidade_interacoes", "lembretes"];
const consultasFunil = (db: any) => db.consultas.filter((q: any) => TABELAS_FUNIL.includes(q.tabela));
const estadoFunil = (db: any) => structuredClone({ o: db.tabelas.oportunidades, i: db.tabelas.oportunidade_interacoes, l: db.tabelas.lembretes });
const MOTIVO = { motivo_perda_categoria: "outro", motivo_perda: "Fechou com outra empresa" };
const patchProposta = (db: any, id: string, usuario: string, corpo: Record<string, unknown>) =>
  chamar(db, usuario, rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, ...corpo } });

await caso("abasConfig: chave comercial_propostas ('Propostas', grupo 'Comercial')", () => {
  const aba = ABAS_POR_CHAVE.get(CHAVE_ABA);
  assert.ok(aba);
  assert.equal(aba!.rotulo, "Propostas");
  assert.equal(aba!.grupo, "Comercial");
});

await caso("(a) só liberado=true (sem perfil_comercial) cria, edita e envia as próprias", async () => {
  const db = novoDb();
  liberar(db, LIB, true);
  const c = await criar(db, { contato_id: CT }, "u-lib");
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const id = c.body.data.id as string;
  assert.equal(c.body.data.vendedor_id, LIB);
  assert.equal(c.body.data.unidade_id, U);
  assert.equal(c.body.aviso, null);
  const ed = await patchProposta(db, id, "u-lib", { validade_dias: 20 });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(proposta(db, id).validade_dias, 20);
  const env = await situacao(db, id, { para: "enviada", valor_estimado: 7000 }, "u-lib");
  assert.equal(env.status, 200, JSON.stringify(env.body));
  const p = proposta(db, id);
  assert.equal(p.situacao, "enviada");
  assert.equal(Number(p.valor_estimado), 7000);
  assert.equal(p.validade_ate, calcularValidadeAte(HOJE, 20));
  assert.deepEqual(db.tabelas.proposta_revisoes.filter((r: any) => r.proposta_id === id).map((r: any) => r.revisao), [0]);
  assert.ok(db.tabelas.proposta_historico.some((h: any) => h.proposta_id === id && h.de === "rascunho" && h.para === "enviada" && h.autor_id === LIB));
  const rev1 = await patchProposta(db, id, "u-lib", { validade_dias: 30 });
  assert.equal(rev1.status, 200, JSON.stringify(rev1.body));
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.equal((await situacao(db, id, { para: "em_negociacao" }, "u-lib")).status, 200);
  assert.equal((await situacao(db, id, { para: "aceita" }, "u-lib")).status, 200);
  const d = await detalhe(db, id, "u-lib");
  assert.equal(d.status, 200);
  assert.equal(d.body.temFunil, false);
  assert.equal(d.body.somenteLeitura, false);
});

await caso("(b) quem só tem a liberação gera ZERO consulta/escrita no Funil em todas as situações, sem 409/aviso de oportunidade alheia e com oportunidade_id nulo", async () => {
  const db = novoDb();
  liberar(db, LIB, true);
  db.tabelas.oportunidades.push(SEMENTE_OPP({ vendedor_id: V2, etapa: "contato_feito" }));
  db.tabelas.lembretes.push({ id: crypto.randomUUID(), vendedor_id: V2, oportunidade_id: db.tabelas.oportunidades[0].id, tipo: "retorno", status: "pendente", texto: "Ligar", data_lembrete: "2030-01-10" });
  const antes = estadoFunil(db);
  db.consultas.length = 0;

  const c1 = await criar(db, {}, "u-lib");
  assert.equal(c1.status, 201); assert.equal(c1.body.aviso, null, "sem aviso de oportunidade de outro vendedor");
  const id1 = c1.body.data.id as string;
  const e1 = await situacao(db, id1, { para: "enviada", valor_estimado: 3000 }, "u-lib");
  assert.equal(e1.status, 200, "sem 409 do Funil: " + JSON.stringify(e1.body)); assert.equal(e1.body.aviso, null);
  assert.equal((await situacao(db, id1, { para: "em_negociacao" }, "u-lib")).status, 200);
  const ac = await situacao(db, id1, { para: "aceita" }, "u-lib");
  assert.equal(ac.status, 200); assert.equal(ac.body.aviso, null);
  const id2 = (await criar(db, {}, "u-lib")).body.data.id as string;
  assert.equal((await situacao(db, id2, { para: "enviada", valor_estimado: 100 }, "u-lib")).status, 200);
  const rec = await situacao(db, id2, { para: "recusada", ...MOTIVO }, "u-lib");
  assert.equal(rec.status, 200, JSON.stringify(rec.body)); assert.equal(rec.body.aviso, null);
  const id3 = (await criar(db, {}, "u-lib")).body.data.id as string;
  assert.equal((await situacao(db, id3, { para: "cancelada" }, "u-lib")).status, 200);
  const id4 = (await criar(db, {}, "u-lib")).body.data.id as string;
  assert.equal((await situacao(db, id4, { para: "enviada", valor_estimado: 50 }, "u-lib")).status, 200);
  assert.equal((await situacao(db, id4, { para: "cancelada" }, "u-lib")).status, 200);

  assert.deepEqual(consultasFunil(db), [], "nenhuma consulta (nem leitura) em oportunidades, interações ou lembretes");
  assert.deepEqual(estadoFunil(db), antes, "Funil intacto");
  for (const id of [id1, id2, id3, id4]) assert.equal(proposta(db, id).oportunidade_id, null);
  assert.deepEqual(["aceita", "recusada", "cancelada", "cancelada"], [id1, id2, id3, id4].map((id) => proposta(db, id).situacao));
});

await caso("(c) com perfil_comercial tudo igual (+3 dias úteis, aceita→ganho, recusada→perdido+reconectar, 409), mesmo se também estiver liberado", async () => {
  const db = novoDb();
  liberar(db, V, true);
  const { id, r, numero } = await enviar(db);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(opps(db).length, 1);
  assert.equal(opps(db)[0].etapa, "proposta_enviada");
  assert.equal(proposta(db, id).oportunidade_id, opps(db)[0].id);
  const lemb = db.tabelas.lembretes.find((l: any) => l.oportunidade_id === opps(db)[0].id && l.tipo === "retorno");
  assert.ok(lemb && lemb.status === "pendente");
  assert.equal(lemb.data_lembrete, somarDiasUteis(HOJE, 3));
  assert.equal(lemb.texto, textoFollowUp(numero));
  assert.equal((await detalhe(db, id)).body.temFunil, true);
  assert.equal((await situacao(db, id, { para: "aceita" })).status, 200);
  assert.equal(opps(db)[0].etapa, "ganho");
  assert.equal(db.tabelas.lembretes.find((l: any) => l.id === lemb.id).status, "cancelado");
  const seg = await enviar(db, 800);
  assert.equal(seg.r.status, 200);
  const nova = opps(db).find((o: any) => o.etapa === "proposta_enviada");
  assert.ok(nova && nova.id !== opps(db)[0].id);
  assert.equal((await situacao(db, seg.id, { para: "recusada", ...MOTIVO })).status, 200);
  assert.equal(opps(db).find((o: any) => o.id === nova.id).etapa, "perdido");
  assert.ok(db.tabelas.lembretes.some((l: any) => l.oportunidade_id === nova.id && l.tipo === "reconectar" && l.status === "pendente"));
  const db2 = novoDb();
  db2.tabelas.oportunidades.push(SEMENTE_OPP({ vendedor_id: V2 }));
  const c = await criar(db2, {});
  const r2 = await situacao(db2, c.body.data.id, { para: "enviada", valor_estimado: 10 });
  assert.equal(r2.status, 409);
  assert.equal(proposta(db2, c.body.data.id).situacao, "rascunho");
});

await caso("(d) sem nenhuma liberação nem perfil: 403 'Você não tem acesso a Propostas.' em todas as rotas; sem login 401", async () => {
  const db = novoDb();
  const id = (await criar(db, {})).body.data.id as string;
  const chamadas: [string, (u: string | null) => Promise<Chamada>][] = [
    ["lista GET", (u) => chamar(db, u, rotaLista.GET)],
    ["lista POST", (u) => chamar(db, u, rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })],
    ["detalhe GET", (u) => chamar(db, u, rotaId.GET, { id })],
    ["detalhe PATCH", (u) => chamar(db, u, rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: "x" } })],
    ["situação POST", (u) => chamar(db, u, rotaSit.POST, { metodo: "POST", id, corpo: { para: "cancelada" } })],
    ["pdf GET", (u) => chamar(db, u, rotaPdf.GET, { id })],
    ["painel GET", (u) => chamar(db, u, rotaPainel.GET)],
    ["empresas GET", (u) => chamar(db, u, rotaEmpresas.GET)],
    ["contatos GET", (u) => chamar(db, u, rotaEmpresaContatos.GET, { id: EMP })],
  ];
  for (const [nome, rodar] of chamadas) {
    const r = await rodar("u-sem");
    assert.equal(r.status, 403, `${nome}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error, MSG_SEM_ACESSO, nome);
    assert.equal((await rodar(null)).status, 401, `${nome} sem login`);
  }
  assert.equal(proposta(db, id).situacao, "rascunho", "nada foi alterado");
  globalThis.__DB__ = db;
  assert.equal(await podeAcessarPropostas({ id: "u-sem", app_metadata: { role: "analista" } } as any), false);
});

await caso("(e) liberado=false bloqueia até quem tem perfil_comercial e o gestor; padrão ≡ podeAcessarAba nos 3 estados", async () => {
  const db = novoDb();
  const id = (await criar(db, {})).body.data.id as string;
  liberar(db, V, false);
  liberar(db, DIRB, false);
  for (const [nome, r] of [
    ["lista", await chamar(db, "u-v", rotaLista.GET)],
    ["criar", await criar(db, {}, "u-v")],
    ["detalhe da própria", await detalhe(db, id, "u-v")],
    ["situação da própria", await situacao(db, id, { para: "cancelada" }, "u-v")],
    ["pdf da própria", await chamar(db, "u-v", rotaPdf.GET, { id })],
    ["gestor bloqueado: lista", await chamar(db, "u-dirb", rotaLista.GET)],
    ["gestor bloqueado: painel", await chamar(db, "u-dirb", rotaPainel.GET)],
  ] as [string, Chamada][]) {
    assert.equal(r.status, 403, `${nome}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error, MSG_SEM_ACESSO, nome);
  }
  assert.equal(proposta(db, id).situacao, "rascunho");
  assert.equal((await chamar(db, "u-dir", rotaPainel.GET)).status, 200, "gestor sem exceção continua com acesso");
  liberar(db, LIB, true);
  globalThis.__DB__ = db;
  const quem = (uid: string, role = "analista") => ({ id: uid, app_metadata: { role } }) as any;
  // [usuário, papel, acessa (resultado final), padrão do papel (perfil_comercial OU gestor)]
  const esperado: [string, string, boolean, boolean][] = [
    ["u-v", "analista", false, true], ["u-v2", "analista", true, true], ["u-lib", "analista", true, false], ["u-sem", "analista", false, false],
    ["u-dir", "diretoria", true, true], ["u-dirb", "diretoria", false, true],
  ];
  for (const [uid, role, acessa, padrao] of esperado) {
    const u = quem(uid, role);
    assert.equal(await podeAcessarPropostas(u), acessa, `podeAcessarPropostas ${uid}`);
    assert.equal(await podeAcessarAba(u, CHAVE_ABA, padrao), acessa, `podeAcessarAba ${uid} (mesma conta)`);
  }
});

await caso("(f) gestor sem liberação lê tudo e escreve 403; gestor com liberado=true cria e edita só as próprias e continua vendo tudo", async () => {
  const db = novoDb();
  const idV = (await criar(db, {})).body.data.id as string;
  const lista = await chamar(db, "u-dir", rotaLista.GET);
  assert.equal(lista.status, 200);
  assert.equal(lista.body.somenteLeitura, true);
  assert.ok(lista.body.data.some((p: any) => p.id === idV));
  const det = await detalhe(db, idV, "u-dir");
  assert.equal(det.status, 200); assert.equal(det.body.somenteLeitura, true); assert.equal(det.body.podeEditar, false); assert.equal(det.body.temFunil, false);
  const nova = await criar(db, {}, "u-dir");
  assert.equal(nova.status, 403); assert.equal(nova.body.error, MSG_SO_ACOMPANHA);
  assert.equal((await patchProposta(db, idV, "u-dir", { validade_dias: 30 })).status, 403);
  assert.equal((await situacao(db, idV, { para: "cancelada" }, "u-dir")).status, 403);
  assert.equal((await chamar(db, "u-dir", rotaEmpresas.GET)).status, 403, "leitor não busca empresas");
  assert.equal((await chamar(db, "u-dir", rotaPainel.GET)).status, 200);

  liberar(db, DIRL, true);
  const propria = await criar(db, {}, "u-dirl");
  assert.equal(propria.status, 201, JSON.stringify(propria.body));
  const idL = propria.body.data.id as string;
  assert.equal(propria.body.data.vendedor_id, DIRL);
  assert.equal((await patchProposta(db, idL, "u-dirl", { validade_dias: 22 })).status, 200);
  const listaL = await chamar(db, "u-dirl", rotaLista.GET);
  assert.equal(listaL.body.somenteLeitura, false);
  assert.deepEqual(new Set(listaL.body.data.map((p: any) => p.id)), new Set([idV, idL]), "continua vendo tudo");
  const alheia = await detalhe(db, idV, "u-dirl");
  assert.equal(alheia.status, 200); assert.equal(alheia.body.somenteLeitura, true);
  assert.equal((await patchProposta(db, idV, "u-dirl", { validade_dias: 30 })).status, 403, "não edita a de outro");
  assert.equal((await situacao(db, idV, { para: "cancelada" }, "u-dirl")).status, 403);
  db.consultas.length = 0;
  assert.equal((await situacao(db, idL, { para: "enviada", valor_estimado: 900 }, "u-dirl")).status, 200);
  assert.deepEqual(consultasFunil(db), [], "gestor liberado também não tem Funil");
  assert.equal((await chamar(db, "u-dirl", rotaPainel.GET)).status, 200);
});

await caso("(f2) filtro de vendedor do gestor lista quem pode escrever: perfil_comercial ou liberado=true, ativo, sem bloqueio", async () => {
  const db = novoDb();
  liberar(db, LIB, true); liberar(db, DIRL, true); liberar(db, V2, false); liberar(db, INA, true);
  globalThis.__DB__ = db;
  const { createServiceClient } = await import("@/lib/supabase/server");
  const lista = await listarQuemPodeEscreverPropostas(createServiceClient(), { unidadeId: U, todasUnidades: true });
  assert.deepEqual(new Set(lista.map((x) => x.id)), new Set([V, LIB, DIRL]));
  assert.ok(!lista.some((x) => x.id === V2), "bloqueado fora");
  assert.ok(!lista.some((x) => x.id === INA), "inativo fora");
  assert.ok(!lista.some((x) => x.id === SEM || x.id === PERDEU || x.id === DIR), "sem permissão de escrita fora");
});

await caso("(g) analista inativo (mesmo com perfil_comercial e liberado=true): 403 e sem acesso", async () => {
  const db = novoDb();
  liberar(db, INA, true);
  const r = await chamar(db, "u-ina", rotaLista.GET);
  assert.equal(r.status, 403); assert.equal(r.body.error, MSG_SEM_ACESSO);
  assert.equal((await criar(db, {}, "u-ina")).status, 403);
  globalThis.__DB__ = db;
  assert.equal(await podeAcessarPropostas({ id: "u-ina", app_metadata: { role: "analista" } } as any), false);
});

await caso("(h) proposta de outro vendedor: vendedor e usuário liberado recebem 404 em GET, PATCH, situação e PDF", async () => {
  const db = novoDb();
  liberar(db, LIB, true);
  const id = (await criar(db, {})).body.data.id as string;
  for (const u of ["u-v2", "u-lib"]) {
    assert.equal((await detalhe(db, id, u)).status, 404, `${u} GET`);
    assert.equal((await chamar(db, u, rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, validade_dias: 30 } })).status, 404, `${u} PATCH`);
    assert.equal((await situacao(db, id, { para: "cancelada" }, u)).status, 404, `${u} situação`);
    assert.equal((await chamar(db, u, rotaPdf.GET, { id })).status, 404, `${u} PDF`);
    assert.ok(!(await chamar(db, u, rotaLista.GET)).body.data.some((p: any) => p.id === id), `${u} lista`);
  }
  assert.equal(proposta(db, id).situacao, "rascunho");
});

await caso("(i) rotas de empresas: só id, nome e contatos da unidade; oportunidade_aberta só para quem tem Funil", async () => {
  const db = novoDb({
    empresa_contatos: [
      { id: CT, nome: "Ana Contato", cargo: "RH", telefone: "(19) 1111-1111", email: "ana@x.com", principal: true, empresa_visitada_id: EMP },
      { id: CT_FORA, nome: "Fora", cargo: null, telefone: null, email: null, principal: true, empresa_visitada_id: EMP_OUTRA_UNIDADE },
    ],
  });
  liberar(db, LIB, true); liberar(db, DIRL, true);
  db.tabelas.oportunidades.push(SEMENTE_OPP({ vendedor_id: V2, etapa: "reuniao_visita" }));
  const comFunil = await chamar(db, "u-v", rotaEmpresas.GET);
  assert.equal(comFunil.status, 200, JSON.stringify(comFunil.body));
  assert.deepEqual(comFunil.body.data.map((e: any) => e.id), [EMP], "só a Carteira da unidade");
  assert.deepEqual(Object.keys(comFunil.body.data[0]).sort(), ["contatos", "id", "nome", "oportunidade_aberta"]);
  assert.equal(comFunil.body.data[0].oportunidade_aberta.vendedor_nome, "Outro");
  assert.equal(comFunil.body.data[0].oportunidade_aberta.etapa, "reuniao_visita");
  assert.deepEqual(Object.keys(comFunil.body.data[0].contatos[0]).sort(), ["cargo", "id", "nome", "principal"], "sem telefone nem e-mail");

  db.consultas.length = 0;
  const semFunil = await chamar(db, "u-lib", rotaEmpresas.GET);
  assert.equal(semFunil.status, 200);
  assert.deepEqual(semFunil.body.data.map((e: any) => e.id), [EMP]);
  assert.deepEqual(Object.keys(semFunil.body.data[0]).sort(), ["contatos", "id", "nome"], "sem oportunidade_aberta");
  assert.deepEqual(Object.keys(semFunil.body.data[0].contatos[0]).sort(), ["cargo", "id", "nome", "principal"]);
  assert.equal(semFunil.body.data[0].contatos[0].nome, "Ana Contato");
  assert.ok(!JSON.stringify(semFunil.body).includes("Outro"), "nome do vendedor do Funil não vaza");
  assert.deepEqual(db.consultas.filter((q: any) => q.tabela === "oportunidades"), [], "nem lê oportunidades");

  assert.deepEqual((await chamar(db, "u-lib", rotaEmpresas.GET, { url: "http://x/api?q=EMPRES" })).body.data.map((e: any) => e.id), [EMP], "busca sem diferenciar maiúscula");
  assert.deepEqual((await chamar(db, "u-lib", rotaEmpresas.GET, { url: "http://x/api?q=zzz" })).body.data, []);
  assert.deepEqual((await chamar(db, "u-lib", rotaEmpresas.GET, { url: "http://x/api?q=%25" })).body.data, [], "% digitado é literal");
  assert.deepEqual((await chamar(db, "u-dirl", rotaEmpresas.GET)).body.data.map((e: any) => e.id), [EMP], "acesso a todas as unidades é ignorado: só a unidade do usuário");

  const ct = await chamar(db, "u-lib", rotaEmpresaContatos.GET, { id: EMP });
  assert.equal(ct.status, 200);
  assert.deepEqual(Object.keys(ct.body.data[0]).sort(), ["cargo", "id", "nome", "principal"]);
  assert.equal((await chamar(db, "u-lib", rotaEmpresaContatos.GET, { id: EMP_OUTRA_UNIDADE })).status, 404, "contatos de empresa de outra unidade");
  assert.equal((await chamar(db, "u-dir", rotaEmpresaContatos.GET, { id: EMP })).status, 403, "leitor");
  assert.equal((await chamar(db, "u-dir", rotaEmpresas.GET)).body.error, MSG_SO_ACOMPANHA);
  assert.equal((await chamar(db, "u-sem", rotaEmpresaContatos.GET, { id: EMP })).body.error, MSG_SEM_ACESSO);
  assert.equal((await chamar(db, "u-dirl", rotaEmpresaContatos.GET, { id: EMP_OUTRA_UNIDADE })).status, 404, "acesso a todas as unidades é ignorado nos contatos");
  assert.equal((await chamar(db, "u-dirl", rotaEmpresaContatos.GET, { id: EMP })).status, 200);
  db.tabelas.analistas_perfil.find((a: any) => a.id === LIB).unidade_id = null;
  assert.deepEqual((await chamar(db, "u-lib", rotaEmpresas.GET)).body.data, [], "sem unidade definida: lista vazia");
  assert.equal((await chamar(db, "u-lib", rotaEmpresaContatos.GET, { id: EMP })).status, 404, "sem unidade definida: 404");
});

await caso("(j) quem perdeu o perfil_comercial mas está liberado age sem Funil, mesmo em proposta antiga com oportunidade_id", async () => {
  const db = novoDb();
  liberar(db, PERDEU, true);
  const opp = SEMENTE_OPP({ vendedor_id: PERDEU, etapa: "proposta_enviada" });
  db.tabelas.oportunidades.push(opp);
  const id = (await criar(db, {}, "u-perdeu")).body.data.id as string;
  assert.equal(proposta(db, id).oportunidade_id, null);
  proposta(db, id).oportunidade_id = opp.id; // vínculo de quando ele ainda tinha Funil
  const lembrete = { id: crypto.randomUUID(), vendedor_id: PERDEU, oportunidade_id: opp.id, tipo: "retorno", status: "pendente", texto: textoFollowUp(proposta(db, id).numero), data_lembrete: "2030-01-10" };
  db.tabelas.lembretes.push(lembrete);
  const antes = estadoFunil(db);
  db.consultas.length = 0;
  assert.equal((await situacao(db, id, { para: "enviada", valor_estimado: 1200 }, "u-perdeu")).status, 200);
  assert.equal(proposta(db, id).oportunidade_id, opp.id, "o vínculo antigo não é sobrescrito");
  assert.equal((await situacao(db, id, { para: "aceita" }, "u-perdeu")).status, 200);
  assert.deepEqual(consultasFunil(db), []);
  assert.deepEqual(estadoFunil(db), antes, "oportunidade e lembrete intactos (o lembrete segue pendente)");
  assert.equal(db.tabelas.lembretes[0].status, "pendente");
});

await caso("(k) erro ao ler a exceção de acesso NEGA (403 em todas as rotas, vale para perfil_comercial e gestor) e o filtro do gestor falha vazio; podeAcessarAba segue no padrão", async () => {
  const db = novoDb();
  liberar(db, LIB, true);
  const id = (await criar(db, {})).body.data.id as string;
  db.falhas["usuario_acesso_customizado.select"] = "falha simulada na leitura";
  const rotas: [string, (u: string) => Promise<Chamada>][] = [
    ["lista GET", (u) => chamar(db, u, rotaLista.GET)],
    ["lista POST", (u) => chamar(db, u, rotaLista.POST, { metodo: "POST", corpo: { modelo: "RS", empresa_visitada_id: EMP } })],
    ["detalhe GET", (u) => chamar(db, u, rotaId.GET, { id })],
    ["detalhe PATCH", (u) => chamar(db, u, rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: "x" } })],
    ["situação POST", (u) => chamar(db, u, rotaSit.POST, { metodo: "POST", id, corpo: { para: "cancelada" } })],
    ["pdf GET", (u) => chamar(db, u, rotaPdf.GET, { id })],
    ["painel GET", (u) => chamar(db, u, rotaPainel.GET)],
    ["empresas GET", (u) => chamar(db, u, rotaEmpresas.GET)],
    ["contatos GET", (u) => chamar(db, u, rotaEmpresaContatos.GET, { id: EMP })],
  ];
  const erroEsperado = console.error;
  console.error = () => {};
  try {
    for (const usuario of ["u-v", "u-dir", "u-lib"]) {
      for (const [nome, rodar] of rotas) {
        const r = await rodar(usuario);
        assert.equal(r.status, 403, `${usuario} ${nome}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error, MSG_SEM_ACESSO, `${usuario} ${nome}`);
      }
    }
    globalThis.__DB__ = db;
    const { createServiceClient } = await import("@/lib/supabase/server");
    assert.deepEqual(await listarQuemPodeEscreverPropostas(createServiceClient(), { unidadeId: U, todasUnidades: true }), [], "filtro do gestor: falha segura (vazio)");
    assert.equal(await podeAcessarPropostas({ id: "u-v", app_metadata: { role: "analista" } } as any), false);
    // O podeAcessarAba que os outros módulos usam NÃO mudou: no erro continua caindo no padrão do papel.
    assert.equal(await podeAcessarAba({ id: "u-v", app_metadata: { role: "analista" } } as any, CHAVE_ABA, true), true);
    assert.equal(await podeAcessarAba({ id: "u-v", app_metadata: { role: "analista" } } as any, CHAVE_ABA, false), false);
  } finally { console.error = erroEsperado; }
  assert.equal(proposta(db, id).situacao, "rascunho", "nada foi alterado");
  delete db.falhas["usuario_acesso_customizado.select"];
  assert.equal((await chamar(db, "u-v", rotaLista.GET)).status, 200, "voltou ao normal sem o erro");
});

await caso("(l) fluxo simplificado: enviada → aceita/recusada/cancelada direto (sem passar por negociação); enviada → em_negociacao segue permitida na API", async () => {
  const db = novoDb();
  const a = await enviar(db);
  assert.equal((await situacao(db, a.id, { para: "aceita" })).status, 200);
  assert.equal(proposta(db, a.id).situacao, "aceita");
  assert.equal(opps(db)[0].etapa, "ganho", "Funil: proposta_enviada → ganho direto");
  assert.deepEqual(db.tabelas.proposta_historico.filter((h: any) => h.proposta_id === a.id).map((h: any) => `${h.de}>${h.para}`), ["null>rascunho", "rascunho>enviada", "enviada>aceita"]);

  const db2 = novoDb();
  const r = await enviar(db2);
  assert.equal((await situacao(db2, r.id, { para: "recusada", ...MOTIVO })).status, 200);
  assert.equal(proposta(db2, r.id).situacao, "recusada");
  assert.equal(opps(db2)[0].etapa, "perdido", "Funil: proposta_enviada → perdido direto");
  assert.ok(!db2.tabelas.proposta_historico.some((h: any) => h.para === "em_negociacao"));

  const db3 = novoDb();
  const c = await enviar(db3);
  assert.equal((await situacao(db3, c.id, { para: "cancelada" })).status, 200);
  assert.equal(proposta(db3, c.id).situacao, "cancelada");
  assert.equal(opps(db3)[0].etapa, "proposta_enviada", "cancelar não mexe no Funil");

  const db4 = novoDb();
  const n = await enviar(db4);
  assert.equal((await situacao(db4, n.id, { para: "em_negociacao" })).status, 200, "API ainda aceita (sem botão)");
});

await caso("(m) recusada SEM motivo (sem Funil): grava, histórico sem 'Motivo:' e sem quebrar; 'outro' sem texto continua 400; motivo informado continua gravado", async () => {
  const db = novoDb();
  liberar(db, LIB, true);
  const mk = async () => {
    const c = await criar(db, { contato_id: CT }, "u-lib");
    const id = c.body.data.id as string;
    assert.equal((await situacao(db, id, { para: "enviada", valor_estimado: 3000 }, "u-lib")).status, 200);
    return id;
  };
  const id1 = await mk();
  const r1 = await situacao(db, id1, { para: "recusada" }, "u-lib");
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(proposta(db, id1).situacao, "recusada");
  const h1 = db.tabelas.proposta_historico.find((h: any) => h.proposta_id === id1 && h.para === "recusada");
  assert.equal(h1.observacao, null);

  const id2 = await mk();
  assert.equal((await situacao(db, id2, { para: "recusada", motivo_perda_categoria: "outro" }, "u-lib")).status, 400);
  assert.equal(proposta(db, id2).situacao, "enviada");
  const r2 = await situacao(db, id2, { para: "recusada", observacao: "Cliente sumiu" }, "u-lib");
  assert.equal(r2.status, 200);
  assert.equal(db.tabelas.proposta_historico.find((h: any) => h.proposta_id === id2 && h.para === "recusada").observacao, "Cliente sumiu");

  const id3 = await mk();
  assert.equal((await situacao(db, id3, { para: "recusada", motivo_perda_categoria: "sem_retorno" }, "u-lib")).status, 200);
  assert.match(db.tabelas.proposta_historico.find((h: any) => h.proposta_id === id3 && h.para === "recusada").observacao, /Motivo: /);
  assert.equal(db.tabelas.oportunidades.length, 0, "sem Funil nada é criado");
});

await caso("(n) com Funil, recusada sem motivo e SEM oportunidade aberta (ou de outro vendedor) grava normalmente", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  db.tabelas.oportunidades[0].vendedor_id = V2;
  const r = await situacao(db, id, { para: "recusada" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).situacao, "recusada");
  assert.equal(opps(db)[0].etapa, "proposta_enviada", "oportunidade alheia não é tocada");
});

await caso("(o) legado: proposta já em em_negociacao aceita/recusa/cancela normalmente (Funil: negociacao → ganho/perdido); sem motivo ok sem Funil", async () => {
  for (const [para, extra, etapa] of [["aceita", {}, "ganho"], ["recusada", MOTIVO, "perdido"], ["cancelada", {}, "negociacao"]] as const) {
    const db = novoDb();
    const { id } = await enviar(db);
    assert.equal((await situacao(db, id, { para: "em_negociacao" })).status, 200);
    assert.equal(opps(db)[0].etapa, "negociacao");
    const r = await situacao(db, id, { para, ...extra });
    assert.equal(r.status, 200, `${para}: ${JSON.stringify(r.body)}`);
    assert.equal(proposta(db, id).situacao, para);
    assert.equal(opps(db)[0].etapa, etapa, para);
  }
  const db = novoDb();
  liberar(db, LIB, true);
  const c = await criar(db, { contato_id: CT }, "u-lib");
  const id = c.body.data.id as string;
  assert.equal((await situacao(db, id, { para: "enviada", valor_estimado: 1000 }, "u-lib")).status, 200);
  proposta(db, id).situacao = "em_negociacao";
  assert.equal((await situacao(db, id, { para: "recusada" }, "u-lib")).status, 200);
  assert.equal(proposta(db, id).situacao, "recusada");
  const d = await detalhe(db, id, "u-lib");
  assert.equal(d.status, 200);
});

await caso("(p) GET devolve oportunidadeAbertaPropria só com Funil + dono + oportunidade aberta DELE; nunca dado de outra pessoa; sem Funil zero consulta ao Funil", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  const d1 = await detalhe(db, id);
  assert.equal(d1.body.temFunil, true);
  assert.equal(d1.body.oportunidadeAbertaPropria, true, "oportunidade aberta do próprio vendedor");
  assert.ok(!/etapa_funil|proxima_acao|"etapa":"proposta_enviada"/.test(JSON.stringify(d1.body)), "nenhum campo da oportunidade na resposta (só o booleano)");

  db.tabelas.oportunidades[0].vendedor_id = V2;
  assert.equal((await detalhe(db, id)).body.oportunidadeAbertaPropria, false, "oportunidade aberta de OUTRO vendedor");
  assert.ok(!JSON.stringify((await detalhe(db, id)).body).includes(V2), "id do outro vendedor não vaza");

  db.tabelas.oportunidades[0].vendedor_id = V;
  db.tabelas.oportunidades[0].etapa = "ganho";
  assert.equal((await detalhe(db, id)).body.oportunidadeAbertaPropria, false, "oportunidade já fechada");
  db.tabelas.oportunidades[0].etapa = "proposta_enviada";

  const gestor = await detalhe(db, id, "u-dir");
  assert.equal(gestor.body.oportunidadeAbertaPropria, false, "gestor (não é o dono) não recebe");

  const rasc = (await criar(db, {})).body.data.id as string;
  assert.equal((await detalhe(db, rasc)).body.oportunidadeAbertaPropria, false, "rascunho: não há o que recusar");

  const dbl = novoDb();
  liberar(dbl, LIB, true);
  const c = await criar(dbl, { contato_id: CT }, "u-lib");
  const idl = c.body.data.id as string;
  assert.equal((await situacao(dbl, idl, { para: "enviada", valor_estimado: 1000 }, "u-lib")).status, 200);
  dbl.tabelas.oportunidades.push(SEMENTE_OPP({ vendedor_id: LIB, etapa: "contato_feito" }));
  dbl.consultas.length = 0;
  const dl = await detalhe(dbl, idl, "u-lib");
  assert.equal(dl.body.temFunil, false);
  assert.equal(dl.body.oportunidadeAbertaPropria, false);
  assert.deepEqual(consultasFunil(dbl), [], "sem Funil: nenhuma consulta ao Funil no GET");
});

await caso("(q) recusada: sem motivo e com oportunidade própria aberta → 400 do Funil com mensagem legível e NADA muda; com motivo passa (é o que a tela agora exige antes de enviar)", async () => {
  const db = novoDb();
  const { id } = await enviar(db);
  assert.equal((await detalhe(db, id)).body.oportunidadeAbertaPropria, true);
  const antes = JSON.stringify(opps(db));
  const r = await situacao(db, id, { para: "recusada" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Escolha o motivo de a oportunidade não ter avançado desta vez.");
  assert.equal(proposta(db, id).situacao, "enviada");
  assert.equal(JSON.stringify(opps(db)), antes);
  assert.equal((await situacao(db, id, { para: "recusada", motivo_perda_categoria: "sem_retorno" })).status, 200);
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${total} casos OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
