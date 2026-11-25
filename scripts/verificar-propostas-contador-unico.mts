// Verificação do CONTADOR ÚNICO de numeração das propostas reais (migration_propostas_contador_unico.sql): uma sequência por ano para R&S, MOT e TS.
// Sem banco real: as rotas rodam no banco em memória do harness, com um MODELO da função criar_proposta (mesma regra do SQL: contador por ano, na mesma transação
// da proposta, linha travada pela sessão). O SQL em si é conferido por texto aqui e só roda de verdade no Postgres (scripts/provar-numeracao-propostas.sh, que
// precisa de PostgreSQL 16 local) e na conferência por SELECT depois de aplicar a migration. Nada toca o Supabase.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-contador-unico.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import * as rotaLista from "@/app/api/comercial/propostas/route";
import { hojeSaoPaulo } from "@/lib/comercial";
import { criarDb } from "./harness-mot/memdb.mjs";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const uid = (k: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(k).padStart(12, "0")}`;
const U = uid(1), V = uid(10), V2 = uid(11), EMP = uid(20), EMP_TESTE = uid(21);
const ANO = Number(hojeSaoPaulo().slice(0, 4));
const SEMENTE = 71;
const aa = (ano: number) => String(ano).slice(-2);

// ── Modelo da função SQL ────────────────────────────────────────────────────────────────────────────────────────────────────────
// criar_proposta: valida modelo e sigla; "insert ... on conflict (ano) do update set ultimo = ultimo + 1" (a linha do contador fica TRAVADA até o fim da transação);
// insere a proposta; se o insert falha, a transação inteira desfaz (o contador volta). Ano de São Paulo a cada chamada.
interface Opcoes { ano?: number; trava?: boolean }
const sessoes = new WeakMap<object, Promise<unknown>>();
function contadorDoAno(db: any, ano: number) {
  let c = db.tabelas.proposta_contador_unico.find((x: any) => x.ano === ano);
  if (!c) { c = { ano, ultimo: 0 }; db.tabelas.proposta_contador_unico.push(c); }
  return c;
}
function criarRpcReal(opcoes: Opcoes = {}) {
  return (a: Record<string, unknown>, db: any) => {
    const corpo = async () => {
      const ano = opcoes.ano ?? ANO;
      if (!["RS", "MOT", "TS"].includes(a.p_modelo as string)) return { data: null, error: { message: `Modelo de proposta inválido: ${a.p_modelo}` } };
      if (typeof a.p_sigla !== "string" || !/^[A-Z]{1,4}$/.test(a.p_sigla)) return { data: null, error: { message: `Sigla de proposta inválida: ${a.p_sigla ?? "(nula)"}` } };
      db.rpcChamadas.push({ rpc: "criar_proposta", ...a });
      const antes = db.tabelas.proposta_contador_unico.find((x: any) => x.ano === ano)?.ultimo;
      const c = contadorDoAno(db, ano);
      const lido = c.ultimo;
      await new Promise((r) => setTimeout(r, 2)); // outras sessões entram aqui; com a linha travada elas esperam
      c.ultimo = lido + 1;
      if (a.p_vendedor_id === "inexistente") { // viola a FK no insert: a transação desfaz, inclusive o contador
        if (antes === undefined) db.tabelas.proposta_contador_unico = db.tabelas.proposta_contador_unico.filter((x: any) => x.ano !== ano);
        else c.ultimo = antes;
        return { data: null, error: { message: "violates foreign key constraint" } };
      }
      const prefixo = a.p_modelo === "RS" ? `${a.p_sigla}-` : `${a.p_sigla}-${a.p_modelo}-`;
      const linha = {
        id: crypto.randomUUID(), numero: `${prefixo}${String(c.ultimo).padStart(4, "0")}/${aa(ano)}`, modelo: a.p_modelo, ano, sequencial: c.ultimo, revisao_atual: 0, situacao: "rascunho",
        unidade_id: a.p_unidade_id, vendedor_id: a.p_vendedor_id, empresa_visitada_id: a.p_empresa_visitada_id, oportunidade_id: a.p_oportunidade_id, cliente_nome: a.p_cliente_nome,
        aos_cuidados: a.p_aos_cuidados, conteudo: a.p_conteudo, template_versao: a.p_template_versao, validade_dias: a.p_validade_dias, validade_ate: null, valor_estimado: null,
        enviada_em: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), teste: false,
      };
      db.tabelas.propostas.push(linha);
      return { data: structuredClone(linha), error: null };
    };
    if (opcoes.trava === false) return corpo();
    const anterior = sessoes.get(db) ?? Promise.resolve();
    const esta = anterior.then(corpo, corpo);
    sessoes.set(db, esta.catch(() => undefined));
    return esta;
  };
}
// criar_proposta_teste NÃO muda: contador de teste por modalidade e ano.
function rpcTeste(a: Record<string, unknown>, db: any) {
  db.rpcChamadas.push({ rpc: "criar_proposta_teste", ...a });
  let c = db.tabelas.proposta_contadores_teste.find((x: any) => x.modelo === a.p_modelo && x.ano === ANO);
  if (!c) { c = { modelo: a.p_modelo, ano: ANO, ultimo: 0 }; db.tabelas.proposta_contadores_teste.push(c); }
  c.ultimo += 1;
  const prefixo = a.p_modelo === "RS" ? "TESTE-" : `TESTE-${a.p_modelo}-`;
  const linha = {
    id: crypto.randomUUID(), numero: `${prefixo}${String(c.ultimo).padStart(4, "0")}/${aa(ANO)}`, modelo: a.p_modelo, ano: ANO, sequencial: c.ultimo, revisao_atual: 0, situacao: "rascunho",
    unidade_id: a.p_unidade_id, vendedor_id: a.p_vendedor_id, empresa_visitada_id: a.p_empresa_visitada_id, oportunidade_id: a.p_oportunidade_id, cliente_nome: a.p_cliente_nome,
    aos_cuidados: a.p_aos_cuidados, conteudo: a.p_conteudo, template_versao: a.p_template_versao, validade_dias: a.p_validade_dias, validade_ate: null, valor_estimado: null,
    enviada_em: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), teste: true,
  };
  db.tabelas.propostas.push(linha);
  return { data: structuredClone(linha), error: null };
}

function novoDb(opcoes: Opcoes = {}) {
  const db: any = criarDb({
    analistas_perfil: [
      { id: V, user_id: "u-v", nome_completo: "Vendedor", email: "v@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "analista", unidade_id: U, acesso_todas_unidades: false, perfil_comercial: true, ativo: true },
      { id: V2, user_id: "u-g", nome_completo: "Gestora Teste", email: "g@salmazos.com.br", telefone: null, cargo: null, nivel_acesso: "superuser", unidade_id: U, acesso_todas_unidades: true, perfil_comercial: false, ativo: true },
    ],
    usuario_acesso_customizado: [{ analista_perfil_id: V2, chave_aba: "comercial_propostas", liberado: true }],
    empresas_visitadas: [{ id: EMP, nome: "ZZTEST Empresa", cliente_id: null, unidade_id: U }, { id: EMP_TESTE, nome: "ZZTEST Empresa de Teste", cliente_id: null, unidade_id: U }],
    empresas_teste: [{ empresa_id: EMP_TESTE, marcado_por: V2 }],
    empresa_contatos: [], oportunidades: [], lembretes: [], oportunidade_interacoes: [], propostas: [], proposta_historico: [], audit_logs: [],
    proposta_contador_unico: [{ ano: ANO, ultimo: SEMENTE }],
    // Legado: congelado (RS=71 e MOT=71 em produção); nada mais lê nem escreve neles para as propostas reais.
    proposta_contadores: [{ modelo: "RS", ano: ANO, ultimo: SEMENTE }, { modelo: "MOT", ano: ANO, ultimo: SEMENTE }],
    proposta_contadores_teste: [],
  });
  db.rpcs = { criar_proposta: criarRpcReal(opcoes), criar_proposta_teste: rpcTeste };
  db.rpcChamadas = [];
  return db;
}
async function chamar(db: any, usuario: string, fn: (...a: any[]) => Promise<Response>, corpo?: unknown) {
  db.usuario = { id: usuario, email: `${usuario}@t.local`, app_metadata: { role: usuario === "u-g" ? "superuser" : "analista" } };
  globalThis.__DB__ = db;
  const req = Object.assign(new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }), { nextUrl: new URL("http://x/api") });
  const r = await fn(req, { params: Promise.resolve({}) });
  return { status: r.status, body: await r.json() };
}
const CONTEUDO_MOT = { funcoes: [{ area: "OPERACIONAL", descricao: null, salario_centavos: 100000, jornada: "Conforme CCT", horario: "Turnos A / B / C" }] };
const criar = (db: any, modelo: "RS" | "MOT" | "TS", usuario = "u-v", empresa = EMP) =>
  chamar(db, usuario, rotaLista.POST, { modelo, empresa_visitada_id: empresa, ...(modelo === "MOT" ? { conteudo: CONTEUDO_MOT } : {}) });
const rpcDireto = (db: any, modelo: string, extra: Record<string, unknown> = {}) =>
  db.rpcs.criar_proposta({ p_modelo: modelo, p_sigla: "VE", p_unidade_id: U, p_vendedor_id: V, p_empresa_visitada_id: EMP, p_oportunidade_id: null, p_cliente_nome: "ZZTEST", p_aos_cuidados: null, p_conteudo: {}, p_template_versao: 1, p_validade_dias: 15, ...extra }, db);
const unico = (db: any, ano = ANO) => db.tabelas.proposta_contador_unico.find((c: any) => c.ano === ano)?.ultimo;
const legado = (db: any, modelo: string) => db.tabelas.proposta_contadores.find((c: any) => c.modelo === modelo && c.ano === ANO).ultimo;

async function comChaveMot<T>(fn: () => Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const k of ["HARNESS_PROPOSTA_MOT", "NODE_ENV", "VERCEL_ENV", "VERCEL"]) { antes[k] = process.env[k]; delete process.env[k]; }
  process.env.HARNESS_PROPOSTA_MOT = "1";
  try { return await fn(); } finally { for (const k of Object.keys(antes)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } }
}

// ── Comportamento ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("as 3 modalidades em sequência recebem números CONSECUTIVOS (semente 71 → 72, 73, 74), com a marca da modalidade no número; os contadores legados não se mexem", async () => {
  const db = novoDb();
  const rs = (await rpcDireto(db, "RS")).data, mot = (await rpcDireto(db, "MOT")).data, ts = (await rpcDireto(db, "TS")).data;
  assert.deepEqual([rs.sequencial, mot.sequencial, ts.sequencial], [72, 73, 74]);
  assert.deepEqual([rs.numero, mot.numero, ts.numero], [`VE-0072/${aa(ANO)}`, `VE-MOT-0073/${aa(ANO)}`, `VE-TS-0074/${aa(ANO)}`]);
  assert.equal(unico(db), 74);
  assert.equal(legado(db, "RS"), SEMENTE); assert.equal(legado(db, "MOT"), SEMENTE);
  assert.equal(new Set(db.tabelas.propostas.map((p: any) => p.sequencial)).size, 3, "nenhum sequencial repetido entre modalidades");
  // Depois, em qualquer ordem, a sequência continua: RS 75, TS 76, MOT 77.
  assert.deepEqual([(await rpcDireto(db, "RS")).data.sequencial, (await rpcDireto(db, "TS")).data.sequencial, (await rpcDireto(db, "MOT")).data.sequencial], [75, 76, 77]);
});

await caso("pela API (a rota de sempre): R&S e MOT dividem a mesma sequência; o app não mudou (mesmas chamadas, mesmos argumentos)", async () => {
  const db = novoDb();
  await comChaveMot(async () => {
    const a = await criar(db, "RS");
    const b = await criar(db, "MOT");
    const c = await criar(db, "RS");
    assert.deepEqual([a.status, b.status, c.status], [201, 201, 201], JSON.stringify([a.body, b.body, c.body]));
    assert.deepEqual([a.body.data.numero, b.body.data.numero, c.body.data.numero], [`VE-0072/${aa(ANO)}`, `VE-MOT-0073/${aa(ANO)}`, `VE-0074/${aa(ANO)}`]);
    assert.equal(db.rpcChamadas.filter((x: any) => x.rpc === "criar_proposta").length, 3);
    assert.deepEqual(Object.keys(db.rpcChamadas[0]).sort(), ["p_aos_cuidados", "p_cliente_nome", "p_conteudo", "p_empresa_visitada_id", "p_modelo", "p_oportunidade_id", "p_sigla", "p_template_versao", "p_unidade_id", "p_validade_dias", "p_vendedor_id", "rpc"]);
  });
  assert.equal(unico(db), 74);
});

await caso("virada de ano: a primeira proposta de 2027 sai 0001/27 e o ano antigo fica como estava; no mesmo ano a sequência continua", async () => {
  const db = novoDb({ ano: ANO + 1 });
  const nova = (await rpcDireto(db, "MOT")).data;
  assert.equal(nova.numero, `VE-MOT-0001/${aa(ANO + 1)}`);
  assert.equal(nova.ano, ANO + 1);
  assert.equal(unico(db, ANO), SEMENTE, "o ano anterior não é tocado");
  assert.equal(unico(db, ANO + 1), 1);
  assert.equal((await rpcDireto(db, "RS")).data.numero, `VE-0002/${aa(ANO + 1)}`);
  assert.equal((await rpcDireto(db, "TS")).data.numero, `VE-TS-0003/${aa(ANO + 1)}`);
  assert.equal(unico(db, ANO), SEMENTE);
  assert.equal(db.tabelas.proposta_contador_unico.length, 2, "uma linha por ano");
});

await caso("teste separado e POR MODALIDADE: TESTE-0001 (RS), TESTE-MOT-0001 e 0002; o contador real único e os legados não andam; o real não afeta o teste", async () => {
  const db = novoDb();
  const t = [(await rpcTesteDireto(db, "RS")).numero, (await rpcTesteDireto(db, "MOT")).numero, (await rpcTesteDireto(db, "MOT")).numero, (await rpcTesteDireto(db, "RS")).numero];
  assert.deepEqual(t, [`TESTE-0001/${aa(ANO)}`, `TESTE-MOT-0001/${aa(ANO)}`, `TESTE-MOT-0002/${aa(ANO)}`, `TESTE-0002/${aa(ANO)}`]);
  assert.equal(unico(db), SEMENTE, "o contador real único não andou");
  assert.equal(legado(db, "RS"), SEMENTE); assert.equal(legado(db, "MOT"), SEMENTE);
  assert.equal((await rpcDireto(db, "RS")).data.numero, `VE-0072/${aa(ANO)}`, "o real continua em 72");
  assert.equal(db.tabelas.proposta_contadores_teste.find((c: any) => c.modelo === "RS").ultimo, 2, "o real não mexe no teste");
  assert.deepEqual(db.tabelas.propostas.filter((p: any) => p.teste).map((p: any) => p.teste), [true, true, true, true]);
  // Pela API: o gestor em empresa de teste cria TESTE-... sem gastar o número real.
  const g = await criar(db, "RS", "u-g", EMP_TESTE);
  assert.equal(g.status, 201, JSON.stringify(g.body));
  assert.equal(g.body.data.numero, `TESTE-0003/${aa(ANO)}`);
  assert.equal(unico(db), SEMENTE + 1);
});
function rpcTesteDireto(db: any, modelo: string) {
  return db.rpcs.criar_proposta_teste({ p_modelo: modelo, p_unidade_id: U, p_vendedor_id: V, p_empresa_visitada_id: EMP_TESTE, p_oportunidade_id: null, p_cliente_nome: "ZZTEST", p_aos_cuidados: null, p_conteudo: {}, p_template_versao: 1, p_validade_dias: 15 }, db).data;
}

await caso("falha no insert NÃO consome o número (contador e proposta na mesma transação): o próximo continua 72; sigla ou modelo inválidos também não gastam nada", async () => {
  const db = novoDb();
  const falha = await rpcDireto(db, "RS", { p_vendedor_id: "inexistente" });
  assert.ok(falha.error);
  assert.equal(unico(db), SEMENTE, "o contador voltou");
  assert.equal(db.tabelas.propostas.length, 0);
  for (const ruim of [{ p_sigla: "ve" }, { p_sigla: null }, { p_sigla: "ABCDE" }, { p_modelo: "XX" }]) assert.ok((await rpcDireto(db, "RS", ruim)).error);
  assert.equal(unico(db), SEMENTE);
  assert.equal((await rpcDireto(db, "RS")).data.numero, `VE-0072/${aa(ANO)}`, "sem buraco");
  // No primeiro uso do ano, a falha também não deixa linha órfã do contador.
  const virada = novoDb({ ano: ANO + 1 });
  assert.ok((await rpcDireto(virada, "RS", { p_vendedor_id: "inexistente" })).error);
  assert.equal(virada.tabelas.proposta_contador_unico.length, 1);
  assert.equal((await rpcDireto(virada, "RS")).data.numero, `VE-0001/${aa(ANO + 1)}`);
});

await caso("duas criações SIMULTÂNEAS nunca repetem número: 12 chamadas ao mesmo tempo, pela API, dão 72..83 sem repetição e sem buraco", async () => {
  const db = novoDb();
  const respostas = await comChaveMot(() => Promise.all(Array.from({ length: 12 }, (_, i) => criar(db, i % 3 === 1 ? "MOT" : "RS"))));
  assert.ok(respostas.every((r) => r.status === 201), JSON.stringify(respostas.find((r) => r.status !== 201)));
  const seqs = respostas.map((r) => r.body.data.sequencial as number).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 12 }, (_, i) => 72 + i));
  assert.equal(new Set(respostas.map((r) => r.body.data.numero)).size, 12);
  assert.equal(unico(db), 83);
  assert.equal(db.tabelas.propostas.length, 12);
});

await caso("CONTROLE NEGATIVO: sem a linha travada (o que o 'on conflict do update' do banco garante) o mesmo teste DETECTARIA números repetidos", async () => {
  const db = novoDb({ trava: false });
  const rs = await Promise.all(Array.from({ length: 12 }, () => rpcDireto(db, "RS")));
  const distintos = new Set(rs.map((r: any) => r.data.numero)).size;
  assert.ok(distintos < 12, `esperava repetição sem a trava, mas houve ${distintos} números distintos`);
});

// ── A migration (texto) ──────────────────────────────────────────────────────────────────────────────────────────────────────────

await caso("migration: cabeçalho APLICADA em 25/11/2026, transação única, sem DROP de tabela/TRUNCATE/DELETE, aditiva; tabela só com (ano, ultimo), PK (ano), check, RLS sem policy, só service_role; sem número fixo na semente", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_contador_unico.sql", "utf8");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^-- APLICADA em 25\/11\/2026 \(Supabase, conferida por SELECT\)\./m);
  assert.doesNotMatch(sql, /NÃO APLICADA/);
  assert.match(codigo, /^begin;$/m); assert.match(codigo, /^commit;$/m);
  assert.equal((codigo.match(/^begin;$/gm) ?? []).length, 1);
  assert.doesNotMatch(codigo, /\b(drop\s|truncate|delete\s+from|alter\s+table\s+(?!public\.proposta_contador_unico))/i);
  assert.match(codigo, /create table if not exists public\.proposta_contador_unico \(\s*ano\s+int primary key,\s*ultimo\s+int not null default 0 check \(ultimo >= 0\)\s*\);/);
  assert.match(codigo, /revoke all on public\.proposta_contador_unico from public, anon, authenticated;/);
  assert.match(codigo, /alter table public\.proposta_contador_unico enable row level security;/);
  assert.doesNotMatch(codigo, /create policy/i);
  assert.match(codigo, /grant select, insert, update on public\.proposta_contador_unico to service_role;/);
  // Semente calculada na hora: greatest(max do legado no ano, max sequencial das reais no ano, 0), só se a linha do ano não existir; nenhum número fixo.
  assert.match(codigo, /greatest\([\s\S]*max\(c\.ultimo\) from public\.proposta_contadores c where c\.ano = a\.ano[\s\S]*max\(p\.sequencial\) from public\.propostas p where p\.ano = a\.ano and not p\.teste[\s\S]*,\s*0\s*\)/);
  assert.match(codigo, /extract\(year from \(now\(\) at time zone 'America\/Sao_Paulo'\)\)::int as ano/);
  assert.match(codigo, /on conflict \(ano\) do nothing;/);
  assert.doesNotMatch(codigo, /values\s*\(\s*2026|select\s+2026|\b71\b|\b72\b/);
  // Não altera o que não deve.
  assert.doesNotMatch(codigo, /criar_proposta_teste|create table[^;]*proposta_contadores_teste|insert into public\.proposta_contadores\b|update public\.proposta_contadores|alter table public\.proposta_contadores/);
});

await caso("migration: índice único parcial de segurança (ano, sequencial) where not teste; a conferência prévia está no cabeçalho (9 propostas reais, 0 violações)", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_contador_unico.sql", "utf8");
  assert.match(sql, /create unique index if not exists propostas_ano_seq_real_uq on public\.propostas \(ano, sequencial\) where not teste;/);
  for (const n of ["ES-0054/26", "ES-0055/26", "ES-0056/26", "LM-0057/26", "LM-0058/26", "ES-0059/26", "ES-0060/26", "ES-0061/26", "LM-0065/26"]) assert.ok(sql.includes(n), n);
  assert.match(sql, /select ano, sequencial, count\(\*\) from public\.propostas where not teste group by 1, 2 having count\(\*\) > 1;/);
  assert.match(sql, /não há violação/);
});

await caso("migration: criar_proposta (11 args) recriada com a MESMA assinatura/retorno, INVOKER, search_path, mesmas validações e formato do número; usa SÓ o contador único; execute só para service_role; 4 SELECTs de conferência no fim", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_contador_unico.sql", "utf8");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const fn = codigo.slice(codigo.indexOf("create or replace function public.criar_proposta("), codigo.indexOf("revoke all on function"));
  assert.match(fn, /p_modelo text,\s*p_sigla text,\s*p_unidade_id uuid,\s*p_vendedor_id uuid,\s*p_empresa_visitada_id uuid,\s*p_oportunidade_id uuid,\s*p_cliente_nome text,\s*p_aos_cuidados text,\s*p_conteudo jsonb,\s*p_template_versao int,\s*p_validade_dias int\s*\) returns public\.propostas/);
  assert.match(fn, /language plpgsql\s+set search_path = public, pg_temp/);
  assert.doesNotMatch(fn, /security definer/i);
  assert.match(fn, /if p_modelo not in \('RS','MOT','TS'\) then\s+raise exception 'Modelo de proposta inválido: %', p_modelo using errcode = '22023';/);
  assert.match(fn, /if p_sigla is null or p_sigla !~ '\^\[A-Z\]\{1,4\}\$' then\s+raise exception 'Sigla de proposta inválida: %', coalesce\(p_sigla, '\(nula\)'\) using errcode = '22023';/);
  assert.match(fn, /insert into proposta_contador_unico as c \(ano, ultimo\)\s+values \(v_ano, 1\)\s+on conflict \(ano\) do update set ultimo = c\.ultimo \+ 1\s+returning c\.ultimo into v_seq;/);
  assert.doesNotMatch(fn, /proposta_contadores/);
  assert.match(fn, /case when p_modelo = 'RS' then p_sigla \|\| '-' else p_sigla \|\| '-' \|\| p_modelo \|\| '-' end\s+\|\| lpad\(v_seq::text, 4, '0'\) \|\| '\/' \|\| lpad\(\(v_ano % 100\)::text, 2, '0'\)/);
  assert.match(fn, /v_ano int := extract\(year from \(now\(\) at time zone 'America\/Sao_Paulo'\)\)::int;/);
  assert.equal((fn.match(/insert into /g) ?? []).length, 2, "contador e proposta, na mesma função (mesma transação)");
  assert.match(codigo, /revoke all on function public\.criar_proposta\(text, text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int\) from public, anon, authenticated;\s+grant execute on function public\.criar_proposta\(text, text, uuid, uuid, uuid, uuid, text, text, jsonb, int, int\) to service_role;/);
  const conferencias = sql.slice(sql.indexOf("-- Conferência depois de aplicar")).split("\n").filter((l) => /^--\s+\d\)|^--\s+\(extra\)/.test(l));
  assert.equal(conferencias.filter((l) => /^--\s+\d\)/.test(l)).length, 4);
  assert.equal((sql.match(/^--\s+(select .*)$/gm) ?? []).length >= 4, true);
});

await caso("o app NÃO conhece o contador: nada em src/ lê ou escreve proposta_contador_unico, proposta_contadores ou proposta_contadores_teste (só as funções SQL)", () => {
  const varrer = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? varrer(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const achados = varrer("src").filter((f) => /proposta_contador/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(achados, []);
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
