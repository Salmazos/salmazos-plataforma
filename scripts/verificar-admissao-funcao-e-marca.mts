// Tela pública de admissão (link com token): marca "Salmazos RH" no topo e FUNÇÃO real no lugar da área do cadastro rápido ("Operacional").
//  - funcaoParaExibirNaAdmissao (função pura única): admissoes.funcao → título da vaga → cargo_pretendido; vazio/espaços não contam.
//  - A rota pública do token devolve funcao e nenhum campo a mais (colunas explícitas, sem select("*") na admissão).
//  - Mensagem de WhatsApp e e-mail do link usam a mesma função; texto da mensagem idêntico ao de antes (só o valor do cargo muda).
//  - Cabeçalho com a marca na tela de boas-vindas e em todos os passos.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-admissao-funcao-e-marca.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, importar, chamar } from "./harness-mot/ambiente.mjs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { criarDb } from "./harness-mot/memdb.mjs";
import { funcaoParaExibirNaAdmissao } from "../src/lib/admissaoFuncao";
import { linkAdmissaoWhatsapp } from "../src/lib/waLinks";
import CabecalhoMarca from "../src/components/admissao/CabecalhoMarca";

congelarData();
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const fonte = (p: string) => fs.readFileSync(p, "utf8");

await ok("função real prevalece sobre o título da vaga e sobre a área do cadastro rápido", () => {
  assert.equal(funcaoParaExibirNaAdmissao({ funcao: "Auxiliar de Produção", vagaTitulo: "Vaga Hortolândia", cargoPretendido: "Operacional" }), "Auxiliar de Produção");
  assert.equal(funcaoParaExibirNaAdmissao({ funcao: "  Motorista  ", cargoPretendido: "Operacional" }), "Motorista", "aparada");
});

await ok("sem função: cai no título da vaga (nunca na área)", () => {
  assert.equal(funcaoParaExibirNaAdmissao({ funcao: null, vagaTitulo: "Auxiliar Administrativo", cargoPretendido: "Operacional" }), "Auxiliar Administrativo");
  assert.equal(funcaoParaExibirNaAdmissao({ funcao: undefined, vagaTitulo: "Conferente", cargoPretendido: "Logistica" }), "Conferente");
});

await ok("sem função e sem título: cargo_pretendido só como último recurso", () => {
  assert.equal(funcaoParaExibirNaAdmissao({ funcao: null, vagaTitulo: null, cargoPretendido: "Operador de Máquina" }), "Operador de Máquina");
  assert.equal(funcaoParaExibirNaAdmissao({ cargoPretendido: "Operacional" }), "Operacional", "se não há mais nada, mostra o que houver");
  assert.equal(funcaoParaExibirNaAdmissao({}), "");
});

await ok("texto vazio ou só com espaços/quebras NÃO conta como função, título ou cargo", () => {
  for (const vazio of ["", "   ", "\n\t "]) {
    assert.equal(funcaoParaExibirNaAdmissao({ funcao: vazio, vagaTitulo: "Conferente", cargoPretendido: "Operacional" }), "Conferente", JSON.stringify(vazio));
    assert.equal(funcaoParaExibirNaAdmissao({ funcao: vazio, vagaTitulo: vazio, cargoPretendido: "Operador" }), "Operador");
    assert.equal(funcaoParaExibirNaAdmissao({ funcao: vazio, vagaTitulo: vazio, cargoPretendido: vazio }), "");
  }
});

// ── Rota pública do token ──
const TOKEN = "tok-admissao-1";
function banco(extra: Record<string, unknown> = {}) {
  const db = criarDb({
    admissoes: [{
      id: "adm-1", token: TOKEN, candidato_id: "cand-1", vaga_id: "vaga-1", unidade_id: "U1", modalidade: "mot", funcao: "Auxiliar de Produção", status: "aguardando_candidato",
      token_expira_em: "2027-01-01T00:00:00Z", token_usado_em: null, criado_em: "2026-11-01T10:00:00Z",
      // colunas que NÃO podem ir para a tela pública
      salario: 1850, tipo_salario: "mensal", horario_trabalho: "Segunda a Sexta, 08h00 às 17h00", entidade_contratante: "Salmazos", adicionais: "VR", criado_por: "user-1", ...extra,
    }],
    candidatos: [{ id: "cand-1", nome_completo: "Maria Silva", cargo_pretendido: "Operacional", cpf: "123.456.789-09", telefone: "(19) 99999-0000", email: "maria@exemplo.com" }],
    vagas: [{ id: "vaga-1", titulo: "Auxiliar de Produção - Hortolândia", unidade_id: "U1", cliente_id: "c-1" }],
    admissao_dados_pessoais: [], admissao_dependentes: [], admissao_documentos: [], admissao_vale_transporte: [],
  });
  (globalThis as any).__DB__ = db;
  (globalThis as any).__PENDENTES__ = [];
  return db;
}

