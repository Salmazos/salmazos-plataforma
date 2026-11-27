// Verificação do BACKEND da proposta de Terceirização (TS, etapa 2C): criação e revisão calculadas no servidor, snapshot com os percentuais vigentes, regras de preço da
// diretoria (preço configurado, margem mínima, preço manual e ISS por proposta), percentuais (diretoria), prévia, numeração pelo contador único e o bloqueio de "marcar como
// enviada" até existir o PDF (2E). SEM telas (2D) e SEM PDF (2E). As rotas rodam contra o banco em memória do harness; nada toca o Supabase real.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-ts-api.mts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import * as rotaId from "@/app/api/comercial/propostas/[id]/route";
import * as rotaSit from "@/app/api/comercial/propostas/[id]/situacao/route";
import * as rotaPdf from "@/app/api/comercial/propostas/[id]/pdf/route";
import * as rotaParametros from "@/app/api/comercial/propostas/ts/parametros/route";
import * as rotaPrevia from "@/app/api/comercial/propostas/ts/previa/route";
import { hojeSaoPaulo } from "@/lib/comercial";
import { calcularValidadeAte } from "@/lib/propostas";
import { MENSAGEM_MODELO_INDISPONIVEL } from "@/lib/propostaModelos";
import {
  MSG_PDF_TS_INDISPONIVEL, MSG_SO_DIRETORIA_GANHO, MSG_SO_DIRETORIA_PRECO_MANUAL, TEMPLATE_VERSAO_TS, conteudoTsParaPerfil, conteudoTsSchema, montarSnapshotTs, privilegiosTsViolados,
  propostaTsParaPerfil, restaurarOcultosTs, snapshotTsSchema,
} from "@/lib/propostaTs";
import { COLUNAS_SEM_USO_TS, MSG_GANHO_TS_NAO_CONFIGURADO, PARAMETROS_TS_INICIAIS, type ParametrosTs } from "@/lib/propostaTsCalculo";
import { formatarCentavosBRL } from "@/lib/propostaMotCalculo";
import { criarDb } from "../scripts/harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const U = "11111111-1111-4111-8111-111111111111", U2 = "11111111-1111-4111-8111-222222222222";
const V = "22222222-2222-4222-8222-222222222222", G = "33333333-3333-4333-8333-333333333333", VSBC = "44444444-4444-4444-8444-444444444444", DIR = "66666666-6666-4666-8666-666666666666";
const EMP = "55555555-5555-4555-8555-000000000001", EMP_TESTE = "55555555-5555-4555-8555-000000000002", EMP_SBC = "55555555-5555-4555-8555-000000000003";
const HOJE = hojeSaoPaulo();
const ANO = Number(HOJE.slice(0, 4));
const AA = String(ANO).slice(-2);
const mais = (dias: number) => calcularValidadeAte(HOJE, dias);
const SEMENTE = 71;

// Ganho padrão 30% sobre o custo, mínimo 20%: o Auxiliar de Limpeza 44h dá custo R$ 5.357,73 (encargos como na planilha) e preço R$ 6.965,05.
const PAR_PRECO: ParametrosTs = { ...PARAMETROS_TS_INICIAIS, ganho_padrao_bp: 3000, ganho_minimo_bp: 2000 };
const PAR_ZERADOS: ParametrosTs = { ...PARAMETROS_TS_INICIAIS };
const CUSTO = 535773, ENCARGOS = 169922, PRECO = 696505;
const precoDe = (custo: number, ganhoBp: number) => Math.floor((custo * (10000 + ganhoBp) * 2 + 10000) / 20000);
const seedParametros = (p: ParametrosTs, extra: Record<string, unknown> = {}) => ({ id: "pts-1", vigente_desde: "2026-01-01", ...p, alterado_por: null, created_at: "2026-01-01T00:00:00Z", ...extra });

