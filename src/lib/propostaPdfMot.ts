import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { BLACK, CW, DARK, LIGHT_GRAY, ML, YELLOW } from "@/lib/pdfWriter";
import { Escritor, carregarLogoCabecalho, carregarLogosClientes, desenharGradeClientes, formatarDataBr, quebrar, type OpcoesPdfProposta } from "@/lib/propostaPdf";
import { ASSINATURA_MOT, ITENS_FIXOS_MOT, QUANTIDADE_ITENS_FIXOS_MOT, SUBTITULO_MOT, TITULO_MOT, textoBaseCalculoMot, textoFaturamentoMot, type SnapshotMot } from "@/lib/propostaMot";
import { itensAdicionais } from "@/lib/propostaModelos";
import { formatarCentavosBRL, formatarPercentualBp } from "@/lib/propostaMotCalculo";
import { textoDesenhavel } from "@/lib/propostaTexto";
import { numeroComRevisao } from "@/lib/propostas";
import { ENDERECOS_RODAPE_PROPOSTA, PASTA_CABECALHO_PROPOSTA, PASTA_CLIENTES_PROPOSTA } from "@/lib/propostaAssets";

// PDF da proposta de Mão de Obra Temporária. MESMO visual do R&S (cabeçalho, marca d'água, marca TESTE, rodapé, fontes, cores, estilo de cláusulas,
// assinatura e grade de clientes): usa o Escritor do propostaPdf.ts, sempre com o layout novo (v2), sem olhar template_versao.
// O PDF sai só do snapshot da revisão (percentuais congelados): reabrir uma revisão antiga reproduz o mesmo documento.
//
// Ordem: página 1 (cabeçalho, dados, introdução, ORÇAMENTO, VALOR MENSAL) → cláusulas → validade → uma planilha de verbas
// por função (layout antigo) OU uma planilha única sobre a soma dos salários (layout "unica", propostas/revisões novas), sempre INTEIRA (nunca cortada; cabem 2 por página) → assinatura (bloco inteiro, nunca partido entre páginas) → grade de clientes. A tabela ORÇAMENTO pode atravessar páginas repetindo o cabeçalho.

const limpar = textoDesenhavel;
// Vermelho-escuro só nas linhas de taxa, encargos e retenções da planilha de verbas (como no Word); o resto segue as cores do R&S.
const VERMELHO = rgb(0.62, 0.05, 0.05);
const FUNDO_CLARO = rgb(0.96, 0.96, 0.96);

const TAM_TABELA = 9;
const ENTRELINHA = 11.5;
const RECUO = 4;
const COLUNAS_ORCAMENTO = [
  { rotulo: "ÁREA", w: 85 },
  { rotulo: "DESCRIÇÃO / Salário", w: 165 },
  { rotulo: "JORNADA", w: 130 },
  { rotulo: "HORÁRIO", w: CW - 85 - 165 - 130 },
];

// Planilha de verbas: rótulos do Word, só no PDF e por chave (o snapshot guarda os rótulos do sistema, que não mudam).
export const ROTULOS_VERBAS_PDF: Record<string, string> = {
  salario: "Salário",
  fgts: "FGTS",
  inss_patronal: "INSS",
  ferias: "Férias (ref. 1 mês)",
  terco_ferias: "1/3 sobre Férias",
  decimo_terceiro: "13º Salário (ref. 1 mês)",
  taxa_administrativa: "Taxa Administrativa",
  exames_admissionais: "Exames Admissionais",
  vale_transporte: "Vale Transporte",
  encargos_tributarios: "Encargos Tributários",
  subtotal: "SUB TOTAL",
  ret_iss: "ISS",
  ret_inss: "INSS",
  ret_ir: "IR",
  ret_cofins: "COFINS",
  ret_csll: "CSLL",
  ret_pis: "PIS",
};
// Linhas em vermelho (e com o percentual entre parênteses): taxa administrativa, encargos tributários e as seis retenções.
export const CHAVES_EM_VERMELHO = new Set(["taxa_administrativa", "encargos_tributarios", "ret_iss", "ret_inss", "ret_ir", "ret_cofins", "ret_csll", "ret_pis"]);
const CHAVES_EM_NEGRITO = new Set(["subtotal"]);

