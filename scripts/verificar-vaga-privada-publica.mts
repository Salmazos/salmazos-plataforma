// Vaga PRIVADA (visivel_publicamente=false) na parte pública do site: a página /vagas/[slug] devolve 404 (por slug e por id, sem vazar título, salário nem
// horário), o redirecionamento id → slug só vale para vaga pública, a candidatura do formulário público a vaga privada é recusada com mensagem genérica
// e o "Compartilhar" do painel some na vaga privada. Vagas públicas (abertas, fechadas, canceladas, pausadas), listagem e portal não mudam.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-vaga-privada-publica.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { criarDb } from "./harness-mot/memdb.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, novoDb } from "./harness-mot/ambiente.mjs";
import VagasPublicaPage from "../src/app/vagas/page";
import VagaPublicaPage, { generateMetadata } from "../src/app/vagas/[slug]/page";
import BotaoCompartilharVaga, { TEXTO_VAGA_PRIVADA } from "../src/components/BotaoCompartilharVaga";
import { conferirVagasPublicas } from "../src/lib/vagaVisibilidade";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  await fn();
  total++;
  console.log(`OK    ${nome}`);
}
const lerFonte = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");

const ID_PUB = "11111111-1111-4111-8111-111111111111", ID_PRIV = "22222222-2222-4222-8222-222222222222", ID_FECHADA = "33333333-3333-4333-8333-333333333333";
const ID_CANC = "44444444-4444-4444-8444-444444444444", ID_PAUSADA = "55555555-5555-4555-8555-555555555555", ID_PRIV_ABERTA = "66666666-6666-4666-8666-666666666666";
const vaga = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
  id, slug, titulo: `Cargo ${slug}`, cidade: "Campinas", estado: "SP", salario: "R$ 2.500,00", adicionais_salariais: null, tipo_servico: "recrutamento_selecao",
  requisitos: "• Ensino Médio", beneficios: null, principais_atividades: null, horario: "08h às 17h", observacoes: "interno", status: "aberta", visivel_publicamente: true, pcd: false, ...extra,
});
const VAGAS = [
  vaga(ID_PUB, "vaga-publica"),
  vaga(ID_FECHADA, "vaga-fechada", { status: "fechada" }), vaga(ID_CANC, "vaga-cancelada", { status: "cancelada" }), vaga(ID_PAUSADA, "vaga-pausada", { status: "pausada" }),
  vaga(ID_PRIV, "vaga-privada-segredo", { titulo: "Titulo Privado Secreto", salario: "R$ 9.999,00", horario: "Horario Privado 22h", visivel_publicamente: false }),
  vaga(ID_PRIV_ABERTA, "operador-de-serra", { visivel_publicamente: false }),
];
const usarBanco = () => { (globalThis as any).__DB__ = criarDb({ vagas: VAGAS.map((v) => ({ ...v })) }); };
const pagina = async (slug: string) => renderToStaticMarkup((await VagaPublicaPage({ params: Promise.resolve({ slug }) })) as ReactNode);
async function resultado(slug: string): Promise<{ html: string } | { erro: string }> {
  try { return { html: await pagina(slug) }; } catch (e) { return { erro: e instanceof Error ? e.message : String(e) }; }
}

// ── Página /vagas/[slug] ─────────────────────────────────────────────────────
await caso("vaga PÚBLICA aberta abre por slug (título, salário e horário aparecem, com o formulário)", async () => {
  usarBanco();
  const r = await resultado("vaga-publica") as { html: string };
  assert.ok(r.html, JSON.stringify(r));
  assert.ok(r.html.includes("Cargo vaga-publica") && r.html.includes("R$ 2.500,00") && r.html.includes("08h às 17h"));
  assert.equal(r.html.includes("Vaga encerrada"), false);
});

await caso("vagas públicas FECHADA, CANCELADA e PAUSADA seguem abrindo, com o aviso de cada uma", async () => {
  usarBanco();
  const fechada = await resultado("vaga-fechada") as { html: string };
  assert.ok(fechada.html.includes("Vaga encerrada") && fechada.html.includes("não está mais recebendo candidaturas"));
  const cancelada = await resultado("vaga-cancelada") as { html: string };
  assert.ok(cancelada.html.includes("Vaga encerrada"));
  const pausada = await resultado("vaga-pausada") as { html: string };
  assert.ok(pausada.html.includes("Vaga pausada") && pausada.html.includes("temporariamente pausada"));
});

