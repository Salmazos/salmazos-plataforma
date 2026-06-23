"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ORIGEM_LABELS } from "@/lib/constants";
import ModalCadastroRapido from "./ModalCadastroRapido";

export type CandidatoRow = {
  id: string;
  nome_completo: string;
  cpf: string | null;
  idade: number | null;
  cargo_pretendido: string | null;
  cidade: string | null;
  origem: string | null;
  triagem_score: number | null;
  triagem_label: string | null;
  triagem_resumo: string | null;
  melhor_match_score: number | null;
  melhor_match_vaga_titulo: string | null;
  juridico_tem_trabalhista: boolean | null;
  juridico_total_processos: number | null;
  juridico_consultado_em: string | null;
  escavador_status: string | null;
  bloqueado: boolean | null;
  created_at: string;
  status_alocacao: string | null;
  alocacao_cliente_nome: string | null;
  alocacao_vaga_titulo: string | null;
  alocacao_data_inicio: string | null;
  alocacao_data_fim: string | null;
  alocacao_tipo_servico: string | null;
  resumo_profissional: string | null;
  resumo_candidato: string | null;
  experiencias_profissionais: string | null;
  habilidades: string[] | null;
  formacao_academica: string | null;
  vagas_interesse: string[] | null;
};

type MatchEntry = { vaga_id: string; titulo: string; score: number };
type VagaAberta = { id: string; titulo: string; cliente_id: string | null };

type ModalState = {
  candidatoId: string;
  candidatoNome: string;
  selectedVagaId: string;
  loading: boolean;
  error: string | null;
};

type ProcessoAtivo = { vaga_titulo: string; responsavel: string | null; etapa: string };

type AlertaProcessoState = {
  candidato: CandidatoRow;
  processos: ProcessoAtivo[];
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11,
  color: "#FFB800",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6",
  whiteSpace: "nowrap",
  textAlign: "left",
};

function colorForScore(score: number): { bg: string; fg: string } {
  if (score >= 70) return { bg: "#D1FAE5", fg: "#065F46" };
  if (score >= 40) return { bg: "#FEF3C7", fg: "#92400E" };
  return { bg: "#FEE2E2", fg: "#991B1B" };
}

function triagemStyle(score: number): { bg: string; fg: string } {
  if (score >= 80) return { bg: "#22c55e", fg: "#fff" };
  if (score >= 60) return { bg: "#FFD700", fg: "#000" };
  if (score >= 40) return { bg: "#f97316", fg: "#fff" };
  return { bg: "#9ca3af", fg: "#fff" };
}

function ScoreBadge({ score, label, resumo }: { score: number | null; label: string | null; resumo: string | null }) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  if (score === null) return <span style={{ color: "#9CA3AF" }}>—</span>;

  const { bg, fg } = triagemStyle(score);

  return (
    <div
      style={{ display: "inline-block" }}
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
      }}
      onMouseLeave={() => setTooltipPos(null)}
    >
      <span
        style={{
          display: "inline-block",
          background: bg,
          color: fg,
          padding: "3px 10px",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: "nowrap",
          cursor: "default",
        }}
      >
        {score}% {label ?? ""}
      </span>

      {tooltipPos && (
        <div
          style={{
            position: "fixed",
            top: tooltipPos.y - 8,
            left: tooltipPos.x,
            transform: "translate(-50%, -100%)",
            background: "#1F2937",
            color: "#F9FAFB",
            fontSize: 12,
            lineHeight: 1.5,
            borderRadius: 8,
            padding: "8px 12px",
            zIndex: 9999,
            maxWidth: 320,
            width: "max-content",
            wordWrap: "break-word",
            whiteSpace: "normal",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >
          {resumo ?? "Resumo não disponível"}
        </div>
      )}
    </div>
  );
}

