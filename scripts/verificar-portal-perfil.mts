// Portal, solicitação de vaga: bloco "Perfil do candidato" (Fase 5): validação, perfil_extra, schema da rota, templates antigos com chip CNH, cartão do painel e vaga.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-portal-perfil.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { parseBody, portalSolicitarVagaSchema } from "../src/lib/schemas";
import { CATEGORIAS_HABILITACAO, REQ_CNH, requisitosPublicaveis } from "../src/lib/solicitacaoVagaCampos";
import {
  PERFIL_VAZIO, converterChipsDeTemplate, idadeLegivel, linhasDoPerfilExtra, perfilExtraDoFormulario, validarPerfilPortal, type PerfilPortal,
} from "../src/lib/perfilCandidatoPortal";
import PerfilCandidatoPortal from "../src/components/PerfilCandidatoPortal";
import { BlocoPerfilInformado } from "../src/components/BlocosSolicitacaoLink";

let total = 0;
function caso(nome: string, fn: () => void) {
  fn();
  total++;
  console.log(`OK    ${nome}`);
}
const lerFonte = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");
const perfil = (extra: Partial<PerfilPortal> = {}): PerfilPortal => ({ ...PERFIL_VAZIO, ...extra });

// ── Validação do formulário (as mesmas regras do servidor) ───────────────────
caso("padrões do link: Indiferente, PCD Não, CNH Não, veículo Não, sem idade nem local; perfil vazio é válido", () => {
  assert.deepEqual(PERFIL_VAZIO, { sexo: "indiferente", idadeMin: "", idadeMax: "", pcd: "nao", habilitacao: "nao", habilitacaoCategoria: "", veiculoProprio: "nao", localTrabalho: "" });
  assert.deepEqual(validarPerfilPortal(PERFIL_VAZIO), {});
});
caso("idade: inteiros de 14 a 90; fora disso, decimal ou texto dão erro no campo certo", () => {
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMin: "14", idadeMax: "90" })), {});
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMin: "13" })), { idade_min: "Informe um número inteiro entre 14 e 90." });
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMax: "91" })), { idade_max: "Informe um número inteiro entre 14 e 90." });
  assert.ok("idade_min" in validarPerfilPortal(perfil({ idadeMin: "2x" })));
  assert.ok("idade_max" in validarPerfilPortal(perfil({ idadeMax: "18,5" })));
  assert.ok("idade_min" in validarPerfilPortal(perfil({ idadeMin: "0" })));
});
caso("idade mínima maior que a máxima = erro na máxima; iguais passam; só uma das duas passa", () => {
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMin: "40", idadeMax: "30" })), { idade_max: "A idade máxima não pode ser menor que a mínima." });
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMin: "30", idadeMax: "30" })), {});
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMin: "40" })), {});
  assert.deepEqual(validarPerfilPortal(perfil({ idadeMax: "30" })), {});
});
caso("habilitação Sim exige categoria da lista; Não ignora a categoria; local de trabalho tem limite", () => {
  assert.ok("habilitacao_categoria" in validarPerfilPortal(perfil({ habilitacao: "sim" })));
  assert.ok("habilitacao_categoria" in validarPerfilPortal(perfil({ habilitacao: "sim", habilitacaoCategoria: "Z" })));
  for (const c of CATEGORIAS_HABILITACAO) assert.deepEqual(validarPerfilPortal(perfil({ habilitacao: "sim", habilitacaoCategoria: c })), {}, c);
  assert.deepEqual(validarPerfilPortal(perfil({ habilitacao: "nao", habilitacaoCategoria: "Z" })), {});
  assert.deepEqual(validarPerfilPortal(perfil({ localTrabalho: "x".repeat(300) })), {});
  assert.ok("local_trabalho" in validarPerfilPortal(perfil({ localTrabalho: "x".repeat(301) })));
});

