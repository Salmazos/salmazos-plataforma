"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";

export type CandidatoRow = {
  id: string;
  nome_completo: string;
  idade: number | null;
  cargo_pretendido: string | null;
  cidade: string | null;
  triagem_score: number | null;
  created_at: string;
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

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: "#9CA3AF" }}>—</span>;
  const { bg, fg } = colorForScore(score);
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {score}/100
    </span>
  );
}

function MatchCell({
  candidatoId,
  loading,
  matchMap,
}: {
  candidatoId: string;
  loading: boolean;
  matchMap: Record<string, MatchEntry[]>;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const matches = matchMap[candidatoId];

  if (loading && !matches) {
    return (
      <span style={{ color: "#9CA3AF", fontSize: 12, fontStyle: "italic" }}>
        Calculando...
      </span>
    );
  }

  if (!matches || matches.length === 0) {
    return <span style={{ color: "#9CA3AF", fontSize: 13 }}>Sem vagas</span>;
  }

  const best = matches[0];
  const { bg, fg } = colorForScore(best.score);

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
          {best.score}%
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
          {best.titulo}
        </div>
      </div>

      {showTooltip && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: 6,
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
}: {
  candidatos: CandidatoRow[];
}) {
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [cidade, setCidade] = useState("");
  const [idadeMin, setIdadeMin] = useState("");
  const [idadeMax, setIdadeMax] = useState("");

  const [matchMap, setMatchMap] = useState<Record<string, MatchEntry[]>>({});
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [vagasAbertas, setVagasAbertas] = useState<VagaAberta[]>([]);
  const [encaminhadoIds, setEncaminhadoIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  function openModal(c: CandidatoRow) {
    const bestVagaId = matchMap[c.id]?.[0]?.vaga_id ?? vagasAbertas[0]?.id ?? "";
    setModal({
      candidatoId: c.id,
      candidatoNome: c.nome_completo,
      selectedVagaId: bestVagaId,
      loading: false,
      error: null,
    });
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
        body: JSON.stringify({ candidato_id: candidatoId, vaga_id: selectedVagaId, etapa: "triagem" }),
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
    } catch {
      setModal((m) => m ? { ...m, loading: false, error: "Erro de conexão." } : m);
    }
  }, [modal]);

  const filtered = useMemo(() => {
    const nomeQ = nome.trim().toLowerCase();
    const cargoQ = cargo.trim().toLowerCase();
    const cidadeQ = cidade.trim().toLowerCase();
    const minAge = idadeMin !== "" ? parseInt(idadeMin, 10) : null;
    const maxAge = idadeMax !== "" ? parseInt(idadeMax, 10) : null;

    return candidatos.filter((c) => {
      if (nomeQ && !c.nome_completo.toLowerCase().includes(nomeQ)) return false;
      if (cargoQ && !(c.cargo_pretendido ?? "").toLowerCase().includes(cargoQ)) return false;
      if (cidadeQ && !(c.cidade ?? "").toLowerCase().includes(cidadeQ)) return false;
      if (minAge !== null && (c.idade === null || c.idade < minAge)) return false;
      if (maxAge !== null && (c.idade === null || c.idade > maxAge)) return false;
      return true;
    });
  }, [candidatos, nome, cargo, cidade, idadeMin, idadeMax]);

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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Banco de Candidatos
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Todos os currículos cadastrados na plataforma
        </p>
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

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
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
        </div>

        {(nome || cargo || cidade || idadeMin || idadeMax) && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#6B7280" }}>
            Exibindo{" "}
            <strong style={{ color: "#111827" }}>{filtered.length}</strong> de{" "}
            {candidatos.length} candidatos
            {" · "}
            <button
              onClick={() => { setNome(""); setCargo(""); setCidade(""); setIdadeMin(""); setIdadeMax(""); }}
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
                <th style={{ ...thStyle, textAlign: "center" }}>Nota IA</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Match com Vagas</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Perfil</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Encaminhar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
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
                    style={{ borderBottom: "1px solid #F3F4F6", transition: "background 0.1s" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#FAFAFA")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "")}
                  >
                    <td style={{ padding: "10px 12px", fontSize: 14, color: "#111827", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {c.nome_completo}
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
                      <ScoreBadge score={c.triagem_score} />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <MatchCell
                        candidatoId={c.id}
                        loading={loadingMatches}
                        matchMap={matchMap}
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
                      ) : (
                        <button
                          onClick={() => openModal(c)}
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
                            cursor: "pointer",
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
    </div>
  );
}
