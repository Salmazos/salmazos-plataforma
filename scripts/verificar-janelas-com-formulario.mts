// Janelas com formulário (Fase 2): quem digitou e fecha por X, Cancelar ou Esc recebe "Você tem dados não salvos. Sair e perder o que digitou?"; sem dado digitado, fecha
// direto. Prova: o controlador puro (src/lib/janelaComFormulario.ts), a confirmação (ConfirmarDescartar) e, por varredura das fontes (AST), que as janelas
// migradas usam o hook e que o inventário fechado das 58 janelas de formulário só muda com revisão (as "pendentes" são as do segundo commit).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-janelas-com-formulario.mts
//   GERAR=1 ... imprime o inventário atual (para atualizar JANELAS depois de uma revisão deliberada).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ConfirmarDescartar from "../src/components/ConfirmarDescartar";
import {
  ATRIBUTO_IGNORAR_SUJO, ATRIBUTO_SUJO_BOTAO, ROTULO_CONTINUAR_EDITANDO, ROTULO_SAIR_SEM_SALVAR, TEXTO_DESCARTAR, criarControleDaJanela, empilharJanela, janelaDoTopo,
  type EventoDeCampo, type EventoDeTecla, type OpcoesDaJanela,
} from "../src/lib/janelaComFormulario";

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
    e.isDirectory() ? arquivos(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name).split(sep).join("/")] : []
  );
}

// ── Varredura: janelas de formulário (overlay que cobre a tela e tem campo dentro) ─────────────────────────────────────
function janelasDeFormulario(): Record<string, number> {
  const por: Record<string, number> = {};
  for (const arq of arquivos("src")) {
    const src = lerFonte(arq);
    if (!/fixed inset-0|position:\s*"fixed"/.test(src)) continue;
    const sf = ts.createSourceFile(arq, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visita = (n: ts.Node) => {
      if (ts.isJsxElement(n)) {
        const attrs = n.openingElement.attributes.properties;
        const attr = (nome: string) => attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === nome)?.initializer?.getText() ?? "";
        const cobreTela = /fixed inset-0/.test(attr("className")) || (/position:\s*"fixed"/.test(attr("style")) && /inset:\s*0/.test(attr("style")));
        if (cobreTela && temCampo(n)) {
          const k = arq.replace(/^src\/components\//, "");
          por[k] = (por[k] ?? 0) + 1;
        }
      }
      ts.forEachChild(n, visita);
    };
    visita(sf);
  }
  return por;
}
function temCampo(el: ts.JsxElement): boolean {
  let achou = false;
  const visita = (n: ts.Node) => {
    // "Modal" genérico (Comercial, propostas): o conteúdo vem em {children}, que são formulários de fora; zona cinzenta tratada como formulário.
    if (ts.isJsxExpression(n) && n.expression?.getText() === "children") achou = true;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const op = ts.isJsxElement(n) ? n.openingElement : n;
      const nome = op.tagName.getText();
      if (["input", "textarea", "select"].includes(nome) || /^(Campo|Input|Select|Textarea|Date|Moeda)/.test(nome)) achou = true;
      if (op.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === "onChange")) achou = true;
    }
    ts.forEachChild(n, visita);
  };
  el.children.forEach(visita);
  return achou;
}
const atuais = janelasDeFormulario();
if (process.env.GERAR) {
  for (const [k, v] of Object.entries(atuais).sort()) console.log(`  "${k}": ${v},`);
  process.exit(0);
}

// ModalDetalheVisitaSupervisao só EXIBE dados (usa componentes "Campo…" de exibição): a varredura o conta, e esta lista o tira do inventário de formulário.
const SO_EXIBE = ["ModalDetalheVisitaSupervisao.tsx"];

