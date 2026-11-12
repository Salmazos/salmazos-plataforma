// Verificação do e-mail da contabilidade: helpers puros e a rota pacote/enviar-email (banco em memória, e-mail e storage simulados do harness).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-email-pacote-contabilidade.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { importar, chamar, novoDb, logar } from "./harness-mot/ambiente.mjs";
import { textoDiasTesteParaContabilidade, TEXTO_DIAS_TESTE_NAO_INFORMADO } from "../src/lib/diasTeste.ts";
import { admissaoEnviarEmailContabilidadeSchema } from "../src/lib/schemas.ts";
import {
  escaparHtml, formatarDataBR, formatarSalario, saudacaoSaoPaulo, montarAssunto, montarLinhasDados,
  montarHtmlEmail, montarTextoEmail, nomeArquivoAnexo, podeEnviarAgora, resolverTempoContrato,
  montarLinhaEmpresa, LIMITE_ANEXO_EMAIL_BYTES, separarParaCc, deixariaSemCcAtivo, MSG_ULTIMO_CC, MSG_EMAIL_DUPLICADO,
  interpretarSecureSmtp, classificarErroEmail, mensagemErroCurta,
  MSG_ERRO_EMAIL_TIMEOUT, MSG_ERRO_EMAIL_AUTH, MSG_ERRO_EMAIL_OUTRO,
  sanitizarCampoEmail, validarCamposEmail, montarAssuntoDeCampos, montarLinhasDeCampos, listarCamposEditados, avisosCamposFaltando,
  interpretarValorBR, numeroParaBR, formatarTelefoneEmail, dataISOValida,
  formatarAdicionaisEmail, salarioComAdicionaisEmail,
  type ContextoDiasTeste,
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

// ── Campos editáveis ─────────────────────────────────────────────────────────────────────────────
const PADRAO = "180 dias, prorrogável por mais 90 dias";
const original = { nome: "Maria da Silva", funcao: "Auxiliar", salarioValor: 9.4, salarioTipo: "hora", horario: "07h às 16h", telefone: "19 98990-1331", dataInicio: "2026-10-05", tempoContrato: "" };

caso("sanitizar: quebra de linha e controle viram espaço, colapsa e apara", () => assert.equal(sanitizarCampoEmail("  Maria\r\nBcc: x@y.com\t\u0000da   Silva \u2028", 120), "Maria Bcc: x@y.com da Silva"));
caso("sanitizar: limita o tamanho", () => assert.equal(sanitizarCampoEmail("a".repeat(300), 120).length, 120));
caso("sanitizar: null/undefined => vazio", () => { assert.equal(sanitizarCampoEmail(null, 10), ""); assert.equal(sanitizarCampoEmail(undefined, 10), ""); });
caso("nome com quebra de linha NÃO chega ao assunto", () => {
  const v = validarCamposEmail({ ...original, nome: "Maria\r\nBcc: atacante@x.com" });
  const assunto = montarAssuntoDeCampos(v.camposNormalizados);
  assert.ok(!/[\r\n]/.test(assunto));
  assert.equal(assunto, "Admissão - 05/10/2026 - Maria Bcc: atacante@x.com");
});
caso("validar: tudo certo", () => { const v = validarCamposEmail(original); assert.equal(v.ok, true); assert.deepEqual(v.erros, []); });
caso("validar: nome vazio", () => { const v = validarCamposEmail({ ...original, nome: "   " }); assert.equal(v.ok, false); assert.ok(v.erros.includes("Informe o nome.")); });
caso("validar: data inválida (31/02, formato errado) e vazia ok", () => {
  assert.equal(validarCamposEmail({ ...original, dataInicio: "2026-02-31" }).ok, false);
  assert.equal(validarCamposEmail({ ...original, dataInicio: "05/10/2026" }).ok, false);
  assert.equal(validarCamposEmail({ ...original, dataInicio: "" }).ok, true);
  assert.equal(dataISOValida("2028-02-29"), true);
  assert.equal(dataISOValida("2027-02-29"), false);
});
caso("validar: salário sem tipo", () => { const v = validarCamposEmail({ ...original, salarioTipo: null }); assert.equal(v.ok, false); assert.ok(v.erros.some((e) => e.includes("por hora ou mensal"))); });
caso("validar: salário tipo inválido", () => assert.equal(validarCamposEmail({ ...original, salarioTipo: "semanal" }).ok, false));
caso("validar: salário negativo, NaN e infinito", () => {
  assert.equal(validarCamposEmail({ ...original, salarioValor: -1 }).ok, false);
  assert.equal(validarCamposEmail({ ...original, salarioValor: NaN }).ok, false);
  assert.equal(validarCamposEmail({ ...original, salarioValor: Infinity }).ok, false);
});
caso("validar: salário zero é válido; vazio (null) dispensa o tipo", () => {
  assert.equal(validarCamposEmail({ ...original, salarioValor: 0 }).ok, true);
  const v = validarCamposEmail({ ...original, salarioValor: null, salarioTipo: null });
  assert.equal(v.ok, true);
  assert.equal(v.camposNormalizados.salarioValor, null);
  assert.equal(v.camposNormalizados.salarioTipo, null);
});
caso("validar: telefone só dígitos é formatado (11 e 10 dígitos)", () => {
  assert.equal(validarCamposEmail({ ...original, telefone: "19989901331" }).camposNormalizados.telefone, "19 98990-1331");
  assert.equal(validarCamposEmail({ ...original, telefone: "1932211234" }).camposNormalizados.telefone, "19 3221-1234");
  assert.equal(formatarTelefoneEmail("(19) 98990-1331"), "19 98990-1331");
});
caso("validar: telefone fora de 10/11 dígitos fica como digitado", () => assert.equal(validarCamposEmail({ ...original, telefone: "ramal 123" }).camposNormalizados.telefone, "ramal 123"));
caso("validar: entrada não-objeto não quebra", () => { assert.equal(validarCamposEmail(null).ok, false); assert.equal(validarCamposEmail("x").ok, false); });
caso("valor BR: interpretar e formatar", () => {
  assert.equal(interpretarValorBR("1.800,00"), 1800);
  assert.equal(interpretarValorBR("9,40"), 9.4);
  assert.equal(interpretarValorBR("R$ 9,4"), 9.4);
  assert.equal(interpretarValorBR("1800"), 1800);
  assert.equal(interpretarValorBR(""), null);
  assert.ok(Number.isNaN(interpretarValorBR("abc") as number));
  assert.ok(Number.isNaN(interpretarValorBR("1.80,0") as number));
  assert.equal(numeroParaBR(1800), "1.800,00");
  assert.equal(numeroParaBR(9.4), "9,40");
  assert.equal(numeroParaBR(null), "");
});
caso("assunto e anexo com nome editado", () => {
  const v = validarCamposEmail({ ...original, nome: "José D'Ávila Júnior", dataInicio: "2026-11-02" }).camposNormalizados;
  assert.equal(montarAssuntoDeCampos(v), "Admissão - 02/11/2026 - José D'Ávila Júnior");
  assert.equal(nomeArquivoAnexo(v.nome), "admissao-jose-d-avila-junior.pdf");
});
caso("linhas: vazias omitidas, salário formatado, tempo de contrato padrão quando vazio", () => {
  const v = validarCamposEmail({ ...original, funcao: "", horario: "", telefone: "" }).camposNormalizados;
  const l = montarLinhasDeCampos(v, "293 - EMPRESA", "Cliente X", PADRAO);
  assert.deepEqual(l.map((x) => x.rotulo), ["Empresa", "Cliente", "Data de início", "Nome", "Salário", "Tempo de Contrato"]);
  assert.equal(l.find((x) => x.rotulo === "Salário")?.valor, "R$ 9,40 hora");
  assert.equal(l.find((x) => x.rotulo === "Tempo de Contrato")?.valor, PADRAO);
});
caso("linhas: Empresa/Cliente vêm do servidor e Tempo de Contrato digitado prevalece", () => {
  const v = validarCamposEmail({ ...original, tempoContrato: "90 dias" }).camposNormalizados;
  const l = montarLinhasDeCampos(v, "324 - OUTRA", "Cliente Y", PADRAO);
  assert.equal(l.find((x) => x.rotulo === "Empresa")?.valor, "324 - OUTRA");
  assert.equal(l.find((x) => x.rotulo === "Cliente")?.valor, "Cliente Y");
  assert.equal(l.find((x) => x.rotulo === "Tempo de Contrato")?.valor, "90 dias");
});
caso("listarCamposEditados: sem mudança => []", () => assert.deepEqual(listarCamposEditados(original, { ...original }), []));
caso("listarCamposEditados: ignora diferença só de formatação/espaços", () =>
  assert.deepEqual(listarCamposEditados(original, { ...original, nome: "  Maria   da Silva ", telefone: "19989901331" }), []));
caso("listarCamposEditados: nomes dos campos que mudaram", () =>
  assert.deepEqual(listarCamposEditados(original, { ...original, nome: "Maria Souza", horario: "08h às 17h", dataInicio: "2026-10-06", tempoContrato: "90 dias" }), ["nome", "horario", "dataInicio", "tempoContrato"]));
caso("listarCamposEditados: salário (valor ou tipo) e telefone/função", () => {
  assert.deepEqual(listarCamposEditados(original, { ...original, salarioValor: 10 }), ["salario"]);
  assert.deepEqual(listarCamposEditados(original, { ...original, salarioTipo: "mensal" }), ["salario"]);
  assert.deepEqual(listarCamposEditados(original, { ...original, funcao: "Op.", telefone: "19 3221-1234" }), ["funcao", "telefone"]);
});
caso("listarCamposEditados: trocar o tipo não conta se o salário está vazio nos dois", () =>
  assert.deepEqual(listarCamposEditados({ ...original, salarioValor: null, salarioTipo: null }, { ...original, salarioValor: null, salarioTipo: "hora" }), []));
caso("avisos sobre valores editados", () => {
  const v = validarCamposEmail({ ...original, funcao: "", salarioValor: null, salarioTipo: null }).camposNormalizados;
  assert.deepEqual(avisosCamposFaltando(v, "293 - E", "Cli"), ["Função não preenchida.", "Salário não preenchido."]);
  assert.deepEqual(avisosCamposFaltando(v, "", ""), ["Empresa (entidade contratante) não definida.", "Cliente não encontrado.", "Função não preenchida.", "Salário não preenchido."]);
});

// ── Dias de teste no e-mail (só MOT e Terceirização; R&S sem a linha) ──────────────────────────────────────────────────────
const MOT = "mao_obra_temporaria", TERC = "terceirizacao", RS = "recrutamento_selecao";
const ctx = (tipoServico: string | null, legado: string | null = null): ContextoDiasTeste => ({ tipoServico, legado });
const linhaDias = (c: unknown, dias: ContextoDiasTeste | null) => montarLinhasDeCampos(validarCamposEmail(c).camposNormalizados, "293 - EMPRESA", "Cliente X", PADRAO, dias).find((l) => l.rotulo === "Dias de teste")?.valor;

caso("texto: MOT 1 dia / 2 dias / 0 não houve / null não informado", () => {
  assert.equal(textoDiasTesteParaContabilidade(1, null, MOT), "1 dia");
  assert.equal(textoDiasTesteParaContabilidade(2, null, MOT), "2 dias");
  assert.equal(textoDiasTesteParaContabilidade(0, null, MOT), "Não houve");
  assert.equal(textoDiasTesteParaContabilidade(null, null, MOT), "Não informado pelo cliente");
  assert.equal(TEXTO_DIAS_TESTE_NAO_INFORMADO, "Não informado pelo cliente");
});
caso("texto: Terceirização segue a mesma regra", () => {
  assert.equal(textoDiasTesteParaContabilidade(2, null, TERC), "2 dias");
  assert.equal(textoDiasTesteParaContabilidade(null, null, TERC), "Não informado pelo cliente");
});
caso("texto: sem quantidade, o texto ANTIGO aparece como foi digitado (aparado); com quantidade, o antigo é ignorado", () => {
  assert.equal(textoDiasTesteParaContabilidade(null, "  meio período no dia 10  ", MOT), "meio período no dia 10");
  assert.equal(textoDiasTesteParaContabilidade(undefined, "1 dia (sábado)", TERC), "1 dia (sábado)");
  assert.equal(textoDiasTesteParaContabilidade(0, "texto antigo", MOT), "Não houve");
  assert.equal(textoDiasTesteParaContabilidade(null, "   ", MOT), "Não informado pelo cliente");
});
caso("texto: R&S e tipo desconhecido NUNCA levam a linha (nem com valor perdido na coluna nem com texto antigo)", () => {
  for (const t of [RS, null, undefined, "avaliacao_psicologica", ""]) {
    assert.equal(textoDiasTesteParaContabilidade(2, "texto", t as string | null), null, String(t));
    assert.equal(textoDiasTesteParaContabilidade(null, null, t as string | null), null, String(t));
  }
});
caso("texto: valor fora de 0..2 ou não inteiro vale como não informado (nunca imprime lixo)", () => {
  for (const v of [3, -1, 1.5, "2", NaN, {}]) assert.equal(textoDiasTesteParaContabilidade(v, null, MOT), "Não informado pelo cliente", String(v));
});
caso("linhas: MOT com 1 dia, 2 dias, 0, null e texto legado", () => {
  assert.equal(linhaDias({ ...original, diasTeste: 1 }, ctx(MOT)), "1 dia");
  assert.equal(linhaDias({ ...original, diasTeste: 2 }, ctx(MOT)), "2 dias");
  assert.equal(linhaDias({ ...original, diasTeste: 0 }, ctx(MOT)), "Não houve");
  assert.equal(linhaDias({ ...original, diasTeste: null }, ctx(MOT)), "Não informado pelo cliente");
  assert.equal(linhaDias({ ...original }, ctx(MOT)), "Não informado pelo cliente", "campo ausente = não informado");
  assert.equal(linhaDias({ ...original, diasTeste: null }, ctx(MOT, "teste de 1 dia, pago à parte")), "teste de 1 dia, pago à parte");
  assert.equal(linhaDias({ ...original, diasTeste: 2 }, ctx(TERC)), "2 dias");
});
caso("linhas: R&S, tipo desconhecido e chamada sem contexto (como antes) não têm a linha", () => {
  assert.equal(linhaDias({ ...original, diasTeste: 2 }, ctx(RS)), undefined);
  assert.equal(linhaDias({ ...original, diasTeste: 2 }, ctx(null)), undefined);
  assert.equal(linhaDias({ ...original, diasTeste: 2 }, null), undefined);
  assert.equal(linhaDias({ ...original, diasTeste: 2 }, undefined as unknown as null), undefined);
});
caso("ordem: 'Dias de teste' vem logo DEPOIS de 'Tempo de Contrato' (lista, HTML e texto), e a linha de dias é a última antes da assinatura", () => {
  const l = montarLinhasDeCampos(validarCamposEmail({ ...original, diasTeste: 1 }).camposNormalizados, "293 - E", "Cli", PADRAO, ctx(MOT));
  const rot = l.map((x) => x.rotulo);
  assert.equal(rot.indexOf("Dias de teste"), rot.indexOf("Tempo de Contrato") + 1);
  assert.equal(rot[rot.length - 1], "Dias de teste");
  const html = montarHtmlEmail("Bom dia", l);
  assert.ok(html.indexOf("Dias de teste: 1 dia") > html.indexOf("Tempo de Contrato:"));
  assert.ok(html.indexOf("Dias de teste: 1 dia") < html.indexOf("Salmazos RH"));
  assert.ok(html.includes('<p style="margin:0 0 6px">Dias de teste: 1 dia</p>'), "sem negrito, como as demais");
  const txt = montarTextoEmail("Bom dia", l).split("\n");
  assert.equal(txt[txt.indexOf("Dias de teste: 1 dia") - 1].startsWith("Tempo de Contrato: "), true);
  assert.deepEqual(txt.slice(-3), ["Dias de teste: 1 dia", "", "Salmazos RH"]);
});
caso("linhas sem a de dias: HTML/texto idênticos aos de antes (R&S não muda nada)", () => {
  const l = montarLinhasDeCampos(validarCamposEmail({ ...original, diasTeste: 2 }).camposNormalizados, "293 - E", "Cli", PADRAO, ctx(RS));
  assert.equal(l[l.length - 1].rotulo, "Tempo de Contrato");
  assert.equal(montarHtmlEmail("Bom dia", l).includes("Dias de teste"), false);
  assert.equal(montarTextoEmail("Bom dia", l).includes("Dias de teste"), false);
});
caso("validar: dias de teste aceita vazio/null, 0, 1, 2 (número ou texto numérico) e RECUSA o resto", () => {
  for (const v of [undefined, null, ""]) { const r = validarCamposEmail({ ...original, diasTeste: v }); assert.equal(r.ok, true); assert.equal(r.camposNormalizados.diasTeste, null); }
  for (const [v, esperado] of [[0, 0], [1, 1], [2, 2], ["0", 0], ["1", 1], [" 2 ", 2]] as const) { const r = validarCamposEmail({ ...original, diasTeste: v }); assert.equal(r.ok, true, String(v)); assert.equal(r.camposNormalizados.diasTeste, esperado); }
  for (const v of [3, -1, 1.5, "abc", "3", "1.5", "-1", NaN, Infinity, true, {}, []]) {
    const r = validarCamposEmail({ ...original, diasTeste: v });
    assert.equal(r.ok, false, `${String(v)} deveria ser recusado`);
    assert.ok(r.erros.some((e) => e.startsWith("Dias de teste inválido")), String(v));
    assert.equal(r.camposNormalizados.diasTeste, null, "nunca guarda o valor inválido");
  }
});
caso("edição: listarCamposEditados acusa só 'diasTeste' (e a edição não muda o objeto do cadastro)", () => {
  const cad = { ...original, diasTeste: 1 }; const copia = JSON.stringify(cad);
  assert.deepEqual(listarCamposEditados(cad, { ...cad, diasTeste: 2 }), ["diasTeste"]);
  assert.deepEqual(listarCamposEditados(cad, { ...cad, diasTeste: null }), ["diasTeste"]);
  assert.deepEqual(listarCamposEditados(cad, { ...cad, diasTeste: 0 }), ["diasTeste"]);
  assert.deepEqual(listarCamposEditados(cad, { ...cad, diasTeste: "1" }), [], "mesmo valor, outra forma: não conta como edição");
  assert.deepEqual(listarCamposEditados(cad, { ...cad, nome: "Maria Souza", diasTeste: 2 }), ["nome", "diasTeste"]);
  assert.equal(JSON.stringify(cad), copia);
  assert.deepEqual(listarCamposEditados({ ...original }, { ...original, diasTeste: null }), [], "ausente e null são iguais");
});
caso("aviso: só quando a linha dirá 'Não informado pelo cliente' (MOT/Terc, sem quantidade e sem texto antigo); não bloqueia", () => {
  const aviso = (dias: number | null, c: ContextoDiasTeste | null) => avisosCamposFaltando(validarCamposEmail({ ...original, diasTeste: dias }).camposNormalizados, "293 - E", "Cli", c).filter((a) => a.startsWith("Dias de teste"));
  assert.deepEqual(aviso(null, ctx(MOT)), ["Dias de teste não informado pelo cliente: o e-mail vai dizer “Não informado pelo cliente”."]);
  assert.equal(aviso(null, ctx(TERC)).length, 1);
  for (const [d, c] of [[0, ctx(MOT)], [1, ctx(MOT)], [2, ctx(TERC)], [null, ctx(MOT, "texto antigo")], [null, ctx(RS)], [null, ctx(null)], [null, null]] as const) assert.deepEqual(aviso(d, c), [], `${d}/${JSON.stringify(c)}`);
  // a chamada antiga (3 argumentos) não ganha aviso novo
  assert.deepEqual(avisosCamposFaltando(validarCamposEmail({ ...original }).camposNormalizados, "293 - E", "Cli"), []);
});
caso("schema do POST: diasTeste só 0, 1, 2 ou null; ausente passa; 3, -1, 1.5 e texto são recusados", () => {
  const ok = (v: unknown) => admissaoEnviarEmailContabilidadeSchema.safeParse({ campos: { nome: "A", diasTeste: v } }).success;
  for (const v of [0, 1, 2, null, undefined]) assert.equal(ok(v), true, String(v));
  for (const v of [3, -1, 1.5, "1", NaN, true]) assert.equal(ok(v), false, String(v));
  assert.equal(admissaoEnviarEmailContabilidadeSchema.safeParse({ campos: { nome: "A" } }).success, true);
});

// ── Rota pacote/enviar-email (banco em memória; e-mail e storage simulados) ──────────────────────────────────────────────
const R = await importar("src/app/api/admissoes/[id]/pacote/enviar-email/route.ts");
const ADM = "dddddddd-0000-4000-8000-000000000001", CAND = "dddddddd-0000-4000-8000-000000000002", VAGA = "dddddddd-0000-4000-8000-000000000003", PDF = `pacotes-contabilidade/${ADM}/pacote.pdf`;
function cenarioRota(o: { tipoVaga: string; qtd: number | null; legado?: string | null; encaminhamento?: string | null }) {
  const db = novoDb(); logar(db, "dir");
  db.tabelas.admissoes = [{ id: ADM, candidato_id: CAND, vaga_id: VAGA, unidade_id: "U1", pdf_pacote_path: PDF, data_admissao: "2026-11-16", funcao: "Auxiliar de Produção", salario: 1800, tipo_salario: "mensal", horario_trabalho: "Segunda a sexta", entidade_contratante: "recrutamento_selecao_terceirizacao", pacote_enviado_email_em: null }];
  db.tabelas.candidatos = [{ id: CAND, nome_completo: "Maria Exemplo", telefone: "19999990000" }];
  db.tabelas.vagas = [{ id: VAGA, cliente_id: "C1", tipo_servico: o.tipoVaga }];
  db.tabelas.admissao_dados_pessoais = [{ admissao_id: ADM, nome_completo: "Maria Exemplo", telefone: "19999990000" }];
  db.tabelas.candidatos_vagas = [{ id: "cv1", candidato_id: CAND, vaga_id: VAGA, admissao_data_inicio: null, admissao_tempo_contrato: null, admissao_qtd_dias_teste: o.qtd, admissao_dia_teste: o.legado ?? null }];
  db.tabelas.admissao_contabilidade_email_destinatarios = [{ nome: "Contab", email: "contab@x.com", copia: false, ativo: true }, { nome: "RH", email: "rh@x.com", copia: true, ativo: true }];
  db.tabelas.encaminhamentos = o.encaminhamento ? [{ candidato_id: CAND, vaga_id: VAGA, tipo_servico: o.encaminhamento, created_at: "2026-11-01T10:00:00Z" }] : [];
  db.tabelas.audit_logs = []; db.emails = []; db.arquivos = { [PDF]: Buffer.from("%PDF-1.4 teste") };
  return db;
}
const preview = (db: any) => { logar(db, "dir"); return chamar(R.GET, { params: { id: ADM } }); };
const enviar = (db: any, campos: Record<string, unknown>) => { logar(db, "dir"); return chamar(R.POST, { metodo: "POST", params: { id: ADM }, corpo: { campos } }); };
async function casoRota(nome: string, fn: () => Promise<void>) {
  try { await fn(); total++; console.log(`OK    ${nome}`); } catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message}`); process.exitCode = 1; }
}
const dadosLinhas = (corpo: any) => corpo.linhas.map((l: any) => `${l.rotulo}: ${l.valor}`);

await casoRota("rota GET: MOT com 1 dia mostra a linha depois de Tempo de Contrato e o contexto para o modal", async () => {
  const r = await preview(cenarioRota({ tipoVaga: MOT, qtd: 1 }));
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(dadosLinhas(r.corpo).slice(-2), ["Tempo de Contrato: 180 dias, prorrogável por mais 90 dias", "Dias de teste: 1 dia"]);
  assert.deepEqual(r.corpo.diasTeste, { exige: true, tipoServico: MOT, legado: null });
  assert.equal(r.corpo.campos.diasTeste, 1);
  assert.ok(r.corpo.corpoHtml.includes("Dias de teste: 1 dia") && r.corpo.corpoTexto.includes("Dias de teste: 1 dia"));
  assert.deepEqual(r.corpo.avisos, []);
});
await casoRota("rota GET: 2 dias, 0 (Não houve), null (aviso amarelo), texto legado e Terceirização", async () => {
  assert.ok((await preview(cenarioRota({ tipoVaga: MOT, qtd: 2 }))).corpo.corpoTexto.includes("Dias de teste: 2 dias"));
  assert.ok((await preview(cenarioRota({ tipoVaga: MOT, qtd: 0 }))).corpo.corpoTexto.includes("Dias de teste: Não houve"));
  const nulo = (await preview(cenarioRota({ tipoVaga: MOT, qtd: null }))).corpo;
  assert.ok(nulo.corpoTexto.includes("Dias de teste: Não informado pelo cliente"));
  assert.ok(nulo.avisos.some((a: string) => a.startsWith("Dias de teste não informado pelo cliente")));
  const legado = (await preview(cenarioRota({ tipoVaga: MOT, qtd: null, legado: "  1 dia no sábado " }))).corpo;
  assert.ok(legado.corpoTexto.includes("Dias de teste: 1 dia no sábado") && legado.diasTeste.legado === "1 dia no sábado");
  assert.deepEqual(legado.avisos, [], "com texto antigo não há aviso");
  const terc = (await preview(cenarioRota({ tipoVaga: TERC, qtd: 2 }))).corpo;
  assert.ok(terc.corpoTexto.includes("Dias de teste: 2 dias") && terc.diasTeste.exige === true);
});
await casoRota("rota GET: R&S não tem a linha nem o campo (mesmo com valor na coluna), e o corpo é o de antes", async () => {
  const r = (await preview(cenarioRota({ tipoVaga: RS, qtd: 2, legado: "texto antigo" }))).corpo;
  assert.equal(r.corpoHtml.includes("Dias de teste") || r.corpoTexto.includes("Dias de teste"), false);
  assert.equal(r.diasTeste.exige, false);
  assert.equal(dadosLinhas(r).at(-1), "Tempo de Contrato: 180 dias, prorrogável por mais 90 dias");
  assert.deepEqual(r.avisos, []);
});
await casoRota("rota: o tipo de serviço VIGENTE (encaminhamento mais recente) decide, não só o da vaga", async () => {
  const viraMot = (await preview(cenarioRota({ tipoVaga: RS, qtd: 1, encaminhamento: MOT }))).corpo;
  assert.equal(viraMot.diasTeste.exige, true); assert.ok(viraMot.corpoTexto.includes("Dias de teste: 1 dia"));
  const viraRs = (await preview(cenarioRota({ tipoVaga: MOT, qtd: 1, encaminhamento: RS }))).corpo;
  assert.equal(viraRs.diasTeste.exige, false); assert.equal(viraRs.corpoTexto.includes("Dias de teste"), false);
});
await casoRota("rota POST: sem edição, o e-mail sai com o valor do cadastro (1 dia) depois de Tempo de Contrato, HTML e anexo/Cc como antes", async () => {
  const db = cenarioRota({ tipoVaga: MOT, qtd: 1 });
  const g = (await preview(db)).corpo;
  const r = await enviar(db, g.campos);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const e = db.emails[0];
  assert.ok(e.html.indexOf("Dias de teste: 1 dia") > e.html.indexOf("Tempo de Contrato:") && e.html.indexOf("Dias de teste: 1 dia") < e.html.indexOf("Salmazos RH"));
  assert.deepEqual([e.to, e.cc, e.anexos, e.tipo], ["contab@x.com", "rh@x.com", ["admissao-maria-exemplo.pdf"], "pacote_contabilidade"]);
  const aud = db.tabelas.audit_logs.find((a: any) => a.acao === "admissao_pacote_enviado_email");
  assert.deepEqual(aud.detalhes.campos_editados_nomes, []);
});
await casoRota("rota POST: editar os dias de teste no modal vale SÓ para o e-mail (nada gravado no cadastro) e a auditoria guarda só o NOME do campo", async () => {
  const db = cenarioRota({ tipoVaga: MOT, qtd: 1, legado: "antigo" });
  // Foto do cadastro, sem os 3 campos que o envio registra de propósito (pacote_enviado_email_*).
  const cadastro = () => structuredClone({
    cv: db.tabelas.candidatos_vagas, cand: db.tabelas.candidatos, dp: db.tabelas.admissao_dados_pessoais, vagas: db.tabelas.vagas,
    adm: db.tabelas.admissoes.map(({ pacote_enviado_email_em: _a, pacote_enviado_email_por: _b, pacote_enviado_email_para: _c, ...resto }: any) => resto),
  });
  const antes = cadastro();
  const g = (await preview(db)).corpo;
  const r = await enviar(db, { ...g.campos, diasTeste: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(db.emails[0].html.includes("Dias de teste: 2 dias"));
  assert.deepEqual(cadastro(), antes, "cadastro intacto");
  assert.equal(db.tabelas.candidatos_vagas[0].admissao_qtd_dias_teste, 1);
  const aud = db.tabelas.audit_logs.find((a: any) => a.acao === "admissao_pacote_enviado_email");
  assert.deepEqual(aud.detalhes.campos_editados_nomes, ["diasTeste"]);
  assert.equal(JSON.stringify(aud).includes("2 dias"), false);
  // trocar para "Não informado" (null) com texto antigo no cadastro: o e-mail mostra o texto antigo
  const db2 = cenarioRota({ tipoVaga: MOT, qtd: 1, legado: "antigo" });
  await enviar(db2, { ...(await preview(db2)).corpo.campos, diasTeste: null });
  assert.ok(db2.emails[0].html.includes("Dias de teste: antigo"));
});
await casoRota("rota POST: valor inválido é RECUSADO no servidor (400) e nada é enviado nem gravado", async () => {
  for (const v of [3, -1, 1.5, "abc", true]) {
    const db = cenarioRota({ tipoVaga: MOT, qtd: 1 });
    const g = (await preview(db)).corpo;
    const r = await enviar(db, { ...g.campos, diasTeste: v });
    assert.equal(r.status, 400, `${String(v)} -> ${r.status}`);
    assert.equal(db.emails.length, 0); assert.equal(db.tabelas.admissoes[0].pacote_enviado_email_em, null);
  }
});
await casoRota("rota POST: R&S descarta o valor vindo do cliente (a linha não entra e não conta como edição); campo ausente usa o do cadastro", async () => {
  const rs = cenarioRota({ tipoVaga: RS, qtd: null });
  const g = (await preview(rs)).corpo;
  assert.equal((await enviar(rs, { ...g.campos, diasTeste: 2 })).status, 200);
  assert.equal(rs.emails[0].html.includes("Dias de teste"), false);
  assert.deepEqual(rs.tabelas.audit_logs.find((a: any) => a.acao === "admissao_pacote_enviado_email").detalhes.campos_editados_nomes, []);
  const mot = cenarioRota({ tipoVaga: MOT, qtd: 2 });
  const { diasTeste: _omitido, ...semDias } = (await preview(mot)).corpo.campos;
  assert.equal((await enviar(mot, semDias)).status, 200);
  assert.ok(mot.emails[0].html.includes("Dias de teste: 2 dias"), "omitido = cadastro, nunca 'não informado'");
});
caso("fonte única: rota e modal usam montarLinhasDeCampos/avisosCamposFaltando com o contexto; o modal tem o campo, o selo e o restaurar", () => {
  const modal = fs.readFileSync("src/components/ModalEnviarPacoteEmail.tsx", "utf8");
  for (const t of ["montarLinhasDeCampos(campos, preview.empresa, preview.cliente, preview.tempoContratoPadrao, ctxDias)", "avisosCamposFaltando(campos, preview.empresa, preview.cliente, ctxDias)", 'selo("diasTeste")', 'estilo("diasTeste")', "preview.diasTeste.exige", "Não informado", "Não houve", "MAX_DIAS_TESTE", "Restaurar dados do cadastro", "formDoCadastro(preview.campos)"]) assert.ok(modal.includes(t), t);
  const rota = fs.readFileSync("src/app/api/admissoes/[id]/pacote/enviar-email/route.ts", "utf8");
  for (const t of ["resolverTipoServicoVigente", "admissao_qtd_dias_teste, admissao_dia_teste", "tipo_servico, clientes(nome, entidade_contratante)", "ctx.diasTesteCtx"]) assert.ok(rota.includes(t), t);
  assert.equal(/candidatos_vagas"\)\s*\.update|from\("candidatos_vagas"\)\.update/.test(rota), false, "a rota nunca grava em candidatos_vagas");
});

// ── Adicionais salariais na linha "Salário" ──────────────────────────────────────────────────────────────────────────
const ad = (tipo: string, formato: string, valor: number | string, criado_em = "2026-11-01T10:00:00Z") => ({ tipo, formato_valor: formato, valor, criado_em });
const linhaSalario = (c: Record<string, unknown>) => montarLinhasDeCampos(validarCamposEmail({ ...original, ...c }).camposNormalizados, "293 - EMPRESA", "Cliente X", PADRAO, null).find((l) => l.rotulo === "Salário")?.valor;
const MENSAL = { salarioValor: 2588.1, salarioTipo: "mensal" };

caso("adicionais: um percentual", () => {
  assert.equal(formatarAdicionaisEmail([ad("Insalubridade", "percentual", 20)]), "Insalubridade 20%");
  assert.equal(linhaSalario({ ...MENSAL, adicionais: "Insalubridade 20%" }), "R$ 2.588,10 mensal + Insalubridade 20%");
});
caso("adicionais: vários, na ordem de criado_em (não na ordem recebida)", () => {
  const lista = [ad("Acúmulo de função", "percentual", 10, "2026-11-02T10:00:00Z"), ad("Insalubridade", "percentual", 20, "2026-11-01T10:00:00Z")];
  assert.equal(formatarAdicionaisEmail(lista), "Insalubridade 20% + Acúmulo de função 10%");
  assert.equal(linhaSalario({ ...MENSAL, adicionais: formatarAdicionaisEmail(lista) }), "R$ 2.588,10 mensal + Insalubridade 20% + Acúmulo de função 10%");
});
caso("adicionais: sem criado_em mantém a ordem recebida", () => assert.equal(formatarAdicionaisEmail([{ tipo: "B", formato_valor: "percentual", valor: 1 }, { tipo: "A", formato_valor: "percentual", valor: 2 }]), "B 1% + A 2%"));
caso("adicionais: fixo vira R$ com vírgula e milhar", () => {
  assert.equal(formatarAdicionaisEmail([ad("Periculosidade", "fixo", 150)]), "Periculosidade R$ 150,00");
  assert.equal(formatarAdicionaisEmail([ad("Gratificação", "fixo", "1234.5")]), "Gratificação R$ 1.234,50");
  assert.equal(linhaSalario({ ...MENSAL, adicionais: formatarAdicionaisEmail([ad("Periculosidade", "fixo", 150)]) }), "R$ 2.588,10 mensal + Periculosidade R$ 150,00");
});
caso("adicionais: percentual sem zeros à toa (20 -> 20%, 12.5 -> 12,5%, '20.00' do banco -> 20%)", () => {
  assert.equal(formatarAdicionaisEmail([ad("X", "percentual", 20)]), "X 20%");
  assert.equal(formatarAdicionaisEmail([ad("X", "percentual", 12.5)]), "X 12,5%");
  assert.equal(formatarAdicionaisEmail([ad("X", "percentual", "20.00")]), "X 20%");
  assert.equal(formatarAdicionaisEmail([ad("X", "percentual", 12.345)]), "X 12,35%");
});
caso("adicionais: salário por hora mantém o sufixo atual e só acrescenta", () => assert.equal(linhaSalario({ salarioValor: 15, salarioTipo: "hora", adicionais: "Insalubridade 20%" }), "R$ 15,00 hora + Insalubridade 20%"));
caso("adicionais: sem adicionais a linha é IDÊNTICA à de hoje", () => {
  assert.equal(linhaSalario({ ...MENSAL }), "R$ 2.588,10 mensal");
  assert.equal(linhaSalario({ ...MENSAL, adicionais: "" }), linhaSalario({ ...MENSAL }));
  assert.equal(formatarAdicionaisEmail([]), ""); assert.equal(formatarAdicionaisEmail(null), "");
  const hoje = montarLinhasDados({ ...base }), agoraLinhas = montarLinhasDados({ ...base, adicionais: "" });
  assert.deepEqual(agoraLinhas, hoje);
  assert.equal(salarioComAdicionaisEmail("R$ 9,40 hora", undefined), "R$ 9,40 hora");
});
caso("adicionais: nome em minúsculas é normalizado só na exibição (trim + 1ª maiúscula, resto intacto)", () => {
  const lista = [ad("  insalubridade ", "percentual", 20), ad("acúmulo de função", "percentual", 10, "2026-11-02T10:00:00Z")];
  assert.equal(formatarAdicionaisEmail(lista), "Insalubridade 20% + Acúmulo de função 10%");
  assert.equal(lista[0].tipo, "  insalubridade ", "a lista de origem (o cadastro) não é alterada");
});
caso("adicionais: linhas inválidas (sem tipo, valor vazio/NaN/negativo) são ignoradas", () => assert.equal(formatarAdicionaisEmail([ad("", "percentual", 5), ad("A", "percentual", "abc"), { tipo: "B", formato_valor: "fixo", valor: null }, ad("C", "fixo", -3), ad("D", "percentual", 7)]), "D 7%"));
caso("adicionais: sem salário a linha segue omitida (adicional nunca aparece solto)", () => {
  assert.equal(linhaSalario({ salarioValor: null, salarioTipo: null, adicionais: "Insalubridade 20%" }), undefined);
  assert.equal(salarioComAdicionaisEmail("", "Insalubridade 20%"), "");
  assert.equal(montarLinhasDados({ ...base, salario: "", adicionais: "Insalubridade 20%" }).some((l) => l.rotulo === "Salário"), false);
});
caso("adicionais: aparecem no HTML e no texto simples (mesma linha, mesma fonte)", () => {
  const l = montarLinhasDeCampos(validarCamposEmail({ ...original, ...MENSAL, adicionais: "Insalubridade 20% + Acúmulo de função 10%" }).camposNormalizados, "E", "C", PADRAO, null);
  const html = montarHtmlEmail("Bom dia", l), txt = montarTextoEmail("Bom dia", l);
  assert.ok(html.includes("Salário: R$ 2.588,10 mensal + Insalubridade 20% + Acúmulo de função 10%"), html);
  assert.ok(txt.includes("Salário: R$ 2.588,10 mensal + Insalubridade 20% + Acúmulo de função 10%"), txt);
});
caso("adicionais: texto malicioso/quebra de linha é sanitizado, limitado e escapado no HTML", () => {
  const v = validarCamposEmail({ ...original, ...MENSAL, adicionais: "+ Insal\r\nBcc: x@y.com <script>alert(1)</script>" }).camposNormalizados;
  assert.equal(v.adicionais, "Insal Bcc: x@y.com <script>alert(1)</script>", "sem quebra, sem '+' inicial");
  const html = montarHtmlEmail("Oi", montarLinhasDeCampos(v, "E", "C", PADRAO, null));
  assert.equal(html.includes("<script>"), false); assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(validarCamposEmail({ ...original, ...MENSAL, adicionais: "a".repeat(500) }).camposNormalizados.adicionais.length, 200);
  assert.equal(validarCamposEmail({ ...original, ...MENSAL, adicionais: "\r\n\t" }).camposNormalizados.adicionais, "");
});
caso("adicionais: edição aparece como campo editado (só o NOME) e restaurar = sem diferença", () => {
  const cad = { ...original, ...MENSAL, adicionais: "Insalubridade 20%" };
  assert.deepEqual(listarCamposEditados(cad, { ...cad, adicionais: "Insalubridade 40%" }), ["adicionais"]);
  assert.deepEqual(listarCamposEditados(cad, { ...cad, adicionais: "  Insalubridade 20% " }), []);
  assert.deepEqual(listarCamposEditados(cad, cad), []);
});
caso("adicionais: schema da rota aceita o campo (texto, nulo ou ausente)", () => {
  for (const a of ["Insalubridade 20%", "", null, undefined]) assert.equal(admissaoEnviarEmailContabilidadeSchema.safeParse({ campos: { nome: "A", adicionais: a } }).success, true);
  assert.equal(admissaoEnviarEmailContabilidadeSchema.safeParse({ campos: { nome: "A", adicionais: 5 } }).success, false);
});

function comAdicionais(db: any, lista: any[]) { db.tabelas.admissao_adicionais = lista.map((a, i) => ({ id: `ad${i}`, admissao_id: ADM, ...a })); return db; }
// Ignora só o registro de envio (pacote_enviado_email_*, gravado de propósito depois do envio aceito): o resto do cadastro tem de ficar igual.
const semRegistroEnvio = (l: any) => { const { pacote_enviado_email_em, pacote_enviado_email_por, pacote_enviado_email_para, ...resto } = l; return resto; };
const cadastroSnap = (db: any) => JSON.stringify({ a: db.tabelas.admissoes.map(semRegistroEnvio), c: db.tabelas.candidatos, cv: db.tabelas.candidatos_vagas, dp: db.tabelas.admissao_dados_pessoais, ad: db.tabelas.admissao_adicionais });
await casoRota("rota GET/POST: 1 adicional vindo do banco (minúsculo) entra na linha Salário do e-mail real, igual à prévia", async () => {
  const db = comAdicionais(cenarioRota({ tipoVaga: MOT, qtd: 1 }), [ad("insalubridade", "percentual", "20.00")]);
  const g = (await preview(db)).corpo;
  assert.equal(g.campos.adicionais, "Insalubridade 20%");
  assert.ok(dadosLinhas(g).includes("Salário: R$ 1.800,00 mensal + Insalubridade 20%"), JSON.stringify(dadosLinhas(g)));
  const antes = cadastroSnap(db);
  assert.equal((await enviar(db, g.campos)).status, 200);
  assert.ok(db.emails[0].html.includes("Salário: R$ 1.800,00 mensal + Insalubridade 20%"));
  assert.equal(cadastroSnap(db), antes, "cadastro idêntico antes e depois");
});
await casoRota("rota POST: 2 adicionais (um fixo), ordem de criado_em, corpo do e-mail igual ao da prévia", async () => {
  const db = comAdicionais(cenarioRota({ tipoVaga: MOT, qtd: 1 }), [ad("Acúmulo de função", "percentual", 10, "2026-11-02T10:00:00Z"), ad("Insalubridade", "percentual", 20, "2026-11-01T10:00:00Z"), ad("periculosidade", "fixo", 150, "2026-11-03T10:00:00Z")]);
  const g = (await preview(db)).corpo;
  const esperado = "Salário: R$ 1.800,00 mensal + Insalubridade 20% + Acúmulo de função 10% + Periculosidade R$ 150,00";
  assert.ok(dadosLinhas(g).includes(esperado), JSON.stringify(dadosLinhas(g)));
  assert.equal((await enviar(db, g.campos)).status, 200);
  assert.ok(db.emails[0].html.includes(esperado));
  assert.ok(g.corpoTexto.includes(esperado));
  assert.deepEqual(db.tabelas.audit_logs.find((x: any) => x.acao === "admissao_pacote_enviado_email").detalhes.campos_editados_nomes, []);
});
await casoRota("rota: sem adicionais o e-mail é idêntico ao de hoje (tabela vazia ou ausente)", async () => {
  const vazia = cenarioRota({ tipoVaga: MOT, qtd: 1 });
  const g = (await preview(vazia)).corpo;
  assert.equal(g.campos.adicionais, "");
  assert.ok(dadosLinhas(g).includes("Salário: R$ 1.800,00 mensal"));
  assert.equal(dadosLinhas(g).some((l: string) => l.includes(" + ")), false);
});
await casoRota("rota POST: editar só o e-mail (texto livre) não grava nada no cadastro e a auditoria leva só o NOME do campo", async () => {
  const db = comAdicionais(cenarioRota({ tipoVaga: MOT, qtd: 1 }), [ad("Insalubridade", "percentual", 20)]);
  const g = (await preview(db)).corpo;
  const antes = cadastroSnap(db);
  const r = await enviar(db, { ...g.campos, adicionais: "Insalubridade 40%\r\nBcc: x@y.com" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(db.emails[0].html.includes("Salário: R$ 1.800,00 mensal + Insalubridade 40% Bcc: x@y.com"));
  assert.equal(db.emails[0].html.includes("Bcc: x@y.com\r"), false);
  assert.equal(cadastroSnap(db), antes, "admissao_adicionais e demais tabelas intactas");
  const aud = db.tabelas.audit_logs.find((x: any) => x.acao === "admissao_pacote_enviado_email");
  assert.deepEqual(aud.detalhes.campos_editados_nomes, ["adicionais"]);
  assert.equal(JSON.stringify(aud).includes("40%"), false, "auditoria sem o valor");
  // limpar o campo = enviar sem adicionais; omitir o campo = usa o do cadastro
  const db2 = comAdicionais(cenarioRota({ tipoVaga: MOT, qtd: 1 }), [ad("Insalubridade", "percentual", 20)]);
  const g2 = (await preview(db2)).corpo;
  assert.equal((await enviar(db2, { ...g2.campos, adicionais: "" })).status, 200);
  assert.equal(db2.emails[0].html.includes("Insalubridade"), false);
  const db3 = comAdicionais(cenarioRota({ tipoVaga: MOT, qtd: 1 }), [ad("Insalubridade", "percentual", 20)]);
  const { adicionais: _omitido, ...semAd } = (await preview(db3)).corpo.campos;
  assert.equal((await enviar(db3, semAd)).status, 200);
  assert.ok(db3.emails[0].html.includes("+ Insalubridade 20%"), "omitido = cadastro");
});
await casoRota("rota POST: sem salário, adicional nunca aparece solto", async () => {
  const db = comAdicionais(cenarioRota({ tipoVaga: MOT, qtd: 1 }), [ad("Insalubridade", "percentual", 20)]);
  db.tabelas.admissoes[0].salario = null;
  const g = (await preview(db)).corpo;
  assert.equal(dadosLinhas(g).some((l: string) => l.startsWith("Salário")), false);
  assert.equal((await enviar(db, g.campos)).status, 200);
  assert.equal(db.emails[0].html.includes("Insalubridade"), false);
});
caso("fonte única (adicionais): modal e rota usam a mesma montagem; o modal tem o campo, o selo e o restaurar", () => {
  const modal = fs.readFileSync("src/components/ModalEnviarPacoteEmail.tsx", "utf8");
  for (const t of ["montarLinhasDeCampos(campos, preview.empresa", 'selo("adicionais")', 'estilo("adicionais")', "Adicionais", "maxLength={200}", "adicionais: c.adicionais", "formDoCadastro(preview.campos)"]) assert.ok(modal.includes(t), t);
  assert.equal(/Insalubridade 20%\s*\+|salarioComAdicionaisEmail/.test(modal), false, "o modal não monta a linha por conta própria");
  const rota = fs.readFileSync("src/app/api/admissoes/[id]/pacote/enviar-email/route.ts", "utf8");
  for (const t of ['from("admissao_adicionais")', 'order("criado_em", { ascending: true })', "formatarAdicionaisEmail(adicionais)", "montarLinhasDeCampos(camposEmail"]) assert.ok(rota.includes(t), t);
  assert.equal(/admissao_adicionais"\)\s*\.(update|insert|delete|upsert)/.test(rota), false, "a rota só lê admissao_adicionais");
});

console.log(`\n${total} casos passaram${process.exitCode ? " (HOUVE FALHAS)" : ""}`);
