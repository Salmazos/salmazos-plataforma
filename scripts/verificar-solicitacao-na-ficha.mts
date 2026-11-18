// Ficha da vaga (painel): bloco "Dados originais da solicitação do cliente (uso interno)", lido pelo solicitacoes_vagas.vaga_id, somente leitura. Nada é copiado
// para `vagas`, e o bloco NUNCA chega ao site público, ao portal do cliente, ao PDF nem ao candidato (prova por varredura das fontes, no padrão do
// verificar-vaga-pcd-publica).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-solicitacao-na-ficha.mts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import BlocoDadosOriginaisSolicitacao, { TEXTO_DADOS_ORIGINAIS } from "../src/components/BlocoDadosOriginaisSolicitacao";
import { COLUNAS_SOLICITACAO_ORIGINAL, solicitacaoVisivel, type SolicitacaoOriginalDaVaga } from "../src/lib/solicitacaoOriginalDaVaga";

let total = 0;
function caso(nome: string, fn: () => void) {
  fn();
  total++;
  console.log(`OK    ${nome}`);
}
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const lerFonte = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");
function arquivos(dir: string): string[] {
  return readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name).split(sep).join("/")] : []
  );
}

const solPortal = (extra: Partial<SolicitacaoOriginalDaVaga> = {}): SolicitacaoOriginalDaVaga => ({
  id: "sol-1", origem: "portal", cliente_nome: "Metalúrgica Exemplo Ltda", cargo: "Operador de torno CNC", tipo_servico: "recrutamento_selecao",
  created_at: "2026-11-10T13:30:00.000Z", aprovada_por: "Giovanni", aprovada_em: "2026-11-11T12:00:00.000Z", previsao_inicio: "2026-12-01",
  requisitos: "• Ensino Técnico — Completo\n• Experiência na função", observacoes: "Cliente prefere quem more perto",
  perfil_extra: { sexo: "indiferente", pcd: "nao", veiculo_proprio: "sim", habilitacao_categoria: "B", idade_min: 21, idade_max: 40, local_trabalho: "Unidade 2", experiencia_minima: "mínimo 8 meses em torno CNC" },
  dados_empresa: null, unidade_id: "U1", ...extra,
});
const solLink = (extra: Partial<SolicitacaoOriginalDaVaga> = {}): SolicitacaoOriginalDaVaga => solPortal({
  origem: "link_publico", cliente_nome: "Cliente Digitado SA",
  dados_empresa: { tipo_pessoa: "pj", nome: "Cliente Digitado SA", cnpj_cpf: "11.222.333/0001-81", contato_nome: "Maria Souza", telefone: "(19) 99999-8888", email: "maria@cliente.com.br", email_nf: "fin@cliente.com.br", endereco: "Rua A, 10" },
  perfil_extra: { sexo: "fem", idade: "até 35 anos", pcd: "sim", veiculo_proprio: "nao", experiencia_minima: "6 meses" },
  ...extra,
});
const tela = (s: SolicitacaoOriginalDaVaga | null | undefined) => renderToStaticMarkup(createElement(BlocoDadosOriginaisSolicitacao, { solicitacao: s }));

