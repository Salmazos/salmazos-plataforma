"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CobrancaVencida {
  id: string;
  tipo: "contratacao" | "cancelamento";
  clienteNome: string;
  candidatoNome: string | null;
  feeValor: number | null;
  dataVencimento: string;
  diasAtraso: number;
}

function formatarMoeda(v: number | null): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function labelAtraso(dias: number): string {
  if (dias <= 0) return "vence hoje";
  if (dias === 1) return "venceu ontem";
  return `venceu há ${dias} dias`;
}

// Mesmo padrão estrutural/UX de PopupCobrancaEnviada.tsx, mas com uma diferença de
// comportamento importante: o "visto" aqui é por DIA (ver /api/cobrancas-rs/vencidas-popup),
// não "1x pra sempre" — uma fatura que continua vencida amanhã reabre o popup de novo, mesmo
// que já tenha sido vista hoje. O deep-link ?abrir={id} em /painel/cobrancas-rs (Frente 2A)
// é reaproveitado direto — abre o modal já carregado com a cobrança clicada.
export default function PopupCobrancaVencida() {
  const router = useRouter();
  const [vencidas, setVencidas] = useState<CobrancaVencida[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/cobrancas-rs/vencidas-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: CobrancaVencida[] = body.data ?? [];
        if (lista.length > 0) {
          setVencidas(lista);
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

  // Marca como vistas HOJE exatamente as cobranças mostradas agora — reaparecem amanhã se
  // continuarem vencidas (data_referencia muda), diferente do popup de "enviada".
  async function marcarVisto() {
    const ids = vencidas.map((c) => c.id);
    setAberto(false);
    try {
      await fetch("/api/cobrancas-rs/vencidas-popup/marcar-visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  function abrirCobranca(id: string) {
    marcarVisto();
    router.push(`/painel/cobrancas-rs?abrir=${id}`);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-red-400/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-400">
              ⚠️ Fatura{vencidas.length > 1 ? "s" : ""} vencida{vencidas.length > 1 ? "s" : ""}
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">
              Cobranças enviadas ao cliente com vencimento no passado, ainda não pagas
            </p>
          </div>
          <button
            onClick={marcarVisto}
            className="text-red-400/70 hover:text-red-400 transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {vencidas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirCobranca(c.id)}
              className="w-full text-left flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">⚠️</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {c.clienteNome} — {labelAtraso(c.diasAtraso)}
                </p>
                <p className="text-xs text-gray-600">
                  {formatarMoeda(c.feeValor)} · {c.tipo === "cancelamento" ? "Cancelamento" : "Contratação"}
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
