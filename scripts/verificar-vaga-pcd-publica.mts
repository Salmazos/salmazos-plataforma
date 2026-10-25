// Vaga PCD na parte pública (listagem e página da vaga): o selo "Vaga PCD" só aparece quando pcd = true, nunca a palavra por extenso.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-vaga-pcd-publica.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { criarDb } from "./harness-mot/memdb.mjs";
import VagasPublicaPage from "../src/app/vagas/page";
import VagaPublicaPage, { generateMetadata } from "../src/app/vagas/[slug]/page";
import SeloPcd from "../src/components/SeloPcd";
import { ROTULO_PCD_PUBLICO, selecionarComPcd, tituloPublicoDaVaga, vagaEhPcd } from "../src/lib/vagaPcdPublica";
import { vagaCreateSchema, parseBody } from "../src/lib/schemas";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  await fn();
  total++;
  console.log(`OK    ${nome}`);
}
const lerFonte = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");
const PROIBIDA = /defici[eê]ncia/i;

const vaga = (id: string, extra: Record<string, unknown> = {}) => ({
  id, slug: `vaga-${id}`, titulo: `Cargo ${id}`, cidade: "Campinas", estado: "SP", salario: "2500", adicionais_salariais: null, tipo_servico: "recrutamento_selecao",
  requisitos: "• Ensino Médio", beneficios: null, principais_atividades: null, horario: null, observacoes: "interno", status: "aberta", visivel_publicamente: true, pcd: false, ...extra,
});
function usarBanco(vagas: Record<string, unknown>[]) {
  (globalThis as any).__DB__ = criarDb({ vagas });
}
// Acha, na árvore devolvida pela página, o primeiro elemento com a prop pedida (os componentes de cliente viram stub no harness).
function acharProps(n: ReactNode, chave: string): Record<string, any> | null {
  if (Array.isArray(n)) {
    for (const x of n) {
      const r = acharProps(x as ReactNode, chave);
      if (r) return r;
    }
    return null;
  }
  if (n && typeof n === "object" && "props" in n) {
    const props = (n as { props: Record<string, any> }).props;
    if (props && chave in props) return props;
    return acharProps(props?.children, chave);
  }
  return null;
}
const paginaDaLista = async () => acharProps((await VagasPublicaPage()) as ReactNode, "vagas")!.vagas as { id: string; pcd?: boolean }[];
const paginaDaVaga = async (slug: string) => renderToStaticMarkup((await VagaPublicaPage({ params: Promise.resolve({ slug }) })) as ReactNode);
const contar = (html: string, texto: string) => html.split(texto).length - 1;

// ── Lib ──────────────────────────────────────────────────────────────────────
await caso("selo neutro 'Vaga PCD': só o rótulo com a sigla; só pcd === true marca", () => {
  assert.equal(ROTULO_PCD_PUBLICO, "Vaga PCD");
  assert.equal(vagaEhPcd({ pcd: true }), true);
  for (const v of [{ pcd: false }, { pcd: null }, { pcd: "true" }, { pcd: 1 }, {}, null, undefined]) assert.equal(vagaEhPcd(v as never), false, JSON.stringify(v));
  assert.equal(tituloPublicoDaVaga("Auxiliar", true), "Auxiliar (Vaga PCD) | Salmazos RH & Serviços");
  assert.equal(tituloPublicoDaVaga("Auxiliar", false), "Auxiliar");
});
await caso("leitura com pcd: tenta com a coluna e, se o banco ainda não a tem, repete sem ela (o site não cai)", async () => {
  const chamadas: string[] = [];
  const ok = await selecionarComPcd<number[]>(async (colunas) => { chamadas.push(colunas); return { data: [1], error: null }; }, "id, titulo");
  assert.deepEqual(chamadas, ["id, titulo, pcd"]);
  assert.deepEqual([ok.data, ok.comPcd], [[1], true]);
  const semColuna: string[] = [];
  const r = await selecionarComPcd<number[]>(async (colunas) => { semColuna.push(colunas); return colunas.includes("pcd") ? { data: null, error: { code: "42703" } } : { data: [2], error: null }; }, "id, titulo");
  assert.deepEqual(semColuna, ["id, titulo, pcd", "id, titulo"]);
  assert.deepEqual([r.data, r.comPcd], [[2], false]);
});

