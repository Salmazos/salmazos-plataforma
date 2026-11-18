// Escape de HTML nos e-mails que carregam TEXTO DE TERCEIROS (candidato, cliente, formulário público) para a equipe Salmazos.
//  1) Cada e-mail corrigido: <script>, <b>, & e aspas saem escapados; fragmentos HTML do próprio código ficam crus; o HTML é o MESMO de antes
//     (prova: html(hostil) == html(texto simples) com cada token trocado pelo valor escapado — nada além do escape mudou).
//  2) Varredura (AST) de TODA interpolação ${...} em HTML de e-mail sem escaparHtml, com lista FECHADA de exceções justificadas:
//     um e-mail novo com interpolação nua quebra este script.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-escape-emails.mts
// (VARREDURA_RAIZ=<pasta com src/> aponta a varredura para outra cópia do código, por exemplo o main antigo, para provar que ela falha.)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, importar } from "./harness-mot/ambiente.mjs";
import { escaparHtml } from "../src/lib/escaparHtml";
import { getEmailTemplate } from "../src/lib/emailTemplates";
import { montarHtmlConfirmacao } from "../src/lib/email";
import { linhaTabelaAdmissao, montarHtmlAlertaSla, montarHtmlCandidatoAprovado, montarHtmlIndicacaoAprovada } from "../src/lib/emailsEquipe";

congelarData();
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

// ── 1) Comportamento ─────────────────────────────────────────────────────────
const PERIGOSO = `<script>alert("x")</script> & <b>negrito</b> 'aspas'`;
const FRAGMENTO = `<tr><td>FRAGMENTO-DO-CODIGO</td></tr>`;

// Monta o e-mail duas vezes — com texto simples (token por campo) e com o texto hostil — e prova que a única diferença é o escape.
function provaDeEscape<T extends Record<string, unknown>>(nome: string, campos: (keyof T)[], base: T, montar: (d: T) => string, juntar?: (v: Record<string, string>) => Record<string, string>) {
  const simples: Record<string, string> = {}, hostil: Record<string, string> = {};
  campos.forEach((c, i) => { simples[c as string] = `@@T${i}@@`; hostil[c as string] = `${PERIGOSO}#${i}`; });
  const htmlSimples = montar({ ...base, ...simples } as T);
  const htmlHostil = montar({ ...base, ...hostil } as T);
  let esperado = htmlSimples;
  campos.forEach((c, i) => { esperado = esperado.split(simples[c as string]).join(escaparHtml(hostil[c as string])); });
  void juntar;
  assert.ok(htmlSimples.includes("@@T0@@"), `${nome}: o texto comum aparece como veio`);
  assert.ok(!htmlHostil.includes("<script>") && !htmlHostil.includes("<b>negrito</b>"), `${nome}: nenhuma tag do terceiro chega crua`);
  assert.equal(htmlHostil, esperado, `${nome}: o HTML só difere pelo escape`);
  for (const c of campos) assert.ok(htmlHostil.includes(escaparHtml(hostil[c as string])), `${nome}: ${String(c)} escapado presente`);
}

await ok("e-mail de confirmação ao candidato: nome e cargo escapados; HTML igual ao de antes", () => {
  provaDeEscape("confirmacao", ["nomeCandidato", "cargoPretendido"], { nomeCandidato: "", cargoPretendido: "" }, montarHtmlConfirmacao);
  const comum = montarHtmlConfirmacao({ nomeCandidato: "Maria José", cargoPretendido: "Analista Júnior" });
  assert.ok(comum.includes("<strong>Maria José</strong>!") && comum.includes("Analista Júnior") && comum.includes("Salmazos RH &amp; Serviços"));
});

const admHostil = linhaTabelaAdmissao("Função", PERIGOSO);
await ok("linha de 'Dados para Admissão': o valor do cliente é escapado e o rótulo fixo fica como está", () => {
  assert.ok(admHostil.includes(">Função</td>") && admHostil.includes(escaparHtml(PERIGOSO)) && !admHostil.includes("<script>"));
  assert.equal(linhaTabelaAdmissao("Salário", "R$ 1.500,00/mês"), `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">Salário</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">R$ 1.500,00/mês</td></tr>`);
});

