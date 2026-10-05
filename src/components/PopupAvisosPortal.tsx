"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAvisosPortal } from "@/components/AvisosPortalProvider";
import { pendentesDoPopup, type AvisoPortal } from "@/lib/avisoClienteRegras";

// Popup de avisos do portal. Usa a MESMA resposta do sino (sem consulta extra): abre uma vez, quando a
// primeira carga da página traz ao menos um aviso do canal popup ainda não visto por este usuário, e lista
// todos os não vistos. Clicar no card marca só aquele (visto + lido) e leva ao link; "Ok" e o X marcam
// todos os listados como vistos. Cada aviso aparece uma vez por pessoa.
export default function PopupAvisosPortal() {
  const router = useRouter();
  const { primeiraCarga, marcar } = useAvisosPortal();
  const [pendentes, setPendentes] = useState<AvisoPortal[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!primeiraCarga) return;
    const lista = pendentesDoPopup(primeiraCarga);
    if (lista.length > 0) {
      setPendentes(lista);
      setAberto(true);
    }
  }, [primeiraCarga]);

  function fechar() {
    setAberto(false);
    void marcar({ ids: pendentes.map((p: AvisoPortal) => p.id) }, "popup");
  }

  function abrirAviso(a: AvisoPortal) {
    setAberto(false);
    void marcar({ ids: [a.id] }, "ambos");
    router.push(a.link);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Avisos" className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">🔔 Aviso{pendentes.length > 1 ? "s" : ""} da Salmazos</h2>
            <p className="text-xs text-gray-300 mt-0.5">Novidades sobre o seu atendimento</p>
          </div>
          <button onClick={fechar} className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {pendentes.map((a: AvisoPortal) => (
            <button
              key={a.id}
              onClick={() => abrirAviso(a)}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none" aria-hidden="true">🔔</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{a.titulo}</p>
                <p className="text-xs text-gray-600">{a.mensagem}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button onClick={fechar} className="btn-primary w-full">
            Ok, entendi!
          </button>
        </div>
      </div>
    </div>
  );
}
