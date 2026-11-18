// Datas para o usuário final sempre em dd/mm/aaaa.
//  1) dataBR / dataHoraBR / formatarDatasParaExibicao (src/lib/dataBR.ts): date puro, timestamp na virada UTC×Brasília, Date, vazio, inválido.
//  2) O mesmo resultado em TZ=America/Sao_Paulo e TZ=UTC (a sonda roda como processo filho em cada fuso) — "dia a menos" nunca mais.
//  3) Os 8 pontos que mostravam AAAA-MM-DD (PDF da admissão, PDF do Vale Transporte, revisão e dependentes do candidato, painel, log) e vagas.prazo.
//  4) Varredura (AST): coluna `date` interpolada crua em JSX, HTML de e-mail ou PDF quebra o script, com lista fechada de exceções justificadas.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-datas-dd-mm-aaaa.mts
// (VARREDURA_RAIZ=<pasta com src/> aponta a varredura para outra cópia do código, para provar que ela falha no código antigo.)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { dataBR, dataHoraBR, formatarDatasParaExibicao } from "../src/lib/dataBR";
import { desenharSolicitacaoValeTransporte } from "../src/lib/admissaoDocumentosPdf";

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");

// ── 1) dataBR ────────────────────────────────────────────────────────────────
await ok("dataBR: coluna date ('AAAA-MM-DD') vira dd/mm/aaaa por texto; datas inexistentes devolvem o original", () => {
  assert.equal(dataBR("2026-11-18"), "18/11/2026");
  assert.equal(dataBR("2026-12-01"), "01/12/2026");
  assert.equal(dataBR("2026-01-01"), "01/01/2026");
  assert.equal(dataBR("2028-02-29"), "29/02/2028", "ano bissexto");
  assert.equal(dataBR("2026-02-29"), "2026-02-29", "29/02 em ano comum não existe: devolve o texto original");
  assert.equal(dataBR("2026-13-01"), "2026-13-01");
  assert.equal(dataBR("  2026-11-18  "), "18/11/2026", "espaços nas pontas");
  assert.equal(dataBR("2026-11-18T00:00:00"), "18/11/2026", "sem fuso = data pura: o texto manda (sem deslocar)");
});

await ok("dataBR: timestamp com fuso é convertido para Brasília (2026-11-19T01:30:00Z = 18/11/2026) e Date também", () => {
  assert.equal(dataBR("2026-11-19T01:30:00Z"), "18/11/2026");
  assert.equal(dataBR("2026-11-19T01:30:00+00:00"), "18/11/2026");
  assert.equal(dataBR("2026-11-19 01:30:00+00"), "18/11/2026", "formato do Postgres (espaço, +00)");
  assert.equal(dataBR("2026-11-19T03:00:00Z"), "19/11/2026");
  assert.equal(dataBR("2026-12-01T02:59:59Z"), "30/11/2026", "virada do mês: 23h59 de 30/11 em Brasília");
  assert.equal(dataBR("2026-12-01T03:00:00Z"), "01/12/2026");
  assert.equal(dataBR("2026-01-01T02:00:00.123456+00:00"), "31/12/2025", "virada do ano");
  assert.equal(dataBR(new Date("2026-11-19T01:30:00Z")), "18/11/2026");
  assert.equal(dataHoraBR("2026-11-19T01:30:00Z"), "18/11/2026 22:30");
  assert.equal(dataHoraBR("2026-11-18"), "18/11/2026", "data pura não ganha hora");
});

await ok("dataBR: vazio/nulo devolve '—' (padrão das telas); texto que não é data devolve o original sem quebrar", () => {
  for (const v of [null, undefined, "", "   ", "\n"]) assert.equal(dataBR(v as never), "—", JSON.stringify(v));
  assert.equal(dataBR(new Date("invalido")), "—");
  for (const v of ["amanhã", "18/11/2026", "2026-11", "abc-de-fg", "2026-11-18Tfoo"]) assert.equal(dataBR(v), v);
  assert.equal(dataHoraBR(null), "—");
});

