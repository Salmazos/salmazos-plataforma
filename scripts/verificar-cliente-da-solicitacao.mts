// Verificação da lógica pura do cadastro de cliente a partir da solicitação do link público (o projeto não tem runner de testes).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-cliente-da-solicitacao.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { avaliarDuplicidade, camposIdentidadeAlterados, normalizarCnpj, normalizarCpf } from "../src/lib/clienteDuplicidade";
import { respostaDuplicidade, mensagemUnicidadeDocumento, MSG_DOCUMENTO_OUTRA_UNIDADE, MSG_DOCUMENTO_JA_CADASTRADO } from "../src/lib/clienteDuplicidadeRota";
import { solicitacaoVincularClienteSchema } from "../src/lib/schemas";
import * as rotaClientes from "../src/app/api/clientes/route";
import * as rotaClienteId from "../src/app/api/clientes/[id]/route";
import * as rotaVincular from "../src/app/api/solicitacoes-vagas/[id]/vincular-cliente/route";
import { gerarCobrancaCancelamentoRSSeAplicavel, gerarCobrancaRSSeAplicavel } from "../src/lib/cobrancaRS";
import { getEmailTemplate } from "../src/lib/emailTemplates";
import { getEmailTemplate as getEmailTemplateAntes } from "./fixtures/emailTemplates.antes-do-escape.mts";
import { mensagemVinculoAposReativacao, TEXTO_SOLICITACAO_RECUSADA_SEM_VAGA, TEXTO_VAGA_CRIADA_COM_O_CLIENTE, avisoAposDecisaoDaSolicitacao, type AvisoDoCliente, aprovadasSemCliente, campoParaFocoInicial, devolverFocoAoFechar, escapeDeveFecharModal, explicarSituacaoDaVaga, rotularCampos, semClienteVinculado, solicitacaoFicouIndisponivel } from "../src/lib/clienteDaSolicitacao";
import { criarDb, criarClienteServico } from "./harness-mot/memdb.mjs";
import { validarCnpj, validarCpf } from "../src/lib/documentoBr";
import {
  CAMPOS_COMPLETAVEIS, CAMPOS_OBRIGATORIOS_CLIENTE, MENSAGEM_AVISO_PREFILL, completarSomenteVazios, montarPrefillCliente, validarDocumentoDoCliente, vazioParaNulo,
  type ClienteExistenteParaCompletar, type PrefillCliente, type SolicitacaoParaCliente,
} from "../src/lib/clienteDaSolicitacao";

let total = 0;
function caso(nome: string, fn: () => void) {
  fn();
  total++;
  console.log(`OK    ${nome}`);
}
async function casoRota(nome: string, fn: () => Promise<void>) {
  await fn();
  total++;
  console.log(`OK    ${nome}`);
}

const CNPJ = "11.222.333/0001-81";
const CNPJ_DIGITOS = "11222333000181";
const CPF = "529.982.247-25";
const CPF_DIGITOS = "52998224725";
const U1 = "5b560689-559b-4b69-81c7-ecddb7431404";

function solicitacao(extra: Partial<SolicitacaoParaCliente> = {}, dados: Record<string, unknown> = {}): SolicitacaoParaCliente {
  return {
    cliente_nome: "Indústria Exemplo Ltda", cidade: "Hortolândia", unidade_id: U1, tipo_servico: "recrutamento_selecao",
    dados_empresa: {
      tipo_pessoa: "pj", nome: "Indústria Exemplo Ltda", cnpj_cpf: CNPJ, contato_nome: "Maria Souza", telefone: "(19) 99999-8888",
      email: "contato@exemplo.com.br", email_nf: "financeiro@exemplo.com.br", endereco: "Rua A, 10, Centro", ...dados,
    },
    ...extra,
  };
}

// ── normalizarCpf e validação de dígitos (reaproveitando clienteDuplicidade.ts e documentoBr.ts) ──
caso("normalizarCpf: só dígitos com 11 posições; o resto não participa da comparação (igual ao CNPJ)", () => {
  assert.equal(normalizarCpf(CPF), CPF_DIGITOS);
  assert.equal(normalizarCpf(CPF_DIGITOS), CPF_DIGITOS);
  assert.equal(normalizarCpf(" 529 982 247 25 "), CPF_DIGITOS);
  for (const ruim of [null, undefined, "", "   ", "5299822472", "529982247250", CNPJ, "(19) 3217-7899", "abc"]) assert.equal(normalizarCpf(ruim as string | null), null, String(ruim));
  assert.equal(normalizarCnpj(CNPJ), CNPJ_DIGITOS, "o CNPJ segue como era");
  assert.equal(normalizarCnpj(CPF), null, "CPF no lugar do CNPJ não vira CNPJ");
});
caso("dígitos verificadores: reaproveita documentoBr.ts (sem duplicar o cálculo)", () => {
  assert.ok(validarCpf(CPF) && validarCpf(CPF_DIGITOS) && validarCnpj(CNPJ) && validarCnpj(CNPJ_DIGITOS));
  for (const ruim of ["529.982.247-24", "111.111.111-11", "123", ""]) assert.ok(!validarCpf(ruim), ruim);
  for (const ruim of ["11.222.333/0001-80", "00.000.000/0000-00", "123", ""]) assert.ok(!validarCnpj(ruim), ruim);
  const fonte = fs.readFileSync("src/lib/clienteDaSolicitacao.ts", "utf8");
  assert.ok(/from "\.\/documentoBr"/.test(fonte), "importa de documentoBr");
  assert.ok(!/% ?11|soma \*|pesos/.test(fonte), "não reimplementa o cálculo dos dígitos verificadores");
});

// ── Prefill ──────────────────────────────────────────────────────────────────
caso("prefill PJ: campos da solicitação vão para o cadastro; segmento fica vazio; serviços e unidade vêm da solicitação", () => {
  const r = montarPrefillCliente(solicitacao(), { responsavelComercial: "Ana" });
  assert.deepEqual(r.valores, {
    tipo_pessoa: "pj", nome: "Indústria Exemplo Ltda", cnpj: CNPJ, cpf: null, contato_nome: "Maria Souza", contato_telefone: "(19) 99999-8888",
    contato_email: "contato@exemplo.com.br", email_nota_fiscal: "financeiro@exemplo.com.br", endereco: "Rua A, 10, Centro", cidade: "Hortolândia",
    segmento: null, servicos: ["recrutamento_selecao"], responsavel_comercial: "Ana", unidade_id: U1,
  });
  assert.deepEqual(r.avisos, ["cidade_do_local_de_trabalho"], "a cidade da solicitação é a do local de trabalho da vaga");
  assert.deepEqual(r.faltando, ["segmento"], "só o segmento falta para o analista");
  assert.ok(!r.preenchidos.includes("segmento") && r.preenchidos.includes("cnpj") && r.preenchidos.includes("servicos"));
  assert.ok(!r.preenchidos.includes("cpf"));
});
caso("prefill PF: CPF no lugar do CNPJ; contato_nome fica VAZIO (usar o próprio nome é decisão do analista) e vira pendência", () => {
  const r = montarPrefillCliente(solicitacao({}, { tipo_pessoa: "pf", nome: "João da Silva", cnpj_cpf: CPF, contato_nome: null }));
  assert.equal(r.valores.tipo_pessoa, "pf");
  assert.equal(r.valores.cpf, CPF);
  assert.equal(r.valores.cnpj, null);
  assert.equal(r.valores.nome, "João da Silva");
  assert.equal(r.valores.contato_nome, null);
  assert.deepEqual(r.faltando, ["contato_nome", "segmento"]);
  // mesmo que o contato venha preenchido por engano, em PF o prefill não o usa
  assert.equal(montarPrefillCliente(solicitacao({}, { tipo_pessoa: "pf", cnpj_cpf: CPF, contato_nome: "Alguém" })).valores.contato_nome, null);
});
caso("prefill com tudo vazio, só espaços, nulo ou ausente: nada é inventado e nada lança", () => {
  const entradas: (SolicitacaoParaCliente | null | undefined)[] = [
    null, undefined, {}, { dados_empresa: null }, { dados_empresa: {} },
    { cliente_nome: "   ", cidade: "  ", unidade_id: "", tipo_servico: " ", dados_empresa: { nome: " ", cnpj_cpf: " ", contato_nome: "", telefone: "  ", email: "", email_nf: " ", endereco: "\n" } },
  ];
  for (const e of entradas) {
    const r = montarPrefillCliente(e);
    for (const campo of ["nome", "cnpj", "cpf", "contato_nome", "contato_telefone", "contato_email", "email_nota_fiscal", "endereco", "cidade", "segmento", "responsavel_comercial", "unidade_id"] as const) {
      assert.equal(r.valores[campo], null, `${campo} deveria ser null para ${JSON.stringify(e)}`);
    }
    assert.deepEqual(r.valores.servicos, []);
    assert.deepEqual(r.faltando, [...CAMPOS_OBRIGATORIOS_CLIENTE]);
    assert.deepEqual(r.preenchidos, []);
    assert.ok(r.avisos.includes("documento_ausente"));
  }
  assert.equal(montarPrefillCliente(solicitacao({}, { nome: "  " })).valores.nome, "Indústria Exemplo Ltda", "sem nome em dados_empresa, usa o cliente_nome da solicitação");
  assert.equal(montarPrefillCliente(solicitacao({}, { telefone: "  (19) 3217-7899  " })).valores.contato_telefone, "(19) 3217-7899", "espaços das pontas saem");
});
caso("prefill do documento: sem máscara é padronizado; sem tipo informado deduz pelo tamanho (com aviso); ambíguo ou inválido NÃO é copiado", () => {
  assert.equal(montarPrefillCliente(solicitacao({}, { cnpj_cpf: CNPJ_DIGITOS })).valores.cnpj, CNPJ, "mesma máscara dos 20 CNPJs já cadastrados");
  assert.equal(montarPrefillCliente(solicitacao({}, { tipo_pessoa: "pf", cnpj_cpf: CPF_DIGITOS })).valores.cpf, CPF);
  const semTipoPf = montarPrefillCliente(solicitacao({}, { tipo_pessoa: null, cnpj_cpf: CPF_DIGITOS }));
  assert.equal(semTipoPf.valores.tipo_pessoa, "pf");
  assert.equal(semTipoPf.valores.cpf, CPF);
  assert.ok(semTipoPf.avisos.includes("tipo_pessoa_inferido"));
  const semTipoPj = montarPrefillCliente(solicitacao({}, { tipo_pessoa: undefined, cnpj_cpf: CNPJ_DIGITOS }));
  assert.equal(semTipoPj.valores.tipo_pessoa, "pj");
  assert.equal(semTipoPj.valores.cnpj, CNPJ);
  // CPF dizendo ser PJ e CNPJ dizendo ser PF: ambíguo, nenhum dos dois campos é preenchido
  for (const dados of [{ tipo_pessoa: "pj", cnpj_cpf: CPF }, { tipo_pessoa: "pf", cnpj_cpf: CNPJ }]) {
    const r = montarPrefillCliente(solicitacao({}, dados));
    assert.equal(r.valores.cnpj, null);
    assert.equal(r.valores.cpf, null);
    assert.deepEqual(r.avisos, ["documento_incompativel_com_tipo", "cidade_do_local_de_trabalho"]);
  }
  // dígitos verificadores errados e tamanho que não é de nenhum documento
  for (const dados of [{ tipo_pessoa: "pf", cnpj_cpf: "529.982.247-24" }, { tipo_pessoa: "pj", cnpj_cpf: "11.222.333/0001-80" }, { tipo_pessoa: "pf", cnpj_cpf: "111.111.111-11" }, { tipo_pessoa: "pj", cnpj_cpf: "123" }, { tipo_pessoa: "pj", cnpj_cpf: "1122233300018" }, { tipo_pessoa: null, cnpj_cpf: "12345" }]) {
    const r = montarPrefillCliente(solicitacao({}, dados));
    assert.equal(r.valores.cnpj, null, JSON.stringify(dados));
    assert.equal(r.valores.cpf, null, JSON.stringify(dados));
    assert.ok(r.avisos.includes("documento_invalido"), JSON.stringify(dados));
  }
  for (const aviso of Object.keys(MENSAGEM_AVISO_PREFILL)) assert.ok(MENSAGEM_AVISO_PREFILL[aviso as keyof typeof MENSAGEM_AVISO_PREFILL].length > 10);
});
caso("prefill: avisos, preenchidos e faltando só têm códigos e NOMES de campos (nunca valores); a entrada não é alterada", () => {
  const entrada = solicitacao({}, { tipo_pessoa: "pf", cnpj_cpf: CPF, nome: "João da Silva", contato_nome: null });
  const copia = structuredClone(entrada);
  const r = montarPrefillCliente(entrada, { responsavelComercial: "Ana" });
  assert.deepEqual(entrada, copia);
  const metadados = JSON.stringify([r.avisos, r.preenchidos, r.faltando]);
  for (const proibido of ["João", "529", "@", "(19)", "Hortolândia", "Rua A", "Ana", CNPJ_DIGITOS]) assert.ok(!metadados.includes(proibido), `metadado não pode conter "${proibido}"`);
});

// ── Normalização de vazio e documento confirmado no modal ────────────────────
caso("vazioParaNulo: \"\" e só espaços viram null; texto sai sem espaços nas pontas; não-texto vira null", () => {
  for (const v of ["", " ", "   ", "\t\n", null, undefined, 0, false, {}, []]) assert.equal(vazioParaNulo(v), null, JSON.stringify(v));
  assert.equal(vazioParaNulo("  abc  "), "abc");
  assert.equal(vazioParaNulo("0"), "0");
});
caso("PF com cnpj \"\" (o caso que quebra o check do banco): vira null e o par cpf/cnpj nunca sai com os dois preenchidos", () => {
  for (const cnpjVazio of ["", "   ", null, undefined]) {
    const r = validarDocumentoDoCliente({ tipo_pessoa: "pf", cnpj: cnpjVazio, cpf: CPF });
    assert.ok(r.ok);
    if (r.ok) {
      assert.strictEqual(r.cnpj, null, `cnpj ${JSON.stringify(cnpjVazio)} tem que virar null, nunca ""`);
      assert.equal(r.cpf, CPF);
      assert.ok(!(r.cpf !== null && r.cnpj !== null), "o check do banco (cpf is null or cnpj is null) passaria");
    }
  }
  for (const cpfVazio of ["", "  ", null, undefined]) {
    const r = validarDocumentoDoCliente({ tipo_pessoa: "pj", cnpj: CNPJ, cpf: cpfVazio });
    assert.ok(r.ok);
    if (r.ok) { assert.strictEqual(r.cpf, null); assert.equal(r.cnpj, CNPJ); }
  }
  const semNada = validarDocumentoDoCliente({ tipo_pessoa: "pf", cnpj: "", cpf: "  " });
  assert.deepEqual(semNada, { ok: true, cnpj: null, cpf: null }, "documento é opcional no cadastro");
  assert.deepEqual(validarDocumentoDoCliente({ tipo_pessoa: "pj" }), { ok: true, cnpj: null, cpf: null });
});
caso("documento do cadastro: sem máscara é padronizado; CPF/CNPJ inválidos e tipo trocado são recusados com campo e mensagem", () => {
  assert.deepEqual(validarDocumentoDoCliente({ tipo_pessoa: "pf", cpf: CPF_DIGITOS }), { ok: true, cnpj: null, cpf: CPF });
  assert.deepEqual(validarDocumentoDoCliente({ tipo_pessoa: "pj", cnpj: CNPJ_DIGITOS }), { ok: true, cnpj: CNPJ, cpf: null });
  const cpfRuim = validarDocumentoDoCliente({ tipo_pessoa: "pf", cpf: "529.982.247-24" });
  assert.ok(!cpfRuim.ok && cpfRuim.campo === "cpf" && /inválido/i.test(cpfRuim.erro));
  const cnpjRuim = validarDocumentoDoCliente({ tipo_pessoa: "pj", cnpj: "11.222.333/0001-80" });
  assert.ok(!cnpjRuim.ok && cnpjRuim.campo === "cnpj" && /inválido/i.test(cnpjRuim.erro));
  const pfComCnpj = validarDocumentoDoCliente({ tipo_pessoa: "pf", cnpj: CNPJ, cpf: CPF });
  assert.ok(!pfComCnpj.ok && pfComCnpj.campo === "cnpj", "PF com CNPJ preenchido: recusa (não escolhe um dos dois sozinho)");
  const pjComCpf = validarDocumentoDoCliente({ tipo_pessoa: "pj", cnpj: CNPJ, cpf: CPF });
  assert.ok(!pjComCpf.ok && pjComCpf.campo === "cpf");
  assert.ok(!validarDocumentoDoCliente({ tipo_pessoa: "pj", cpf: CPF }).ok, "PJ só com CPF: recusa");
  assert.ok(!validarDocumentoDoCliente({ tipo_pessoa: "pf", cnpj: CNPJ }).ok, "PF só com CNPJ: recusa");
});

