"use client";

import { useState } from "react";
import type { RescisaoRow } from "./RescisoesPageClient";

interface Props {
  rescisao: RescisaoRow;
  onClose: () => void;
  onAnexado: (row: RescisaoRow) => void;
}

// Anexa (ou substitui) o ASO demissional direto da lista de Rescisões, sem abrir o "Editar" e sem exigir os
// demais campos da rescisão. Mesmo fluxo de upload do lançamento: URL assinada de upload -> PUT direto no Storage
// -> confirmação (PATCH) gravando o caminho. O arquivo nunca passa pela rota Next.
export default function ModalAnexarAsoDemissional({ rescisao, onClose, onAnexado }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dataExame, setDataExame] = useState(rescisao.aso_demissional_data_exame ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const substituindo = !!rescisao.aso_documento_path;

  const handleEnviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro("");
    try {
      const urlRes = await fetch("/api/rescisoes/aso-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcionario_id: rescisao.funcionario_id, nome_arquivo: arquivo.name }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlJson.error || "Erro ao gerar URL de upload do ASO.");

      const uploadRes = await fetch(urlJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": arquivo.type || "application/octet-stream" },
        body: arquivo,
      });
      if (!uploadRes.ok) throw new Error("Erro ao enviar o arquivo do ASO.");

      const res = await fetch(`/api/rescisoes/${rescisao.id}/aso-demissional`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: urlJson.path, ...(dataExame ? { data_exame: dataExame } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar o ASO.");
      onAnexado(json.data);
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
      onClick={(e) => { if (e.target === e.currentTarget && !enviando) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{substituindo ? "Substituir ASO demissional" : "Anexar ASO demissional"}</h2>
          <button onClick={onClose} disabled={enviando} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm font-semibold text-gray-900 mb-3">{rescisao.funcionarios?.nome_completo ?? "—"} <span className="text-xs font-normal text-gray-500">· {rescisao.empresa}</span></p>

        <label className="block text-xs font-semibold text-gray-600 mb-1">Arquivo (PDF, JPG ou PNG)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="input-field mb-3"
        />
        <label className="block text-xs font-semibold text-gray-600 mb-1">Data do exame (opcional)</label>
        <input type="date" value={dataExame} onChange={(e) => setDataExame(e.target.value)} className="input-field mb-3" />
        {substituindo && <p className="text-xs text-gray-500 mb-3">O arquivo atual será removido do Storage depois que o novo for salvo.</p>}

        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={enviando} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleEnviar} disabled={!arquivo || enviando} className="btn-primary flex-1 disabled:opacity-50">
            {enviando ? "Enviando..." : "Salvar ASO"}
          </button>
        </div>
      </div>
    </div>
  );
}