// ── Chaves de harness (só fora de produção): ligar o TS para quem não é gestor/empresa de teste, e o MOT para a numeração ──────────────
async function comChaves<T>(fn: () => Promise<T> | T, env: Record<string, string> = { HARNESS_PROPOSTA_TS: "1" }): Promise<T> {
  const nomes = ["HARNESS_PROPOSTA_TS", "HARNESS_PROPOSTA_MOT", "NODE_ENV", "VERCEL_ENV", "VERCEL"];
  const antes: Record<string, string | undefined> = {};
  for (const k of nomes) { antes[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try { return await fn(); } finally { for (const k of nomes) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } }
}
const semChave = <T,>(fn: () => Promise<T> | T) => comChaves(fn, {});

// ── Banco em memória + rpcs imitando o banco ─────────────────────────────────────────────────────────────────────────────────────────
function contadorUnico(db: any) {
  let c = db.tabelas.proposta_contador_unico.find((x: any) => x.ano === ANO);
  if (!c) { c = { ano: ANO, ultimo: 0 }; db.tabelas.proposta_contador_unico.push(c); }
  return c;
}
function linhaBase(a: Record<string, unknown>, numero: string, sequencial: number, teste: boolean) {
  const agora = new Date().toISOString();
  return {
    id: crypto.randomUUID(), numero, modelo: a.p_modelo, ano: ANO, sequencial, revisao_atual: 0, situacao: "rascunho", unidade_id: a.p_unidade_id, vendedor_id: a.p_vendedor_id,
    empresa_visitada_id: a.p_empresa_visitada_id, oportunidade_id: a.p_oportunidade_id, cliente_nome: a.p_cliente_nome, aos_cuidados: a.p_aos_cuidados, conteudo: a.p_conteudo,
    template_versao: a.p_template_versao, validade_dias: a.p_validade_dias, validade_ate: null, valor_estimado: null, enviada_em: null, created_at: agora, updated_at: agora, teste,
  };
}
// criar_proposta: contador ÚNICO por ano na mesma transação da proposta (db.simularFalhaInsert = o insert falha e o contador volta, como no banco).
function rpcReal(a: Record<string, unknown>, db: any) {
  db.rpcChamadas.push({ rpc: "criar_proposta", ...a });
  const c = contadorUnico(db);
  const antes = c.ultimo;
  c.ultimo += 1;
  if (db.simularFalhaInsert) { c.ultimo = antes; return { data: null, error: { message: "violates foreign key constraint" } }; }
  const prefixo = a.p_modelo === "RS" ? `${a.p_sigla}-` : `${a.p_sigla}-${a.p_modelo}-`;
  const linha = linhaBase(a, `${prefixo}${String(c.ultimo).padStart(4, "0")}/${AA}`, c.ultimo, false);
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}
function rpcTeste(a: Record<string, unknown>, db: any) {
  db.rpcChamadas.push({ rpc: "criar_proposta_teste", ...a });
  let c = db.tabelas.proposta_contadores_teste.find((x: any) => x.modelo === a.p_modelo && x.ano === ANO);
  if (!c) { c = { modelo: a.p_modelo, ano: ANO, ultimo: 0 }; db.tabelas.proposta_contadores_teste.push(c); }
  c.ultimo += 1;
  const prefixo = a.p_modelo === "RS" ? "TESTE-" : `TESTE-${a.p_modelo}-`;
  const linha = linhaBase(a, `${prefixo}${String(c.ultimo).padStart(4, "0")}/${AA}`, c.ultimo, true);
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}
// parametros_ts_vigentes(p_hoje): a vigência mais recente com vigente_desde <= p_hoje (empate no mesmo dia: a criada por último), como no banco.
function rpcVigentes(a: Record<string, unknown>, db: any) {
  const linhas = db.tabelas.proposta_ts_parametros
    .filter((l: any) => l.vigente_desde <= (a.p_hoje as string))
    .sort((x: any, y: any) => y.vigente_desde.localeCompare(x.vigente_desde) || String(y.created_at ?? "").localeCompare(String(x.created_at ?? "")));
  db.rpcChamadas.push({ rpc: "parametros_ts_vigentes", ...a });
  return { data: linhas.slice(0, 1).map((l: any) => structuredClone(l)), error: null };
}

function novoDb(par: ParametrosTs = PAR_PRECO, extra: Record<string, unknown[]> = {}) {
  const db: any = criarDb({
    analistas_perfil: [
      { id: V, user_id: "u-v", nome_completo: "Vendedor", email: "v@salmazos.com.br", telefone: "(19) 99999-0000", cargo: "Especialista em pessoas", nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
      // Gestor sem perfil comercial (como o Olver): escreve por liberação, sem Funil.
      { id: G, user_id: "u-g", nome_completo: "Gestora Teste", email: "g@salmazos.com.br", telefone: null, cargo: "Diretora", nivel_acesso: "superuser", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      // Diretoria (não superuser) com a aba liberada: também é gestor para as regras de preço.
      { id: DIR, user_id: "u-dir", nome_completo: "Diretora Comercial", email: "d@salmazos.com.br", telefone: null, cargo: "Diretora", nivel_acesso: "diretoria", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
      { id: VSBC, user_id: "u-vsbc", nome_completo: "Vendedor SBC", email: "s@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "analista", unidade_id: U2, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: G, chave_aba: "comercial_propostas", liberado: true }, { analista_perfil_id: DIR, chave_aba: "comercial_propostas", liberado: true }],
    empresas_visitadas: [
      { id: EMP, nome: "ZZTEST Empresa Real", cliente_id: null, unidade_id: U },
      { id: EMP_TESTE, nome: "cliente teste", cliente_id: null, unidade_id: U },
      { id: EMP_SBC, nome: "ZZTEST Empresa SBC", cliente_id: null, unidade_id: U2 },
    ],
    empresas_teste: [{ empresa_id: EMP_TESTE, marcado_por: G, created_at: "2026-11-20T10:00:00Z" }],
    empresa_contatos: [], oportunidades: [], lembretes: [], oportunidade_interacoes: [], propostas: [], proposta_revisoes: [], proposta_historico: [], audit_logs: [],
    proposta_contador_unico: [{ ano: ANO, ultimo: SEMENTE }], proposta_contadores_teste: [],
    proposta_ts_parametros: [seedParametros(par)],
    ...extra,
  });
  db.rpcs = { criar_proposta: rpcReal, criar_proposta_teste: rpcTeste, parametros_ts_vigentes: rpcVigentes };
  db.rpcChamadas = [];
  // Nenhum update/delete pode acontecer nestas tabelas em NENHUM teste (o harness quebra se acontecer).
  db.imutaveis = ["proposta_revisoes", "proposta_historico", "proposta_ts_parametros"];
  db.cascatas = { oportunidades: [{ tabela: "oportunidade_interacoes", col: "oportunidade_id" }] };
  return db;
}

type Chamada = { status: number; body: any };
async function chamar(db: any, usuario: string | null, fn: (...a: any[]) => Promise<Response>, { metodo = "GET", url = "http://x/api", corpo, id }: { metodo?: string; url?: string; corpo?: unknown; id?: string } = {}): Promise<Chamada> {
  db.usuario = usuario ? { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: "analista" } } : null;
  globalThis.__DB__ = db;
  globalThis.__PENDENTES__ = [];
  const req = Object.assign(new Request(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { nextUrl: new URL(url) });
  const r = await fn(req, { params: Promise.resolve({ id }) });
  await Promise.all(globalThis.__PENDENTES__ ?? []);
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, body: tipo.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
}

// Auxiliar de Limpeza 44h (caso do Ölver): salário 1.837,40; insalubridade 324,20; assiduidade 315,00; VT 200,00; refeição 480,00; cesta 151,91; uniforme 100,00; operação 250,00.
const posto = (extra: Record<string, unknown> = {}) => ({
  funcao: "Auxiliar de Limpeza", escala: "44h", horas_mensais: 220, efetivos: 1, salario_centavos: 183740,
  adicionais: [{ tipo: "insalubridade", modo: "valor", valor_centavos: 32420 }, { tipo: "assiduidade", modo: "valor", valor_centavos: 31500 }],
  beneficios: [{ tipo: "vale_transporte", valor_centavos: 20000 }, { tipo: "refeicao", valor_centavos: 48000 }, { tipo: "cesta_basica", valor_centavos: 15191 }],
  uniforme_epi_centavos: 10000, insumos_centavos: 0, operacao_centavos: 25000, ...extra,
});
const servico = (extra: Record<string, unknown> = {}) => ({ nome: "Limpeza e conservação", modo: "postos", postos: [posto()], ...extra });
const conteudoTs = (extra: Record<string, unknown> = {}) => ({ servicos: [servico()], ...extra });
const CONTEUDO_MOT = { funcoes: [{ area: "OPERACIONAL", descricao: null, salario_centavos: 100000, jornada: "Conforme CCT", horario: "Turnos A / B / C" }] };

const criar = (db: any, usuario: string, extra: Record<string, unknown> = {}, empresa = EMP_TESTE, modelo = "TS") =>
  chamar(db, usuario, rotaLista.POST, { metodo: "POST", corpo: { modelo, empresa_visitada_id: empresa, conteudo: modelo === "MOT" ? CONTEUDO_MOT : conteudoTs(), ...extra } });
const situacao = (db: any, usuario: string, id: string, corpo: Record<string, unknown>) => chamar(db, usuario, rotaSit.POST, { metodo: "POST", id, corpo });
const proposta = (db: any, id: string) => db.tabelas.propostas.find((p: any) => p.id === id);
const patch = (db: any, usuario: string, id: string, corpo: Record<string, unknown>) => chamar(db, usuario, rotaId.PATCH, { metodo: "PATCH", id, corpo: { updated_at: proposta(db, id).updated_at, ...corpo } });
const detalhe = (db: any, usuario: string, id: string) => chamar(db, usuario, rotaId.GET, { id });
const pdf = (db: any, usuario: string, id: string) => chamar(db, usuario, rotaPdf.GET, { id });
const previa = (db: any, usuario: string | null, conteudo: unknown, extra: Record<string, unknown> = {}) => chamar(db, usuario, rotaPrevia.POST, { metodo: "POST", corpo: { conteudo, ...extra } });
const lerParametros = (db: any, usuario: string | null) => chamar(db, usuario, rotaParametros.GET);
const gravarParametros = (db: any, usuario: string | null, corpo: unknown) => chamar(db, usuario, rotaParametros.POST, { metodo: "POST", corpo });
const unico = (db: any) => db.tabelas.proposta_contador_unico.find((c: any) => c.ano === ANO)?.ultimo;
const escritas = (db: any) => db.consultas.filter((q: any) => q.op !== "select");
const linha = (planilha: any, chave: string) => planilha.servicos[0].postos[0].linhas.find((l: any) => l.chave === chave)?.valor_centavos;

// Enviada com Rev. 0 gravada (o envio pela API só existe depois do PDF, 2E): semeada com o MESMO montarSnapshotTs que o servidor usa.
function semearEnviada(db: any, conteudo: Record<string, unknown> = conteudoTs(), situacaoInicial = "enviada", opcoes: { dono?: string; teste?: boolean; liberacao?: any } = {}) {
  const dono = opcoes.dono ?? G, teste = opcoes.teste ?? true;
  const par = db.tabelas.proposta_ts_parametros[0];
  const { id: pid, vigente_desde, alterado_por: _a, created_at: _c, ...percentuais } = par;
  const snap0 = montarSnapshotTs({
    numero: `TESTE-TS-0099/${AA}`, revisao: 0, templateVersao: TEMPLATE_VERSAO_TS, dataEmissao: HOJE, validadeDias: 15, validadeAte: mais(15), clienteNome: "cliente teste", aosCuidados: null,
    conteudo, vendedorNome: dono === G ? "Gestora Teste" : "Vendedor", vendedorTelefone: null, parametros: { vigente_desde, id: pid, ...percentuais }, liberacaoGanho: opcoes.liberacao ?? null,
  });
  const id = crypto.randomUUID();
  db.tabelas.propostas.push({
    id, numero: `TESTE-TS-0099/${AA}`, modelo: "TS", ano: ANO, sequencial: 99, revisao_atual: 0, situacao: situacaoInicial, unidade_id: U, vendedor_id: dono, empresa_visitada_id: teste ? EMP_TESTE : EMP, oportunidade_id: null,
    cliente_nome: "cliente teste", aos_cuidados: null, conteudo, template_versao: TEMPLATE_VERSAO_TS, validade_dias: 15, validade_ate: mais(15), valor_estimado: snap0.total_mensal_centavos / 100,
    enviada_em: "2026-11-20T12:00:00.000Z", created_at: "2026-11-20T10:00:00.000Z", updated_at: "2026-11-20T12:00:00.000Z", teste,
  });
  db.tabelas.proposta_revisoes.push({ id: crypto.randomUUID(), proposta_id: id, revisao: 0, conteudo: snap0, template_versao: TEMPLATE_VERSAO_TS, vendedor_nome: dono === G ? "Gestora Teste" : "Vendedor", vendedor_telefone: null, criado_por: dono, created_at: "2026-11-20T12:00:00.000Z" });
  return { id, snap0 };
}

// ── 1) Criar: o servidor calcula (caso do Ölver) ─────────────────────────────────────────────────────────────────────────────────────

await caso("CRIAR (gestor, empresa de teste): o servidor calcula o caso do Ölver — custo R$ 5.357,71, encargos R$ 1.699,22, ganho de 30% → R$ 6.965,05; número TESTE-TS; template próprio; o gestor recebe custo e ganho", async () => semChave(async () => {
  const db = novoDb();
  const r = await criar(db, "u-g");
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `TESTE-TS-0001/${AA}`);
  assert.equal(r.body.data.modelo, "TS");
  assert.equal(r.body.data.teste, true);
  assert.equal(r.body.data.template_versao, TEMPLATE_VERSAO_TS);
  assert.equal(r.body.data.situacao, "rascunho");
  assert.equal(r.body.data.valor_estimado, null, "rascunho não tem valor estimado: ele nasce no envio");
  assert.equal(db.tabelas.proposta_historico.filter((h: any) => h.para === "rascunho").length, 1);
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc === "criar_proposta_teste").length, 1);
  assert.equal(r.body.data.conteudo.servicos[0].postos[0].salario_centavos, 183740);
  const d = await detalhe(db, "u-g", r.body.data.id);
  assert.equal(d.status, 200);
  const pl = d.body.planilhaTs;
  assert.equal(pl.origem, "hoje"); assert.equal(pl.erro, null);
  assert.equal(linha(pl.planilha, "encargos"), ENCARGOS, "encargos R$ 1.699,22");
  assert.equal(linha(pl.planilha, "custo_unitario"), CUSTO, "custo R$ 5.357,73");
  assert.equal(formatarCentavosBRL(CUSTO).replace(/\s/g, " "), "R$ 5.357,73");
  assert.equal(pl.planilha.servicos[0].preco_calculado_centavos, PRECO);
  assert.equal(pl.planilha.total_mensal_centavos, PRECO);
  assert.equal(formatarCentavosBRL(pl.planilha.total_mensal_centavos).replace(/\s/g, " "), "R$ 6.965,05");
  assert.match(pl.planilha.total_mensal_extenso, /^Seis mil, novecentos e sessenta e cinco reais e cinco centavos$/);
  assert.equal(pl.planilha.ganho_bp, 3000);
  assert.deepEqual([pl.planilha.ganho_padrao_bp, pl.planilha.ganho_minimo_bp, pl.planilha.encargos_sobre_adicionais], [3000, 2000, true]);
  assert.equal(pl.planilha.servicos[0].ganho_real_bp, 3000, "gestor vê o ganho");
  assert.equal(pl.planilha.liberacao_ganho, null);
  // As colunas do modelo antigo nunca saem.
  assert.doesNotMatch(JSON.stringify(d.body), /"(cobertura|iss|pis|cofins|irpj|csll|despesas|lucro|margem_minima)_bp"/);
}));

await caso("o servidor IGNORA qualquer valor calculado vindo do navegador (total, preços, custos, planilha, valor estimado, número, situação): só valem os dados de entrada", async () => semChave(async () => {
  const db = novoDb();
  const falso = conteudoTs({
    total_mensal_centavos: 1, custo_total_centavos: 1, planilha: { total: 1 }, parametros: { ganho_padrao_bp: 9999 },
    servicos: [servico({ preco_calculado_centavos: 1, preco_centavos: 1, custo_centavos: 1, ganho_real_bp: 9999, abaixo_ganho_minimo: false, postos: [posto({ custo_unit_centavos: 1, preco_unit_centavos: 1, preco_posto_centavos: 1, linhas: [] })] })],
  });
  const r = await criar(db, "u-g", { conteudo: falso, valor_estimado: 1, numero: "FALSO-0001/26", situacao: "aceita", teste: false, vendedor_id: V });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.numero, `TESTE-TS-0001/${AA}`);
  assert.equal(r.body.data.situacao, "rascunho");
  assert.equal(r.body.data.vendedor_id, G);
  assert.equal(r.body.data.valor_estimado, null);
  const guardado = JSON.stringify(proposta(db, r.body.data.id).conteudo);
  for (const proibido of ["total_mensal_centavos", "custo_total_centavos", "planilha", "preco_calculado_centavos", "preco_centavos", "custo_centavos", "ganho_real_bp", "custo_unit_centavos", "preco_unit_centavos", "preco_posto_centavos", "\"linhas\"", "9999"]) {
    assert.ok(!guardado.includes(proibido), `conteúdo gravado traz ${proibido}`);
  }
  const d = await detalhe(db, "u-g", r.body.data.id);
  assert.equal(d.body.planilhaTs.planilha.total_mensal_centavos, PRECO);
  assert.equal(linha(d.body.planilhaTs.planilha, "custo_unitario"), CUSTO);
  // Prévia: mesma coisa.
  const p = await previa(db, "u-g", falso);
  assert.equal(p.status, 200);
  assert.equal(p.body.data.planilha.total_mensal_centavos, PRECO);
}));

await caso("conteúdo inválido do TS → 400 em português (com o caminho legível) e NADA é criado nem gasta número", async () => semChave(async () => {
  const db = novoDb();
  for (const conteudo of [{}, { servicos: [] }, conteudoTs({ servicos: [servico({ postos: [posto({ salario_centavos: 0 })] })] }), conteudoTs({ servicos: [servico({ postos: [posto({ efetivos: 0 })] })] }), { servicos: [servico({ nome: "" })] }]) {
    const r = await criar(db, "u-g", { conteudo });
    assert.equal(r.status, 400, JSON.stringify(conteudo));
    assert.doesNotMatch(r.body.error, /undefined|invalid|expected/i);
  }
  const r = await criar(db, "u-g", { conteudo: conteudoTs({ servicos: [servico({ postos: [posto(), posto({ salario_centavos: 0 })] })] }) });
  assert.match(r.body.error, /Serviço 1 · Posto 2 \(salário\)/);
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc.startsWith("criar_proposta")).length, 0);
  assert.equal(db.tabelas.proposta_contadores_teste.length, 0);
}));

