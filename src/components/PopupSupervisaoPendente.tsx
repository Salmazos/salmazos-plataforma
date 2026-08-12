"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ClientePendente {
  clienteId: string;
  clienteNome: string;
  diasSemSupervisao: number | null;
}

// Mesmo padrão estrutural de PopupCobrancasRSPendentes.tsx (checagem ao carregar o painel +
// "marcar visto" upsert por dia). A API por trás consulta o estado atual de
// clientes_meta_supervisao (Atrasado/Nunca supervisionado), já escopado pela mesma regra de
// visibilidade do Painel de Supervisão — ver /api/supervisao/pendentes-popup. A gate de
// acesso é decidida inteiramente pela API; este componente é montado sem prop de role.
export default function PopupSupervisaoPendente() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<ClientePendente[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/supervisao/pendentes-popup");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelado) return;
        const lista: ClientePendente[] = body.data ?? [];
        if (lista.length > 0 && !body.ja_visto) {
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

  async function marcarVisto() {
    setAberto(false);
    try {
      await fetch("/api/supervisao/pendentes-popup/marcar-visto", { method: "POST" });
    } catch {
      // se falhar, o pop-up volta a aparecer na próxima navegação — sem problema
    }
  }

  function abrirSupervisao() {
    marcarVisto();
    router.push("/painel/supervisao");
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[#FFD700]/40">
        <div className="bg-black px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#FFD700]">
              🛡️ {pendentes.length > 1 ? "Supervisões" : "Supervisão"} pendente{pendentes.length > 1 ? "s" : ""}
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
          {pendentes.map((c) => (
            <button
              key={c.clienteId}
              onClick={abrirSupervisao}
              className="w-full text-left flex items-start gap-3 bg-[#FFFBEB] border border-[#FFD700]/30 rounded-xl px-4 py-3"
            >
              <span className="text-2xl leading-none">🔴</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{c.clienteNome}</p>
                <p className="text-xs text-gray-600">
                  {c.diasSemSupervisao == null ? "Sem registro" : `${c.diasSemSupervisao} dia${c.diasSemSupervisao !== 1 ? "s" : ""} sem supervisão`}
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