const ALTURA_LINHA_VERBAS = 14;
const ALTURA_FAIXA_TITULO = 36;
const TAM_INFO = 9.5;
const ALTURA_LINHA_INFO = 12.5;
export const PLANILHAS_POR_PAGINA = 2;

const brl = (centavos: number) => limpar(formatarCentavosBRL(centavos));

interface Linha {
  texto: string;
  font: PDFFont;
}

function celulaLinhas(texto: string, font: PDFFont, largura: number): Linha[] {
  return texto ? quebrar(texto, font, TAM_TABELA, largura - 2 * RECUO).map((t) => ({ texto: t, font })) : [];
}

// Altura da planilha de uma função (faixa de título + cabeçalho + linhas + total): é o que precisa caber INTEIRO na página.
export function alturaPlanilha(snap: { planilha: SnapshotMot["funcoes"][number]["planilha"] }, linhasInfo = 0): number {
  const linhas = snap.planilha.linhas.length + snap.planilha.retencoes.length + 1;
  return ALTURA_FAIXA_TITULO + linhasInfo * ALTURA_LINHA_INFO + (linhasInfo > 0 ? 4 : 0) + (1 + linhas) * ALTURA_LINHA_VERBAS + 12;
}

function desenharCabecalhoOrcamento(e: Escritor) {
  const altura = ENTRELINHA + 2 * RECUO;
  const topo = e.y;
  let x = ML;
  for (const col of COLUNAS_ORCAMENTO) {
    e.page.drawRectangle({ x, y: topo - altura, width: col.w, height: altura, color: YELLOW, borderColor: LIGHT_GRAY, borderWidth: 0.6 });
    e.page.drawText(limpar(col.rotulo), { x: x + RECUO, y: topo - RECUO - TAM_TABELA * 0.9, size: TAM_TABELA, font: e.bold, color: BLACK });
    x += col.w;
  }
  e.y = topo - altura;
}

function desenharLinhaOrcamento(e: Escritor, f: SnapshotMot["funcoes"][number]) {
  const [cArea, cDesc, cJornada, cHorario] = COLUNAS_ORCAMENTO;
  const descricao: Linha[] = [
    ...celulaLinhas(f.descricao ?? "", e.regular, cDesc.w),
    { texto: limpar(`Salário ${brl(f.salario_centavos)}`), font: e.bold },
  ];
  const celulas: Linha[][] = [celulaLinhas(f.area, e.regular, cArea.w), descricao, celulaLinhas(f.jornada, e.regular, cJornada.w), celulaLinhas(f.horario, e.regular, cHorario.w)];
  const altura = Math.max(...celulas.map((c) => c.length)) * ENTRELINHA + 2 * RECUO;
  // Linha que não cabe vai para a página seguinte, com o cabeçalho da tabela repetido.
  if (!e.cabe(altura)) {
    e.novaPagina(false);
    desenharCabecalhoOrcamento(e);
  }
  const topo = e.y;
  let x = ML;
  COLUNAS_ORCAMENTO.forEach((col, i) => {
    e.page.drawRectangle({ x, y: topo - altura, width: col.w, height: altura, borderColor: LIGHT_GRAY, borderWidth: 0.6 });
    celulas[i].forEach((l, k) => e.page.drawText(l.texto, { x: x + RECUO, y: topo - RECUO - TAM_TABELA * 0.9 - k * ENTRELINHA, size: TAM_TABELA, font: l.font, color: DARK }));
    x += col.w;
  });
  e.y = topo - altura;
}