await caso("vaga PRIVADA por SLUG: 404, e nada dela vaza (a página nem chega a ser montada)", async () => {
  usarBanco();
  for (const slug of ["vaga-privada-segredo", "operador-de-serra"]) {
    const r = await resultado(slug);
    assert.deepEqual(r, { erro: "NOT_FOUND" }, slug);
  }
});

await caso("vaga PRIVADA por ID: 404 também (o id não vira atalho), e o redirecionamento id → slug NÃO acontece", async () => {
  usarBanco();
  assert.deepEqual(await resultado(ID_PRIV), { erro: "NOT_FOUND" });
  assert.deepEqual(await resultado(ID_PRIV_ABERTA), { erro: "NOT_FOUND" });
});

await caso("redirecionamento id → slug continua só para vaga PÚBLICA", async () => {
  usarBanco();
  assert.deepEqual(await resultado(ID_PUB), { erro: "REDIRECT:/vagas/vaga-publica" });
  assert.deepEqual(await resultado(ID_FECHADA), { erro: "REDIRECT:/vagas/vaga-fechada" });
});

await caso("metadados da vaga privada: vazios (não montam título nem Open Graph com dados dela)", async () => {
  usarBanco();
  assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: "vaga-privada-segredo" }) }), {});
  assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: ID_PRIV }) }), {});
});

await caso("slug inexistente segue 404 (comportamento de sempre)", async () => {
  usarBanco();
  assert.deepEqual(await resultado("nao-existe"), { erro: "NOT_FOUND" });
});

await caso("o filtro está nas DUAS consultas (slug e id) e vale também com e sem a coluna pcd (fonte)", () => {
  const f = lerFonte("src/app/vagas/[slug]/page.tsx");
  assert.equal((f.match(/\.eq\("visivel_publicamente", true\)/g) ?? []).length, 2);
  assert.ok(f.includes('.eq("slug", slug).eq("visivel_publicamente", true)') && f.includes('.eq("id", slug).eq("visivel_publicamente", true)'));
});

// ── Listagem e portal não mudam ──────────────────────────────────────────────
await caso("listagem /vagas: só abertas e públicas (como antes)", async () => {
  usarBanco();
  const el = (await VagasPublicaPage()) as ReactNode;
  const achar = (n: ReactNode): Record<string, any> | null => {
    if (Array.isArray(n)) { for (const x of n) { const r = achar(x as ReactNode); if (r) return r; } return null; }
    if (n && typeof n === "object" && "props" in n) { const p = (n as { props: Record<string, any> }).props; if (p && "vagas" in p) return p; return achar(p?.children); }
    return null;
  };
  const ids = (achar(el)!.vagas as { id: string }[]).map((v) => v.id);
  assert.deepEqual(ids, [ID_PUB]);
  const f = lerFonte("src/app/vagas/page.tsx");
  assert.ok(f.includes('.eq("status", "aberta")') && f.includes('.eq("visivel_publicamente", true)'));
});

await caso("portal do cliente não foi tocado: o link 'Ver vaga publicada' e a API das solicitações seguem sem filtro de visibilidade (as vagas das solicitações são públicas)", () => {
  assert.equal(lerFonte("src/app/api/portal/solicitacoes/route.ts").includes("visivel_publicamente"), false);
  assert.ok(lerFonte("src/app/portal/(app)/solicitacoes/page.tsx").includes("href={`/vagas/${s.vaga_slug}`}"));
});

// ── Candidatura pública ──────────────────────────────────────────────────────
await caso("conferirVagasPublicas: pública = ok; qualquer privada na lista = privada; ids que não são uuid são ignorados; sem ids = ok", async () => {
  const db = novoDb(); db.tabelas.vagas = VAGAS.map((v) => ({ ...v }));
  const svc = (await import("@/lib/supabase/server")).createServiceClient();
  assert.equal(await conferirVagasPublicas(svc, [ID_PUB]), "ok");
  assert.equal(await conferirVagasPublicas(svc, [ID_PUB, ID_PRIV]), "privada");
  assert.equal(await conferirVagasPublicas(svc, [ID_PRIV_ABERTA]), "privada");
  assert.equal(await conferirVagasPublicas(svc, ["x", 5, null, undefined]), "ok");
  assert.equal(await conferirVagasPublicas(svc, []), "ok");
  db.falhas["vagas.select"] = "boom";
  assert.equal(await conferirVagasPublicas(svc, [ID_PUB]), "erro", "não deu para conferir: não aceita");
});

