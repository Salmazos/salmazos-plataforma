"use client";

import { useEffect, useState } from "react";
import CampoMoeda from "@/components/ui/CampoMoeda";
import type { FuncionarioRow } from "./FuncionariosPageClient";

interface Props {
  isOpen: boolean;
  funcionario: FuncionarioRow | null;
  onClose: () => void;
  onLancado: () => void;
}

const MODALIDADE_OPCOES = [
  { value: "pedido_demissao", label: "Pedido de demissão" },
  { value: "desligamento_pela_empresa", label: "Desligamento pela empresa" },
  { value: "efetivado", label: "Efetivado" },
];

export default function ModalLancarRescisao({ isOpen, funcionario, onClose, onLancado }: Props) {
  const [dataDesligamento, setDataDesligamento] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [entrevistaDesligamento, setEntrevistaDesligamento] = useState(false);
  const [funcionarioAssinou, setFuncionarioAssinou] = useState(false);
  const [valorRescisao, setValorRescisao] = useState("");
  const [dataPagamentoRescisao, setDataPagamentoRescisao] = useState("");
  const [valorGuia, setValorGuia] = useState("");
  const [dataPagamentoGuia, setDataPagamentoGuia] = useState("");
  const [pensao, setPensao] = useState("");
  const [farmacia, setFarmacia] = useState("");
  const [faturado, setFaturado] = useState(false);
  const [asoFile, setAsoFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setDataDesligamento("");
    setModalidade("");
    setEntrevistaDesligamento(false);
    setFuncionarioAssinou(false);
    setValorRescisao("");
    setDataPagamentoRescisao("");
    setValorGuia("");
    setDataPagamentoGuia("");
    setPensao("");
    setFarmacia("");
    setFaturado(false);
    setAsoFile(null);
    setErro("");
  }, [isOpen]);

  if (!isOpen || !funcionario) return null;

  const empresaNome = funcionario.clientes?.nome ?? funcionario.empresa ?? "—";
  const valorValido = Number(valorRescisao) > 0;
  const valido = Boolean(dataDesligamento && modalidade && valorValido && dataPagamentoRescisao);

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
          data_desligamento: dataDesligamento,
          modalidade,
          entrevista_desligamento: entrevistaDesligamento,
          funcionario_assinou: funcionarioAssinou,
          valor_rescisao: Number(valorRescisao),
          data_pagamento_rescisao: dataPagamentoRescisao,
          valor_guia: valorGuia ? Number(valorGuia) : null,
          data_pagamento_guia: dataPagamentoGuia || null,
          pensao: pensao ? Number(pensao) : null,
          farmacia: farmacia ? Number(farmacia) : null,
          faturado,
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

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de desligamento *</label>
          <input type="date" value={dataDesligamento} onChange={(e) => setDataDesligamento(e.target.value)} className="input-field" />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Modalidade *</label>
          <select value={modalidade} onChange={(e) => setModalidade(e.target.value)} className="input-field">
            <option value="">Selecione</option>
            {MODALIDADE_OPCOES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="mb-3 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={entrevistaDesligamento} onChange={(e) => setEntrevistaDesligamento(e.target.checked)} />
            Entrevista de desligamento feita
          </label>
        </div>
        <div className="mb-3 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={funcionarioAssinou} onChange={(e) => setFuncionarioAssinou(e.target.checked)} />
            Funcionário assinou
          </label>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor da rescisão *</label>
          <CampoMoeda value={valorRescisao} onChange={(v) => setValorRescisao(v > 0 ? String(v) : "")} placeholder="Ex: 1.500,00" className="input-field" />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de pagamento da rescisão *</label>
          <input type="date" value={dataPagamentoRescisao} onChange={(e) => setDataPagamentoRescisao(e.target.value)} className="input-field" />
        </div>

        <div className="mb-3 flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor da guia</label>
            <CampoMoeda value={valorGuia} onChange={(v) => setValorGuia(v > 0 ? String(v) : "")} placeholder="Opcional" className="input-field" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de pagamento da guia</label>
            <input type="date" value={dataPagamentoGuia} onChange={(e) => setDataPagamentoGuia(e.target.value)} className="input-field" />
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pensão</label>
            <CampoMoeda value={pensao} onChange={(v) => setPensao(v > 0 ? String(v) : "")} placeholder="Opcional" className="input-field" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Farmácia</label>
            <CampoMoeda value={farmacia} onChange={(v) => setFarmacia(v > 0 ? String(v) : "")} placeholder="Opcional" className="input-field" />
          </div>
        </div>

        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={faturado} onChange={(e) => setFaturado(e.target.checked)} />
            Faturado
          </label>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ASO (opcional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => setAsoFile(e.target.files?.[0] ?? null)}
            className="input-field"
          />
          <p className="text-xs text-gray-400 mt-1">PDF ou imagem. Nunca bloqueia o lançamento da rescisão.</p>
        </div>

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