// Faixa de valor mensal em CINZA CLARO (o preto pesava): "VALOR MENSAL" à esquerda, o valor à direita e o valor por extenso embaixo, tudo em texto escuro.
// As faixas por função são cinza-claro com filete fino; a que traz o TOTAL (o "VALOR MENSAL TOTAL", ou o único "VALOR MENSAL" de uma proposta de 1 função) fica um
// tom mais escuro, com barra amarela na lateral, borda preta fina e valor maior, para se distinguir. As faixas pretas de título (ORÇAMENTO, PLANILHA DE VERBAS,
// clientes) e o cabeçalho do R&S não mudam.
export const COR_FAIXA_VALOR = rgb(0.93, 0.93, 0.93);
export const COR_FAIXA_TOTAL = rgb(0.89, 0.89, 0.89);
function desenharFaixaValor(e: Escritor, rotulo: string, centavos: number, extenso: string, total = false) {
  const recuo = total ? 14 : 8;
  const linhasExtenso = quebrar(`(${extenso})`, e.regular, 8.5, CW - recuo - 8);
  const altura = 10 + 14 + linhasExtenso.length * 10.5 + 6;
  if (!e.cabe(altura + 8)) e.novaPagina(false);
  const topo = e.y - 8;
  e.page.drawRectangle({ x: ML, y: topo - altura, width: CW, height: altura, color: total ? COR_FAIXA_TOTAL : COR_FAIXA_VALOR, borderColor: total ? BLACK : LIGHT_GRAY, borderWidth: total ? 0.9 : 0.6 });
  if (total) e.page.drawRectangle({ x: ML, y: topo - altura, width: 6, height: altura, color: YELLOW });
  e.page.drawText(limpar(rotulo), { x: ML + recuo, y: topo - 17, size: 11, font: e.bold, color: total ? BLACK : DARK });
  const tamanhoValor = total ? 13 : 12;
  const valor = brl(centavos);
  const w = e.bold.widthOfTextAtSize(valor, tamanhoValor);
  e.page.drawText(valor, { x: ML + CW - 8 - w, y: topo - 17, size: tamanhoValor, font: e.bold, color: total ? BLACK : DARK });
  linhasExtenso.forEach((l, k) => e.page.drawText(l, { x: ML + recuo, y: topo - 29 - k * 10.5, size: 8.5, font: e.regular, color: DARK }));
  e.y = topo - altura;
}

function desenharPlanilha(e: Escritor, f: { planilha: SnapshotMot["funcoes"][number]["planilha"] }, titulo: string, linhasInfo: string[] = []) {
  // Sempre inteira: se não cabe o bloco todo, começa em página nova (nunca é cortada).
  if (!e.cabe(alturaPlanilha(f, linhasInfo.length))) e.novaPagina(false);
  e.faixaTitulo(titulo);
  // Linha informativa abaixo do título (layout "unica": composição da base de cálculo).
  linhasInfo.forEach((t) => { e.page.drawText(t, { x: ML, y: e.y + 6, size: TAM_INFO, font: e.regular, color: DARK }); e.y -= ALTURA_LINHA_INFO; });
  if (linhasInfo.length > 0) e.y -= 4;
  let topo = e.y;
  const larguraValor = 150;
  const linha = (rotulo: string, valor: string, o: { fundo?: ReturnType<typeof rgb>; cor?: ReturnType<typeof rgb>; negrito?: boolean }) => {
    const font = o.negrito ? e.bold : e.regular;
    e.page.drawRectangle({ x: ML, y: topo - ALTURA_LINHA_VERBAS, width: CW, height: ALTURA_LINHA_VERBAS, color: o.fundo, borderColor: LIGHT_GRAY, borderWidth: 0.6 });
    e.page.drawLine({ start: { x: ML + CW - larguraValor, y: topo }, end: { x: ML + CW - larguraValor, y: topo - ALTURA_LINHA_VERBAS }, thickness: 0.6, color: LIGHT_GRAY });
    const y = topo - ALTURA_LINHA_VERBAS + 4;
    e.page.drawText(limpar(rotulo), { x: ML + 6, y, size: TAM_TABELA + 0.5, font, color: o.cor ?? DARK });
    if (valor) {
      const w = font.widthOfTextAtSize(valor, TAM_TABELA + 0.5);
      e.page.drawText(valor, { x: ML + CW - 6 - w, y, size: TAM_TABELA + 0.5, font, color: o.cor ?? DARK });
    }
    topo -= ALTURA_LINHA_VERBAS;
  };
  linha("VERBAS", "VALORES (R$)", { fundo: YELLOW, negrito: true, cor: BLACK });
  const rotuloDe = (l: { chave: string; rotulo: string; percentual_bp: number | null }) => {
    const base = ROTULOS_VERBAS_PDF[l.chave] ?? l.rotulo;
    return CHAVES_EM_VERMELHO.has(l.chave) && l.percentual_bp !== null ? `${base} (${formatarPercentualBp(l.percentual_bp)})` : base;
  };
  const desenhar = (l: { chave: string; rotulo: string; valor_centavos: number | null; percentual_bp: number | null }) => {
    const vermelho = CHAVES_EM_VERMELHO.has(l.chave);
    linha(rotuloDe(l), l.valor_centavos === null ? "" : brl(l.valor_centavos), { cor: vermelho ? VERMELHO : undefined, negrito: vermelho || CHAVES_EM_NEGRITO.has(l.chave) });
  };
  f.planilha.linhas.forEach(desenhar);
  f.planilha.retencoes.forEach(desenhar);
  linha("TOTAL N. FISCAL", brl(f.planilha.total_nf_centavos), { negrito: true, fundo: FUNDO_CLARO });
  e.y = topo - 12;
}