// ── Selo ─────────────────────────────────────────────────────────────────────
await caso("selo: só 'Vaga PCD' (a sigla), nos dois fundos; nunca a palavra por extenso", () => {
  for (const escuro of [false, true]) {
    const html = renderToStaticMarkup(createElement(SeloPcd, { sobreFundoEscuro: escuro }));
    assert.equal(contar(html, "Vaga PCD"), 1);
    assert.equal(html.replace(/<[^>]+>/g, ""), "Vaga PCD", "o texto do selo é só o rótulo");
    assert.ok(!PROIBIDA.test(html));
  }
});

// ── Listagem ─────────────────────────────────────────────────────────────────
// (O <Link> do Next vira stub no harness e não desenha o cartão; por isso o cartão é conferido pela leitura e pelo código-fonte.)
await caso("listagem: a leitura traz pcd e cada vaga chega à lista com pcd true só quando marcada (null e false = sem selo)", async () => {
  usarBanco([vaga("1", { pcd: true }), vaga("2", { pcd: false }), vaga("3", { pcd: null }), vaga("4", { pcd: true, visivel_publicamente: false }), vaga("5", { pcd: true, status: "fechada" })]);
  const lista = await paginaDaLista();
  assert.deepEqual(lista.map((v) => [v.id, v.pcd]), [["1", true], ["2", false], ["3", false]], "só as abertas e visíveis; pcd booleano");
});
await caso("cartão da listagem: a lista repassa pcd ao cartão e o cartão mostra o selo antes do título, só quando pcd", () => {
  assert.ok(lerFonte("src/components/VagasListaClient.tsx").includes("pcd={v.pcd === true}"));
  const card = lerFonte("src/components/VagaCard.tsx");
  assert.ok(card.includes("{pcd && <SeloPcd />}"));
  assert.ok(card.indexOf("{pcd && <SeloPcd />}") < card.indexOf("<h2"), "selo acima do título");
  assert.ok(lerFonte("src/app/vagas/page.tsx").includes("pcd: vagaEhPcd(v)"));
});

// ── Página da vaga ───────────────────────────────────────────────────────────
const temSelo = async (slug: string) => acharProps((await VagaPublicaPage({ params: Promise.resolve({ slug }) })) as ReactNode, "sobreFundoEscuro") !== null;
await caso("página da vaga: o selo aparece só quando pcd = true; o resto da página e a palavra por extenso não mudam", async () => {
  usarBanco([vaga("1", { pcd: true }), vaga("2", { pcd: false }), vaga("3", { pcd: null })]);
  assert.equal(await temSelo("vaga-1"), true);
  assert.equal(await temSelo("vaga-2"), false);
  assert.equal(await temSelo("vaga-3"), false);
  for (const slug of ["vaga-1", "vaga-2"]) {
    const html = await paginaDaVaga(slug);
    assert.ok(html.includes("Requisitos") && !PROIBIDA.test(html) && !html.includes("PCD"), slug);
  }
});
await caso("página da vaga: o selo fica no topo, logo abaixo do título e antes do corpo; a marca não é repetida nos requisitos", async () => {
  const f = lerFonte("src/app/vagas/[slug]/page.tsx");
  const titulo = f.indexOf("{vaga.titulo}\n            </h1>");
  const selo = f.indexOf("{vagaEhPcd(vaga) && <SeloPcd sobreFundoEscuro />}");
  const info = f.indexOf("{/* Info grid */}");
  assert.ok(titulo > 0 && selo > titulo && info > selo, "título, selo, depois o corpo");
  usarBanco([vaga("1", { pcd: true, requisitos: "• Ensino Médio\n• Habilitação categoria B" })]);
  const html = await paginaDaVaga("vaga-1");
  assert.ok(html.includes("Habilitação categoria B") && !html.slice(html.indexOf("Requisitos")).includes("PCD"));
});
await caso("título e compartilhamento: vaga PCD leva a sigla; as demais mantêm o título do site (metadata vazia); vaga inexistente também", async () => {
  usarBanco([vaga("1", { pcd: true }), vaga("2", { pcd: false })]);
  const pcd = await generateMetadata({ params: Promise.resolve({ slug: "vaga-1" }) });
  assert.equal(pcd.title, "Cargo 1 (Vaga PCD) | Salmazos RH & Serviços");
  assert.equal((pcd.openGraph as { title?: string }).title, "Cargo 1 (Vaga PCD) | Salmazos RH & Serviços");
  assert.ok(!PROIBIDA.test(JSON.stringify(pcd)));
  assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: "vaga-2" }) }), {});
  assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: "nao-existe" }) }), {});
});
await caso("página da vaga: acesso pelo id redireciona para o slug; sem slug renderiza; inexistente = 404", async () => {
  usarBanco([vaga("1", { pcd: true }), vaga("9", { slug: null, pcd: true })]);
  await assert.rejects(paginaDaVaga("1"), /REDIRECT:\/vagas\/vaga-1/);
  assert.equal(await temSelo("9"), true);
  await assert.rejects(paginaDaVaga("nao-existe"), /NOT_FOUND/);
});

