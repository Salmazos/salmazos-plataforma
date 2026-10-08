// Orquestra a verificação da edição de indicação pelo cliente: worktree da origin/main + branch, mesmos cenários
// "comuns" lado a lado (criação válida, decisão sem edição, listagem sem edição) e depois os cenários só da branch.
//   node scripts/harness-mot/run-indicacao.mjs            (cria/remove o worktree da main em /tmp)
//   node scripts/harness-mot/run-indicacao.mjs --manter   (deixa o worktree pra inspeção)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const BRANCH_ROOT = path.resolve(import.meta.dirname, "../..");
const MAIN_ROOT = process.env.HARNESS_MAIN_ROOT ?? "/tmp/salmazos-main-worktree-indicacao";
const BASE = process.env.HARNESS_BASE ?? "origin/main";
const manter = process.argv.includes("--manter");
const git = (...args) => execFileSync("git", args, { cwd: BRANCH_ROOT, encoding: "utf8" });

if (!existsSync(MAIN_ROOT)) {
  git("worktree", "add", "--detach", MAIN_ROOT, BASE);
  symlinkSync(path.join(BRANCH_ROOT, "node_modules"), path.join(MAIN_ROOT, "node_modules"));
}

function rodar(root, script) {
  return spawnSync(process.execPath, ["--no-warnings", "--import", path.join(BRANCH_ROOT, "scripts/harness-mot/register.mjs"), path.join(BRANCH_ROOT, "scripts/harness-mot", script)], {
    cwd: root,
    env: { ...process.env, HARNESS_ROOT: root, NODE_ENV: "production" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
const extrai = (r) => {
  const linha = r.stdout.split("\n").find((l) => l.startsWith("RESULTADO_JSON:"));
  if (!linha) throw new Error(`sem resultado:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(linha.slice("RESULTADO_JSON:".length));
};

console.log(`base   = ${BASE} ${git("rev-parse", BASE).trim()} (${MAIN_ROOT})`);
console.log(`branch = ${git("rev-parse", "--abbrev-ref", "HEAD").trim()} ${git("rev-parse", "HEAD").trim()} (${BRANCH_ROOT})\n`);

console.log("== 1) Cenários COMUNS: base x branch (sem edição = idêntico ao de hoje) ==");
const daMain = extrai(rodar(MAIN_ROOT, "cenarios-indicacao-comuns.mjs"));
const daBranch = extrai(rodar(BRANCH_ROOT, "cenarios-indicacao-comuns.mjs"));
let diferentes = 0;
for (const nome of Object.keys(daMain)) {
  const igual = isDeepStrictEqual(daMain[nome], daBranch[nome]);
  const excecao = daMain[nome]?.EXCECAO || daBranch[nome]?.EXCECAO;
  if (!igual || excecao) {
    diferentes++;
    console.log(`DIFERE ${nome}`);
    console.log(`   base:   ${JSON.stringify(daMain[nome]).slice(0, 900)}`);
    console.log(`   branch: ${JSON.stringify(daBranch[nome]).slice(0, 900)}`);
  } else {
    console.log(`IGUAL  ${nome}`);
  }
}
console.log(`\n${Object.keys(daMain).length - diferentes}/${Object.keys(daMain).length} idênticos${diferentes ? " — HÁ DIFERENÇAS" : ""}`);

console.log("\n== 2) Cenários só da BRANCH (asserções) ==");
const b = rodar(BRANCH_ROOT, "cenarios-indicacao-branch.mjs");
process.stdout.write(b.stdout);
if (b.stderr.trim()) process.stderr.write(b.stderr.split("\n").filter((l) => !l.startsWith("[")).join("\n"));

if (!manter) git("worktree", "remove", "--force", MAIN_ROOT);
process.exitCode = diferentes || b.status ? 1 : 0;
