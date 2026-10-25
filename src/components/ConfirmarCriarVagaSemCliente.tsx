"use client";

import { useEffect, useRef } from "react";

interface Props {
  onCadastrarPrimeiro: () => void;
  onCriarMesmoAssim: () => void;
  onCancelar: () => void;
}

// Confirmação (não bloqueia): a vaga criada de uma solicitação do link sem cliente vinculado nasce sem cobrança de R&S. O foco vai para a opção
// segura ("Cadastrar cliente primeiro"), Tab não sai do diálogo e Esc cancela; ao fechar, o foco volta para quem estava com ele.
export default function ConfirmarCriarVagaSemCliente({ onCadastrarPrimeiro, onCriarMesmoAssim, onCancelar }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    primeiro.current?.focus();
    return () => anterior?.focus?.();
  }, []);

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onCancelar(); return; }
    if (e.key !== "Tab") return;
    const focaveis = caixa.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!focaveis || focaveis.length === 0) return;
    const inicio = focaveis[0];
    const fim = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === inicio) { e.preventDefault(); fim.focus(); }
    else if (!e.shiftKey && document.activeElement === fim) { e.preventDefault(); inicio.focus(); }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
      onKeyDown={aoTeclar}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-vaga-sem-cliente"
        aria-describedby="texto-vaga-sem-cliente"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="titulo-vaga-sem-cliente" className="text-base font-bold text-gray-900">Solicitação sem cliente cadastrado</h2>
        <p id="texto-vaga-sem-cliente" className="mt-2 text-sm text-gray-700">
          Esta solicitação ainda não tem cliente cadastrado. Sem cliente, a cobrança de R&amp;S da vaga não é gerada. Criar a vaga mesmo assim?
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCriarMesmoAssim} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Criar vaga mesmo assim
          </button>
          <button ref={primeiro} type="button" onClick={onCadastrarPrimeiro} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800">
            Cadastrar cliente primeiro
          </button>
        </div>
      </div>
    </div>
  );
}
