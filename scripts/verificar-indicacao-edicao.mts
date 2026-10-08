// Verificação das regras puras da edição de indicação pelo cliente (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-indicacao-edicao.mts
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  calcularDiff, escaparHtml, formatarValorAviso, mascararTelefone, montarHtmlEdicao, montarLinhasAviso, notasDePropagacao,
  nomeArquivoCurriculoValido, planejarPropagacaoCandidato, podeEditarIndicacao, temAdmissaoAtiva, textoSino, truncarTexto, validarDataInicio, validarVagaNova,
  type AdmissaoResumo, type VagaResumo,
} from "../src/lib/indicacaoEdicao.ts";

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log(`OK ${nome}`); };

const VAGA = "v-1";
const adm = (vaga_id: string | null, status: string): AdmissaoResumo => ({ vaga_id, status });

// ── 1) pode_editar ──
ok("pendente é editável", () => assert.equal(podeEditarIndicacao({ status: "pendente", vagaId: VAGA, etapa: null, admissoes: [] }).pode, true));
ok("aprovada sem admissão, etapa aprovado_cliente: editável", () => assert.equal(podeEditarIndicacao({ status: "aprovada", vagaId: VAGA, etapa: "aprovado_cliente", admissoes: [] }).pode, true));
ok("aprovada com admissão ativa: NÃO", () => {
  const r = podeEditarIndicacao({ status: "aprovada", vagaId: VAGA, etapa: "aprovado_cliente", admissoes: [adm(VAGA, "em_preenchimento")] });
  assert.deepEqual(r, { pode: false, motivo: "admissao" });
});
ok("admissão CANCELADA libera a edição", () => assert.equal(podeEditarIndicacao({ status: "aprovada", vagaId: VAGA, etapa: "aprovado_cliente", admissoes: [adm(VAGA, "cancelada")] }).pode, true));
ok("admissão sem vaga (FK SET NULL) do mesmo candidato bloqueia", () => assert.equal(temAdmissaoAtiva([adm(null, "aprovado")], VAGA), true));
ok("admissão de OUTRA vaga do mesmo candidato não bloqueia", () => assert.equal(temAdmissaoAtiva([adm("v-2", "aprovado")], VAGA), false));
ok("etapa contratado (Finalizar já rodou): NÃO", () => assert.deepEqual(podeEditarIndicacao({ status: "aprovada", vagaId: VAGA, etapa: "contratado", admissoes: [] }), { pode: false, motivo: "finalizada" }));
ok("aprovada sem candidatura encontrada: NÃO (falha fechado)", () => assert.equal(podeEditarIndicacao({ status: "aprovada", vagaId: VAGA, etapa: null, admissoes: [] }).pode, false));
ok("recusada: NÃO", () => assert.equal(podeEditarIndicacao({ status: "recusada", vagaId: VAGA, etapa: null, admissoes: [] }).pode, false));

// ── 2) troca de vaga ──
const atual: VagaResumo = { id: VAGA, cliente_id: "C1", status: "aberta", tipo_servico: "mao_obra_temporaria", unidade_id: "U1" };
const nova = (extra: Partial<VagaResumo> = {}): VagaResumo => ({ id: "v-2", cliente_id: "C1", status: "aberta", tipo_servico: "mao_obra_temporaria", unidade_id: "U1", ...extra });
ok("vaga nova válida", () => assert.equal(validarVagaNova(atual, nova(), "C1", false), null));
ok("vaga de outro cliente rejeitada", () => assert.equal(validarVagaNova(atual, nova({ cliente_id: "C2" }), "C1", false), "Vaga não encontrada."));
ok("vaga inexistente rejeitada", () => assert.equal(validarVagaNova(atual, null, "C1", false), "Vaga não encontrada."));
ok("vaga fechada rejeitada", () => assert.match(validarVagaNova(atual, nova({ status: "fechada" }), "C1", false) ?? "", /não está mais aberta/));
ok("vaga de outro tipo de serviço rejeitada", () => assert.match(validarVagaNova(atual, nova({ tipo_servico: "recrutamento_selecao" }), "C1", false) ?? "", /mesmo tipo/));
ok("vaga de outra unidade rejeitada", () => assert.match(validarVagaNova(atual, nova({ unidade_id: "U2" }), "C1", false) ?? "", /mesma unidade/));
ok("candidato já na vaga rejeitado", () => assert.match(validarVagaNova(atual, nova(), "C1", true) ?? "", /já está indicado/));