await ok("rota pública do token: devolve funcao e NENHUMA coluna a mais da admissão (sem salário, horário, unidade, criador...)", async () => {
  const rota = await importar("src/app/api/admissoes/token/[token]/route.ts");
  banco();
  const r = await chamar(rota.GET, { params: { token: TOKEN } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const adm = r.corpo.data.admissao;
  assert.equal(adm.funcao, "Auxiliar de Produção");
  assert.deepEqual(Object.keys(adm).sort(), ["candidato_id", "candidatos", "criado_em", "funcao", "id", "modalidade", "status", "token_expira_em", "token_usado_em", "vaga_id", "vagas"].sort());
  assert.deepEqual(Object.keys(adm.candidatos).sort(), ["cargo_pretendido", "nome_completo"]);
  assert.deepEqual(Object.keys(adm.vagas), ["titulo"]);
  assert.ok(!JSON.stringify(r.corpo).includes("123.456.789-09") && !JSON.stringify(r.corpo).includes("1850"), "nada de CPF nem salário no payload");
  const src = fonte("src/app/api/admissoes/token/[token]/route.ts");
  const select = src.slice(src.indexOf('.from("admissoes")'), src.indexOf('.eq("token", token)'));
  const selectCuringa = "select(" + String.fromCharCode(34) + "*";
  assert.ok(select.includes("modalidade, funcao, status") && !select.includes(selectCuringa), "colunas explícitas, com funcao");
});

await ok("a tela (AdmissaoFormClient) calcula a função só pela função pura e nunca lê cargo_pretendido direto; a função da admissão chega do payload", () => {
  const t = fonte("src/components/admissao/AdmissaoFormClient.tsx");
  assert.ok(t.includes('import { funcaoParaExibirNaAdmissao } from "@/lib/admissaoFuncao";'));
  assert.ok(t.includes("funcaoParaExibirNaAdmissao({ funcao: admissao?.funcao, vagaTitulo: admissao?.vagas?.titulo, cargoPretendido: admissao?.candidatos?.cargo_pretendido })"));
  assert.ok(!t.includes("candidatos?.cargo_pretendido ??"), "sem o cálculo antigo (cargo_pretendido ?? título)");
  assert.equal(t.match(/Vaga: \{cargo\}/g)?.length, 2, "os dois lugares que mostram a função usam a mesma variável");
  assert.ok(t.includes("funcao: string | null;"), "o tipo do payload tem funcao");
});

// ── WhatsApp e e-mail do link ──
const decodificar = (url: string) => decodeURIComponent(url.split("?text=")[1]);
await ok("WhatsApp: a mensagem usa a função e o texto é IDÊNTICO ao de antes (só o valor do cargo muda)", () => {
  const msg = decodificar(linkAdmissaoWhatsapp("Maria", "(19) 99999-0000", "Auxiliar de Produção", "https://x/admissao/abc"));
  assert.ok(msg.startsWith("Olá Maria! Parabéns novamente pela aprovação para a vaga de Auxiliar de Produção. Para darmos continuidade à sua contratação, preencha seus dados e envie seus documentos pelo link abaixo"));
  const antiga = decodificar(linkAdmissaoWhatsapp("Maria", "(19) 99999-0000", "Operacional", "https://x/admissao/abc"));
  assert.equal(antiga.replace("Operacional", "Auxiliar de Produção"), msg, "a única diferença é o cargo");
  const wa = fonte("src/lib/waLinks.ts");
  assert.ok(wa.includes("para a vaga de ${cargo}. Para darmos continuidade"), "template da mensagem não foi tocado");
});

await ok("envio do link (POST /api/admissoes) e reenvio pelo painel: WhatsApp e e-mail usam a MESMA função pura", () => {
  const r = fonte("src/app/api/admissoes/route.ts");
  assert.ok(r.includes("funcaoParaExibirNaAdmissao({ funcao: parsed.data.funcao, vagaTitulo: vaga.titulo, cargoPretendido: candidato?.cargo_pretendido })"));
  assert.ok(r.includes("linkAdmissaoWhatsapp(candidato.nome_completo, candidato.telefone, funcaoExibida, url)"));
  assert.ok(r.includes("cargo: funcaoExibida,") && !r.includes("cargo: candidato.cargo_pretendido"), "e-mail do link");
  assert.ok(r.includes('.select("unidade_id, titulo")'));
  const p = fonte("src/components/AdmissoesClient.tsx");
  assert.ok(p.includes("funcaoParaExibirNaAdmissao({ funcao: row.funcao, vagaTitulo: row.vagas?.titulo, cargoPretendido: row.candidatos.cargo_pretendido })"));
  assert.ok(!p.includes("row.candidatos.telefone, row.candidatos.cargo_pretendido, url"));
});

await ok("o cadastro rápido continua gravando a área em cargo_pretendido (não foi tocado)", () => {
  assert.ok(fonte("src/components/ModalCadastroRapido.tsx").includes("cargo_pretendido: area,"));
});

// ── Marca ──
await ok("cabeçalho 'Salmazos RH' existe (logo do projeto, sem arquivo novo) e aparece na tela de boas-vindas e em todos os passos", () => {
  const html = renderToStaticMarkup(createElement(CabecalhoMarca));
  assert.ok(html.includes('alt="Salmazos RH"') && html.includes('src="/Salmazos_logo_Amarelo.png"'));
  assert.ok(fs.existsSync("public/Salmazos_logo_Amarelo.png"), "o logo é um arquivo que já existe em public/");
  assert.ok(html.includes("max-width:100%") && html.includes("height:36px"), "logo com altura fixa e sem estourar a largura (celular)");
  const t = fonte("src/components/admissao/AdmissaoFormClient.tsx");
  assert.equal(t.match(/<CabecalhoMarca \/>/g)?.length, 2, "uma vez na boas-vindas e uma vez no formulário (que contém todos os passos)");
  const boasVindas = t.slice(t.indexOf("if (!iniciado) {"), t.indexOf("<PassoBoasVindas"));
  assert.ok(boasVindas.includes("<CabecalhoMarca />"), "boas-vindas");
  const passos = t.slice(t.indexOf("<ProgressBar passoAtual={passo} />") - 120, t.indexOf("{passo === 1 &&"));
  assert.ok(passos.includes("<CabecalhoMarca />") && passos.indexOf("<CabecalhoMarca />") < passos.indexOf("<ProgressBar"), "passos 1 a 9: marca acima da barra de progresso");
});

console.log(`\n${n} verificações OK`);
