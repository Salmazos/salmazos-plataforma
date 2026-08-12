"use client";

import { useState } from "react";
import CamposRescisaoForm, { valoresRescisaoValidos, type ValoresRescisao } from "@/components/CamposRescisaoForm";
import type { RescisaoRow } from "./RescisoesPageClient";

interface Props {
  rescisao: RescisaoRow;
  onClose: () => void;
  onAtualizada: (row: RescisaoRow) => void;
}

function paraValores(r: RescisaoRow): ValoresRescisao {
  return {
    dataDesligamento: r.data_desligamento,
    modalidade: r.modalidade,
    entrevistaDesligamento: r.entrevista_desligamento,
    funcionarioAssinou: r.funcionario_assinou,
    valorRescisao: r.valor_rescisao ? String(r.valor_rescisao) : "",
    dataPagamentoRescisao: r.data_pagamento_rescisao,
    valorGuia: r.valor_guia ? String(r.valor_guia) : "",
    dataPagamentoGuia: r.data_pagamento_guia ?? "",
    pensao: r.pensao ? String(r.pensao) : "",
    farmacia: r.farmacia ? String(r.farmacia) : "",
    faturado: r.faturado,
  };
}

export default function ModalEditarRescisao({ rescisao, onClose, onAtualizada }: Props) {
  const [valores, setValores] = useState<ValoresRescisao>(() => paraValores(rescisao));
  const [asoFile, setAsoFile] = useState<File | null>(null);
  const [asoAtualPath, setAsoAtualPath] = useState(rescisao.aso_documento_path);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const valido = valoresRescisaoValidos(valores);

  const alterar = <K extends keyof ValoresRescisao>(campo: K, valor: ValoresRescisao[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleVerAsoAtual = async () => {
    try {
      const res = await fetch(`/api/rescisoes/${rescisao.id}/aso-url`);
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Erro ao abrir o ASO."); return; }
      window.open(json.signedUrl, "_blank");
    } catch {
      alert("Erro de conexão ao abrir o ASO.");
    }
  };

  const handleSalvar = async () => {
    if (!valido) return;
    setSalvando(true);
    setErro("");
    try {
      let novoAsoPath: string | null | undefined = undefined;

      if (asoFile) {
        const urlRes = await fetch("/api/rescisoes/aso-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ funcionario_id: rescisao.funcionario_id, nome_arquivo: asoFile.name }),
        });
        const urlJson = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlJson.error || "Erro ao gerar URL de upload do ASO.");

        const uploadRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": asoFile.type || "application/octet-stream" },
          body: asoFile,
        });
        if (!uploadRes.ok) throw new Error("Erro ao enviar o arquivo do ASO.");
        novoAsoPath = urlJson.path;
      }

      const res = await fetch(`/api/rescisoes/${rescisao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_desligamento: valores.dataDesligamento,
          modalidade: valores.modalidade,
          entrevista_desligamento: valores.entrevistaDesligamento,
          funcionario_assinou: valores.funcionarioAssinou,
          valor_rescisao: Number(valores.valorRescisao),
          data_pagamento_rescisao: valores.dataPagamentoRescisao,
          valor_guia: valores.valorGuia ? Number(valores.valorGuia) : null,
          data_pagamento_guia: valores.dataPagamentoGuia || null,
          pensao: valores.pensao ? Number(valores.pensao) : null,
          farmacia: valores.farmacia ? Number(valores.farmacia) : null,
          faturado: valores.faturado,
          ...(novoAsoPath !== undefined ? { aso_documento_path: novoAsoPath } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar rescisão."); return; }
      if (novoAsoPath !== undefined) setAsoAtualPath(novoAsoPath);
      onAtualizada(json.data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const empresaNome = rescisao.empresa;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Editar rescisão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="rounded-lg p-3 mb-4 text-sm bg-gray-50 border border-gray-200">
          <p className="font-semibold text-gray-900">{rescisao.funcionarios?.nome_completo ?? "—"}</p>
          <p className="text-xs text-gray-500">{empresaNome}{rescisao.funcionarios?.cargo ? ` · ${rescisao.funcionarios.cargo}` : ""}</p>
        </div>

        <CamposRescisaoForm
          valores={valores}
          onAlterar={alterar}
          asoFile={asoFile}
          onAsoFileChange={setAsoFile}
          asoAtualPath={asoAtualPath}
          onVerAsoAtual={handleVerAsoAtual}
        />

        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1" disabled={salvando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={!valido || salvando} className="btn-primary flex-1 disabled:opacity-50">
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