// Inventário FECHADO das janelas de formulário: arquivo → número de overlays com campo. Mexer aqui só depois de revisar se a janela entra na regra.
const JANELAS: Record<string, number> = {
  "AniversariantesPageClient.tsx": 2,
  "AvaliacoesPsicologicas.tsx": 1,
  "BancoCandidatosClient.tsx": 1,
  "CandidatoCard.tsx": 1,
  "ComercialClient.tsx": 1,
  "DocumentosPageClient.tsx": 2,
  "EmpresasVisitadasClient.tsx": 1,
  "KmTab.tsx": 1,
  "ModalAdicionarCandidatoVaga.tsx": 1,
  "ModalAdicionarFuncionario.tsx": 1,
  "ModalAdmissaoRapida.tsx": 1,
  "ModalAnexarAsoDemissional.tsx": 1,
  "ModalAssinaturaEletronica.tsx": 1,
  "ModalAtencaoEspecial.tsx": 1,
  "ModalCadastroRapido.tsx": 1,
  "ModalCandidatoDesistiu.tsx": 1,
  "ModalContaPagarHortolandia.tsx": 1,
  "ModalContaReceberHortolandia.tsx": 1,
  "ModalContaSalario.tsx": 1,
  "ModalDetalheVisitaSupervisao.tsx": 1,
  "ModalEditarFuncionario.tsx": 1,
  "ModalEditarIndicacaoCliente.tsx": 1,
  "ModalEditarRescisao.tsx": 1,
  "ModalEditarVaga.tsx": 2,
  "ModalEncaminhamento.tsx": 1,
  "ModalEntrevistaSalmazos.tsx": 1,
  "ModalEnviarPacoteEmail.tsx": 1,
  "ModalExcluirDocumento.tsx": 1,
  "ModalFinalizarProcesso.tsx": 1,
  "ModalIndicacoesCandidato.tsx": 1,
  "ModalIniciarAdmissao.tsx": 1,
  "ModalLancarRescisao.tsx": 1,
  "ModalLinkSolicitacaoVaga.tsx": 1,
  "ModalMotivoEtapa.tsx": 1,
  "ModalNovaVaga.tsx": 1,
  "ModalNovoCliente.tsx": 1,
  "ModalRegistrarAso.tsx": 1,
  "ModalReativarCandidatura.tsx": 1,
  "ModalRegistrarContrato.tsx": 1,
  "ModalReprovacao.tsx": 1,
  "ModalRevisaoCobrancaRS.tsx": 1,
  "ModalSolicitacoesVagas.tsx": 1,
  "ModalUploadDocumentosContabilidade.tsx": 1,
  "ModalVincularClienteSolicitacao.tsx": 1,
  "PerfilEdicao.tsx": 2,
  "PontoPageClient.tsx": 1,
  "PortalAvaliacaoBtn.tsx": 2,
  "SupervisaoConfigClient.tsx": 1,
  "UsuariosPageClient.tsx": 3,
  "VencimentoContratoPageClient.tsx": 1,
  "VinculoCarteiraCliente.tsx": 1,
  "propostas/propostasUi.tsx": 1,
};

// Migradas (primeiro commit): arquivo → [chamadas do hook, chamadas de fechar (X e Cancelar)].
const MIGRADAS: Record<string, [number, number]> = {
  "ModalSolicitacoesVagas.tsx": [1, 1],
  "ModalIniciarAdmissao.tsx": [1, 2],
  "ModalEnviarPacoteEmail.tsx": [1, 2],
  "ModalUploadDocumentosContabilidade.tsx": [1, 2],
  "ModalNovaVaga.tsx": [1, 2],
  "ModalEditarVaga.tsx": [1, 2],
  "ModalEditarIndicacaoCliente.tsx": [1, 2],
  "ModalLancarRescisao.tsx": [1, 2],
  "PerfilEdicao.tsx": [2, 4],
  "ModalNovoCliente.tsx": [1, 2],
};
// Pendentes (segundo commit): todo o resto do inventário. Quando migrar, passa para MIGRADAS e este teste passa a exigir o hook.
const PENDENTES = Object.keys(JANELAS).filter((k) => !(k in MIGRADAS) && !SO_EXIBE.includes(k)).sort();

// ── Controlador (lógica pura) ─────────────────────────────────────────────────────────────────────────────────────────
function janela(extra: Partial<{ ocupado: boolean; escFecha: boolean }> = {}) {
  const estado = { ocupado: false, escFecha: true, fechou: 0, ...extra };
  const opcoes = (): OpcoesDaJanela => ({ onClose: () => void estado.fechou++, ocupado: () => estado.ocupado, escFecha: () => estado.escFecha });
  const c = criarControleDaJanela(opcoes);
  return { c, estado };
}
const campo = (confiavel = true, alvo: EventoDeCampo["alvo"] = { closest: () => null }): EventoDeCampo => ({ confiavel, alvo });
const tecla = (key: string, alvo: EventoDeTecla["alvo"] = { tagName: "INPUT", closest: () => null }): EventoDeTecla => ({ key, alvo });

