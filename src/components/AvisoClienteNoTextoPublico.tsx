"use client";

import { mensagemAntesDeSalvar, type ClienteNoTexto } from "@/lib/clienteNoTextoPublico";

interface Props {
  achados: ClienteNoTexto[];
  salvando: boolean;
  onRevisar: () => void;
  onSalvarMesmoAssim: () => void;
}

// Confirmação ANTES de salvar uma vaga confidencial cujo texto público cita o cliente. Só avisa: "Salvar mesmo assim" sempre salva. Mesmo visual da
// confirmação de troca de modalidade do ModalEditarVaga (caixa âmbar, z-[60]).
export default function AvisoClienteNoTextoPublico({ achados, salvando, onRevisar, onSalvarMesmoAssim }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-label="Vaga confidencial cita o cliente">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{"⚠️"}</span>
            <h3 className="text-lg font-bold text-gray-900">O texto da vaga cita o cliente</h3>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">{mensagemAntesDeSalvar(achados)}</p>
          </div>
          <p className="text-sm text-gray-600">Você pode revisar o texto agora ou salvar assim mesmo.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onRevisar} disabled={salvando} className="btn-outline">
              Revisar
            </button>
            <button type="button" onClick={onSalvarMesmoAssim} disabled={salvando} className="btn-primary disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar mesmo assim"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
