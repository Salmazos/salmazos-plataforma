// Verificação de Propostas (o projeto não tem runner de testes). Sem banco real: tudo roda em memória.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas.mts
import assert from "node:assert/strict";
import {
  SITUACOES, TRANSICOES, podeTransicionar, ehFinal, modoEdicao, modeloDisponivel, somarDiasUteis, calcularValidadeAte,
  diasRestantes, deveVencer, formatarNumeroProposta, numeroComRevisao, etapaAposSituacao, textoFollowUp,
  SITUACOES_ESCOLHIDAS_PELO_VENDEDOR, type SituacaoProposta,
} from "@/lib/propostas";
import {
  condicoesRsSchema, conteudoRsSchema, PADROES_RS, validarConteudo, itensRs, montarSnapshot, snapshotPropostaSchema,
  MENSAGEM_MODELO_INDISPONIVEL,
} from "@/lib/propostaModelos";

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
  });
  assert.ok(snapshotPropostaSchema.safeParse(JSON.parse(JSON.stringify(s))).success);
});

console.log(`\n${total} casos OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
