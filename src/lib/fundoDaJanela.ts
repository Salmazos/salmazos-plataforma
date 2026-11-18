// O que o clique no FUNDO escuro de uma janela (modal) faz. Regra central do projeto: quem preenche um formulário não pode perder o que digitou por um
// clique fora da janela, nem por arrastar o mouse (selecionar texto) e soltar no fundo. Duas funções, uma para cada tipo de janela:
//
//   fundoDeFormulario()     janela COM formulário (input, textarea, select, upload, passos) ou que ainda não se sabe: o fundo NÃO faz nada.
//                           A janela só fecha pelo X, por Cancelar/Fechar ou pelo próprio fluxo (salvar). Na dúvida (janela que mistura
//                           leitura e formulário, ou um "Modal" genérico cujo conteúdo vem de fora), use esta.
//   fundoSoLeitura(fechar)  janela SÓ DE LEITURA (aviso, detalhe, confirmação sem campo, menu): o fundo fecha, mas só se o botão do mouse (ou o
//                           toque) DESCEU e SUBIU no próprio fundo. Arrastar de dentro da caixa para fora, ou de fora para dentro, não fecha.
//
// Uso: no elemento do fundo, no lugar do antigo onClick que fechava:
//   <div className="fixed inset-0 ..." {...fundoDeFormulario()}>
//   <div className="fixed inset-0 ..." {...fundoSoLeitura(onClose)}>
//
// scripts/verificar-fundo-das-janelas.mts varre o código e exige essa regra em todo fundo de janela; janela nova quebra o teste e pede revisão.

type EventoDoFundo = { target: EventTarget; currentTarget: EventTarget };

// Onde o gesto começou e terminou, por elemento (sem estado de React: funciona em qualquer componente e sobrevive a re-renderizações).
const desceuNoFundo = new WeakSet<EventTarget>();
const subiuNoFundo = new WeakSet<EventTarget>();

function aoDescer(e: EventoDoFundo) {
  subiuNoFundo.delete(e.currentTarget);
  if (e.target === e.currentTarget) desceuNoFundo.add(e.currentTarget);
  else desceuNoFundo.delete(e.currentTarget);
}

function aoSubir(e: EventoDoFundo) {
  if (e.target === e.currentTarget && desceuNoFundo.has(e.currentTarget)) subiuNoFundo.add(e.currentTarget);
  else subiuNoFundo.delete(e.currentTarget);
}

// Janela com formulário: o fundo não responde. O atributo só marca o tipo (leitura por testes e por quem inspeciona a página).
export function fundoDeFormulario() {
  return { "data-fundo": "formulario" } as const;
}

// Janela só de leitura: fecha quando o gesto inteiro (descer e subir) foi no fundo. O click só confirma o gesto; mouse e toque (pointer) marcam
// o início e o fim, e fechar no click evita o "clique fantasma" no que está atrás da janela em telas de toque.
export function fundoSoLeitura(fechar: () => void) {
  return {
    "data-fundo": "leitura",
    onMouseDown: aoDescer,
    onPointerDown: aoDescer,
    onMouseUp: aoSubir,
    onPointerUp: aoSubir,
    onClick: (e: EventoDoFundo) => {
      const gestoNoFundo = e.target === e.currentTarget && desceuNoFundo.has(e.currentTarget) && subiuNoFundo.has(e.currentTarget);
      desceuNoFundo.delete(e.currentTarget);
      subiuNoFundo.delete(e.currentTarget);
      if (gestoNoFundo) fechar();
    },
  } as const;
}
