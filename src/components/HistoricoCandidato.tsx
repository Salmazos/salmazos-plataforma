"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoricoEntry {
  id: string;
  tipo: string;
  descricao: string;
  metadata: Record<string, unknown> | null;
  criado_por: string | null;
  created_at: string;
}

type FilterGroup = "todos" | "etapas" | "encaminhamentos" | "comunicacao" | "ia" | "comentarios";

// ── Config ────────────────────────────────────────────────────────────────────

const TIPO_CFG: Record<string, { label: string; cor: string; icone: string }> = {
  cadastro:             { label: "Cadastro",           cor: "#10B981", icone: "C"  },
  etapa_alterada:       { label: "Etapa alterada",     cor: "#3B82F6", icone: "→"  },
  encaminhamento:       { label: "Encaminhamento",     cor: "#8B5CF6", icone: "↑"  },
  aprovacao_cliente:    { label: "Aprovado",           cor: "#059669", icone: "✓"  },
  reprovacao_cliente:   { label: "Reprovado",          cor: "#EF4444", icone: "✕"  },
  email_enviado:        { label: "E-mail enviado",     cor: "#0EA5E9", icone: "@"  },
  whatsapp:             { label: "WhatsApp",           cor: "#22C55E", icone: "W"  },
  curriculo_atualizado: { label: "Currículo",          cor: "#F59E0B", icone: "CV" },
  triagem_ia:           { label: "Triagem IA",         cor: "#6366F1", icone: "IA" },
  match_ia:             { label: "Match IA",           cor: "#7C3AED", icone: "M"  },
  comentario_interno:   { label: "Comentário interno", cor: "#6B7280", icone: "+"  },
};

const FILTER_TIPOS: Record<FilterGroup, string[] | null> = {
  todos:            null,
  etapas:           ["cadastro", "etapa_alterada", "aprovacao_cliente", "reprovacao_cliente"],
  encaminhamentos:  ["encaminhamento"],
  comunicacao:      ["email_enviado", "whatsapp"],
  ia:               ["triagem_ia", "match_ia", "curriculo_atualizado"],
  comentarios:      ["comentario_interno"],
};

const FILTER_LABELS: Record<FilterGroup, string> = {
  todos:           "Todos",
  etapas:          "Etapas",
  encaminhamentos: "Encaminhamentos",
  comunicacao:     "Comunicação",
  ia:              "IA",
  comentarios:     "Comentários",
};