await ok("e-mail 'Candidato Aprovado pelo Cliente' (portal/avaliar): candidato, cargo, cidade, estado, vaga, cliente, tipo e feedback escapados; admRows e fee seguem crus", () => {
  const base = { candidatoNome: "", cargoPretendido: "", cidade: "", estado: "", vagaTitulo: "", clienteNome: "", tipoServicoRotulo: "", admRows: FRAGMENTO, feeSection: "<div>FEE-DO-CODIGO</div>", feedbackCliente: "", candidatoId: "id-1" };
  provaDeEscape("aprovado", ["candidatoNome", "cargoPretendido", "cidade", "estado", "vagaTitulo", "clienteNome", "tipoServicoRotulo", "feedbackCliente"], base, montarHtmlCandidatoAprovado);
  const html = montarHtmlCandidatoAprovado({ ...base, candidatoNome: "Ana", clienteNome: "Cliente SA", feedbackCliente: "Ótimo perfil." });
  assert.ok(html.includes(FRAGMENTO) && html.includes("<div>FEE-DO-CODIGO</div>") && html.includes("/painel/candidato/id-1"), "fragmentos e link do código intactos");
  const semAdm = montarHtmlCandidatoAprovado({ ...base, admRows: "" });
  assert.ok(!semAdm.includes("Dados para Admissão"), "bloco de admissão continua só quando há linhas");
});

await ok("e-mail 'Indicação Direta Aprovada' (decisão): candidato, telefone, vaga e cliente escapados; linhas de admissão e link do código intactos", () => {
  const base = { candidatoNome: "", candidatoTelefone: "", vagaTitulo: "", clienteNome: "", admRows: FRAGMENTO, temCurriculo: true, candidatoId: "id-2" };
  provaDeEscape("indicacao", ["candidatoNome", "candidatoTelefone", "vagaTitulo", "clienteNome"], base, montarHtmlIndicacaoAprovada);
  const html = montarHtmlIndicacaoAprovada({ ...base, candidatoNome: "José", candidatoTelefone: "(19) 3333-4444" });
  assert.ok(html.includes(FRAGMENTO) && html.includes("Currículo anexado") && html.includes("/painel/candidato/id-2"));
  assert.ok(!montarHtmlIndicacaoAprovada({ ...base, temCurriculo: false }).includes("Currículo anexado"));
});

await ok("alerta de SLA: candidato, vaga e etapa escapados; cores, prazos e link do código intactos (crítico x atenção)", () => {
  const base = { nomeCandidato: "", tituloVaga: "", etapa: "", dias: 6, prazo: 3, diasExcedidos: 3, candidatoId: "id-3" };
  provaDeEscape("sla", ["nomeCandidato", "tituloVaga", "etapa"], base, montarHtmlAlertaSla);
  const critico = montarHtmlAlertaSla({ ...base, nomeCandidato: "Beto", tituloVaga: "Vaga", etapa: "triagem" });
  assert.ok(critico.includes("#DC2626") && critico.includes("SLA crítico") && critico.includes("excedido em <strong>3 dia(s)</strong>"));
  const atencao = montarHtmlAlertaSla({ ...base, diasExcedidos: 1 });
  assert.ok(atencao.includes("#D97706") && atencao.includes("SLA excedido — atenção"));
});

await ok("avisos de ASO periódico e de rescisão: nome do funcionário e empresa escapados; modalidade, valores e link intactos", async () => {
  const aso = await importar("src/lib/dispararAvisoAsoPeriodico.ts");
  const resc = await importar("src/lib/dispararAvisosRescisao.ts");
  provaDeEscape("aso", ["nome", "empresa"], { tituloEmail: "T", corDestaque: "#111", nome: "", empresa: "", dataVencimento: "2026-11-30", funcionarioId: "f-1" },
    (d: any) => aso.montarHtmlEmail(d.tituloEmail, d.corDestaque, d.nome, d.empresa, d.dataVencimento, d.funcionarioId));
  const fin = { valorRescisao: 1500, dataPagamentoRescisao: "2026-11-10", valorGuia: 200, dataPagamentoGuia: "2026-11-12" };
  provaDeEscape("rescisao", ["nome", "empresa"], { tituloEmail: "T", corDestaque: "#111", nome: "", empresa: "", modalidade: "Aviso trabalhado", rescisaoId: "r-1" },
    (d: any) => resc.montarHtmlEmail(d.tituloEmail, d.corDestaque, d.nome, d.empresa, d.modalidade, fin, d.rescisaoId));
});

