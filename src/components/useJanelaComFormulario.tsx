"use client";

import { createElement, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import ConfirmarDescartar from "@/components/ConfirmarDescartar";
import { criarControleDaJanela, empilharJanela, janelaDoTopo } from "@/lib/janelaComFormulario";

export interface OpcoesDoHook {
  // Janela que fica montada o tempo todo e abre por prop (isOpen): passe-a aqui; o "sujo" zera ao abrir e ao fechar. Sem isto, vale "sempre aberta"
  // (janela montada só enquanto está aberta).
  aberta?: boolean;
  onClose: () => void;
  // Gravando/enviando: fechar() ignora X, Cancelar e Esc.
  ocupado?: boolean;
  // false = o Esc não fecha esta janela (X e Cancelar seguem perguntando).
  escFecha?: boolean;
  // PREPARADO, DESLIGADO (nenhuma janela usa): avisa ao recarregar a página ou fechar a aba enquanto a janela estiver suja.
  avisarAoSairDaPagina?: boolean;
}

// Regra "janela com formulário não perde o que o usuário digitou sem avisar" (lógica em src/lib/janelaComFormulario.ts). Uso:
//   const j = useJanelaComFormulario({ aberta: isOpen, onClose, ocupado: salvando });
//   <div className="fixed inset-0 ..." {...fundoDeFormulario()} {...j.propsDoContainer}>   // campos mexidos marcam "sujo"; Esc fecha a janela do topo
//     <button onClick={j.fechar}>X</button> <button onClick={j.fechar}>Cancelar</button> // perguntam se houver dado digitado
//     ... salvou: j.limpar(); onClose();                                                   // sucesso fecha direto
//     {j.dialogo}
// Chips, listas "Adicionar" e botões que preenchem campos não emitem input/change: chame j.marcarSujo() neles.
// Campo de busca/filtro: data-sujo-ignorar no campo (ou num ancestral).
export function useJanelaComFormulario({ aberta = true, onClose, ocupado = false, escFecha = true, avisarAoSairDaPagina = false }: OpcoesDoHook) {
  const ultimo = useRef({ onClose, ocupado, escFecha });
  ultimo.current = { onClose, ocupado, escFecha };
  const controle = useMemo(
    () =>
      criarControleDaJanela(() => ({
        onClose: () => ultimo.current.onClose(),
        ocupado: () => ultimo.current.ocupado,
        escFecha: () => ultimo.current.escFecha,
      })),
    []
  );
  const [, atualizar] = useState(0);
  useEffect(() => controle.assinar(() => atualizar((v) => v + 1)), [controle]);
  const container = useRef<HTMLElement | null>(null);
  const { sujo, confirmando } = controle.estado();
  // Foco antes da confirmação abrir (X, Cancelar ou o campo em que o Esc foi apertado): é para onde o foco volta em "Continuar editando".
  const origemDoFoco = useRef<HTMLElement | null>(null);
  const guardarOrigemDoFoco = () => {
    if (!controle.estado().confirmando) origemDoFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  // Abriu: zera o "sujo", entra na pilha das janelas abertas e passa a ouvir o Esc (só a janela do topo age, mesmo com o foco no body).
  useEffect(() => {
    if (!aberta) {
      controle.limpar();
      return;
    }
    controle.limpar();
    const sairDaPilha = empilharJanela(controle);
    const aoTecla = (e: KeyboardEvent) => {
      if (janelaDoTopo() !== controle || e.isComposing) return;
      const alvo = e.target instanceof Element ? e.target : null;
      const dentro = !!(container.current && alvo && container.current.contains(alvo));
      // Foco fora da janela (no body ou no botão que a abriu, escondido atrás do fundo) conta: a janela do topo age. Só não age se o foco está em OUTRA
      // janela/diálogo por cima (a própria confirmação "dados não salvos", um aviso).
      if (!dentro && alvo?.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return;
      guardarOrigemDoFoco();
      if (controle.aoTeclar({ key: e.key, alvo, defaultPrevented: e.defaultPrevented })) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", aoTecla);
    return () => {
      document.removeEventListener("keydown", aoTecla);
      sairDaPilha();
    };
  }, [aberta, controle]);

  // Desligado por padrão e sem uso hoje.
  useEffect(() => {
    if (!avisarAoSairDaPagina || !sujo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [avisarAoSairDaPagina, sujo]);

  const evento = (e: SyntheticEvent) => ({ confiavel: e.nativeEvent.isTrusted === true, alvo: e.target instanceof Element ? e.target : null });
  const aoMudar = (e: SyntheticEvent) => controle.aoMudarCampo(evento(e));
  const aoClicar = (e: SyntheticEvent) => controle.aoClicar(evento(e));

  return {
    sujo,
    confirmando,
    // Espalhar no elemento do fundo da janela (junto com fundoDeFormulario()). `inert` só enquanto a confirmação está aberta.
    propsDoContainer: {
      ref: (el: HTMLElement | null) => {
        container.current = el;
      },
      onChangeCapture: aoMudar,
      onInputCapture: aoMudar,
      onClickCapture: aoClicar,
      inert: confirmando || undefined,
    },
    fechar: () => {
      guardarOrigemDoFoco();
      controle.fechar();
    },
    marcarSujo: () => controle.marcarSujo(),
    limpar: () => controle.limpar(),
    dialogo:
      confirmando && typeof document !== "undefined"
        ? createPortal(
            createElement(ConfirmarDescartar, { aoContinuar: () => controle.continuarEditando(), aoSair: () => controle.sairSemSalvar(), origemDoFoco: origemDoFoco.current }),
            document.body
          )
        : null,
  };
}