// ── Completar só campos vazios ───────────────────────────────────────────────
const prefillPj = (): PrefillCliente => montarPrefillCliente(solicitacao(), { responsavelComercial: "Ana" }).valores;
function clienteCompleto(extra: ClienteExistenteParaCompletar = {}): ClienteExistenteParaCompletar {
  return {
    tipo_pessoa: "pj", nome: "Indústria Exemplo Ltda", cnpj: "99.888.777/0001-66", cpf: null, contato_nome: "Pedro", contato_telefone: "(11) 4000-1000",
    contato_email: "pedro@outra.com.br", email_nota_fiscal: "nf@outra.com.br", endereco: "Av. B, 20", cidade: "Campinas", responsavel_comercial: "Bia", ...extra,
  };
}
caso("completarSomenteVazios: cadastro completo não muda nada; o que difere vai para 'divergentes' (só nomes)", () => {
  const r = completarSomenteVazios(clienteCompleto(), prefillPj());
  assert.deepEqual(r.valores, {});
  assert.deepEqual(r.preenchidos, []);
  assert.deepEqual([...r.divergentes].sort(), ["cidade", "cnpj", "contato_email", "contato_nome", "contato_telefone", "email_nota_fiscal", "endereco"].sort());
  // mesmos valores com outra formatação NÃO são divergência
  const mesmo = completarSomenteVazios(
    clienteCompleto({ cnpj: CNPJ_DIGITOS, contato_nome: "maria souza", contato_telefone: "19999998888", contato_email: "CONTATO@exemplo.com.br", email_nota_fiscal: "Financeiro@Exemplo.com.br", endereco: "rua a, 10,  centro", cidade: "HORTOLANDIA", responsavel_comercial: "ana" }),
    prefillPj()
  );
  assert.deepEqual(mesmo.divergentes, []);
  assert.deepEqual(mesmo.preenchidos, []);
});
caso("completarSomenteVazios: preenche o que está vazio (nulo, \"\" ou só espaços) e devolve só os NOMES dos campos preenchidos", () => {
  const r = completarSomenteVazios(clienteCompleto({ cnpj: null, endereco: "", email_nota_fiscal: "   ", cidade: null }), prefillPj());
  assert.deepEqual(r.valores, { cnpj: CNPJ, endereco: "Rua A, 10, Centro", email_nota_fiscal: "financeiro@exemplo.com.br", cidade: "Hortolândia" });
  assert.deepEqual([...r.preenchidos].sort(), ["cidade", "cnpj", "email_nota_fiscal", "endereco"]);
  assert.deepEqual(Object.keys(r.valores).sort(), [...r.preenchidos].sort(), "valores só tem as chaves preenchidas");
  assert.ok(!JSON.stringify(r.preenchidos).includes("@") && !JSON.stringify(r.preenchidos).includes("Rua"), "a lista de preenchidos não tem valores");
  // prefill vazio nunca preenche nada
  const vazio = completarSomenteVazios(clienteCompleto({ cnpj: null, endereco: null }), montarPrefillCliente(solicitacao({}, { cnpj_cpf: null, endereco: null }), {}).valores);
  assert.ok(!vazio.preenchidos.includes("cnpj") && !vazio.preenchidos.includes("endereco"));
});
caso("completarSomenteVazios: documento respeita o tipo do cadastro e nunca junta CPF com CNPJ", () => {
  const prefillPf = montarPrefillCliente(solicitacao({}, { tipo_pessoa: "pf", cnpj_cpf: CPF, contato_nome: null })).valores;
  // cadastro PF sem documento recebe o CPF
  const pfVazio = completarSomenteVazios({ tipo_pessoa: "pf", nome: "João da Silva", cpf: null, cnpj: null }, prefillPf);
  assert.equal(pfVazio.valores.cpf, CPF);
  assert.ok(pfVazio.preenchidos.includes("cpf"));
  // cadastro PJ sem documento NÃO recebe CPF (é de outro tipo de pessoa): vai para divergentes
  const pjVazio = completarSomenteVazios({ tipo_pessoa: "pj", nome: "João da Silva", cpf: null, cnpj: null }, prefillPf);
  assert.ok(!("cpf" in pjVazio.valores) && pjVazio.divergentes.includes("cpf"));
  // sem tipo_pessoa no cadastro (coluna antes da migração) = pj
  assert.ok(!("cpf" in completarSomenteVazios({ nome: "x", cnpj: null }, prefillPf).valores));
  // cadastro PF não recebe CNPJ
  const pfRecebeCnpj = completarSomenteVazios({ tipo_pessoa: "pf", nome: "x", cpf: null, cnpj: null }, prefillPj());
  assert.ok(!("cnpj" in pfRecebeCnpj.valores) && pfRecebeCnpj.divergentes.includes("cnpj"));
  // se o cadastro já tem o outro documento, não completa (o check do banco recusaria os dois)
  const pjComCpf = completarSomenteVazios({ tipo_pessoa: "pj", nome: "x", cnpj: null, cpf: "111.444.777-35" }, prefillPj());
  assert.ok(!("cnpj" in pjComCpf.valores));
  // CPF diferente do que o cadastro já tem: diverge, não sobrescreve
  const cpfDiferente = completarSomenteVazios({ tipo_pessoa: "pf", nome: "x", cpf: "111.444.777-35" }, prefillPf);
  assert.ok(!("cpf" in cpfDiferente.valores), "o CPF já cadastrado não é sobrescrito");
  assert.ok(cpfDiferente.divergentes.includes("cpf"));
  // o mesmo CPF com outra formatação não é divergência
  assert.ok(!completarSomenteVazios({ tipo_pessoa: "pf", nome: "João da Silva", cpf: CPF_DIGITOS }, prefillPf).divergentes.includes("cpf"));
});
caso("completarSomenteVazios: NUNCA sobrescreve (3.000 combinações aleatórias de cadastro e prefill)", () => {
  let semente = 20261030;
  const aleatorio = () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sorteia = <T,>(l: readonly T[]) => l[Math.floor(aleatorio() * l.length)];
  const valoresCampo: Record<string, (string | null | undefined)[]> = {
    cnpj: [null, undefined, "", "  ", CNPJ, "99.888.777/0001-66"], cpf: [null, "", CPF, "111.444.777-35"],
    contato_nome: [null, "", " ", "Maria Souza", "Pedro"], contato_telefone: [null, "", "(19) 99999-8888", "(11) 4000-1000"],
    contato_email: [null, "", "contato@exemplo.com.br", "pedro@outra.com.br"], email_nota_fiscal: [null, "", "financeiro@exemplo.com.br", "nf@outra.com.br"],
    endereco: [null, "", "Rua A, 10, Centro", "Av. B, 20"], cidade: [null, "", "Hortolândia", "Campinas"], responsavel_comercial: [null, "", "Ana", "Bia"],
  };
  const base = prefillPj();
  let combinacoes = 0;
  for (let n = 0; n < 3000; n++) {
    const existente: ClienteExistenteParaCompletar = { tipo_pessoa: sorteia(["pj", "pf", null, undefined]), nome: "X" };
    const prefill: PrefillCliente = { ...base, tipo_pessoa: sorteia(["pj", "pf"] as const) };
    for (const campo of CAMPOS_COMPLETAVEIS) {
      (existente as Record<string, unknown>)[campo] = sorteia(valoresCampo[campo]);
      (prefill as unknown as Record<string, unknown>)[campo] = sorteia(valoresCampo[campo]);
    }
    const antes = structuredClone(existente);
    const r = completarSomenteVazios(existente, prefill);
    assert.deepEqual(existente, antes, "a entrada não pode ser alterada");
    const resultado: Record<string, unknown> = { ...existente, ...r.valores };
    for (const campo of CAMPOS_COMPLETAVEIS) {
      const eraVazio = vazioParaNulo(existente[campo as keyof ClienteExistenteParaCompletar]) === null;
      if (!eraVazio) assert.strictEqual(resultado[campo], existente[campo as keyof ClienteExistenteParaCompletar], `sobrescreveu ${campo}`);
    }
    assert.deepEqual(Object.keys(r.valores).sort(), [...r.preenchidos].sort());
    for (const campo of r.preenchidos) assert.ok(vazioParaNulo(existente[campo]) === null, `${campo} só pode ser preenchido se estava vazio`);
    assert.ok(!(vazioParaNulo(resultado.cpf) !== null && vazioParaNulo(resultado.cnpj) !== null) || (vazioParaNulo(existente.cpf) !== null && vazioParaNulo(existente.cnpj) !== null), "completar nunca cria cpf e cnpj juntos");
    combinacoes++;
  }
  assert.equal(combinacoes, 3000);
});

// ── Prefill: cidade e responsável ────────────────────────────────────────────
caso("prefill: a cidade vem do local de trabalho da vaga e isso é avisado; sem cidade, sem aviso", () => {
  const com = montarPrefillCliente(solicitacao());
  assert.equal(com.valores.cidade, "Hortolândia");
  assert.ok(com.avisos.includes("cidade_do_local_de_trabalho"));
  assert.equal(MENSAGEM_AVISO_PREFILL.cidade_do_local_de_trabalho, "A cidade veio do local de trabalho da vaga, não necessariamente da sede da empresa. Confira a cidade do cliente.");
  for (const cidade of [null, undefined, "", "   "]) {
    const sem = montarPrefillCliente(solicitacao({ cidade }));
    assert.equal(sem.valores.cidade, null);
    assert.ok(!sem.avisos.includes("cidade_do_local_de_trabalho"), JSON.stringify(cidade));
  }
  // vale também para pessoa física
  assert.ok(montarPrefillCliente(solicitacao({}, { tipo_pessoa: "pf", cnpj_cpf: CPF })).avisos.includes("cidade_do_local_de_trabalho"));
});
caso("responsável comercial é só SUGESTÃO: vem como veio (sem normalizar) e nunca é completado em cliente existente", () => {
  assert.equal(montarPrefillCliente(solicitacao(), { responsavelComercial: "  Lucas Miguel " }).valores.responsavel_comercial, "Lucas Miguel", "só tira espaços das pontas");
  assert.equal(montarPrefillCliente(solicitacao(), { responsavelComercial: "edivan souza silva" }).valores.responsavel_comercial, "edivan souza silva", "não tenta casar nomes");
  assert.equal(montarPrefillCliente(solicitacao()).valores.responsavel_comercial, null);
  assert.ok(!(CAMPOS_COMPLETAVEIS as readonly string[]).includes("responsavel_comercial"));
  const r = completarSomenteVazios({ tipo_pessoa: "pj", nome: "Indústria Exemplo Ltda", responsavel_comercial: null } as ClienteExistenteParaCompletar, montarPrefillCliente(solicitacao(), { responsavelComercial: "Ana" }).valores);
  assert.ok(!r.preenchidos.includes("responsavel_comercial" as never) && !("responsavel_comercial" in r.valores));
});

// ── Duplicidade por CPF (módulo puro) ────────────────────────────────────────
const U2 = "unid-2";
const idCli = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
caso("duplicidade por CPF: igual (com ou sem máscara) a qualquer cliente = bloqueio sem liberação; PJ e CPF diferente não batem", () => {
  const clientes = [
    { id: idCli(1), nome: "João da Silva", ativo: true, cpf: CPF, cnpj: null, unidade_id: U1 },
    { id: idCli(2), nome: "Empresa Alfa SA", ativo: true, cpf: null, cnpj: CNPJ, unidade_id: U1 },
  ];
  const r = avaliarDuplicidade({ nome: "Outro Nome Qualquer", cpf: CPF_DIGITOS }, clientes, { papelFull: false, unidadesPermitidas: [U1] });
  assert.ok(r);
  assert.equal(r!.nivel, "bloqueio");
  assert.equal(r!.bloqueio, "cpf");
  assert.deepEqual(r!.motivos, ["cpf"]);
  assert.equal(r!.existente?.id, idCli(1));
  assert.equal(r!.podeConfirmar, false);
  assert.equal(r!.podeLiberar, false, "documento igual nunca se libera, nem para a diretoria");
  assert.equal(avaliarDuplicidade({ nome: "Outro", cpf: CPF }, clientes, { papelFull: true, unidadesPermitidas: "todas" })!.podeLiberar, false);
  assert.equal(avaliarDuplicidade({ nome: "Outro Nome Qualquer", cpf: "111.444.777-35" }, clientes, { papelFull: false, unidadesPermitidas: [U1] }), null, "CPF diferente");
  assert.equal(avaliarDuplicidade({ nome: "Outro Nome Qualquer", cpf: null, cnpj: null }, clientes, { papelFull: false, unidadesPermitidas: [U1] }), null, "sem documento e sem outro sinal");
  assert.equal(avaliarDuplicidade({ nome: "Outro Nome Qualquer", cnpj: CNPJ }, clientes, { papelFull: false, unidadesPermitidas: [U1] })!.bloqueio, "cnpj", "o CNPJ segue como era");
  // CPF inválido (tamanho) não participa
  assert.equal(avaliarDuplicidade({ nome: "Outro Nome Qualquer", cpf: "529.982.247" }, clientes, { papelFull: false, unidadesPermitidas: [U1] }), null);
});
await casoRota("duplicidade por CPF: inativo oferece reativar; outra unidade não mostra nada; edição entende o campo cpf; mensagens", async () => {
  const inativo = [{ id: idCli(1), nome: "João da Silva", ativo: false, cpf: CPF, unidade_id: U1 }];
  const ri = avaliarDuplicidade({ nome: "X Y", cpf: CPF_DIGITOS }, inativo, { papelFull: false, unidadesPermitidas: [U1] })!;
  assert.equal(ri.bloqueio, "cpf");
  assert.equal(ri.podeReativar, true);
  const outra = [{ id: idCli(1), nome: "João da Silva", ativo: true, cpf: CPF, unidade_id: U2 }];
  const ro = avaliarDuplicidade({ nome: "X Y", cpf: CPF_DIGITOS }, outra, { papelFull: false, unidadesPermitidas: [U1] })!;
  assert.equal(ro.outraUnidade, true);
  assert.equal(ro.existente, null);
  assert.deepEqual(ro.outros, []);
  // camposIdentidadeAlterados: mudar o CPF (e só o CPF) conta; mesmo CPF com outra máscara não
  const atual = { id: idCli(1), nome: "João", ativo: true, cpf: CPF, unidade_id: U1 };
  assert.deepEqual([...camposIdentidadeAlterados(atual, { cpf: "111.444.777-35" }, false)], ["cpf"]);
  assert.deepEqual([...camposIdentidadeAlterados(atual, { cpf: CPF_DIGITOS }, false)], []);
  assert.ok(camposIdentidadeAlterados(atual, {}, true).has("cpf"), "reativar reavalia o CPF");
  // mensagens (a resposta HTTP): CPF específico e o texto genérico "documento" do cadastro por solicitação
  const bloqueioCpf = await respostaDuplicidade(avaliarDuplicidade({ nome: "X Y", cpf: CPF }, [{ id: idCli(1), nome: "João", ativo: true, cpf: CPF, unidade_id: U1 }], { papelFull: false, unidadesPermitidas: [U1] })!).json();
  assert.equal(bloqueioCpf.error, "Já existe um cliente cadastrado com este CPF.");
  assert.equal(bloqueioCpf.duplicidade.bloqueio, "cpf");
  const generica = await respostaDuplicidade(ro, false, { documentoGenerico: true }).json();
  assert.equal(generica.error, MSG_DOCUMENTO_OUTRA_UNIDADE);
  assert.equal(MSG_DOCUMENTO_OUTRA_UNIDADE, "Este documento já está cadastrado em outra unidade. Fale com a diretoria.");
  assert.ok(!JSON.stringify(generica).includes("João") && !JSON.stringify(generica).includes("529") && generica.duplicidade.existente === null);
  const jaGenerica = await respostaDuplicidade(avaliarDuplicidade({ nome: "X Y", cnpj: CNPJ }, [{ id: idCli(2), nome: "Alfa", ativo: true, cnpj: CNPJ, unidade_id: U1 }], { papelFull: false, unidadesPermitidas: [U1] })!, false, { documentoGenerico: true }).json();
  assert.equal(jaGenerica.error, MSG_DOCUMENTO_JA_CADASTRADO);
  // texto legado do CNPJ (sem a opção) continua igual
  const legado = await respostaDuplicidade(avaliarDuplicidade({ nome: "X Y", cnpj: CNPJ }, [{ id: idCli(2), nome: "Alfa", ativo: true, cnpj: CNPJ, unidade_id: U1 }], { papelFull: false, unidadesPermitidas: [U1] })!).json();
  assert.equal(legado.error, "Já existe um cliente cadastrado com este CNPJ.");
});