await ok("getEmailTemplate (e-mails por modelo) já escapa o texto livre na origem (mapearTextoLivre) — o assunto continua texto puro", () => {
  const { html, subject } = getEmailTemplate("vaga_aprovada_cliente", { nome: PERIGOSO, cargo: PERIGOSO, nomeCliente: PERIGOSO, numPosicoes: 1, cidade: PERIGOSO });
  assert.ok(!html.includes("<script>") && html.includes(escaparHtml(PERIGOSO)));
  assert.ok(!subject.includes("&lt;") && !subject.includes("\n"));
});

await ok("rotas com HTML inline escapam o que vem de terceiros (indicar-candidato, lembretes de entrevista) e usam a função compartilhada", () => {
  const le = (p: string) => fs.readFileSync(p, "utf8");
  const ind = le("src/app/api/portal/indicar-candidato/route.ts");
  assert.ok(ind.includes('import { escaparHtml } from "@/lib/escaparHtml";') && !/^const escaparHtml = /m.test(ind), "sem cópia local da função");
  for (const e of ["clienteNome", "dados.candidato_nome", "dados.candidato_telefone", "vaga.titulo", "tipoLbl"]) assert.ok(ind.includes(`\${escaparHtml(${e})}`), e);
  const hoje = le("src/app/api/cron/lembrete-entrevista-hoje/route.ts");
  for (const e of ["it.candidato_nome", 'it.cargo ?? "—"', 'it.hora ?? "—"']) assert.ok(hoje.includes(`\${escaparHtml(${e})}`), e);
  assert.ok(le("src/app/api/cron/lembrete-agendamento/route.ts").includes("color:#1D4ED8\">${escaparHtml(candidatoNome)}</p>"));
  const aval = le("src/app/api/portal/avaliar/route.ts");
  assert.ok(aval.includes("const linhaTabela = linhaTabelaAdmissao;") && aval.includes("${escaparHtml(v.fee_rs_prazo_cobranca ??") && aval.includes("montarHtmlCandidatoAprovado({"));
  assert.ok(aval.includes("${escaparHtml(candidatoNomeR)}") && aval.includes("${escaparHtml(feedback_cliente ?? \"\")}"), "e-mail de reprovação continua escapando (mesmo padrão)");
});

