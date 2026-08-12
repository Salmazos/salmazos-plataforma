"use client";

import { useEffect, useState } from "react";
import CamposRescisaoForm, { VALORES_RESCISAO_VAZIOS, valoresRescisaoValidos, type ValoresRescisao } from "@/components/CamposRescisaoForm";
import type { FuncionarioRow } from "./FuncionariosPageClient";

interface Props {
  isOpen: boolean;
  funcionario: FuncionarioRow | null;
  onClose: () => void;
  onLancado: () => void;
}

export default function ModalLancarRescisao({ isOpen, funcionario, onClose, onLancado }: Props) {
  const [valores, setValores] = useState<ValoresRescisao>(VALORES_RESCISAO_VAZIOS);
  const [asoFile, setAsoFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setValores(VALORES_RESCISAO_VAZIOS);
    setAsoFile(null);
    setErro("");
  }, [isOpen]);

  if (!isOpen || !funcionario) return null;

  const empresaNome = funcionario.clientes?.nome ?? funcionario.empresa ?? "—";
  const valido = valoresRescisaoValidos(valores);

  const alterar = <K extends keyof ValoresRescisao>(campo: K, valor: ValoresRescisao[K]) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSalvar = async () => {
    if (!valido) return;
    setEnviando(true);
    setErro("");
    try {
      let asoDocumentoPath: string | null = null;

      if (asoFile) {
        const urlRes = await fetch("/api/rescisoes/aso-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ funcionario_id: funcionario.id, nome_arquivo: asoFile.name }),
        });
        const urlJson = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlJson.error || "Erro ao gerar URL de upload do ASO.");

        const uploadRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": asoFile.type || "application/octet-stream" },
          body: asoFile,
        });
        if (!uploadRes.ok) throw new Error("Erro ao enviar o arquivo do ASO.");
        asoDocumentoPath = urlJson.path;
      }

      const res = await fetch("/api/rescisoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funcionario_id: funcionario.id,
          empresa: empresaNome,
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
          aso_documento_path: asoDocumentoPath,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao lançar rescisão."); return; }
      onLancado();
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Lançar rescisão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="rounded-lg p-3 mb-4 text-sm bg-gray-50 border border-gray-200">
          <p className="font-semibold text-gray-900">{funcionario.nome_completo}</p>
          <p className="text-xs text-gray-500">{empresaNome}{funcionario.cargo ? ` · ${funcionario.cargo}` : ""}</p>
        </div>

        <CamposRescisaoForm valores={valores} onAlterar={alterar} asoFile={asoFile} onAsoFileChange={setAsoFile} />

        <p className="text-xs text-gray-400 mb-4">
          Os avisos de e-mail e plataforma são enviados automaticamente para a lista configurada em{" "}
          <span className="font-semibold">Avisos de Rescisão</span> (menu lateral) — não é escolhido aqui.
        </p>

        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={!valido || enviando} className="btn-primary flex-1 disabled:opacity-50">
            {enviando ? "Salvando..." : "Lançar rescisão"}
          </button>
        </div>
      </div>
    </div>
  );
}
