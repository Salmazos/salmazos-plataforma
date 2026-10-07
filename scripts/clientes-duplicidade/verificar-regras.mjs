// Verifica as regras de duplicidade contra a fixture dos 46 clientes de 07/10/2026.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/clientes-duplicidade/verificar-regras.mjs
import { readFileSync } from "node:fs";
import { avaliarDuplicidade } from "@/lib/clienteDuplicidade";

const fx = JSON.parse(readFileSync(new URL("./fixture-clientes.json", import.meta.url), "utf8"));
const clientes = fx.linhas.map((l, i) => {
  const o = Object.fromEntries(fx.campos.map((c, k) => [c, l[k]]));
  return { id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, unidade_id: "u1", ...o };
});
const rot = (t) => t.trim().slice(0, 24).trim();
const rotulo = (c) => rot(c.nome);
const par = (a, b) => `${rot(a)} × ${rot(b)}`;

const pares = [];
for (let i = 0; i < clientes.length; i++) {
  for (let j = i + 1; j < clientes.length; j++) {
    const r = avaliarDuplicidade(clientes[i], [clientes[j]], { papelFull: false, unidadesPermitidas: "todas" });
    if (r) pares.push({ a: rotulo(clientes[i]), b: rotulo(clientes[j]), motivos: new Set(r.motivos), nivel: r.nivel, bloqueio: r.bloqueio });
  }
}
const com = (m) => pares.filter((p) => p.motivos.has(m));
const nomes = (l) => l.map((p) => `${p.a} × ${p.b}`).sort();

let falhas = 0;
function esperar(titulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify([...esperado].sort());
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${titulo}`);
  console.log(`      obtido:   ${JSON.stringify(obtido)}`);
  if (!ok) console.log(`      esperado: ${JSON.stringify([...esperado].sort())}`);
}

const NL = par("Natural Labour ", "NATURAL LABOUR (United Mills) LTDA");
const WGK = par("WGK Industria", "WGK Indústria Mecânica Ltda");
const HR = par("Hewitt Equipamentos", "Rogon Serviços de Gestão N. EIRELI");
esperar("nome parecido (só WGK e Natural Labour; Salmazos×Salmazos e Rosa×Rosakline NÃO)", nomes(com("nome")), [WGK, NL]);
esperar("CNPJ igual", nomes(com("cnpj")), [NL]);
const telEmail = pares.filter((p) => p.motivos.has("telefone") && p.motivos.has("email"));
esperar("telefone + e-mail (bloqueio)", nomes(telEmail), [NL, WGK, HR]);
esperar("só telefone", nomes(pares.filter((p) => p.motivos.has("telefone") && !p.motivos.has("email"))), [par("Cliente Teste", "Salmazos RH e Serviços Terceirizados Ltda.")]);
esperar("só e-mail", nomes(pares.filter((p) => p.motivos.has("email") && !p.motivos.has("telefone"))), [
  par("Rosakline | Odontologia | Saúde | Estética", "Arendelle Imóveis"),
  par("Rosakline | Odontologia | Saúde | Estética", "Fazendinha Resort Prive"),
  par("Arendelle Imóveis", "Fazendinha Resort Prive"),
]);
const nivelErrado = pares.filter((p) => (p.motivos.has("cnpj") && p.bloqueio !== "cnpj") || (p.motivos.has("telefone") && p.motivos.has("email") && !p.motivos.has("cnpj") && p.bloqueio !== "contato"));
if (nivelErrado.length) { falhas++; console.log("FALHA níveis de bloqueio", nivelErrado); } else console.log("OK   níveis: CNPJ=bloqueio cnpj; tel+e-mail=bloqueio contato");
console.log(`\n${pares.length} pares com algum sinal; falhas: ${falhas}`);
process.exit(falhas ? 1 : 0);