// ── 2) Ganho não configurado ─────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("GANHO não configurado (padrão 0 e sem ganho na proposta): 422 com a mensagem exata, sem salvar proposta nem gastar número; prévia e edição também recusam; o detalhe mostra o erro; o gestor que informa o ganho na proposta passa", async () => semChave(async () => {
  const db = novoDb(PAR_ZERADOS);
  assert.equal(MSG_GANHO_TS_NAO_CONFIGURADO, "O percentual de ganho da Terceirização ainda não foi configurado pela diretoria.");
  const r = await criar(db, "u-g");
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "O percentual de ganho da Terceirização ainda não foi configurado pela diretoria.");
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc.startsWith("criar_proposta")).length, 0);
  assert.equal(db.tabelas.proposta_contadores_teste.length, 0);
  assert.equal(unico(db), SEMENTE);
  const p = await previa(db, "u-g", conteudoTs());
  assert.equal(p.status, 422); assert.equal(p.body.error, MSG_GANHO_TS_NAO_CONFIGURADO);
  const comGanho = await criar(db, "u-g", { conteudo: conteudoTs({ ganho_bp: 2500 }) });
  assert.equal(comGanho.status, 201, JSON.stringify(comGanho.body));
  assert.equal((await detalhe(db, "u-g", comGanho.body.data.id)).body.planilhaTs.planilha.total_mensal_centavos, precoDe(CUSTO, 2500));
  // Rascunho criado com o padrão e DEPOIS a diretoria zera: detalhe mostra o erro; editar é recusado e nada muda.
  const db2 = novoDb();
  const id = (await criar(db2, "u-g")).body.data.id as string;
  db2.tabelas.proposta_ts_parametros.push(seedParametros(PAR_ZERADOS, { id: "pts-2", vigente_desde: HOJE, created_at: "2026-11-25T10:00:00Z" }));
  const d = await detalhe(db2, "u-g", id);
  assert.equal(d.body.planilhaTs.planilha, null);
  assert.equal(d.body.planilhaTs.erro, MSG_GANHO_TS_NAO_CONFIGURADO);
  const antes = JSON.stringify(proposta(db2, id));
  const ed = await patch(db2, "u-g", id, { conteudo: conteudoTs({ servicos: [servico({ nome: "Outro nome" })] }) });
  assert.equal(ed.status, 422); assert.equal(ed.body.error, MSG_GANHO_TS_NAO_CONFIGURADO);
  assert.equal(JSON.stringify(proposta(db2, id)), antes, "nada foi gravado");
}));

await caso("sem NENHUMA vigência de percentuais: 409 com a orientação; percentuais inválidos no banco: 500 sem calcular", async () => semChave(async () => {
  const db = novoDb();
  db.tabelas.proposta_ts_parametros = [];
  const r = await criar(db, "u-g");
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Peça à diretoria para cadastrá-los/);
  assert.equal(db.tabelas.propostas.length, 0);
  const db2 = novoDb();
  db2.tabelas.proposta_ts_parametros[0].ganho_padrao_bp = 200000;
  const r2 = await criar(db2, "u-g");
  assert.equal(r2.status, 500);
  assert.equal(db2.tabelas.propostas.length, 0);
}));

// ── 3) Preço manual e ganho por proposta: só gestor/diretoria ─────────────────────────────────────────────────────────────────────────────────

await caso("preço manual e ganho por proposta: quem não é diretoria recebe 403 ao CRIAR e ao EDITAR, e nada é gravado nem gasta número; a diretoria usa e o servidor aplica", async () => comChaves(async () => {
  const db = novoDb();
  const manual = conteudoTs({ servicos: [servico({ preco_manual_centavos: 700000 })] });
  const ganho = conteudoTs({ ganho_bp: 4000 });
  for (const [conteudo, mensagem] of [[manual, MSG_SO_DIRETORIA_PRECO_MANUAL], [ganho, MSG_SO_DIRETORIA_GANHO]] as const) {
    const r = await criar(db, "u-v", { conteudo }, EMP);
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.error, mensagem);
  }
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc.startsWith("criar_proposta")).length, 0);
  assert.equal(unico(db), SEMENTE);
  assert.deepEqual(db.tabelas.audit_logs, []);
  // Edição: o vendedor cria normal e tenta acrescentar preço manual / ganho.
  const normal = await criar(db, "u-v", {}, EMP);
  assert.equal(normal.status, 201, JSON.stringify(normal.body));
  assert.equal(normal.body.data.numero, `VE-TS-0072/${AA}`);
  const id = normal.body.data.id as string;
  const antes = JSON.stringify(proposta(db, id));
  for (const [conteudo, mensagem] of [[manual, MSG_SO_DIRETORIA_PRECO_MANUAL], [ganho, MSG_SO_DIRETORIA_GANHO]] as const) {
    const ed = await patch(db, "u-v", id, { conteudo });
    assert.equal(ed.status, 403);
    assert.equal(ed.body.error, mensagem);
  }
  assert.equal(JSON.stringify(proposta(db, id)), antes, "nada foi gravado");
  // Prévia: mesma regra.
  assert.equal((await previa(db, "u-v", manual)).status, 403);
  assert.equal((await previa(db, "u-v", ganho)).status, 403);
  // Quem não é diretoria edita normalmente o que não é preço manual/ganho.
  assert.equal((await patch(db, "u-v", id, { conteudo: conteudoTs({ servicos: [servico({ nome: "Outro nome" })] }) })).status, 200);
}));

await caso("a DIRETORIA informa preço manual e ganho: o servidor aplica (preço manual vale; o ganho da proposta substitui o padrão), o detalhe mostra o calculado e o manual, e a auditoria registra quem e o quê", async () => semChave(async () => {
  const db = novoDb();
  const manual = await criar(db, "u-g", { conteudo: conteudoTs({ servicos: [servico({ preco_manual_centavos: 700000, justificativa_preco_manual: "Contrato anual" })] }) });
  assert.equal(manual.status, 201, JSON.stringify(manual.body));
  const d = await detalhe(db, "u-g", manual.body.data.id);
  const s = d.body.planilhaTs.planilha.servicos[0];
  assert.deepEqual([s.preco_calculado_centavos, s.preco_manual_centavos, s.preco_centavos], [PRECO, 700000, 700000]);
  assert.equal(d.body.planilhaTs.planilha.total_mensal_centavos, 700000);
  const ganho = await criar(db, "u-g", { conteudo: conteudoTs({ ganho_bp: 4000 }) });
  assert.equal(ganho.status, 201);
  const di = await detalhe(db, "u-g", ganho.body.data.id);
  assert.equal(di.body.planilhaTs.planilha.total_mensal_centavos, precoDe(CUSTO, 4000), "ganho de 40% no lugar do padrão de 30%");
  assert.equal(di.body.planilhaTs.planilha.ganho_bp, 4000);
  // Auditoria: sem dados pessoais, só o que foi autorizado.
  const a = db.tabelas.audit_logs.filter((x: any) => x.acao === "proposta_ts_autorizacao");
  assert.equal(a.length, 2);
  assert.deepEqual({ usuario_id: a[0].usuario_id, entidade: a[0].entidade, entidade_id: a[0].entidade_id }, { usuario_id: "u-g", entidade: "propostas", entidade_id: manual.body.data.id });
  assert.deepEqual({ evento: a[0].detalhes.evento, preco_manual: a[0].detalhes.preco_manual, ganho: a[0].detalhes.ganho_bp, liberado: a[0].detalhes.ganho_abaixo_liberado }, { evento: "criada", preco_manual: true, ganho: null, liberado: false });
  assert.deepEqual({ preco_manual: a[1].detalhes.preco_manual, ganho: a[1].detalhes.ganho_bp }, { preco_manual: false, ganho: 4000 });
  const json = JSON.stringify(db.tabelas.audit_logs);
  for (const pessoal of ["g@salmazos", "Gestora Teste", "99999", "ZZTEST"]) assert.ok(!json.includes(pessoal), `auditoria traz ${pessoal}`);
  // Uma proposta comum não gera auditoria de autorização.
  const comum = await criar(db, "u-g");
  assert.equal(comum.status, 201);
  assert.equal(db.tabelas.audit_logs.filter((x: any) => x.acao === "proposta_ts_autorizacao").length, 2);
}));

await caso("privilegiosTsViolados (puro): quem não é diretoria pode MANTER o preço manual/ganho que a diretoria já gravou, mas não informar, mudar nem remover", () => {
  const base = conteudoTsSchema.parse(conteudoTs());
  const comManual = conteudoTsSchema.parse(conteudoTs({ servicos: [servico({ preco_manual_centavos: 700000 })], ganho_bp: 4000 }));
  assert.equal(privilegiosTsViolados(base, null, false), null);
  assert.equal(privilegiosTsViolados(comManual, comManual, false), null, "manter igual não é violação");
  assert.equal(privilegiosTsViolados(comManual, base, false), MSG_SO_DIRETORIA_PRECO_MANUAL);
  assert.equal(privilegiosTsViolados(conteudoTsSchema.parse(conteudoTs({ ganho_bp: 4000 })), base, false), MSG_SO_DIRETORIA_GANHO);
  assert.equal(privilegiosTsViolados(base, comManual, false), MSG_SO_DIRETORIA_PRECO_MANUAL, "remover também é mudar");
  assert.equal(privilegiosTsViolados(comManual, base, true), null);
  assert.equal(privilegiosTsViolados(comManual, null, true), null);
});

// ── 4) Ganho mínimo ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const PAR_ABAIXO: ParametrosTs = { ...PAR_PRECO, ganho_minimo_bp: 3500 }; // padrão 30% < mínimo 35%