// ── perfil_extra ─────────────────────────────────────────────────────────────
caso("perfil_extra gravado: as chaves do link (sexo, pcd, habilitacao_categoria, veiculo_proprio, local_trabalho) mais idade_min e idade_max numéricas", () => {
  const e = perfilExtraDoFormulario(perfil({ sexo: "fem", idadeMin: "21", idadeMax: "35", pcd: "sim", habilitacao: "sim", habilitacaoCategoria: "AB", veiculoProprio: "sim", localTrabalho: "  Rua A, 10  " }));
  assert.deepEqual(e, { sexo: "fem", pcd: "sim", habilitacao_categoria: "AB", veiculo_proprio: "sim", idade_min: 21, idade_max: 35, local_trabalho: "Rua A, 10" });
  assert.equal(typeof e.idade_min, "number");
  assert.deepEqual(perfilExtraDoFormulario(PERFIL_VAZIO), { sexo: "indiferente", pcd: "nao", habilitacao_categoria: null, veiculo_proprio: "nao", idade_min: null, idade_max: null, local_trabalho: null });
  assert.equal(perfilExtraDoFormulario(perfil({ habilitacao: "nao", habilitacaoCategoria: "B" })).habilitacao_categoria, null, "categoria só vale com Habilitação Sim");
});
caso("idade legível: faixa nova; só mínima; só máxima; e a chave antiga 'idade' (texto do link) quando não há faixa", () => {
  assert.equal(idadeLegivel({ idade_min: 21, idade_max: 35 }), "De 21 a 35 anos");
  assert.equal(idadeLegivel({ idade_min: 21 }), "A partir de 21 anos");
  assert.equal(idadeLegivel({ idade_max: 35 }), "Até 35 anos");
  assert.equal(idadeLegivel({ idade: "a partir de 21 anos" }), "a partir de 21 anos");
  assert.equal(idadeLegivel({ idade: "  ", idade_min: null }), null);
  assert.equal(idadeLegivel({ idade: "texto antigo", idade_min: 25 }), "A partir de 25 anos", "a faixa nova tem preferência");
  assert.equal(idadeLegivel(null), null);
});

// ── Schema da rota ───────────────────────────────────────────────────────────
const corpoBase = { cargo: "Auxiliar", tipo_servico: "recrutamento_selecao", cidade: "Campinas", estado: "SP" };
const valida = (perfil_extra: unknown) => parseBody(portalSolicitarVagaSchema, { ...corpoBase, perfil_extra });
caso("rota: sem perfil_extra o corpo continua válido e sem a chave (comportamento de antes)", () => {
  const r = parseBody(portalSolicitarVagaSchema, corpoBase);
  assert.ok(r.success);
  assert.equal(r.data.perfil_extra, undefined);
  assert.ok(parseBody(portalSolicitarVagaSchema, { ...corpoBase, perfil_extra: null }).success);
});
caso("rota: perfil_extra completo é aceito e normalizado; padrões entram quando faltam; chaves desconhecidas somem", () => {
  const r = valida({ sexo: "masc", pcd: "sim", habilitacao_categoria: "E", veiculo_proprio: "sim", idade_min: 18, idade_max: 50, local_trabalho: "  Fábrica 2 ", intruso: "x" });
  assert.ok(r.success);
  assert.deepEqual(r.data.perfil_extra, { sexo: "masc", pcd: "sim", habilitacao_categoria: "E", veiculo_proprio: "sim", idade_min: 18, idade_max: 50, local_trabalho: "Fábrica 2" });
  const vazio = valida({});
  assert.ok(vazio.success);
  assert.deepEqual(vazio.data.perfil_extra, { sexo: "indiferente", pcd: "nao", habilitacao_categoria: null, veiculo_proprio: "nao", local_trabalho: null });
  assert.equal(valida({ habilitacao_categoria: "" }).success && (valida({ habilitacao_categoria: "" }) as { data: { perfil_extra: { habilitacao_categoria: unknown } } }).data.perfil_extra.habilitacao_categoria, null);
});
caso("rota: recusa sexo/PCD/veículo fora do enum, categoria fora da lista, idade fora de 14-90, decimal ou texto, mín. > máx., local acima do limite", () => {
  for (const ruim of [
    { sexo: "outro" }, { pcd: "talvez" }, { veiculo_proprio: "s" }, { habilitacao_categoria: "Z" }, { habilitacao_categoria: "F" },
    { idade_min: 13 }, { idade_max: 91 }, { idade_min: 18.5 }, { idade_min: "18" }, { idade_max: "abc" }, { idade_min: 50, idade_max: 40 }, { local_trabalho: "x".repeat(301) },
  ]) assert.equal(valida(ruim).success, false, JSON.stringify(ruim));
  for (const c of CATEGORIAS_HABILITACAO) assert.ok(valida({ habilitacao_categoria: c }).success, c);
  assert.ok(valida({ idade_min: 14, idade_max: 90 }).success && valida({ idade_min: 30, idade_max: 30 }).success);
  const erro = valida({ idade_min: 50, idade_max: 40 });
  assert.ok(!erro.success && /idade máxima não pode ser menor/i.test(erro.error));
});
caso("rota: grava o perfil_extra do corpo VALIDADO e só quando ele veio (sem ele, a linha é gravada como sempre foi)", () => {
  const rota = lerFonte("src/app/api/portal/solicitar-vaga/route.ts");
  assert.ok(rota.includes("...(parsed.data.perfil_extra ? { perfil_extra: parsed.data.perfil_extra } : {})"));
  assert.ok(!rota.includes("body.perfil_extra"), "nunca o corpo cru");
});

