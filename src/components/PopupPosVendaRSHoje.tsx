"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AvisoPosVendaHoje {
  id: string;
  titulo: string;
  mensagem: string;
  candidato_id: string | null;
}

// Mesmo mecanismo de PopupRescisoesHoje.tsx (checagem ao carregar o painel + "marcar
// visto" upsert por dia) — conteúdo é o aviso de pós-venda R&S (7 dias após o início do
// candidato contratado), gerado pelo cron api/cron/pos-venda-rs.
export default function PopupPosVendaRSHoje() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<AvisoPosVendaHoje[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/pos-venda-rs/avisos-hoje");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: AvisoPosVendaHoje[] = body.data ?? [];
        if (lista.length > 0 && !body.ja_visto) {
          setAvisos(lista);
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
      await fetch("/api/pos-venda-rs/avisos-hoje/marcar-visto", { method: "POST" });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  function abrirCandidato(candidatoId: string | null) {
    marcarVisto();
    if (candidatoId) router.push(`/painel/candidato/${candidatoId}`);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">
              🤝 Hora do pós-venda
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">7 dias de contratação — faça o contato com o cliente</p>
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
          {avisos.map((a) => (
            <button
              key={a.id}
              onClick={() => abrirCandidato(a.candidato_id)}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">🤝</span>
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