// ── 2) Varredura geral ───────────────────────────────────────────────────────
// Toda interpolação ${...} dentro de template literal que contém HTML, nos arquivos de e-mail, ou é escapada/segura por construção (regras
// automáticas abaixo) ou está nesta lista FECHADA, com o motivo. Entrada que não casar com nada = e-mail novo com texto nu → o script quebra.
// emailTemplates.ts fica de fora da varredura: seus dados passam por mapearTextoLivre(dados, escaparHtml) em getEmailTemplate (provado acima).
const RAIZ = process.env.VARREDURA_RAIZ ?? process.cwd();
const ARQUIVO_FORA = new Set(["src/lib/emailTemplates.ts"]);
type Excecao = { arquivo: string; expr: string; motivo: string };
const ID_EM_LINK = "id (uuid) de registro em href do painel, não é texto digitado";
const NUM = "número, data ou moeda formatados pelo próprio código";
const COR = "cor ou texto fixo escolhido pelo próprio código";
const FRAG = "fragmento HTML montado pelo código a partir de valores já escapados";
const EXCECOES: Excecao[] = [
  // ids em href
  ...[
    ["src/app/api/cron/lembrete-agendamento/route.ts", "r.candidato_id"], ["src/app/api/cron/lembrete-agendamento/route.ts", "r.id"],
    ["src/app/api/portal/agendar/route.ts", "enc.candidato_id"], ["src/app/api/portal/avaliar/route.ts", "enc.candidato_id"],
    ["src/lib/avisarGarantiaRS.ts", "o.candidatoId"], ["src/lib/avisarGarantiaRS.ts", "o.novaVagaId"], ["src/lib/avisarPosVendaRS.ts", "o.candidatoId"],
    ["src/lib/dispararAvisoAsoPeriodico.ts", "funcionarioId"], ["src/lib/dispararAvisosRescisao.ts", "rescisaoId"],
    ["src/lib/emailsEquipe.ts", "d.candidatoId"],
  ].map(([arquivo, expr]) => ({ arquivo, expr, motivo: ID_EM_LINK })),
  // números, datas e moeda
  ...[
    ["src/app/api/cron/aniversarios/route.ts", "nomeMes"],
    ["src/app/api/portal/agendar/route.ts", "dataFormatada"], ["src/app/api/portal/avaliar/route.ts", "pct"],
    ["src/lib/avisarGarantiaRS.ts", "garantiaFmt"],
    ["src/lib/dispararAvisosRescisao.ts", "moeda(valorRescisao + (valorGuia ?? 0))"], ["src/lib/dispararAvisosRescisao.ts", "moeda(valorRescisao)"],
    ["src/lib/dispararAvisosRescisao.ts", "moeda(valorGuia)"], ["src/lib/dispararAvisosRescisao.ts", "formatarData(dataPagamentoRescisao)"],
    ["src/lib/dispararAvisosRescisao.ts", "formatarData(dataPagamentoGuia)"], ["src/lib/emailsEquipe.ts", "prazo"], ["src/lib/emailsEquipe.ts", "dias"], ["src/lib/emailsEquipe.ts", "diasExcedidos"],
  ].map(([arquivo, expr]) => ({ arquivo, expr, motivo: NUM })),
  // cores e textos fixos
  ...[
    ["src/lib/avisarGarantiaRS.ts", "t.titulo"], ["src/lib/avisarGarantiaRS.ts", "t.destaque"], ["src/lib/dispararAvisoAsoPeriodico.ts", "tituloEmail"],
    ["src/lib/dispararAvisoAsoPeriodico.ts", "corDestaque"], ["src/lib/dispararAvisosRescisao.ts", "tituloEmail"], ["src/lib/dispararAvisosRescisao.ts", "corDestaque"],
    ["src/lib/dispararAvisosRescisao.ts", "modalidadeLabel"],
  ].map(([arquivo, expr]) => ({ arquivo, expr, motivo: COR })),
  // fragmentos
  { arquivo: "src/app/api/aniversariantes/[id]/enviar-felicitacao/route.ts", expr: "corpoHtml", motivo: "corpo digitado pelo analista, já passado por escapeHtml + <br> na linha anterior" },
  { arquivo: "src/lib/emailAniversarioTemplate.ts", expr: "titulo", motivo: "título fixo passado pelo chamador (cron e felicitação), nunca texto de terceiros" },
  { arquivo: "src/lib/emailAniversarioTemplate.ts", expr: "conteudo", motivo: "HTML pronto dos chamadores, que escapam nome/empresa/cargo antes (nomeHtml, empresaHtml, cargoHtml, corpoHtml)" },
  { arquivo: "src/lib/emailsEquipe.ts", expr: "d.admRows", motivo: "linhas montadas por linhaTabelaAdmissao (valor escapado)" },
  { arquivo: "src/lib/emailsEquipe.ts", expr: "d.feeSection", motivo: "bloco financeiro montado em portal/avaliar com o prazo escapado" },
  { arquivo: "src/app/api/portal/solicitar-vaga/route.ts", expr: "label", motivo: "rótulo fixo: os chamadores de detailRow passam literais; o valor é escapado" },
  { arquivo: "src/lib/emailsEquipe.ts", expr: "label", motivo: "rótulo fixo (ADM_LABELS) de linhaTabelaAdmissao; o valor é escapado" },
];