await ok("formatarDatasParaExibicao (log de auditoria): converte só texto AAAA-MM-DD e timestamp; não altera o original, as chaves, números, ids nem outros textos", () => {
  const original = { data_vencimento: "2026-12-01", em: "2026-11-19T01:30:00Z", lista: ["2026-01-01", 5, null, true], aninhado: { id: "0b4f3a52-8c77-4d1e-9c2f-1a2b3c4d5e6f", competencia: "2026-11", obs: "pagou em 2026-11-18" }, valor: 1234.5 };
  const copia = structuredClone(original);
  const exibido = formatarDatasParaExibicao(original) as typeof original;
  assert.deepEqual(original, copia, "o dado original não é alterado");
  assert.equal(exibido.data_vencimento, "01/12/2026");
  assert.equal(exibido.em, "18/11/2026 22:30");
  assert.deepEqual(exibido.lista, ["01/01/2026", 5, null, true]);
  assert.deepEqual(exibido.aninhado, { id: "0b4f3a52-8c77-4d1e-9c2f-1a2b3c4d5e6f", competencia: "2026-11", obs: "pagou em 2026-11-18" }, "id, competência e texto livre ficam como estão");
  assert.equal(exibido.valor, 1234.5);
  assert.deepEqual(Object.keys(exibido), Object.keys(original), "mesma estrutura e ordem das chaves");
  assert.ok(JSON.stringify(exibido, null, 2).includes('"data_vencimento": "01/12/2026"'), "continua legível");
  assert.equal(formatarDatasParaExibicao(null), null);
  assert.equal(formatarDatasParaExibicao("texto"), "texto");
});

// ── 2) Mesmo resultado em qualquer fuso da máquina ──
const sonda = (tz: string) => JSON.parse(execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/datas-tz-sonda.mts"], { env: { ...process.env, TZ: tz, HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8" }));
await ok("TZ=America/Sao_Paulo e TZ=UTC dão o MESMO dd/mm/aaaa (2026-11-18, virada 2026-12-01 e 2026-01-01); o formatarData antigo numa coluna date errava o dia em Brasília", () => {
  const sp = sonda("America/Sao_Paulo"), utc = sonda("UTC");
  assert.equal(sp.fusoDaMaquina, "America/Sao_Paulo");
  assert.equal(utc.fusoDaMaquina, "UTC");
  for (const k of ["dataPura", "timestamp", "timestampComHora", "date", "json"]) assert.deepEqual(sp[k], utc[k], `${k}: igual nos dois fusos`);
  assert.deepEqual(sp.dataPura, ["18/11/2026", "01/12/2026", "01/01/2026", "28/02/2026", "29/02/2028", "31/12/2026"]);
  assert.deepEqual(sp.timestamp, ["18/11/2026", "18/11/2026", "30/11/2026", "01/12/2026", "31/12/2025", "01/01/2026"]);
  assert.deepEqual(sp.date, ["18/11/2026", "30/11/2026", "01/01/2026"]);
  assert.deepEqual(sp.json, { a: "01/12/2026", b: "18/11/2026 22:30", c: ["01/01/2026", 5, null], d: { e: "texto" } });
  // a razão do conserto: new Date("AAAA-MM-DD") é meia-noite UTC e, em Brasília, cai no dia anterior
  assert.deepEqual(sp.formatarDataAntigaEmDatePura.slice(0, 3), ["17/11/2026", "30/11/2026", "31/12/2025"], "formatarData em coluna date, TZ de Brasília: um dia a menos");
  assert.deepEqual(utc.formatarDataAntigaEmDatePura.slice(0, 3), ["18/11/2026", "01/12/2026", "01/01/2026"], "...e certo em UTC: por isso o bug só aparecia no navegador do usuário");
});

// ── 3) Os pontos que mostravam AAAA-MM-DD ──
await ok("PDF da Solicitação de Vale Transporte: 'Data do início' sai dd/mm/aaaa (antes: 2026-11-18)", () => {
  const campos: { label: string; value: unknown }[] = [];
  const w: any = new Proxy({ y: 700 }, { get: (alvo, nome) => (nome in alvo ? (alvo as any)[nome] : nome === "formFieldRow" ? (f: { label: string; value: unknown }[]) => campos.push(...f) : () => undefined), set: (alvo, nome, v) => { (alvo as any)[nome] = v; return true; } });
  desenharSolicitacaoValeTransporte(w, { nome_completo: "Maria", data_admissao: "2026-11-18", linhas: [] } as never);
  assert.equal(campos.find((c) => c.label === "Data do início")?.value, "18/11/2026");
  const semData: { label: string; value: unknown }[] = [];
  const w2: any = new Proxy({ y: 700 }, { get: (alvo, nome) => (nome in alvo ? (alvo as any)[nome] : nome === "formFieldRow" ? (f: { label: string; value: unknown }[]) => semData.push(...f) : () => undefined), set: (alvo, nome, v) => { (alvo as any)[nome] = v; return true; } });
  desenharSolicitacaoValeTransporte(w2, { nome_completo: "Maria", data_admissao: null, linhas: [] } as never);
  assert.ok(!semData.find((c) => c.label === "Data do início")?.value, "sem data continua em branco (formulário para preencher à mão)");
});