await caso("GANHO MÍNIMO: abaixo do mínimo, quem não é gestor é bloqueado (422, sem número na mensagem); o gestor só libera COM justificativa (422 sem ela); liberada, grava e audita quem liberou e por quê", async () => comChaves(async () => {
  const db = novoDb(PAR_ABAIXO);
  const v = await criar(db, "u-v", {}, EMP);
  assert.equal(v.status, 422);
  assert.match(v.body.error, /abaixo do mínimo definido pela diretoria \(Serviço 1 – Limpeza e conservação\)\. Só a diretoria pode liberar/);
  assert.doesNotMatch(v.body.error, /ganho|%|\d{3,}/i);
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(unico(db), SEMENTE);
  const jv = await criar(db, "u-v", { conteudo: conteudoTs({ justificativa_ganho_minimo: "Eu libero" }) }, EMP);
  assert.equal(jv.status, 422, "justificativa de quem não é gestor não libera nada");
  for (const justificativa of [undefined, "", "   "]) {
    const g = await criar(db, "u-g", { conteudo: conteudoTs({ justificativa_ganho_minimo: justificativa }) });
    assert.equal(g.status, 422, String(justificativa));
    assert.match(g.body.error, /Informe a justificativa para liberar/);
  }
  // Justificativa só com caracteres que o PDF não imprime não vale: recusada na validação do conteúdo (400).
  const emoji = await criar(db, "u-g", { conteudo: conteudoTs({ justificativa_ganho_minimo: "😀" }) });
  assert.equal(emoji.status, 400);
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal((await previa(db, "u-g", conteudoTs())).body.data.ganho.exige_justificativa, true);
  const ok = await criar(db, "u-g", { conteudo: conteudoTs({ justificativa_ganho_minimo: "Cliente estratégico: ganho reduzido aprovado" }) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const a = db.tabelas.audit_logs.filter((x: any) => x.acao === "proposta_ts_autorizacao");
  assert.equal(a.length, 1);
  assert.equal(a[0].usuario_id, "u-g");
  assert.deepEqual({ liberado: a[0].detalhes.ganho_abaixo_liberado, servicos: a[0].detalhes.servicos_abaixo_do_ganho, justificativa: a[0].detalhes.justificativa, numero: a[0].detalhes.numero },
    { liberado: true, servicos: [0], justificativa: "Cliente estratégico: ganho reduzido aprovado", numero: ok.body.data.numero });
  // Ganho informado pelo gestor abaixo do mínimo segue a mesma regra.
  const dentro = novoDb();
  const baixo = await criar(dentro, "u-g", { conteudo: conteudoTs({ ganho_bp: 1000 }) });
  assert.equal(baixo.status, 422);
  assert.match(baixo.body.error, /Informe a justificativa para liberar/);
  // A justificativa sobre um ganho dentro do mínimo não libera nada e não gera auditoria.
  const sem = await criar(dentro, "u-g", { conteudo: conteudoTs({ justificativa_ganho_minimo: "desnecessária" }) });
  assert.equal(sem.status, 201);
  assert.deepEqual(dentro.tabelas.audit_logs, []);
}));

await caso("GANHO MÍNIMO com PREÇO MANUAL: manual abaixo do preço do ganho mínimo pede justificativa do gestor; manual dentro passa; o gestor vê na prévia", async () => semChave(async () => {
  const db = novoDb();
  const abaixo = conteudoTs({ servicos: [servico({ preco_manual_centavos: 640000 })] }); // ≈ 19,45% < 20%
  const r = await criar(db, "u-g", { conteudo: abaixo });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /Informe a justificativa para liberar/);
  const p = await previa(db, "u-g", abaixo);
  assert.equal(p.status, 200);
  assert.deepEqual(p.body.data.ganho, { abaixo: [0], exige_justificativa: true });
  assert.equal(p.body.data.planilha.servicos[0].abaixo_ganho_minimo, true);
  assert.ok(p.body.data.planilha.servicos[0].ganho_real_bp < 2000);
  const ok = await criar(db, "u-g", { conteudo: conteudoTs({ servicos: [servico({ preco_manual_centavos: 640000 })], justificativa_ganho_minimo: "Preço fechado em reunião" }) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const dentro = await criar(db, "u-g", { conteudo: conteudoTs({ servicos: [servico({ preco_manual_centavos: 700000 })] }) });
  assert.equal(dentro.status, 201, "manual acima do mínimo não pede justificativa");
}));

// ── 5) Snapshot, revisão e percentuais mudando depois ───────────────────────────────────────────────────────────────────────────────────────

await caso("REVISÃO de proposta enviada: nova linha em proposta_revisoes (a anterior intacta), snapshot com os percentuais vigentes usados, valor estimado e histórico acompanham; sem ganho configurado recusa e não grava", async () => semChave(async () => {
  const db = novoDb();
  const { id, snap0 } = semearEnviada(db);
  assert.equal(snap0.total_mensal_centavos, PRECO);
  const rev0Antes = JSON.stringify(db.tabelas.proposta_revisoes[0]);
  const novo = conteudoTs({ servicos: [servico({ postos: [posto({ salario_centavos: 200000 })] })] });
  const r = await patch(db, "u-g", id, { conteudo: novo });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(proposta(db, id).revisao_atual, 1);
  assert.equal(db.tabelas.proposta_revisoes.length, 2, "uma LINHA NOVA, nunca edição da anterior");
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[0]), rev0Antes, "a revisão anterior continua exatamente igual");
  const rev1 = db.tabelas.proposta_revisoes[1];
  assert.equal(rev1.revisao, 1);
  assert.equal(rev1.template_versao, TEMPLATE_VERSAO_TS);
  const snap = snapshotTsSchema.parse(rev1.conteudo);
  assert.equal(snap.modelo, "TS");
  assert.equal(snap.revisao, 1);
  assert.equal(snap.data_emissao, HOJE);
  assert.equal(snap.parametros.vigente_desde, "2026-01-01");
  assert.equal(snap.parametros.id, "pts-1");
  for (const k of Object.keys(PAR_PRECO) as (keyof ParametrosTs)[]) assert.equal(snap.parametros[k], PAR_PRECO[k], `parâmetro ${k} congelado no snapshot`);
  assert.equal(snap.servicos[0].postos[0].salario_centavos, 200000);
  assert.ok(snap.total_mensal_centavos > PRECO);
  assert.equal(snap.liberacao_ganho, null);
  assert.equal(snap.ganho_bp, 3000);
  assert.equal(proposta(db, id).valor_estimado, snap.total_mensal_centavos / 100, "o valor estimado acompanha a revisão");
  const hist = db.tabelas.proposta_historico.filter((h: any) => h.proposta_id === id);
  assert.match(hist[hist.length - 1].observacao, /Revisão 1 emitida\. Valor: R\$\s6\.965,05 → R\$\s.* \(Rev\. 1\)\./);
  // Detalhe: planilha do snapshot gravado.
  const d = await detalhe(db, "u-g", id);
  assert.equal(d.body.planilhaTs.origem, "revisao");
  assert.equal(d.body.planilhaTs.planilha.total_mensal_centavos, snap.total_mensal_centavos);
  // Sem ganho configurado: 422 e nenhuma revisão nova.
  db.tabelas.proposta_ts_parametros.push(seedParametros(PAR_ZERADOS, { id: "pts-0", vigente_desde: HOJE, created_at: "2026-11-25T09:00:00Z" }));
  const antes = JSON.stringify([proposta(db, id), db.tabelas.proposta_revisoes, db.tabelas.proposta_historico]);
  const sem = await patch(db, "u-g", id, { conteudo: conteudoTs() });
  assert.equal(sem.status, 422); assert.equal(sem.body.error, MSG_GANHO_TS_NAO_CONFIGURADO);
  assert.equal(JSON.stringify([proposta(db, id), db.tabelas.proposta_revisoes, db.tabelas.proposta_historico]), antes);
}));

await caso("MUDAR OS PERCENTUAIS DEPOIS não altera a proposta antiga: a diretoria grava nova vigência; o detalhe e a revisão já gravada seguem iguais; a PRÓXIMA revisão usa os novos percentuais", async () => semChave(async () => {
  const db = novoDb();
  const { id } = semearEnviada(db);
  const r1 = await patch(db, "u-g", id, { conteudo: conteudoTs({ servicos: [servico({ postos: [posto({ salario_centavos: 190000 })] })] }) });
  assert.equal(r1.status, 200);
  const rev1Antes = JSON.stringify(db.tabelas.proposta_revisoes[1]);
  const d1 = await detalhe(db, "u-g", id);
  const total1 = d1.body.planilhaTs.planilha.total_mensal_centavos;
  // A diretoria grava uma vigência NOVA com ganho padrão maior (vale a partir de hoje).
  const nova = await gravarParametros(db, "u-g", { vigente_desde: HOJE, ...PAR_PRECO, ganho_padrao_bp: 4500 });
  assert.equal(nova.status, 201, JSON.stringify(nova.body));
  const d2 = await detalhe(db, "u-g", id);
  assert.equal(d2.body.planilhaTs.origem, "revisao");
  assert.equal(d2.body.planilhaTs.planilha.total_mensal_centavos, total1, "o total da proposta antiga não mudou");
  assert.equal(d2.body.planilhaTs.planilha.vigente_desde, "2026-01-01", "continua mostrando a vigência usada");
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[1]), rev1Antes, "a revisão gravada não foi tocada");
  assert.equal(db.tabelas.proposta_revisoes.length, 2);
  // Próxima revisão: percentuais novos.
  const r2 = await patch(db, "u-g", id, { conteudo: conteudoTs({ servicos: [servico({ postos: [posto({ salario_centavos: 190000 })] })] }), validade_dias: 20 });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const snap2 = snapshotTsSchema.parse(db.tabelas.proposta_revisoes[2].conteudo);
  assert.equal(snap2.parametros.vigente_desde, HOJE);
  assert.equal(snap2.parametros.ganho_padrao_bp, 4500);
  assert.equal(snap2.ganho_bp, 4500);
  assert.ok(snap2.total_mensal_centavos > total1, "mesmo conteúdo, ganho maior, preço maior");
  assert.equal(JSON.stringify(db.tabelas.proposta_revisoes[1]), rev1Antes, "a Rev. 1 continua intacta");
  // Uma proposta NOVA nasce com os percentuais novos.
  const nv = await criar(db, "u-g");
  assert.equal((await detalhe(db, "u-g", nv.body.data.id)).body.planilhaTs.planilha.vigente_desde, HOJE);
}));