type Achado = { arquivo: string; linha: number; expr: string };
function varrer(raiz: string): Achado[] {
  const arquivos = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const TAG = /<\/?[a-z][a-z0-9]*[\s>/]/i;
  const ESCAPADORES = new Set(["escaparHtml", "escapeHtml", "e"]);
  const achados: Achado[] = [];
  for (const f of arquivos(path.join(raiz, "src"))) {
    const rel = path.relative(raiz, f).replace(/\\/g, "/");
    if (ARQUIVO_FORA.has(rel)) continue;
    const src = fs.readFileSync(f, "utf8");
    if (!/sendEmail|sendMail|notifyAllAnalysts|enviarEmailAoCliente|html/i.test(src)) continue;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const preEscapados = new Set<string>(), escapadoras = new Set<string>(), fragmentos = new Set<string>();
    const coleta = (nd: ts.Node) => {
      if (ts.isVariableDeclaration(nd) && ts.isIdentifier(nd.name) && nd.initializer) {
        const i = nd.initializer;
        if (ts.isCallExpression(i) && ESCAPADORES.has(i.expression.getText())) preEscapados.add(nd.name.text);
        if ((ts.isArrowFunction(i) || ts.isFunctionExpression(i)) && /escaparHtml\(|escapeHtml\(/.test(i.getText())) escapadoras.add(nd.name.text);
        if (ts.isTemplateExpression(i) || ts.isNoSubstitutionTemplateLiteral(i) || ts.isConditionalExpression(i) || (ts.isStringLiteral(i) && i.text === "")) fragmentos.add(nd.name.text);
        if (ts.isCallExpression(i) && i.expression.getText().endsWith(".join")) fragmentos.add(nd.name.text);
      }
      if (ts.isFunctionDeclaration(nd) && nd.name && /escaparHtml\(|escapeHtml\(/.test(nd.getText())) escapadoras.add(nd.name.text);
      ts.forEachChild(nd, coleta);
    };
    coleta(sf);
    const literal = (x: ts.Node) => ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x);
    const seguro = (x: ts.Expression): boolean => {
      if (ts.isCallExpression(x)) {
        const c = x.expression;
        if (ts.isIdentifier(c) && (ESCAPADORES.has(c.text) || escapadoras.has(c.text))) return true;
        if (ts.isPropertyAccessExpression(c) && ["toLocaleString", "toLocaleDateString", "toFixed", "padStart", "toString"].includes(c.name.text)) return true;
      }
      if (ts.isIdentifier(x)) return x.text === "SITE_URL" || preEscapados.has(x.text) || fragmentos.has(x.text);
      // Ramos com template são varridos por conta própria (o visitante entra em cada ${...} deles); aqui só se exige que os ramos sejam seguros.
      if (ts.isConditionalExpression(x)) return [x.whenTrue, x.whenFalse].every((r) => literal(r) || ts.isTemplateExpression(r) || (ts.isExpression(r) && seguro(r)));
      if (ts.isCallExpression(x) && x.expression.getText().endsWith(".join")) return true; // lista de fragmentos (cada template da lista é varrido)
      return ts.isNumericLiteral(x) || literal(x);
    };
    const visita = (nd: ts.Node) => {
      if (ts.isTemplateExpression(nd)) {
        const lits = [nd.head.text, ...nd.templateSpans.map((s) => s.literal.text)].join("");
        if (TAG.test(lits)) {
          for (const sp of nd.templateSpans) {
            if (seguro(sp.expression)) continue;
            achados.push({ arquivo: rel, linha: sf.getLineAndCharacterOfPosition(sp.expression.getStart()).line + 1, expr: sp.expression.getText().replace(/\s+/g, " ") });
          }
        }
      }
      ts.forEachChild(nd, visita);
    };
    visita(sf);
  }
  return achados;
}

await ok("VARREDURA: toda interpolação ${...} em HTML de e-mail está escapada, é segura por construção ou está na lista fechada de exceções justificadas", () => {
  const achados = varrer(RAIZ);
  const usadas = new Set<Excecao>();
  const sobras = achados.filter((a) => {
    const ex = EXCECOES.find((x) => x.arquivo === a.arquivo && (x.expr === a.expr || a.expr.startsWith(x.expr + " ?")));
    if (ex) { usadas.add(ex); return false; }
    return true;
  });
  assert.deepEqual(sobras.map((s) => `${s.arquivo}:${s.linha}  \${${s.expr.slice(0, 70)}}`), [], "interpolação nua em HTML de e-mail (escape com escaparHtml ou justifique na lista)");
  const obsoletas = EXCECOES.filter((x) => !usadas.has(x));
  assert.deepEqual(obsoletas.map((x) => `${x.arquivo} ${x.expr}`), [], "exceção que não casa mais com nada (remova da lista)");
  assert.ok(EXCECOES.every((x) => x.motivo.length > 10), "toda exceção tem motivo");
});

console.log(`\n${n} verificações OK`);