function MatchCell({
  candidatoId,
  loading,
  matchMap,
  savedScore,
  savedTitulo,
}: {
  candidatoId: string;
  loading: boolean;
  matchMap: Record<string, MatchEntry[]>;
  savedScore: number | null;
  savedTitulo: string | null;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const matches = matchMap[candidatoId];

  const displayScore = matches?.[0]?.score ?? savedScore;
  const displayTitulo = matches?.[0]?.titulo ?? savedTitulo;

  if (displayScore === null || displayScore === undefined) {
    if (loading) {
      return (
        <span style={{ color: "#9CA3AF", fontSize: 12, fontStyle: "italic" }}>
          Calculando...
        </span>
      );
    }
    return <span style={{ color: "#9CA3AF", fontSize: 13 }}>Sem vagas</span>;
  }

  const best = matches?.[0];
  const { bg, fg } = colorForScore(displayScore);

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{ cursor: "default", textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: bg,
            color: fg,
            padding: "3px 10px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {displayScore}%
        </span>
        <div
          style={{
            fontSize: 11,
            color: "#6B7280",
            marginTop: 2,
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayTitulo}
        </div>
      </div>

      {showTooltip && matches && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: 6,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            padding: "12px 14px",
            zIndex: 50,
            minWidth: 230,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#9CA3AF",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 8,
            }}
          >
            Top vagas compatíveis
          </div>
          {matches.map((m, i) => {
            const { bg: mbg, fg: mfg } = colorForScore(m.score);
            return (
              <div
                key={m.vaga_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: i < matches.length - 1 ? 6 : 0,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "#374151",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 155,
                  }}
                >
                  {m.titulo}
                </span>
                <span
                  style={{
                    background: mbg,
                    color: mfg,
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {m.score}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type HistoricoEntry = { tipo: string; descricao: string; created_at: string };

function HistoricoProcessos({ candidatoId }: { candidatoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [items, setItems] = useState<HistoricoEntry[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const handleToggle = async () => {
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    if (items !== null) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/candidatos/${candidatoId}/historico?tipos=contratado,reprovado_final`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data ?? []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        style={{
          fontSize: 11,
          color: "#6B7280",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
          textUnderlineOffset: 2,
          marginTop: 2,
          display: "block",
        }}
      >
        📋 {aberto ? "Fechar histórico" : "Ver histórico de processos"}
      </button>
      {aberto && (
        <div style={{ marginTop: 6, paddingLeft: 4 }}>
          {carregando ? (
            <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>Carregando...</span>
          ) : !items || items.length === 0 ? (
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>Nenhum processo finalizado.</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((h, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    lineHeight: 1.4,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: h.tipo === "contratado" ? "#F0FDF4" : "#F9FAFB",
                    border: `1px solid ${h.tipo === "contratado" ? "#BBF7D0" : "#E5E7EB"}`,
                    color: "#374151",
                  }}
                >
                  <span style={{ fontWeight: 700, color: h.tipo === "contratado" ? "#16A34A" : "#6B7280" }}>
                    {h.tipo === "contratado" ? "✓ Contratado" : "✗ Encerrado"}
                  </span>
                  {" — "}
                  {h.descricao}
                  <span style={{ color: "#9CA3AF", marginLeft: 6 }}>
                    {new Date(h.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ORIGEM_BADGE_STYLES: Record<string, { bg: string; fg: string }> = {
  cadastro_rapido: { bg: "#374151", fg: "#F9FAFB" },
  vaga_especifica: { bg: "#DBEAFE", fg: "#1E40AF" },
  banco_talentos: { bg: "#D1FAE5", fg: "#065F46" },
};

function OrigemBadge({ origem }: { origem: string | null }) {
  const key = origem ?? "cadastro_rapido";
  const style = ORIGEM_BADGE_STYLES[key] ?? ORIGEM_BADGE_STYLES.cadastro_rapido;
  return (
    <span
      style={{
        display: "inline-block",
        background: style.bg,
        color: style.fg,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
        marginTop: 2,
      }}
    >
      {ORIGEM_LABELS[key] ?? key}
    </span>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    color: "#111827",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    ...extra,
  };
}

export default function BancoCandidatosClient({
  candidatos,
  analista,
  idsEmProcesso,
}: {
  candidatos: CandidatoRow[];
  analista: string;
  idsEmProcesso: string[];
}) {
  const [filtroAlocacao, setFiltroAlocacao] = useState("disponivel");
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [cidade, setCidade] = useState("");
  const [idadeMin, setIdadeMin] = useState("");
  const [idadeMax, setIdadeMax] = useState("");
  const [notaIaMin, setNotaIaMin] = useState("");
  const [matchMin, setMatchMin] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");

  const [matchMap, setMatchMap] = useState<Record<string, MatchEntry[]>>({});
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [vagasAbertas, setVagasAbertas] = useState<VagaAberta[]>([]);
  const emProcessoSet = useMemo(() => new Set(idsEmProcesso), [idsEmProcesso]);
  const [encaminhadoIds, setEncaminhadoIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [alertaProcesso, setAlertaProcesso] = useState<AlertaProcessoState | null>(null);
  const [checkingProcessos, setCheckingProcessos] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [escavadorMap, setEscavadorMap] = useState<Record<string, string | null>>({});
  const [escavadorSaving, setEscavadorSaving] = useState<Record<string, boolean>>({});
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, { score: number; label: string }>>({});
  const router = useRouter();

  useEffect(() => {
    const pending = candidatos.some(
      (c) => c.triagem_score === null || c.juridico_consultado_em === null
    );
    if (!pending || candidatos.length === 0) return;

    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [candidatos, router]);

  useEffect(() => {
    if (candidatos.length === 0) return;
    setLoadingMatches(true);

    Promise.all(
      candidatos.map(async (c) => {
        try {
          const res = await fetch(`/api/banco-candidatos/match?candidato_id=${c.id}`);
          if (!res.ok) return { id: c.id, matches: [] as MatchEntry[] };
          const json = await res.json();
          return { id: c.id, matches: (json.matches ?? []) as MatchEntry[] };
        } catch {
          return { id: c.id, matches: [] as MatchEntry[] };
        }
      })
    ).then((results) => {
      const map: Record<string, MatchEntry[]> = {};
      results.forEach(({ id, matches }) => {
        map[id] = matches;
      });
      setMatchMap(map);
      setLoadingMatches(false);
    });
  }, [candidatos]);

  useEffect(() => {
    fetch("/api/banco-candidatos/vagas-abertas")
      .then((r) => r.json())
      .then((json) => setVagasAbertas(json.vagas ?? []))
      .catch(() => {});
  }, []);

  function abrirModalEncaminhamento(c: CandidatoRow) {
    const bestVagaId = matchMap[c.id]?.[0]?.vaga_id ?? vagasAbertas[0]?.id ?? "";
    setModal({
      candidatoId: c.id,
      candidatoNome: c.nome_completo,
      selectedVagaId: bestVagaId,
      loading: false,
      error: null,
    });
  }

  async function openModal(c: CandidatoRow) {
    setCheckingProcessos(true);
    try {
      const res = await fetch(`/api/candidatos/${c.id}/processos-ativos`);
      if (res.ok) {
        const json = await res.json();
        if (json.ativo && json.processos.length > 0) {
          setAlertaProcesso({ candidato: c, processos: json.processos });
          return;
        }
      }
    } catch {
      // proceed normally if check fails
    } finally {
      setCheckingProcessos(false);
    }
    abrirModalEncaminhamento(c);
  }

  const handleEncaminhar = useCallback(async () => {
    if (!modal) return;
    const { candidatoId, selectedVagaId } = modal;

    if (!selectedVagaId) {
      setModal((m) => m ? { ...m, error: "Selecione uma vaga." } : m);
      return;
    }

    setModal((m) => m ? { ...m, loading: true, error: null } : m);

    try {
      const res = await fetch("/api/candidatos-vagas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_id: candidatoId, vaga_id: selectedVagaId, etapa: "triagem", responsavel: analista || undefined }),
      });

      const json = await res.json();

      if (!res.ok) {
        setModal((m) => m ? { ...m, loading: false, error: json.error ?? "Erro ao encaminhar." } : m);
        return;
      }

      setEncaminhadoIds((prev) => {
        const next = new Set(prev);
        next.add(candidatoId);
        return next;
      });
      setModal(null);
      setSuccessMsg("Candidato encaminhado com sucesso!");
      setTimeout(() => setSuccessMsg(null), 4000);
      setTimeout(() => {
        setEncaminhadoIds((prev) => {
          const next = new Set(prev);
          next.delete(candidatoId);
          return next;
        });
      }, 3000);
    } catch {
      setModal((m) => m ? { ...m, loading: false, error: "Erro de conexão." } : m);
    }
  }, [modal, analista]);

  const handleEscavadorChange = useCallback(async (candidatoId: string, value: string) => {
    if (value === "") return;
    setEscavadorSaving((prev) => ({ ...prev, [candidatoId]: true }));
    try {
      const res = await fetch(`/api/candidatos/${candidatoId}/escavador-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escavador_status: value }),
      });
      if (res.ok) {
        const json = await res.json();
        setEscavadorMap((prev) => ({ ...prev, [candidatoId]: value }));
        if (json.triagem_score != null) {
          setScoreOverrides((prev) => ({
            ...prev,
            [candidatoId]: { score: json.triagem_score, label: json.triagem_label },
          }));
        }
      }
    } catch {
      // silent
    } finally {
      setEscavadorSaving((prev) => ({ ...prev, [candidatoId]: false }));
    }
  }, []);

  const filtered = useMemo(() => {
    const nomeQ = nome.trim().toLowerCase();
    const cargoQ = cargo.trim().toLowerCase();
    const cidadeQ = cidade.trim().toLowerCase();
    const kwQ = keyword.trim().toLowerCase();
    const minAge = idadeMin !== "" ? parseInt(idadeMin, 10) : null;
    const maxAge = idadeMax !== "" ? parseInt(idadeMax, 10) : null;
    const notaIaThreshold = notaIaMin !== "" ? parseInt(notaIaMin, 10) : null;
    const matchThreshold = matchMin !== "" ? parseInt(matchMin, 10) : null;

    return candidatos.filter((c) => {
      const sa = c.status_alocacao ?? "disponivel";
      if (filtroAlocacao === "disponivel" && sa !== "disponivel") return false;
      if (filtroAlocacao === "alocado_mot" && sa !== "alocado_mot") return false;
      if (filtroAlocacao === "alocado_rs" && sa !== "alocado_rs") return false;
      if (filtroAlocacao === "alocado_terceirizacao" && sa !== "alocado_terceirizacao") return false;
      if (nomeQ && !c.nome_completo.toLowerCase().includes(nomeQ)) return false;
      if (cargoQ && !(c.cargo_pretendido ?? "").toLowerCase().includes(cargoQ)) return false;
      if (cidadeQ && !(c.cidade ?? "").toLowerCase().includes(cidadeQ)) return false;
      if (minAge !== null && (c.idade === null || c.idade < minAge)) return false;
      if (maxAge !== null && (c.idade === null || c.idade > maxAge)) return false;
      if (notaIaThreshold !== null && (c.triagem_score === null || c.triagem_score < notaIaThreshold)) return false;
      if (matchThreshold !== null) {
        const bestMatch = matchMap[c.id]?.[0]?.score ?? c.melhor_match_score;
        if (bestMatch === null || bestMatch === undefined || bestMatch < matchThreshold) return false;
      }
      if (filtroOrigem && (c.origem ?? "cadastro_rapido") !== filtroOrigem) return false;
      if (kwQ) {
        const haystack = [
          c.nome_completo,
          c.cargo_pretendido,
          c.resumo_profissional,
          c.resumo_candidato,
          c.experiencias_profissionais,
          c.formacao_academica,
          Array.isArray(c.habilidades) ? c.habilidades.join(" ") : c.habilidades,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(kwQ)) return false;
      }
      return true;
    });
  }, [candidatos, nome, cargo, cidade, idadeMin, idadeMax, notaIaMin, matchMin, matchMap, filtroAlocacao, keyword, filtroOrigem]);

  return (
    <div>
      {/* Success banner */}
      {successMsg && (
        <div
          style={{
            background: "#D1FAE5",
            color: "#065F46",
            border: "1px solid #6EE7B7",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
            Banco de Candidatos
          </h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
            Todos os currículos cadastrados na plataforma
          </p>
        </div>
        <button
          onClick={() => setModalCadastroAberto(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#FFD700",
            color: "#000",
            border: "none",
            borderRadius: 10,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Cadastro Rápido
        </button>
      </div>

      {/* Summary card */}
      <div
        className="card"
        style={{ marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 10 }}
      >
        <span style={{ fontSize: 36, fontWeight: 800, color: "#111827", lineHeight: 1 }}>
          {candidatos.length}
        </span>
        <span style={{ fontSize: 14, color: "#6B7280" }}>
          {candidatos.length === 1 ? "currículo cadastrado" : "currículos cadastrados"}
        </span>
      </div>

      {/* Alocação filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {([
          { id: "todos", label: "Todos", count: candidatos.length },
          { id: "disponivel", label: "Disponíveis", count: candidatos.filter((c) => (c.status_alocacao ?? "disponivel") === "disponivel").length },
          { id: "alocado_mot", label: "🏢 MOT", count: candidatos.filter((c) => c.status_alocacao === "alocado_mot").length },
          { id: "alocado_rs", label: "🏢 R&S", count: candidatos.filter((c) => c.status_alocacao === "alocado_rs").length },
          { id: "alocado_terceirizacao", label: "🏢 Terc.", count: candidatos.filter((c) => c.status_alocacao === "alocado_terceirizacao").length },
        ] as const).map((tab) => {
          const active = filtroAlocacao === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFiltroAlocacao(tab.id)}
              style={{
                padding: "7px 16px",
                borderRadius: 20,
                border: `1.5px solid ${active ? "#111827" : "#E5E7EB"}`,
                background: active ? "#111827" : "#fff",
                color: active ? "#FFD700" : "#6B7280",
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 10,
                    background: active ? "#FFD700" : "#F3F4F6",
                    color: active ? "#000" : "#6B7280",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Nome
            </label>
            <input
              style={inputStyle()}
              placeholder="Buscar por nome..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Cargo pretendido
            </label>
            <input
              style={inputStyle()}
              placeholder="Ex: Operador"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Cidade
            </label>
            <input
              style={inputStyle()}
              placeholder="Ex: São Paulo"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Idade mínima
            </label>
            <input
              style={inputStyle()}
              type="number"
              min={0}
              placeholder="Ex: 18"
              value={idadeMin}
              onChange={(e) => setIdadeMin(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Idade máxima
            </label>
            <input
              style={inputStyle()}
              type="number"
              min={0}
              placeholder="Ex: 60"
              value={idadeMax}
              onChange={(e) => setIdadeMax(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Score mínimo
            </label>
            <select
              style={inputStyle({ background: "#fff", cursor: "pointer" })}
              value={notaIaMin}
              onChange={(e) => setNotaIaMin(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="50">{"≥"}50%</option>
              <option value="60">{"≥"}60%</option>
              <option value="70">{"≥"}70%</option>
              <option value="80">{"≥"}80%</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Match mínimo
            </label>
            <select
              style={inputStyle({ background: "#fff", cursor: "pointer" })}
              value={matchMin}
              onChange={(e) => setMatchMin(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="50">{"≥"}50%</option>
              <option value="60">{"≥"}60%</option>
              <option value="70">{"≥"}70%</option>
              <option value="80">{"≥"}80%</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Origem
            </label>
            <select
              style={inputStyle({ background: "#fff", cursor: "pointer" })}
              value={filtroOrigem}
              onChange={(e) => setFiltroOrigem(e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(ORIGEM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
            {"🔍"} Palavra-chave
          </label>
          <input
            style={inputStyle()}
            placeholder="Ex: NR-12, solda, CNH E, costura..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {(nome || cargo || cidade || idadeMin || idadeMax || notaIaMin || matchMin || keyword || filtroOrigem) && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#6B7280" }}>
            Exibindo{" "}
            <strong style={{ color: "#111827" }}>{filtered.length}</strong> de{" "}
            {candidatos.length} candidatos
            {" · "}
            <button
              onClick={() => { setNome(""); setCargo(""); setCidade(""); setIdadeMin(""); setIdadeMax(""); setNotaIaMin(""); setMatchMin(""); setKeyword(""); setFiltroOrigem(""); }}
              style={{ background: "none", border: "none", color: "#FFB800", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                <th style={thStyle}>Nome</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Idade</th>
                <th style={thStyle}>Cargo Pretendido</th>
                <th style={thStyle}>Cidade</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Score</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Processos</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Match com Vagas</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Perfil</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Encaminhar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}
                  >
                    {candidatos.length === 0
                      ? "Nenhum candidato cadastrado ainda."
                      : "Nenhum candidato encontrado com os filtros aplicados."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid #F3F4F6",
                      transition: "background 0.1s",
                      ...(c.bloqueado ? { background: "#1F2937", opacity: 0.7 } : {}),
                    }}
                    onMouseEnter={(e) => { if (!c.bloqueado) (e.currentTarget as HTMLTableRowElement).style.background = "#FAFAFA"; }}
                    onMouseLeave={(e) => { if (!c.bloqueado) (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    <td style={{ padding: "10px 12px", fontSize: 14, color: c.bloqueado ? "#fff" : "#111827", fontWeight: 600 }}>
                      <div style={{ whiteSpace: "nowrap" }}>
                        {c.nome_completo}
                        {c.bloqueado && (
                          <span style={{ display: "inline-block", background: "#dc2626", color: "#fff", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, marginLeft: 6, verticalAlign: "middle" }}>
                            BLOQUEADO
                          </span>
                        )}
                        {c.status_alocacao === "alocado_mot" && (
                          <span style={{ display: "inline-block", background: "#FFF7ED", color: "#C2410C", border: "1px solid #FDBA74", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, marginLeft: 6, verticalAlign: "middle" }}>
                            🏢 MOT
                          </span>
                        )}
                        {c.status_alocacao === "alocado_rs" && (
                          <span style={{ display: "inline-block", background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #93C5FD", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, marginLeft: 6, verticalAlign: "middle" }}>
                            🏢 R&S
                          </span>
                        )}
                        {c.status_alocacao === "alocado_terceirizacao" && (
                          <span style={{ display: "inline-block", background: "#F0FDF4", color: "#15803D", border: "1px solid #86EFAC", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, marginLeft: 6, verticalAlign: "middle" }}>
                            🏢 Terc.
                          </span>
                        )}
                      </div>
                      <OrigemBadge origem={c.origem} />
                      {c.vagas_interesse && c.vagas_interesse.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                          {c.vagas_interesse.map((vid) => {
                            const vaga = vagasAbertas.find((v) => v.id === vid);
                            return (
                              <span
                                key={vid}
                                style={{
                                  display: "inline-block",
                                  background: "#FFFBEB",
                                  color: "#92400E",
                                  border: "1px solid #FCD34D",
                                  padding: "1px 7px",
                                  borderRadius: 6,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {vaga ? vaga.titulo : vid.slice(0, 8) + "…"}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {c.status_alocacao && c.status_alocacao !== "disponivel" && (
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                          Alocado em: {c.alocacao_cliente_nome ?? "—"} — {c.alocacao_vaga_titulo ?? "—"}
                          {c.alocacao_data_inicio && ` desde ${c.alocacao_data_inicio.split("T")[0].split("-").reverse().join("/")}`}
                          {c.alocacao_data_fim && (() => {
                            const fimDate = new Date(c.alocacao_data_fim + "T00:00:00");
                            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                            const diffDays = Math.ceil((fimDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <>
                                {" até "}{c.alocacao_data_fim.split("T")[0].split("-").reverse().join("/")}
                                {diffDays <= 30 && diffDays >= 0 && (
                                  <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 4 }}>
                                    ⚠️ Vence em {diffDays} dia{diffDays !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {diffDays < 0 && (
                                  <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 4 }}>
                                    ⚠️ Vencido
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                      <HistoricoProcessos candidatoId={c.id} />
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151", textAlign: "center" }}>
                      {c.idade !== null ? c.idade : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151" }}>
                      {c.cargo_pretendido?.trim() || "Generalista"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#374151" }}>
                      {c.cidade ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <ScoreBadge
                        score={scoreOverrides[c.id]?.score ?? c.triagem_score}
                        label={scoreOverrides[c.id]?.label ?? c.triagem_label}
                        resumo={c.triagem_resumo}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, minWidth: 58, textAlign: "left" }}>Datajud:</span>
                          {c.juridico_consultado_em === null ? (
                            <span style={{ color: "#9CA3AF", fontSize: 11, fontStyle: "italic" }}>Consultando...</span>
                          ) : c.juridico_tem_trabalhista ? (
                            <span style={{ display: "inline-block", background: "#FEE2E2", color: "#991B1B", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {"⚠"} Trabalhista ({c.juridico_total_processos})
                            </span>
                          ) : (
                            <span style={{ display: "inline-block", background: "#D1FAE5", color: "#065F46", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {"✓"} Limpo
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, minWidth: 58, textAlign: "left" }}>Escavador:</span>
                          {escavadorSaving[c.id] ? (
                            <span style={{ color: "#9CA3AF", fontSize: 11, fontStyle: "italic" }}>Salvando...</span>
                          ) : (
                            <select
                              value={escavadorMap[c.id] ?? c.escavador_status ?? ""}
                              onChange={(e) => handleEscavadorChange(c.id, e.target.value)}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 10,
                                border: "1px solid #E5E7EB",
                                outline: "none",
                                cursor: "pointer",
                                background: (escavadorMap[c.id] ?? c.escavador_status) === "limpo" ? "#dcfce7"
                                  : (escavadorMap[c.id] ?? c.escavador_status) === "consta" ? "#fee2e2"
                                  : "#F9FAFB",
                                color: (escavadorMap[c.id] ?? c.escavador_status) === "limpo" ? "#16a34a"
                                  : (escavadorMap[c.id] ?? c.escavador_status) === "consta" ? "#dc2626"
                                  : "#9CA3AF",
                              }}
                            >
                              <option value="">— Não consultado</option>
                              <option value="limpo">{"✓"} Limpo</option>
                              <option value="consta">{"⚠"} Consta</option>
                            </select>
                          )}
                        </div>
                        {c.cpf && !c.cpf.startsWith("TEMP-") && (
                          <a
                            href={`https://www.escavador.com/busca?q=${encodeURIComponent('"' + c.cpf + '"')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "#6b7280", textDecoration: "underline", cursor: "pointer", display: "block", marginTop: 2 }}
                          >
                            {"🔍"} Escavador
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <MatchCell
                        candidatoId={c.id}
                        loading={loadingMatches}
                        matchMap={matchMap}
                        savedScore={c.melhor_match_score}
                        savedTitulo={c.melhor_match_vaga_titulo}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <Link
                        href={`/painel/candidato/${c.id}`}
                        style={{
                          display: "inline-block",
                          padding: "5px 14px",
                          background: "#FFF8DC",
                          color: "#92400E",
                          border: "1px solid #FFD700",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Ver perfil
                      </Link>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      {encaminhadoIds.has(c.id) ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "5px 14px",
                            background: "#D1FAE5",
                            color: "#065F46",
                            border: "1px solid #6EE7B7",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Encaminhado ✓
                        </span>
                      ) : emProcessoSet.has(c.id) ? (
                        <button
                          onClick={() => openModal(c)}
                          disabled={checkingProcessos}
                          style={{
                            display: "inline-block",
                            padding: "5px 14px",
                            background: "#16a34a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            cursor: checkingProcessos ? "wait" : "pointer",
                            opacity: checkingProcessos ? 0.8 : 1,
                          }}
                        >
                          {"✓"} Em Processo
                        </button>
                      ) : (
                        <button
                          onClick={() => openModal(c)}
                          disabled={checkingProcessos}
                          style={{
                            display: "inline-block",
                            padding: "5px 14px",
                            background: "#FFFBEB",
                            color: "#92400E",
                            border: "1px solid #FCD34D",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            cursor: checkingProcessos ? "wait" : "pointer",
                            opacity: checkingProcessos ? 0.6 : 1,
                          }}
                        >
                          → Triagem
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !modal.loading) setModal(null); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "24px 28px",
              width: 460,
              maxWidth: "90vw",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
              Encaminhar para Triagem
            </h2>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px" }}>
              {modal.candidatoNome}
            </p>

            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Vaga
            </label>
            <select
              value={modal.selectedVagaId}
              onChange={(e) => setModal((m) => m ? { ...m, selectedVagaId: e.target.value, error: null } : m)}
              disabled={modal.loading}
              style={{
                width: "100%",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: modal.selectedVagaId ? "#111827" : "#9CA3AF",
                outline: "none",
                marginBottom: 16,
                boxSizing: "border-box",
                background: "#fff",
                cursor: modal.loading ? "not-allowed" : "default",
              }}
            >
              {vagasAbertas.length === 0 ? (
                <option value="">Nenhuma vaga aberta disponível</option>
              ) : (
                <>
                  <option value="">Selecione uma vaga...</option>
                  {vagasAbertas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.titulo}
                    </option>
                  ))}
                </>
              )}
            </select>

            {modal.error && (
              <div
                style={{
                  background: "#FEE2E2",
                  color: "#991B1B",
                  border: "1px solid #FCA5A5",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {modal.error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModal(null)}
                disabled={modal.loading}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  background: "#fff",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: modal.loading ? "not-allowed" : "pointer",
                  opacity: modal.loading ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEncaminhar}
                disabled={modal.loading || !modal.selectedVagaId || vagasAbertas.length === 0}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background:
                    modal.loading || !modal.selectedVagaId || vagasAbertas.length === 0
                      ? "#E5E7EB"
                      : "#FFB800",
                  color:
                    modal.loading || !modal.selectedVagaId || vagasAbertas.length === 0
                      ? "#9CA3AF"
                      : "#000",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor:
                    modal.loading || !modal.selectedVagaId || vagasAbertas.length === 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {modal.loading ? "Encaminhando..." : "Encaminhar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta de processo ativo */}
      {alertaProcesso && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 110,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAlertaProcesso(null); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "24px 28px",
              width: 480,
              maxWidth: "90vw",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>{"⚠️"}</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#92400E", margin: 0 }}>
                Atenção!
              </h2>
            </div>
            <p style={{ fontSize: 13, color: "#374151", margin: "0 0 12px", lineHeight: 1.5 }}>
              Este candidato já está participando de {alertaProcesso.processos.length === 1 ? "um processo" : `${alertaProcesso.processos.length} processos`} ativo{alertaProcesso.processos.length !== 1 ? "s" : ""}:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {alertaProcesso.processos.map((p, i) => (
                <div
                  key={i}
                  style={{
                    background: "#FEF3C7",
                    border: "1px solid #FCD34D",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    color: "#92400E",
                  }}
                >
                  <strong>{p.vaga_titulo}</strong>
                  {p.responsavel && <> — Responsável: {p.responsavel}</>}
                  <span style={{ fontSize: 11, color: "#B45309", marginLeft: 6 }}>({p.etapa.replace(/_/g, " ")})</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
              Deseja encaminhar para um novo processo mesmo assim?
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setAlertaProcesso(null)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  background: "#fff",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const c = alertaProcesso.candidato;
                  setAlertaProcesso(null);
                  abrirModalEncaminhamento(c);
                }}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#FFB800",
                  color: "#000",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Sim, encaminhar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalCadastroRapido
        isOpen={modalCadastroAberto}
        onClose={() => setModalCadastroAberto(false)}
        onCadastrado={() => router.refresh()}
      />
    </div>
  );
}
