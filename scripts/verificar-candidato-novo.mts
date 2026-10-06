// Verificação do candidato novo (Admissão Rápida, indicação direta, Cadastro Rápido): defaults NOT NULL e origem aceita pelo banco.
// Rodar: node --experimental-strip-types scripts/verificar-candidato-novo.mts
// O teste de servidor das rotas (INSERT, 409, reaproveitar por CPF, erros 23502/23514) usa banco simulado fora do repositório.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TEMPO_EXPERIENCIA_PADRAO, TURNO_DISPONIVEL_PADRAO, defaultsCandidatoNovo } from "../src/lib/candidatoDefaults.ts";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message}`); process.exitCode = 1; }
}

const RAIZ = new URL("..", import.meta.url).pathname;
const lerSrc = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const sql = lerSrc("supabase/migration_candidatos_origem_admissao_rapida.sql");
const codigoSql = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const ORIGENS_CHECK = [...(codigoSql.match(/array\[([^\]]+)\]/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

(async () => {
  await caso("helper: tempo_experiencia 'Sem experiência' e turno_disponivel 'Flexível' (os valores que o Cadastro Rápido e a indicação direta já enviavam)", () => {
    assert.equal(TEMPO_EXPERIENCIA_PADRAO, "Sem experiência"); assert.equal(TURNO_DISPONIVEL_PADRAO, "Flexível");
    assert.deepEqual(defaultsCandidatoNovo(), { tempo_experiencia: "Sem experiência", turno_disponivel: "Flexível" });
    assert.notEqual(defaultsCandidatoNovo(), defaultsCandidatoNovo(), "cada chamada devolve um objeto novo");
  });

  await caso("helper: puro, sem imports", () => {
    assert.ok(!/^\s*import\s/m.test(lerSrc("src/lib/candidatoDefaults.ts")));
  });

  await caso("migration: só recria chk_candidatos_origem (drop if exists + add) e o CHECK novo tem exatamente os 5 valores, com admissao_rapida", () => {
    assert.deepEqual([...ORIGENS_CHECK].sort(), ["admissao_rapida", "banco_talentos", "cadastro_rapido", "indicacao_direta_cliente", "vaga_especifica"]);
    assert.equal(ORIGENS_CHECK.length, 5); assert.ok(ORIGENS_CHECK.includes("admissao_rapida"));
    const comandos = codigoSql.split(";").map((c) => c.trim()).filter(Boolean);
    assert.equal(comandos.length, 2);
    assert.match(comandos[0], /^alter table public\.candidatos drop constraint if exists chk_candidatos_origem$/i);
    assert.match(comandos[1], /^alter table public\.candidatos add constraint chk_candidatos_origem\s+check \(origem = any \(array\[/i);
    assert.ok(!/\b(create|drop table|truncate|insert|update|delete|grant|function|trigger|policy)\b/i.test(codigoSql), "nenhuma outra mudança de schema ou dado");
    assert.match(sql, /pg_get_constraintdef\(oid\) from pg_constraint where conname = 'chk_candidatos_origem'/, "conferência somente leitura documentada");
  });

  await caso("migration: os 4 valores de antes (30/09, indicacao_direta_candidato) continuam todos aceitos", () => {
    const m30 = lerSrc("supabase/migration_indicacao_direta_candidato.sql");
    const antes = [...(m30.match(/chk_candidatos_origem\s+check \(origem = any \(array\[([^\]]+)\]/i)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual(antes.sort(), ["banco_talentos", "cadastro_rapido", "indicacao_direta_cliente", "vaga_especifica"]);
    for (const o of antes) assert.ok(ORIGENS_CHECK.includes(o), o);
  });

  await caso("repo: só 3 arquivos fazem INSERT em candidatos (POST /api/candidatos, Admissão Rápida, decisão da indicação direta) — um novo ponto obriga a revisar a origem", () => {
    const comInsert = arquivos(join(RAIZ, "src")).filter((f) => /\.from\("candidatos"\)\s*\.(insert|upsert)\(/.test(readFileSync(f, "utf8"))).map((f) => f.slice(RAIZ.length)).sort();
    assert.deepEqual(comInsert, ["src/app/api/admissoes/admissao-rapida/route.ts", "src/app/api/candidatos/route.ts", "src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts"]);
  });

  await caso("repo: todas as origens enviadas aos INSERTs em candidatos (rotas e telas que chamam POST /api/candidatos) estão contidas no CHECK novo", () => {
    const literais = (rel: string, soLinhasOrigem = true) => {
      const linhas = lerSrc(rel).split("\n").filter((l) => /origem/.test(l) && !/\.origem\s*===|origem_|searchParams|admissao_fee_origem/.test(l) && !/^\s*\/\//.test(l));
      return linhas.flatMap((l) => [...l.matchAll(/"([a-z]+(?:_[a-z]+)+)"/g)].map((m) => m[1]));
    };
    const usadas: Record<string, string[]> = {
      "src/app/api/admissoes/admissao-rapida/route.ts": literais("src/app/api/admissoes/admissao-rapida/route.ts"),
      "src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts": literais("src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts"),
      "src/app/api/candidatos/route.ts": literais("src/app/api/candidatos/route.ts"),
      "src/components/ModalCadastroRapido.tsx": literais("src/components/ModalCadastroRapido.tsx"),
      "src/app/candidatura/page.tsx": literais("src/app/candidatura/page.tsx"),
      "src/components/FormCandidaturaVagaPublica.tsx": literais("src/components/FormCandidaturaVagaPublica.tsx"),
      "src/components/FormularioCadastro.tsx": literais("src/components/FormularioCadastro.tsx"),
    };
    for (const [arq, vs] of Object.entries(usadas)) { assert.ok(vs.length > 0, `${arq}: nenhuma origem encontrada (o teste ficou cego)`); for (const v of vs) assert.ok(ORIGENS_CHECK.includes(v), `${arq}: origem "${v}" fora do CHECK`); }
    const todas = new Set(Object.values(usadas).flat());
    assert.deepEqual([...todas].sort(), ["admissao_rapida", "banco_talentos", "cadastro_rapido", "indicacao_direta_cliente", "vaga_especifica"]);
  });

  await caso("repo: os INSERTs de candidato novo enviam tempo_experiencia e turno_disponivel (Admissão Rápida e indicação direta pelo helper; Cadastro Rápido pelas constantes)", () => {
    for (const rel of ["src/app/api/admissoes/admissao-rapida/route.ts", "src/app/api/solicitacoes-indicacao-candidato/[id]/decisao/route.ts"]) {
      const s = lerSrc(rel); assert.match(s, /import \{ defaultsCandidatoNovo \} from "@\/lib\/candidatoDefaults"/, rel); assert.match(s, /\.\.\.defaultsCandidatoNovo\(\)/, rel);
      assert.ok(!/"Sem experiência"|"Flexível"/.test(s), `${rel}: sem literal repetido`);
    }
    const modal = lerSrc("src/components/ModalCadastroRapido.tsx");
    assert.match(modal, /tempo_experiencia: tempoExperiencia \|\| TEMPO_EXPERIENCIA_PADRAO/); assert.match(modal, /turno_disponivel: TURNO_DISPONIVEL_PADRAO/); assert.ok(!/"Sem experiência"|"Flexível"/.test(modal));
    // POST /api/candidatos NÃO usa o helper de propósito: grava o que o cliente manda (a validação do schema decide), sem default no servidor.
    const rota = lerSrc("src/app/api/candidatos/route.ts"); assert.match(rota, /tempo_experiencia: body\.tempo_experiencia,/); assert.ok(!/candidatoDefaults/.test(rota));
  });

  console.log(`\n${total} casos OK${process.exitCode ? " (com falhas acima)" : ""}`);
})();