await caso("snapshot grava QUEM liberou o ganho abaixo do mínimo: o gestor que libera numa revisão aparece (id, nome, justificativa, serviços, quando) no snapshot", async () => semChave(async () => {
  const db = novoDb();
  const { id } = semearEnviada(db);
  db.tabelas.proposta_ts_parametros.push(seedParametros(PAR_ABAIXO, { id: "pts-min", vigente_desde: HOJE, created_at: "2026-11-25T09:00:00Z" }));
  const sem = await patch(db, "u-g", id, { conteudo: conteudoTs() });
  assert.equal(sem.status, 422);
  assert.equal(db.tabelas.proposta_revisoes.length, 1);
  const ok = await patch(db, "u-g", id, { conteudo: conteudoTs({ justificativa_ganho_minimo: "Aprovado pela diretoria em reunião" }) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const snap = snapshotTsSchema.parse(db.tabelas.proposta_revisoes[1].conteudo);
  assert.equal(snap.liberacao_ganho?.justificativa, "Aprovado pela diretoria em reunião");
  assert.equal(snap.liberacao_ganho?.liberado_por_id, G);
  assert.equal(snap.liberacao_ganho?.liberado_por_nome, "Gestora Teste");
  assert.deepEqual(snap.liberacao_ganho?.servicos, [0]);
  assert.ok(!Number.isNaN(Date.parse(snap.liberacao_ganho?.liberado_em ?? "")));
  assert.equal(snap.servicos[0].abaixo_ganho_minimo, true);
  const a = db.tabelas.audit_logs.filter((x: any) => x.acao === "proposta_ts_autorizacao");
  assert.equal(a.length, 1);
  assert.equal(a[0].detalhes.evento, "revisao");
  assert.equal(a[0].detalhes.justificativa, "Aprovado pela diretoria em reunião");
}));

// ── 6) Acesso e unidade ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("TS segue a trava do MOT (MODELOS_ATIVOS = [RS]): empresa REAL → 400 'Modelo ainda não disponível.' até para o gestor; vendedor → 400 em empresa real e 404 em empresa de teste; nada é criado", async () => semChave(async () => {
  const db = novoDb();
  const gestorReal = await criar(db, "u-g", {}, EMP);
  assert.equal(gestorReal.status, 400); assert.equal(gestorReal.body.error, MENSAGEM_MODELO_INDISPONIVEL);
  const vendedorReal = await criar(db, "u-v", {}, EMP);
  assert.equal(vendedorReal.status, 400); assert.equal(vendedorReal.body.error, MENSAGEM_MODELO_INDISPONIVEL);
  const vendedorTeste = await criar(db, "u-v", {}, EMP_TESTE);
  assert.equal(vendedorTeste.status, 404, "a empresa de teste nem existe para o vendedor");
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc.startsWith("criar_proposta")).length, 0);
  assert.equal(unico(db), SEMENTE);
  // Prévia: o vendedor não usa o TS.
  const p = await previa(db, "u-v", conteudoTs());
  assert.equal(p.status, 400); assert.equal(p.body.error, MENSAGEM_MODELO_INDISPONIVEL);
  // O ÚNICO caminho é gestor + empresa de teste.
  assert.equal((await criar(db, "u-g", {}, EMP_TESTE)).status, 201);
  const fonte = fs.readFileSync("src/lib/propostas.ts", "utf8");
  assert.match(fonte, /export const MODELOS_ATIVOS: ModeloProposta\[\] = \["RS"\];/);
}));

await caso("OUTRA UNIDADE = 404: criar em empresa de outra unidade; ver, editar e mudar situação de proposta de outra unidade (vendedor)", async () => semChave(async () => {
  const db = novoDb();
  const alheia = await criar(db, "u-g", {}, EMP_SBC);
  assert.equal(alheia.status, 404);
  assert.match(alheia.body.error, /Empresa não encontrada na Carteira da sua unidade/);
  assert.equal(db.tabelas.propostas.length, 0);
  const { id } = semearEnviada(db);
  proposta(db, id).unidade_id = U2; proposta(db, id).vendedor_id = VSBC; proposta(db, id).teste = false;
  for (const r of [await detalhe(db, "u-v", id), await patch(db, "u-v", id, { conteudo: conteudoTs() }), await situacao(db, "u-v", id, { para: "cancelada" }), await pdf(db, "u-v", id)]) {
    assert.equal(r.status, 404);
  }
  assert.equal(db.tabelas.proposta_revisoes.length, 1);
}));

await caso("outros modelos intactos: o detalhe de R&S e de MOT não ganha planilhaTs; o do TS não ganha planilhaMot", async () => comChaves(async () => {
  const db = novoDb();
  const rs = await criar(db, "u-v", { conteudo: {} }, EMP, "RS");
  assert.equal(rs.status, 201, JSON.stringify(rs.body));
  const dRs = await detalhe(db, "u-v", rs.body.data.id);
  assert.ok(!("planilhaTs" in dRs.body) && !("planilhaMot" in dRs.body));
  const ts = await criar(db, "u-v", {}, EMP);
  const dTs = await detalhe(db, "u-v", ts.body.data.id);
  assert.ok("planilhaTs" in dTs.body && !("planilhaMot" in dTs.body));
  assert.ok(!("ganho_real_bp" in dTs.body.planilhaTs.planilha.servicos[0]), "o ganho só aparece para o gestor");
}, { HARNESS_PROPOSTA_TS: "1" }));

// ── 7) Numeração (contador único) ────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("NUMERAÇÃO: TS, R&S e MOT dividem o contador único (72, 73, 74...); o TS de teste tem sequência própria e não gasta o contador real", async () => comChaves(async () => {
  const db = novoDb();
  const rs = await criar(db, "u-v", { conteudo: {} }, EMP, "RS");
  const mot = await criar(db, "u-v", {}, EMP, "MOT");
  const ts = await criar(db, "u-v", {}, EMP, "TS");
  const rs2 = await criar(db, "u-v", { conteudo: {} }, EMP, "RS");
  assert.deepEqual([rs.status, mot.status, ts.status, rs2.status], [201, 201, 201, 201], JSON.stringify([rs.body, mot.body, ts.body]));
  assert.deepEqual([rs.body.data.numero, mot.body.data.numero, ts.body.data.numero, rs2.body.data.numero], [`VE-0072/${AA}`, `VE-MOT-0073/${AA}`, `VE-TS-0074/${AA}`, `VE-0075/${AA}`]);
  assert.deepEqual([rs, mot, ts, rs2].map((r) => r.body.data.sequencial), [72, 73, 74, 75]);
  assert.equal(unico(db), 75);
  const t1 = await criar(db, "u-g", {}, EMP_TESTE);
  const t2 = await criar(db, "u-g", {}, EMP_TESTE);
  assert.deepEqual([t1.body.data.numero, t2.body.data.numero], [`TESTE-TS-0001/${AA}`, `TESTE-TS-0002/${AA}`]);
  assert.equal(unico(db), 75, "o contador real não andou com as propostas de teste");
  assert.equal(new Set(db.tabelas.propostas.filter((p: any) => !p.teste).map((p: any) => p.sequencial)).size, 4);
}, { HARNESS_PROPOSTA_TS: "1", HARNESS_PROPOSTA_MOT: "1" }));

await caso("FALHA NO INSERT não consome o contador: o número seguinte continua sendo o que seria; nada é gravado nem auditado", async () => comChaves(async () => {
  const db = novoDb();
  db.simularFalhaInsert = true;
  const falha = await criar(db, "u-v", {}, EMP);
  assert.equal(falha.status, 500);
  assert.match(falha.body.error, /Não foi possível criar a proposta/, "mesma mensagem do R&S e do MOT");
  assert.equal(unico(db), SEMENTE);
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.tabelas.proposta_historico.length, 0);
  assert.deepEqual(db.tabelas.audit_logs, []);
  db.simularFalhaInsert = false;
  const ok = await criar(db, "u-v", {}, EMP);
  assert.equal(ok.body.data.numero, `VE-TS-0072/${AA}`, "sem buraco no contador");
}));

// ── 8) Marcar como enviada: bloqueado até existir o PDF ─────────────────────────────────────────────────────────────────────────────────

await caso("MARCAR COMO ENVIADA está BLOQUEADO para o TS (409 'PDF da Terceirização ainda não disponível'): nada é gravado (situação, revisão, histórico, valor, Funil); cancelar o rascunho continua possível; o PDF também responde 409", async () => semChave(async () => {
  const db = novoDb();
  const id = (await criar(db, "u-g")).body.data.id as string;
  const antes = JSON.stringify({ p: db.tabelas.propostas, r: db.tabelas.proposta_revisoes, h: db.tabelas.proposta_historico, o: db.tabelas.oportunidades, l: db.tabelas.lembretes, a: db.tabelas.audit_logs });
  db.consultas.length = 0;
  const env = await situacao(db, "u-g", id, { para: "enviada", valor_estimado: 5000 });
  assert.equal(env.status, 409);
  assert.equal(env.body.error, "PDF da Terceirização ainda não disponível");
  assert.equal(MSG_PDF_TS_INDISPONIVEL, "PDF da Terceirização ainda não disponível");
  assert.deepEqual(escritas(db), [], "nenhuma escrita no banco");
  assert.equal(JSON.stringify({ p: db.tabelas.propostas, r: db.tabelas.proposta_revisoes, h: db.tabelas.proposta_historico, o: db.tabelas.oportunidades, l: db.tabelas.lembretes, a: db.tabelas.audit_logs }), antes);
  assert.equal(proposta(db, id).situacao, "rascunho");
  assert.equal(proposta(db, id).valor_estimado, null);
  // O PDF do TS também não existe ainda (409, sem montar nada).
  const p = await pdf(db, "u-g", id);
  assert.equal(p.status, 409);
  const { id: enviada } = semearEnviada(db);
  assert.equal((await pdf(db, "u-g", enviada)).status, 409);
  // Cancelar continua funcionando (só o envio está bloqueado).
  const cancelada = await situacao(db, "u-g", id, { para: "cancelada" });
  assert.equal(cancelada.status, 200);
  assert.equal(proposta(db, id).situacao, "cancelada");
  const fonte = fs.readFileSync("src/lib/propostaTs.ts", "utf8");
  assert.match(fonte, /export const PDF_TS_DISPONIVEL = false;/);
}));

// ── 9) Percentuais (diretoria) ───────────────────────────────────────────────────────────────────────────────────────────────────────

const PARAMS_NOVOS = (extra: Record<string, unknown> = {}) => ({ vigente_desde: mais(10), ...PAR_PRECO, ganho_padrao_bp: 3500, ...extra });

await caso("PERCENTUAIS: só a diretoria grava (403 para os demais, nada gravado, sem login 401); leitura só de quem pode usar o TS (gestor); a rota só tem GET e POST (nenhuma edição de linha antiga)", async () => semChave(async () => {
  const db = novoDb();
  assert.deepEqual(Object.keys(rotaParametros).filter((k) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(k)).sort(), ["GET", "POST"]);
  assert.equal((await gravarParametros(db, null, PARAMS_NOVOS())).status, 401);
  assert.equal((await lerParametros(db, null)).status, 401);
  const v = await gravarParametros(db, "u-v", PARAMS_NOVOS());
  assert.equal(v.status, 403); assert.equal(v.body.error, "Só a diretoria altera os percentuais da Terceirização.");
  assert.equal((await lerParametros(db, "u-v")).status, 403);
  assert.equal(db.tabelas.proposta_ts_parametros.length, 1);
  assert.deepEqual(db.tabelas.audit_logs, []);
  const lido = await lerParametros(db, "u-g");
  assert.equal(lido.status, 200);
  assert.equal(lido.body.vigentes.vigente_desde, "2026-01-01");
  assert.equal(lido.body.vigentes.ganho_padrao_bp, 3000);
  assert.equal(lido.body.historico.length, 1);
  // A diretoria grava: NOVA linha, com autor; a antiga fica intacta; auditoria sem dado pessoal.
  const antiga = JSON.stringify(db.tabelas.proposta_ts_parametros[0]);
  const nova = await gravarParametros(db, "u-g", PARAMS_NOVOS());
  assert.equal(nova.status, 201, JSON.stringify(nova.body));
  assert.equal(db.tabelas.proposta_ts_parametros.length, 2);
  assert.equal(JSON.stringify(db.tabelas.proposta_ts_parametros[0]), antiga, "a linha antiga não é editada");
  assert.deepEqual({ vigente_desde: nova.body.data.vigente_desde, ganho: nova.body.data.ganho_padrao_bp, sobre: nova.body.data.encargos_sobre_adicionais, por: nova.body.data.alterado_por }, { vigente_desde: mais(10), ganho: 3500, sobre: true, por: G });
  for (const k of COLUNAS_SEM_USO_TS) assert.equal(nova.body.data[k], 0, `${k}: coluna do modelo antigo gravada com 0`);
  const a = db.tabelas.audit_logs;
  assert.equal(a.length, 1);
  assert.deepEqual({ acao: a[0].acao, entidade: a[0].entidade, entidade_id: a[0].entidade_id, usuario_id: a[0].usuario_id }, { acao: "parametros_ts_alterados", entidade: "proposta_ts_parametros", entidade_id: nova.body.data.id, usuario_id: "u-g" });
  assert.equal(a[0].detalhes.antes.ganho_padrao_bp, 3000);
  assert.equal(a[0].detalhes.depois.ganho_padrao_bp, 3500);
  assert.equal(a[0].detalhes.depois.encargos_sobre_adicionais, true);
  assert.equal(a[0].detalhes.vigente_desde, mais(10));
  assert.ok(!JSON.stringify(a).includes("Gestora") && !JSON.stringify(a).includes("@"), "sem dados pessoais");
  // Hoje ainda vale a antiga; só a partir da data nova vale a nova.
  assert.equal((await lerParametros(db, "u-g")).body.vigentes.ganho_padrao_bp, 3000);
}));