const FILTER_ORDER: FilterGroup[] = [
  "todos", "etapas", "encaminhamentos", "comunicacao", "ia", "comentarios",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function tipoConfig(tipo: string) {
  return TIPO_CFG[tipo] ?? { label: tipo, cor: "#9CA3AF", icone: "·" };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  candidatoId: string;
}

export default function HistoricoCandidato({ candidatoId }: Props) {
  const [entries, setEntries]         = useState<HistoricoEntry[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [erro, setErro]               = useState("");
  const [filtro, setFiltro]           = useState<FilterGroup>("todos");
  const [comentario, setComentario]   = useState("");
  const [enviando, setEnviando]       = useState(false);
  const [erroComentario, setErroComentario] = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/historico?candidato_id=${candidatoId}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao carregar histórico."); return; }
      setEntries(json.data ?? []);
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }, [candidatoId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtrados = useMemo(() => {
    const tipos = FILTER_TIPOS[filtro];
    if (!tipos) return entries;
    return entries.filter((e) => tipos.includes(e.tipo));
  }, [entries, filtro]);

  // ── Comment submit ─────────────────────────────────────────────────────────

  const handleSubmitComentario = async () => {
    const texto = comentario.trim();
    if (!texto) return;
    setEnviando(true);
    setErroComentario("");
    try {
      const res = await fetch("/api/historico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_id: candidatoId, descricao: texto }),
      });
      const json = await res.json();
      if (!res.ok) { setErroComentario(json.error ?? "Erro ao salvar comentário."); return; }
      setComentario("");
      setEntries((prev) => [json.data, ...prev]);
    } catch {
      setErroComentario("Erro de conexão.");
    } finally {
      setEnviando(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="card">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <p className="section-title" style={{ margin: 0 }}>
          Histórico
        </p>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          {entries.length} registro{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter chips */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        {FILTER_ORDER.map((key) => {
          const active = filtro === key;
          const count =
            FILTER_TIPOS[key] === null
              ? entries.length
              : entries.filter((e) => FILTER_TIPOS[key]!.includes(e.tipo)).length;
          return (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: `1.5px solid ${active ? "#111827" : "#E5E7EB"}`,
                background: active ? "#111827" : "#fff",
                color: active ? "#FFD700" : "#6B7280",
                fontSize: 12,
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.1s",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {FILTER_LABELS[key]}
              {count > 0 && (
                <span
                  style={{
                    background: active ? "#FFD700" : "#F3F4F6",
                    color: active ? "#111827" : "#9CA3AF",
                    borderRadius: 8,
                    padding: "0 5px",
                    fontSize: 10,
                    fontWeight: 700,
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Timeline body */}
      {carregando ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#9CA3AF",
            padding: "20px 0",
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid #FFD700",
              borderTopColor: "transparent",
              display: "inline-block",
              animation: "historico-spin 0.7s linear infinite",
            }}
          />
          Carregando histórico...
        </div>
      ) : erro ? (
        <p
          style={{
            color: "#991B1B",
            background: "#FEE2E2",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {erro}
        </p>
      ) : filtrados.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 0",
            color: "#D1D5DB",
            fontSize: 13,
          }}
        >
          Nenhum registro encontrado
        </div>
      ) : (
        <div>
          {filtrados.map((entry, i) => {
            const cfg = tipoConfig(entry.tipo);
            const isLast = i === filtrados.length - 1;
            const isMultiChar = cfg.icone.length > 1;

            return (
              <div
                key={entry.id}
                style={{ display: "flex", gap: 0 }}
              >
                {/* Left column: circle + connector line */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                    width: 36,
                    marginRight: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: cfg.cor,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: isMultiChar ? 9 : 13,
                      fontWeight: 700,
                      flexShrink: 0,
                      lineHeight: 1,
                      userSelect: "none",
                    }}
                  >
                    {cfg.icone}
                  </div>
                  {!isLast && (
                    <div
                      style={{
                        width: 2,
                        flex: 1,
                        minHeight: 16,
                        background: "#E5E7EB",
                        margin: "3px 0",
                        borderRadius: 1,
                      }}
                    />
                  )}
                </div>

                {/* Right column: content */}
                <div
                  style={{
                    flex: 1,
                    paddingBottom: isLast ? 0 : 16,
                    minWidth: 0,
                  }}
                >
                  {/* Type label + meta */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: cfg.cor,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {cfg.label}
                    </span>
                    {entry.criado_por && (
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                        · {entry.criado_por}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#C4C4C4", marginLeft: "auto" }}>
                      {fmtTimestamp(entry.created_at)}
                    </span>
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: entry.tipo === "comentario_interno" ? "#111827" : "#4B5563",
                      fontStyle: entry.tipo === "comentario_interno" ? "italic" : "normal",
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {entry.descricao}
                  </p>

                  {/* Metadata preview for key types */}
                  {entry.metadata && entry.tipo === "encaminhamento" && entry.metadata.data_entrevista != null && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF" }}>
                      Entrevista:{" "}
                      {new Date(entry.metadata.data_entrevista as string).toLocaleDateString("pt-BR")}
                      {entry.metadata.tipo_servico != null
                        ? ` · ${String(entry.metadata.tipo_servico)}`
                        : ""}
                    </p>
                  )}
                  {entry.metadata && entry.tipo === "etapa_alterada" && entry.metadata.etapa != null && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF" }}>
                      Nova etapa: {String(entry.metadata.etapa).replace(/_/g, " ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comment input */}
      <div
        style={{
          marginTop: filtrados.length > 0 || !carregando ? 20 : 8,
          paddingTop: 16,
          borderTop: "1px solid #F3F4F6",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#FFB800",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 8,
          }}
        >
          Adicionar comentário interno
        </p>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Escreva uma observação interna sobre este candidato..."
          rows={2}
          className="input-field"
          style={{ resize: "vertical", fontSize: 13, marginBottom: 8 }}
          disabled={enviando}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSubmitComentario();
            }
          }}
        />
        {erroComentario && (
          <p style={{ color: "#DC2626", fontSize: 12, marginBottom: 8 }}>
            {erroComentario}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#D1D5DB" }}>Ctrl+Enter para enviar</span>
          <button
            onClick={handleSubmitComentario}
            disabled={enviando || !comentario.trim()}
            className="btn-primary"
            style={{ fontSize: 13, padding: "7px 16px" }}
          >
            {enviando ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </div>

      <style>{`@keyframes historico-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
