// Portal, solicitação de vaga: resumo de conferência antes de enviar e corpo do POST (Fase 4).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-portal-resumo.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, createRef } from "react";
import { SALARIO_A_COMBINAR, SALARIO_ENVIAR_PRETENSAO, formatarSalarioHora } from "../src/lib/constants";
import { montarCorpoSolicitacaoPortal, resumoDaSolicitacaoPortal, type EntradaCorpoPortal, type EntradaResumoPortal } from "../src/lib/resumoDaSolicitacaoPortal";
import ResumoSolicitacao from "../src/components/solicitacao-publica/ResumoSolicitacao";
import { PERFIL_VAZIO, perfilExtraDoFormulario, type PerfilPortal } from "../src/lib/perfilCandidatoPortal";

let total = 0;
function caso(nome: string, fn: () => void) {
  fn();
  total++;
  console.log(`OK    ${nome}`);
}

// ── Corpo do POST: igual ao de antes (cópia congelada do trecho que morava em handleSubmit) ──
interface EstadoPagina extends Omit<EntradaCorpoPortal, "salarioParaEnvio" | "perfil"> {
  salario: string;
  salarioModo: "fixo" | "a_combinar" | "pretensao";
  salarioPeriodo: "mes" | "hora";
}
function salarioParaEnvioDaPagina(e: Pick<EstadoPagina, "salario" | "salarioModo" | "salarioPeriodo">): string | null {
  const valor = e.salario.trim();
  if (!valor) return null;
  if (e.salarioModo === "fixo" && e.salarioPeriodo === "hora") {
    const num = Number(valor);
    return num > 0 ? formatarSalarioHora(num) : null;
  }
  return valor;
}
function corpoDeAntes(e: EstadoPagina) {
  const { cargo, tipoServico, numPosicoes, cidade, estado, adicionaisSalariais, horarioTipo, horarioTexto, previsaoInicio, requisitosTexto, reqChipsList, beneficiosTexto, principaisAtividades, observacoes, confidencial } = e;
  return {
    cargo: cargo.trim(),
    tipo_servico: tipoServico,
    num_posicoes: Number(numPosicoes) || 1,
    cidade: cidade.trim(),
    estado,
    salario: salarioParaEnvioDaPagina(e),
    adicionais_salariais: adicionaisSalariais.trim() || null,
    horario_tipo: horarioTipo || null,
    horario_texto: horarioTexto || null,
    previsao_inicio: previsaoInicio || null,
    requisitos: requisitosTexto || null,
    requisitos_chips: reqChipsList.length > 0 ? reqChipsList : null,
    beneficios: beneficiosTexto || null,
    beneficios_chips: e.beneficiosChips,
    principais_atividades: principaisAtividades.trim() || null,
    observacoes: observacoes.trim() || null,
    horario_padrao: e.horarioPadrao,
    confidencial,
  };
}
const corpoNovo = (e: EstadoPagina, perfil: PerfilPortal = PERFIL_VAZIO) => montarCorpoSolicitacaoPortal({ ...e, salarioParaEnvio: salarioParaEnvioDaPagina(e), perfil });

