// Orquestra a verificação das rotas: worktree da main + branch, mesmos cenários, comparação lado a lado.
//   node scripts/harness-mot/run.mjs            (cria/remove o worktree da main em /tmp)
//   node scripts/harness-mot/run.mjs --manter   (deixa o worktree pra inspeção)
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
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", path.join(BRANCH_ROOT, "scripts/harness-mot/register.mjs"), path.join(BRANCH_ROOT, "scripts/harness-mot", script)], {
    cwd: root,
    env: { ...process.env, HARNESS_ROOT: root, NODE_ENV: "production" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r;
}

console.log(`main   = ${git("rev-parse", "main").trim()} (${MAIN_ROOT})`);
console.log(`branch = ${git("rev-parse", "--abbrev-ref", "HEAD").trim()} (${BRANCH_ROOT})\n`);

console.log("== 1) Cenários COMUNS: main x branch (sem evento = idêntico) ==");
const extrai = (r) => {
  const linha = r.stdout.split("\n").find((l) => l.startsWith("RESULTADO_JSON:"));
  if (!linha) throw new Error(`sem resultado:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(linha.slice("RESULTADO_JSON:".length));
};
const daMain = extrai(rodar(MAIN_ROOT, "cenarios-comuns.mjs"));
const daBranch = extrai(rodar(BRANCH_ROOT, "cenarios-comuns.mjs"));
let diferentes = 0;
for (const nome of Object.keys(daMain)) {
  const igual = isDeepStrictEqual(daMain[nome], daBranch[nome]);
  const excecao = daMain[nome]?.EXCECAO || daBranch[nome]?.EXCECAO;
  if (!igual || excecao) {
    diferentes++;
    console.log(`DIFERE ${nome}`);
    console.log(`   main:   ${JSON.stringify(daMain[nome]).slice(0, 700)}`);
    console.log(`   branch: ${JSON.stringify(daBranch[nome]).slice(0, 700)}`);
  } else {
    console.log(`IGUAL  ${nome}`);
  }
}
console.log(`\n${Object.keys(daMain).length - diferentes}/${Object.keys(daMain).length} idênticos${diferentes ? " — HÁ DIFERENÇAS" : ""}`);

console.log("\n== 2) Cenários só da BRANCH (asserções) ==");
const b = rodar(BRANCH_ROOT, "cenarios-branch.mjs");
process.stdout.write(b.stdout);
if (b.stderr.trim()) process.stderr.write(b.stderr.split("\n").filter((l) => !l.startsWith("[")).join("\n"));

if (!manter) git("worktree", "remove", "--force", MAIN_ROOT);
process.exitCode = diferentes || b.status ? 1 : 0;
