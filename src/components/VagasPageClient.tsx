"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ModalNovaVaga from "./ModalNovaVaga";
import ModalSolicitacoesVagas from "./ModalSolicitacoesVagas";
import { TIPOS_SERVICO } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { Vaga } from "@/types";

const CORES_TIPO: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#ffffff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000000" },
  terceirizacao:         { bg: "#1D9E75", color: "#ffffff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#ffffff" },
};

const STATUS_VAGA: Record<string, { label: string; bg: string; color: string }> = {
  aberta:    { label: "Aberta",    bg: "#dcfce7", color: "#22c55e" },
  fechada:   { label: "Fechada",   bg: "#f3f4f6", color: "#6b7280" },
  cancelada: { label: "Cancelada", bg: "#fee2e2", color: "#ef4444" },
};

type FiltroStatus = "todas" | "aberta" | "fechada" | "cancelada";

interface Props {
  vagas: Vaga[];
  pendingCount: number;
}

export default function VagasPageClient({ vagas: inicial, pendingCount }: Props) {
  const router = useRouter();
  const [vagas, setVagas] = useState<Vaga[]>(inicial);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalSolicitacoes, setModalSolicitacoes] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [busca, setBusca] = useState("");
  const [importando, setImportando] = useState(false);
  const [msgImport, setMsgImport] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSalvo = (nova: Vaga) => {
    setVagas((prev) => [nova, ...prev]);
  };

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportando(true);
    setMsgImport(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/vagas/importar", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setMsgImport({ tipo: "erro", texto: json.error ?? "Erro ao importar." });
        return;
      }
      setMsgImport({ tipo: "ok", texto: `${json.importadas} vaga(s) importada(s) com sucesso.` });
      const refreshRes = await fetch("/api/vagas");
      const refreshJson = await refreshRes.json();
      if (refreshRes.ok) setVagas(refreshJson.data ?? []);
    } finally {
      setImportando(false);
    }
  };

  const filtradas = vagas.filter((v) => {
    const matchStatus =
      filtroStatus === "todas" || v.status === filtroStatus;
    const buscaLower = busca.toLowerCase();
    const matchBusca =
      !busca ||
      v.titulo.toLowerCase().includes(buscaLower) ||
      (v.clientes?.nome ?? "Banco de Talentos").toLowerCase().includes(buscaLower) ||
      (v.cidade ?? "").toLowerCase().includes(buscaLower);
    return matchStatus && matchBusca;
  });

  const totais = {
    abertas:       vagas.filter((v) => v.status === "aberta").length,
    fechadas:      vagas.filter((v) => v.status === "fechada").length,
    canceladas:    vagas.filter((v) => v.status === "cancelada").length,
    total_posicoes: vagas.filter((v) => v.status === "aberta").reduce((s, v) => s + (v.num_posicoes ?? 0), 0),
  };

  const FILTROS: { value: FiltroStatus; label: string }[] = [
    { value: "todas",     label: "Todas" },
    { value: "aberta",    label: "Abertas" },
    { value: "fechada",   label: "Fechadas" },
    { value: "cancelada", label: "Canceladas" },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vagas</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Gestão de vagas abertas e processos seletivos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalSolicitacoes(true)}
            className="btn-outline flex items-center gap-2"
            style={{ position: "relative" }}
          >
            {"📬"} Solicitações
            {pendingCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  backgroundColor: "#dc2626",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportar}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
            className="btn-outline flex items-center gap-2 disabled:opacity-50"
          >
            {importando ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                Importando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importar Excel
              </>
            )}
          </button>
          <button
            onClick={() => setModalAberto(true)}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova vaga
          </button>
        </div>
      </div>

      {msgImport && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
            msgImport.tipo === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <span>{msgImport.texto}</span>
          <button onClick={() => setMsgImport(null)} className="opacity-60 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-[#22c55e]">{totais.abertas}</p>
          <p className="text-xs text-gray-500 mt-1">Total abertas</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-gray-400">{totais.fechadas}</p>
          <p className="text-xs text-gray-500 mt-1">Fechadas</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-[#ef4444]">{totais.canceladas}</p>
          <p className="text-xs text-gray-500 mt-1">Canceladas</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-[#FFD700]">{totais.total_posicoes}</p>
          <p className="text-xs text-gray-500 mt-1">Total de posições</p>
        </div>
      </div>

      {/* Filtros + Busca */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por título, cliente ou cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroStatus(f.value)}
              className={`px-4 py-2 text-sm transition-colors ${
                filtroStatus === f.value
                  ? "bg-black text-[#FFD700] font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-3 opacity-30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6a4 4 0 11-8 0 4 4 0 018 0zm-8 8a4 4 0 00-4 4h16a4 4 0 00-4-4H8z" />
          </svg>
          <p className="font-medium">Nenhuma vaga encontrada</p>
          {filtroStatus !== "todas" && (
            <p className="text-sm mt-1">
              Tente mudar o filtro para &quot;Todas&quot;
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((v) => (
            <VagaCard key={v.id} vaga={v} />
          ))}
        </div>
      )}

      <ModalNovaVaga
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        onSalvo={handleSalvo}
      />
      <ModalSolicitacoesVagas
        isOpen={modalSolicitacoes}
        onClose={() => setModalSolicitacoes(false)}
        onVagaCriada={() => router.refresh()}
      />
    </div>
  );
}

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function diffDias(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function VagaCard({ vaga }: { vaga: Vaga }) {
  const tipoInfo = TIPOS_SERVICO.find((t) => t.id === vaga.tipo_servico);
  const coresTipo = vaga.tipo_servico ? CORES_TIPO[vaga.tipo_servico] : null;
  const statusInfo = STATUS_VAGA[vaga.status] ?? STATUS_VAGA.aberta;
  const nomeCliente = vaga.clientes?.nome ?? "Banco de Talentos";
  const isBancoTalentos = !vaga.clientes;

  const statusLabel = vaga.status === "cancelada" ? "Cancelada" : "Fechada";
  const dias = vaga.data_abertura && vaga.data_fechamento
    ? diffDias(vaga.data_abertura, vaga.data_fechamento)
    : null;

  return (
    <div className="card flex flex-wrap items-center gap-4">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={{ backgroundColor: "#000000", color: "#FFD700" }}
      >
        {vaga.titulo.charAt(0).toUpperCase()}
      </div>

      {/* Dados principais */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900">{vaga.titulo}</p>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
          >
            {statusInfo.label}
          </span>
          {coresTipo && tipoInfo && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: coresTipo.bg, color: coresTipo.color }}
            >
              {tipoInfo.abrev}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className={isBancoTalentos ? "italic text-gray-400" : ""}>
              {nomeCliente}
            </span>
          </span>
          {(vaga.cidade || vaga.estado) && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {[vaga.cidade, vaga.estado].filter(Boolean).join(" / ")}
            </span>
          )}
          {vaga.responsavel && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {vaga.responsavel}
            </span>
          )}
          {vaga.prazo && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Prazo: {formatarData(vaga.prazo)}
            </span>
          )}
        </div>
        {vaga.data_abertura && (
          <div className="text-xs text-gray-400 mt-1">
            {vaga.status === "aberta" ? (
              <>{"📅"} Aberta em: {formatDateBR(vaga.data_abertura)}</>
            ) : (
              <>{"📅"} Aberta em: {formatDateBR(vaga.data_abertura)} → {statusLabel} em: {formatDateBR(vaga.data_fechamento)}{dias !== null && ` (${dias} dias)`}</>
            )}
          </div>
        )}
      </div>

      {/* Posições */}
      <div className="text-center shrink-0">
        <p className="text-2xl font-bold text-[#FFD700]">{vaga.num_posicoes}</p>
        <p className="text-xs text-gray-400">
          {vaga.num_posicoes === 1 ? "posição" : "posições"}
        </p>
      </div>

      {/* Ver vaga */}
      <Link href={`/painel/vagas/${vaga.id}`} className="btn-outline shrink-0 text-sm">
        Ver vaga
      </Link>
    </div>
  );
}