// ── Regras do texto público e das escritas ───────────────────────────────────
await caso("nada público contém a palavra por extenso: fontes das páginas, do cartão, da lista e da lib; e as leituras públicas não trazem dados do perfil", () => {
  for (const arquivo of ["src/app/vagas/page.tsx", "src/app/vagas/[slug]/page.tsx", "src/components/VagaCard.tsx", "src/components/VagasListaClient.tsx", "src/components/SeloPcd.tsx", "src/lib/vagaPcdPublica.ts"]) {
    assert.ok(!PROIBIDA.test(lerFonte(arquivo)), arquivo);
  }
  for (const arquivo of ["src/app/vagas/page.tsx", "src/app/vagas/[slug]/page.tsx"]) {
    const f = lerFonte(arquivo);
    assert.ok(!/perfil_extra|sexo|idade_m|habilitacao_categoria|local_trabalho/.test(f), `${arquivo}: sem dados do perfil`);
  }
});
await caso("escrita: schema aceita pcd boolean (padrão false); POST e PATCH gravam; a criação audita pcd; a conversão da solicitação grava pcd; a importação do Excel não é tocada", () => {
  const base = { titulo: "Auxiliar", tipo_servico: "recrutamento_selecao", num_posicoes: 1, responsavel: "Ana" };
  const ok = parseBody(vagaCreateSchema, { ...base, pcd: true });
  assert.ok(ok.success && ok.data.pcd === true);
  const padrao = parseBody(vagaCreateSchema, base);
  assert.ok(padrao.success && padrao.data.pcd === false);
  assert.equal(parseBody(vagaCreateSchema, { ...base, pcd: "sim" }).success, false);
  assert.ok(lerFonte("src/app/api/vagas/route.ts").includes("pcd: body.pcd === true,"));
  assert.ok(lerFonte("src/app/api/vagas/route.ts").includes("pcd: data.pcd === true"));
  assert.ok(lerFonte("src/app/api/vagas/[id]/route.ts").includes("if (body.pcd !== undefined)"));
  assert.ok(lerFonte("src/app/api/vagas/from-solicitacao/route.ts").includes('pcd: sol.perfil_extra?.pcd === "sim",'));
  assert.ok(!lerFonte("src/app/api/vagas/importar/route.ts").includes("pcd"));
  for (const modal of ["src/components/ModalNovaVaga.tsx", "src/components/ModalEditarVaga.tsx"]) {
    const f = lerFonte(modal);
    assert.ok(f.includes("checked={form.pcd}") && f.includes(">Vaga PCD<"), modal);
  }
});

console.log(`\n${total} casos OK`);
