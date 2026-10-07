// Verificação da trava de duplicidade de clientes: worktree da main + branch, cenários comuns lado a lado
// (devem ser idênticos) e asserções só da branch.
//   node scripts/harness-mot/run-clientes.mjs [--manter]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const BRANCH_ROOT = path.resolve(import.meta.dirname, "../..");
const MAIN_ROOT = process.env.HARNESS_MAIN_ROOT ?? "/tmp/salmazos-main-worktree";
const manter = process.argv.includes("--manter");
const git = (...args) => execFileSync("git", args, { cwd: BRANCH_ROOT, encoding: "utf8" });

if (!existsSync(MAIN_ROOT)) {
  git("worktree", "add", "--detach", MAIN_ROOT, "main");
  symlinkSync(path.join(BRANCH_ROOT, "node_modules"), path.join(MAIN_ROOT, "node_modules"));
}

function rodar(root, script) {
  return spawnSync(process.execPath, ["--no-warnings", "--import", path.join(BRANCH_ROOT, "scripts/harness-mot/register.mjs"), path.join(BRANCH_ROOT, "scripts/harness-mot", script)], {
    cwd: root, env: { ...process.env, HARNESS_ROOT: root, NODE_ENV: "production" }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
}
const extrai = (r) => {
  const linha = r.stdout.split("\n").find((l) => l.startsWith("RESULTADO_JSON:"));
  if (!linha) throw new Error(`sem resultado:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(linha.slice("RESULTADO_JSON:".length));
};

console.log(`main   = ${git("rev-parse", "main").trim()} (${MAIN_ROOT})`);
console.log(`branch = ${git("rev-parse", "--abbrev-ref", "HEAD").trim()} (${BRANCH_ROOT})\n`);
console.log("== 1) Cenários COMUNS: main x branch (sem campo de identidade / sem coincidência = idêntico) ==");
const daMain = extrai(rodar(MAIN_ROOT, "cenarios-clientes-comuns.mjs"));
const daBranch = extrai(rodar(BRANCH_ROOT, "cenarios-clientes-comuns.mjs"));
let diferentes = 0;
for (const nome of Object.keys(daMain)) {
  const igual = isDeepStrictEqual(daMain[nome], daBranch[nome]);
  const excecao = daMain[nome]?.EXCECAO || daBranch[nome]?.EXCECAO;
  if (!igual || excecao) {
    diferentes++;
    console.log(`DIFERE ${nome}\n   main:   ${JSON.stringify(daMain[nome]).slice(0, 700)}\n   branch: ${JSON.stringify(daBranch[nome]).slice(0, 700)}`);
  } else console.log(`IGUAL  ${nome}`);
}
console.log(`\n${Object.keys(daMain).length - diferentes}/${Object.keys(daMain).length} idênticos${diferentes ? " — HÁ DIFERENÇAS" : ""}`);

console.log("\n== 2) Cenários só da BRANCH (asserções) ==");
const b = rodar(BRANCH_ROOT, "cenarios-clientes-branch.mjs");
process.stdout.write(b.stdout);
if (b.stderr.trim()) process.stderr.write(b.stderr.split("\n").filter((l) => !l.startsWith("[")).join("\n"));

if (!manter) git("worktree", "remove", "--force", MAIN_ROOT);
process.exitCode = diferentes || b.status ? 1 : 0;