caso("vaga COM solicitação do portal mostra o bloco: texto fixo, origem, quem pediu, datas, previsão, perfil completo (inclui tempo de experiência), requisitos e observações do cliente", () => {
  const html = tela(solPortal());
  assert.ok(html.includes("Dados originais da solicitação do cliente (uso interno)"));
  assert.ok(html.includes(TEXTO_DADOS_ORIGINAIS) && TEXTO_DADOS_ORIGINAIS === "Informações enviadas pelo cliente. Uso interno: não são publicadas.");
  assert.ok(html.includes("Portal do cliente") && html.includes("Metalúrgica Exemplo Ltda"), "origem e quem pediu");
  assert.ok(html.includes("Pedido em") && html.includes("10/11/2026"), "quando pediu");
  assert.ok(html.includes("Aprovado por") && html.includes("Giovanni") && html.includes("11/11/2026"), "quem aprovou e quando");
  assert.ok(html.includes("Previsão de início") && html.includes("01/12/2026"), "previsão de início (nunca copiada para a vaga)");
  for (const t of ["Tempo de experiência", "mínimo 8 meses em torno CNC", "Indiferente", "De 21 a 40 anos", "Unidade 2", "Categoria B", "Veículo próprio"]) assert.ok(html.includes(t), t);
  assert.ok(html.includes("Perfil informado (uso interno") && html.includes("NÃO é publicado"));
  assert.ok(html.includes("Requisitos, como o cliente escreveu") && html.includes("Experiência na função"));
  assert.ok(html.includes("Observações do cliente") && html.includes("Cliente prefere quem more perto"));
  assert.ok(!html.includes("Dados do contratante"), "portal: o contratante já é cliente cadastrado");
});
caso("dados do contratante SÓ no link: empresa, CNPJ, contato, e-mail aparecem; as condições comerciais aceitas e o IP do aceite não entram", () => {
  const html = tela(solLink());
  assert.ok(html.includes("Link de solicitação") && html.includes("Dados do contratante"));
  for (const t of ["Cliente Digitado SA", "11.222.333/0001-81", "Maria Souza", "maria@cliente.com.br", "fin@cliente.com.br", "Rua A, 10", "até 35 anos", "6 meses"]) assert.ok(html.includes(t), t);
  assert.ok(!html.includes("Condições aceitas") && !/IP\s/.test(html) && !html.includes("203.0.113"));
  assert.ok(!tela(solPortal()).includes("11.222.333/0001-81"));
});
caso("vaga SEM solicitação ligada não quebra e não mostra nada (null, undefined)", () => {
  assert.equal(tela(null), "");
  assert.equal(tela(undefined), "");
});
caso("perfil_extra nulo ou vazio não quebra: portal sem quadro de perfil; link sem dados_empresa; campos nulos somem", () => {
  const portal = tela(solPortal({ perfil_extra: null, requisitos: null, observacoes: null, previsao_inicio: null, aprovada_por: null, aprovada_em: null, created_at: null }));
  assert.ok(portal.includes("Dados originais da solicitação") && portal.includes("Portal do cliente"));
  for (const t of ["Perfil informado", "Tempo de experiência", "Requisitos, como", "Observações do cliente", "Previsão de início", "Pedido em", "Aprovado por"]) assert.ok(!portal.includes(t), t);
  assert.ok(!tela(solPortal({ perfil_extra: {} })).includes("Perfil informado"), "perfil vazio: sem quadro");
  assert.ok(!tela(solPortal({ perfil_extra: { experiencia_minima: "  " } })).includes("Perfil informado"));
  const link = tela(solLink({ perfil_extra: null, dados_empresa: null }));
  assert.ok(link.includes("Link de solicitação") && !link.includes("Dados do contratante"));
  assert.ok(tela(solPortal({ perfil_extra: { experiencia_minima: "1 ano" } })).includes("1 ano"), "só o tempo de experiência já mostra o quadro");
});
caso("solicitação antiga (perfil sem a chave de experiência) mostra o perfil de antes, sem a linha nova", () => {
  const html = tela(solPortal({ perfil_extra: { sexo: "fem", pcd: "nao", habilitacao_categoria: "B", veiculo_proprio: "sim", idade_min: 21, idade_max: 35, local_trabalho: "Rua A" } }));
  assert.ok(html.includes("Feminino") && html.includes("De 21 a 35 anos") && !html.includes("Tempo de experiência"));
});
caso("o texto vindo do cliente é escapado na tela (React): marcação digitada vira texto", () => {
  const html = tela(solPortal({ observacoes: "<script>alert(1)</script>", requisitos: "<img src=x onerror=alert(1)>" }));
  assert.ok(!html.includes("<script>") && !html.includes("<img src=x") && html.includes("&lt;script&gt;"));
});

