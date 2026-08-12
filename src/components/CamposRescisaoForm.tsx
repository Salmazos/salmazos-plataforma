"use client";

import CampoMoeda from "@/components/ui/CampoMoeda";

export interface ValoresRescisao {
  dataDesligamento: string;
  modalidade: string;
  entrevistaDesligamento: boolean;
  funcionarioAssinou: boolean;
  valorRescisao: string;
  dataPagamentoRescisao: string;
  valorGuia: string;
  dataPagamentoGuia: string;
  pensao: string;
  farmacia: string;
  faturado: boolean;
}

export const VALORES_RESCISAO_VAZIOS: ValoresRescisao = {
  dataDesligamento: "",
  modalidade: "",
  entrevistaDesligamento: false,
  funcionarioAssinou: false,
  valorRescisao: "",
  dataPagamentoRescisao: "",
  valorGuia: "",
  dataPagamentoGuia: "",
  pensao: "",
  farmacia: "",
  faturado: false,
};

export const MODALIDADE_OPCOES = [
  { value: "pedido_demissao", label: "Pedido de demissão" },
  { value: "desligamento_pela_empresa", label: "Desligamento pela empresa" },
  { value: "efetivado", label: "Efetivado" },
];

export function valoresRescisaoValidos(v: ValoresRescisao): boolean {
  return Boolean(v.dataDesligamento && v.modalidade && Number(v.valorRescisao) > 0 && v.dataPagamentoRescisao);
}

interface Props {
  valores: ValoresRescisao;
  onAlterar: <K extends keyof ValoresRescisao>(campo: K, valor: ValoresRescisao[K]) => void;
  // ASO: no lançamento não há arquivo atual (asoAtualPath ausente); na edição, mostra o
  // que já está anexado com opção de ver e de substituir.
  asoFile: File | null;
  onAsoFileChange: (file: File | null) => void;
  asoAtualPath?: string | null;
  onVerAsoAtual?: () => void;
}

export default function CamposRescisaoForm({
  valores,
  onAlterar,
  asoFile,
  onAsoFileChange,
  asoAtualPath,
  onVerAsoAtual,
}: Props) {
  return (
    <>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de desligamento *</label>
        <input
          type="date"
          value={valores.dataDesligamento}
          onChange={(e) => onAlterar("dataDesligamento", e.target.value)}
          className="input-field"
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Modalidade *</label>
        <select value={valores.modalidade} onChange={(e) => onAlterar("modalidade", e.target.value)} className="input-field">
          <option value="">Selecione</option>
          {MODALIDADE_OPCOES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={valores.entrevistaDesligamento}
            onChange={(e) => onAlterar("entrevistaDesligamento", e.target.checked)}
          />
          Entrevista de desligamento feita
        </label>
      </div>
      <div className="mb-3 flex gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={valores.funcionarioAssinou}
            onChange={(e) => onAlterar("funcionarioAssinou", e.target.checked)}
          />
          Funcionário assinou
        </label>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor da rescisão *</label>
        <CampoMoeda
          value={valores.valorRescisao}
          onChange={(v) => onAlterar("valorRescisao", v > 0 ? String(v) : "")}
          placeholder="Ex: 1.500,00"
          className="input-field"
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de pagamento da rescisão *</label>
        <input
          type="date"
          value={valores.dataPagamentoRescisao}
          onChange={(e) => onAlterar("dataPagamentoRescisao", e.target.value)}
          className="input-field"
        />
      </div>

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor da guia</label>
          <CampoMoeda
            value={valores.valorGuia}
            onChange={(v) => onAlterar("valorGuia", v > 0 ? String(v) : "")}
            placeholder="Opcional"
            className="input-field"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de pagamento da guia</label>
          <input
            type="date"
            value={valores.dataPagamentoGuia}
            onChange={(e) => onAlterar("dataPagamentoGuia", e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pensão</label>
          <CampoMoeda
            value={valores.pensao}
            onChange={(v) => onAlterar("pensao", v > 0 ? String(v) : "")}
            placeholder="Opcional"
            className="input-field"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Farmácia</label>
          <CampoMoeda
            value={valores.farmacia}
            onChange={(v) => onAlterar("farmacia", v > 0 ? String(v) : "")}
            placeholder="Opcional"
            className="input-field"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={valores.faturado} onChange={(e) => onAlterar("faturado", e.target.checked)} />
          Faturado
        </label>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ASO {asoAtualPath ? "" : "(opcional)"}</label>
        {asoAtualPath && !asoFile && (
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 mb-2 text-sm">
            <span className="text-gray-600">Arquivo já anexado</span>
            {onVerAsoAtual && (
              <button type="button" onClick={onVerAsoAtual} className="text-xs font-semibold text-blue-600 hover:underline">
                Ver ASO atual
              </button>
            )}
          </div>
        )}
        {asoFile && (
          <p className="text-xs text-gray-600 mb-2">Novo arquivo selecionado: {asoFile.name}</p>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => onAsoFileChange(e.target.files?.[0] ?? null)}
          className="input-field"
        />
        <p className="text-xs text-gray-400 mt-1">
          {asoAtualPath
            ? "Selecionar um novo arquivo substitui o atual (o antigo é removido do Storage)."
            : "PDF ou imagem. Nunca bloqueia o lançamento da rescisão."}
        </p>
      </div>
    </>
  );
}