// ── 3) data de início ──
ok("data de hoje é aceita", () => assert.equal(validarDataInicio("2026-10-07", "2026-10-07"), null));
ok("data futura aceita", () => assert.equal(validarDataInicio("2026-12-01", "2026-10-07"), null));
ok("data passada rejeitada (caso Novacki 2008-09-15)", () => assert.match(validarDataInicio("2008-09-15", "2026-10-07") ?? "", /anterior a hoje/));
ok("ontem rejeitado", () => assert.match(validarDataInicio("2026-10-06", "2026-10-07") ?? "", /anterior a hoje/));
ok("formato inválido rejeitado", () => { for (const d of ["15/09/2026", "2026-9-7", "amanhã", "2026-10-07T00:00:00"]) assert.match(validarDataInicio(d, "2026-10-07") ?? "", /formato/); });
ok("data inexistente rejeitada (31/02)", () => assert.match(validarDataInicio("2026-02-31", "2026-01-01") ?? "", /não existe/));
ok("29/02 só em ano bissexto", () => { assert.equal(validarDataInicio("2028-02-29", "2026-01-01"), null); assert.match(validarDataInicio("2027-02-29", "2026-01-01") ?? "", /não existe/); });

// ── 4) diff: só o que mudou; data antiga inalterada não entra (e portanto não é validada) ──
const sol = {
  vaga_id: VAGA, candidato_nome: "Maria Souza", candidato_telefone: "(19) 98765-4321", curriculo_url: "a.pdf",
  admissao_data_inicio: "2008-09-15", admissao_salario: 1500, admissao_salario_hora: null, admissao_funcao: "Operador", admissao_vt: true, admissao_observacoes: null,
};
ok("nada enviado = sem alteração", () => assert.deepEqual(calcularDiff(sol, {}), []));
ok("mesmos valores = sem alteração (no-op)", () => assert.deepEqual(calcularDiff(sol, { candidato_nome: "Maria Souza", admissao_salario: 1500, admissao_vt: true, admissao_observacoes: "" }), []));
ok("espaços e '' equivalem ao valor guardado", () => assert.deepEqual(calcularDiff(sol, { candidato_nome: "  Maria Souza  ", admissao_salario: "1500", admissao_salario_hora: "" }), []));
ok("data antiga inalterada não aparece no diff — outro campo muda sozinho", () => {
  const d = calcularDiff(sol, { admissao_data_inicio: "2008-09-15", admissao_funcao: "Auxiliar" });
  assert.deepEqual(d.map((x) => x.campo), ["admissao_funcao"]);
});
ok("diff devolve antes/depois e só campos editáveis", () => {
  const d = calcularDiff(sol, { admissao_funcao: "Auxiliar", admissao_salario: 1600, admissao_vt: false, cliente_id: "X", status: "aprovada" });
  assert.deepEqual(d, [
    { campo: "admissao_salario", antes: 1500, depois: 1600 },
    { campo: "admissao_funcao", antes: "Operador", depois: "Auxiliar" },
    { campo: "admissao_vt", antes: true, depois: false },
  ]);
});
ok("limpar um campo vira null", () => assert.deepEqual(calcularDiff(sol, { admissao_funcao: "" }), [{ campo: "admissao_funcao", antes: "Operador", depois: null }]));
ok("boolean false é valor (não 'vazio')", () => assert.deepEqual(calcularDiff({ admissao_vt: null }, { admissao_vt: false }), [{ campo: "admissao_vt", antes: null, depois: false }]));

