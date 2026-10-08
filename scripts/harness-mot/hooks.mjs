// Hooks de ESM para rodar rotas e páginas do Next FORA do Next, contra um banco em memória:
//  - "@/..." vira <HARNESS_ROOT>/src/... (HARNESS_ROOT = checkout da branch OU de um worktree da main)
//  - import relativo sem extensão ("./garantiaRS") resolve .ts/.tsx, como o bundler faz
//  - .ts/.tsx é transpilado com o próprio TypeScript do projeto (JSX incluso)
//  - módulos que falariam com o mundo de fora (Supabase, next/*, e-mail) são trocados por mocks locais
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.HARNESS_ROOT ?? process.cwd());

const MOCKS = {
  "@/lib/supabase/server": "supabase-server.mjs",
  "@/lib/dispararAvisosRescisao": "disparar-avisos.mjs",
  "@vercel/functions": "vercel-functions.mjs",
  "@/lib/sendEmail": "send-email.mjs",
  "next/server": "next-server.mjs",
  "next/navigation": "next-navigation.mjs",
  "next/link": "stub-component.mjs",
};

function arquivo(base) {
  for (const sufixo of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidato = base + sufixo;
    if (existsSync(candidato) && statSync(candidato).isFile()) return pathToFileURL(candidato).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) {
    return { url: pathToFileURL(path.join(HARNESS_DIR, "mocks", MOCKS[specifier])).href, shortCircuit: true };
  }
  if (specifier.startsWith("@/components/")) {
    return { url: pathToFileURL(path.join(HARNESS_DIR, "mocks", "stub-component.mjs")).href, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const url = arquivo(path.join(ROOT, "src", specifier.slice(2)));
    if (url) return { url, shortCircuit: true };
  }
  const pai = context.parentURL ? fileURLToPath(context.parentURL) : null;
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && pai && !pai.includes("node_modules")) {
    const url = arquivo(path.resolve(path.dirname(pai), specifier));
    if (url) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file://") && /\.(ts|tsx)$/.test(url) && !url.includes("/node_modules/")) {
    const origem = fileURLToPath(url);
    const fonte = await readFile(origem, "utf8");
    const saida = ts.transpileModule(fonte, {
      fileName: origem,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    return { format: "module", source: saida.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