caso("(d) digitar e fechar (X/Cancelar) pergunta e NÃO fecha; sem dado digitado fecha direto, sem confirmação", () => {
  const { c, estado } = janela();
  c.fechar();
  assert.equal(estado.fechou, 1, "limpo: fecha direto");
  assert.deepEqual(c.estado(), { sujo: false, confirmando: false });
  c.aoMudarCampo(campo());
  assert.deepEqual(c.estado(), { sujo: true, confirmando: false });
  c.fechar();
  assert.equal(estado.fechou, 1, "sujo: não fechou");
  assert.deepEqual(c.estado(), { sujo: true, confirmando: true });
});
caso("(d) prefill e evento não confiável (disparado por código) NÃO marcam; campo com data-sujo-ignorar NÃO marca; data-sujo-botao e marcarSujo() marcam", () => {
  const { c } = janela();
  c.aoMudarCampo(campo(false));
  assert.equal(c.estado().sujo, false, "evento não confiável (prefill, carga da API)");
  c.aoMudarCampo(campo(true, { closest: (s: string) => (s === `[${ATRIBUTO_IGNORAR_SUJO}]` ? {} : null) }));
  assert.equal(c.estado().sujo, false, "campo de busca/filtro");
  c.aoClicar(campo(true, { closest: (s: string) => (s === `[${ATRIBUTO_SUJO_BOTAO}]` ? {} : null) }));
  assert.equal(c.estado().sujo, true, "botão que muda dado sem evento de campo");
  const outra = janela();
  outra.c.aoClicar(campo(true, { closest: () => null }));
  assert.equal(outra.c.estado().sujo, false, "clique em botão qualquer não suja");
  outra.c.aoClicar(campo(false, { closest: () => ({}) }));
  assert.equal(outra.c.estado().sujo, false, "clique não confiável");
  outra.c.marcarSujo();
  assert.equal(outra.c.estado().sujo, true, "marcarSujo() manual (chips, listas Adicionar)");
});
caso("(d) confirmação: 'Continuar editando' mantém a janela e os dados; 'Sair sem salvar' fecha e zera; confirmar não pergunta duas vezes", () => {
  const { c, estado } = janela();
  c.marcarSujo();
  c.fechar();
  c.fechar();
  assert.deepEqual(c.estado(), { sujo: true, confirmando: true });
  c.continuarEditando();
  assert.deepEqual(c.estado(), { sujo: true, confirmando: false });
  assert.equal(estado.fechou, 0);
  c.fechar();
  c.sairSemSalvar();
  assert.equal(estado.fechou, 1);
  assert.deepEqual(c.estado(), { sujo: false, confirmando: false });
});
caso("(d) salvar + fechar não pergunta (limpar() no sucesso); reabrir zera o sujo e fecha a confirmação", () => {
  const { c, estado } = janela();
  c.marcarSujo();
  c.limpar();
  c.fechar();
  assert.equal(estado.fechou, 1, "salvou: fecha direto");
  c.marcarSujo();
  c.fechar();
  assert.equal(c.estado().confirmando, true);
  c.limpar();
  assert.deepEqual(c.estado(), { sujo: false, confirmando: false }, "reabrir zera tudo");
});
caso("(d) ocupado/gravando: X, Cancelar e Esc são ignorados (nem fecha, nem pergunta); sem estar ocupado volta ao normal", () => {
  const { c, estado } = janela({ ocupado: true });
  c.marcarSujo();
  c.fechar();
  assert.deepEqual(c.estado(), { sujo: true, confirmando: false });
  assert.equal(c.aoTeclar(tecla("Escape")), false || c.estado().confirmando === false);
  assert.equal(estado.fechou, 0);
  const limpo = janela({ ocupado: true });
  limpo.c.fechar();
  assert.equal(limpo.estado.fechou, 0, "nem janela limpa fecha gravando");
  limpo.estado.ocupado = false;
  limpo.c.fechar();
  assert.equal(limpo.estado.fechou, 1);
});
caso("(d) Esc: pergunta se sujo e fecha se limpo; Esc de <select> ou de elemento com popup aberto (aria-expanded) NÃO fecha; outras teclas não; Esc com a confirmação aberta é da confirmação", () => {
  const { c, estado } = janela();
  assert.equal(c.aoTeclar(tecla("Escape")), true);
  assert.equal(estado.fechou, 1, "limpo: Esc fecha");
  c.marcarSujo();
  assert.equal(c.aoTeclar(tecla("Escape")), true);
  assert.deepEqual(c.estado(), { sujo: true, confirmando: true }, "sujo: Esc pergunta");
  assert.equal(c.aoTeclar(tecla("Escape")), false, "com a confirmação aberta o Esc da janela não age");
  c.continuarEditando();
  assert.equal(c.aoTeclar(tecla("Escape", { tagName: "SELECT", closest: () => null })), false, "<select>");
  assert.equal(c.aoTeclar(tecla("Escape", { tagName: "DIV", closest: (s: string) => (s === '[aria-expanded="true"]' ? {} : null) })), false, "popup aberto");
  assert.equal(c.aoTeclar(tecla("Enter")), false);
  assert.equal(c.aoTeclar(tecla("Tab")), false);
  assert.equal(c.aoTeclar({ key: "Escape", alvo: null, defaultPrevented: true }), false, "Esc já tratado por outro (defaultPrevented)");
  assert.deepEqual(c.estado(), { sujo: true, confirmando: false });
});
caso("(d) escFecha=false: o Esc não fecha esta janela (aviso por cima, tela que mantém o Esc desligado), mas X e Cancelar seguem perguntando", () => {
  const { c, estado } = janela({ escFecha: false });
  assert.equal(c.aoTeclar(tecla("Escape")), false);
  assert.equal(estado.fechou, 0);
  c.fechar();
  assert.equal(estado.fechou, 1, "limpo: X/Cancelar fecham");
  c.marcarSujo();
  c.fechar();
  assert.equal(c.estado().confirmando, true, "sujo: X/Cancelar perguntam");
});
caso("(d) janelas empilhadas: só a do topo age no Esc; ao fechar a de cima a de baixo volta a ser a do topo", () => {
  const baixo = janela().c;
  const cima = janela().c;
  const sairBaixo = empilharJanela(baixo);
  const sairCima = empilharJanela(cima);
  assert.equal(janelaDoTopo(), cima);
  sairCima();
  assert.equal(janelaDoTopo(), baixo);
  sairBaixo();
  assert.equal(janelaDoTopo(), undefined);
});
caso("(d) ouvintes: o hook é avisado só quando o estado muda (sujo, confirmando, limpo)", () => {
  const { c } = janela();
  let n = 0;
  const sair = c.assinar(() => n++);
  c.marcarSujo();
  c.marcarSujo();
  assert.equal(n, 1, "marcar sujo de novo não notifica");
  c.fechar();
  c.continuarEditando();
  c.limpar();
  assert.equal(n, 4);
  c.limpar();
  assert.equal(n, 4, "limpar já limpo não notifica");
  sair();
  c.marcarSujo();
  assert.equal(n, 4);
});