await caso("PERCENTUAIS: validação — INSS, FGTS e multa de 0 a 10000 e ganhos de 0 a 100000 pontos-base inteiros, interruptor obrigatório, data válida e NÃO retroativa, uma vigência por data; colunas antigas vindas no corpo são ignoradas; nada é gravado nos recusados", async () => semChave(async () => {
  const db = novoDb();
  const recusa = async (corpo: unknown, status: number, trecho: RegExp) => {
    const r = await gravarParametros(db, "u-g", corpo);
    assert.equal(r.status, status, JSON.stringify(r.body));
    assert.match(r.body.error, trecho);
    assert.equal(db.tabelas.proposta_ts_parametros.length, 1, "nada gravado");
  };
  await recusa(PARAMS_NOVOS({ ganho_padrao_bp: 12.5 }), 400, /inteiro de pontos-base/);
  await recusa(PARAMS_NOVOS({ ganho_padrao_bp: "300" }), 400, /pontos-base/);
  await recusa(PARAMS_NOVOS({ ganho_minimo_bp: -1 }), 400, /não pode ser negativo/);
  await recusa(PARAMS_NOVOS({ ganho_padrao_bp: 100001 }), 400, /passa do limite/);
  await recusa(PARAMS_NOVOS({ inss_bp: 10001 }), 400, /passa do limite/);
  await recusa(PARAMS_NOVOS({ fgts_bp: null }), 400, /FGTS/);
  const { ganho_minimo_bp: _m, ...semUm } = PARAMS_NOVOS();
  await recusa(semUm, 400, /Ganho mínimo/);
  const { encargos_sobre_adicionais: _e, ...semInterruptor } = PARAMS_NOVOS();
  await recusa(semInterruptor, 400, /encargos incidem/);
  await recusa(PARAMS_NOVOS({ ganho_padrao_bp: 3000, ganho_minimo_bp: 3001 }), 400, /^O ganho mínimo não pode ser maior que o ganho padrão\.$/);
  await recusa(PARAMS_NOVOS({ ganho_padrao_bp: 0, ganho_minimo_bp: 100 }), 400, /ganho mínimo não pode ser maior/);
  await recusa(PARAMS_NOVOS({ vigente_desde: "2026-02-30" }), 400, /AAAA-MM-DD/);
  await recusa(PARAMS_NOVOS({ vigente_desde: "amanhã" }), 400, /AAAA-MM-DD/);
  await recusa(PARAMS_NOVOS({ vigente_desde: calcularValidadeAte(HOJE, -1) }), 400, /antes de hoje/);
  await recusa(PARAMS_NOVOS({ vigente_desde: "2026-01-01" }), 400, /antes de hoje/);
  assert.equal((await gravarParametros(db, "u-g", "texto")).status, 400);
  assert.equal((await gravarParametros(db, "u-g", [])).status, 400);
  assert.deepEqual(db.tabelas.audit_logs, []);
  // No limite passa, as colunas antigas enviadas são ignoradas (gravadas com 0); repetir a data é 409.
  const noLimite = await gravarParametros(db, "u-g", PARAMS_NOVOS({ ganho_padrao_bp: 100000, encargos_sobre_adicionais: false, lucro_bp: 900, iss_bp: 500 }));
  assert.equal(noLimite.status, 201, JSON.stringify(noLimite.body));
  assert.deepEqual([noLimite.body.data.lucro_bp, noLimite.body.data.iss_bp, noLimite.body.data.encargos_sobre_adicionais], [0, 0, false]);
  await recusa2(await gravarParametros(db, "u-g", PARAMS_NOVOS()), 409);
  function recusa2(r: Chamada, status: number) { assert.equal(r.status, status); assert.match(r.body.error, /Já existe uma vigência com esta data/); }
  assert.equal(db.tabelas.proposta_ts_parametros.length, 2);
  // Hoje (vigente_desde = hoje) é permitido.
  assert.equal((await gravarParametros(db, "u-g", PARAMS_NOVOS({ vigente_desde: HOJE, ganho_padrao_bp: 4000 }))).status, 201);
  // Corrida no banco (índice único de vigência): a segunda inserção na mesma data vira o mesmo 409.
  db.unicos = { proposta_ts_parametros: ["vigente_desde"] };
  const antesCorrida = db.tabelas.proposta_ts_parametros.length;
  db.ganchos = { "proposta_ts_parametros.select": async () => {} };
  const dup = await gravarParametros(db, "u-g", PARAMS_NOVOS({ vigente_desde: mais(40) }));
  assert.equal(dup.status, 201);
  db.ganchos = { "proposta_ts_parametros.insert": async () => { db.tabelas.proposta_ts_parametros.push(seedParametros(PAR_PRECO, { id: "corrida", vigente_desde: mais(50) })); } };
  const corrida = await gravarParametros(db, "u-g", PARAMS_NOVOS({ vigente_desde: mais(50) }));
  assert.equal(corrida.status, 409);
  assert.equal(db.tabelas.proposta_ts_parametros.length, antesCorrida + 2, "só as linhas esperadas");
}));

await caso("RÓTULO de adicional/benefício 'outro': grava e aparece na planilha; sem rótulo, com HTML ou acima de 60 caracteres recusa; tipo fixo ignora o rótulo; o cálculo e o caso de referência não mudam", async () => semChave(async () => {
  const db = novoDb();
  const comItens = (adicionais: unknown[], beneficios: unknown[]) => conteudoTs({ servicos: [servico({ postos: [posto({ adicionais, beneficios })] })] });
  const base = posto();
  const rotulos = (r: Chamada) => r.body.data.planilha.servicos[0].postos[0].linhas.map((l: any) => l.rotulo);
  const custo = (r: Chamada) => linha(r.body.data.planilha, "custo_unitario");
  // Gold test sem nenhum 'outro': inalterado.
  const ouro = await previa(db, "u-g", conteudoTs());
  assert.equal(custo(ouro), CUSTO);
  assert.equal(ouro.body.data.planilha.total_mensal_centavos, PRECO);
  assert.equal(linha(ouro.body.data.planilha, "encargos"), ENCARGOS);
  // 'outro' com rótulo: o texto vai para a linha; o valor é o mesmo de um tipo fixo (rótulo não entra no cálculo).
  const outroAd = await previa(db, "u-g", comItens([...base.adicionais, { tipo: "outro", rotulo: "  Adicional de risco  ", modo: "valor", valor_centavos: 10000 }], base.beneficios));
  assert.equal(outroAd.status, 200, JSON.stringify(outroAd.body));
  assert.ok(rotulos(outroAd).includes("Adicional de risco"), rotulos(outroAd).join("|"));
  assert.ok(!rotulos(outroAd).includes("Outro adicional"));
  const fixoAd = await previa(db, "u-g", comItens([...base.adicionais, { tipo: "gratificacao", modo: "valor", valor_centavos: 10000 }], base.beneficios));
  assert.equal(custo(outroAd), custo(fixoAd));
  assert.equal(outroAd.body.data.planilha.total_mensal_centavos, fixoAd.body.data.planilha.total_mensal_centavos);
  assert.deepEqual(rotulos(fixoAd).filter((r: string) => /Adicional de risco/.test(r)), []);
  const pct = await previa(db, "u-g", comItens([...base.adicionais, { tipo: "outro", rotulo: "Adicional de risco", modo: "percentual", percentual_bp: 1000 }], base.beneficios));
  assert.equal(pct.status, 200);
  assert.ok(rotulos(pct).includes("Adicional de risco"));
  const outroBen = await previa(db, "u-g", comItens(base.adicionais, [...base.beneficios, { tipo: "outro", rotulo: "Plano odontológico", valor_centavos: 5000 }]));
  const fixoBen = await previa(db, "u-g", comItens(base.adicionais, [...base.beneficios, { tipo: "cesta_basica", valor_centavos: 5000 }]));
  assert.equal(outroBen.status, 200);
  assert.ok(rotulos(outroBen).includes("Plano odontológico"));
  assert.equal(custo(outroBen), custo(fixoBen));
  // 'outro' sem rótulo (ausente, vazio, só espaços) = erro claro.
  for (const rotulo of [undefined, "", "   ", null, 7]) {
    const ad = await previa(db, "u-g", comItens([{ tipo: "outro", ...(rotulo === undefined ? {} : { rotulo }), modo: "valor", valor_centavos: 10000 }], []));
    assert.equal(ad.status, 400, JSON.stringify(rotulo));
    assert.match(ad.body.error, /Descreva o adicional escolhido como "Outro"/);
    const be = await previa(db, "u-g", comItens([], [{ tipo: "outro", ...(rotulo === undefined ? {} : { rotulo }), valor_centavos: 10000 }]));
    assert.equal(be.status, 400);
    assert.match(be.body.error, /Descreva o benefício escolhido como "Outro"/);
  }
  // HTML, mais de 60 caracteres e quebra de linha.
  const html = await previa(db, "u-g", comItens([{ tipo: "outro", rotulo: "<b>risco</b>", modo: "valor", valor_centavos: 10000 }], []));
  assert.equal(html.status, 400);
  assert.match(html.body.error, /não pode ter HTML/);
  assert.equal((await previa(db, "u-g", comItens([], [{ tipo: "outro", rotulo: "<script>x</script>", valor_centavos: 10000 }]))).status, 400);
  const longo = await previa(db, "u-g", comItens([{ tipo: "outro", rotulo: "a".repeat(61), modo: "valor", valor_centavos: 10000 }], []));
  assert.equal(longo.status, 400);
  assert.match(longo.body.error, /vai até 60 caracteres/);
  assert.equal((await previa(db, "u-g", comItens([{ tipo: "outro", rotulo: "a".repeat(60), modo: "valor", valor_centavos: 10000 }], []))).status, 200);
  const quebra = await previa(db, "u-g", comItens([{ tipo: "outro", rotulo: "linha 1\nlinha 2", modo: "valor", valor_centavos: 10000 }], []));
  assert.equal(quebra.status, 400);
  assert.match(quebra.body.error, /uma linha só/);
  // Tipo fixo: o campo é ignorado (mesmo lixo/HTML), o rótulo continua vindo do tipo.
  const ign = await previa(db, "u-g", comItens([{ tipo: "insalubridade", rotulo: "<b>lixo</b>", modo: "valor", valor_centavos: 32420 }, base.adicionais[1]], [{ tipo: "vale_transporte", rotulo: "x".repeat(200), valor_centavos: 20000 }, base.beneficios[1], base.beneficios[2]]));
  assert.equal(ign.status, 200, JSON.stringify(ign.body));
  assert.equal(custo(ign), CUSTO);
  assert.ok(!rotulos(ign).some((r: string) => /lixo|xxxx/.test(r)));
  // Criar grava o rótulo e o detalhe devolve na planilha; proposta antiga (sem rótulo no conteúdo) segue no mesmo formato.
  const criada = await criar(db, "u-g", { conteudo: comItens([...base.adicionais, { tipo: "outro", rotulo: "Adicional de risco", modo: "valor", valor_centavos: 10000 }], base.beneficios) });
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  const id = criada.body.id ?? criada.body.data?.id;
  assert.match(JSON.stringify(proposta(db, id).conteudo), /Adicional de risco/);
  const d = await detalhe(db, "u-g", id);
  assert.ok(d.body.planilhaTs.planilha.servicos[0].postos[0].linhas.some((l: any) => l.rotulo === "Adicional de risco"));
  const recusada = await criar(db, "u-g", { conteudo: comItens([{ tipo: "outro", modo: "valor", valor_centavos: 10000 }], []) });
  assert.equal(recusada.status, 400);
  assert.match(recusada.body.error, /Descreva o adicional escolhido como "Outro"/);
}));

