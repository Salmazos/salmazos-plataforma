"use client";

import { useEffect, useState } from "react";
import type { AsoRow } from "./FuncionarioDetalheClient";

interface Props {
  isOpen: boolean;
  funcionarioId: string;
  onClose: () => void;
  onRegistrado: (novoAso: AsoRow) => void;
}

export default function ModalRegistrarAso({ isOpen, funcionarioId, onClose, onRegistrado }: Props) {
  const [dataExame, setDataExame] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setDataExame("");
    setArquivo(null);
    setErro("");
  }, [isOpen]);

  if (!isOpen) return null;

  const valido = Boolean(dataExame);

  const handleSalvar = async () => {
    if (!valido) return;
    setEnviando(true);
    setErro("");
    try {
      let arquivoPath: string | null = null;

      if (arquivo) {
        const urlRes = await fetch(`/api/funcionarios/${funcionarioId}/aso-upload-url`, {
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
        arquivoPath = urlJson.path;
      }

      const res = await fetch(`/api/funcionarios/${funcionarioId}/asos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_exame: dataExame, arquivo_path: arquivoPath }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao registrar exame."); return; }

      onRegistrado({
        id: json.data.id,
        data_exame: json.data.data_exame,
        arquivo_path: json.data.arquivo_path,
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
        <h2 className="text-lg font-bold text-gray-900 mb-4">Registrar novo exame</h2>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data do exame *</label>
          <input
            type="date" value={dataExame}
            onChange={(e) => setDataExame(e.target.value)}
            className="input-field"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Arquivo (opcional)</label>
          <input
            type="file" accept="application/pdf,image/*"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="input-field"
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