// ── Rota vincular-cliente (banco em memória) ─────────────────────────────────
const SOL = idCli(901);
const VAGA = idCli(902);
const CLI = idCli(903);
const CLI_OUTRO = idCli(904);
const esperarPendentes = async () => { await Promise.all((globalThis as any).__PENDENTES__ ?? []); };
const silencio = console.error;
console.error = () => undefined;

function solicitacaoNoBanco(extra: Record<string, unknown> = {}) {
  return {
    id: SOL, status: "pendente", origem: "link_publico", tipo_servico: "recrutamento_selecao", unidade_id: U1, cliente_id: null, vaga_id: null,
    cliente_nome: "Indústria Exemplo Ltda", cidade: "Hortolândia", cargo: "Auxiliar administrativo", created_at: new Date().toISOString(),
    dados_empresa: { tipo_pessoa: "pj", nome: "Indústria Exemplo Ltda", cnpj_cpf: CNPJ, contato_nome: "Maria Souza", telefone: "(19) 99999-8888", email: "contato@exemplo.com.br", email_nf: "financeiro@exemplo.com.br", endereco: "Rua A, 10, Centro" },
    ...extra,
  };
}
function clienteNoBanco(extra: Record<string, unknown> = {}) {
  return {
    id: CLI, nome: "Outra Empresa SA", contato_nome: "Pedro", contato_telefone: "(11) 4000-1000", contato_email: "pedro@outra.com.br", cidade: "Campinas", segmento: "Indústria",
    servicos: ["recrutamento_selecao"], ativo: true, cnpj: null, cpf: null, tipo_pessoa: "pj", email_nota_fiscal: null, endereco: null, unidade_id: U1, ...extra,
  };
}
function vagaNoBanco(extra: Record<string, unknown> = {}) {
  return {
    id: VAGA, titulo: "Auxiliar administrativo", tipo_servico: "recrutamento_selecao", cliente_id: null, cliente_nome: null, unidade_id: U1,
    fee_rs_percentual: 45, fee_rs_prazo_cobranca: "14 dias", taxa_cancelamento: true, taxa_cancelamento_percentual: 25, salario: "2500", ...extra,
  };
}
function bancoDoVinculo(o: { sol?: Record<string, unknown>; clientes?: Record<string, unknown>[]; vaga?: Record<string, unknown> | null } = {}) {
  return criarDb({
    solicitacoes_vagas: [o.sol ?? solicitacaoNoBanco()],
    clientes: o.clientes ?? [],
    vagas: o.vaga ? [o.vaga] : [],
    candidatos_vagas: [{ id: "cv-1", candidato_id: "cand-1", vaga_id: VAGA }],
    candidatos: [{ id: "cand-1", nome_completo: "Fulano de Tal" }],
    cobrancas_rs: [],
    notificacoes_analista: [],
    audit_logs: [],
    analistas_perfil: [
      { id: "a1", user_id: "user-1", unidade_id: U1, acesso_todas_unidades: false, nome_completo: "Ana Analista", ativo: true, nivel_acesso: "analista" },
      { id: "a2", user_id: "user-2", unidade_id: U2, acesso_todas_unidades: false, nome_completo: "Bia Outra Unidade", ativo: true, nivel_acesso: "analista" },
      { id: "a3", user_id: "user-socio", unidade_id: U1, acesso_todas_unidades: true, nome_completo: "Sócio", ativo: true, nivel_acesso: "diretoria" },
    ],
  });
}
async function chamar(db: any, corpo: unknown, { usuario = "user-1", id = SOL, papel = "analista" }: { usuario?: string | null; id?: string; papel?: string } = {}) {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: papel } } : null;
  (globalThis as any).__DB__ = db;
  const req = Object.assign(new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }), { nextUrl: new URL("http://x/api") });
  const r = await rotaVincular.POST(req as never, { params: Promise.resolve({ id }) });
  return { status: r.status, body: await r.json() };
}
const corpoCriar = (cliente: Record<string, unknown> = {}, topo: Record<string, unknown> = {}) => ({
  modo: "criar",
  cliente: {
    tipo_pessoa: "pj", nome: "Indústria Exemplo Ltda", contato_nome: "Maria Souza", contato_telefone: "(19) 99999-8888", contato_email: "contato@exemplo.com.br",
    cidade: "Hortolândia", segmento: "Indústria", servicos: ["recrutamento_selecao"], responsavel_comercial: "Ana", cnpj: CNPJ_DIGITOS, cpf: "", email_nota_fiscal: "", endereco: "", ...cliente,
  },
  ...topo,
});
const corpoVincular = (extra: Record<string, unknown> = {}) => ({ modo: "vincular", cliente_id: CLI, ...extra });
const acoes = (db: any, acao?: string) => db.tabelas.audit_logs.filter((a: any) => !acao || a.acao === acao);
const CONSTRAINT_CNPJ = 'duplicate key value violates unique constraint "clientes_cnpj_ativo_unico"';