await caso("PRÉVIA: só leitura (nenhuma escrita), custo e ganho só para o gestor; sem login 401; sem conteúdo 400", async () => semChave(async () => {
  const db = novoDb();
  db.consultas.length = 0;
  const g = await previa(db, "u-g", conteudoTs());
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.deepEqual(escritas(db), []);
  assert.equal(g.body.data.planilha.total_mensal_centavos, PRECO);
  assert.equal(linha(g.body.data.planilha, "custo_unitario"), CUSTO);
  assert.deepEqual(g.body.data.ganho, { abaixo: [], exige_justificativa: false });
  assert.ok("ganho_real_bp" in g.body.data.planilha.servicos[0]);
  assert.doesNotMatch(JSON.stringify(g.body), /"(cobertura|iss|pis|cofins|irpj|csll|despesas|lucro|margem_minima)_bp"/);
  assert.equal(db.tabelas.propostas.length, 0);
  assert.equal(db.rpcChamadas.filter((c: any) => c.rpc.startsWith("criar_proposta")).length, 0);
  assert.equal((await previa(db, null, conteudoTs())).status, 401);
  const semCorpo = await chamar(db, "u-g", rotaPrevia.POST, { metodo: "POST" });
  assert.equal(semCorpo.status, 400);
  assert.equal((await previa(db, "u-g", {})).status, 400);
  const v = await comChaves(() => previa(db, "u-v", conteudoTs()));
  assert.equal(v.status, 200);
  assert.ok(!("ganho_real_bp" in v.body.data.planilha.servicos[0]), "o vendedor não vê o ganho");
}));

// ── 10) SIGILO: quem não é gestor/diretoria só vê preço ─────────────────────────────────────────────────────────────────────────────

// Nada de custo, encargos, linhas, ganho (nem mínimo) ou justificativa em RESPOSTA de cálculo. Do conteúdo, só o que o próprio vendedor digita.
const OCULTOS = /"(ganho_bp|ganho_padrao_bp|ganho_minimo_bp|ganho_real_bp|abaixo_ganho_minimo|justificativa_ganho_minimo|justificativa_preco_manual|liberacao_ganho|ganho|custo_unit_centavos|custo_posto_centavos|custo_centavos|custo_total_centavos|preco_calculado_centavos|preco_unit_centavos|linhas|encargos_sobre_adicionais|parametros)"/;
const QUALQUER_BP = /"[a-z_]*_bp"/;
const CONTEUDO_DA_DIRETORIA = () => conteudoTs({
  servicos: [servico({ preco_manual_centavos: 700000, justificativa_preco_manual: "Aprovada pela diretoria" })],
  ganho_bp: 4000,
  justificativa_ganho_minimo: "Aprovada pela diretoria",
});
function semearRascunhoDoVendedor(db: any, conteudo: Record<string, unknown>) {
  const id = crypto.randomUUID();
  db.tabelas.propostas.push({
    id, numero: `VE-TS-0090/${AA}`, modelo: "TS", ano: ANO, sequencial: 90, revisao_atual: 0, situacao: "rascunho", unidade_id: U, vendedor_id: V, empresa_visitada_id: EMP, oportunidade_id: null,
    cliente_nome: "ZZTEST Empresa Real", aos_cuidados: null, conteudo, template_versao: TEMPLATE_VERSAO_TS, validade_dias: 15, validade_ate: null, valor_estimado: null, enviada_em: null,
    created_at: "2026-11-20T10:00:00.000Z", updated_at: "2026-11-20T10:00:00.000Z", teste: false,
  });
  return id;
}

await caso("SIGILO (simulado com a chave do harness): o vendedor recebe SÓ o preço mensal por posto e o total em prévia, detalhe, criar, editar e situação — nada de custo, encargos, ganho, ganho mínimo ou justificativa; gestor e diretoria recebem", async () => comChaves(async () => {
  const db = novoDb();
  const id = semearRascunhoDoVendedor(db, CONTEUDO_DA_DIRETORIA());
  const { id: idEnviada } = semearEnviada(db, CONTEUDO_DA_DIRETORIA(), "enviada", { dono: V, teste: false, liberacao: { justificativa: "Aprovada pela diretoria", servicos: [0], liberado_por_id: G, liberado_por_nome: "Gestora Teste", liberado_em: "2026-11-20T12:00:00.000Z" } });
  const limpo = (corpo: unknown, rotulo: string) => {
    const json = JSON.stringify(corpo);
    assert.doesNotMatch(json, OCULTOS, `${rotulo}: campo oculto`);
    assert.doesNotMatch(json, QUALQUER_BP, `${rotulo}: percentual (*_bp)`);
    assert.doesNotMatch(json, /Aprovada pela diretoria|Gestora Teste|535773|169922/, `${rotulo}: justificativa, quem liberou, custo ou encargos`);
  };
  const soPrecos = (planilha: any, rotulo: string) => {
    assert.deepEqual(Object.keys(planilha).sort(), ["servicos", "total_mensal_centavos", "total_mensal_extenso", "vigente_desde"], rotulo);
    for (const s of planilha.servicos) {
      assert.deepEqual(Object.keys(s).sort(), ["modo", "nome", "postos", "preco_centavos"], rotulo);
      for (const p of s.postos) assert.ok(Object.keys(p).every((k) => ["funcao", "efetivos", "preco_posto_centavos"].includes(k)), `${rotulo}: ${Object.keys(p)}`);
    }
  };

  // Detalhe do rascunho com preço manual: o vendedor vê o preço, sem o preço calculado por posto (revelaria o cálculo).
  const dv = await detalhe(db, "u-v", id);
  assert.equal(dv.status, 200, JSON.stringify(dv.body));
  limpo(dv.body, "detalhe do rascunho");
  soPrecos(dv.body.planilhaTs.planilha, "detalhe do rascunho");
  assert.equal(dv.body.data.conteudo.servicos[0].preco_manual_centavos, 700000);
  assert.equal(dv.body.planilhaTs.planilha.total_mensal_centavos, 700000);
  assert.ok(!("preco_posto_centavos" in dv.body.planilhaTs.planilha.servicos[0].postos[0]));
  // Detalhe da proposta já com revisão gravada: filtrado no servidor, o snapshot congelado não vai.
  const de = await detalhe(db, "u-v", idEnviada);
  assert.equal(de.status, 200, JSON.stringify(de.body));
  assert.equal(de.body.planilhaTs.origem, "revisao");
  limpo(de.body, "detalhe com revisão");
  soPrecos(de.body.planilhaTs.planilha, "detalhe com revisão");
  // Prévia, criação e situação. Sem preço manual, o vendedor recebe o preço mensal do posto e o total.
  const pv = await previa(db, "u-v", conteudoTs());
  assert.equal(pv.status, 200); limpo(pv.body, "prévia"); soPrecos(pv.body.data.planilha, "prévia"); assert.ok(!("ganho" in pv.body.data));
  assert.equal(pv.body.data.planilha.servicos[0].postos[0].preco_posto_centavos, PRECO);
  assert.equal(pv.body.data.planilha.total_mensal_centavos, PRECO);
  const cr = await criar(db, "u-v", {}, EMP);
  assert.equal(cr.status, 201); limpo(cr.body, "criar");
  const canc = await situacao(db, "u-v", id, { para: "cancelada" });
  assert.equal(canc.status, 200); limpo(canc.body, "situação");
  assert.equal(proposta(db, id).conteudo.ganho_bp, 4000, "o que a diretoria definiu continua gravado");
  proposta(db, id).situacao = "rascunho"; // volta para editar

  // Percentuais: nem ler nem gravar.
  assert.equal((await lerParametros(db, "u-v")).status, 403);
  assert.equal((await gravarParametros(db, "u-v", PARAMS_NOVOS())).status, 403);
  assert.equal(db.tabelas.proposta_ts_parametros.length, 1);

  // Edição do vendedor: ele não vê os campos, então não os devolve; eles voltam do que estava gravado e a conta continua a mesma.
  const antesCalc = (await detalhe(db, "u-g", id)).body.planilhaTs.planilha.servicos[0];
  const vistoPeloVendedor = dv.body.data.conteudo;
  vistoPeloVendedor.servicos[0].nome = "Nome mudado pelo vendedor";
  const ed = await patch(db, "u-v", id, { conteudo: vistoPeloVendedor });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  limpo(ed.body, "editar");
  const gravado = proposta(db, id).conteudo;
  assert.equal(gravado.servicos[0].nome, "Nome mudado pelo vendedor");
  assert.equal(gravado.ganho_bp, 4000);
  assert.equal(gravado.justificativa_ganho_minimo, "Aprovada pela diretoria");
  assert.equal(gravado.servicos[0].justificativa_preco_manual, "Aprovada pela diretoria");
  const depoisCalc = (await detalhe(db, "u-g", id)).body.planilhaTs.planilha.servicos[0];
  assert.equal(depoisCalc.preco_calculado_centavos, antesCalc.preco_calculado_centavos, "mesma conta depois da edição do vendedor");
  assert.equal(depoisCalc.custo_centavos, antesCalc.custo_centavos);
  // Informar de propósito um ganho diferente: 403 e nada muda.
  const antes = JSON.stringify(proposta(db, id));
  const ganhoNovo = await patch(db, "u-v", id, { conteudo: { ...vistoPeloVendedor, ganho_bp: 5000 } });
  assert.equal(ganhoNovo.status, 403); assert.equal(ganhoNovo.body.error, MSG_SO_DIRETORIA_GANHO);
  assert.equal(JSON.stringify(proposta(db, id)), antes);

  // Prévia do vendedor ABAIXO do mínimo: o mesmo bloqueio da criação, sem número nem percentual na mensagem.
  const db2 = novoDb(PAR_ABAIXO);
  const bloqueio = await previa(db2, "u-v", conteudoTs());
  assert.equal(bloqueio.status, 422);
  assert.doesNotMatch(bloqueio.body.error, /ganho|%|bp|\d{3,}/i);

  // GESTOR (superuser) e DIRETORIA recebem tudo.
  for (const u of ["u-g", "u-dir"]) {
    const g = await detalhe(db, u, id);
    assert.equal(g.status, 200, u);
    assert.equal(g.body.data.conteudo.ganho_bp, 4000, u);
    assert.equal(g.body.data.conteudo.justificativa_ganho_minimo, "Aprovada pela diretoria", u);
    const s0 = g.body.planilhaTs.planilha.servicos[0];
    assert.equal(typeof s0.ganho_real_bp, "number", u);
    assert.equal(s0.abaixo_ganho_minimo, false, u);
    assert.equal(s0.custo_centavos, CUSTO, u);
    assert.equal(linha(g.body.planilhaTs.planilha, "encargos"), ENCARGOS, u);
    assert.equal(g.body.planilhaTs.planilha.ganho_bp, 4000, u);
    const ge = await detalhe(db, u, idEnviada);
    assert.equal(ge.body.planilhaTs.planilha.liberacao_ganho.liberado_por_nome, "Gestora Teste", u);
    assert.equal(ge.body.planilhaTs.planilha.liberacao_ganho.justificativa, "Aprovada pela diretoria", u);
    const pg = await previa(db, u, conteudoTs());
    assert.equal(pg.status, 200, u);
    assert.deepEqual(pg.body.data.ganho, { abaixo: [], exige_justificativa: false }, u);
    assert.equal(typeof pg.body.data.planilha.servicos[0].ganho_real_bp, "number", u);
    const par = await lerParametros(db, u);
    assert.equal(par.status, 200, u);
    for (const k of ["fgts_bp", "inss_bp", "multa_fgts_bp", "ganho_padrao_bp", "ganho_minimo_bp"]) assert.equal(typeof par.body.vigentes[k], "number", `${u} ${k}`);
  }
  // A diretoria (não só o superuser) também grava os percentuais.
  assert.equal((await gravarParametros(db, "u-dir", PARAMS_NOVOS({ vigente_desde: mais(11) }))).status, 201);
}));

