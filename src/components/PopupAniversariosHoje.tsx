"use client";

import { useEffect, useState } from "react";

interface AniversarianteHoje {
  id: string;
  nome_contato: string;
  cargo: string | null;
  empresa_nome: string | null;
  clientes: { id: string; nome: string } | null;
}

export default function PopupAniversariosHoje() {
  const [aniversariantes, setAniversariantes] = useState<AniversarianteHoje[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/aniversariantes/hoje");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: AniversarianteHoje[] = body.data ?? [];
        if (lista.length > 0 && !body.ja_visto) {
          setAniversariantes(lista);
          setAberto(true);
        }
      } catch {
        // silencioso — pop-up não deve travar o carregamento do painel
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function marcarVisto() {
    setAberto(false);
    try {
      await fetch("/api/aniversariantes/marcar-visto", { method: "POST" });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">
              🎂 Aniversariante{aniversariantes.length > 1 ? "s" : ""} de hoje!
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">Não esqueça de parabenizar 🎉</p>
          </div>
          <button
            onClick={marcarVisto}
            className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {aniversariantes.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">🎂</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{a.nome_contato}</p>
                <p className="text-xs text-gray-600">{a.clientes?.nome ?? a.empresa_nome ?? "—"}</p>
                {a.cargo && <p className="text-xs text-gray-500">{a.cargo}</p>}
              </div>
            </div>
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