await casoRota("criar cliente PJ: nasce na unidade da SOLICITAÇÃO (o corpo não manda), \"\" vira null, vincula solicitação e vaga e audita só ids", async () => {
  const db = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco() });
  const r = await chamar(db, corpoCriar({ unidade_id: U2 }, { unidade_id: U2 }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(db.tabelas.clientes.length, 1);
  const novo = db.tabelas.clientes[0];
  assert.equal(novo.unidade_id, U1, "unidade vem da solicitação, nunca do corpo");
  assert.equal(novo.cnpj, CNPJ, "documento padronizado");
  assert.strictEqual(novo.endereco, null, "\"\" vira null");
  assert.ok(!("cpf" in novo) && !("email_nota_fiscal" in novo) && !("tipo_pessoa" in novo), "PJ sem os campos novos não depende da migração");
  assert.deepEqual(novo.servicos, ["recrutamento_selecao"]);
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, novo.id);
  assert.equal(db.tabelas.vagas[0].cliente_id, novo.id);
  assert.equal(r.body.data.vaga_vinculada, true);
  assert.equal(r.body.data.cliente.id, novo.id);
  await esperarPendentes();
  assert.deepEqual(acoes(db).map((a: any) => a.acao).sort(), ["cliente_criado", "solicitacao_cliente_cadastrado"]);
  const texto = JSON.stringify(acoes(db));
  for (const proibido of ["11222333", "11.222", "(19)", "@", "Maria", "Rua A", "99999"]) assert.ok(!texto.includes(proibido), `auditoria não pode conter "${proibido}"`);
  const [cad] = acoes(db, "solicitacao_cliente_cadastrado");
  assert.deepEqual(cad.detalhes, { cliente_id: novo.id, vaga_id: VAGA, vaga_vinculada: true, vaga: "vinculada", duplicidade_confirmada: false, motivos: [] });
  assert.equal(cad.entidade_id, SOL);
});
await casoRota("criar cliente PF: CPF validado e padronizado, cnpj \"\" vira null (check do banco), tipo pf e e-mail da NF gravados; auditoria sem nome da pessoa nem CPF", async () => {
  const db = bancoDoVinculo({ sol: solicitacaoNoBanco({ dados_empresa: { tipo_pessoa: "pf", nome: "João da Silva", cnpj_cpf: CPF } }) });
  const r = await chamar(db, corpoCriar({ tipo_pessoa: "pf", nome: "João da Silva", contato_nome: "João da Silva", cnpj: "", cpf: CPF_DIGITOS, email_nota_fiscal: "nf@joao.com.br", endereco: "Rua X, 5" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const novo = db.tabelas.clientes[0];
  assert.equal(novo.tipo_pessoa, "pf");
  assert.equal(novo.cpf, CPF);
  assert.strictEqual(novo.cnpj, null, "cnpj \"\" tem que virar null, nunca \"\"");
  assert.ok(!(novo.cpf !== null && novo.cnpj !== null), "o check do banco passaria");
  assert.equal(novo.email_nota_fiscal, "nf@joao.com.br");
  assert.equal(novo.endereco, "Rua X, 5");
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, novo.id);
  assert.equal(r.body.data.vaga, "sem_vaga");
  await esperarPendentes();
  const texto = JSON.stringify(acoes(db));
  for (const proibido of ["João", "Silva", "529", "joao", "@", "Rua X"]) assert.ok(!texto.includes(proibido), `auditoria não pode conter "${proibido}"`);
  assert.ok(!("nome" in acoes(db, "cliente_criado")[0].detalhes), "nome de pessoa física não vai para a auditoria");
});
caso("schema da rota: unidade_id (e qualquer campo desconhecido) enviado no corpo é descartado antes de chegar na rota", () => {
  const r = solicitacaoVincularClienteSchema.safeParse({ ...corpoCriar({ unidade_id: U2, id: "x", ativo: false }), unidade_id: U2 });
  assert.ok(r.success);
  if (r.success && r.data.modo === "criar") {
    assert.ok(!("unidade_id" in r.data) && !("unidade_id" in r.data.cliente) && !("id" in r.data.cliente) && !("ativo" in r.data.cliente));
    assert.deepEqual(r.data.cliente.servicos, ["recrutamento_selecao"]);
  }
  const v = solicitacaoVincularClienteSchema.safeParse({ modo: "vincular", cliente_id: CLI, unidade_id: U2, completar_vazios: true });
  assert.ok(v.success && !("unidade_id" in v.data));
  assert.ok(!solicitacaoVincularClienteSchema.safeParse({ modo: "vincular", cliente_id: "x" }).success);
});
await casoRota("portões da rota: login, solicitação de outra unidade (404), origem portal, recusada, já vinculada, corpo inválido, documento inválido ou trocado", async () => {
  assert.equal((await chamar(bancoDoVinculo(), corpoCriar(), { usuario: null })).status, 401);
  assert.equal((await chamar(bancoDoVinculo(), corpoCriar(), { usuario: "user-2" })).status, 404, "analista de outra unidade nem sabe que existe");
  assert.equal((await chamar(bancoDoVinculo(), corpoCriar(), { id: "nao-e-uuid" })).status, 404);
  assert.equal((await chamar(bancoDoVinculo(), corpoCriar(), { id: idCli(999) })).status, 404);
  const portal = bancoDoVinculo({ sol: solicitacaoNoBanco({ origem: "portal" }) });
  assert.equal((await chamar(portal, corpoCriar())).status, 400);
  assert.equal(portal.tabelas.clientes.length, 0);
  const recusada = bancoDoVinculo({ sol: solicitacaoNoBanco({ status: "recusada" }) });
  const rr = await chamar(recusada, corpoCriar());
  assert.equal(rr.status, 409);
  assert.match(rr.body.error, /recusada/);
  assert.equal(recusada.tabelas.clientes.length, 0);
  const jaVinculada = bancoDoVinculo({ sol: solicitacaoNoBanco({ cliente_id: CLI_OUTRO }) });
  assert.equal((await chamar(jaVinculada, corpoCriar())).status, 409);
  assert.equal(jaVinculada.tabelas.clientes.length, 0);
  const db = bancoDoVinculo();
  for (const ruim of [{ segmento: "Inventado" }, { nome: "x" }, { contato_email: "sem-arroba" }, { contato_telefone: "" }, { cidade: "" }, { servicos: ["outro"] }, { tipo_pessoa: "mei" }, { email_nota_fiscal: "ruim" }]) {
    assert.equal((await chamar(db, corpoCriar(ruim))).status, 400, JSON.stringify(ruim));
  }
  assert.equal((await chamar(db, { modo: "outro" })).status, 400);
  assert.equal((await chamar(db, null)).status, 400);
  const cnpjRuim = await chamar(db, corpoCriar({ cnpj: "11.222.333/0001-80" }));
  assert.equal(cnpjRuim.status, 400);
  assert.equal(cnpjRuim.body.campo, "cnpj");
  const cpfRuim = await chamar(db, corpoCriar({ tipo_pessoa: "pf", cnpj: "", cpf: "529.982.247-24" }));
  assert.equal(cpfRuim.status, 400);
  assert.equal(cpfRuim.body.campo, "cpf");
  assert.equal((await chamar(db, corpoCriar({ tipo_pessoa: "pf", cnpj: CNPJ, cpf: CPF }))).status, 400, "PF com CNPJ");
  assert.equal((await chamar(db, corpoCriar({ tipo_pessoa: "pj", cnpj: CNPJ, cpf: CPF }))).status, 400, "PJ com CPF");
  assert.equal(db.tabelas.clientes.length, 0, "nada foi criado em nenhuma das recusas");
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, null);
});
await casoRota("duplicidade: CNPJ ou CPF igual na mesma unidade devolve o candidato (409), não cria nem vincula; inativo oferece reativar; telefone+e-mail só a diretoria libera", async () => {
  const db = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: CNPJ })] });
  const r = await chamar(db, corpoCriar());
  assert.equal(r.status, 409);
  assert.equal(r.body.jaExiste, true);
  assert.equal(r.body.duplicidade.bloqueio, "cnpj");
  assert.equal(r.body.duplicidade.existente.id, CLI, "devolve o candidato para o analista decidir");
  assert.equal(r.body.duplicidade.podeConfirmar, false);
  assert.equal(r.body.error, MSG_DOCUMENTO_JA_CADASTRADO);
  assert.equal(db.tabelas.clientes.length, 1, "nada criado");
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, null, "nunca vincula sozinho");
  // CPF
  const dbPf = bancoDoVinculo({ clientes: [clienteNoBanco({ nome: "João da Silva", tipo_pessoa: "pf", cpf: CPF })] });
  const rp = await chamar(dbPf, corpoCriar({ tipo_pessoa: "pf", nome: "João Silva", cnpj: "", cpf: CPF_DIGITOS }));
  assert.equal(rp.status, 409);
  assert.equal(rp.body.duplicidade.bloqueio, "cpf");
  assert.equal(rp.body.duplicidade.existente.id, CLI);
  // inativo: oferece reativar (o fluxo de reativação que já existe), sem criar
  const dbIn = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: CNPJ, ativo: false })] });
  const ri = await chamar(dbIn, corpoCriar());
  assert.equal(ri.status, 409);
  assert.equal(ri.body.duplicidade.podeReativar, true);
  assert.match(ri.body.error, /inativo/);
  assert.equal(dbIn.tabelas.clientes.length, 1);
  // telefone + e-mail iguais: bloqueio liberável só por papel de diretoria
  const dbContato = bancoDoVinculo({ clientes: [clienteNoBanco({ contato_telefone: "(19) 99999-8888", contato_email: "contato@exemplo.com.br", nome: "Nome Completamente Diferente" })] });
  const rc = await chamar(dbContato, corpoCriar({ cnpj: "" }));
  assert.equal(rc.status, 409);
  assert.equal(rc.body.duplicidade.bloqueio, "contato");
  assert.equal(rc.body.duplicidade.podeLiberar, false);
  const rcLiberaAnalista = await chamar(dbContato, corpoCriar({ cnpj: "" }, { liberar_bloqueio: true }));
  assert.equal(rcLiberaAnalista.status, 403);
  assert.equal(dbContato.tabelas.clientes.length, 1);
  const rcLiberaDiretoria = await chamar(dbContato, corpoCriar({ cnpj: "" }, { liberar_bloqueio: true }), { usuario: "user-socio", papel: "diretoria" });
  assert.equal(rcLiberaDiretoria.status, 201, JSON.stringify(rcLiberaDiretoria.body));
  await esperarPendentes();
  const [lib] = acoes(dbContato, "cliente_bloqueio_liberado");
  assert.deepEqual(Object.keys(lib.detalhes).sort(), ["existente_id", "motivos"]);
});
await casoRota("duplicidade: nome parecido é aviso e exige confirmação manual; confirmado, cria e audita só ids e motivos", async () => {
  const db = bancoDoVinculo({ clientes: [clienteNoBanco({ nome: "Indústria Exemplo", contato_telefone: "(11) 4000-1000", contato_email: "pedro@outra.com.br" })] });
  const sem = await chamar(db, corpoCriar({ cnpj: "" }));
  assert.equal(sem.status, 409);
  assert.equal(sem.body.duplicidade.nivel, "aviso");
  assert.equal(sem.body.duplicidade.podeConfirmar, true);
  assert.equal(sem.body.duplicidade.existente.id, CLI);
  assert.equal(db.tabelas.clientes.length, 1);
  const com = await chamar(db, corpoCriar({ cnpj: "" }, { confirmar_duplicidade: true }));
  assert.equal(com.status, 201, JSON.stringify(com.body));
  assert.equal(db.tabelas.clientes.length, 2);
  await esperarPendentes();
  const [conf] = acoes(db, "cliente_duplicidade_confirmada");
  assert.deepEqual(conf.detalhes, { existente_id: CLI, motivos: ["nome"] });
  const [cad] = acoes(db, "solicitacao_cliente_cadastrado");
  assert.equal(cad.detalhes.duplicidade_confirmada, true);
  assert.deepEqual(cad.detalhes.motivos, ["nome"]);
});
await casoRota("documento em OUTRA unidade: só \"fale com a diretoria\", sem dado nenhum — também para quem enxerga todas as unidades", async () => {
  for (const [usuario, papel] of [["user-1", "analista"], ["user-socio", "diretoria"]] as const) {
    const db = bancoDoVinculo({ clientes: [clienteNoBanco({ id: CLI_OUTRO, nome: "Concorrente Secreto SA", cnpj: CNPJ, unidade_id: U2, contato_telefone: "(11) 3333-4444", contato_email: "secreto@concorrente.com.br" })] });
    const r = await chamar(db, corpoCriar(), { usuario, papel });
    assert.equal(r.status, 409, usuario);
    assert.equal(r.body.error, "Este documento já está cadastrado em outra unidade. Fale com a diretoria.");
    assert.equal(r.body.duplicidade.outraUnidade, true);
    assert.equal(r.body.duplicidade.existente, null);
    const texto = JSON.stringify(r.body);
    for (const proibido of ["Concorrente", "Secreto", "secreto@", "3333", CLI_OUTRO, "11.222", "11222333"]) assert.ok(!texto.includes(proibido), `resposta não pode conter "${proibido}" (${usuario})`);
    assert.equal(db.tabelas.clientes.length, 1);
    assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, null);
  }
  const dbCpf = bancoDoVinculo({ clientes: [clienteNoBanco({ id: CLI_OUTRO, nome: "Pessoa de Outra Unidade", tipo_pessoa: "pf", cpf: CPF, unidade_id: U2 })] });
  const rc = await chamar(dbCpf, corpoCriar({ tipo_pessoa: "pf", cnpj: "", cpf: CPF_DIGITOS, nome: "Fulano de Tal" }));
  assert.equal(rc.status, 409);
  assert.equal(rc.body.error, MSG_DOCUMENTO_OUTRA_UNIDADE);
  assert.ok(!JSON.stringify(rc.body).includes("Pessoa de Outra"));
});
await casoRota("corrida no banco (23505 nos índices únicos): vira a resposta de duplicidade, não erro 500, e nada fica vinculado", async () => {
  const db = bancoDoVinculo();
  (db as any).ganchos = {
    "clientes.insert": async () => {
      // Outra pessoa cadastrou o mesmo CNPJ entre a checagem e o INSERT.
      db.tabelas.clientes.push(clienteNoBanco({ cnpj: CNPJ }));
      db.falhas["clientes.insert"] = { code: "23505", message: CONSTRAINT_CNPJ };
    },
  };
  const r = await chamar(db, corpoCriar());
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.jaExiste, true);
  assert.equal(r.body.duplicidade.existente.id, CLI);
  assert.equal(r.body.error, MSG_DOCUMENTO_JA_CADASTRADO);
  assert.equal(db.tabelas.clientes.length, 1, "só o cadastro da outra pessoa");
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, null);
  // 23505 do índice de CPF sem cadastro visível (outra unidade já filtrada, ou lido tarde): mensagem específica, ainda 409
  const db2 = bancoDoVinculo();
  db2.falhas["clientes.insert"] = { code: "23505", message: 'duplicate key value violates unique constraint "clientes_cpf_ativo_unico"' };
  const r2 = await chamar(db2, corpoCriar({ tipo_pessoa: "pf", cnpj: "", cpf: CPF_DIGITOS }));
  assert.equal(r2.status, 409);
  assert.equal(r2.body.error, "Já existe um cliente ativo com este CPF.");
  assert.equal(db2.tabelas.clientes.length, 0);
});
await casoRota("vínculo na solicitação é UPDATE condicional: se mudou no meio (já vinculada ou decidida), 409, e o cliente recém-criado é desfeito (sem órfão)", async () => {
  const jaVinculada = bancoDoVinculo();
  (jaVinculada as any).ganchos = { "solicitacoes_vagas.update": async () => { jaVinculada.tabelas.solicitacoes_vagas[0].cliente_id = CLI_OUTRO; } };
  const r = await chamar(jaVinculada, corpoCriar());
  assert.equal(r.status, 409);
  assert.match(r.body.error, /já foi vinculada ou decidida/);
  assert.equal(jaVinculada.tabelas.solicitacoes_vagas[0].cliente_id, CLI_OUTRO, "o vínculo da outra pessoa não é sobrescrito");
  assert.equal(jaVinculada.tabelas.clientes.length, 0, "cliente criado foi apagado (compensação)");
  assert.ok(!("cliente_orfao_id" in r.body));
  const recusadaNoMeio = bancoDoVinculo();
  (recusadaNoMeio as any).ganchos = { "solicitacoes_vagas.update": async () => { recusadaNoMeio.tabelas.solicitacoes_vagas[0].status = "recusada"; } };
  const r2 = await chamar(recusadaNoMeio, corpoCriar());
  assert.equal(r2.status, 409);
  assert.equal(recusadaNoMeio.tabelas.solicitacoes_vagas[0].cliente_id, null);
  assert.equal(recusadaNoMeio.tabelas.clientes.length, 0);
  // modo vincular: mesma trava, e nada é completado no cliente
  const vincularNoMeio = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: null })] });
  (vincularNoMeio as any).ganchos = { "solicitacoes_vagas.update": async () => { vincularNoMeio.tabelas.solicitacoes_vagas[0].cliente_id = CLI_OUTRO; } };
  const r3 = await chamar(vincularNoMeio, corpoVincular({ completar_vazios: true }));
  assert.equal(r3.status, 409);
  assert.strictEqual(vincularNoMeio.tabelas.clientes[0].cnpj, null, "não completou nada");
  assert.equal(vincularNoMeio.tabelas.solicitacoes_vagas[0].cliente_id, CLI_OUTRO);
});
await casoRota("falha ao vincular: 500 sem alterar nada (desfaz com confirmação e só então apaga o cliente); se não der para confirmar o desfazer, o cliente fica e a resposta traz o id órfão", async () => {
  // falha só no vínculo (o desfazer funciona): cliente apagado, nada ficou
  const db = bancoDoVinculo();
  (db as any).ganchos = { "solicitacoes_vagas.update": async () => { db.falhas["solicitacoes_vagas.update"] = "falha simulada"; (db as any).ganchos["solicitacoes_vagas.update"] = async () => { delete db.falhas["solicitacoes_vagas.update"]; }; } };
  const r = await chamar(db, corpoCriar());
  assert.equal(r.status, 500);
  assert.match(r.body.error, /Nada foi alterado/);
  assert.equal(db.tabelas.clientes.length, 0);
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, null);
  // o desfazer também falha: não apaga o cliente (poderia levar a solicitação junto) e diz qual é
  const db2 = bancoDoVinculo();
  db2.falhas["solicitacoes_vagas.update"] = "falha simulada";
  const r2 = await chamar(db2, corpoCriar());
  assert.equal(r2.status, 500);
  assert.equal(db2.tabelas.solicitacoes_vagas.length, 1);
  assert.equal(db2.tabelas.clientes.length, 1, "o cadastro ficou (não deu para confirmar o desfazer)...");
  assert.equal(r2.body.cliente_orfao_id, db2.tabelas.clientes[0].id, "...e a resposta diz qual é");
  // desfazer confirmado mas o delete do cliente falha: também devolve o id
  const db3 = bancoDoVinculo();
  (db3 as any).ganchos = { "solicitacoes_vagas.update": async () => { db3.falhas["solicitacoes_vagas.update"] = "falha simulada"; (db3 as any).ganchos["solicitacoes_vagas.update"] = async () => { delete db3.falhas["solicitacoes_vagas.update"]; }; } };
  db3.falhas["clientes.delete"] = "falha simulada ao apagar";
  const r3 = await chamar(db3, corpoCriar());
  assert.equal(r3.status, 500);
  assert.equal(r3.body.cliente_orfao_id, db3.tabelas.clientes[0].id);
});
await casoRota("vaga: só recebe o cliente se estiver sem cliente e na mesma unidade; falha ao atualizar a vaga desfaz tudo; sem vaga também funciona", async () => {
  const comOutro = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco({ cliente_id: CLI_OUTRO }) });
  const r = await chamar(comOutro, corpoCriar());
  assert.equal(r.status, 201);
  assert.equal(r.body.data.vaga_vinculada, false);
  assert.equal(r.body.data.vaga, "vaga_nao_alterada");
  assert.equal(comOutro.tabelas.vagas[0].cliente_id, CLI_OUTRO, "não sobrescreve o cliente que a vaga já tinha");
  assert.equal(comOutro.tabelas.solicitacoes_vagas[0].cliente_id, comOutro.tabelas.clientes[0].id);
  const outraUnidade = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco({ unidade_id: U2 }) });
  const r2 = await chamar(outraUnidade, corpoCriar());
  assert.equal(r2.status, 201);
  assert.equal(r2.body.data.vaga, "vaga_nao_alterada");
  assert.equal(outraUnidade.tabelas.vagas[0].cliente_id, null);
  const falhaVaga = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco() });
  (falhaVaga as any).ganchos = { "vagas.update": async () => { falhaVaga.falhas["vagas.update"] = "falha simulada"; (falhaVaga as any).ganchos["vagas.update"] = async () => { delete falhaVaga.falhas["vagas.update"]; }; } };
  const r3 = await chamar(falhaVaga, corpoCriar());
  assert.equal(r3.status, 500);
  assert.equal(falhaVaga.tabelas.solicitacoes_vagas[0].cliente_id, null, "vínculo da solicitação desfeito");
  assert.equal(falhaVaga.tabelas.clientes.length, 0, "cliente criado apagado");
  assert.equal(falhaVaga.tabelas.vagas[0].cliente_id, null);
  const semVaga = bancoDoVinculo();
  const r4 = await chamar(semVaga, corpoCriar());
  assert.equal(r4.status, 201);
  assert.equal(r4.body.data.vaga, "sem_vaga");
});
await casoRota("vincular a cliente existente: liga solicitação e vaga; completar_vazios só preenche vazios, nunca sobrescreve, e a auditoria leva só NOMES de campos", async () => {
  const db = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco(), clientes: [clienteNoBanco({ cnpj: null, endereco: "", email_nota_fiscal: null })] });
  const r = await chamar(db, corpoVincular({ completar_vazios: true }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, CLI);
  assert.equal(db.tabelas.vagas[0].cliente_id, CLI);
  assert.equal(r.body.data.vaga_vinculada, true);
  assert.deepEqual([...r.body.data.completados].sort(), ["cnpj", "email_nota_fiscal", "endereco"]);
  const c = db.tabelas.clientes[0];
  assert.equal(c.cnpj, CNPJ);
  assert.equal(c.endereco, "Rua A, 10, Centro");
  assert.equal(c.email_nota_fiscal, "financeiro@exemplo.com.br");
  assert.equal(c.cidade, "Campinas", "o que já estava preenchido não muda");
  assert.equal(c.contato_nome, "Pedro");
  assert.equal(c.contato_email, "pedro@outra.com.br");
  assert.ok(r.body.data.divergentes.includes("cidade") && r.body.data.divergentes.includes("contato_nome"));
  await esperarPendentes();
  const [aud] = acoes(db, "solicitacao_cliente_vinculado");
  assert.deepEqual([...aud.detalhes.campos_completados].sort(), ["cnpj", "email_nota_fiscal", "endereco"]);
  assert.equal(aud.detalhes.cliente_id, CLI);
  const texto = JSON.stringify(aud);
  for (const proibido of ["11.222", "11222333", "Rua A", "financeiro@", "@", "Maria", "Pedro"]) assert.ok(!texto.includes(proibido), `auditoria não pode conter "${proibido}"`);
  // sem completar_vazios, nada do cadastro muda
  const db2 = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: null, endereco: null })] });
  const r2 = await chamar(db2, corpoVincular());
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.body.data.completados, []);
  assert.strictEqual(db2.tabelas.clientes[0].cnpj, null);
  assert.equal(db2.tabelas.solicitacoes_vagas[0].cliente_id, CLI);
  // CPF de solicitação PF só completa cadastro PF
  const dbPf = bancoDoVinculo({ sol: solicitacaoNoBanco({ dados_empresa: { tipo_pessoa: "pf", nome: "João da Silva", cnpj_cpf: CPF } }), clientes: [clienteNoBanco({ tipo_pessoa: "pj", nome: "João da Silva" })] });
  const rpf = await chamar(dbPf, corpoVincular({ completar_vazios: true }));
  assert.equal(rpf.status, 200);
  assert.ok(!("cpf" in dbPf.tabelas.clientes[0]) || dbPf.tabelas.clientes[0].cpf === null, "CPF não entra em cadastro PJ");
  assert.ok(rpf.body.data.divergentes.includes("cpf"));
});
await casoRota("vincular: inativo pede reativação antes; cliente de outra unidade (404 ou 400), inexistente, já vinculada e mudança no cadastro durante o completar", async () => {
  const inativo = bancoDoVinculo({ clientes: [clienteNoBanco({ ativo: false })] });
  const ri = await chamar(inativo, corpoVincular());
  assert.equal(ri.status, 409);
  assert.equal(ri.body.precisaReativar, true);
  assert.deepEqual(ri.body.cliente, { id: CLI, nome: "Outra Empresa SA" });
  assert.equal(inativo.tabelas.solicitacoes_vagas[0].cliente_id, null, "não vincula nem reativa sozinho");
  assert.equal(inativo.tabelas.clientes[0].ativo, false);
  // depois de reativar pelo fluxo existente, vincula
  inativo.tabelas.clientes[0].ativo = true;
  assert.equal((await chamar(inativo, corpoVincular())).status, 200);
  const outraUnidade = bancoDoVinculo({ clientes: [clienteNoBanco({ unidade_id: U2 })] });
  const comum = await chamar(outraUnidade, corpoVincular());
  assert.equal(comum.status, 404, "analista comum não descobre o cliente da outra unidade");
  const socio = await chamar(outraUnidade, corpoVincular(), { usuario: "user-socio", papel: "diretoria" });
  assert.equal(socio.status, 400);
  assert.match(socio.body.error, /outra unidade/);
  assert.equal(outraUnidade.tabelas.solicitacoes_vagas[0].cliente_id, null);
  assert.equal((await chamar(bancoDoVinculo(), corpoVincular())).status, 404, "cliente inexistente");
  assert.equal((await chamar(bancoDoVinculo(), { modo: "vincular", cliente_id: "nao-uuid" })).status, 400);
  const ja = bancoDoVinculo({ sol: solicitacaoNoBanco({ cliente_id: CLI_OUTRO }), clientes: [clienteNoBanco()] });
  assert.equal((await chamar(ja, corpoVincular())).status, 409);
  const recusada = bancoDoVinculo({ sol: solicitacaoNoBanco({ status: "recusada" }), clientes: [clienteNoBanco()] });
  assert.equal((await chamar(recusada, corpoVincular())).status, 409);
  // alguém preenche o cadastro no meio do completar: o vínculo fica, o completar avisa o conflito e não sobrescreve
  const meio = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: null })] });
  (meio as any).ganchos = { "clientes.update": async () => { meio.tabelas.clientes[0].cnpj = "99.888.777/0001-66"; } };
  const rm = await chamar(meio, corpoVincular({ completar_vazios: true }));
  assert.equal(rm.status, 200);
  assert.equal(rm.body.data.completar_conflito, true);
  assert.deepEqual(rm.body.data.completados, []);
  assert.equal(meio.tabelas.clientes[0].cnpj, "99.888.777/0001-66", "o que a outra pessoa preencheu não é sobrescrito");
  assert.equal(meio.tabelas.solicitacoes_vagas[0].cliente_id, CLI);
});
await casoRota("depois de vincular, a cobrança R&S acha o cliente por vagas.cliente_id (contratação e cancelamento); antes, 'sem_cliente_vinculado'", async () => {
  const db = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco() });
  (globalThis as any).__DB__ = db;
  assert.deepEqual(await gerarCobrancaRSSeAplicavel(VAGA, "cv-1"), { criada: false, motivo: "sem_cliente_vinculado" });
  assert.deepEqual(await gerarCobrancaCancelamentoRSSeAplicavel(VAGA), { criada: false, motivo: "sem_cliente_vinculado" });
  assert.equal(db.tabelas.cobrancas_rs.length, 0);
  const r = await chamar(db, corpoCriar());
  assert.equal(r.status, 201);
  const clienteId = db.tabelas.clientes[0].id;
  const contratacao = await gerarCobrancaRSSeAplicavel(VAGA, "cv-1");
  assert.equal(contratacao.criada, true, JSON.stringify(contratacao));
  const cob = db.tabelas.cobrancas_rs.find((c: any) => c.tipo !== "cancelamento");
  assert.equal(cob.cliente_id, clienteId);
  assert.equal(cob.cliente_nome_snapshot, "Indústria Exemplo Ltda");
  assert.equal(cob.cliente_cnpj_snapshot, CNPJ);
  assert.equal(cob.fee_percentual, 45);
  assert.equal((await gerarCobrancaCancelamentoRSSeAplicavel(VAGA)).criada, true);
  const canc = db.tabelas.cobrancas_rs.find((c: any) => c.tipo === "cancelamento");
  assert.equal(canc.cliente_id, clienteId);
  assert.equal(canc.cliente_nome_snapshot, "Indústria Exemplo Ltda");
});

