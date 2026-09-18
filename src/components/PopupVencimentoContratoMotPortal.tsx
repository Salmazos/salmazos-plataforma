"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AvisoVencimentoMot {
  id: string;
  titulo: string;
  mensagem: string;
}

// Equivalente do portal para PopupVencimentoContratoMot.tsx (painel) — mesmo mecanismo de
// checagem ao carregar + "marcar visto" por dia, mas sem link pra página de detalhe por
// funcionário (o portal não tem uma): o clique em qualquer aviso leva pra
// /portal/vencimento-contrato, a lista completa.
export default function PopupVencimentoContratoMotPortal() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<AvisoVencimentoMot[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/funcionarios/vencimento-contrato/popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: AvisoVencimentoMot[] = body.data ?? [];
        if (lista.length > 0 && !body.ja_visto) {
          setAvisos(lista);
          setAberto(true);
        }
      } catch {
        // silencioso — pop-up não deve travar o carregamento do portal
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function marcarVisto() {
    setAberto(false);
    try {
      await fetch("/api/portal/funcionarios/vencimento-contrato/popup/marcar-visto", { method: "POST" });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  function abrirLista() {
    marcarVisto();
    router.push("/portal/vencimento-contrato");
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-red-400/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-400">
              ⏳ Vencimento{avisos.length > 1 ? "s" : ""} de contrato
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">Prazo de 180/270 dias se aproximando ou já excedido</p>
          </div>
          <button onClick={marcarVisto} className="text-red-400/70 hover:text-red-400 transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {avisos.map((a) => (
            <button
              key={a.id}
              onClick={abrirLista}
              className="w-full text-left flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">⏳</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{a.titulo}</p>
                <p className="text-xs text-gray-600">{a.mensagem}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button onClick={marcarVisto} className="btn-primary w-full">
            Ok, entendi!
          </button>
        </div>
      </div>
    </div>
  );
}