await ok("PDF principal da admissão (gerar-pdf): nascimento, RG emissão, CNH validade e nascimento dos dependentes pela dataBR; vazio continua vazio", () => {
  const r = fonte("src/app/api/admissoes/[id]/gerar-pdf/route.ts");
  assert.ok(r.includes('import { dataBR } from "@/lib/dataBR";'));
  for (const trecho of [
    'w.drawField("Data de nascimento", dp.data_nascimento && dataBR(dp.data_nascimento));',
    'w.drawField("RG - Data emissão", dp.rg_data_emissao && dataBR(dp.rg_data_emissao));',
    '— Val. ${dp.cnh_validade ? dataBR(dp.cnh_validade) : "—"}`',
    'w.drawField("Data de nascimento", dep.data_nascimento && dataBR(dep.data_nascimento));',
  ]) assert.ok(r.includes(trecho), trecho);
  for (const antigo of ['w.drawField("Data de nascimento", dp.data_nascimento);', 'w.drawField("RG - Data emissão", dp.rg_data_emissao);', 'Val. ${dp.cnh_validade ?? "—"}', 'w.drawField("Data de nascimento", dep.data_nascimento);']) assert.ok(!r.includes(antigo), `sem o antigo: ${antigo}`);
  const texto = (v: string | null, cnh: string | null) => ({ nasc: v && dataBR(v), cnh: `Val. ${cnh ? dataBR(cnh) : "—"}` });
  assert.deepEqual(texto("1990-05-07", "2030-12-31"), { nasc: "07/05/1990", cnh: "Val. 31/12/2030" });
  assert.deepEqual(texto(null, null), { nasc: null, cnh: "Val. —" });
});

await ok("telas: revisão e dependentes do candidato (página pública) e painel da admissão (nascimento, CNH, dependentes) usam dataBR", () => {
  const rev = fonte("src/components/admissao/PassoRevisao.tsx");
  assert.ok(rev.includes('value={form.data_nascimento ? dataBR(form.data_nascimento) : ""}') && !rev.includes("value={form.data_nascimento}"));
  const dep = fonte("src/components/admissao/PassoDependentes.tsx");
  assert.ok(dep.includes('Nascimento: {dep.data_nascimento ? dataBR(dep.data_nascimento) : "—"}') && !dep.includes('Nascimento: {dep.data_nascimento || "—"}'));
  const p = fonte("src/components/AdmissaoDetalheClient.tsx");
  assert.ok(p.includes('value={dp?.data_nascimento ? dataBR(dp.data_nascimento) : ""}') && p.includes('— Val. ${dp.cnh_validade ? dataBR(dp.cnh_validade) : "—"}') && p.includes('Nascimento: {d.data_nascimento ? dataBR(d.data_nascimento) : "—"}'));
  assert.ok(!p.includes("value={dp?.data_nascimento}") && !p.includes('Val. ${dp.cnh_validade ?? "—"}') && !p.includes('Nascimento: {d.data_nascimento || "—"}'));
  // As demais datas da seção (RG emissão, CTPS, PIS, CNH emissão) só aparecem na EDIÇÃO (input type=date, do navegador); data de admissão já era formatada.
  assert.ok(p.includes('<Linha label="Data de admissão" value={dataAdmissaoAtual && formatarDataSemFuso(dataAdmissaoAtual)} />'));
  const viewDP = p.slice(p.indexOf('titulo="Dados Pessoais"'), p.indexOf('titulo="Endereço e Contato"'));
  for (const col of ["rg_data_emissao", "ctps_data_emissao", "pis_data_cadastramento", "cnh_data_emissao"]) assert.ok(!viewDP.includes(col), `${col} não é exibido em modo leitura`);
});

