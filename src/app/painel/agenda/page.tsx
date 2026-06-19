"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { ANALISTAS } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgendaItem {
  id: string;
  candidato_id: string;
  data_entrevista: string;
  status: string;
  tipo_servico: string | null;
  observacoes: string | null;
  candidato: { id: string; nome_completo: string; responsavel: string | null } | null;
  cliente: { id: string; nome: string; cidade?: string | null } | null;
  vaga: { id: string; titulo: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_CFG: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  aguardando: { label: "Aguardando", bg: "#FEF3C7", fg: "#92400E", dot: "#F59E0B" },
  aprovado:   { label: "Aprovado",   bg: "#D1FAE5", fg: "#065F46", dot: "#10B981" },
  reprovado:  { label: "Reprovado",  bg: "#FEE2E2", fg: "#991B1B", dot: "#EF4444" },
  desistiu:   { label: "Desistiu",   bg: "#F3F4F6", fg: "#374151", dot: "#9CA3AF" },
};

const STATUS_FILTER = ["aguardando", "aprovado", "reprovado"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse "YYYY-MM-DD[T...]" as a local date, avoiding UTC-midnight timezone shift
function parseDate(str: string): Date {
  const [y, m, d] = str.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(str: string): string {
  return parseDate(str).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function todayNorm(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateICS(item: AgendaItem): string {
  const [y, m, d] = item.data_entrevista.split("T")[0].split("-");
  const dtDate = `${y}${m}${d}`;
  const nextDay = new Date(Number(y), Number(m) - 1, Number(d) + 1);
  const dtEnd = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, "0")}${String(nextDay.getDate()).padStart(2, "0")}`;

  const candidatoNome = item.candidato?.nome_completo ?? "Candidato";
  const clienteNome = item.cliente?.nome ?? "";
  const vagaTitulo = item.vaga?.titulo ?? "";
  const uid = `${Date.now()}-${item.candidato_id}@salmazos`;

  const summary = vagaTitulo
    ? `Entrevista — ${candidatoNome} / ${vagaTitulo}`
    : `Entrevista — ${candidatoNome}`;

  const escapeICS = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const descParts = [
    `Candidato: ${escapeICS(candidatoNome)}`,
    vagaTitulo ? `Vaga: ${escapeICS(vagaTitulo)}` : "",
    clienteNome ? `Cliente: ${escapeICS(clienteNome)}` : "",
    item.observacoes ? `Observações: ${escapeICS(item.observacoes)}` : "",
  ].filter(Boolean);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Salmazos RH//Agenda//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtDate}T090000`,
    `DTSTART;VALUE=DATE:${dtDate}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeICS(summary)}`,
    clienteNome ? `LOCATION:${escapeICS(clienteNome)}` : "",
    `DESCRIPTION:${descParts.join("\\n")}`,
    "ORGANIZER;CN=Salmazos RH & Serviços:MAILTO:noreply@salmazos.com.br",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function downloadICS(item: AgendaItem): void {
  const ics = generateICS(item);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const nome = slugify(item.candidato?.nome_completo ?? "candidato");
  const data = item.data_entrevista.split("T")[0];
  const a = document.createElement("a");
  a.href = url;
  a.download = `entrevista-${nome}-${data}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const hoje = useRef(todayNorm()).current;

  const [items, setItems] = useState<AgendaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);

  const [filtroAnalista, setFiltroAnalista] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/encaminhamentos")
      .then((r) => r.json())
      .then(({ data, error: e }) => {
        if (e) { setErro(e); return; }
        setItems(data ?? []);
      })
      .catch(() => setErro("Erro ao carregar entrevistas."))
      .finally(() => setCarregando(false));
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const clientesDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.cliente) map.set(item.cliente.id, item.cliente.nome);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtrados = useMemo(() => {
    return items.filter((item) => {
      if (filtroAnalista && item.candidato?.responsavel !== filtroAnalista) return false;
      if (filtroCliente && item.cliente?.id !== filtroCliente) return false;
      if (filtroStatus && item.status !== filtroStatus) return false;
      return true;
    });
  }, [items, filtroAnalista, filtroCliente, filtroStatus]);

  // Map day-of-month → items for the visible calendar month
  const calendarioMap = useMemo(() => {
    const map = new Map<number, AgendaItem[]>();
    for (const item of filtrados) {
      const d = parseDate(item.data_entrevista);
      if (d.getFullYear() === ano && d.getMonth() === mes) {
        const day = d.getDate();
        map.set(day, [...(map.get(day) ?? []), item]);
      }
    }
    return map;
  }, [filtrados, ano, mes]);

  // List: selected day or all upcoming from today
  const lista = useMemo(() => {
    let base = filtrados;
    if (diaSelecionado !== null) {
      const target = new Date(ano, mes, diaSelecionado);
      base = filtrados.filter((item) => {
        const d = parseDate(item.data_entrevista);
        return (
          d.getFullYear() === target.getFullYear() &&
          d.getMonth() === target.getMonth() &&
          d.getDate() === target.getDate()
        );
      });
    } else {
      base = filtrados.filter((item) => parseDate(item.data_entrevista) >= hoje);
    }
    return base.sort((a, b) => a.data_entrevista.localeCompare(b.data_entrevista));
  }, [filtrados, diaSelecionado, ano, mes, hoje]);

  // ── Calendar helpers ───────────────────────────────────────────────────────

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const totalCells = Math.ceil((primeiroDia + diasNoMes) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const day = i - primeiroDia + 1;
    return day >= 1 && day <= diasNoMes ? day : null;
  });

  const prevMes = () => {
    setDiaSelecionado(null);
    if (mes === 0) { setMes(11); setAno((a) => a - 1); }
    else setMes((m) => m - 1);
  };
  const nextMes = () => {
    setDiaSelecionado(null);
    if (mes === 11) { setMes(0); setAno((a) => a + 1); }
    else setMes((m) => m + 1);
  };

  const isHoje = (day: number) =>
    day === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();

  const hasFilters = filtroAnalista || filtroCliente || filtroStatus;

  // ── Shared style shortcuts ─────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 11,
    color: "#FFB800",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    borderBottom: "2px solid #F3F4F6",
    whiteSpace: "nowrap",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#FFB800",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 4,
    display: "block",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Agenda de Entrevistas
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Calendário de encaminhamentos e entrevistas agendadas
        </p>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{ marginBottom: 20, padding: "16px 20px" }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* Analista */}
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 160px", minWidth: 140 }}>
            <label style={labelStyle}>Analista</label>
            <select
              value={filtroAnalista}
              onChange={(e) => setFiltroAnalista(e.target.value)}
              className="input-field"
              style={{ paddingTop: 8, paddingBottom: 8 }}
            >
              <option value="">Todos</option>
              {ANALISTAS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div style={{ display: "flex", flexDirection: "column", flex: "1 1 200px", minWidth: 160 }}>
            <label style={labelStyle}>Cliente</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="input-field"
              style={{ paddingTop: 8, paddingBottom: 8 }}
            >
              <option value="">Todos</option>
              {clientesDisponiveis.map(([id, nome]) => (
                <option key={id} value={id}>{nome}</option>
              ))}
            </select>
          </div>

          {/* Status chips */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Status</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {/* "Todos" chip */}
              <button
                onClick={() => setFiltroStatus("")}
                style={{
                  padding: "7px 16px",
                  borderRadius: 20,
                  border: `1.5px solid ${filtroStatus === "" ? "#111827" : "#E5E7EB"}`,
                  background: filtroStatus === "" ? "#111827" : "#fff",
                  color: filtroStatus === "" ? "#FFD700" : "#6B7280",
                  fontSize: 13,
                  fontWeight: filtroStatus === "" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Todos
              </button>
              {STATUS_FILTER.map((s) => {
                const cfg = STATUS_CFG[s];
                const active = filtroStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFiltroStatus(active ? "" : s)}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      border: `1.5px solid ${active ? cfg.dot : "#E5E7EB"}`,
                      background: active ? cfg.bg : "#fff",
                      color: active ? cfg.fg : "#6B7280",
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => {
                setFiltroAnalista("");
                setFiltroCliente("");
                setFiltroStatus("");
              }}
              style={{
                fontSize: 13,
                color: "#9CA3AF",
                padding: "7px 14px",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                cursor: "pointer",
                background: "white",
                alignSelf: "flex-end",
                whiteSpace: "nowrap",
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Calendar ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        {/* Month navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <button
            onClick={prevMes}
            aria-label="Mês anterior"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: "1px solid #E5E7EB", background: "white",
              cursor: "pointer", fontSize: 20, color: "#374151",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >
            ‹
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>
            {MESES[mes]} {ano}
            {carregando && (
              <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 400, marginLeft: 8 }}>
                carregando…
              </span>
            )}
          </h2>
          <button
            onClick={nextMes}
            aria-label="Próximo mês"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: "1px solid #E5E7EB", background: "white",
              cursor: "pointer", fontSize: 20, color: "#374151",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </div>

        {/* Day-of-week headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            marginBottom: 4,
          }}
        >
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "#9CA3AF",
                padding: "4px 0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;

            const dayItems = calendarioMap.get(day) ?? [];
            const selected = diaSelecionado === day;
            const today = isHoje(day);
            const clickable = dayItems.length > 0;

            const visibleDots = dayItems.slice(0, 4);
            const overflow = dayItems.length - visibleDots.length;

            return (
              <div
                key={day}
                onClick={() => setDiaSelecionado(selected ? null : day)}
                style={{
                  minHeight: 68,
                  padding: "6px 7px",
                  borderRadius: 8,
                  border: selected
                    ? "2px solid #FFD700"
                    : today
                    ? "2px solid #111827"
                    : "1px solid #F0F0F0",
                  background: selected ? "#FFFBEB" : today ? "#F9F9F9" : "#FAFAFA",
                  cursor: clickable || selected ? "pointer" : "default",
                  transition: "border-color 0.1s, background 0.1s",
                  userSelect: "none",
                }}
              >
                {/* Day number */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: today ? 800 : 500,
                    color: today ? "#111827" : "#4B5563",
                    marginBottom: 4,
                    lineHeight: 1,
                  }}
                >
                  {today ? (
                    <span
                      style={{
                        background: "#111827",
                        color: "#FFD700",
                        borderRadius: "50%",
                        width: 22,
                        height: 22,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {day}
                    </span>
                  ) : day}
                </div>

                {/* Status dots */}
                {dayItems.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
                    {visibleDots.map((item, j) => {
                      const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.aguardando;
                      const tooltipParts = [
                        item.candidato?.nome_completo ?? "?",
                        item.cliente?.nome ? `→ ${item.cliente.nome}` : "",
                        item.vaga?.titulo ? `(${item.vaga.titulo})` : "",
                        `— ${cfg.label}`,
                      ].filter(Boolean);
                      return (
                        <span
                          key={j}
                          title={tooltipParts.join(" ")}
                          style={{
                            width: 8, height: 8,
                            borderRadius: "50%",
                            background: cfg.dot,
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                    {overflow > 0 && (
                      <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, lineHeight: 1 }}>
                        +{overflow}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid #F3F4F6",
            flexWrap: "wrap",
          }}
        >
          {Object.entries(STATUS_CFG).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.dot, display: "inline-block" }}
              />
              <span style={{ fontSize: 12, color: "#6B7280" }}>{cfg.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 20, height: 20, borderRadius: "50%",
                background: "#111827", color: "#FFD700",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800,
              }}
            >
              H
            </span>
            <span style={{ fontSize: 12, color: "#6B7280" }}>Hoje</span>
          </div>
        </div>
      </div>

      {/* ── Interview list ───────────────────────────────────────────────────── */}
      <div className="card">
        {/* List header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <p className="section-title" style={{ margin: 0 }}>
            {diaSelecionado !== null
              ? `Entrevistas de ${String(diaSelecionado).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${ano}`
              : "Próximas Entrevistas"}
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {diaSelecionado !== null && (
              <button
                onClick={() => setDiaSelecionado(null)}
                style={{
                  fontSize: 12, color: "#9CA3AF",
                  padding: "4px 10px", border: "1px solid #E5E7EB",
                  borderRadius: 6, cursor: "pointer", background: "white",
                }}
              >
                Ver próximas
              </button>
            )}
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>
              {lista.length} entrevista{lista.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* States */}
        {erro ? (
          <div
            style={{
              background: "#FEE2E2", color: "#991B1B",
              padding: "12px 16px", borderRadius: 8, fontSize: 14,
            }}
          >
            {erro}
          </div>
        ) : carregando ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9CA3AF", padding: "24px 0" }}>
            <span
              style={{
                width: 18, height: 18, borderRadius: "50%",
                border: "2px solid #FFD700", borderTopColor: "transparent",
                display: "inline-block", animation: "agenda-spin 0.7s linear infinite",
              }}
            />
            Carregando entrevistas...
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "#F3F4F6", margin: "0 auto 12px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>—</span>
            </div>
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
              {diaSelecionado !== null
                ? "Nenhuma entrevista neste dia"
                : hasFilters
                ? "Nenhuma entrevista com os filtros aplicados"
                : "Nenhuma próxima entrevista"}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Candidato</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Vaga</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Data</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Analista</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                  <th style={{ ...thStyle, textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item) => {
                  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.aguardando;
                  const inicial = (item.candidato?.nome_completo ?? "?")[0].toUpperCase();
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid #F9FAFB" }}
                    >
                      {/* Candidato */}
                      <td style={{ padding: "10px 12px" }}>
                        <Link
                          href={`/painel/candidato/${item.candidato_id}`}
                          style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <span
                            style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: "#111827", color: "#FFD700",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 700, flexShrink: 0,
                            }}
                          >
                            {inicial}
                          </span>
                          <span
                            style={{
                              fontSize: 14, fontWeight: 600, color: "#111827",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              maxWidth: 200,
                            }}
                          >
                            {item.candidato?.nome_completo ?? "—"}
                          </span>
                        </Link>
                      </td>

                      {/* Cliente */}
                      <td
                        style={{
                          padding: "10px 12px", fontSize: 14, color: "#374151",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.cliente?.nome ?? "—"}
                      </td>

                      {/* Vaga */}
                      <td
                        style={{
                          padding: "10px 12px", fontSize: 13, color: "#6B7280",
                          maxWidth: 200,
                        }}
                      >
                        {item.vaga?.titulo ? (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}
                          >
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", flexShrink: 0 }}>Vaga:</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.vaga.titulo}</span>
                          </span>
                        ) : (
                          <span style={{ color: "#D1D5DB" }}>—</span>
                        )}
                      </td>

                      {/* Data */}
                      <td
                        style={{
                          padding: "10px 12px", textAlign: "center",
                          fontSize: 14, color: "#374151", whiteSpace: "nowrap",
                        }}
                      >
                        {fmtDate(item.data_entrevista)}
                      </td>

                      {/* Analista */}
                      <td
                        style={{
                          padding: "10px 12px", textAlign: "center",
                          fontSize: 13, color: "#6B7280", whiteSpace: "nowrap",
                        }}
                      >
                        {item.candidato?.responsavel ?? "—"}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span
                          style={{
                            background: cfg.bg, color: cfg.fg,
                            padding: "3px 10px", borderRadius: 12,
                            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                          }}
                        >
                          {cfg.label}
                        </span>
                      </td>

                      {/* Exportar */}
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <button
                          onClick={() => downloadICS(item)}
                          style={{
                            fontSize: 12,
                            color: "#6B7280",
                            padding: "4px 10px",
                            border: "1px solid #E5E7EB",
                            borderRadius: 6,
                            background: "#fff",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📅 Exportar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes agenda-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