await caso("PRÉVIA DA EDIÇÃO (vendedor): usa o ganho JÁ SALVO (prévia == total salvo) e aceita o preço manual gravado (sem 403), sem devolver ganho nem custo; ganho ou preço manual diferentes seguem 403; proposta alheia 404", async () => comChaves(async () => {
  const db = novoDb();
  const semOcultos = (c: any) => conteudoTsParaPerfil(c, false) as any;
  const limpa = (r: Chamada) => assert.doesNotMatch(JSON.stringify(r.body), OCULTOS);
  // A diretoria definiu 45% nesta proposta (o padrão é 30%).
  const comGanho = conteudoTs({ ganho_bp: 4500, justificativa_ganho_minimo: "Aprovada pela diretoria" });
  const id = semearRascunhoDoVendedor(db, comGanho);
  const salvo = (await detalhe(db, "u-v", id)).body.planilhaTs.planilha.total_mensal_centavos;
  assert.equal(salvo, precoDe(CUSTO, 4500));
  const p = await previa(db, "u-v", semOcultos(comGanho), { proposta_id: id, posicoes: [0] });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.data.planilha.total_mensal_centavos, salvo, "prévia == total salvo");
  assert.equal(p.body.data.planilha.servicos[0].postos[0].preco_posto_centavos, salvo);
  limpa(p); assert.doesNotMatch(JSON.stringify(p.body), /"[a-z_]*_bp"|Aprovada/);
  // Sem proposta_id é uma proposta nova: ganho padrão.
  assert.equal((await previa(db, "u-v", semOcultos(comGanho))).body.data.planilha.total_mensal_centavos, PRECO);
  // Salvar o mesmo conteúdo dá o mesmo total.
  assert.equal((await patch(db, "u-v", id, { conteudo: semOcultos(comGanho) })).status, 200);
  assert.equal((await detalhe(db, "u-v", id)).body.planilhaTs.planilha.total_mensal_centavos, salvo);

  // Preço manual salvo pela diretoria: a prévia não dá 403 e mantém o preço.
  const comManual = conteudoTs({ servicos: [servico({ preco_manual_centavos: 800000, justificativa_preco_manual: "Contrato anual" })] });
  const idM = semearRascunhoDoVendedor(db, comManual);
  const visto = semOcultos(comManual);
  assert.equal((await previa(db, "u-v", visto)).status, 403, "sem proposta_id continua sendo informar preço manual");
  const pm = await previa(db, "u-v", visto, { proposta_id: idM, posicoes: [0] });
  assert.equal(pm.status, 200, JSON.stringify(pm.body));
  assert.equal(pm.body.data.planilha.total_mensal_centavos, 800000);
  limpa(pm); assert.doesNotMatch(JSON.stringify(pm.body), /Contrato anual|preco_manual/);
  // Posto novo ANTES ainda incompleto: a prévia leva só o segundo, na posição 1 do formulário, como o salvar compara.
  const dois = conteudoTs({ ganho_bp: 4500, servicos: [servico(), servico({ nome: "Portaria", preco_manual_centavos: 800000 })] });
  const id2 = semearRascunhoDoVendedor(db, dois);
  const soSegundo = await previa(db, "u-v", { servicos: [semOcultos(dois).servicos[1]] }, { proposta_id: id2, posicoes: [1] });
  assert.equal(soSegundo.status, 200, JSON.stringify(soSegundo.body));
  assert.equal(soSegundo.body.data.planilha.total_mensal_centavos, 800000);
  // Posições inválidas caem na ordem natural (nunca aceitam preço que não está naquela posição).
  assert.equal((await previa(db, "u-v", { servicos: [semOcultos(dois).servicos[1]] }, { proposta_id: id2, posicoes: ["x"] })).status, 403);

  // Informar de propósito outro ganho ou outro preço manual: 403, como no salvar.
  const outroGanho = await previa(db, "u-v", { ...semOcultos(comGanho), ganho_bp: 5000 }, { proposta_id: id, posicoes: [0] });
  assert.equal(outroGanho.status, 403); assert.equal(outroGanho.body.error, MSG_SO_DIRETORIA_GANHO);
  const outroManual = await previa(db, "u-v", { servicos: [{ ...visto.servicos[0], preco_manual_centavos: 100 }] }, { proposta_id: idM, posicoes: [0] });
  assert.equal(outroManual.status, 403); assert.equal(outroManual.body.error, MSG_SO_DIRETORIA_PRECO_MANUAL);

  // Acesso: inexistente, de outro modelo ou invisível = 404; o gestor que só acompanha = 403. Nada é escrito em nenhuma prévia.
  assert.equal((await previa(db, "u-v", conteudoTs(), { proposta_id: crypto.randomUUID() })).status, 404);
  assert.equal((await previa(db, "u-v", conteudoTs(), { proposta_id: 7 })).status, 404);
  assert.equal((await previa(db, "u-g", conteudoTs(), { proposta_id: id })).status, 403);
  proposta(db, id).vendedor_id = VSBC; proposta(db, id).unidade_id = U2;
  assert.equal((await previa(db, "u-v", conteudoTs(), { proposta_id: id })).status, 404);
  db.consultas.length = 0;
  await previa(db, "u-v", visto, { proposta_id: idM, posicoes: [0] });
  assert.deepEqual(escritas(db), []);
}));

await caso("filtro de perfil (puro): conteudoTsParaPerfil / propostaTsParaPerfil só tiram o ganho e as justificativas de quem não é gestor; não alteram o original; ignoram R&S/MOT e formatos estranhos; restaurarOcultosTs só devolve o AUSENTE", () => {
  const c = CONTEUDO_DA_DIRETORIA();
  const copia = JSON.stringify(c);
  const v = conteudoTsParaPerfil(c, false) as any;
  assert.ok(!("ganho_bp" in v) && !("justificativa_ganho_minimo" in v) && !("justificativa_preco_manual" in v.servicos[0]));
  assert.equal(v.servicos[0].preco_manual_centavos, 700000);
  assert.equal(v.servicos[0].postos[0].salario_centavos, 183740);
  assert.equal(JSON.stringify(c), copia, "o original não muda");
  assert.equal(conteudoTsParaPerfil(c, true), c, "gestor recebe o mesmo objeto");
  for (const estranho of [null, undefined, "x", 3, [], { servicos: "x" }, { servicos: [null, 3, { postos: "y" }] }]) assert.doesNotThrow(() => conteudoTsParaPerfil(estranho, false));
  const rs = { modelo: "RS", conteudo: { ganho_bp: 1 } };
  assert.equal(propostaTsParaPerfil(rs, false), rs, "R&S não é tocado");
  const mot = { modelo: "MOT", conteudo: { ganho_bp: 1 } };
  assert.equal(propostaTsParaPerfil(mot, false), mot, "MOT não é tocado");
  assert.ok(!("ganho_bp" in (propostaTsParaPerfil({ modelo: "TS", conteudo: c }, false).conteudo as any)));
  const gravado = conteudoTsSchema.parse(c);
  const semOcultos = conteudoTsSchema.parse(v);
  const r = restaurarOcultosTs(semOcultos, gravado);
  assert.equal(r.ganho_bp, 4000); assert.equal(r.justificativa_ganho_minimo, "Aprovada pela diretoria");
  assert.equal(r.servicos[0].justificativa_preco_manual, "Aprovada pela diretoria");
  // Preço manual diferente (posto trocado): a justificativa antiga não gruda em outro serviço.
  const outroPreco = conteudoTsSchema.parse({ ...v, servicos: [{ ...v.servicos[0], preco_manual_centavos: 800000 }] });
  assert.equal(restaurarOcultosTs(outroPreco, gravado).servicos[0].justificativa_preco_manual, undefined);
  const informado = conteudoTsSchema.parse({ ...v, ganho_bp: 5000 });
  assert.equal(restaurarOcultosTs(informado, gravado).ganho_bp, 5000);
  assert.equal(restaurarOcultosTs(semOcultos, null), semOcultos);
  assert.equal(privilegiosTsViolados(informado, gravado, false), MSG_SO_DIRETORIA_GANHO);
  assert.equal(privilegiosTsViolados(restaurarOcultosTs(semOcultos, gravado), gravado, false), null);
});

await caso("o backend do TS não toca no R&S/MOT nem nos arquivos de tela e PDF: as rotas novas só importam o serviço e a lib do TS", () => {
  for (const f of ["src/app/api/comercial/propostas/ts/previa/route.ts", "src/app/api/comercial/propostas/ts/parametros/route.ts"]) {
    const t = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(t, /propostaPdf|propostaMot|\.update\(|\.delete\(/, f);
  }
  const parametros = fs.readFileSync("src/app/api/comercial/propostas/ts/parametros/route.ts", "utf8");
  assert.equal((parametros.match(/\.insert\(/g) ?? []).length, 1, "só INSERE em proposta_ts_parametros");
  assert.doesNotMatch(parametros, /export async function (PUT|PATCH|DELETE)/);
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