await ok("log de auditoria (painel): o JSON dos detalhes é formatado SÓ na exibição (o dado e a estrutura não mudam)", () => {
  const a = fonte("src/components/AuditLogsPageClient.tsx");
  assert.ok(a.includes('{JSON.stringify(formatarDatasParaExibicao(log.detalhes), null, 2)}') && !a.includes("{JSON.stringify(log.detalhes, null, 2)}"));
  assert.ok(a.includes('import { formatarDatasParaExibicao } from "@/lib/dataBR";'));
});

await ok("'dia a menos': vagas.prazo (coluna date) deixou de passar por new Date; as funções que recebem timestamp ficaram como estavam", () => {
  for (const f of ["src/components/VagaDetalheClient.tsx", "src/components/VagasPageClient.tsx"]) {
    const s = fonte(f);
    assert.ok(s.includes("dataBR(vaga.prazo)") && !s.includes("formatarData(vaga.prazo)"), f);
  }
  // recebem TIMESTAMP (timestamptz): new Date está correto, não foram tocadas
  assert.ok(fonte("src/components/CobrancasRSPageClient.tsx").includes('return new Date(iso).toLocaleDateString("pt-BR");'), "CobrancasRS: createdAt");
  assert.ok(fonte("src/components/VagasPageClient.tsx").includes('return new Date(iso).toLocaleDateString("pt-BR");'), "VagasPage.formatDateBR: data_abertura/data_fechamento (timestamptz)");
  assert.ok(fonte("src/lib/utils.ts").includes('return new Date(iso).toLocaleDateString("pt-BR", {'), "utils.formatarData segue para timestamp");
});

