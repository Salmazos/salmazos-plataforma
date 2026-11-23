"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ItemFerias {
  id: string;
  titulo: string;
  mensagem: string;
  funcionarioId: string | null;
}

// Popup dos avisos de férias a vencer (cron /api/cron/ferias-avisos). Mesmo padrão do popup de decisão do cliente: uma checagem ao carregar o painel (sem polling);
// quem vê, e se vê, é decidido inteiramente pela API (avisos do próprio usuário, canal popup ligado, ainda não vistos). Aparece uma vez por aviso por usuário.
export default function PopupFeriasVencimento() {
  const router = useRouter();
  const [itens, setItens] = useState<ItemFerias[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/ferias-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: ItemFerias[] = body.data ?? [];
        if (lista.length > 0 && body.temNovas) {
          setItens(lista);
          setAberto(true);
        }
      } catch {
        // silencioso: o popup não pode travar o carregamento do painel
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // Fecha e marca como vistos exatamente os avisos recebidos. Falha de rede é ignorada (o popup só volta no próximo carregamento). Não mexe no sino.
  async function dispensar(ids: string[]) {
    setAberto(false);
    try {
      await fetch("/api/ferias-popup/marcar-visto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    } catch {
      // se falhar, o popup volta a aparecer no próximo carregamento
    }
  }

  // Clique no cartão: abre a aba Férias já filtrada pelo funcionário e marca como visto SÓ o clicado (sem await, para não atrasar a navegação).
  function abrir(i: ItemFerias) {
    void dispensar([i.id]);
    router.push(i.funcionarioId ? `/painel/ferias?funcionario=${i.funcionarioId}` : "/painel/ferias");
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40" role="dialog" aria-label="Avisos de férias">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">🌴 Aviso{itens.length > 1 ? "s" : ""} de férias</h2>
            <p className="text-xs text-gray-300 mt-0.5">Prazos de férias perto de vencer</p>
          </div>
          <button onClick={() => dispensar(itens.map((i) => i.id))} className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {itens.map((i) => (
            <button key={i.id} onClick={() => abrir(i)} className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3">
              <span className="text-2xl leading-none">{i.titulo.includes("VENCIDAS") ? "🚨" : "⏰"}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{i.titulo}</p>
                <p className="text-xs text-gray-600 break-words">{i.mensagem}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button onClick={() => dispensar(itens.map((i) => i.id))} className="btn-primary w-full">
            Ok, entendi!
          </button>
        </div>
      </div>
    </div>
  );
}