// ── Rotas legadas de cliente (POST e PATCH) com pessoa física, sem quebrar PJ ──
async function chamarLegado(db: any, fn: (...a: any[]) => Promise<Response>, { metodo = "POST", corpo, id }: { metodo?: string; corpo: unknown; id?: string }) {
  db.usuario = { id: "user-1", email: "user-1@t.local", app_metadata: { role: "analista" } };
  (globalThis as any).__DB__ = db;
  const req = Object.assign(new Request("http://x/api", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }), { nextUrl: new URL("http://x/api") });
  const r = await fn(req, { params: Promise.resolve({ id }) });
  return { status: r.status, body: await r.json() };
}
const corpoLegado = (extra: Record<string, unknown> = {}) => ({
  nome: "Empresa Legado SA", contato_nome: "Rui", contato_telefone: "(19) 3000-1000", contato_email: "rui@legado.com.br", cidade: "Campinas", segmento: "Comércio", servicos: [], ...extra,
});
await casoRota("POST /api/clientes (legado): PJ segue igual (CNPJ texto livre, \"\" vira null, sem colunas novas); PF grava CPF validado; documentos trocados ou inválidos dão 400; 23505 vira mensagem do índice certo", async () => {
  const db = bancoDoVinculo();
  const livre = await chamarLegado(db, rotaClientes.POST, { corpo: corpoLegado({ cnpj: "12.345 (sem dígitos válidos)" }) });
  assert.equal(livre.status, 201, JSON.stringify(livre.body));
  const pj = db.tabelas.clientes[0];
  assert.equal(pj.cnpj, "12.345 (sem dígitos válidos)", "o POST legado continua sem exigir dígitos válidos nem mascarar");
  assert.ok(!("cpf" in pj) && !("tipo_pessoa" in pj) && !("email_nota_fiscal" in pj), "PJ comum não depende da migração");
  const vazio = await chamarLegado(db, rotaClientes.POST, { corpo: corpoLegado({ nome: "Outra Empresa Legado", contato_telefone: "(19) 3000-2000", contato_email: "outra@legado.com.br", cnpj: "   " }) });
  assert.equal(vazio.status, 201);
  assert.strictEqual(db.tabelas.clientes[1].cnpj, null, "só espaços vira null");
  const pf = await chamarLegado(db, rotaClientes.POST, { corpo: corpoLegado({ nome: "Maria Pessoa Física", contato_telefone: "(19) 3000-3000", contato_email: "maria@pf.com.br", tipo_pessoa: "pf", cnpj: "", cpf: CPF_DIGITOS, email_nota_fiscal: "nf@maria.com.br" }) });
  assert.equal(pf.status, 201, JSON.stringify(pf.body));
  const mp = db.tabelas.clientes[2];
  assert.equal(mp.tipo_pessoa, "pf");
  assert.equal(mp.cpf, CPF);
  assert.strictEqual(mp.cnpj, null);
  assert.equal(mp.email_nota_fiscal, "nf@maria.com.br");
  for (const [rotulo, extra] of [["PF com CNPJ", { tipo_pessoa: "pf", cnpj: CNPJ, cpf: CPF_DIGITOS }], ["PJ com CPF", { tipo_pessoa: "pj", cnpj: CNPJ, cpf: CPF_DIGITOS }], ["CPF inválido", { tipo_pessoa: "pf", cnpj: "", cpf: "529.982.247-24" }]] as const) {
    const r = await chamarLegado(bancoDoVinculo(), rotaClientes.POST, { corpo: corpoLegado({ nome: `Teste ${rotulo}`, ...extra }) });
    assert.equal(r.status, 400, rotulo);
  }
  // CPF repetido: a trava de duplicidade bloqueia
  const dup = await chamarLegado(db, rotaClientes.POST, { corpo: corpoLegado({ nome: "Outra Pessoa", contato_telefone: "(19) 3000-4000", contato_email: "outra@pf.com.br", tipo_pessoa: "pf", cnpj: "", cpf: CPF }) });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.duplicidade.bloqueio, "cpf");
  assert.equal(dup.body.error, "Já existe um cliente cadastrado com este CPF.");
  // 23505 por corrida: mensagem do índice que estourou
  const corrida = bancoDoVinculo();
  corrida.falhas["clientes.insert"] = { code: "23505", message: 'duplicate key value violates unique constraint "clientes_cpf_ativo_unico"' };
  assert.equal((await chamarLegado(corrida, rotaClientes.POST, { corpo: corpoLegado({ tipo_pessoa: "pf", cnpj: "", cpf: CPF_DIGITOS }) })).body.error, "Já existe um cliente ativo com este CPF.");
  corrida.falhas["clientes.insert"] = { code: "23505", message: CONSTRAINT_CNPJ };
  const rc = await chamarLegado(corrida, rotaClientes.POST, { corpo: corpoLegado({ cnpj: CNPJ }) });
  assert.equal(rc.status, 409);
  assert.equal(rc.body.error, "Já existe um cliente ativo com este CNPJ.");
});
await casoRota("PATCH /api/clientes/[id]: edição comum de PJ intacta; cpf e tipo_pessoa só mudam com par cpf/cnpj coerente; e-mail da NF \"\" vira null; CPF repetido bloqueia", async () => {
  const db = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: "12.345 texto livre" }), clienteNoBanco({ id: CLI_OUTRO, nome: "Maria da Silva", contato_telefone: "(19) 3000-9999", contato_email: "maria@pf.com.br", tipo_pessoa: "pf", cpf: CPF })] });
  const simples = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cidade: "Jundiaí" } });
  assert.equal(simples.status, 200, JSON.stringify(simples.body));
  assert.equal(db.tabelas.clientes[0].cidade, "Jundiaí");
  assert.equal(db.tabelas.clientes[0].cnpj, "12.345 texto livre", "o CNPJ legado não é mexido nem validado");
  // PJ com CNPJ não vira PF sem tirar o CNPJ, e PJ não ganha CPF
  assert.equal((await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { tipo_pessoa: "pf" } })).status, 400);
  assert.equal((await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cpf: "111.444.777-35" } })).status, 400);
  // converter para PF no mesmo pedido que remove o CNPJ
  const conv = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { tipo_pessoa: "pf", cnpj: "", cpf: "111.444.777-35", email_nota_fiscal: "nf@x.com.br" } });
  assert.equal(conv.status, 200, JSON.stringify(conv.body));
  assert.equal(db.tabelas.clientes[0].tipo_pessoa, "pf");
  assert.equal(db.tabelas.clientes[0].cpf, "111.444.777-35");
  assert.strictEqual(db.tabelas.clientes[0].cnpj, null);
  assert.equal(db.tabelas.clientes[0].email_nota_fiscal, "nf@x.com.br");
  const limpa = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { email_nota_fiscal: "" } });
  assert.equal(limpa.status, 200);
  assert.strictEqual(db.tabelas.clientes[0].email_nota_fiscal, null);
  // CPF inválido e CPF de outro cliente
  assert.equal((await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cpf: "529.982.247-24" } })).status, 400);
  const dup = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cpf: CPF_DIGITOS } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.duplicidade.bloqueio, "cpf");
  assert.equal(db.tabelas.clientes[0].cpf, "111.444.777-35", "não gravou o CPF repetido");
});
await casoRota("antes da migração (coluna cpf inexistente): a checagem de duplicidade segue sem CPF e o cadastro PJ não quebra", async () => {
  const db = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: CNPJ })] });
  (db as any).ganchos = {
    // 1ª leitura de clientes (a da checagem): falha por coluna inexistente. O gancho é de uso único, então ele arma o seguinte, que limpa a falha
    // antes da 2ª leitura (o select sem cpf).
    "clientes.select": async () => {
      db.falhas["clientes.select"] = { code: "42703", message: "column clientes.cpf does not exist" };
      (db as any).ganchos["clientes.select"] = async () => { delete db.falhas["clientes.select"]; };
    },
  };
  const r = await chamarLegado(db, rotaClientes.POST, { corpo: corpoLegado({ cnpj: CNPJ }) });
  assert.equal(r.status, 409, "achou o CNPJ repetido mesmo sem a coluna cpf (a checagem caiu para o select antigo)");
  assert.equal(r.body.duplicidade.bloqueio, "cnpj");
});
// ── Correções da revisão da Parte 3 ──────────────────────────────────────────
await casoRota("CASCADE: apagar cliente ligado apaga a solicitação (o memdb emula); UPDATE que grava mas devolve erro NUNCA leva a solicitação junto", async () => {
  // prova de que a emulação funciona (senão o teste abaixo não provaria nada)
  const prova = bancoDoVinculo({ sol: solicitacaoNoBanco({ cliente_id: CLI }), clientes: [clienteNoBanco()] });
  await criarClienteServico(prova).from("clientes").delete().eq("id", CLI);
  assert.equal(prova.tabelas.solicitacoes_vagas.length, 0, "o memdb tem que apagar a solicitação junto (ON DELETE CASCADE)");

  // resposta perdida: o UPDATE gravou o vínculo mas voltou erro; o desfazer funciona → cliente apagado e solicitação preservada, desvinculada
  const db = bancoDoVinculo();
  (db as any).falhasAposGravar = { "solicitacoes_vagas.update": "resposta perdida" };
  const r = await chamar(db, corpoCriar());
  assert.equal(r.status, 500);
  assert.equal(db.tabelas.solicitacoes_vagas.length, 1, "a solicitação real continua existindo");
  assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, null, "vínculo desfeito antes de apagar o cliente");
  assert.equal(db.tabelas.clientes.length, 0);
  assert.ok(!("cliente_orfao_id" in r.body));

  // nem o desfazer dá para confirmar: o cliente NÃO é apagado (a solicitação ficaria sem o vínculo e sem o cadastro) e o id volta na resposta
  const db2 = bancoDoVinculo();
  (db2 as any).falhasAposGravar = { "solicitacoes_vagas.update": "resposta perdida" };
  (db2 as any).ganchos = { "solicitacoes_vagas.update": async () => { (db2 as any).ganchos["solicitacoes_vagas.update"] = async () => { db2.falhas["solicitacoes_vagas.update"] = "falha ao desfazer"; }; } };
  const r2 = await chamar(db2, corpoCriar());
  assert.equal(r2.status, 500);
  assert.equal(db2.tabelas.solicitacoes_vagas.length, 1, "a solicitação real continua existindo");
  assert.equal(db2.tabelas.clientes.length, 1, "cliente preservado");
  assert.equal(r2.body.cliente_orfao_id, db2.tabelas.clientes[0].id);
  assert.equal(db2.tabelas.solicitacoes_vagas[0].cliente_id, db2.tabelas.clientes[0].id, "o vínculo gravado e o cliente seguem coerentes entre si");

  // vaga: UPDATE da vaga gravou e voltou erro → vaga solta, solicitação solta, cliente apagado, solicitação preservada
  const db3 = bancoDoVinculo({ sol: solicitacaoNoBanco({ vaga_id: VAGA, status: "aprovada" }), vaga: vagaNoBanco() });
  (db3 as any).falhasAposGravar = { "vagas.update": "resposta perdida" };
  const r3 = await chamar(db3, corpoCriar());
  assert.equal(r3.status, 500);
  assert.equal(db3.tabelas.vagas[0].cliente_id, null, "vaga não ficou apontando para um cliente apagado");
  assert.equal(db3.tabelas.solicitacoes_vagas.length, 1);
  assert.equal(db3.tabelas.solicitacoes_vagas[0].cliente_id, null);
  assert.equal(db3.tabelas.clientes.length, 0);

  // vínculo concorrente (já vinculada a outro): o cliente novo é apagado sem tocar no vínculo do outro
  const db4 = bancoDoVinculo();
  (db4 as any).ganchos = { "solicitacoes_vagas.update": async () => { db4.tabelas.solicitacoes_vagas[0].cliente_id = CLI_OUTRO; } };
  const r4 = await chamar(db4, corpoCriar());
  assert.equal(r4.status, 409);
  assert.equal(db4.tabelas.solicitacoes_vagas.length, 1);
  assert.equal(db4.tabelas.solicitacoes_vagas[0].cliente_id, CLI_OUTRO);
});
await casoRota("PATCH: editar só o CNPJ de cliente PF (com CPF no banco) ou só o CPF de PJ dá 400 claro, sem tocar no banco; edição de CNPJ de PJ segue; antes da migração a edição de CNPJ de PJ não quebra", async () => {
  const db = bancoDoVinculo({ clientes: [
    clienteNoBanco({ id: CLI, nome: "Maria da Silva", tipo_pessoa: "pf", cpf: CPF, cnpj: null }),
    clienteNoBanco({ id: CLI_OUTRO, nome: "Empresa Alfa SA", contato_telefone: "(19) 3000-7777", contato_email: "alfa@x.com.br", cnpj: "12.345 livre" }),
  ] });
  const r = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cnpj: "12.345.678/0001-95" } });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.equal(r.body.campo, "cnpj");
  assert.match(r.body.error, /pessoa física/i);
  assert.strictEqual(db.tabelas.clientes[0].cnpj, null, "o banco não foi tocado");
  assert.equal(db.tabelas.clientes[0].cpf, CPF);
  // PF limpando o cnpj (vazio) é aceito, e não reescreve o CPF
  const ok = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cnpj: "", cidade: "Jundiaí" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(db.tabelas.clientes[0].cpf, CPF);
  // PJ: troca de CNPJ continua passando, texto livre
  const pj = await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI_OUTRO, corpo: { cnpj: "outro texto livre" } });
  assert.equal(pj.status, 200, JSON.stringify(pj.body));
  assert.equal(db.tabelas.clientes[1].cnpj, "outro texto livre");
  assert.ok(!("cpf" in db.tabelas.clientes[1]) || db.tabelas.clientes[1].cpf === null, "editar o CNPJ não escreve cpf");
  // PJ ganhando CPF junto com CNPJ no mesmo pedido
  assert.equal((await chamarLegado(db, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI_OUTRO, corpo: { cpf: CPF_DIGITOS } })).status, 400);

  // antes da migração: a leitura de tipo_pessoa/cpf falha (coluna inexistente) e a edição de CNPJ de PJ ainda funciona
  const antes = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: "velho" })] });
  let leituras = 0;
  const armar = () => {
    (antes as any).ganchos["clientes.select"] = async () => {
      leituras++;
      if (leituras === 1) { armar(); return; } // 1ª leitura = a do controle de acesso
      if (leituras === 2) { antes.falhas["clientes.select"] = { code: "42703", message: "column clientes.tipo_pessoa does not exist" }; armar(); return; }
      delete antes.falhas["clientes.select"];
    };
  };
  (antes as any).ganchos = {};
  armar();
  const e = await chamarLegado(antes, rotaClienteId.PATCH, { metodo: "PATCH", id: CLI, corpo: { cnpj: "novo" } });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(antes.tabelas.clientes[0].cnpj, "novo");
});
await casoRota("vincular + completar: CNPJ/CPF que já é de OUTRO cadastro (inativo ou de outra unidade) não é gravado, vira divergente, sem expor o outro; o resto completa", async () => {
  for (const [rotulo, outro] of [
    ["ativo na mesma unidade", { ativo: true, unidade_id: U1 }],
    ["inativo", { ativo: false, unidade_id: U1 }],
    ["outra unidade", { ativo: true, unidade_id: U2 }],
  ] as const) {
    const db = bancoDoVinculo({ clientes: [
      clienteNoBanco({ cnpj: null, endereco: null }),
      clienteNoBanco({ id: CLI_OUTRO, nome: "Dona Secreta do Documento", contato_telefone: "(11) 3333-0000", contato_email: "dona@secreta.com.br", cnpj: "11.222.333/0001-81", ...outro }),
    ] });
    const r = await chamar(db, corpoVincular({ completar_vazios: true }));
    assert.equal(r.status, 200, `${rotulo}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(db.tabelas.clientes[0].cnpj, null, `${rotulo}: documento de outro cadastro não pode ser gravado`);
    assert.ok(r.body.data.divergentes.includes("cnpj"), rotulo);
    assert.ok(!r.body.data.completados.includes("cnpj"), rotulo);
    assert.equal(db.tabelas.clientes[0].endereco, "Rua A, 10, Centro", `${rotulo}: o que não conflita continua sendo completado`);
    assert.equal(db.tabelas.solicitacoes_vagas[0].cliente_id, CLI, `${rotulo}: o vínculo acontece`);
    const texto = JSON.stringify(r.body);
    for (const proibido of ["Secreta", "dona@", "3333", CLI_OUTRO]) assert.ok(!texto.includes(proibido), `${rotulo}: resposta não pode conter "${proibido}"`);
    await esperarPendentes();
    const aud = JSON.stringify(acoes(db, "solicitacao_cliente_vinculado"));
    for (const proibido of ["Secreta", "dona@", "11.222", "11222333"]) assert.ok(!aud.includes(proibido), `${rotulo}: auditoria não pode conter "${proibido}"`);
  }
  // CPF
  const dbPf = bancoDoVinculo({
    sol: solicitacaoNoBanco({ dados_empresa: { tipo_pessoa: "pf", nome: "João da Silva", cnpj_cpf: CPF, telefone: "(19) 99999-8888", email: "joao@x.com.br" } }),
    clientes: [
      clienteNoBanco({ nome: "João da Silva", tipo_pessoa: "pf", cpf: null, cnpj: null }),
      clienteNoBanco({ id: CLI_OUTRO, nome: "Outro João", contato_telefone: "(11) 2222-0000", contato_email: "outro@x.com.br", tipo_pessoa: "pf", cpf: CPF_DIGITOS, ativo: false }),
    ],
  });
  const rp = await chamar(dbPf, corpoVincular({ completar_vazios: true }));
  assert.equal(rp.status, 200, JSON.stringify(rp.body));
  assert.strictEqual(dbPf.tabelas.clientes[0].cpf, null, "CPF que já é de outro cadastro (comparado sem máscara) não é gravado");
  assert.ok(rp.body.data.divergentes.includes("cpf"));
  // sem conflito, o documento é completado como antes
  const livre = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: null }), clienteNoBanco({ id: CLI_OUTRO, nome: "Beta", contato_telefone: "(11) 5555-0000", contato_email: "b@x.com.br", cnpj: "99.888.777/0001-66" })] });
  const rl = await chamar(livre, corpoVincular({ completar_vazios: true }));
  assert.equal(rl.status, 200);
  assert.equal(livre.tabelas.clientes[0].cnpj, CNPJ);
  // sem conseguir carregar os outros cadastros, não completa documento nenhum e nada fica vinculado pela metade
  const semChecagem = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: null })] });
  (semChecagem as any).ganchos = { "clientes.select": async () => { (semChecagem as any).ganchos["clientes.select"] = async () => { semChecagem.falhas["clientes.select"] = "falha simulada"; }; } };
  const rs = await chamar(semChecagem, corpoVincular({ completar_vazios: true }));
  assert.equal(rs.status, 500);
  assert.strictEqual(semChecagem.tabelas.clientes[0].cnpj, null);
  assert.equal(semChecagem.tabelas.solicitacoes_vagas[0].cliente_id, null);
  // sem completar_vazios nada disso é consultado
  const sem = bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: null })] });
  assert.equal((await chamar(sem, corpoVincular())).status, 200);
});
caso("textos da tela: rótulos de campos e explicação da vaga (cada situação diz algo diferente)", () => {
  assert.equal(rotularCampos(["cnpj", "email_nota_fiscal", "campo_novo"]), "CNPJ, E-mail da nota fiscal, campo_novo");
  const textos = (["vinculada", "vaga_nao_alterada", "sem_vaga"] as const).map(explicarSituacaoDaVaga);
  assert.equal(new Set(textos).size, 3);
  assert.match(textos[0], /cobrança de R&S poderá ser gerada/);
  assert.match(textos[1], /já tinha outro cliente ou é de outra unidade/);
  assert.match(textos[2], /ainda não foi criada/);
});
await casoRota("409 de solicitação indisponível (já vinculada, decidida, recusada, mudou no meio) traz solicitacao_indisponivel; os outros 409 NÃO (a tela só fecha o formulário no primeiro caso)", async () => {
  const comFlag = (r: { status: number; body: any }, rotulo: string) => {
    assert.equal(r.status, 409, `${rotulo}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.solicitacao_indisponivel, true, `${rotulo}: tem que marcar solicitacao_indisponivel`);
    assert.ok(solicitacaoFicouIndisponivel(r.status, r.body), rotulo);
  };
  const semFlag = (r: { status: number; body: any }, rotulo: string) => {
    assert.equal(r.status, 409, `${rotulo}: ${JSON.stringify(r.body)}`);
    assert.ok(!("solicitacao_indisponivel" in r.body), `${rotulo}: não pode marcar solicitacao_indisponivel`);
    assert.ok(!solicitacaoFicouIndisponivel(r.status, r.body), rotulo);
  };
  // solicitação indisponível, nos dois modos
  for (const corpo of [corpoCriar(), corpoVincular()]) {
    const modo = (corpo as any).modo;
    comFlag(await chamar(bancoDoVinculo({ sol: solicitacaoNoBanco({ status: "recusada" }), clientes: [clienteNoBanco()] }), corpo), `recusada (${modo})`);
    comFlag(await chamar(bancoDoVinculo({ sol: solicitacaoNoBanco({ cliente_id: CLI_OUTRO }), clientes: [clienteNoBanco()] }), corpo), `já vinculada (${modo})`);
    comFlag(await chamar(bancoDoVinculo({ sol: solicitacaoNoBanco({ status: "cancelada" }), clientes: [clienteNoBanco()] }), corpo), `já decidida de outro jeito (${modo})`);
    const meio = bancoDoVinculo({ clientes: [clienteNoBanco()] });
    (meio as any).ganchos = { "solicitacoes_vagas.update": async () => { meio.tabelas.solicitacoes_vagas[0].cliente_id = CLI_OUTRO; } };
    comFlag(await chamar(meio, corpo), `vinculada no meio (${modo})`);
    const decididaNoMeio = bancoDoVinculo({ clientes: [clienteNoBanco()] });
    (decididaNoMeio as any).ganchos = { "solicitacoes_vagas.update": async () => { decididaNoMeio.tabelas.solicitacoes_vagas[0].status = "recusada"; } };
    comFlag(await chamar(decididaNoMeio, corpo), `recusada no meio (${modo})`);
  }
  // 409 que NÃO é da solicitação: duplicidade, precisa reativar, índice único sem cadastro visível
  semFlag(await chamar(bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: CNPJ })] }), corpoCriar()), "duplicidade por CNPJ");
  semFlag(await chamar(bancoDoVinculo({ clientes: [clienteNoBanco({ nome: "Indústria Exemplo", contato_telefone: "(11) 4000-1000", contato_email: "pedro@outra.com.br" })] }), corpoCriar({ cnpj: "" })), "duplicidade por nome parecido");
  semFlag(await chamar(bancoDoVinculo({ clientes: [clienteNoBanco({ cnpj: CNPJ, ativo: false })] }), corpoCriar()), "duplicidade com cadastro inativo");
  semFlag(await chamar(bancoDoVinculo({ clientes: [clienteNoBanco({ ativo: false })] }), corpoVincular()), "precisa reativar");
  const unico = bancoDoVinculo();
  unico.falhas["clientes.insert"] = { code: "23505", message: 'duplicate key value violates unique constraint "clientes_cpf_ativo_unico"' };
  semFlag(await chamar(unico, corpoCriar({ tipo_pessoa: "pf", cnpj: "", cpf: CPF_DIGITOS })), "23505 sem cadastro visível");
  semFlag(await chamar(bancoDoVinculo({ clientes: [clienteNoBanco({ id: CLI_OUTRO, cnpj: CNPJ, unidade_id: U2 })] }), corpoCriar()), "documento em outra unidade");
  // o helper da tela: só 409 com o campo verdadeiro
  assert.ok(solicitacaoFicouIndisponivel(409, { solicitacao_indisponivel: true }));
  for (const [status, corpo] of [[409, {}], [409, { solicitacao_indisponivel: false }], [409, { solicitacao_indisponivel: "true" }], [409, null], [409, undefined], [500, { solicitacao_indisponivel: true }], [200, { solicitacao_indisponivel: true }], [404, { solicitacao_indisponivel: true }]] as const) {
    assert.ok(!solicitacaoFicouIndisponivel(status, corpo), JSON.stringify([status, corpo]));
  }
});
caso("criar vaga pede confirmação só para solicitação do link SEM cliente; aba 'Aprovadas sem cliente' filtra aprovadas do link sem cliente_id", () => {
  assert.equal(semClienteVinculado({ origem: "link_publico", cliente_id: null }), true);
  assert.equal(semClienteVinculado({ origem: "link_publico" }), true);
  assert.equal(semClienteVinculado({ origem: "link_publico", cliente_id: CLI }), false, "com cliente, cria direto");
  assert.equal(semClienteVinculado({ origem: "portal", cliente_id: null }), false, "do portal o cliente já existe: sem confirmação");
  assert.equal(semClienteVinculado({ origem: null, cliente_id: null }), false);
  const lista = [
    { id: "1", status: "aprovada", origem: "link_publico", cliente_id: null },
    { id: "2", status: "aprovada", origem: "link_publico", cliente_id: CLI },
    { id: "3", status: "aprovada", origem: "portal", cliente_id: null },
    { id: "4", status: "pendente", origem: "link_publico", cliente_id: null },
    { id: "5", status: "recusada", origem: "link_publico", cliente_id: null },
    { id: "6", status: "aprovada", origem: "link_publico" },
  ];
  assert.deepEqual(aprovadasSemCliente(lista).map((x) => x.id), ["1", "6"]);
  assert.deepEqual(aprovadasSemCliente([]), []);
});
caso("foco dos modais: só cancelar e 'criar mesmo assim' devolvem o foco ao botão de origem, e só se ele ainda existe; abrir outro modal nunca devolve", () => {
  assert.equal(devolverFocoAoFechar("cancelar", true), true);
  assert.equal(devolverFocoAoFechar("confirmar", true), true);
  assert.equal(devolverFocoAoFechar("abrir_outro_modal", true), false, "o foco é do modal que abre: devolver acionaria o botão escondido atrás");
  assert.equal(devolverFocoAoFechar("desconhecido", true), false, "fechamento sem motivo registrado não devolve");
  for (const motivo of ["cancelar", "confirmar", "abrir_outro_modal", "desconhecido"] as const) {
    assert.equal(devolverFocoAoFechar(motivo, false), false, `${motivo}: origem fora da página, não faz nada`);
  }
});
caso("foco inicial do cadastro: primeiro obrigatório vazio na ordem da tela (a partir da solicitação); senão o nome", () => {
  const cheio = { nome: "Ana", cidade: "Campinas", segmento: "Indústria", contato_nome: "Ana", contato_telefone: "(19) 99999-8888", contato_email: "a@x.com" };
  assert.equal(campoParaFocoInicial(cheio, true), "nome", "tudo preenchido: primeiro campo");
  assert.equal(campoParaFocoInicial({ ...cheio, segmento: "" }, true), "segmento");
  assert.equal(campoParaFocoInicial({ ...cheio, segmento: null, contato_nome: null }, true), "segmento", "segmento aparece antes do contato");
  assert.equal(campoParaFocoInicial({ ...cheio, contato_nome: "  " }, true), "contato_nome", "só espaços é vazio");
  assert.equal(campoParaFocoInicial({ ...cheio, contato_email: undefined }, true), "contato_email");
  assert.equal(campoParaFocoInicial({ ...cheio, nome: "", cidade: "" }, true), "nome", "nome vem antes de cidade");
  assert.equal(campoParaFocoInicial(undefined, true), "nome");
  assert.equal(campoParaFocoInicial({ ...cheio, segmento: "" }, false), "nome", "fora da solicitação: sempre o primeiro campo de texto");
});
caso("faixa 'Veio da solicitação': TODA chave que o prefill pode devolver tem rótulo legível (sem underscore, sem camelCase, diferente da chave crua)", () => {
  const base = { cliente_nome: "Indústria Exemplo", cidade: "Hortolândia", unidade_id: "unid-1", tipo_servico: "recrutamento_selecao" };
  const dadosPj = { tipo_pessoa: "pj", nome: "Indústria Exemplo", cnpj_cpf: CNPJ, contato_nome: "Maria", telefone: "(19) 99999-8888", email: "m@x.com.br", email_nf: "nf@x.com.br", endereco: "Rua A, 10" };
  const dadosPf = { tipo_pessoa: "pf", nome: "João da Silva", cnpj_cpf: CPF, telefone: "(19) 99999-8888", email: "j@x.com.br", email_nf: "nf@x.com.br", endereco: "Rua B, 5" };
  const variantes = [
    montarPrefillCliente({ ...base, dados_empresa: dadosPj }, { responsavelComercial: "Lucas" }),
    montarPrefillCliente({ ...base, dados_empresa: dadosPf }, { responsavelComercial: "Lucas" }),
    montarPrefillCliente({ ...base, dados_empresa: { ...dadosPj, endereco: null } }),
    montarPrefillCliente({ ...base, cidade: null, dados_empresa: dadosPf }),
    montarPrefillCliente({ ...base, cidade: null, dados_empresa: { ...dadosPj, endereco: "" } }, { responsavelComercial: "  " }),
    montarPrefillCliente({ cliente_nome: "Só o nome" }),
    montarPrefillCliente(null),
  ];
  const chaves = new Set<string>();
  for (const v of variantes) {
    for (const k of Object.keys(v.valores)) chaves.add(k);
    for (const k of [...v.preenchidos, ...v.sugeridos, ...v.faltando]) chaves.add(k);
  }
  assert.ok(chaves.size >= 14, `esperava todas as chaves do prefill, vieram ${chaves.size}`);
  for (const chave of chaves) {
    const rotulo = rotularCampos([chave]);
    assert.notEqual(rotulo, chave, `${chave}: sem rótulo`);
    assert.ok(!/_/.test(rotulo), `${chave}: rótulo com underscore ("${rotulo}")`);
    assert.ok(!/[a-z][A-Z]/.test(rotulo), `${chave}: rótulo em camelCase ("${rotulo}")`);
    assert.ok(rotulo.trim().length > 0 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(rotulo), `${chave}: rótulo precisa começar com maiúscula ("${rotulo}")`);
  }
  assert.equal(rotularCampos(["servicos"]), "Tipos de serviço");
  assert.equal(rotularCampos(["responsavel_comercial"]), "Responsável comercial");
  assert.equal(rotularCampos(["unidade_id"]), "Unidade");
});
caso("faixa 'Veio da solicitação' só diz o que o cliente informou: unidade (do servidor) e responsável comercial (sugerido) saem; o sugerido vai em lista própria", () => {
  const r = montarPrefillCliente({ cliente_nome: "X Ltda", cidade: "Campinas", unidade_id: "unid-1", tipo_servico: "recrutamento_selecao", dados_empresa: { tipo_pessoa: "pj", nome: "X Ltda", telefone: "(19) 99999-8888" } }, { responsavelComercial: "Lucas" });
  assert.ok(!r.preenchidos.includes("unidade_id") && !r.preenchidos.includes("responsavel_comercial"));
  assert.deepEqual(r.sugeridos, ["responsavel_comercial"]);
  assert.ok(r.preenchidos.includes("servicos") && r.preenchidos.includes("nome") && r.preenchidos.includes("cidade"));
  assert.equal(r.valores.unidade_id, "unid-1", "o valor continua no prefill (a unidade é a da solicitação)");
  assert.equal(r.valores.responsavel_comercial, "Lucas");
  assert.deepEqual(montarPrefillCliente({ cliente_nome: "X" }).sugeridos, [], "sem quem gerou o link, nada é sugerido");
});
caso("Esc nos modais de cadastro: o Esc de um <select> ou de elemento com popup aberto nunca fecha o modal; Esc no resto fecha; outras teclas não", () => {
  const el = (tagName: string, expandido = false) => ({ tagName, closest: (seletor: string) => (expandido && seletor === '[aria-expanded="true"]' ? {} : null) });
  assert.equal(escapeDeveFecharModal({ key: "Escape", alvo: el("INPUT") }), true);
  assert.equal(escapeDeveFecharModal({ key: "Escape", alvo: el("BUTTON") }), true);
  assert.equal(escapeDeveFecharModal({ key: "Escape", alvo: el("SELECT") }), false);
  assert.equal(escapeDeveFecharModal({ key: "Escape", alvo: el("select") }), false, "tagName em minúsculas");
  assert.equal(escapeDeveFecharModal({ key: "Escape", alvo: el("DIV", true) }), false, "popup aberto (aria-expanded)");
  assert.equal(escapeDeveFecharModal({ key: "Escape", alvo: null }), true);
  assert.equal(escapeDeveFecharModal({ key: "Enter", alvo: el("INPUT") }), false);
  assert.equal(escapeDeveFecharModal({ key: "Tab", alvo: el("SELECT") }), false);
});
const PERIGOSO = `<script>alert("x")</script> & 'Cia' <img src=x onerror=alert(1)>`;
const PERIGOSO_ESCAPADO = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Cia&#39; &lt;img src=x onerror=alert(1)&gt;";
const conta = (texto: string, trecho: string) => texto.split(trecho).length - 1;
function semHtmlCru(html: string, rotulo: string) {
  assert.ok(!html.includes("<script>") && !html.includes("<img src=x") && !html.includes('alert("x")'), `${rotulo}: nada injetado pode sair cru`);
}
caso("e-mail 'vaga aprovada ao cliente': nome, cargo e cidade do formulário público saem escapados", () => {
  const { html } = getEmailTemplate("vaga_aprovada_cliente", { nome: PERIGOSO, cargo: PERIGOSO, nomeCliente: PERIGOSO, numPosicoes: 2, cidade: PERIGOSO });
  semHtmlCru(html, "vaga_aprovada_cliente");
  assert.equal(conta(html, PERIGOSO_ESCAPADO), 3, "nome do cliente, cargo e cidade");
  const normal = getEmailTemplate("vaga_aprovada_cliente", { nome: "Maria", cargo: "Auxiliar", nomeCliente: "Indústria Exemplo Ltda", numPosicoes: 2, cidade: "Hortolândia" }).html;
  assert.ok(normal.includes("<strong>Indústria Exemplo Ltda</strong>") && normal.includes("<strong>Cargo:</strong> Auxiliar") && normal.includes("<strong>Localidade:</strong> Hortolândia"));
  assert.ok(getEmailTemplate("vaga_aprovada_cliente", { nome: "x", cargo: "Y" }).html.includes("A definir"), "sem cidade continua 'A definir'");
});
caso("e-mail 'solicitação recusada' (ao cliente): nome do cliente, cargo e motivo escapados", () => {
  const { html, subject } = getEmailTemplate("solicitacao_recusada", { nome: PERIGOSO, cargo: PERIGOSO, nomeCliente: PERIGOSO, motivoRecusa: PERIGOSO });
  semHtmlCru(html, "solicitacao_recusada");
  assert.ok(conta(html, PERIGOSO_ESCAPADO) >= 3, "nome do cliente, cargo e motivo");
  assert.ok(subject.includes("<script>"), "o assunto é texto puro (sem HTML escapado)");
});
caso("e-mail 'candidato agendado para entrevista' (ao cliente): cliente, empresa, candidato e cargo escapados", () => {
  const { html } = getEmailTemplate("candidato_entrevista_cliente", { nome: PERIGOSO, cargo: PERIGOSO, nomeCliente: PERIGOSO, nomeCandidato: PERIGOSO, empresa: PERIGOSO });
  semHtmlCru(html, "candidato_entrevista_cliente");
  assert.equal(conta(html, PERIGOSO_ESCAPADO), 4, "cliente, empresa, candidato e vaga");
});
caso("os demais e-mails que carregam nome/cargo/cidade/empresa de solicitação ou de cliente cadastrado a partir dela também escapam; HTML pronto e URLs não", () => {
  const dados = { nome: PERIGOSO, cargo: PERIGOSO, nomeCliente: PERIGOSO, nomeCandidato: PERIGOSO, cidade: PERIGOSO, estado: "SP", empresa: PERIGOSO, responsavel: PERIGOSO, salario: PERIGOSO, observacoes: PERIGOSO, requisitos: `${PERIGOSO} * outro`, beneficios: PERIGOSO, motivoRecusa: PERIGOSO, motivoTextoEncerramento: PERIGOSO, justificativaCancelamento: PERIGOSO, clienteCnpj: PERIGOSO, clienteEndereco: PERIGOSO, clienteTelefone: PERIGOSO, clienteEmail: PERIGOSO, feeRsPrazoCobranca: PERIGOSO, tipoServico: "recrutamento_selecao", feeRsPercentual: 45, taxaCancelamento: true, taxaCancelamentoPercentual: 25, feeValor: 1000, tipoCobrancaRS: "contratacao" as const, dataInicio: "2026-10-01", dataVencimento: "2026-11-01", diasAtraso: 3, diasParado: 2, acaoSolicitada: "pausar" as const, decisaoStatus: "aprovada" as const, statusEncerramento: "fechada" };
  const nomes = ["entrevista_salmazos", "entrevista_cliente", "aprovado_cliente", "reprovado", "solicitar_documentos", "vaga_aprovada_cliente", "solicitacao_recusada", "candidato_entrevista_cliente", "nova_vaga_criada", "vaga_encerrada", "admissao_link", "cobranca_rs_gerada", "cobranca_rs_atrasada", "cobranca_rs_aguardando_validacao", "cobranca_rs_paga", "cobranca_rs_cancelada", "cobranca_rs_validada_diretoria", "supervisao_cliente_atrasada", "alteracao_solicitacao_pedida", "alteracao_solicitacao_aprovada", "alteracao_solicitacao_recusada", "vaga_status_solicitado", "vaga_status_decidido"] as const;
  for (const nome of nomes) {
    const { html } = getEmailTemplate(nome, dados);
    semHtmlCru(html, nome);
    assert.ok(!html.includes("&amp;amp;"), `${nome}: sem escape duplo`);
  }
  // HTML já montado e URLs seguem como vieram
  const { html } = getEmailTemplate("alteracao_solicitacao_pedida", { ...dados, resumoAlteracoesHtml: "<table><tr><td>já escapado &amp; pronto</td></tr></table>", solicitacaoUrl: "https://x.test/a?b=1&c=2" });
  assert.ok(html.includes("<table><tr><td>já escapado &amp; pronto</td></tr></table>") && html.includes("https://x.test/a?b=1&c=2"));
});
caso("assunto e descrição: quebra de linha (\\r \\n) vinda do formulário nunca chega ao assunto", () => {
  const cargo = "Auxiliar\r\nBcc: alguem@externo.test\nX: y";
  const nomeCliente = "Empresa\r\nLtda";
  for (const nome of ["solicitacao_recusada", "nova_vaga_criada", "vaga_encerrada", "alteracao_solicitacao_pedida", "alteracao_solicitacao_aprovada", "alteracao_solicitacao_recusada", "vaga_status_solicitado", "vaga_status_decidido", "cobranca_rs_atrasada", "cobranca_rs_paga", "supervisao_cliente_atrasada"] as const) {
    const t = getEmailTemplate(nome, { nome: "x", cargo, nomeCliente, acaoSolicitada: "pausar", decisaoStatus: "aprovada" });
    assert.ok(!/[\r\n]/.test(t.subject), `${nome}: assunto sem quebra de linha`);
    assert.ok(!/[\r\n]/.test(t.descricao), `${nome}: descrição sem quebra de linha`);
  }
  assert.equal(getEmailTemplate("solicitacao_recusada", { nome: "x", cargo, nomeCliente }).subject, "Atualização sobre sua solicitação de vaga — Auxiliar Bcc: alguem@externo.test X: y");
});
// ── Equivalência do escape global: a implementação nova contra a anterior (cópia congelada do commit base) ─────────────────────────────────────
const TODOS_OS_TEMPLATES = ["entrevista_salmazos", "entrevista_cliente", "aprovado_cliente", "reprovado", "solicitar_documentos", "vaga_aprovada_cliente", "solicitacao_recusada", "candidato_entrevista_cliente", "nova_vaga_criada", "vaga_encerrada", "admissao_link", "cobranca_rs_gerada", "cobranca_rs_atrasada", "cobranca_rs_aguardando_validacao", "cobranca_rs_paga", "cobranca_rs_cancelada", "cobranca_rs_validada_diretoria", "supervisao_cliente_atrasada", "alteracao_solicitacao_pedida", "alteracao_solicitacao_aprovada", "alteracao_solicitacao_recusada", "vaga_status_solicitado", "vaga_status_decidido"] as const;
// Única mudança INTENCIONAL de texto desde a cópia congelada (Fase 3, cobrança R&S): nos e-mails de cobrança (gerada, atrasada, aguardando validação, paga e
// cancelada) o rótulo "Empresa:" virou "Cliente:" (serve para pessoa física). A equivalência compara o resto byte a byte, desfazendo só essa troca.
const TEMPLATES_DE_COBRANCA_COM_ROTULO_CLIENTE = ["cobranca_rs_gerada", "cobranca_rs_atrasada", "cobranca_rs_aguardando_validacao", "cobranca_rs_paga", "cobranca_rs_cancelada"];
const comoAntes = (nome: string, html: string) =>
  TEMPLATES_DE_COBRANCA_COM_ROTULO_CLIENTE.includes(nome) ? html.split("<strong>Cliente:</strong>").join("<strong>Empresa:</strong>") : html;
