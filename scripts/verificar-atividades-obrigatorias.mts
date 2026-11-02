// "Principais atividades" obrigatório na CRIAÇÃO de solicitação de vaga pelo cliente (portal logado e link público).
// Cobre os 2 schemas, a validação por etapa do link público e as 2 rotas (o servidor é a barreira final, 400 sem gravar).
// A edição (solicitacaoVagaUpdateSchema), os templates e as vagas do RH continuam opcionais — também afirmado aqui.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-atividades-obrigatorias.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logarPortal, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { novoDbIndicacao } from "./harness-mot/ambiente-indicacao.mjs";
import { parseBody, portalSolicitarVagaSchema, publicoSolicitarVagaSchema, solicitacaoVagaUpdateSchema } from "../src/lib/schemas";
import { formularioInicial, montarCorpoEnvio, validarEtapa, validarTudo, type FormPublico } from "../src/lib/solicitacaoVagaPublicaForm";
import { PADROES_RS } from "../src/lib/propostaModelos";

congelarData();
const rotaPortal = await importar("src/app/api/portal/solicitar-vaga/route.ts");
const rotaPublica = await importar("src/app/api/solicitacao-vaga-publica/[token]/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const MSG = "Informe as principais atividades do cargo.";
const CNPJ_OK = "11.222.333/0001-81";
const TOKEN = "acme-industria-7kQ2mXp9RbTw";

const portalBase = { cargo: "Auxiliar", tipo_servico: "recrutamento_selecao", cidade: "Campinas", estado: "SP" };
const formPublico = (extra: Partial<FormPublico> = {}): FormPublico => ({
  ...formularioInicial(null), nome: "Indústria Exemplo Ltda", documento: CNPJ_OK, contato_nome: "Maria Souza", telefone: "(19) 99999-8888",
  email: "contato@exemplo.com.br", email_nf: "financeiro@exemplo.com.br", cargo: "Auxiliar administrativo", cidade: "Hortolândia", estado: "SP", aceite: true, ...extra,
});
const mensagens = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  r.success ? [] : r.error!.issues.filter((i) => i.path[0] === "principais_atividades").map((i) => i.message);

// ── Schema do portal logado ──
await ok("portal: ausente, null, vazio e só espaços são recusados com a mensagem clara", () => {
  for (const v of [undefined, null, "", "   ", "\n\t "]) {
    const corpo: Record<string, unknown> = { ...portalBase };
    if (v !== undefined) corpo.principais_atividades = v;
    const r = portalSolicitarVagaSchema.safeParse(corpo);
    assert.equal(r.success, false, JSON.stringify(v));
    assert.deepEqual(mensagens(r as any), [MSG], JSON.stringify(v));
  }
});
await ok("portal: preenchido passa e o schema entrega o texto sem as bordas em branco", () => {
  const r = portalSolicitarVagaSchema.safeParse({ ...portalBase, principais_atividades: "  Atender clientes\nLançar notas  " });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.principais_atividades, "Atender clientes\nLançar notas");
});

// ── Schema do link público ──
const corpoPublico = (extra: Record<string, unknown> = {}) => ({ ...montarCorpoEnvio(formPublico({ principais_atividades: "Atender clientes" })), ...extra });
await ok("público: ausente, null, vazio e só espaços são recusados com a mesma mensagem", () => {
  for (const v of [undefined, null, "", "   "]) {
    const corpo: Record<string, unknown> = corpoPublico();
    if (v === undefined) delete corpo.principais_atividades; else corpo.principais_atividades = v;
    const r = publicoSolicitarVagaSchema.safeParse(corpo);
    assert.equal(r.success, false, JSON.stringify(v));
    assert.deepEqual(mensagens(r as any), [MSG], JSON.stringify(v));
  }
});
await ok("público: preenchido passa (trim), 3000 caracteres passa e 3001 é recusado", () => {
  const r = publicoSolicitarVagaSchema.safeParse(corpoPublico({ principais_atividades: "  Atender clientes  " }));
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.principais_atividades, "Atender clientes");
  assert.equal(publicoSolicitarVagaSchema.safeParse(corpoPublico({ principais_atividades: "x".repeat(3000) })).success, true);
  const longo = publicoSolicitarVagaSchema.safeParse(corpoPublico({ principais_atividades: "x".repeat(3001) }));
  assert.deepEqual(mensagens(longo as any), ["Use no máximo 3000 caracteres."]);
});

