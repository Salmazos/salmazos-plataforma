"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LembreteItem {
  id: string;
  empresa_nome: string | null;
  empresa_visitada_id: string | null;
}

// Mesmo molde de PopupSupervisaoPendente.tsx: checa ao carregar o painel e marca "visto" 1x por dia.
// A API decide o acesso (só vendedor tem lembretes); falha de rede é silenciosa e não trava o painel.
export default function PopupLembretesComercial() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/comercial/lembretes-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: LembreteItem[] = body.data ?? [];
        // Empresas distintas, na ordem de vencimento (a API já ordena pelo mais antigo).
        const nomes = [...new Set(lista.map((l) => l.empresa_nome || "Empresa sem nome"))];
        if (nomes.length > 0 && !body.ja_visto) {
          setEmpresas(nomes);
          setAberto(true);
        }
      } catch {
        // silencioso — popup não deve travar o carregamento do painel
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function marcarVisto() {
    setAberto(false);
    try {
      await fetch("/api/comercial/lembretes-popup/marcar-visto", { method: "POST" });
    } catch {
      // se falhar, o popup volta na próxima navegação — sem problema
    }
  }

  function verNoMeuDia() {
    marcarVisto();
    router.push("/painel/comercial");
  }

  if (!aberto) return null;

  const mostradas = empresas.slice(0, 5);
  const restantes = empresas.length - mostradas.length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">🤝 Hora de retomar contato</h2>
            <p className="text-xs text-gray-300 mt-0.5">
              Você tem {empresas.length} empresa{empresas.length !== 1 ? "s" : ""} esperando seu retorno
            </p>
          </div>
          <button onClick={marcarVisto} className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors" aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-2 max-h-[50vh] overflow-y-auto">
          {mostradas.map((nome) => (
            <div key={nome} className="bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3 text-sm font-bold text-gray-900">
              {nome}
            </div>
          ))}
          {restantes > 0 && <p className="text-xs text-gray-500">e mais {restantes}</p>}
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <button onClick={marcarVisto} className="btn-outline flex-1">Depois</button>
          <button onClick={verNoMeuDia} className="btn-primary flex-1">Ver no Meu dia</button>
        </div>
      </div>
    </div>
  );
}
