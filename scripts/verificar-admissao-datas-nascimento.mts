// Admissão: a data de nascimento do titular e do dependente é uma data REAL entre 01/01/1900 e hoje (Brasília); "" vira vazio.
// Antes o schema aceitava qualquer texto (só o tipo date do banco barrava formato inválido): ano absurdo como 2979 passava.
//  - bordas (1900-01-01, 1899-12-31, hoje, amanhã), 2979, datas inexistentes, formatos errados, "" e null;
//  - "hoje" é o de Brasília (relógio em 18/11/2026 22:30 em Brasília = 19/11 em UTC), igual sob TZ=UTC e TZ=America/Sao_Paulo;
//  - prova de falha: o MESMO conjunto reprova o schema antigo (texto livre).
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-admissao-datas-nascimento.mts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData } from "./harness-mot/ambiente.mjs";
import * as real from "../src/lib/schemas";

if (!process.env.ADM_NASC_FILHO) {
  for (const tz of ["UTC", "America/Sao_Paulo"]) {
    const saida = execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/verificar-admissao-datas-nascimento.mts"], {
      env: { ...process.env, TZ: tz, ADM_NASC_FILHO: "1", HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8",
    });
    process.stdout.write(saida.split("\n").filter((l) => l.startsWith("OK") || l.startsWith("FALHA")).map((l) => `[${tz}] ${l}\n`).join(""));
    console.log(`[${tz}] ${saida.trim().split("\n").pop()}`);
  }
  process.exit(0);
}

congelarData("2026-11-19T01:30:00Z"); // 18/11/2026 22:30 em Brasília
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

type Mod = Pick<typeof real, "admissaoDadosPessoaisSchema" | "admissaoDependenteCreateSchema" | "admissaoDependenteUpdateSchema" | "admissaoDadosPessoaisAdminUpdateSchema">;
const aceita = (schema: { safeParse: (v: unknown) => { success: boolean } }, campo: Record<string, unknown>) => schema.safeParse(campo).success;

// Devolve a primeira falha ou null (as mesmas provas rodam no schema real e no antigo).
function provar(m: Mod): string | null {
  const titular = (v: unknown) => aceita(m.admissaoDadosPessoaisSchema, { data_nascimento: v });
  const dependente = (v: unknown) => aceita(m.admissaoDependenteCreateSchema, { nome: "Filho", data_nascimento: v });
  const parcial = (v: unknown) => aceita(m.admissaoDependenteUpdateSchema, { data_nascimento: v }) && aceita(m.admissaoDadosPessoaisAdminUpdateSchema, { data_nascimento: v });
  for (const [rotulo, f] of [["titular", titular], ["dependente", dependente], ["edição parcial", parcial]] as const) {
    for (const bom of ["1900-01-01", "1990-05-05", "2026-11-18", "2000-02-29", "", "   ", null, undefined]) if (!f(bom)) return `${rotulo}: deveria aceitar ${JSON.stringify(bom)}`;
    for (const ruim of ["1899-12-31", "2979-09-16", "9999-12-31", "2026-11-19", "2027-01-01", "2026-02-30", "2026-13-01", "2025-02-29", "18/11/2020", "abc", "2020-1-1", 12345]) if (f(ruim)) return `${rotulo}: deveria recusar ${JSON.stringify(ruim)}`;
  }
  const r = m.admissaoDadosPessoaisSchema.safeParse({ data_nascimento: "" });
  if (!r.success || (r.data as { data_nascimento?: unknown }).data_nascimento !== null) return `"" deveria virar null`;
  const d = m.admissaoDependenteCreateSchema.safeParse({ nome: "X", data_nascimento: " 2020-01-02 " });
  if (!d.success || (d.data as { data_nascimento?: unknown }).data_nascimento !== "2020-01-02") return "espaços nas pontas deveriam ser aparados";
  const msg = m.admissaoDependenteCreateSchema.safeParse({ nome: "X", data_nascimento: "2979-09-16" });
  if (msg.success || !JSON.stringify(msg.error.issues).includes("entre 01/01/1900 e hoje")) return "mensagem de erro clara em português";
  return null;
}

await ok("schemas reais: nascimento do titular e do dependente = data real entre 1900-01-01 e hoje (Brasília); 2979, 1899, amanhã, 30/02 e formatos errados recusados; '' e null aceitos", () => {
  assert.equal(provar(real), null);
});

await ok("'hoje' é o de Brasília: 19/11 em UTC (ainda 18/11 em Brasília) — 2026-11-18 passa e 2026-11-19 é futuro", () => {
  assert.equal(aceita(real.admissaoDependenteCreateSchema, { nome: "X", data_nascimento: "2026-11-18" }), true);
  assert.equal(aceita(real.admissaoDependenteCreateSchema, { nome: "X", data_nascimento: "2026-11-19" }), false);
});

await ok("as rotas de admissão usam estes schemas (candidato por token e analista), então a regra vale nos dois caminhos", () => {
  const usos: [string, string][] = [
    ["src/app/api/admissoes/token/[token]/dependentes/route.ts", "admissaoDependenteCreateSchema"], ["src/app/api/admissoes/[id]/dependentes/route.ts", "admissaoDependenteCreateSchema"],
    ["src/app/api/admissoes/[id]/dependentes/[depId]/route.ts", "admissaoDependenteUpdateSchema"],
  ];
  for (const [arq, schema] of usos) assert.ok(fs.readFileSync(arq, "utf8").includes(`parseBody(${schema}`), arq);
  const sch = fs.readFileSync("src/lib/schemas.ts", "utf8");
  // só o trecho dos schemas da admissão (outros schemas, como o do editor de funcionários, também usam dataNascimentoSchema)
  const trecho = sch.slice(sch.indexOf("export const admissaoDadosPessoaisSchema"), sch.indexOf("export const admissaoDependenteUpdateSchema"));
  assert.equal(trecho.split("data_nascimento: dataNascimentoSchema,").length, 3, "titular e dependente");
  assert.ok(!trecho.includes("data_nascimento: optStr"), "nenhum nascimento da admissão em texto livre");
});

await ok("prova de falha: o schema ANTIGO (texto livre, optStr) é reprovado pelas mesmas provas (aceita 2979)", async () => {
  const origem = fs.readFileSync("src/lib/schemas.ts", "utf8");
  assert.ok(origem.split("data_nascimento: dataNascimentoSchema,").length >= 3);
  const copia = "src/lib/__sab_schemas_nasc.ts";
  fs.writeFileSync(copia, origem.split("data_nascimento: dataNascimentoSchema,").join("data_nascimento: optStr,"));
  try {
    const antigo = (await import(`../${copia}`)) as Mod;
    const falha = provar(antigo);
    assert.ok(falha, "o schema antigo deveria reprovar");
    console.log(`   schema antigo reprovado: ${falha}`);
  } finally { fs.rmSync(copia, { force: true }); }
});

console.log(`\n${n} verificações OK`);