// ── Acesso: mesma regra das solicitações (unidade) e leitura pela vaga_id ────────────────────────────────────────────
caso("acesso: só a equipe da unidade da solicitação vê (todas as unidades, ou a própria); outra unidade e ausência = sem bloco", () => {
  const sol = solPortal({ unidade_id: "U1" });
  assert.equal(solicitacaoVisivel(sol, () => true), sol, "sócio com todas as unidades");
  assert.equal(solicitacaoVisivel(sol, (u) => u === "U1"), sol, "mesma unidade");
  assert.equal(solicitacaoVisivel(sol, (u) => u === "U2"), null, "outra unidade");
  assert.equal(solicitacaoVisivel(null, () => true), null);
  assert.equal(solicitacaoVisivel(undefined, () => true), null);
});
caso("página: lê solicitacoes_vagas só pelo vaga_id, com colunas explícitas, uma linha, e a checagem de unidade (podeVerUnidade) antes de mostrar", () => {
  const p = lerFonte("src/app/painel/vagas/[id]/page.tsx");
  assert.ok(p.includes('.from("solicitacoes_vagas")') && p.includes(".select(COLUNAS_SOLICITACAO_ORIGINAL)") && p.includes('.eq("vaga_id", id)'));
  assert.ok(p.includes(".limit(1)") && p.includes(".maybeSingle()"));
  assert.ok(p.includes("solicitacaoVisivel(") && p.includes("podeVerUnidade(ctx, u)"));
  assert.ok(p.indexOf("notFound()") < p.indexOf("<VagaDetalheClient"), "vaga de outra unidade responde 404 antes de qualquer dado");
  assert.ok(p.includes("const ctx = await contextoUnidadeDaSessao();") && p.includes("if (!ctx) return <SemAcessoPainel />;"));
  assert.ok(!/select\("\*"\)/.test(p.split('.from("solicitacoes_vagas")')[1].split(".maybeSingle()")[0]), "sem select amplo");
});
caso("colunas enviadas à tela: lista explícita, sem '*', sem o usuário que pediu, sem IP/aceite, sem as condições comerciais nem o link", () => {
  assert.ok(!COLUNAS_SOLICITACAO_ORIGINAL.includes("*"));
  const colunas = COLUNAS_SOLICITACAO_ORIGINAL.split(",").map((c) => c.trim());
  for (const proibida of ["solicitado_por_user_id", "aceite_ip", "aceite_taxa_cancelamento_em", "condicoes_aceitas", "link_id", "motivo_recusa", "beneficios", "beneficios_chips", "requisitos_chips"]) assert.ok(!colunas.includes(proibida), proibida);
  for (const necessaria of ["id", "origem", "cliente_nome", "created_at", "aprovada_por", "aprovada_em", "previsao_inicio", "requisitos", "observacoes", "perfil_extra", "dados_empresa", "unidade_id"]) assert.ok(colunas.includes(necessaria), necessaria);
});
caso("a ficha mostra o bloco abaixo de 'Detalhes da Vaga', antes de Requisitos, e só recebe a solicitação pela propriedade da página", () => {
  const f = lerFonte("src/components/VagaDetalheClient.tsx");
  const iDetalhes = f.indexOf("Detalhes da Vaga");
  const iBloco = f.indexOf("<BlocoDadosOriginaisSolicitacao solicitacao={solicitacaoOriginal} />");
  const iRequisitos = f.indexOf("{/* Requisitos */}");
  assert.ok(iDetalhes > 0 && iBloco > iDetalhes && iBloco < iRequisitos);
  assert.ok(f.includes("solicitacaoOriginal?: SolicitacaoOriginalDaVaga | null;"));
  assert.ok(!/\.from\("solicitacoes_vagas"\)/.test(f), "a ficha não consulta o banco: recebe a solicitação pronta da página");
});

