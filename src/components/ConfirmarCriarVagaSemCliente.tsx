"use client";

import { useEffect, useRef } from "react";
import { devolverFocoAoFechar, type MotivoDeFechamento } from "@/lib/clienteDaSolicitacao";
import { devolverFocoSeExistir, prenderTabNoModal } from "@/components/focoDosModais";

interface Props {
  // Botão que abriu o diálogo (o "Criar Vaga" do cartão). Sem ele, vale quem tinha o foco ao abrir.
  origem?: HTMLElement | null;
  // Recebe a origem do foco: quem abre o cadastro a repassa para o cadastro devolver o foco a ela quando fechar.
  onCadastrarPrimeiro: (origem: HTMLElement | null) => void;
  onCriarMesmoAssim: () => void;
  onCancelar: () => void;
}

// Confirmação (não bloqueia): a vaga criada de uma solicitação do link sem cliente vinculado nasce sem cobrança de R&S. O foco vai para a opção
// segura ("Cadastrar cliente primeiro") e Tab não sai do diálogo. Ao fechar, o foco só volta ao botão de origem quando o analista CANCELA (Esc ou
// clique fora) ou escolhe "Criar vaga mesmo assim"; com "Cadastrar cliente primeiro" outro modal vai abrir e o foco é dele. A decisão vem do
// motivo registrado no clique (ref), não da ordem dos setState de quem chamou.
export default function ConfirmarCriarVagaSemCliente({ origem, onCadastrarPrimeiro, onCriarMesmoAssim, onCancelar }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLButtonElement>(null);
  const motivo = useRef<MotivoDeFechamento>("desconhecido");
  const botaoDeOrigem = useRef<HTMLElement | null>(origem ?? (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));

  useEffect(() => {
    primeiro.current?.focus();
    return () => {
      const alvo = botaoDeOrigem.current;
      if (devolverFocoAoFechar(motivo.current, !!alvo && alvo.isConnected)) devolverFocoSeExistir(alvo);
    };
  }, []);

  const cancelar = () => { motivo.current = "cancelar"; onCancelar(); };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); cancelar(); return; }
    prenderTabNoModal(e, caixa.current);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) cancelar(); }}
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
          <button
            type="button"
            onClick={() => { motivo.current = "confirmar"; onCriarMesmoAssim(); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Criar vaga mesmo assim
          </button>
          <button
            ref={primeiro}
            type="button"
            onClick={() => { motivo.current = "abrir_outro_modal"; onCadastrarPrimeiro(botaoDeOrigem.current); }}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800"
          >
            Cadastrar cliente primeiro
          </button>
        </div>
      </div>
    </div>
  );
}