const desescapar = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
// Campos de texto livre (a lista do wrapper) mais os que NÃO são: HTML pronto e URLs.
const CAMPOS_TEXTO = ["nome", "cargo", "nomeCliente", "nomeCandidato", "cidade", "empresa", "estado", "responsavel", "salario", "horario", "requisitos", "beneficios", "observacoes", "motivoRecusa", "clienteCnpj", "clienteEndereco", "clienteTelefone", "clienteEmail", "justificativaCancelamento", "motivoTextoEncerramento", "feeRsPrazoCobranca"];
const RESUMO_HTML = '<table><tr><td style="x">Campo &amp; "valor" <b>ok</b></td></tr></table>';
function dadosCom(textoPorCampo: (campo: string) => string, url: string) {
  const texto = Object.fromEntries(CAMPOS_TEXTO.map((c) => [c, textoPorCampo(c)]));
  return {
    ...texto,
    numPosicoes: 3, tipoServico: "recrutamento_selecao", tipoServicoLabel: "Recrutamento e Seleção", feeRsPercentual: 45, taxaCancelamento: true, taxaCancelamentoPercentual: 25,
    feeValor: 1234.5, tipoCobrancaRS: "contratacao" as const, dataInicio: "01/10/2026", dataVencimento: "01/11/2026", dataPagamento: "2026-10-20", diasAtraso: 3, diasParado: 2,
    diasSemSupervisao: 40, frequenciaDiasSupervisao: 30, acaoSolicitada: "pausar" as const, decisaoStatus: "aprovada" as const, statusEncerramento: "fechada", confidencial: true,
    motivoTipoEncerramentoLabel: "Contratou por conta própria",
    resumoAlteracoesHtml: RESUMO_HTML, vagaUrl: url, admissaoUrl: url, cobrancaUrl: url, supervisaoUrl: url, solicitacaoUrl: url,
  } as Parameters<typeof getEmailTemplate>[1];
}
caso("equivalência (dados normais: acentos, números, quebras de linha em campos de corpo): os 23 templates saem IDÊNTICOS byte a byte à implementação anterior", () => {
  const acentuado: Record<string, string> = {
    nome: "João da Conceição", cargo: "Auxiliar Administrativo (Contábil)", nomeCliente: "Indústria Exemplo Ltda", nomeCandidato: "José Antônio Pêra", cidade: "São José dos Pinhais",
    empresa: "Comércio Ação", estado: "PR", responsavel: "Lucas", salario: "R$ 2.500,00", horario: "08h às 17h (seg. a sex.)",
    requisitos: "Ensino médio completo * CNH B\n* Experiência de 1 ano", beneficios: "VR * VT\nPlano de saúde", observacoes: "Linha 1\nLinha 2\r\nLinha 3",
    motivoRecusa: "Sem perfil\ncompatível no momento", clienteCnpj: "11.222.333/0001-81", clienteEndereco: "Rua Açaí, 10 — Centro", clienteTelefone: "(19) 99999-8888",
    clienteEmail: "financeiro@exemplo.com.br", justificativaCancelamento: "Cliente desistiu\nda vaga", motivoTextoEncerramento: "Contratou por conta própria\nsem avisar", feeRsPrazoCobranca: "14 dias",
  };
  const dados = dadosCom((c) => acentuado[c], "https://x.test/painel?abrir=123");
  for (const nome of TODOS_OS_TEMPLATES) {
    const novo = getEmailTemplate(nome, dados);
    const antes = getEmailTemplateAntes(nome, dados);
    assert.strictEqual(comoAntes(nome, novo.html), antes.html, `${nome}: html`);
    assert.strictEqual(novo.subject, antes.subject, `${nome}: assunto`);
    assert.strictEqual(novo.descricao, antes.descricao, `${nome}: descrição`);
  }
});
caso("equivalência (campos ausentes ou vazios, como os chamadores reais passam): idêntico byte a byte", () => {
  const minimo = { nome: "", cargo: "", acaoSolicitada: "reabrir" as const, decisaoStatus: "recusada" as const };
  for (const nome of TODOS_OS_TEMPLATES) {
    for (const dados of [minimo, { nome: "Maria", cargo: "Auxiliar" }]) {
      const novo = getEmailTemplate(nome, dados);
      const antes = getEmailTemplateAntes(nome, dados);
      assert.deepEqual({ ...novo, html: comoAntes(nome, novo.html) }, antes, nome);
    }
  }
});
caso("equivalência com <, >, \", ' e &: a única diferença é a troca pela entidade (nos campos de texto); assunto e descrição seguem iguais; HTML pronto e URLs intactos", () => {
  const url = "https://x.test/painel?abrir=1&b=2";
  const dados = dadosCom((c) => `Ação ${c} <b>"x"</b> & 'y'`, url);
  for (const nome of TODOS_OS_TEMPLATES) {
    const novo = getEmailTemplate(nome, dados);
    const antes = getEmailTemplateAntes(nome, dados);
    assert.strictEqual(desescapar(comoAntes(nome, novo.html)), desescapar(antes.html), `${nome}: fora das entidades o html é o mesmo`);
    assert.strictEqual(novo.subject, antes.subject, `${nome}: assunto igual`);
    assert.strictEqual(novo.descricao, antes.descricao, `${nome}: descrição igual`);
    assert.ok(!novo.html.includes('<b>"x"</b>'), `${nome}: nenhuma tag do dado sai crua`);
    // o que não é texto livre passa como veio nos dois
    assert.strictEqual(novo.html.includes(RESUMO_HTML), antes.html.includes(RESUMO_HTML), `${nome}: resumoAlteracoesHtml`);
    assert.strictEqual(novo.html.includes(url), antes.html.includes(url), `${nome}: URL`);
  }
  assert.ok(getEmailTemplate("alteracao_solicitacao_pedida", dados).html.includes(RESUMO_HTML), "o HTML pronto aparece inteiro");
  assert.ok(getEmailTemplate("alteracao_solicitacao_pedida", dados).html.includes(url), "a URL aparece inteira");
});
caso("equivalência só com '&' (nome de empresa comum): a diferença é só & → &amp; no dado", () => {
  const dados = dadosCom(() => "Silva & Filhos Ltda", "https://x.test/a?b=1");
  for (const nome of TODOS_OS_TEMPLATES) {
    const novo = getEmailTemplate(nome, dados);
    const antes = getEmailTemplateAntes(nome, dados);
    assert.strictEqual(desescapar(comoAntes(nome, novo.html)), desescapar(antes.html), nome);
    assert.strictEqual(novo.subject, antes.subject, `${nome}: assunto`);
  }
  assert.ok(getEmailTemplate("vaga_aprovada_cliente", dados).html.includes("Silva &amp; Filhos Ltda"));
});
caso("equivalência com quebra de linha nos campos do assunto: o html é idêntico; o assunto e a descrição só trocam a quebra por espaço", () => {
  const dados = dadosCom((c) => (["cargo", "nomeCliente", "nomeCandidato", "empresa", "responsavel"].includes(c) ? `Parte um\r\nparte dois ${c}` : `texto ${c}`), "https://x.test/a");
  const semQuebra = (t: string) => t.replace(/[\r\n\u2028\u2029]+/g, " ");
  for (const nome of TODOS_OS_TEMPLATES) {
    const novo = getEmailTemplate(nome, dados);
    const antes = getEmailTemplateAntes(nome, dados);
    assert.strictEqual(comoAntes(nome, novo.html), antes.html, `${nome}: html`);
    assert.strictEqual(novo.subject, semQuebra(antes.subject), `${nome}: assunto`);
    assert.strictEqual(novo.descricao, semQuebra(antes.descricao), `${nome}: descrição`);
  }
});
// ── Faixa "Cliente X vinculado": o texto "a vaga ainda não foi criada" some quando a solicitação é decidida ──
const faixaSemVaga = (extra: Partial<AvisoDoCliente> = {}): AvisoDoCliente => ({
  tipo: "ok", titulo: 'Cliente "Acme" vinculado à solicitação.', solicitacaoId: "sol-1", vagaPendente: true,
  linhas: [explicarSituacaoDaVaga("sem_vaga"), "Campos completados no cadastro: Endereço."], ...extra,
});
caso("faixa do cliente: criar a vaga troca a linha 'ainda não foi criada' pelo que aconteceu e mantém as outras linhas e o título", () => {
  const depois = avisoAposDecisaoDaSolicitacao(faixaSemVaga(), "sol-1", "vaga_criada")!;
  assert.deepEqual(depois.linhas, [TEXTO_VAGA_CRIADA_COM_O_CLIENTE, "Campos completados no cadastro: Endereço."]);
  assert.equal(depois.titulo, 'Cliente "Acme" vinculado à solicitação.');
  assert.equal(depois.vagaPendente, false);
  assert.ok(!depois.linhas.join(" ").includes("ainda não foi criada") && !depois.linhas.join(" ").includes("Ao aprovar"));
});
caso("faixa do cliente: recusar a solicitação também tira o 'ao aprovar' e diz que nenhuma vaga será criada", () => {
  const depois = avisoAposDecisaoDaSolicitacao(faixaSemVaga(), "sol-1", "recusada")!;
  assert.equal(depois.linhas[0], TEXTO_SOLICITACAO_RECUSADA_SEM_VAGA);
  assert.ok(!depois.linhas.join(" ").includes("Ao aprovar"));
});
caso("faixa do cliente: de outra solicitação, sem a marca de vaga pendente, ou nula, fica exatamente como está (mesma referência)", () => {
  const outra = faixaSemVaga();
  assert.strictEqual(avisoAposDecisaoDaSolicitacao(outra, "sol-2", "vaga_criada"), outra);
  const jaComVaga = faixaSemVaga({ vagaPendente: false, linhas: [explicarSituacaoDaVaga("vinculada")] });
  assert.strictEqual(avisoAposDecisaoDaSolicitacao(jaComVaga, "sol-1", "vaga_criada"), jaComVaga);
  const semMarca = faixaSemVaga({ vagaPendente: undefined, solicitacaoId: undefined });
  assert.strictEqual(avisoAposDecisaoDaSolicitacao(semMarca, "sol-1", "recusada"), semMarca);
  assert.equal(avisoAposDecisaoDaSolicitacao(null, "sol-1", "vaga_criada"), null);
});
caso("faixa do cliente: decidir duas vezes não troca de novo; a linha da vaga alterada (vaga_nao_alterada) não é tocada", () => {
  const uma = avisoAposDecisaoDaSolicitacao(faixaSemVaga(), "sol-1", "vaga_criada")!;
  assert.strictEqual(avisoAposDecisaoDaSolicitacao(uma, "sol-1", "recusada"), uma);
  const naoAlterada = faixaSemVaga({ vagaPendente: false, linhas: [explicarSituacaoDaVaga("vaga_nao_alterada")] });
  assert.strictEqual(avisoAposDecisaoDaSolicitacao(naoAlterada, "sol-1", "vaga_criada"), naoAlterada);
});
caso("modal: a faixa guarda a solicitação e se a vaga está pendente; criar vaga e recusar atualizam a faixa; fechar o modal a limpa", () => {
  const fonte = fs.readFileSync(new URL("../src/components/ModalSolicitacoesVagas.tsx", import.meta.url), "utf8");
  assert.ok(fonte.includes('vagaPendente: vaga === "sem_vaga"') && fonte.includes("solicitacaoId,"));
  assert.ok(fonte.includes('mostrarResultadoCliente(s.id, r.clienteNome, r.vaga)') && fonte.includes("mostrarResultadoCliente(solicitacaoId, r.clienteNome, r.vaga"));
  assert.ok(fonte.includes('avisoAposDecisaoDaSolicitacao(a, id, "vaga_criada")') && fonte.includes('avisoAposDecisaoDaSolicitacao(a, id, "recusada")'));
  assert.ok(/if \(!isOpen\) \{\s+setAba\("pendentes"\);[\s\S]*?setAvisoCliente\(null\);/.test(fonte));
});
// ── Duplicidade de OUTRA unidade: a resposta 409 só carrega o documento como motivo ──
const U_OUTRA = "00000000-0000-4000-8000-0000000000aa";
const U_MINHA = "00000000-0000-4000-8000-0000000000bb";
const avaliarComo = (candidato: Record<string, string>, existente: Record<string, unknown>, unidadesPermitidas: string[] | "todas" = [U_MINHA]) =>
  avaliarDuplicidade(candidato, [{ id: idCli(7), nome: "Segredo S.A.", cidade: "Monte Mor", ativo: true, ...existente } as never], { papelFull: false, unidadesPermitidas })!;
await casoRota("resposta de duplicidade de outra unidade: motivos só com o documento (cnpj ou cpf); telefone, e-mail, nome e endereço do outro cadastro não aparecem", async () => {
  const todos = { cnpj: CNPJ, contato_telefone: "(19) 93333-4444", contato_email: "secreto@concorrente.com", endereco: "Rua Secreta, 1", unidade_id: U_OUTRA };
  const candidato = { nome: "Segredo S.A.", cnpj: CNPJ, contato_telefone: "(19) 93333-4444", contato_email: "secreto@concorrente.com", endereco: "Rua Secreta, 1" };
  const r = avaliarComo(candidato, todos);
  assert.equal(r.outraUnidade, true);
  assert.ok(r.motivos.includes("telefone") && r.motivos.includes("email") && r.motivos.includes("nome"), "o resultado interno continua completo (a auditoria usa)");
  const corpo = await respostaDuplicidade(r).json();
  assert.deepEqual(corpo.duplicidade.motivos, ["cnpj"]);
  assert.equal(corpo.duplicidade.bloqueio, "cnpj");
  assert.equal(corpo.duplicidade.existente, null);
  const texto = JSON.stringify(corpo);
  for (const proibido of ["telefone", "email", "nome", "endereco", "Segredo", "Monte Mor", "3333", "secreto@", "Rua Secreta", idCli(7)]) assert.ok(!texto.includes(proibido), `não pode conter "${proibido}"`);
  const cpf = await respostaDuplicidade(avaliarComo({ nome: "X Y", cpf: CPF, contato_telefone: "(19) 93333-4444" }, { cpf: CPF, contato_telefone: "(19) 93333-4444", unidade_id: U_OUTRA })).json();
  assert.deepEqual(cpf.duplicidade.motivos, ["cpf"]);
});
await casoRota("resposta de duplicidade de outra unidade SEM documento (telefone+e-mail ou só nome): nenhum motivo e o bloqueio por contato não é revelado; continua bloqueando/avisando", async () => {
  const contato = await respostaDuplicidade(avaliarComo({ nome: "Outro Nome", contato_telefone: "(19) 93333-4444", contato_email: "a@b.com" }, { contato_telefone: "(19) 93333-4444", contato_email: "a@b.com", unidade_id: U_OUTRA })).json();
  assert.deepEqual([contato.duplicidade.nivel, contato.duplicidade.bloqueio, contato.duplicidade.motivos, contato.duplicidade.outraUnidade], ["bloqueio", null, [], true]);
  assert.match(contato.error, /outra unidade/);
  const nome = await respostaDuplicidade(avaliarComo({ nome: "Segredo S.A." }, { unidade_id: U_OUTRA })).json();
  assert.deepEqual([nome.duplicidade.nivel, nome.duplicidade.bloqueio, nome.duplicidade.motivos], ["aviso", null, []]);
});
await casoRota("resposta de duplicidade da MESMA unidade (ou de quem vê todas): motivos e bloqueio completos, como antes", async () => {
  const todos = { cnpj: CNPJ, contato_telefone: "(19) 93333-4444", contato_email: "a@b.com", unidade_id: U_MINHA };
  const candidato = { nome: "Segredo S.A.", cnpj: CNPJ, contato_telefone: "(19) 93333-4444", contato_email: "a@b.com" };
  const propria = await respostaDuplicidade(avaliarComo(candidato, todos)).json();
  assert.deepEqual(propria.duplicidade.motivos, ["cnpj", "telefone", "email", "nome"]);
  assert.equal(propria.duplicidade.outraUnidade, false);
  const contatoProprio = await respostaDuplicidade(avaliarComo({ nome: "Outro", contato_telefone: "(19) 93333-4444", contato_email: "a@b.com" }, todos)).json();
  assert.deepEqual([contatoProprio.duplicidade.bloqueio, contatoProprio.duplicidade.motivos], ["contato", ["telefone", "email"]]);
  const sociaTodas = await respostaDuplicidade(avaliarComo(candidato, { ...todos, unidade_id: U_OUTRA }, "todas")).json();
  assert.equal(sociaTodas.duplicidade.outraUnidade, false);
  assert.deepEqual(sociaTodas.duplicidade.motivos, ["cnpj", "telefone", "email", "nome"]);
});
caso("23505: o índice único de CPF dá a mensagem de CPF e o de CNPJ a de CNPJ (os dois únicos índices de documento do banco; a chave primária não se repete)", () => {
  assert.match(mensagemUnicidadeDocumento({ message: 'duplicate key value violates unique constraint "clientes_cpf_ativo_unico"' }), /CPF/);
  assert.match(mensagemUnicidadeDocumento({ message: 'duplicate key value violates unique constraint "clientes_cnpj_ativo_unico"' }), /CNPJ/);
});

// ── "Reativar e vincular": falha no vínculo com o cadastro já reativado ──
caso("mensagem quando o cliente foi reativado mas o vínculo falhou: diz o nome, que foi reativado, que o vínculo não foi concluído, o motivo e que dá para tentar de novo", () => {
  const m = mensagemVinculoAposReativacao("Acme Ltda", "Erro ao gravar o vínculo");
  assert.equal(m, 'O cliente "Acme Ltda" foi reativado, mas o vínculo com a solicitação não foi concluído. Erro ao gravar o vínculo. Tente vincular de novo.');
  assert.equal(mensagemVinculoAposReativacao("Acme", "Houve um erro de conexão."), 'O cliente "Acme" foi reativado, mas o vínculo com a solicitação não foi concluído. Houve um erro de conexão. Tente vincular de novo.');
  assert.equal(mensagemVinculoAposReativacao("Acme", null), 'O cliente "Acme" foi reativado, mas o vínculo com a solicitação não foi concluído. Tente vincular de novo.');
  assert.equal(mensagemVinculoAposReativacao("Acme", "   "), mensagemVinculoAposReativacao("Acme"));
  const jaDecidida = mensagemVinculoAposReativacao("Acme", "A solicitação já foi vinculada ou decidida. Recarregue a lista.", { tentarDeNovo: false });
  assert.ok(jaDecidida.includes("foi reativado") && jaDecidida.endsWith("Recarregue a lista.") && !jaDecidida.includes("Tente vincular de novo"));
});
caso("modal de vínculo: só avisa da reativação quando ESTA chamada reativou; cobre erro do servidor, solicitação já decidida e queda de conexão", () => {
  const f = fs.readFileSync(new URL("../src/components/ModalVincularClienteSolicitacao.tsx", import.meta.url), "utf8");
  assert.ok(f.includes("let reativouAgora = false;") && f.includes("reativouAgora = true;"));
  assert.ok(f.indexOf("reativouAgora = true;") > f.indexOf("if (!rr.ok)"), "só depois de a reativação dar certo");
  assert.ok(f.indexOf("reativouAgora = true;") < f.indexOf("/vincular-cliente"), "antes do vínculo");
  assert.ok(f.includes("onJaVinculada(reativouAgora ? mensagemVinculoAposReativacao(escolhido.nome, json.error, { tentarDeNovo: false }) : json.error)"));
  assert.ok(f.includes("setErro(reativouAgora ? mensagemVinculoAposReativacao(escolhido.nome, motivo) : motivo ?? \"Não foi possível vincular.\")"));
  assert.ok(f.includes("mensagemVinculoAposReativacao(escolhido.nome, \"Houve um erro de conexão.\") : \"Erro de conexão. Tente novamente.\""));
  assert.ok(f.includes("setClientes((prev) => prev.map((c) => (c.id === escolhido.id ? { ...c, ativo: true } : c)));"), "o cadastro fica ativo na lista: tentar de novo vincula direto");
});
console.error = silencio;

console.log(`\n${total} casos OK`);
