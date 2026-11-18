"use client";

import { useEffect, useRef } from "react";
import { devolverFocoSeExistir, prenderTabNoModal } from "@/components/focoDosModais";
import { ROTULO_CONTINUAR_EDITANDO, ROTULO_SAIR_SEM_SALVAR, TEXTO_DESCARTAR } from "@/lib/janelaComFormulario";

interface Props {
  aoContinuar: () => void;
  aoSair: () => void;
  // Quem tinha o foco ANTES da confirmação abrir (o hook captura; a janela de baixo fica inert e o navegador tira o foco dela ao abrir esta).
  origemDoFoco?: HTMLElement | null;
}

// Confirmação "Você tem dados não salvos..." da janela com formulário (ver src/lib/janelaComFormulario.ts). Quem a mostra é o hook, num portal no body: z-index
// acima das janelas (até 100) e abaixo dos avisos (9999), e a janela de baixo fica inert. Foco inicial em "Continuar editando" (o padrão seguro); Esc aqui
// também é "Continuar editando", e o foco volta ao que tinha foco antes.
export default function ConfirmarDescartar({ aoContinuar, aoSair, origemDoFoco }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const continuar = useRef<HTMLButtonElement>(null);
  const origem = useRef<HTMLElement | null>(origemDoFoco ?? null);
  const devolverFoco = useRef(true);

  useEffect(() => {
    continuar.current?.focus();
    return () => {
      if (devolverFoco.current) devolverFocoSeExistir(origem.current);
    };
  }, []);

  const sair = () => {
    devolverFoco.current = false;
    aoSair();
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          e.preventDefault();
          aoContinuar();
          return;
        }
        prenderTabNoModal(e, caixa.current);
      }}
    >
      <div
        ref={caixa}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-descartar"
        aria-describedby="texto-descartar"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">{"⚠️"}</span>
            <h3 id="titulo-descartar" className="text-lg font-bold text-gray-900">Dados não salvos</h3>
          </div>
          <p id="texto-descartar" className="text-sm text-gray-700">{TEXTO_DESCARTAR}</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" ref={continuar} onClick={aoContinuar} className="btn-primary">
              {ROTULO_CONTINUAR_EDITANDO}
            </button>
            <button type="button" onClick={sair} className="btn-outline" style={{ color: "#B91C1C", borderColor: "#FCA5A5" }}>
              {ROTULO_SAIR_SEM_SALVAR}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
