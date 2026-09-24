"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SolicitacaoPendente {
  id: string;
  clienteNome: string;
  cargo: string;
  numPosicoes: number;
  createdAt: string;
  confidencial: boolean;
}

// Mesmo padrão estrutural de PopupCobrancasRSPendentes.tsx (checagem ao carregar o painel +
// "marcar visto" por pendência individual, não "1x por dia" — ver
// /api/solicitacoes-vagas/pendentes-popup). Público é qualquer analista ativo (mesmo
// escopo do e-mail via notifyAllAnalysts), mais amplo que o sino (só diretoria/superuser)
// — a gate de acesso é decidida inteiramente pela API; este componente é montado sem prop
// de role.
export default function PopupSolicitacaoVagaPendente() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<SolicitacaoPendente[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/solicitacoes-vagas/pendentes-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: SolicitacaoPendente[] = body.data ?? [];
        if (lista.length > 0 && body.temNovas) {
          setPendentes(lista);
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

  // Marca como vistas exatamente as pendências que estavam sendo mostradas agora — se uma
  // nova chegar depois (outra solicitação no mesmo dia, por exemplo), o popup volta.
  async function marcarVisto() {
    const ids = pendentes.map((p: SolicitacaoPendente) => p.id);
    setAberto(false);
    try {
      await fetch("/api/solicitacoes-vagas/pendentes-popup/marcar-visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  // Deep-link direto pra solicitação clicada (mesma convenção do clique no sino — ver
  // NotificacoesProvider.tsx), mas marca TODAS as pendências mostradas como vistas, não só
  // a clicada — o popup inteiro está sendo fechado.
  function abrirSolicitacao(id: string) {
    marcarVisto();
    router.push(`/painel/vagas?solicitacao=${id}`);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">
              🔔 Nova{pendentes.length > 1 ? "s" : ""} solicitaç{pendentes.length > 1 ? "ões" : "ão"} de vaga
            </h2>
            <p className="text-xs text-gray-300 mt-0.5">Confira o que precisa de atenção</p>
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
          {pendentes.map((s: SolicitacaoPendente) => (
            <button
              key={s.id}
              onClick={() => abrirSolicitacao(s.id)}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">🔔</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-gray-900">{s.clienteNome}</p>
                  {s.confidencial && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5" }}>
                      🔴 CONFIDENCIAL
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600">
                  {s.cargo} · {s.numPosicoes} posiç{s.numPosicoes !== 1 ? "ões" : "ão"}
                </p>
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
