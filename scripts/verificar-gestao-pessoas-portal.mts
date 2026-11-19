// Gestão de Pessoas no portal do cliente.
//  - RH idêntico: o HTML do RH (para os mesmos dados) é igual ao congelado ANTES do refactor `modo` (fixtures/gestao-pessoas-rh.golden.json);
//  - portal: o cliente_id vem SÓ da sessão (?cliente=B ignorado; sem vínculo, usuário do painel, cliente inativo e vínculo duplo saem para o login);
//  - payload ao navegador sem ids (funcionario/admissão/cliente) nem CPF/RG/PIS; só ativos; mesmos números do RH para o mesmo cliente;
//  - textos: "Dado não cadastrado" só quando há legado, nota, aviso por gráfico sem nenhum dado, nenhum texto interno do RH, gráficos para 1 a 4 ativos;
//  - provas de falha: as MESMAS provas reprovam páginas/carregadores sabotados (sem filtro de cliente, cliente vindo da URL, id no payload, sem filtro de status);
//  - varredura estática da página (sem searchParams/params) e menu.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-gestao-pessoas-portal.mts
//   (sem GP_PORTAL_FILHO o script roda a si mesmo sob TZ=UTC e TZ=America/Sao_Paulo; o relógio fica em 18/11/2026 22:30 em Brasília = 19/11 em UTC)
// Regerar o congelado do RH (só com o componente do RH sem mudança de saída): GERAR_GOLDEN=1 <mesmo comando>
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData } from "./harness-mot/ambiente.mjs";
import GestaoPessoasClient from "../src/components/GestaoPessoasClient";
import { CASOS_RH } from "./gestao-pessoas-fixtures.mts";

const GOLDEN = "scripts/fixtures/gestao-pessoas-rh.golden.json";
const AGORA = "2026-11-19T01:30:00Z"; // 18/11/2026 22:30 em Brasília
const HOJE = "2026-11-18";

if (!process.env.GP_PORTAL_FILHO && process.env.GERAR_GOLDEN !== "1") {
  for (const tz of ["UTC", "America/Sao_Paulo"]) {
    const saida = execFileSync(process.execPath, ["--no-warnings", "--import", "./scripts/harness-mot/register.mjs", "scripts/verificar-gestao-pessoas-portal.mts"], {
      env: { ...process.env, TZ: tz, GP_PORTAL_FILHO: "1", HARNESS_COMPONENTES_REAIS: "1" }, encoding: "utf8",
    });
    process.stdout.write(saida.split("\n").filter((l) => l.startsWith("OK") || l.startsWith("FALHA")).map((l) => `[${tz}] ${l}\n`).join(""));
    console.log(`[${tz}] ${saida.trim().split("\n").pop()}`);
  }
  process.exit(0);
}

congelarData(AGORA);
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");

const htmlRH = (props: (typeof CASOS_RH)[number][1], extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(GestaoPessoasClient, { ...props, ...extra } as never));

if (process.env.GERAR_GOLDEN === "1") {
  const out: Record<string, string> = {};
  for (const [nome, props] of CASOS_RH) out[nome] = htmlRH(props);
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + "\n");
  console.log(`congelado: ${Object.keys(out).length} casos em ${GOLDEN}`);
  process.exit(0);
}

// ── RH idêntico ──────────────────────────────────────────────────────────────
await ok("RH idêntico: o HTML renderizado dos 9 casos é igual ao de antes do refactor (sem a prop modo e com modo=\"rh\")", () => {
  const golden = JSON.parse(fonte(GOLDEN)) as Record<string, string>;
  assert.equal(Object.keys(golden).length, CASOS_RH.length);
  for (const [nome, props] of CASOS_RH) {
    assert.ok(golden[nome], `congelado existe: ${nome}`);
    assert.equal(htmlRH(props), golden[nome], `sem modo: ${nome}`);
    assert.equal(htmlRH(props, { modo: "rh" }), golden[nome], `modo=rh: ${nome}`);
  }
  assert.ok(golden[CASOS_RH[1][0]].includes("Agregado de poucas pessoas, uso interno do RH"), "o aviso do RH continua");
  assert.ok(golden[CASOS_RH[0][0]].includes("Corrija na admissão da pessoa"), "o aviso de inconsistente do RH continua");
  assert.ok(golden[CASOS_RH[0][0]].includes("Escolha uma empresa"), "o seletor do RH continua");
  assert.ok(golden[CASOS_RH[0][0]].includes(">Não informado<"), "o RH continua com 'Não informado'");
});

console.log(`
${n} verificações OK`);
