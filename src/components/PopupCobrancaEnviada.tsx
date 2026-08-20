"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CobrancaEnviada {
  id: string;
  tipo: "contratacao" | "cancelamento";
  clienteNome: string;
  candidatoNome: string | null;
  vagaTitulo: string;
  enviadoEm: string | null;
}

// Mesmo padrão estrutural/UX de PopupCobrancasRSPendentes.tsx, mas pra outro evento
// (cobrança aprovada/enviada, não pendência de revisão) e outro público — destinatários
// configuráveis em /painel/configuracoes/cobranca-rs-notificacao-enviada, independente de
// quem tem acesso pra revisar cobrança. A gate de "esse usuário deve ver isso" é decidida
// inteiramente pela API (ver /api/cobrancas-rs/enviadas-popup); este componente é montado
// sem prop nenhuma. Dedup por notificação individual (cobranca_rs_popup_enviada_ids_vistos),
// não "1x por dia" — uma cobrança nova sempre reabre o popup.
export default function PopupCobrancaEnviada() {
  const router = useRouter();
  const [enviadas, setEnviadas] = useState<CobrancaEnviada[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/cobrancas-rs/enviadas-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: CobrancaEnviada[] = body.data ?? [];
        if (lista.length > 0 && body.temNovas) {
          setEnviadas(lista);
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

  // Marca como vistas exatamente as cobranças que estavam sendo mostradas agora — se uma
  // nova aparecer depois (outra aprovação), o popup volta.
  async function marcarVisto() {
    const ids = enviadas.map((c) => c.id);
    setAberto(false);
    try {
      await fetch("/api/cobrancas-rs/enviadas-popup/marcar-visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  function abrirCobrancas() {
    marcarVisto();
    router.push("/painel/cobrancas-rs");
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">
              💰 Cobrança{enviadas.length > 1 ? "s" : ""} aguardando validação da diretoria
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">
              Cobranças revisadas, aguardando validação da diretoria antes do envio ao cliente
            </p>
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
          {enviadas.map((c) => (
            <button
              key={c.id}
              onClick={abrirCobrancas}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">💰</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{c.clienteNome}</p>
                <p className="text-xs text-gray-600">
                  {c.vagaTitulo} · {c.tipo === "cancelamento" ? "Cancelamento" : "Contratação"}
                </p>
                {c.candidatoNome && <p className="text-xs text-gray-500">{c.candidatoNome}</p>}
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
