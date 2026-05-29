"use client";

import { useState, useEffect, useCallback } from "react";
import { formatarData } from "@/lib/utils";
import { STATUS_ENCAMINHAMENTO } from "@/lib/constants";
import type { Encaminhamento, StatusEncaminhamento } from "@/types";

interface Props {
  candidatoId: string;
}

const STATUS_RETORNO: { value: StatusEncaminhamento; label: string }[] = [
  { value: "aprovado",  label: "Aprovado" },
  { value: "reprovado", label: "Reprovado" },
  { value: "desistiu",  label: "Desistiu" },
];

export default function EncaminhamentosSection({ candidatoId }: Props) {
  const [encaminhamentos, setEncaminhamentos] = useState<Encaminhamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [retornoAberto, setRetornoAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/encaminhamentos?candidato_id=${candidatoId}`);
      const { data } = await res.json();
      setEncaminhamentos(data ?? []);
    } finally {
      setCarregando(false);
    }
  }, [candidatoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleRetornoSalvo = (encAtualizado: Encaminhamento) => {
    setEncaminhamentos((prev) =>
      prev.map((e) => (e.id === encAtualizado.id ? encAtualizado : e))
    );
    setRetornoAberto(null);
  };

  if (carregando) {
    return (
      <div className="card">
        <p className="section-title">Encaminhamentos</p>
        <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
          <div className="w-4 h-4 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="section-title">Encaminhamentos</p>

      {encaminhamentos.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">
          Nenhum encaminhamento registrado
        </p>
      ) : (
        <div className="space-y-3">
          {encaminhamentos.map((enc) => (
            <EncaminhamentoItem
              key={enc.id}
              enc={enc}
              retornoAberto={retornoAberto === enc.id}
              onAbrirRetorno={() =>
                setRetornoAberto((prev) => (prev === enc.id ? null : enc.id))
              }
              onRetornoSalvo={handleRetornoSalvo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EncaminhamentoItem({
  enc,
  retornoAberto,
  onAbrirRetorno,
  onRetornoSalvo,
}: {
  enc: Encaminhamento;
  retornoAberto: boolean;
  onAbrirRetorno: () => void;
  onRetornoSalvo: (enc: Encaminhamento) => void;
}) {
  const cfg = STATUS_ENCAMINHAMENTO[enc.status];
  const [statusRetorno, setStatusRetorno] = useState<StatusEncaminhamento>("aprovado");
  const [obsRetorno, setObsRetorno] = useState(enc.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const handleSalvarRetorno = async () => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/encaminhamentos/${enc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusRetorno, observacoes: obsRetorno }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao salvar."); return; }
      onRetornoSalvo(json.data);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Linha principal */}
      <div className="p-3 flex flex-wrap items-start gap-3">
        {/* Ícone de empresa */}
        <div className="w-8 h-8 rounded-full bg-black text-[#FFD700] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
          {enc.cliente?.nome.charAt(0).toUpperCase() ?? "?"}
        </div>

        {/* Dados */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">
            {enc.cliente?.nome ?? "Cliente não encontrado"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
            {enc.cliente?.cidade && <span>{enc.cliente.cidade}</span>}
            {enc.cliente?.segmento && <span>· {enc.cliente.segmento}</span>}
            <span>· Entrevista: {formatarData(enc.data_entrevista)}</span>
          </div>
          {enc.observacoes && (
            <p className="text-xs text-gray-500 mt-1 italic">"{enc.observacoes}"</p>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
          {enc.status === "aguardando" && (
            <button
              onClick={onAbrirRetorno}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                retornoAberto
                  ? "bg-black text-[#FFD700] border-black"
                  : "border-gray-200 text-gray-600 hover:border-black hover:text-black"
              }`}
            >
              {retornoAberto ? "Fechar" : "Registrar retorno"}
            </button>
          )}
        </div>
      </div>

      {/* Painel de retorno */}
      {retornoAberto && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Retorno do cliente
          </p>

          <div className="flex gap-2 flex-wrap">
            {STATUS_RETORNO.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusRetorno(s.value)}
                className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                  statusRetorno === s.value
                    ? s.value === "aprovado"
                      ? "bg-green-600 text-white border-green-600"
                      : s.value === "reprovado"
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-gray-500 text-white border-gray-500"
                    : "border-gray-200 text-gray-600 hover:border-gray-400"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <textarea
            value={obsRetorno}
            onChange={(e) => setObsRetorno(e.target.value)}
            rows={2}
            placeholder="Observações do retorno (opcional)..."
            className="input-field resize-none text-sm"
          />

          {erro && (
            <p className="text-red-600 text-xs">{erro}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={onAbrirRetorno}
              className="btn-outline text-sm py-1.5"
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvarRetorno}
              disabled={salvando}
              className="btn-primary text-sm py-1.5 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Confirmar retorno"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