// ── 5) propagação ao cadastro do candidato ──
const cand = (extra = {}) => ({ origem: "indicacao_direta_cliente", nome_completo: "Maria Souza", telefone: "(19) 98765-4321", curriculo_url: "a.pdf", ...extra });
const altNome = [{ campo: "candidato_nome" as const, antes: "Maria Souza", depois: "Maria S. Souza" }];
ok("propaga quando candidato criado pela indicação e valor igual ao anterior", () => {
  const p = planejarPropagacaoCandidato(cand(), false, altNome);
  assert.deepEqual(p.propagar, [{ campo: "candidato_nome", coluna: "nome_completo", anterior: "Maria Souza", novo: "Maria S. Souza" }]);
  assert.deepEqual(p.naoPropagados, []);
});
ok("NÃO propaga quando a Salmazos já ajustou o nome", () => {
  const p = planejarPropagacaoCandidato(cand({ nome_completo: "Maria Souza da Silva" }), false, altNome);
  assert.deepEqual(p.propagar, []);
  assert.deepEqual(p.naoPropagados, [{ campo: "candidato_nome", motivo: "ajustado_pela_salmazos" }]);
});
ok("NÃO propaga para candidato existente (outra origem)", () => {
  const p = planejarPropagacaoCandidato(cand({ origem: "cadastro_rapido" }), false, altNome);
  assert.deepEqual(p.naoPropagados, [{ campo: "candidato_nome", motivo: "candidato_existente" }]);
});
ok("NÃO propaga se outra indicação aponta para o mesmo candidato (reaproveitado)", () => {
  const p = planejarPropagacaoCandidato(cand(), true, altNome);
  assert.deepEqual(p.naoPropagados, [{ campo: "candidato_nome", motivo: "candidato_existente" }]);
});
ok("candidato não encontrado = não propaga", () => assert.deepEqual(planejarPropagacaoCandidato(null, false, altNome).naoPropagados, [{ campo: "candidato_nome", motivo: "candidato_nao_encontrado" }]));
ok("currículo: valor anterior null == null propaga", () => {
  const p = planejarPropagacaoCandidato(cand({ curriculo_url: null }), false, [{ campo: "curriculo_url", antes: null, depois: "b.pdf" }]);
  assert.equal(p.propagar.length, 1);
});
ok("campo de admissão não vai para candidatos", () => assert.deepEqual(planejarPropagacaoCandidato(cand(), false, [{ campo: "admissao_funcao", antes: "A", depois: "B" }]), { propagar: [], naoPropagados: [] }));
ok("notas do aviso dizem o que não foi propagado", () => {
  const notas = notasDePropagacao({ naoPropagados: [{ campo: "candidato_nome", motivo: "ajustado_pela_salmazos" }], falhas: [], candidaturaFalhou: false, candidaturaBloqueada: false });
  assert.deepEqual(notas, ["Nome do candidato: não propagado ao cadastro do candidato (já ajustado pela Salmazos)."]);
});