const TAM_TEXTO = 10.5;
const PASSO_TEXTO = TAM_TEXTO * 1.45;

function desenharValidade(e: Escritor, validade: string) {
  const partes = quebrar(validade, e.regular, TAM_TEXTO, CW);
  e.garantirEspaco(6 + partes.length * PASSO_TEXTO);
  e.espaco(6);
  for (const parte of partes) {
    e.page.drawText(parte, { x: ML, y: e.y, size: TAM_TEXTO, font: e.regular, color: DARK });
    e.y -= PASSO_TEXTO;
  }
  e.espaco(8);
}

// Assinatura INTEIRA numa página só: se o bloco não cabe no que sobrou, vai todo para a página seguinte (nunca partido). Conteúdo igual ao de antes.
const RESPIRO_ANTES_ASSINATURA = 16;
function desenharAssinatura(e: Escritor, linhas: { texto: string; font: PDFFont }[]) {
  const itens = linhas.map((l) => ({ ...l, partes: quebrar(l.texto, l.font, TAM_TEXTO, CW) }));
  const altura = itens.reduce((soma, l) => soma + l.partes.length * PASSO_TEXTO, 0);
  if (e.cabe(RESPIRO_ANTES_ASSINATURA + altura + 4)) e.espaco(RESPIRO_ANTES_ASSINATURA);
  else e.novaPagina(false);
  for (const l of itens) {
    for (const parte of l.partes) {
      e.page.drawText(parte, { x: ML, y: e.y, size: TAM_TEXTO, font: l.font, color: DARK });
      e.y -= PASSO_TEXTO;
    }
  }
}

// A linha de composição da base quebra SÓ nos " + " (nunca no meio de "R$ 1.800,50"); um pedaço maior que a página cai na quebra comum por palavra.
function linhasComposicao(texto: string, font: PDFFont): string[] {
  const partes = texto.split(" + ");
  const linhas: string[] = [];
  let atual = "";
  partes.forEach((parte, i) => {
    const candidata = atual === "" ? parte : atual + " + " + parte;
    if (atual !== "" && font.widthOfTextAtSize(limpar(candidata), TAM_INFO) > CW) {
      linhas.push(atual + " +");
      atual = parte;
    } else atual = candidata;
    if (i === partes.length - 1) linhas.push(atual);
  });
  return linhas.flatMap((l) => quebrar(l, font, TAM_INFO, CW));
}