let semente = 12345;
const aleatorio = () => ((semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296);
const sorteia = <T,>(l: readonly T[]) => l[Math.floor(aleatorio() * l.length)];

function estadoBase(extra: Partial<EstadoPagina> = {}): EstadoPagina {
  return {
    cargo: "Auxiliar administrativo", tipoServico: "recrutamento_selecao", numPosicoes: "2", cidade: "Hortolândia", estado: "SP", salario: "2500", salarioModo: "fixo",
    salarioPeriodo: "mes", adicionaisSalariais: "+ Insalubridade 20%", horarioTipo: "seg_sex", horarioTexto: "Segunda a Sexta, 08h00 às 17h00", previsaoInicio: "2026-11-15",
    requisitosTexto: "• Ensino Médio — Completo\n• Boa comunicação", reqChipsList: ["Ensino Médio — Completo", "Boa comunicação"], beneficiosTexto: "• Vale Transporte\n• Vale Refeição",
    beneficiosChips: { "Vale Transporte": true, "Vale Refeição": true }, principaisAtividades: "Atender clientes", observacoes: "Só a equipe vê", horarioPadrao: { modelo: "seg_sex", entrada: "08:00" },
    confidencial: false, ...extra,
  };
}
caso("corpo do POST: todas as chaves de antes IGUAIS (mesma ordem e valores) em 400 combinações sorteadas, R&S, MOT e Terceirização; perfil_extra é a única chave a mais, no fim", () => {
  const tipos = ["recrutamento_selecao", "mao_obra_temporaria", "terceirizacao"] as const;
  for (let i = 0; i < 400; i++) {
    const modo = sorteia(["fixo", "a_combinar", "pretensao"] as const);
    const e = estadoBase({
      tipoServico: sorteia(tipos), numPosicoes: sorteia(["", "0", "1", "3", "abc", " 5 ", "99"]), cargo: sorteia(["  Motorista ", "Cozinheira", ""]), cidade: sorteia(["Campinas ", "", "Sumaré"]),
      estado: sorteia(["SP", "MG", ""]), salarioModo: modo, salarioPeriodo: sorteia(["mes", "hora"] as const),
      salario: modo === "a_combinar" ? SALARIO_A_COMBINAR : modo === "pretensao" ? SALARIO_ENVIAR_PRETENSAO : sorteia(["", "2500", "12.5", "0", "9.5", " 3000 "]),
      adicionaisSalariais: sorteia(["", "  ", "+ Comissão"]), horarioTipo: sorteia(["", "6x1", "12x36"]), horarioTexto: sorteia(["", "Escala 6x1, 07h às 15h"]), previsaoInicio: sorteia(["", "2026-12-01"]),
      requisitosTexto: sorteia(["", "• CNH B"]), reqChipsList: sorteia([[], ["CNH B"], ["Ensino Superior em Direito — Completo", "Excel"]]), beneficiosTexto: sorteia(["", "• PLR"]),
      beneficiosChips: sorteia([{}, { PLR: true }]), principaisAtividades: sorteia(["", "  ", "Vender\nCobrar"]), observacoes: sorteia(["", " obs "]), horarioPadrao: sorteia([null, { modelo: "6x1", entrada: null }]),
      confidencial: aleatorio() < 0.5,
    });
    const perfil: PerfilPortal = { ...PERFIL_VAZIO, sexo: sorteia(["indiferente", "masc", "fem"] as const), idadeMin: sorteia(["", "18", "21"]), idadeMax: sorteia(["", "45", "60"]), habilitacao: sorteia(["nao", "sim"] as const), habilitacaoCategoria: sorteia(["", "B", "AB"]), localTrabalho: sorteia(["", " Rua A, 10 "]) };
    const novo = corpoNovo(e, perfil) as Record<string, unknown>;
    const { perfil_extra, ...semPerfil } = novo;
    assert.strictEqual(JSON.stringify(semPerfil), JSON.stringify(corpoDeAntes(e)), `combinação ${i}`);
    assert.deepEqual(Object.keys(novo), [...Object.keys(corpoDeAntes(e)), "perfil_extra"], "perfil_extra por último");
    assert.deepEqual(perfil_extra, perfilExtraDoFormulario(perfil));
  }
});

// ── Resumo ───────────────────────────────────────────────────────────────────
function entradaResumo(extra: Partial<EntradaResumoPortal> = {}): EntradaResumoPortal {
  return {
    tipoServico: "recrutamento_selecao", cargo: "Auxiliar administrativo", numPosicoes: "2", cidade: "Hortolândia", estado: "SP", salario: "2500", salarioModo: "fixo", salarioPeriodo: "mes",
    adicionaisSalariais: "+ Insalubridade 20%", previsaoInicio: "2026-11-15", horarioTexto: "Segunda a Sexta, 08h00 às 17h00", beneficios: ["Vale Transporte", "Vale Refeição"],
    requisitos: ["Ensino Médio — Completo", "Boa comunicação"], principaisAtividades: "Atender clientes", observacoes: "Só a equipe vê", confidencial: false, perfil: PERFIL_VAZIO, ...extra,
  };
}
const linhasDe = (e: EntradaResumoPortal) => resumoDaSolicitacaoPortal(e).flatMap((s) => s.linhas);
const valor = (e: EntradaResumoPortal, rotulo: string) => linhasDe(e).find((l) => l.rotulo === rotulo)?.valor;

caso("resumo completo: seções, rótulos, ordem e formatos", () => {
  assert.deepEqual(resumoDaSolicitacaoPortal(entradaResumo()), [
    {
      titulo: "A vaga",
      linhas: [
        { rotulo: "Tipo de serviço", valor: "Recrutamento e Seleção" },
        { rotulo: "Cargo", valor: "Auxiliar administrativo" },
        { rotulo: "Vagas", valor: "2" },
        { rotulo: "Local", valor: "Hortolândia / SP" },
        { rotulo: "Previsão de início", valor: "15/11/2026" },
        { rotulo: "Salário", valor: linhasDe(entradaResumo()).find((l) => l.rotulo === "Salário")!.valor },
        { rotulo: "Adicionais", valor: "+ Insalubridade 20%" },
        { rotulo: "Horário", valor: "Segunda a Sexta, 08h00 às 17h00" },
        { rotulo: "Benefícios", valor: "Vale Transporte, Vale Refeição" },
      ],
    },
    {
      titulo: "Perfil do candidato",
      linhas: [
        { rotulo: "Sexo", valor: "Indiferente" },
        { rotulo: "PCD", valor: "Não" },
        { rotulo: "Habilitação", valor: "Não" },
        { rotulo: "Veículo próprio", valor: "Não" },
      ],
    },
    {
      titulo: "Requisitos e atividades",
      linhas: [
        { rotulo: "Requisitos", valor: "Ensino Médio — Completo, Boa comunicação" },
        { rotulo: "Principais atividades", valor: "Atender clientes" },
        { rotulo: "Outras informações", valor: "Só a equipe vê" },
      ],
    },
  ]);
});
caso("tipo de serviço pelo nome legível: R&S, Mão de Obra Temporária e Terceirização", () => {
  assert.equal(valor(entradaResumo({ tipoServico: "recrutamento_selecao" }), "Tipo de serviço"), "Recrutamento e Seleção");
  assert.equal(valor(entradaResumo({ tipoServico: "mao_obra_temporaria" }), "Tipo de serviço"), "Mão de Obra Temporária");
  assert.equal(valor(entradaResumo({ tipoServico: "terceirizacao" }), "Tipo de serviço"), "Terceirização");
});
caso("salário: por mês, por hora, 'À combinar' e 'Enviar Pretensão Salarial'", () => {
  assert.match(valor(entradaResumo({ salario: "2500" }), "Salário")!, /^R\$\s2\.500,00 por mês$/);
  assert.match(valor(entradaResumo({ salario: "12.5", salarioPeriodo: "hora" }), "Salário")!, /^R\$\s12,50 por hora$/);
  assert.equal(valor(entradaResumo({ salario: SALARIO_A_COMBINAR, salarioModo: "a_combinar" }), "Salário"), "À combinar");
  assert.equal(valor(entradaResumo({ salario: SALARIO_ENVIAR_PRETENSAO, salarioModo: "pretensao" }), "Salário"), "Enviar Pretensão Salarial");
  // sem valor ou zerado: a linha some
  assert.equal(valor(entradaResumo({ salario: "" }), "Salário"), undefined);
  assert.equal(valor(entradaResumo({ salario: "0" }), "Salário"), undefined);
});
caso("adicionais só no salário fixo (À combinar e Pretensão não mostram o que ficou digitado)", () => {
  assert.equal(valor(entradaResumo({ salarioModo: "fixo" }), "Adicionais"), "+ Insalubridade 20%");
  assert.equal(valor(entradaResumo({ salarioModo: "a_combinar", salario: SALARIO_A_COMBINAR }), "Adicionais"), undefined);
  assert.equal(valor(entradaResumo({ salarioModo: "pretensao", salario: SALARIO_ENVIAR_PRETENSAO }), "Adicionais"), undefined);
});
caso("linhas vazias são omitidas e seção sem linhas some", () => {
  const minimo = resumoDaSolicitacaoPortal(entradaResumo({
    cidade: "", estado: "", previsaoInicio: "", salario: "", adicionaisSalariais: " ", horarioTexto: "", beneficios: [], requisitos: [], principaisAtividades: "  ", observacoes: "", numPosicoes: "",
  }));
  assert.deepEqual(minimo.map((x) => x.titulo), ["A vaga", "Perfil do candidato"]);
  assert.deepEqual(minimo[0], { titulo: "A vaga", linhas: [{ rotulo: "Tipo de serviço", valor: "Recrutamento e Seleção" }, { rotulo: "Cargo", valor: "Auxiliar administrativo" }, { rotulo: "Vagas", valor: "1" }] });
  assert.ok(!minimo.some((s) => s.titulo === "Requisitos e atividades"), "seção vazia some");
});
caso("confidencial: a linha só existe quando marcado", () => {
  assert.equal(valor(entradaResumo({ confidencial: true }), "Confidencial"), "Sim");
  assert.equal(valor(entradaResumo({ confidencial: false }), "Confidencial"), undefined);
});
caso("nenhuma linha de contratante, aceite, condições comerciais ou template, em nenhuma combinação", () => {
  const proibidos = /contratante|empresa|cnpj|cpf|telefone|e-?mail|endere[cç]o|aceite|condi[cç][õo]es|template|nota fiscal/i;
  for (const tipoServico of ["recrutamento_selecao", "mao_obra_temporaria", "terceirizacao"]) {
    for (const confidencial of [true, false]) {
      for (const secao of resumoDaSolicitacaoPortal(entradaResumo({ tipoServico, confidencial }))) {
        assert.ok(!proibidos.test(secao.titulo), secao.titulo);
        for (const l of secao.linhas) assert.ok(!proibidos.test(l.rotulo), `${tipoServico}: rótulo ${l.rotulo}`);
      }
    }
  }
});

// ── Componente e página ──────────────────────────────────────────────────────
caso("título do resumo: focável (tabIndex -1) só quando recebe a ref; sem ela o HTML é o de sempre", () => {
  const secoes = resumoDaSolicitacaoPortal(entradaResumo());
  const com = renderToStaticMarkup(createElement(ResumoSolicitacao, { secoes, tituloRef: createRef<HTMLHeadingElement>() }));
  const sem = renderToStaticMarkup(createElement(ResumoSolicitacao, { secoes }));
  assert.ok(/<h3 id="resumo-titulo" tabindex="-1"/.test(com), "com ref: tabindex=-1");
  assert.ok(!/tabindex/i.test(sem), "sem ref: sem tabindex");
});
const pagina = readFileSync(new URL("../src/app/portal/(app)/solicitar-vaga/page.tsx", import.meta.url), "utf8");
const trecho = (de: string, ate: string) => {
  const a = pagina.indexOf(de);
  const b = pagina.indexOf(ate, a);
  assert.ok(a >= 0 && b > a, `trecho ${de}`);
  return pagina.slice(a, b);
};
const FIM_DA_TELA_DE_RESUMO = "return (\n    <div className=\"max-w-2xl mx-auto\">\n      <Link href={templates";
caso("página: só 'Confirmar e enviar' faz o POST; 'Revisar' só valida e abre o resumo; botões travados durante o envio", () => {
  assert.equal((pagina.match(/fetch\("\/api\/portal\/solicitar-vaga", \{\s+method: "POST"/g) ?? []).length, 1, "um único POST de solicitação");
  assert.ok(!trecho("const revisar = () =>", "const voltarParaEditar").includes("fetch("), "revisar não envia nada");
  assert.ok(trecho("const confirmarEnvio", "if (success)").includes('fetch("/api/portal/solicitar-vaga"'));
  assert.ok(trecho("const confirmarEnvio", "setSubmitting(true)").includes("if (submitting) return;"), "ignora clique repetido");
  const telaResumo = trecho("  if (revisando) {\n    const secoes", FIM_DA_TELA_DE_RESUMO);
  assert.ok(telaResumo.includes("onClick={confirmarEnvio}") && /onClick=\{confirmarEnvio\}\s+disabled=\{submitting\}/.test(telaResumo), "confirmar desabilitado enquanto envia");
  assert.ok(/onClick=\{voltarParaEditar\}\s+disabled=\{submitting\}/.test(telaResumo), "voltar desabilitado enquanto envia");
  assert.ok(telaResumo.includes("Confirmar e enviar") && !pagina.includes("Enviar Solicitação →"));
});
caso("página: as validações de antes continuam (cargo, tipo, cidade, estado) e rodam em 'Revisar'", () => {
  const r = trecho("const revisar = () =>", "const voltarParaEditar");
  for (const msg of ["Cargo é obrigatório.", "Tipo de serviço é obrigatório.", "Cidade é obrigatória.", "Estado é obrigatório."]) assert.ok(r.includes(msg), msg);
  assert.ok(r.includes("setRevisando(true)"));
});
caso("acessibilidade: um único h1 na tela do resumo; foco no título ao abrir e no botão 'Revisar' ao voltar, com a rolagem devolvida", () => {
  const telaResumo = trecho("  if (revisando) {\n    const secoes", FIM_DA_TELA_DE_RESUMO);
  assert.equal((telaResumo.match(/<h1\b/g) ?? []).length, 1, "um h1");
  assert.ok(telaResumo.includes("tituloRef={tituloResumoRef}"));
  const efeito = trecho("useEffect(() => {\n    if (revisando) {", "}, [revisando]);");
  assert.ok(efeito.includes("window.scrollTo(0, 0)") && efeito.includes("tituloResumoRef.current?.focus"), "abre: topo + foco no título");
  assert.ok(efeito.includes("window.scrollTo(0, scrollDoFormulario.current)") && efeito.includes("botaoRevisarRef.current?.focus"), "volta: rolagem + foco no botão");
  assert.ok(pagina.includes("scrollDoFormulario.current = window.scrollY"), "guarda a rolagem ao abrir");
  assert.ok(pagina.includes("ref={botaoRevisarRef}") && pagina.includes("Revisar solicitação →"));
});

console.log(`\n${total} casos OK`);