const CANDIDATURA = (extra: Record<string, unknown> = {}) => ({ nome_completo: "Fulano de Tal", email: "", telefone: "(19) 99999-0000", cargo_pretendido: "Cargo", origem: "vaga_especifica", lgpd_consentimento: true, ...extra });
await caso("candidatura PÚBLICA a vaga PRIVADA é recusada (400, mensagem genérica, nada gravado); vale para vaga_id e para vaga_ids", async () => {
  congelarData();
  const R = await importar("src/app/api/candidatos/route.ts");
  for (const corpo of [{ vaga_id: ID_PRIV }, { vaga_id: ID_PUB, vaga_ids: [ID_PUB, ID_PRIV] }, { vaga_id: ID_PRIV_ABERTA, vaga_ids: [ID_PRIV_ABERTA] }]) {
    const db = novoDb(); db.tabelas.vagas = VAGAS.map((v) => ({ ...v })); db.tabelas.candidatos = []; logar(db, null);
    const r = await chamar(R.POST, { metodo: "POST", corpo: CANDIDATURA(corpo) });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal(r.corpo.error, "Não foi possível registrar a candidatura para esta vaga.");
    assert.equal(db.tabelas.candidatos.length, 0, "nada gravado");
    const texto = JSON.stringify(r.corpo);
    assert.equal(/Privad|Segredo|9\.999|serra|vaga-privada|privada/i.test(texto), false, "a resposta não revela dado da vaga nem que ela é privada");
  }
});

await caso("candidatura pública: falha ao conferir a visibilidade = 503 genérico, nada gravado (na dúvida, recusa)", async () => {
  const R = await importar("src/app/api/candidatos/route.ts");
  const db = novoDb(); db.tabelas.vagas = VAGAS.map((v) => ({ ...v })); db.tabelas.candidatos = []; logar(db, null);
  db.falhas["vagas.select"] = "boom";
  const r = await chamar(R.POST, { metodo: "POST", corpo: CANDIDATURA({ vaga_id: ID_PUB }) });
  assert.equal(r.status, 503); assert.equal(db.tabelas.candidatos.length, 0);
});

await caso("candidatura com sessão interna (cadastro rápido do painel) e sem vaga NÃO passam pela conferência (fonte; a rota completa não roda aqui para não chamar serviços externos)", () => {
  const f = lerFonte("src/app/api/candidatos/route.ts");
  assert.ok(f.includes("if (idsDeVaga.some((i) => typeof i === \"string\" && i)) {"), "sem vaga: nada a conferir");
  assert.ok(f.includes("if (!usuarioInterno) {") && f.includes("conferirVagasPublicas(supabase, idsDeVaga)"), "com sessão interna não confere");
  assert.ok(f.indexOf("conferirVagasPublicas(supabase, idsDeVaga)") < f.indexOf("detectarDuplicata(body, origemTipo)"), "a conferência vem ANTES de qualquer gravação");
  assert.ok(f.includes('"Não foi possível registrar a candidatura para esta vaga."') && f.includes("status: 400") && f.includes("status: 503"));
});

// ── Compartilhar no painel ───────────────────────────────────────────────────
await caso("Compartilhar: vaga PÚBLICA mostra o botão; vaga PRIVADA esconde o botão e explica; sem o campo (padrão do banco) = pública", () => {
  const html = (v: boolean | null | undefined) => renderToStaticMarkup(createElement(BotaoCompartilharVaga, { vagaId: ID_PUB, visivelPublicamente: v }));
  for (const v of [true, undefined, null]) {
    const h = html(v);
    assert.ok(h.includes("Compartilhar") && h.includes("<button"), String(v));
    assert.equal(h.includes(TEXTO_VAGA_PRIVADA), false);
  }
  const privada = html(false);
  assert.equal(privada.includes("<button"), false, "sem botão");
  assert.ok(privada.includes("Vaga privada: não tem página pública, por isso não há link para compartilhar."));
  const painel = lerFonte("src/components/VagaDetalheClient.tsx");
  assert.ok(painel.includes("<BotaoCompartilharVaga vagaId={vaga.id} visivelPublicamente={vaga.visivel_publicamente} />") && !painel.includes("handleCompartilhar"));
});

console.log(`\n${total} verificações OK`);
