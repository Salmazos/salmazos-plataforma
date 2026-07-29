"use client";

import { useEffect, useState } from "react";
import type { ContratoRow } from "./FuncionarioDetalheClient";

interface Props {
  isOpen: boolean;
  funcionarioId: string;
  onClose: () => void;
  onRegistrado: (novoContrato: ContratoRow) => void;
}

export default function ModalRegistrarContrato({ isOpen, funcionarioId, onClose, onRegistrado }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setArquivo(null);
    setObservacoes("");
    setErro("");
  }, [isOpen]);

  if (!isOpen) return null;

  const valido = Boolean(arquivo);

  const handleSalvar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro("");
    try {
      const urlRes = await fetch(`/api/funcionarios/${funcionarioId}/contrato-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome_arquivo: arquivo.name }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlJson.error || "Erro ao gerar URL de upload.");

      const uploadRes = await fetch(urlJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": arquivo.type || "application/octet-stream" },
        body: arquivo,
      });
      if (!uploadRes.ok) throw new Error("Erro ao enviar o arquivo.");

      const res = await fetch(`/api/funcionarios/${funcionarioId}/contratos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivo_path: urlJson.path,
          nome_arquivo_original: arquivo.name,
          observacoes: observacoes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao registrar contrato."); return; }

      onRegistrado({
        id: json.data.id,
        arquivo_path: json.data.arquivo_path,
        nome_arquivo_original: json.data.nome_arquivo_original,
        observacoes: json.data.observacoes,
        criado_em: json.data.criado_em,
        criado_por_nome: "Você",
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Registrar novo contrato</h2>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Arquivo *</label>
          <input
            type="file" accept="application/pdf,image/*"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="input-field"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações (opcional)</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex: Aditivo de prorrogação, renovação 2026..."
            className="input-field"
            rows={3}
          />
        </div>

        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleSalvar} disabled={!valido || enviando} className="btn-primary flex-1 disabled:opacity-50">
            {enviando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
