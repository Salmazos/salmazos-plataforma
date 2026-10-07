"use client";

import Link from "next/link";
import ContratoMotPainel from "./ContratoMotPainel";

interface Props {
  funcionarioId: string | null;
  nome: string;
  onClose: () => void;
  onAlterado: () => void;
  // Ir pra ficha também dispensa o popup do dia (mesmo efeito do clique antigo no aviso).
  onVerFicha: () => void;
}

// Modal aberto ao clicar num aviso do popup "Vencimentos de contrato MOT": em vez de só navegar pra ficha,
// oferece Prorrogar / Registrar afastamento / Encerrar contrato ali mesmo (ContratoMotPainel).
export default function ModalContratoMot({ funcionarioId, nome, onClose, onAlterado, onVerFicha }: Props) {
  if (!funcionarioId) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Contrato MOT</h2>
            <p className="text-sm text-gray-500">{nome}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Fechar">✕</button>
        </div>

        <ContratoMotPainel funcionarioId={funcionarioId} onAlterado={onAlterado} />

        <div className="mt-5 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
          <Link href={`/painel/funcionarios/${funcionarioId}`} onClick={onVerFicha} className="text-sm font-semibold" style={{ color: "#2563EB" }}>
            Ver ficha completa →
          </Link>
        </div>
      </div>
    </div>
  );
}