// ── Segurança: o que NÃO pode tocar em solicitacoes_vagas ────────────────────────────────────────────────────────────
const LEITORES_PERMITIDOS = [
  "src/app/api/pedidos-cliente-popup/route.ts",
  "src/app/api/portal/solicitacoes/[id]/alteracao/route.ts",
  "src/app/api/portal/solicitacoes/[id]/encerramento/route.ts",
  "src/app/api/portal/solicitacoes/[id]/reativacao/route.ts",
  "src/app/api/portal/solicitacoes/route.ts",
  "src/app/api/portal/solicitar-vaga/route.ts",
  "src/app/api/solicitacao-vaga-publica/[token]/route.ts",
  "src/app/api/solicitacoes-vagas/[id]/alteracao/route.ts",
  "src/app/api/solicitacoes-vagas/[id]/recusar/route.ts",
  "src/app/api/solicitacoes-vagas/[id]/route.ts",
  "src/app/api/solicitacoes-vagas/[id]/vincular-cliente/route.ts",
  "src/app/api/solicitacoes-vagas/pendentes-popup/route.ts",
  "src/app/api/solicitacoes-vagas/route.ts",
  "src/app/api/vagas/from-solicitacao/route.ts",
  "src/app/painel/vagas/[id]/page.tsx",
  "src/app/painel/vagas/page.tsx",
  "src/components/VagaDetalheClient.tsx",
  "src/lib/avisoClienteDecisao.ts",
  "src/lib/constants.ts",
  "src/lib/perfilCandidatoPortal.ts",
  "src/lib/schemas.ts",
  "src/lib/solicitacaoAlteracao.ts",
  "src/lib/solicitacaoOriginalDaVaga.ts",
  "src/lib/solicitacaoVagaCondicoesVaga.ts",
];
const todos = arquivos("src");
caso("quem toca em solicitacoes_vagas é exatamente a lista conhecida (rotas da equipe, do próprio portal, do link e a ficha): um leitor novo quebra este teste e pede revisão", () => {
  const tocam = todos.filter((f) => /solicitacoes_vagas/.test(lerFonte(f))).sort();
  assert.deepEqual(tocam, [...LEITORES_PERMITIDOS].sort());
});
caso("site público, candidatura, PDF e componentes do candidato NÃO tocam em solicitacoes_vagas, perfil_extra nem no bloco novo", () => {
  const superficiesExternas = todos.filter((f) =>
    f.startsWith("src/app/vagas/") || f.startsWith("src/app/candidatura/") || f.startsWith("src/app/obrigado/") || f.startsWith("src/app/politica-de-privacidade/") ||
    f.startsWith("src/app/api/vagas/[id]/relatorio-pdf/") || f.startsWith("src/app/api/candidatos/") || f.startsWith("src/app/api/curriculo/") || f.startsWith("src/app/api/upload-curriculo/") ||
    ["src/components/VagaCard.tsx", "src/components/VagasListaClient.tsx", "src/components/FormCandidaturaVagaPublica.tsx", "src/components/CurriculoMotivacional.tsx", "src/lib/vagaPcdPublica.ts", "src/lib/vagaVisibilidade.ts"].includes(f)
  );
  assert.ok(superficiesExternas.length >= 8, `varredura achou só ${superficiesExternas.length} arquivos externos`);
  for (const f of superficiesExternas) {
    const fonte = lerFonte(f);
    assert.ok(!/solicitacoes_vagas|perfil_extra|experiencia_minima|solicitacaoOriginal|BlocoDadosOriginais|dados_empresa/.test(fonte), f);
  }
});
caso("portal do cliente: nenhuma tela ou rota do portal usa o bloco novo nem a leitura pela vaga_id; o portal não lê vagas com select amplo", () => {
  const portal = todos.filter((f) => f.startsWith("src/app/portal/") || f.startsWith("src/app/api/portal/") || f.startsWith("src/components/Portal"));
  assert.ok(portal.length > 10);
  for (const f of portal) {
    const fonte = lerFonte(f);
    assert.ok(!/BlocoDadosOriginais|solicitacaoOriginalDaVaga|COLUNAS_SOLICITACAO_ORIGINAL/.test(fonte), f);
    assert.ok(!/from\("vagas"\)\s*\.select\(\s*"\*/.test(fonte), `${f}: select amplo em vagas`);
  }
});
caso("o bloco e a leitura só são importados pela página do painel e pela ficha; o PDF da vaga não os importa", () => {
  const importam = (padrao: RegExp) => todos.filter((f) => !f.endsWith("BlocoDadosOriginaisSolicitacao.tsx") && !f.endsWith("solicitacaoOriginalDaVaga.ts") && padrao.test(lerFonte(f))).sort();
  assert.deepEqual(importam(/BlocoDadosOriginaisSolicitacao/), ["src/components/VagaDetalheClient.tsx"]);
  assert.deepEqual(importam(/solicitacaoOriginalDaVaga/), ["src/app/painel/vagas/[id]/page.tsx", "src/components/VagaDetalheClient.tsx"]);
  const pdf = lerFonte("src/app/api/vagas/[id]/relatorio-pdf/route.ts");
  assert.ok(!/solicitac|perfil_extra|BlocoDados/.test(pdf), "PDF da vaga sem dados da solicitação");
  assert.ok(pdf.includes('.select("titulo, status, cidade, estado, requisitos, clientes(nome)")'), "PDF segue com colunas explícitas");
});
caso("nada é copiado para a vaga: from-solicitacao não leva perfil_extra (além do PCD e dos itens de função), previsão, observações internas nem dados_empresa; sem migração nova", () => {
  const r = lerFonte("src/app/api/vagas/from-solicitacao/route.ts");
  assert.ok(!/experiencia_minima|dados_empresa|previsao_inicio/.test(r), "from-solicitacao não foi tocado nem copia os dados novos");
  const migracoes = readdirSync(join(RAIZ, "supabase")).filter((n) => /ficha|dados_solicitacao|solicitacao_original/i.test(n));
  assert.deepEqual(migracoes, [], "nenhuma migração para este bloco");
  assert.ok(!/dados_solicitacao|solicitacao_original/.test(lerFonte("src/types/index.ts")), "vagas não ganhou coluna");
});

console.log(`\n${total} casos OK`);
