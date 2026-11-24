// "Renovar link" da admissão (RH > Admissões): POST /api/admissoes/[id]/renovar-link. Rotas e regras rodam contra o banco EM MEMÓRIA do harness: os dados
// ZZTEST abaixo só existem durante o script (nada é gravado em banco real, então não sobra nada para limpar).
//  - só renova link JÁ vencido e só em aguardando_candidato / em_preenchimento; um único UPDATE atômico troca token e validade (TOKEN_VALIDADE_DIAS);
//  - o link antigo deixa de existir (404 "Link inválido"), o novo abre, e dados/documentos/status/token_usado_em ficam como estavam;
//  - auditoria registra quem, quando e a validade nova, sem NENHUM token; acesso igual às demais ações de Admissões (401/403/404).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-admissao-renovar-link.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, novoDb, logar, importar, chamar } from "./harness-mot/ambiente.mjs";
import { TOKEN_VALIDADE_DIAS, STATUS_LINK_RENOVAVEL, linkVencido, podeRenovarLink } from "../src/lib/admissaoValidade";
import { TOKEN_VALIDADE_DIAS as DIAS_DA_CRIACAO } from "../src/lib/admissaoCriacao";

congelarData(AGORA_ISO); // 07/10/2026 12:00 em Brasília = 15:00Z
const AGORA = new Date(AGORA_ISO);
const R = {
  renovar: await importar("src/app/api/admissoes/[id]/renovar-link/route.ts"),
  token: await importar("src/app/api/admissoes/token/[token]/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const ID = "11111111-0000-4000-8000-0000000000a1";
const TOKEN_ANTIGO = "aaaaaaaa-1111-4222-8333-444444444441";
const VENCIDO = "2026-10-01T10:00:00.000Z";
const VALIDO = "2026-10-10T10:00:00.000Z";

function cenario(extra: Record<string, unknown> = {}, quem: string | null = "dir") {
  const db = novoDb();
  logar(db, quem);
  db.tabelas.admissoes = [{
    id: ID, token: TOKEN_ANTIGO, candidato_id: "cand-zz", vaga_id: "vaga-zz", unidade_id: "U1", modalidade: "MOT", funcao: "ZZTEST Auxiliar", status: "em_preenchimento",
    token_expira_em: VENCIDO, token_usado_em: "2026-10-02T09:00:00.000Z", criado_em: "2026-09-26T10:00:00.000Z", ...extra,
  }];
  db.tabelas.candidatos = [{ id: "cand-zz", nome_completo: "ZZTEST Candidato Renovar", cargo_pretendido: "Operacional", telefone: "(19) 99999-0000" }];
  db.tabelas.vagas = [{ id: "vaga-zz", titulo: "ZZTEST Vaga", unidade_id: "U1", cliente_id: "C1" }];
  db.tabelas.admissao_dados_pessoais = [{ id: "dp-zz", admissao_id: ID, nome_completo: "ZZTEST Candidato Renovar", cpf: "000.000.000-00", telefone: "(19) 99999-0000" }];
  db.tabelas.admissao_dependentes = [{ id: "dep-zz", admissao_id: ID, nome: "ZZTEST Dependente", created_at: "2026-10-02T09:10:00Z" }];
  db.tabelas.admissao_documentos = [{ id: "doc-zz", admissao_id: ID, tipo_documento: "rg_frente", status: "enviado", obrigatorio: true, condicional: null, storage_path: `${ID}/rg.pdf`, created_at: "2026-10-02T09:20:00Z" }];
  db.tabelas.admissao_vale_transporte = [];
  return db;
}
const renovar = (id = ID) => chamar(R.renovar.POST, { metodo: "POST", params: { id } });
const linha = (db: any, id = ID) => db.tabelas.admissoes.find((a: any) => a.id === id);
const auditoria = (db: any) => db.tabelas.audit_logs.filter((a: any) => a.acao === "admissao_link_renovado");

await ok("regra pura: renovável só com status ainda com o candidato E link vencido (nunca o que ainda vale); validade única compartilhada com a criação", () => {
  assert.equal(TOKEN_VALIDADE_DIAS, 5);
  assert.equal(DIAS_DA_CRIACAO, TOKEN_VALIDADE_DIAS, "a criação reexporta a MESMA constante");
  assert.deepEqual([...STATUS_LINK_RENOVAVEL], ["aguardando_candidato", "em_preenchimento"]);
  assert.equal(linkVencido(VENCIDO, AGORA), true);
  assert.equal(linkVencido(VALIDO, AGORA), false);
  assert.equal(podeRenovarLink("em_preenchimento", VENCIDO, AGORA), true);
  assert.equal(podeRenovarLink("aguardando_candidato", VENCIDO, AGORA), true);
  assert.equal(podeRenovarLink("em_preenchimento", VALIDO, AGORA), false, "link ainda válido");
  for (const st of ["aguardando_analise", "em_analise", "aprovado", "enviado_contabilidade", "cancelada"]) assert.equal(podeRenovarLink(st, VENCIDO, AGORA), false, st);
});

await ok("link vencido (em preenchimento): renova, troca o token e dá TOKEN_VALIDADE_DIAS dias a partir de agora; o link antigo passa a 'Link inválido' (404) e o novo abre", async () => {
  const db = cenario();
  assert.equal((await chamar(R.token.GET, { params: { token: TOKEN_ANTIGO } })).status, 410, "antes: expirado");
  const r = await renovar();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const nova = linha(db);
  assert.notEqual(nova.token, TOKEN_ANTIGO);
  assert.match(nova.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "uuid v4");
  assert.equal(nova.token_expira_em, new Date(AGORA.getTime() + TOKEN_VALIDADE_DIAS * 86400000).toISOString());
  assert.deepEqual(r.corpo.data, { id: ID, token: nova.token, token_expira_em: nova.token_expira_em, status: "em_preenchimento" }, "a resposta traz só o necessário para a tela");
  const antigo = await chamar(R.token.GET, { params: { token: TOKEN_ANTIGO } });
  assert.equal(antigo.status, 404, "o token antigo deixou de existir");
  assert.match(antigo.corpo.error, /Link inválido/);
  const novoLink = await chamar(R.token.GET, { params: { token: nova.token } });
  assert.equal(novoLink.status, 200, JSON.stringify(novoLink.corpo));
  console.log(`      validade nova: ${nova.token_expira_em} (${TOKEN_VALIDADE_DIAS} dias a partir de ${AGORA_ISO})`);
});

await ok("dados preenchidos, documentos, status e token_usado_em ficam EXATAMENTE como estavam; o formulário abre com tudo já preenchido", async () => {
  const db = cenario();
  const antes = JSON.stringify({ dp: db.tabelas.admissao_dados_pessoais, dep: db.tabelas.admissao_dependentes, docs: db.tabelas.admissao_documentos });
  const { id: _i, token: _t, token_expira_em: _e, ...resto } = linha(db);
  assert.equal((await renovar()).status, 200);
  const depois = linha(db);
  const { id: _i2, token: _t2, token_expira_em: _e2, ...resto2 } = depois;
  assert.deepEqual(resto2, resto, "nenhuma outra coluna da admissão mudou (status, token_usado_em, unidade, função...)");
  assert.equal(depois.status, "em_preenchimento");
  assert.equal(depois.token_usado_em, "2026-10-02T09:00:00.000Z");
  assert.equal(JSON.stringify({ dp: db.tabelas.admissao_dados_pessoais, dep: db.tabelas.admissao_dependentes, docs: db.tabelas.admissao_documentos }), antes);
  const abre = await chamar(R.token.GET, { params: { token: depois.token } });
  assert.equal(abre.corpo.data.dados_pessoais.nome_completo, "ZZTEST Candidato Renovar");
  assert.equal(abre.corpo.data.dependentes.length, 1);
  assert.equal(abre.corpo.data.documentos[0].status, "enviado");
});

await ok("'aguardando_candidato' com link vencido também renova (status continua o mesmo)", async () => {
  const db = cenario({ status: "aguardando_candidato", token_usado_em: null });
  const r = await renovar();
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(linha(db).status, "aguardando_candidato");
  assert.equal(linha(db).token_usado_em, null, "token_usado_em não é tocado");
});

await ok("link AINDA VÁLIDO: recusado (400) com mensagem clara; nada muda (token e validade intactos) e nada é auditado", async () => {
  const db = cenario({ token_expira_em: VALIDO });
  const r = await renovar();
  assert.equal(r.status, 400);
  assert.match(r.corpo.error, /ainda está válido \(vence em 10\/10\/2026\)/);
  assert.equal(linha(db).token, TOKEN_ANTIGO);
  assert.equal(linha(db).token_expira_em, VALIDO);
  assert.equal(auditoria(db).length, 0);
  assert.equal((await chamar(R.token.GET, { params: { token: TOKEN_ANTIGO } })).status, 200, "o link antigo segue funcionando");
});

await ok("status final (enviada para análise, em análise, aprovada, enviada à contabilidade, cancelada): recusado (400) em português, mesmo com o link vencido; nada muda", async () => {
  for (const st of ["aguardando_analise", "em_analise", "aprovado", "enviado_contabilidade", "cancelada"]) {
    const db = cenario({ status: st });
    const r = await renovar();
    assert.equal(r.status, 400, st);
    assert.match(r.corpo.error, /Só dá para renovar o link de uma admissão que ainda está com o candidato/, st);
    assert.equal(linha(db).token, TOKEN_ANTIGO, st);
    assert.equal(linha(db).token_expira_em, VENCIDO, st);
    assert.equal(auditoria(db).length, 0, st);
  }
});

await ok("acesso: sem login 401; analista (sem acesso ao RH) 403; supervisor da OUTRA unidade 404 (como as demais rotas de Admissões); supervisor da unidade e diretoria renovam; nada muda nos recusados", async () => {
  for (const [quem, status] of [[null, 401], ["ana", 403], ["sup2", 404]] as const) {
    const db = cenario({}, quem);
    const r = await renovar();
    assert.equal(r.status, status, `${quem}: ${JSON.stringify(r.corpo)}`);
    assert.equal(linha(db).token, TOKEN_ANTIGO, `${quem}: token intacto`);
    assert.equal(auditoria(db).length, 0);
  }
  for (const quem of ["sup1", "dir"]) {
    const db = cenario({}, quem);
    assert.equal((await renovar()).status, 200, quem);
    assert.notEqual(linha(db).token, TOKEN_ANTIGO);
  }
  cenario();
  assert.equal((await renovar("11111111-0000-4000-8000-0000000000ff")).status, 404, "admissão inexistente");
});

await ok("auditoria: registra quem renovou, a admissão, quando e a validade nova — e NENHUM token (nem o antigo, nem o novo) em lugar nenhum do registro", async () => {
  const db = cenario();
  assert.equal((await renovar()).status, 200);
  const logs = auditoria(db);
  assert.equal(logs.length, 1);
  const a = logs[0];
  assert.equal(a.usuario_id, "u-dir");
  assert.equal(a.usuario_nome, "Nome u-dir", "nome do perfil, não só o e-mail");
  assert.equal(a.entidade, "admissoes");
  assert.equal(a.entidade_id, ID);
  assert.equal(a.detalhes.renovado_em, AGORA_ISO);
  assert.equal(a.detalhes.validade_nova, linha(db).token_expira_em);
  assert.equal(a.detalhes.validade_anterior, VENCIDO);
  assert.equal(a.detalhes.validade_dias, TOKEN_VALIDADE_DIAS);
  const texto = JSON.stringify(db.tabelas.audit_logs);
  assert.ok(!texto.includes(TOKEN_ANTIGO) && !texto.includes(linha(db).token), "nenhum token no audit_logs");
  assert.ok(!/"token"/i.test(JSON.stringify(a.detalhes)), "sem nenhuma chave 'token' nos detalhes");
});

await ok("duas renovações seguidas: a 2ª é recusada porque o link já está válido; o token da 1ª continua o mesmo e só há 1 registro de auditoria", async () => {
  const db = cenario();
  const r1 = await renovar();
  const tokenDepoisDaPrimeira = linha(db).token;
  const r2 = await renovar();
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 400);
  assert.match(r2.corpo.error, /ainda está válido/);
  assert.equal(linha(db).token, tokenDepoisDaPrimeira, "o link entregue na 1ª não foi invalidado pela 2ª");
  assert.equal(auditoria(db).length, 1);
});

await ok("duas pessoas clicando AO MESMO TEMPO: só uma renova (UPDATE com a trava no WHERE); a outra recebe erro (400 ou 409) e o token final é o da vencedora", async () => {
  const db = cenario();
  const [a, b] = await Promise.all([renovar(), renovar()]);
  const status = [a.status, b.status].sort();
  assert.equal(status[0], 200, JSON.stringify([a.corpo, b.corpo]));
  assert.ok([400, 409].includes(status[1]), String(status[1]));
  const vencedora = a.status === 200 ? a : b;
  assert.equal(linha(db).token, vencedora.corpo.data.token);
  assert.equal(auditoria(db).length, 1);
});

await ok("o UPDATE é um só, atômico e travado: filtra por id, status renovável E vencimento, e grava só token e validade (fonte da rota)", () => {
  const src = fs.readFileSync("src/app/api/admissoes/[id]/renovar-link/route.ts", "utf8");
  const ini = src.indexOf(".update({");
  const update = src.slice(ini, src.indexOf(".maybeSingle();", ini));
  assert.match(update, /\.update\(\{ token: tokenNovo, token_expira_em: validadeNova \}\)/);
  assert.match(update, /\.eq\("id", id\)/);
  assert.match(update, /\.in\("status", \[\.\.\.STATUS_LINK_RENOVAVEL\]\)/);
  assert.match(update, /\.lt\("token_expira_em", renovadoEm\)/);
  assert.equal((src.match(/\.update\(/g) ?? []).length, 1, "um único UPDATE");
  assert.ok(src.includes("TOKEN_VALIDADE_DIAS * 24 * 60 * 60 * 1000") && !/\b5\s*\*\s*24/.test(src), "usa a constante, não repete o 5");
  assert.ok(!/console\.(log|error|warn|info)/.test(src), "a rota não escreve token em log de servidor");
});

await ok("a rota PATCH /api/admissoes/[id] NÃO foi tocada (continua só status e observações)", () => {
  const src = fs.readFileSync("src/app/api/admissoes/[id]/route.ts", "utf8");
  assert.ok(!/token|renov/i.test(src.replace(/token_/g, "")));
  assert.ok(src.includes("if (parsed.data.status !== undefined) updates.status") && src.includes("observacoes_internas"));
});

await ok("telas: o botão 'Renovar link' só aparece com link vencido + status com o candidato (lista e detalhe); o selo vermelho 'Expirado' agora vale para 'Em preenchimento' também; confirmação em português", () => {
  const lista = fs.readFileSync("src/components/AdmissoesClient.tsx", "utf8");
  assert.ok(lista.includes("const expirado = podeRenovarLink(row.status, row.token_expira_em, agora);"), "selo e botão usam a mesma regra única");
  assert.ok(!lista.includes('row.status === "aguardando_candidato" && new Date(row.token_expira_em) < agora'), "a regra antiga (só 'Aguardando candidato') saiu");
  assert.ok(/\{expirado && \(\s*<button[\s\S]{0,60}setRenovando[\s\S]*?Renovar link/.test(lista), "botão só com link vencido");
  assert.ok(lista.includes("<ModalRenovarLink") && lista.includes("handleLinkRenovado"));
  assert.ok(lista.includes("token: link.token, token_expira_em: link.token_expira_em"), "a linha ganha o token novo (Copiar link/WhatsApp já usam o novo)");
  const det = fs.readFileSync("src/components/AdmissaoDetalheClient.tsx", "utf8");
  assert.ok(det.includes("podeRenovarLink(status, linkAdm.expiraEm)") && det.includes("data-bloco-link-vencido") && det.includes("data-bloco-link-renovado"));
  assert.ok(det.includes("handleCopiarLinkAdmissao") && det.includes("handleWhatsappLinkAdmissao"), "Copiar link e WhatsApp à mão depois de renovar");
  const modal = fs.readFileSync("src/components/ModalRenovarLink.tsx", "utf8");
  assert.ok(modal.includes("O link antigo vai parar de funcionar e um novo será criado, válido por {TOKEN_VALIDADE_DIAS} dias. O que o candidato já preencheu continua salvo. Depois de renovar, envie o link novo ao candidato."));
  assert.ok(modal.includes('{enviando ? "Renovando…" : "Renovar"}') && modal.includes("Cancelar"), "botões Renovar e Cancelar");
  assert.ok(modal.includes('method: "POST"') && modal.includes("/renovar-link"));
});

console.log(`\n${n} verificações OK`);
