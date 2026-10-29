// Teste de mutação: quebra de propósito cada regra e exige que verificar-unidade-faturamento.mts FALHE.
// Rodar: node --experimental-strip-types scripts/verificar-unidade-faturamento-mutacoes.mts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIB = "src/lib/unidadeFaturamento.ts";
const SQL = "supabase/migration_unidade_faturamento.sql";
const lib = readFileSync(LIB, "utf8");
const sql = readFileSync(SQL, "utf8");

const mutacoes: { nome: string; alvo: "lib" | "sql"; de: string; para: string }[] = [
  { nome: "valor desconhecido deixa de cair em 'a definir'", alvo: "lib", de: 'return ehUnidadeFaturamento(valor) ? valor : "a_definir";', para: "return (valor as BucketFaturamento) ?? \"a_definir\";" },
  { nome: "NULL some (bucket null vira 'monte_mor')", alvo: "lib", de: ': "a_definir";\n}\n\nexport function filtrarPorBucket', para: ': "monte_mor";\n}\n\nexport function filtrarPorBucket' },
  { nome: "contagem ignora 'a definir'", alvo: "lib", de: "contagem[bucketFaturamento(i.unidadeFaturamento)]++;", para: 'if (i.unidadeFaturamento) contagem[bucketFaturamento(i.unidadeFaturamento)]++;' },
  { nome: "criação deixa de exigir o campo", alvo: "lib", de: "if (obrigatoria) return { ok: false, erro: MSG_UNIDADE_FATURAMENTO_OBRIGATORIA };", para: "if (false) return { ok: false, erro: MSG_UNIDADE_FATURAMENTO_OBRIGATORIA };" },
  { nome: "SBC passa a gravar o campo", alvo: "lib", de: "if (!usaUnidadeFaturamento(slugUnidade)) return { ok: true, campo: {} };", para: "" },
  { nome: "valor inválido é aceito", alvo: "lib", de: 'if (!ehUnidadeFaturamento(enviada)) return { ok: false, erro: "Unidade de faturamento inválida." };', para: "" },
  { nome: "edição com null deixa de voltar para 'a definir'", alvo: "lib", de: "campo: enviada === null ? { unidade_faturamento: null } : {}", para: "campo: {}" },
  { nome: "slug de SBC passa a usar o campo", alvo: "lib", de: 'return slugUnidade === SLUG_UNIDADE_COMPARTILHADA;', para: "return true;" },
  { nome: "migration: coluna vira NOT NULL", alvo: "sql", de: "ADD COLUMN IF NOT EXISTS unidade_faturamento text;\nALTER TABLE public.contas_receber", para: "ADD COLUMN IF NOT EXISTS unidade_faturamento text NOT NULL;\nALTER TABLE public.contas_receber" },
  { nome: "migration: perde a idempotência da constraint", alvo: "sql", de: "IF NOT EXISTS (\n      SELECT 1 FROM pg_constraint", para: "IF TRUE OR EXISTS (\n      SELECT 1 FROM pg_constraint" },
  { nome: "migration: Petix volta a ser Hortolândia", alvo: "sql", de: "= 'petix' THEN 'monte_mor' ELSE 'hortolandia'", para: "= 'petix' THEN 'hortolandia' ELSE 'hortolandia'" },
  { nome: "migration: backfill sobrescreve escolha manual (sem guarda IS NULL em cobrancas_rs)", alvo: "sql", de: "WHERE c.id = cb.cliente_id\n   AND cb.unidade_faturamento IS NULL", para: "WHERE c.id = cb.cliente_id\n   AND TRUE" },
  { nome: "migration: preenche contas_pagar em massa", alvo: "sql", de: "-- (c) contas_pagar_hortolandia", para: "UPDATE public.contas_pagar_hortolandia SET unidade_faturamento = 'hortolandia' WHERE unidade_faturamento IS NULL;\n-- (c) contas_pagar_hortolandia" },
];

const dir = mkdtempSync(join(tmpdir(), "uf-mut-"));
let pegas = 0;
let falhas = 0;
for (const [i, m] of mutacoes.entries()) {
  const fonte = m.alvo === "lib" ? lib : sql;
  if (!fonte.includes(m.de)) { console.log(`ERRO  mutação ${i + 1} não se aplica (trecho não encontrado): ${m.nome}`); falhas++; continue; }
  const arq = join(dir, m.alvo === "lib" ? `lib-${i}.ts` : `mig-${i}.sql`);
  writeFileSync(arq, fonte.replace(m.de, m.para));
  const r = spawnSync("node", ["--experimental-strip-types", "--no-warnings", "scripts/verificar-unidade-faturamento.mts"], {
    env: { ...process.env, ...(m.alvo === "lib" ? { UF_LIB: arq } : { UF_MIGRATION: arq }) }, encoding: "utf8",
  });
  if (r.status !== 0) { pegas++; console.log(`morta     ${m.nome}`); }
  else { falhas++; console.log(`SOBREVIVEU ${m.nome}`); }
}
console.log(`\n${pegas}/${mutacoes.length} mutações detectadas`);
process.exit(falhas === 0 ? 0 : 1);