// ── 6) máscaras e textos do aviso ──
ok("telefone mascarado (11 dígitos)", () => assert.equal(mascararTelefone("(19) 98765-1234"), "(19) *****-1234"));
ok("telefone mascarado (10 dígitos)", () => assert.equal(mascararTelefone("1932451234"), "(19) ****-1234"));
ok("telefone curto/vazio", () => { assert.equal(mascararTelefone("12345"), "*2345"); assert.equal(mascararTelefone(""), "(vazio)"); assert.equal(mascararTelefone(null), "(vazio)"); });
ok("observações truncadas em 120", () => { const t = truncarTexto("x".repeat(300)); assert.equal(t.length, 121); assert.ok(t.endsWith("…")); assert.equal(truncarTexto("curto"), "curto"); });
ok("valores do aviso: salário com valor, data BR, sim/não, currículo sem caminho", () => {
  assert.match(formatarValorAviso("admissao_salario", 1500, "depois"), /^R\$\s?1\.500,00\/mês$/);
  assert.match(formatarValorAviso("admissao_salario_hora", 12.5, "depois"), /^R\$\s?12,50\/hora$/);
  assert.equal(formatarValorAviso("admissao_data_inicio", "2026-12-01", "depois"), "01/12/2026");
  assert.equal(formatarValorAviso("admissao_vt", false, "depois"), "Não");
  assert.equal(formatarValorAviso("curriculo_url", "segredo/arquivo.pdf", "depois"), "novo arquivo anexado");
  assert.equal(formatarValorAviso("curriculo_url", "segredo/arquivo.pdf", "antes"), "arquivo anexado anteriormente");
  assert.equal(formatarValorAviso("curriculo_url", null, "depois"), "(removido)");
  assert.equal(formatarValorAviso("curriculo_url", "", "depois"), "(removido)");
  assert.equal(formatarValorAviso("curriculo_url", null, "antes"), "(sem arquivo)");
  assert.equal(formatarValorAviso("admissao_funcao", null, "antes"), "(vazio)");
  assert.equal(formatarValorAviso("candidato_telefone", "(19) 98765-4321", "antes"), "(19) *****-4321");
});
ok("linhas do aviso: vaga 'título antigo → novo' e nunca o id", () => {
  const l = montarLinhasAviso([{ campo: "vaga_id", antes: "v-1", depois: "v-2" }, { campo: "candidato_telefone", antes: "(19) 98765-4321", depois: "(19) 91111-2222" }], { antes: "Operador A", depois: "Operador B" });
  assert.deepEqual(l, [
    { campo: "Vaga", antes: "Operador A", depois: "Operador B" },
    { campo: "Telefone do candidato", antes: "(19) *****-4321", depois: "(19) *****-2222" },
  ]);
  assert.ok(!JSON.stringify(l).includes("v-1"));
});
ok("texto do sino traz só nomes de campos", () => {
  const t = textoSino("Cliente Um", "Maria", [{ campo: "Salário", antes: "R$ 1,00", depois: "R$ 2,00" }, { campo: "Função", antes: "a", depois: "b" }]);
  assert.equal(t, "Cliente Um alterou a indicação de Maria: Salário, Função");
  assert.ok(!t.includes("R$"));
});
ok("e-mail: tabela Campo/Antes/Depois, HTML escapado, sem o telefone real", () => {
  const linhas = montarLinhasAviso([{ campo: "candidato_telefone", antes: "(19) 98765-4321", depois: "(19) 91111-2222" }, { campo: "admissao_observacoes", antes: null, depois: "<script>x</script>" }]);
  const html = montarHtmlEdicao({ clienteNome: "A&B", candidatoNome: "Maria <b>", vagaTitulo: "Op", linhas, notas: ["nota"], link: "https://x/y" });
  assert.ok(html.includes("Campo") && html.includes("Antes") && html.includes("Depois"));
  assert.ok(html.includes("A&amp;B") && html.includes("Maria &lt;b&gt;") && html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>") && !html.includes("98765") && !html.includes("91111"));
  assert.equal(escaparHtml(`"<&>`), "&quot;&lt;&amp;&gt;");
});

// ── 6b) nome do currículo na edição ──
ok("currículo: aceita o nome gerado pela tela (timestamp-aleatório.ext)", () => {
  for (const nome of ["1760000000000-k3j9x2ab.pdf", "1760000000000-k3j9x2ab.docx", "a_B-1.png", "curriculo.v2.pdf"]) assert.equal(nomeArquivoCurriculoValido(nome), true, nome);
});
ok("currículo: rejeita '/', '..', espaço, vazio e caracteres fora do padrão", () => {
  for (const nome of ["../x.pdf", "outra-pasta/x.pdf", "/x.pdf", "..", "a..b.pdf", "x y.pdf", "", "x.pdf?a=1", "x\\y.pdf", "çurriculo.pdf"]) assert.equal(nomeArquivoCurriculoValido(nome), false, JSON.stringify(nome));
});

// ── 7) filtro por updated_at com o formato que o supabase-js/PostgREST devolve ──
// A decisão (aprovar/recusar) e a edição fazem .eq("updated_at", <valor lido do banco, como string>).
// Aqui o cliente REAL do supabase-js monta a URL; a "resposta do banco" é simulada com microssegundos e +00:00.
{
  const lidoDoBanco = "2026-10-08T17:33:10.123456+00:00";
  const urls: { metodo: string; url: string }[] = [];
  const fetchFalso = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    urls.push({ metodo: init?.method ?? "GET", url });
    const corpo = (init?.method ?? "GET") === "GET" ? [{ id: "s1", updated_at: lidoDoBanco }] : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const sb = createClient("https://exemplo.supabase.co", "chave-falsa", { global: { fetch: fetchFalso }, auth: { persistSession: false } });

  const { data } = await sb.from("solicitacoes_indicacao_candidato").select("*").eq("id", "s1");
  const lido = (data as { updated_at: string }[])[0].updated_at;
  assert.equal(lido, lidoDoBanco); // o supabase-js não converte o timestamp: a string chega intacta
  await sb.from("solicitacoes_indicacao_candidato").update({ status: "recusada" }).eq("id", "s1").eq("status", "pendente").eq("updated_at", lido).select("*");

  const patch = urls.find((u) => u.metodo === "PATCH")!;
  const u = new URL(patch.url);
  ok("updated_at vai na URL codificado: '+' vira %2B (senão o servidor leria espaço)", () => {
    assert.ok(patch.url.includes("updated_at=eq.2026-10-08T17%3A33%3A10.123456%2B00%3A00"), patch.url);
    assert.ok(!patch.url.includes("updated_at=eq.2026-10-08T17:33:10.123456+00:00"));
  });
  ok("o servidor decodifica de volta EXATAMENTE a string lida (microssegundos e +00:00 intactos)", () => assert.equal(u.searchParams.get("updated_at"), `eq.${lidoDoBanco}`));
  ok("status e id continuam como filtros ao lado do updated_at", () => {
    assert.equal(u.searchParams.get("status"), "eq.pendente");
    assert.equal(u.searchParams.get("id"), "eq.s1");
  });
  ok("escrita com new Date().toISOString() (ms, 'Z') também casa no formato de volta", () => {
    const gravado = new Date("2026-10-08T17:33:10.123Z").toISOString(); // o que as rotas gravam em updated_at
    assert.equal(gravado, "2026-10-08T17:33:10.123Z");
    // Postgres devolve o mesmo instante como "...10.123+00:00": mesmo instante, a rota só compara o que leu.
    assert.equal(new Date("2026-10-08T17:33:10.123+00:00").getTime(), new Date(gravado).getTime());
  });
}

console.log(`\n${n} verificações OK`);
