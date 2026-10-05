"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAvisosPortal } from "@/components/AvisosPortalProvider";
import { haQuantoTempo, naoLidosDoSino, type AvisoPortal } from "@/lib/avisoClienteRegras";

const MAX_ITENS_MENU = 20;

// Sino do portal do cliente. Mostra os avisos do canal "sino" (as últimas 20), o contador de não lidos e,
// ao abrir o menu, busca a lista de novo UMA vez (ação do usuário; não há polling nem Realtime).
export default function PortalSino() {
  const router = useRouter();
  const { avisos, recarregar, marcar } = useAvisosPortal();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  const doSino = avisos.filter((a: AvisoPortal) => a.canal_sino);
  const naoLidos = naoLidosDoSino(avisos).length;

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function alternar() {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (vaiAbrir) void recarregar();
  }

  function abrirAviso(a: AvisoPortal) {
    // Lido e, se ainda estava pendente no popup, visto também (não reaparece depois).
    void marcar({ ids: [a.id] }, "ambos");
    setAberto(false);
    router.push(a.link);
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-label={naoLidos > 0 ? `Avisos, ${naoLidos} não lido${naoLidos > 1 ? "s" : ""}` : "Avisos"}
        aria-expanded={aberto}
        aria-haspopup="true"
        className="relative inline-flex items-center justify-center rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        style={{ width: 40, height: 40 }}
      >
        <Bell size={18} aria-hidden="true" />
        {naoLidos > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#DC2626", color: "#fff", minWidth: 18, height: 18, padding: "0 4px" }}
          >
            {naoLidos > 9 ? "9+" : naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden"
          style={{ width: 340, maxWidth: "calc(100vw - 32px)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">Avisos</p>
            {naoLidos > 0 && (
              <button type="button" className="text-xs underline text-gray-600" onClick={() => void marcar({ ids: naoLidosDoSino(avisos).map((a: AvisoPortal) => a.id) }, "ambos")}>
                Marcar todos como lidos
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {doSino.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">Nenhum aviso por enquanto.</p>
            ) : (
              doSino.slice(0, MAX_ITENS_MENU).map((a: AvisoPortal) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => abrirAviso(a)}
                  className="w-full text-left flex items-start gap-2.5 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  style={{ backgroundColor: a.lida ? undefined : "#FFFBEB" }}
                >
                  <span
                    aria-label={a.lida ? "Lido" : "Não lido"}
                    className="mt-1.5 shrink-0 rounded-full"
                    style={{ width: 8, height: 8, backgroundColor: a.lida ? "transparent" : "#2563EB", border: a.lida ? "1px solid #D1D5DB" : "none" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{a.titulo}</span>
                    <span className="block text-xs text-gray-600 truncate">{a.mensagem}</span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">{haQuantoTempo(a.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