// ── 4) Varredura ─────────────────────────────────────────────────────────────
// Colunas do tipo DATE do banco (information_schema, tipo `date`). Interpolar uma delas crua em JSX, HTML de e-mail ou PDF mostra AAAA-MM-DD.
// `pago_em` é date em comissao_fechamentos e timestamptz em cobrancas_rs; `data` (km_registros, ponto_dias) é genérico demais: ficam de fora.
const COLUNAS_DATE = new Set([
  "cnh_data_emissao", "cnh_validade", "ctps_data_emissao", "data_exame_admissional", "data_nascimento", "pis_data_cadastramento", "rg_data_emissao", "data_admissao",
  "data_admissao_documentos_gerados", "ferias_proximo_periodo", "data_aplicacao", "alocacao_data_fim", "alocacao_data_inicio", "admissao_data_inicio",
  "data_entrevista_salmazos", "data_fim", "data_inicio", "garantia_data_fim", "data_fim_implantacao", "data_vencimento", "ocorrido_em", "data_exame", "data_evento",
  "data_lembrete", "proxima_acao_em", "periodo_fim", "periodo_inicio", "validade_ate", "aso_demissional_data_exame", "data_desligamento", "data_pagamento_guia",
  "data_pagamento_rescisao", "previsao_inicio", "prazo", "data_pagamento", "data_emissao_nf", "data_referencia", "pago_em",
]);
const RAIZ = process.env.VARREDURA_RAIZ ?? process.cwd();
type Excecao = { arquivo: string; expr: string; motivo: string };
// Lista FECHADA. Cada entrada é um nome que COINCIDE com o de uma coluna date, mas não é uma data.
const EXCECOES: Excecao[] = [
  { arquivo: "src/lib/emailsEquipe.ts", expr: "prazo", motivo: "prazo do SLA em DIAS ÚTEIS (número da configuração), não vagas.prazo (coluna date); vale para as duas ocorrências do e-mail de SLA" },
];
type Achado = { arquivo: string; linha: number; expr: string };
function varrer(raiz: string): Achado[] {
  const arquivos = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const TAG = /<\/?[a-z][a-z0-9]*[\s>/]/i;
  const achados: Achado[] = [];
  for (const f of arquivos(path.join(raiz, "src"))) {
    const rel = path.relative(raiz, f).replace(/\\/g, "/");
    const src = fs.readFileSync(f, "utf8");
    if (!/tsx$|Pdf|pdf|email|Email|html|Html|route/.test(rel) && !/drawField|formFieldRow/.test(src)) continue;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const nomeDe = (x: ts.Node): string | null => (ts.isPropertyAccessExpression(x) ? x.name.text : ts.isIdentifier(x) ? x.text : null);
    // true = a expressão não mostra uma coluna date crua
    const seguro = (e: ts.Expression): boolean => {
      if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) return seguro(e.expression);
      if (ts.isCallExpression(e)) return true; // chamada (dataBR, formatarData, toLocale..., .split().reverse()): não é a coluna crua
      if (ts.isConditionalExpression(e)) return seguro(e.whenTrue) && seguro(e.whenFalse);
      if (ts.isBinaryExpression(e)) {
        const op = e.operatorToken.kind;
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) return seguro(e.right);
        if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return seguro(e.left) && seguro(e.right);
        return true;
      }
      const nome = nomeDe(e);
      return !(nome && COLUNAS_DATE.has(nome));
    };
    const jaVistos = new Set<string>();
    const anota = (e: ts.Expression) => {
      const chave = e.getStart() + ":" + e.getText();
      if (jaVistos.has(chave) || seguro(e)) return;
      jaVistos.add(chave);
      achados.push({ arquivo: rel, linha: sf.getLineAndCharacterOfPosition(e.getStart()).line + 1, expr: e.getText().replace(/\s+/g, " ").slice(0, 80) });
    };
    // além da própria expressão, entra nos ${...} de templates que estejam dentro dela (ex.: cond ? `Val. ${x}` : "")
    const registra = (e: ts.Expression) => {
      anota(e);
      const desce = (nd: ts.Node) => { if (ts.isTemplateExpression(nd)) for (const sp of nd.templateSpans) anota(sp.expression); ts.forEachChild(nd, desce); };
      desce(e);
    };
    const visita = (nd: ts.Node) => {
      // texto de JSX: {expr}
      if (ts.isJsxExpression(nd) && nd.expression && (ts.isJsxElement(nd.parent) || ts.isJsxFragment(nd.parent))) registra(nd.expression);
      // atributos que viram texto na tela (value/label/children) de componentes de exibição (não de formulário)
      if (ts.isJsxAttribute(nd) && nd.initializer && ts.isJsxExpression(nd.initializer) && nd.initializer.expression && /^(value|valor|texto|subtitle|detail)$/.test(nd.name.getText())) {
        const tag = nd.parent.parent;
        const nomeTag = ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag) ? tag.tagName.getText() : "";
        if (!/^(input|textarea|select|option|QRCodeSVG|Campo\w*|Input\w*|Select\w*)$/.test(nomeTag)) registra(nd.initializer.expression);
      }
      // HTML de e-mail e texto de mensagem: ${expr} em template literal com tag HTML
      if (ts.isTemplateExpression(nd)) {
        const literais = [nd.head.text, ...nd.templateSpans.map((s) => s.literal.text)].join("");
        if (TAG.test(literais)) for (const s of nd.templateSpans) registra(s.expression);
      }
      // PDF: drawField("rótulo", valor), drawText(valor) e { label, value } de formFieldRow
      if (ts.isCallExpression(nd) && /^(drawField|drawText)$/.test(ts.isPropertyAccessExpression(nd.expression) ? nd.expression.name.text : ts.isIdentifier(nd.expression) ? nd.expression.text : "")) for (const a of nd.arguments) { registra(a); if (ts.isTemplateExpression(a)) for (const sp of a.templateSpans) registra(sp.expression); }
      if (ts.isPropertyAssignment(nd) && nd.name.getText() === "value" && /pdf|Pdf/i.test(rel)) registra(nd.initializer);
      // template literal passado a drawField/drawText (ex.: Val. ${...})
      ts.forEachChild(nd, visita);
    };
    visita(sf);
  }
  // dentro de template literals de PDF (drawField com `...${x}...`)
  return achados;
}

await ok("VARREDURA: nenhuma coluna `date` interpolada crua em JSX, HTML de e-mail ou PDF (lista fechada de exceções justificadas)", () => {
  const achados = varrer(RAIZ);
  const usadas = new Set<Excecao>();
  const sobras = achados.filter((a) => {
    const ex = EXCECOES.find((x) => x.arquivo === a.arquivo && x.expr === a.expr);
    if (ex) { usadas.add(ex); return false; }
    return true;
  });
  assert.deepEqual(sobras.map((s) => `${s.arquivo}:${s.linha}  ${s.expr}`), [], "coluna date crua na tela/e-mail/PDF: formate com dataBR (ou justifique na lista)");
  assert.deepEqual(EXCECOES.filter((x) => !usadas.has(x)).map((x) => `${x.arquivo} ${x.expr}`), [], "exceção que não casa mais com nada (remova da lista)");
  assert.ok(EXCECOES.every((x) => x.motivo.length > 10), "toda exceção tem motivo");
});

console.log(`\n${n} verificações OK`);