// ── Templates antigos com chip CNH ───────────────────────────────────────────
caso("template com UM chip CNH: o chip sai dos requisitos e vira Habilitação = Sim com a categoria (B, C, D e E)", () => {
  for (const chip of REQ_CNH) {
    const r = converterChipsDeTemplate(["Ensino Médio — Completo", chip, "Excel avançado"]);
    assert.deepEqual(r, { chips: ["Ensino Médio — Completo", "Excel avançado"], habilitacao: "sim", habilitacaoCategoria: chip.replace("CNH ", "") }, chip);
  }
});
caso("template sem CNH não muda; template com VÁRIOS chips CNH vira Habilitação = Sim sem categoria (a pessoa escolhe); nulo e vazio são seguros", () => {
  const sem = ["Ensino Médio", "Boa comunicação"];
  assert.deepEqual(converterChipsDeTemplate(sem), { chips: sem, habilitacao: "nao", habilitacaoCategoria: "" });
  assert.deepEqual(converterChipsDeTemplate(["CNH B", "CNH D", "Excel"]), { chips: ["Excel"], habilitacao: "sim", habilitacaoCategoria: "" });
  assert.ok("habilitacao_categoria" in validarPerfilPortal(perfil({ habilitacao: "sim", habilitacaoCategoria: "" })), "sem categoria o envio é barrado");
  assert.deepEqual(converterChipsDeTemplate(null), { chips: [], habilitacao: "nao", habilitacaoCategoria: "" });
  assert.deepEqual(converterChipsDeTemplate([]), { chips: [], habilitacao: "nao", habilitacaoCategoria: "" });
});

// ── Tela do portal ───────────────────────────────────────────────────────────
caso("tela: bloco novo do portal com uma só pergunta de habilitação, sem chips CNH, categoria só com Sim, padrões marcados", () => {
  const tela = (v: PerfilPortal) => renderToStaticMarkup(createElement(PerfilCandidatoPortal, { valor: v, onChange: () => undefined, erros: {} }));
  const nao = tela(PERFIL_VAZIO);
  assert.equal((nao.match(/Precisa de habilitação \(CNH\)\?/g) ?? []).length, 1);
  for (const chip of REQ_CNH) assert.ok(!nao.includes(chip), chip);
  assert.ok(!nao.includes("Qual categoria?"));
  for (const rotulo of ["Perfil do candidato", "Idade mínima", "Idade máxima", "Vaga para pessoa com deficiência (PCD)?", "Precisa ter veículo próprio?", "Local de trabalho", "Indiferente", "Masculino", "Feminino"]) assert.ok(nao.includes(rotulo), rotulo);
  assert.equal((nao.match(/aria-pressed="true"/g) ?? []).length, 4, "Indiferente, PCD Não, CNH Não e veículo Não marcados");
  const sim = tela(perfil({ habilitacao: "sim", habilitacaoCategoria: "AB" }));
  assert.ok(sim.includes("Qual categoria?") && sim.includes('<option value="AE">Categoria AE</option>'));
  const comErro = renderToStaticMarkup(createElement(PerfilCandidatoPortal, { valor: perfil({ habilitacao: "sim" }), onChange: () => undefined, erros: { habilitacao_categoria: "Escolha a categoria da habilitação.", idade_max: "A idade máxima não pode ser menor que a mínima." } }));
  assert.ok(comErro.includes("Escolha a categoria da habilitação.") && comErro.includes("A idade máxima não pode ser menor que a mínima.") && comErro.includes('role="alert"'));
});
caso("página: o grupo de chips 'Habilitação' saiu; o bloco novo entra; 'Revisar' valida o perfil; template antigo é convertido; corpo e resumo levam o perfil", () => {
  const pagina = lerFonte("src/app/portal/(app)/solicitar-vaga/page.tsx");
  assert.ok(!pagina.includes('label="Habilitação"') && !pagina.includes("chips={REQ_CNH}"));
  assert.ok(pagina.includes("<PerfilCandidatoPortal valor={perfil}"));
  assert.ok(pagina.includes("validarPerfilPortal(perfil)") && pagina.includes("converterChipsDeTemplate(tpl.requisitos_chips)"));
  assert.ok(pagina.includes("for (const chip of convertido.chips)"), "os chips CNH do template não voltam para a lista de requisitos");
  assert.equal((pagina.match(/^\s+perfil,$/gm) ?? []).length, 2, "perfil entra no corpo e no resumo");
});

