// Fundo das janelas (modais): clicar no fundo escuro NÃO fecha janela com formulário, e as janelas só de leitura só fecham se o gesto inteiro (descer e
// subir o botão do mouse/toque) foi no próprio fundo. Varre as fontes (AST) e prova a regra de src/lib/fundoDaJanela.ts em todo overlay do projeto.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-fundo-das-janelas.mts
//   GERAR=1 ... imprime o inventário atual (para atualizar INVENTARIO depois de uma revisão deliberada).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { fundoDeFormulario, fundoSoLeitura } from "../src/lib/fundoDaJanela";

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

// ── Varredura: todo elemento JSX que cobre a tela (fixed inset-0 / position fixed + inset 0) ─────────────────────────
type Tipo = "formulario" | "leitura" | "com-onclick" | "sem-fundo";
interface Overlay { arq: string; linha: number; tipo: Tipo; texto: string; semHelperComClique: boolean }
function overlays(): Overlay[] {
  const achados: Overlay[] = [];
  for (const arq of arquivos("src")) {
    const src = lerFonte(arq);
    if (!/fixed inset-0|position:\s*"fixed"/.test(src)) continue;
    const sf = ts.createSourceFile(arq, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visita = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
        const op = ts.isJsxElement(n) ? n.openingElement : n;
        const attrs = op.attributes.properties;
        const attr = (nome: string) => attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === nome)?.initializer?.getText() ?? "";
        const cobreTela = /fixed inset-0/.test(attr("className")) || (/position:\s*"fixed"/.test(attr("style")) && /inset:\s*0/.test(attr("style")));
        if (cobreTela) {
          const spreads = attrs.filter(ts.isJsxSpreadAttribute).map((a) => a.getText()).join(" ");
          const temOnClick = attrs.some((a) => ts.isJsxAttribute(a) && a.name.getText() === "onClick");
          const tipo: Tipo = spreads.includes("fundoDeFormulario()") ? "formulario" : spreads.includes("fundoSoLeitura(") ? "leitura" : temOnClick ? "com-onclick" : "sem-fundo";
          achados.push({ arq, linha: sf.getLineAndCharacterOfPosition(op.getStart()).line + 1, tipo, texto: op.getText().replace(/\s+/g, " ").slice(0, 120), semHelperComClique: temOnClick && tipo !== "formulario" && tipo !== "leitura" });
        }
      }
      ts.forEachChild(n, visita);
    };
    visita(sf);
  }
  return achados;
}
const todos = overlays();
const contagem = (): Record<string, [number, number, number]> => {
  const c: Record<string, [number, number, number]> = {};
  for (const o of todos) {
    const k = o.arq.replace(/^src\//, "");
    const e = (c[k] ??= [0, 0, 0]);
    if (o.tipo === "formulario") e[0]++;
    else if (o.tipo === "leitura") e[1]++;
    else e[2]++;
  }
  return c;
};
if (process.env.GERAR) {
  for (const [k, v] of Object.entries(contagem()).sort()) console.log(`  "${k}": [${v.join(", ")}],`);
  process.exit(0);
}

// Inventário FECHADO: arquivo → [fundo de formulário, fundo só de leitura, sem fundo clicável]. Janela nova, janela a mais ou mudança de tipo quebra o
// teste: quem mexe revisa se a janela tem formulário e escolhe fundoDeFormulario() ou fundoSoLeitura() (ver src/lib/fundoDaJanela.ts) e atualiza aqui.
const INVENTARIO: Record<string, [number, number, number]> = {
  "components/AniversariantesPageClient.tsx": [2, 0, 0],
  "components/AvaliacoesPsicologicas.tsx": [1, 0, 0],
  "components/AvisoClienteNoTextoPublico.tsx": [0, 0, 1],
  "components/BancoCandidatosClient.tsx": [1, 2, 0],
  "components/CandidatoCard.tsx": [1, 0, 0],
  "components/ComercialClient.tsx": [1, 0, 0],
  "components/ConfirmarCriarVagaSemCliente.tsx": [0, 1, 0],
  // Fase 2: confirmação "dados não salvos" (portal no body). Sem clique no fundo: é a janela que PROTEGE o que foi digitado.
  "components/ConfirmarDescartar.tsx": [0, 0, 1],
  "components/DocumentosPageClient.tsx": [2, 0, 0],
  "components/EmpresasVisitadasClient.tsx": [1, 0, 0],
  "components/KmTab.tsx": [0, 0, 1],
  "components/ModalAdicionarCandidatoVaga.tsx": [0, 0, 1],
  "components/ModalAdicionarFuncionario.tsx": [1, 0, 0],
  "components/ModalAdmissaoRapida.tsx": [1, 0, 0],
  "components/ModalAnexarAsoDemissional.tsx": [1, 0, 0],
  "components/ModalAssinaturaEletronica.tsx": [1, 0, 0],
  "components/ModalAtencaoEspecial.tsx": [0, 0, 1],
  "components/ModalCadastroRapido.tsx": [0, 0, 1],
  "components/ModalCandidatoDesistiu.tsx": [1, 0, 0],
  "components/ModalConfirmarSemCurriculo.tsx": [0, 0, 1],
  "components/ModalContaPagarHortolandia.tsx": [0, 0, 1],
  "components/ModalContaReceberHortolandia.tsx": [0, 0, 1],
  "components/ModalContaSalario.tsx": [1, 0, 0],
  "components/ModalContratoMot.tsx": [0, 1, 0],
  "components/ModalDetalheVisitaSupervisao.tsx": [0, 0, 1],
  "components/ModalEditarFuncionario.tsx": [1, 0, 0],
  "components/ModalEditarIndicacaoCliente.tsx": [1, 0, 0],
  "components/ModalEditarRescisao.tsx": [1, 0, 0],
  "components/ModalEditarVaga.tsx": [0, 0, 2],
  "components/ModalEncaminhamento.tsx": [0, 0, 1],
  "components/ModalEntrevistaSalmazos.tsx": [1, 0, 0],
  "components/ModalEnviarPacoteEmail.tsx": [1, 0, 0],
  "components/ModalExcluirDocumento.tsx": [1, 0, 0],
  "components/ModalFinalizarProcesso.tsx": [0, 0, 1],
  "components/ModalIndicacoesCandidato.tsx": [1, 0, 0],
  "components/ModalIniciarAdmissao.tsx": [1, 0, 0],
  "components/ModalLancarRescisao.tsx": [1, 0, 0],
  "components/ModalLinkSolicitacaoVaga.tsx": [1, 0, 0],
  "components/ModalMotivoEtapa.tsx": [1, 0, 0],
  "components/ModalNovaVaga.tsx": [0, 0, 1],
  "components/ModalNovoCliente.tsx": [0, 0, 1],
  "components/ModalRegistrarAso.tsx": [1, 0, 0],
  "components/ModalReativarCandidatura.tsx": [1, 0, 0],
  "components/ModalRegistrarContrato.tsx": [1, 0, 0],
  "components/ModalReprovacao.tsx": [0, 0, 1],
  "components/ModalRevisaoCobrancaRS.tsx": [0, 0, 1],
  "components/ModalRenovarLink.tsx": [0, 1, 0],
  "components/ModalSolicitacoesVagas.tsx": [1, 0, 1],
  "components/ModalUploadDocumentosContabilidade.tsx": [1, 1, 0],
  "components/ModalVincularClienteSolicitacao.tsx": [0, 0, 1],
  "components/NotificacoesBell.tsx": [0, 1, 0],
  "components/PerfilEdicao.tsx": [2, 2, 1],
  "components/PontoPageClient.tsx": [0, 0, 1],
  "components/PopupAniversariosHoje.tsx": [0, 0, 1],
  "components/PopupAsoPeriodicoHoje.tsx": [0, 0, 1],
  "components/PopupAvisosPortal.tsx": [0, 0, 1],
  "components/PopupCobrancaEnviada.tsx": [0, 0, 1],
  "components/PopupCobrancaVencida.tsx": [0, 0, 1],
  "components/PopupCobrancasRSPendentes.tsx": [0, 0, 1],
  "components/PopupContaReceberHortolandiaVencida.tsx": [0, 0, 1],
  "components/PopupDecisoesClienteCandidato.tsx": [0, 0, 1],
  "components/PopupFeriasVencimento.tsx": [0, 0, 1],
  "components/PopupIndicacaoDiretaPendente.tsx": [0, 0, 1],
  "components/PopupLembretesComercial.tsx": [0, 0, 1],
  "components/PopupPedidosClientePendentes.tsx": [0, 0, 1],
  "components/PopupPosVendaRSHoje.tsx": [0, 0, 1],
  "components/PopupRescisoesHoje.tsx": [0, 0, 1],
  "components/PopupSolicitacaoVagaPendente.tsx": [0, 0, 1],
  "components/PopupSupervisaoPendente.tsx": [0, 0, 1],
  "components/PopupVencimentoContratoMot.tsx": [0, 0, 1],
  "components/PopupVencimentoContratoMotPortal.tsx": [0, 0, 1],
  "components/PortalAvaliacaoBtn.tsx": [0, 0, 2],
  "components/PortalDocumentosFuncionarioModal.tsx": [0, 0, 1],
  "components/SidebarMenu.tsx": [0, 1, 0],
  "components/SidebarPortal.tsx": [0, 1, 0],
  "components/SupervisaoConfigClient.tsx": [1, 0, 0],
  "components/UsuariosPageClient.tsx": [0, 0, 5],
  "components/VagaDetalheClient.tsx": [0, 2, 0],
  "components/VencimentoContratoPageClient.tsx": [1, 0, 0],
  "components/VinculoCarteiraCliente.tsx": [0, 0, 1],
  "components/admissao/CapturaComEnquadramento.tsx": [0, 0, 1],
  "components/comissao/PopupComissoesPendencias.tsx": [0, 0, 1],
  "components/ferias/ModaisFerias.tsx": [1, 0, 0],
  "components/propostas/propostasUi.tsx": [1, 0, 0],
};

// Janelas só de leitura que fecham no fundo (as 13 revisadas: as 12 de antes e o ModalRenovarLink; o resto do inventário é formulário ou não fecha no fundo).
const SO_LEITURA = [
  "components/BancoCandidatosClient.tsx", "components/ConfirmarCriarVagaSemCliente.tsx", "components/ModalContratoMot.tsx",
  "components/ModalRenovarLink.tsx", "components/ModalUploadDocumentosContabilidade.tsx", "components/NotificacoesBell.tsx", "components/PerfilEdicao.tsx", "components/SidebarMenu.tsx",
  "components/SidebarPortal.tsx", "components/VagaDetalheClient.tsx",
];

// ── Helper (comportamento) ────────────────────────────────────────────────────────────────────────────────────────────
type Ev = { target: object; currentTarget: object };
const fundo = {};
const caixa = {};
const ev = (alvo: object): Ev => ({ target: alvo, currentTarget: fundo });
function gesto(fechar: () => void, passos: Array<[string, object]>) {
  const h = fundoSoLeitura(fechar) as unknown as Record<string, (e: Ev) => void>;
  for (const [tipo, alvo] of passos) h[tipo](ev(alvo));
}

caso("helper, janela com formulário: o fundo não responde (nenhum handler de clique, mouse ou toque), só a marca do tipo", () => {
  const p = fundoDeFormulario() as Record<string, unknown>;
  assert.deepEqual(Object.keys(p), ["data-fundo"]);
  assert.equal(p["data-fundo"], "formulario");
  for (const k of ["onClick", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp"]) assert.equal(k in p, false, k);
  const html = renderToStaticMarkup(createElement("div", { className: "fixed inset-0", ...fundoDeFormulario() }));
  assert.ok(html.includes('data-fundo="formulario"') && !html.includes("onclick"));
});
caso("helper, janela só de leitura: gesto inteiro no fundo (descer, subir, clicar) fecha UMA vez; o gesto é consumido (um clique solto depois não fecha)", () => {
  let n = 0;
  gesto(() => n++, [["onMouseDown", fundo], ["onMouseUp", fundo], ["onClick", fundo]]);
  assert.equal(n, 1);
  gesto(() => n++, [["onClick", fundo]]);
  assert.equal(n, 1, "clique sem descer e subir no fundo não fecha");
});
caso("helper, leitura: ARRASTAR para selecionar texto não fecha (descer dentro e soltar no fundo; descer no fundo e soltar dentro)", () => {
  let n = 0;
  gesto(() => n++, [["onMouseDown", caixa], ["onMouseUp", fundo], ["onClick", fundo]]);
  assert.equal(n, 0, "desceu dentro da caixa, subiu no fundo: o navegador manda o click ao fundo, e ele deve ser ignorado");
  gesto(() => n++, [["onMouseDown", fundo], ["onMouseUp", caixa], ["onClick", fundo]]);
  assert.equal(n, 0, "desceu no fundo, subiu dentro da caixa");
  gesto(() => n++, [["onMouseDown", caixa], ["onMouseUp", caixa], ["onClick", caixa]]);
  assert.equal(n, 0, "clique dentro da caixa");
});
caso("helper, leitura: toque (pointer) e o mouse emulado juntos fecham uma só vez; menu mobile/sino continuam fechando ao tocar fora", () => {
  let n = 0;
  gesto(() => n++, [["onPointerDown", fundo], ["onPointerUp", fundo], ["onMouseDown", fundo], ["onMouseUp", fundo], ["onClick", fundo]]);
  assert.equal(n, 1);
  let m = 0;
  gesto(() => m++, [["onPointerDown", fundo], ["onPointerUp", fundo], ["onClick", fundo]]);
  assert.equal(m, 1, "navegador de toque que só emite pointer + click (sem mouse emulado)");
  let k = 0;
  gesto(() => k++, [["onPointerDown", caixa], ["onPointerUp", fundo], ["onClick", fundo]]);
  assert.equal(k, 0, "dedo que começou dentro da caixa e soltou no fundo");
});
caso("helper, leitura: marca o tipo e entrega os cinco handlers (o onClick garante o toque em iOS)", () => {
  const p = fundoSoLeitura(() => undefined) as Record<string, unknown>;
  assert.equal(p["data-fundo"], "leitura");
  for (const k of ["onClick", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp"]) assert.equal(typeof p[k], "function", k);
});

// ── Varredura das fontes ──────────────────────────────────────────────────────────────────────────────────────────────
caso("(a) nenhum overlay de janela tem onClick próprio de fechar no fundo: todo fundo clicável passa por fundoDeFormulario() ou fundoSoLeitura()", () => {
  assert.ok(todos.length >= 90, `varredura achou só ${todos.length} overlays`);
  const fora = todos.filter((o) => o.semHelperComClique);
  assert.deepEqual(fora.map((o) => `${o.arq}:${o.linha} ${o.texto}`), []);
});
caso("(a) janela com formulário nunca usa a regra de leitura: os fundoSoLeitura estão só nos arquivos revisados (confirmações, menus e escolhas, sem campo)", () => {
  const usam = [...new Set(todos.filter((o) => o.tipo === "leitura").map((o) => o.arq.replace(/^src\//, "")))].sort();
  assert.deepEqual(usam, [...SO_LEITURA].sort());
  assert.equal(todos.filter((o) => o.tipo === "leitura").length, 13);
});
caso("(b) cada janela só de leitura usa a regra de mousedown + mouseup: o helper é chamado com a função que fecha", () => {
  for (const arq of SO_LEITURA) {
    const f = lerFonte(`src/${arq}`);
    assert.ok(f.includes('import { ') && f.includes('from "@/lib/fundoDaJanela"') && /fundoSoLeitura\(/.test(f), arq);
    assert.ok(!/onClick=\{\(e\)\s*=>\s*\{?\s*if \(e\.target === e\.currentTarget/.test(f), `${arq}: sobrou o guarda antigo no fundo`);
  }
  assert.ok(lerFonte("src/components/SidebarMenu.tsx").includes("{...fundoSoLeitura(() => setMobileOpen(false))}"));
  assert.ok(lerFonte("src/components/SidebarPortal.tsx").includes("{...fundoSoLeitura(() => setMobileOpen(false))}"));
  assert.ok(lerFonte("src/components/NotificacoesBell.tsx").includes("{...fundoSoLeitura(() => setAberto(false))}"));
});
caso("(c) inventário FECHADO: janela nova, a mais ou com tipo trocado quebra este teste e pede revisão", () => {
  const atual = contagem();
  const esperado = INVENTARIO;
  assert.deepEqual(Object.keys(atual).sort(), Object.keys(esperado).sort(), "arquivo com overlay novo ou que deixou de ter");
  assert.deepEqual(atual, esperado);
  assert.equal(Object.values(atual).reduce((s, v) => s + v[0], 0), 37, "37 fundos de formulário");
  assert.equal(Object.values(atual).reduce((s, v) => s + v[1], 0), 13, "13 fundos só de leitura");
});
caso("(d) os 19 popups automáticos de login e as janelas que já não fechavam no fundo não mudaram: continuam sem fundo clicável e sem o helper", () => {
  const popups = arquivos("src/components").filter((f) => /\/(Popup[A-Za-z]+|comissao\/PopupComissoesPendencias)\.tsx$/.test(f));
  assert.equal(popups.length, 19, `popups encontrados: ${popups.length}`);
  for (const p of popups) {
    const dele = todos.filter((o) => o.arq === p);
    assert.ok(dele.length >= 1, p);
    for (const o of dele) assert.equal(o.tipo, "sem-fundo", `${p}:${o.linha}`);
    assert.ok(!lerFonte(p).includes("fundoDaJanela"), `${p}: não importa o helper`);
  }
  const jaProtegidas = [
    "components/ModalNovaVaga.tsx", "components/ModalEditarVaga.tsx", "components/ModalNovoCliente.tsx", "components/ModalVincularClienteSolicitacao.tsx",
    "components/ModalFinalizarProcesso.tsx", "components/ModalReprovacao.tsx", "components/ModalEncaminhamento.tsx", "components/ModalAdicionarCandidatoVaga.tsx",
    "components/ModalAtencaoEspecial.tsx", "components/ModalCadastroRapido.tsx", "components/KmTab.tsx", "components/UsuariosPageClient.tsx", "components/PortalAvaliacaoBtn.tsx",
    "components/AvisoClienteNoTextoPublico.tsx", "components/ModalDetalheVisitaSupervisao.tsx", "components/PortalDocumentosFuncionarioModal.tsx",
  ];
  for (const arq of jaProtegidas) {
    const dele = todos.filter((o) => o.arq === `src/${arq}`);
    assert.ok(dele.length >= 1, arq);
    for (const o of dele) assert.equal(o.tipo, "sem-fundo", `${arq}:${o.linha}`);
    assert.ok(!lerFonte(`src/${arq}`).includes("fundoDaJanela"), `${arq}: sem helper`);
  }
});
caso("zona cinzenta tratada como formulário: o 'Modal' genérico de propostas e o de Comercial (conteúdo de fora) não fecham no fundo; o X continua", () => {
  const pr = lerFonte("src/components/propostas/propostasUi.tsx");
  assert.ok(pr.includes("{...fundoDeFormulario()}") && pr.includes("<button onClick={fechar} disabled={bloqueado}"));
  const co = lerFonte("src/components/ComercialClient.tsx");
  assert.ok(co.includes("{...fundoDeFormulario()}") && co.includes('onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280" }} aria-label="Fechar"'));
});
caso("toda janela com formulário segue com saída: dentro de cada fundo de formulário há Cancelar/Fechar/X e uma chamada que fecha (onClose, fechar, cancelar ou set…(false/null))", () => {
  let verificadas = 0;
  for (const arq of [...new Set(todos.filter((o) => o.tipo === "formulario").map((o) => o.arq))]) {
    const src = lerFonte(arq);
    const sf = ts.createSourceFile(arq, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visita = (n: ts.Node) => {
      if (ts.isJsxElement(n) && n.openingElement.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a) && a.getText().includes("fundoDeFormulario()"))) {
        const t = n.getText();
        assert.ok(/Cancelar|Fechar|Voltar|✕|×|&times;|aria-label="(Fechar|Close)"|M6 18L18 6|\{children\}/.test(t), `${arq}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: sem botão de saída`);
        assert.ok(/onClick=\{[^}]*(onClose|fechar|set\w+\((false|null)\)|cancelar)/.test(t), `${arq}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: sem chamada que fecha`);
        verificadas++;
      }
      ts.forEachChild(n, visita);
    };
    visita(sf);
  }
  assert.equal(verificadas, 37);
});
caso("janelas empilhadas: a solicitação de vaga (formulário) não fecha no fundo; a confirmação de criar vaga fecha só com o gesto inteiro no seu fundo; as demais (novo cliente, vincular) seguem sem fundo clicável", () => {
  const sol = todos.filter((o) => o.arq === "src/components/ModalSolicitacoesVagas.tsx");
  assert.deepEqual(sol.map((o) => o.tipo), ["formulario", "sem-fundo"]);
  assert.deepEqual(todos.filter((o) => o.arq === "src/components/ConfirmarCriarVagaSemCliente.tsx").map((o) => o.tipo), ["leitura"]);
  assert.ok(lerFonte("src/components/ConfirmarCriarVagaSemCliente.tsx").includes("{...fundoSoLeitura(cancelar)}"));
  for (const a of ["src/components/ModalNovoCliente.tsx", "src/components/ModalVincularClienteSolicitacao.tsx"]) assert.deepEqual(todos.filter((o) => o.arq === a).map((o) => o.tipo), ["sem-fundo"], a);
  // a janela de baixo fica inert enquanto uma de cima está aberta (inalterado)
  assert.ok(lerFonte("src/components/ModalSolicitacoesVagas.tsx").includes("inert={cadastrandoCliente !== null"));
});

console.log(`\n${total} casos OK`);