export async function gerarPdfPropostaMot(snap: SnapshotMot, opcoes: OpcoesPdfProposta = {}): Promise<Uint8Array> {
  if (snap.modelo !== "MOT") throw new Error("Modelo ainda não disponível.");
  const doc = await PDFDocument.create();
  doc.setTitle(`Proposta ${snap.numero}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const bytesCabecalho = await carregarLogoCabecalho(opcoes.pastaCabecalho ?? PASTA_CABECALHO_PROPOSTA);
  const logoCabecalho = bytesCabecalho ? await doc.embedPng(bytesCabecalho) : null;
  const rodape = (opcoes.enderecosRodape ?? ENDERECOS_RODAPE_PROPOSTA).map(limpar).filter(Boolean);
  // Layout novo SEMPRE (v2 = true): o MOT nasceu depois do redesenho e não tem versão antiga.
  const e = new Escritor(doc, regular, bold, logoCabecalho, rodape, true, opcoes.teste === true);

  e.novaPagina(true);
  e.centralizado(TITULO_MOT, bold, 13);
  e.espaco(8);
  e.campo("Cliente", snap.cliente_nome);
  if (snap.aos_cuidados) e.campo("A/C", snap.aos_cuidados);
  e.campo("Nº da proposta", numeroComRevisao(snap.numero, snap.revisao));
  e.campo("Data", formatarDataBr(snap.data_emissao));
  // Respiro maior antes do parágrafo "Vimos através desta…": os 10 pt de antes mais uma linha em branco (pedido do Ölver).
  e.espaco(10 + TAM_TEXTO * 1.45);

  if (snap.texto_introdutorio) e.textoLivre(snap.texto_introdutorio);
  e.espaco(4);

  // ORÇAMENTO: uma linha por função; uma faixa VALOR MENSAL por função e, com mais de uma, o VALOR MENSAL TOTAL no fim.
  // Título, faixa e o começo da tabela ficam juntos: a faixa nunca fica sozinha no fim de uma página.
  e.garantirEspaco(150);
  e.centralizado("PROPOSTA MÃO DE OBRA TEMPORÁRIA", bold, 11);
  e.centralizado(SUBTITULO_MOT, regular, 9.5);
  e.espaco(2);
  e.faixaTitulo("ORÇAMENTO");
  e.garantirEspaco(ENTRELINHA * 3 + 4 * RECUO);
  desenharCabecalhoOrcamento(e);
  for (const f of snap.funcoes) desenharLinhaOrcamento(e, f);
  const varias = snap.funcoes.length > 1;
  // Layout "unica": o valor mensal é UM só (TOTAL N. FISCAL da planilha única); sem faixa por função, que não somaria o mesmo total. Layout antigo: como sempre.
  const unica = snap.layout_planilha === "unica" && snap.planilha_unica ? snap.planilha_unica : null;
  if (unica) desenharFaixaValor(e, varias ? "VALOR MENSAL TOTAL" : "VALOR MENSAL", snap.total_mensal_centavos, snap.total_mensal_extenso, true);
  else {
    snap.funcoes.forEach((f, i) => desenharFaixaValor(e, varias ? `VALOR MENSAL – Função ${i + 1} (${f.area})` : "VALOR MENSAL", f.valor_mensal_centavos, f.valor_mensal_extenso, !varias));
    if (varias) desenharFaixaValor(e, "VALOR MENSAL TOTAL", snap.total_mensal_centavos, snap.total_mensal_extenso, true);
  }
  e.espaco(14);

  // Cláusulas: 1.1 a 1.5 fixas (texto do Word) e as adicionais seguindo, 1.6, 1.7…
  const fixas = [ITENS_FIXOS_MOT.exames, ITENS_FIXOS_MOT.encargos, ITENS_FIXOS_MOT.adicionais, ITENS_FIXOS_MOT.faltas, textoFaturamentoMot(snap.condicoes)];
  fixas.forEach((texto, i) => e.item(`1.${i + 1}`, texto));
  for (const item of itensAdicionais(snap.clausulas_adicionais, QUANTIDADE_ITENS_FIXOS_MOT + 1)) e.item(item.numero, item.texto);

  // A validade fica logo depois das cláusulas; a assinatura vai para DEPOIS da planilha de verbas (decisão do Ölver).
  desenharValidade(e, `Validade da proposta: ${snap.validade_dias} dias corridos, até ${formatarDataBr(snap.validade_ate)}.`);
  const assinatura = [
    { texto: ASSINATURA_MOT[0], font: bold },
    { texto: snap.vendedor_nome, font: regular },
    ...(snap.vendedor_telefone ? [{ texto: snap.vendedor_telefone, font: regular }] : []),
    ...(snap.vendedor_email ? [{ texto: snap.vendedor_email, font: regular }] : []),
  ];

  if (unica) {
    const info = linhasComposicao(textoBaseCalculoMot(snap.funcoes, unica.salario_centavos), e.regular);
    desenharPlanilha(e, { planilha: unica }, "PLANILHA DE VERBAS", info.map(limpar));
  } else snap.funcoes.forEach((f, i) => desenharPlanilha(e, f, varias ? `PLANILHA DE VERBAS – Função ${i + 1} (${f.area})` : "PLANILHA DE VERBAS"));
  desenharAssinatura(e, assinatura);

  await desenharGradeClientes(e, await carregarLogosClientes(opcoes.pastaClientes ?? PASTA_CLIENTES_PROPOSTA), true);
  return doc.save();
}