// ── Cartão do painel e vaga ──────────────────────────────────────────────────
caso("painel: o cartão mostra o perfil do portal (faixa de idade) e do link (idade antiga em texto), só o que veio preenchido", () => {
  const portal = linhasDoPerfilExtra({ sexo: "fem", pcd: "nao", habilitacao_categoria: "B", veiculo_proprio: "sim", idade_min: 21, idade_max: 35, local_trabalho: "Rua A" });
  assert.deepEqual(portal.filter((l) => l.valor), [
    { rotulo: "Sexo", valor: "Feminino" }, { rotulo: "Idade", valor: "De 21 a 35 anos" }, { rotulo: "PCD", valor: "Não" },
    { rotulo: "Habilitação", valor: "Categoria B" }, { rotulo: "Veículo próprio", valor: "Sim" }, { rotulo: "Local de trabalho", valor: "Rua A" },
  ]);
  const link = renderToStaticMarkup(createElement(BlocoPerfilInformado, { perfil: linhasDoPerfilExtra({ sexo: "masc", idade: "até 30 anos", pcd: "sim" }) }));
  assert.ok(link.includes("Masculino") && link.includes("até 30 anos") && link.includes("NÃO é publicado"));
  const doPortal = renderToStaticMarkup(createElement(BlocoPerfilInformado, { perfil: portal }));
  assert.ok(doPortal.includes("De 21 a 35 anos") && doPortal.includes("Rua A"));
  const modal = lerFonte("src/components/ModalSolicitacoesVagas.tsx");
  assert.ok(modal.includes('s.origem !== "link_publico" && s.perfil_extra && <BlocoPerfilInformado'));
});
caso("vaga criada: no portal vale a mesma conversão do link ('Habilitação categoria X' e 'Veículo próprio' uma vez só); sexo, idade, PCD e local nunca vão", () => {
  const p = { sexo: "fem", pcd: "sim", habilitacao_categoria: "B", veiculo_proprio: "sim", idade_min: 21, idade_max: 35, local_trabalho: "Rua Secreta, 1" };
  const texto = requisitosPublicaveis("• Ensino Médio — Completo", p)!;
  assert.equal(texto, "• Ensino Médio — Completo\n• Habilitação categoria B\n• Veículo próprio");
  for (const proibido of ["Feminino", "fem", "21", "35", "Secreta", "PCD", "pcd"]) assert.ok(!texto.includes(proibido), proibido);
  for (const c of CATEGORIAS_HABILITACAO) {
    const t = requisitosPublicaveis("• Experiência na função", { habilitacao_categoria: c, veiculo_proprio: "sim" })!;
    assert.equal(t.split("\n").filter((l) => /habilita|CNH/i.test(l)).length, 1, c);
    assert.equal(t.split("\n").filter((l) => /Veículo próprio/.test(l)).length, 1, c);
  }
  assert.equal(requisitosPublicaveis("• Possuir CNH B", { habilitacao_categoria: "B" }), "• Possuir CNH B", "sem duplicar com a linha que o cliente já escreveu (temLinhaDeHabilitacao)");
  assert.equal(requisitosPublicaveis("• Excel", { veiculo_proprio: "nao", pcd: "sim", sexo: "masc" }), "• Excel");
  const rota = lerFonte("src/app/api/vagas/from-solicitacao/route.ts");
  assert.ok(rota.includes('sol.origem === "link_publico" || sol.perfil_extra ? requisitosPublicaveis(sol.requisitos, sol.perfil_extra) : sol.requisitos ?? null'), "portal sem perfil_extra segue como antes");
  assert.ok(!/perfil_extra\.(sexo|idade|pcd|local)/.test(rota));
});

console.log(`\n${total} casos OK`);