// ── ConfirmarDescartar (SSR) ─────────────────────────────────────────────────────────────────────────────────────────
caso("(c) ConfirmarDescartar: texto exato, os dois botões na ordem (Continuar editando primeiro, com o foco), role alertdialog, z acima de 100 e abaixo de 9999", () => {
  assert.equal(TEXTO_DESCARTAR, "Você tem dados não salvos. Sair e perder o que digitou?");
  assert.equal(ROTULO_CONTINUAR_EDITANDO, "Continuar editando");
  assert.equal(ROTULO_SAIR_SEM_SALVAR, "Sair sem salvar");
  const html = renderToStaticMarkup(createElement(ConfirmarDescartar, { aoContinuar: () => undefined, aoSair: () => undefined }));
  assert.ok(html.includes("Você tem dados não salvos. Sair e perder o que digitou?"));
  assert.ok(html.includes('role="alertdialog"') && html.includes('aria-modal="true"'));
  const continuar = html.indexOf(">Continuar editando<");
  const sair = html.indexOf(">Sair sem salvar<");
  assert.ok(continuar > 0 && sair > continuar, "Continuar editando vem antes de Sair sem salvar");
  assert.equal((html.match(/<button/g) ?? []).length, 2, "dois botões");
  const z = Number(html.match(/z-\[(\d+)\]/)?.[1]);
  assert.ok(z > 100 && z < 9999, `z-index ${z}`);
  const fonte = lerFonte("src/components/ConfirmarDescartar.tsx");
  assert.ok(fonte.includes("continuar.current?.focus()"), "foco inicial em Continuar editando");
  assert.ok(fonte.includes('e.key === "Escape"') && fonte.includes("aoContinuar();"), "Esc = Continuar editando");
  assert.ok(fonte.includes("prenderTabNoModal") && fonte.includes("devolverFocoSeExistir"), "reaproveita focoDosModais");
});
caso("(c) hook: confirmação num portal no body, janela de baixo inert, Esc no document só na janela do topo, beforeunload preparado e DESLIGADO", () => {
  const h = lerFonte("src/components/useJanelaComFormulario.tsx");
  assert.ok(h.includes("createPortal(") && h.includes("document.body"));
  assert.ok(h.includes("inert: confirmando || undefined"));
  assert.ok(h.includes("janelaDoTopo() !== controle") && h.includes('document.addEventListener("keydown", aoTecla)'));
  assert.ok(h.includes("avisarAoSairDaPagina = false"), "beforeunload desligado por padrão");
  assert.ok(h.includes('"beforeunload"'));
  for (const arq of arquivos("src")) assert.equal(lerFonte(arq).includes("avisarAoSairDaPagina: true"), false, `${arq}: nenhuma janela liga o beforeunload`);
  const lib = lerFonte("src/lib/janelaComFormulario.ts");
  assert.ok(lib.includes("escapeDeveFecharModal"), "reaproveita o Esc de select/popup");
  assert.ok(h.includes("e.nativeEvent.isTrusted"), "só evento do usuário suja");
  // Achados no teste em navegador real: o Esc vale com o foco no botão que abriu a janela (atrás do fundo), só ignora foco em OUTRO diálogo por cima;
  // e o foco volta a quem o tinha ANTES da confirmação (a janela de baixo fica inert e o navegador tira o foco dela).
  assert.ok(h.includes('alvo?.closest(\'[role="dialog"], [role="alertdialog"], [aria-modal="true"]\')'), "Esc com foco fora da janela vale; foco em outro diálogo não");
  assert.ok(h.includes("guardarOrigemDoFoco()") && h.includes("origemDoFoco: origemDoFoco.current"), "origem do foco guardada antes de abrir a confirmação");
  assert.ok(lerFonte("src/components/ConfirmarDescartar.tsx").includes("origemDoFoco ?? null"));
});