// ── Validação por etapa do link público (cliente) ──
await ok("link público: a etapa do perfil exige o campo (vazio e só espaços) e passa preenchido; as outras etapas não pedem", () => {
  for (const v of ["", "   "]) assert.equal(validarEtapa(3, formPublico({ principais_atividades: v })).principais_atividades, MSG);
  assert.deepEqual(validarEtapa(3, formPublico({ principais_atividades: "Atender clientes" })), {});
  assert.equal(validarEtapa(3, formPublico({ principais_atividades: "x".repeat(3001) })).principais_atividades, "Use no máximo 3000 caracteres.");
  for (const e of [1, 2, 4] as const) assert.equal("principais_atividades" in validarEtapa(e, formPublico({ principais_atividades: "" })), false);
  assert.equal(validarTudo(formPublico({ principais_atividades: "" }))?.etapa, 3);
  assert.equal(validarTudo(formPublico({ principais_atividades: "Atender clientes" })), null);
});

// ── Rotas: o servidor recusa (400) sem gravar nada ──
await ok("rota do portal: sem o campo (ausente/vazio/espaços) → 400 e nada gravado; preenchido → grava", async () => {
  for (const extra of [{}, { principais_atividades: "" }, { principais_atividades: "   " }, { principais_atividades: null }]) {
    const db = novoDbIndicacao(); db.tabelas.solicitacoes_vagas = []; logarPortal(db, "cli");
    const r = await chamar(rotaPortal.POST, { metodo: "POST", corpo: { ...portalBase, ...extra } });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.match(r.corpo.error, /principais_atividades: Informe as principais atividades do cargo\./);
    assert.equal(db.tabelas.solicitacoes_vagas.length, 0);
  }
  const db = novoDbIndicacao(); db.tabelas.solicitacoes_vagas = []; db.tabelas.notificacoes_analista = []; logarPortal(db, "cli");
  const r = await chamar(rotaPortal.POST, { metodo: "POST", corpo: { ...portalBase, principais_atividades: "Atender clientes" } });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.corpo));
  assert.equal(db.tabelas.solicitacoes_vagas.length, 1);
  assert.equal(db.tabelas.solicitacoes_vagas[0].principais_atividades, "Atender clientes");
});
await ok("rota do link público: sem o campo → 400, nada gravado e o uso do link NÃO é consumido; preenchido → grava", async () => {
  const novoBanco = () => {
    const db = novoDbIndicacao();
    db.tabelas.solicitacao_vaga_links = [{
      id: "link-1", token: TOKEN, unidade_id: "U1", nome_empresa: "Acme Indústria", criado_por_user_id: "u-dir", criado_por_nome: "Ana",
      expira_em: new Date(Date.now() + 5 * 864e5).toISOString(), revogado_em: null, usos: 0, created_at: new Date().toISOString(),
      condicoes: { ...PADROES_RS, taxa_sem_reposicao_pct: 40, taxa_cancelamento_pct: 0 }, clausulas_adicionais: [],
    }];
    db.tabelas.solicitacoes_vagas = []; db.tabelas.notificacoes_analista = [];
    return db;
  };
  const silencio = console.error; console.error = () => undefined;
  try {
    for (const v of [undefined, null, "", "   "]) {
      const db = novoBanco();
      const corpo: Record<string, unknown> = corpoPublico();
      if (v === undefined) delete corpo.principais_atividades; else corpo.principais_atividades = v;
      const r = await chamar(rotaPublica.POST, { metodo: "POST", params: { token: TOKEN }, corpo });
      assert.equal(r.status, 400, JSON.stringify(r.corpo));
      assert.match(r.corpo.error, /principais_atividades: Informe as principais atividades do cargo\./);
      assert.equal(db.tabelas.solicitacoes_vagas.length, 0);
      assert.equal(db.tabelas.solicitacao_vaga_links[0].usos, 0);
    }
    const db = novoBanco();
    const r = await chamar(rotaPublica.POST, { metodo: "POST", params: { token: TOKEN }, corpo: corpoPublico() });
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.corpo));
    assert.equal(db.tabelas.solicitacoes_vagas.length, 1);
    assert.equal(db.tabelas.solicitacoes_vagas[0].principais_atividades, "Atender clientes");
  } finally { console.error = silencio; }
});

// ── Fora do escopo: continua opcional ──
await ok("edição da solicitação pelo RH (solicitacaoVagaUpdateSchema) continua aceitando sem atividades", () => {
  assert.equal(parseBody(solicitacaoVagaUpdateSchema, { cargo: "Auxiliar" }).success, true);
  assert.equal(parseBody(solicitacaoVagaUpdateSchema, { principais_atividades: "" }).success, true);
  assert.equal(parseBody(solicitacaoVagaUpdateSchema, { principais_atividades: null }).success, true);
});

console.log(`\n${n} verificações OK`);
