// Verificação dos helpers puros do e-mail da contabilidade (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-email-pacote-contabilidade.mts
import assert from "node:assert/strict";
import {
  escaparHtml, formatarDataBR, formatarSalario, saudacaoSaoPaulo, montarAssunto, montarLinhasDados,
  montarHtmlEmail, montarTextoEmail, nomeArquivoAnexo, podeEnviarAgora, resolverTempoContrato,
  montarLinhaEmpresa, LIMITE_ANEXO_EMAIL_BYTES, separarParaCc, deixariaSemCcAtivo, MSG_ULTIMO_CC, MSG_EMAIL_DUPLICADO,
  interpretarSecureSmtp, classificarErroEmail, mensagemErroCurta,
  MSG_ERRO_EMAIL_TIMEOUT, MSG_ERRO_EMAIL_AUTH, MSG_ERRO_EMAIL_OUTRO,
} from "../src/lib/emailPacoteContabilidade.ts";

let total = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message}`); process.exitCode = 1; }
}

caso("escaparHtml", () => assert.equal(escaparHtml(`<b>"A" & 'B'</b>`), "&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;"));
caso("formatarDataBR data pura sem deslocar fuso", () => assert.equal(formatarDataBR("2026-10-03"), "03/10/2026"));
caso("formatarDataBR 1º de janeiro", () => assert.equal(formatarDataBR("2026-01-01"), "01/01/2026"));
caso("formatarDataBR timestamp UTC 02:00 vira dia anterior em Brasília", () => assert.equal(formatarDataBR("2026-10-03T02:00:00Z"), "02/10/2026"));
caso("formatarDataBR vazio", () => assert.equal(formatarDataBR(null), ""));
caso("salário hora", () => assert.equal(formatarSalario(9.4, "hora"), "R$ 9,40 hora"));
caso("salário mensal", () => assert.equal(formatarSalario(1800, "mensal"), "R$ 1.800,00 mensal"));
caso("salário mensal com milhão e string numérica", () => assert.equal(formatarSalario("1234567.5", "mensal"), "R$ 1.234.567,50 mensal"));
caso("salário vazio", () => assert.equal(formatarSalario(null, "mensal"), ""));
// 2026-10-03: Brasília é UTC-3 (sem horário de verão)
caso("saudação 04:59 BRT = Boa noite", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T07:59:00Z")), "Boa noite"));
caso("saudação 05:00 BRT = Bom dia", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T08:00:00Z")), "Bom dia"));
caso("saudação 11:59 BRT = Bom dia", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T14:59:00Z")), "Bom dia"));
caso("saudação 12:00 BRT = Boa tarde", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T15:00:00Z")), "Boa tarde"));
caso("saudação 17:59 BRT = Boa tarde", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T20:59:00Z")), "Boa tarde"));
caso("saudação 18:00 BRT = Boa noite", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T21:00:00Z")), "Boa noite"));
caso("saudação meia-noite BRT = Boa noite", () => assert.equal(saudacaoSaoPaulo(new Date("2026-10-03T03:00:00Z")), "Boa noite"));
caso("assunto", () => assert.equal(montarAssunto("2026-10-03", "Maria da Silva"), "Admissão - 03/10/2026 - Maria da Silva"));
caso("nome do anexo", () => assert.equal(nomeArquivoAnexo("João D'Ávila  Çoelho"), "admissao-joao-d-avila-coelho.pdf"));
caso("nome do anexo vazio", () => assert.equal(nomeArquivoAnexo("!!!"), "admissao-pacote.pdf"));
caso("tempo de contrato: usa o do cliente", () => assert.equal(resolverTempoContrato(" 90 dias ", "padrão"), "90 dias"));
caso("tempo de contrato: padrão quando vazio", () => assert.equal(resolverTempoContrato("  ", "180 dias, prorrogável por mais 90 dias"), "180 dias, prorrogável por mais 90 dias"));
caso("linha de empresa", () => assert.equal(montarLinhaEmpresa("293", "SALMAZOS RH"), "293 - SALMAZOS RH"));

const base = {
  empresa: "324 - SALMAZOS RH E SERVICOS TERCEIRIZADOS LTDA", cliente: "Cliente <X> & Cia", dataInicio: "2026-10-05",
  nome: "Maria da Silva", funcao: "", salario: "R$ 9,40 hora", horario: null, telefone: "19 98990-1331", tempoContrato: "180 dias, prorrogável por mais 90 dias",
};
caso("linhas omitem vazias e mantêm Tempo de Contrato", () => {
  const rotulos = montarLinhasDados(base).map((l) => l.rotulo);
  assert.deepEqual(rotulos, ["Empresa", "Cliente", "Data de início", "Nome", "Salário", "Telefone", "Tempo de Contrato"]);
});
caso("Tempo de Contrato nunca fica vazio (linha existe mesmo com tudo vazio)", () => {
  const l = montarLinhasDados({ ...base, empresa: "", cliente: "", dataInicio: null, nome: "", salario: "", telefone: "" });
  assert.deepEqual(l.map((x) => x.rotulo), ["Tempo de Contrato"]);
});
caso("data de início em negrito", () => assert.ok(montarHtmlEmail("Bom dia", montarLinhasDados(base)).includes("<b>Data de início: 05/10/2026</b>")));
caso("html escapa valores", () => {
  const html = montarHtmlEmail("Bom dia", montarLinhasDados(base));
  assert.ok(html.includes("Cliente &lt;X&gt; &amp; Cia"));
  assert.ok(!html.includes("<X>"));
});
caso("html não leva CPF/documentos/centro de custo/setor", () => {
  const html = montarHtmlEmail("Boa tarde", montarLinhasDados(base)).toLowerCase();
  for (const proibido of ["cpf", "centro de custo", "setor", "rg:"]) assert.ok(!html.includes(proibido), proibido);
});
caso("texto simples", () => assert.ok(montarTextoEmail("Bom dia", montarLinhasDados(base)).startsWith("Bom dia,\n\nSegue abaixo novas informações para admissão:")));

const agora = Date.parse("2026-10-03T15:00:00Z");
caso("reenvio: nunca enviado pode", () => assert.equal(podeEnviarAgora(null, false, agora), true));
caso("reenvio: 9 min bloqueia", () => assert.equal(podeEnviarAgora("2026-10-03T14:51:00Z", false, agora), false));
caso("reenvio: exatamente 10 min libera", () => assert.equal(podeEnviarAgora("2026-10-03T14:50:00Z", false, agora), true));
caso("reenvio: 9 min com reenviar=true libera", () => assert.equal(podeEnviarAgora("2026-10-03T14:51:00Z", true, agora), true));
caso("limite do anexo = 15 MB", () => assert.equal(LIMITE_ANEXO_EMAIL_BYTES, 15 * 1024 * 1024));

const linhas = [
  { id: "1", email: "olverpera@gmail.com", copia: false, ativo: true },
  { id: "2", email: "consultoria@salmazos.com.br", copia: true, ativo: true },
  { id: "3", email: "rh@salmazos.com.br", copia: true, ativo: true },
  { id: "4", email: "inativo@x.com", copia: false, ativo: false },
  { id: "5", email: "cc-inativo@x.com", copia: true, ativo: false },
];
caso("Para = ativos copia=false; Cc = ativos copia=true", () => {
  const r = separarParaCc(linhas, "rh@salmazos.com.br");
  assert.deepEqual(r.para, ["olverpera@gmail.com"]);
  assert.deepEqual(r.cc, ["consultoria@salmazos.com.br", "rh@salmazos.com.br"]);
  assert.equal(r.usouCcMinimo, false);
});
caso("Cc vazio cai no mínimo e sinaliza", () => {
  const r = separarParaCc(linhas.filter((l) => !l.copia), "rh@salmazos.com.br");
  assert.deepEqual(r.cc, ["rh@salmazos.com.br"]);
  assert.equal(r.usouCcMinimo, true);
});
caso("Cc só com inativos também cai no mínimo", () => {
  const r = separarParaCc(linhas.filter((l) => !l.copia || !l.ativo), "rh@salmazos.com.br");
  assert.equal(r.usouCcMinimo, true);
});
caso("Para vazio fica vazio (o envio responde 400)", () => assert.deepEqual(separarParaCc(linhas.filter((l) => l.copia), "x@x.com").para, []));
caso("trava: com 2 Cc ativos pode remover/desativar um", () => assert.equal(deixariaSemCcAtivo(linhas, "2"), false));
caso("trava: último Cc ativo não pode sair", () => assert.equal(deixariaSemCcAtivo(linhas.filter((l) => l.id !== "2"), "3"), true));
caso("trava: Cc inativo pode ser removido mesmo sendo o único Cc", () => assert.equal(deixariaSemCcAtivo(linhas.filter((l) => l.id === "5"), "5"), false));
caso("trava: item do Para nunca é bloqueado", () => assert.equal(deixariaSemCcAtivo(linhas.filter((l) => !l.copia), "1"), false));
caso("trava: id inexistente não bloqueia", () => assert.equal(deixariaSemCcAtivo(linhas, "zzz"), false));
caso("mensagens exatas da trava e do duplicado", () => {
  assert.equal(MSG_ULTIMO_CC, "É obrigatório manter pelo menos um e-mail em Cópia (Cc) ativo.");
  assert.equal(MSG_EMAIL_DUPLICADO, "Este e-mail já está cadastrado em Para ou Cc.");
});

for (const [valor, porta, esperado] of [
  ["true", 587, true], ["True", 587, true], [" TRUE ", 587, true], ["1", 587, true], ["yes", 587, true], [" Yes ", 25, true],
  ["false", 465, false], ["FALSE", 587, false], ["0", 465, false], ["no", 465, false],
  ["", 465, true], [undefined, 465, true], ["", 587, false], [undefined, 587, false], ["talvez", 465, true], ["talvez", 587, false],
] as [string | undefined, number, boolean][]) {
  caso(`SECURE ${JSON.stringify(valor)} porta ${porta} => ${esperado}`, () => assert.equal(interpretarSecureSmtp(valor, porta), esperado));
}
for (const cod of ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNRESET", "etimedout"]) {
  caso(`erro ${cod} => timeout`, () => assert.deepEqual(classificarErroEmail(cod), { tipo: "timeout", mensagem: MSG_ERRO_EMAIL_TIMEOUT }));
}
caso("erro EAUTH => autenticação", () => assert.deepEqual(classificarErroEmail("EAUTH"), { tipo: "autenticacao", mensagem: MSG_ERRO_EMAIL_AUTH }));
caso("erro desconhecido/sem código => outro", () => {
  assert.deepEqual(classificarErroEmail("EENVELOPE"), { tipo: "outro", mensagem: MSG_ERRO_EMAIL_OUTRO });
  assert.deepEqual(classificarErroEmail(undefined), { tipo: "outro", mensagem: MSG_ERRO_EMAIL_OUTRO });
});
caso("mensagens dos três casos", () => {
  assert.equal(MSG_ERRO_EMAIL_TIMEOUT, "Tempo esgotado ao conectar ao servidor de e-mail");
  assert.equal(MSG_ERRO_EMAIL_AUTH, "Falha de autenticação no servidor de e-mail");
  assert.equal(MSG_ERRO_EMAIL_OUTRO, "Não foi possível enviar o e-mail");
});
caso("log curto mascara segredos e limita tamanho", () => {
  const m = mensagemErroCurta("EAUTH", "Invalid login for usuario@x.com: senha-super-secreta rejeitada", ["usuario@x.com", "senha-super-secreta"]);
  assert.equal(m, "[EAUTH] Invalid login for ***: *** rejeitada");
  assert.ok(!m.includes("senha-super-secreta") && !m.includes("usuario@x.com"));
  assert.ok(mensagemErroCurta("X", "a".repeat(500)).length <= 200);
});

console.log(`\n${total} casos passaram${process.exitCode ? " (HOUVE FALHAS)" : ""}`);