// ── Varredura das fontes ──────────────────────────────────────────────────────────────────────────────────────────────
caso("(b) inventário FECHADO: 58 janelas de formulário; janela nova, a mais ou a menos quebra o teste e pede revisão", () => {
  const sem = Object.fromEntries(Object.entries(atuais).filter(([k]) => !SO_EXIBE.includes(k)));
  assert.deepEqual(Object.keys(sem).sort(), Object.keys(JANELAS).filter((k) => !SO_EXIBE.includes(k)).sort());
  assert.deepEqual(sem, Object.fromEntries(Object.entries(JANELAS).filter(([k]) => !SO_EXIBE.includes(k))));
  assert.equal(Object.values(sem).reduce((s, v) => s + v, 0), 58, "58 overlays com formulário");
  assert.equal(Object.keys(MIGRADAS).length, 10);
  assert.ok(PENDENTES.length > 0 && PENDENTES.length + Object.keys(MIGRADAS).length === Object.keys(sem).length, "migradas + pendentes = inventário");
});
caso("(a) as janelas migradas usam o hook (uma chamada por janela) e X/Cancelar chamam fechar; não sobrou fechar direto; sucesso chama limpar()", () => {
  for (const [arq, [hooks, fechares]] of Object.entries(MIGRADAS)) {
    const f = lerFonte(`src/components/${arq}`);
    assert.ok(f.includes('from "@/components/useJanelaComFormulario"'), `${arq}: importa o hook`);
    assert.equal((f.match(/useJanelaComFormulario\(\{/g) ?? []).length, hooks, `${arq}: chamadas do hook`);
    assert.equal((f.match(/onClick=\{j\w*\.fechar\}/g) ?? []).length, fechares, `${arq}: X/Cancelar com fechar`);
    assert.equal(/onClick=\{onClose\}/.test(f), false, `${arq}: sobrou onClick={onClose} direto`);
    assert.equal(/onClick=\{\(\) => set(Email|Reprovar)ModalOpen\(false\)\}/.test(f), false, `${arq}: sobrou fechar direto`);
    assert.ok(/j\w*\.dialogo/.test(f), `${arq}: renderiza a confirmação`);
    assert.ok(/j\w*\.propsDoContainer/.test(f), `${arq}: espalha propsDoContainer no fundo da janela`);
    assert.ok(/j\w*\.limpar\(\)/.test(f), `${arq}: limpa o sujo no caminho de sucesso`);
  }
});
caso("(b) as pendentes NÃO usam o hook ainda (segundo commit); as janelas de leitura e os popups não usam nunca", () => {
  for (const arq of PENDENTES) assert.equal(lerFonte(`src/components/${arq}`).includes("useJanelaComFormulario"), false, `${arq}: ainda pendente`);
  const quemUsa = arquivos("src")
    .filter((f) => !f.endsWith("/useJanelaComFormulario.tsx") && lerFonte(f).includes("useJanelaComFormulario("))
    .map((f) => f.replace(/^src\/components\//, ""));
  assert.deepEqual(quemUsa.sort(), Object.keys(MIGRADAS).sort());
  const popups = arquivos("src/components").filter((f) => /\/Popup[A-Za-z]+\.tsx$|PopupComissoesPendencias\.tsx$/.test(f));
  assert.equal(popups.length, 18);
  for (const p of popups) assert.equal(lerFonte(p).includes("JanelaComFormulario"), false, p);
  for (const leitura of ["ConfirmarCriarVagaSemCliente", "ModalContratoMot", "NotificacoesBell", "SidebarMenu", "SidebarPortal"]) {
    assert.equal(lerFonte(`src/components/${leitura}.tsx`).includes("JanelaComFormulario"), false, leitura);
  }
});
caso("regras por janela: busca com data-sujo-ignorar, chips e 'Adicionar' marcam sujo, upload limpa, wizard Voltar não fecha, janela de cima bloqueia o Esc da de baixo", () => {
  const ia = lerFonte("src/components/ModalIniciarAdmissao.tsx");
  assert.ok(ia.includes('placeholder="Buscar por nome..." value={busca} data-sujo-ignorar'), "busca de candidato não suja");
  assert.ok(ia.includes("j.marcarSujo();\n    setAdicionais((prev) => [...prev,") && ia.includes("onClick={handleVoltar}"), "adicionais marcam; Voltar do wizard não fecha");
  assert.equal(/handleVoltar = \(\) => \{[^}]*j\.fechar/.test(ia), false);
  for (const arq of ["ModalNovaVaga", "ModalEditarVaga"]) {
    const f = lerFonte(`src/components/${arq}.tsx`);
    for (const fn of ["toggleHabilidade", "toggleBen", "toggleReq", "adicionarBenCustom", "adicionarReqCustom", "handleSalarioModoChange"]) {
      assert.ok(new RegExp(`const ${fn} = [^{]*\\{[\\s\\S]{0,200}j\\.marcarSujo\\(\\)`).test(f), `${arq}.${fn} marca sujo`);
    }
    assert.ok(f.includes("escFecha: ") && f.includes("!avisoCliente"), `${arq}: Esc não fecha com o aviso de cliente aberto`);
  }
  assert.ok(lerFonte("src/components/ModalNovoCliente.tsx").includes("j.marcarSujo();\n    setServicos("), "chips de serviço marcam sujo");
  const up = lerFonte("src/components/ModalUploadDocumentosContabilidade.tsx");
  assert.ok(up.includes("j.limpar();\n      setDocumentos("), "limpar() após cada upload ok");
  assert.ok(up.includes("escFecha: !confirmacaoPendente"));
  const sol = lerFonte("src/components/ModalSolicitacoesVagas.tsx");
  assert.ok(sol.includes("cadastrandoCliente === null && vinculandoCliente === null && confirmandoVagaSemCliente === null && avisosVaga.length === 0"), "Esc só na janela do topo");
  assert.ok(sol.includes("|| j.confirmando}"), "inert também com a pergunta aberta");
  assert.ok(lerFonte("src/components/BotaoUsarModeloJornada.tsx").includes("data-sujo-botao={onSalvar ? undefined : true}"));
  assert.ok(lerFonte("src/components/admissao/SeletorHorarioIniciarAdmissao.tsx").includes("data-sujo-botao"));
});
caso("ModalNovoCliente: Esc continua desligado na tela Clientes (decisão de cbff952: tela em produção, fora do escopo da solicitação); só o cadastro por solicitação tem Esc, agora com a pergunta", () => {
  const f = lerFonte("src/components/ModalNovoCliente.tsx");
  assert.ok(f.includes("escFecha: !!solicitacao && !posCriacao"));
  assert.equal(/e\.key === "Escape"\) \{[^}]*onClose/.test(f), false, "nenhum Esc fecha direto");
  assert.equal(f.includes("escapeDeveFecharModal"), false, "o Esc de select/popup agora vem do hook");
  assert.ok(f.includes("onClick={j.fechar}") && f.includes("data-sujo-ignorar"), "X/Cancelar perguntam nos dois modos; usuários do portal não sujam");
});

console.log(`\n${total} casos OK`);
