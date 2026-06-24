import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ORIGEM_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ── Shared sub-components (server-renderable) ────────────────────────────────

function KpiCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string | number;
  sub: string;
  accent: string;
}) {
  return (
    <div className="card" style={{ position: "relative", overflow: "hidden" }}>
      <p className="section-title">{title}</p>
      <p style={{ fontSize: 38, fontWeight: 800, color: "#111827", lineHeight: 1, margin: 0 }}>
        {value}
      </p>
      <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>{sub}</p>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
          borderRadius: "0 0 12px 12px",
        }}
      />
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 5,
          fontSize: 13,
        }}
      >
        <span style={{ color: "#374151" }}>{label}</span>
        <span style={{ fontWeight: 700, color: "#111827" }}>{value}</span>
      </div>
      <div
        style={{
          background: "#F3F4F6",
          borderRadius: 4,
          height: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            background: color,
            height: "100%",
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}

function TaxaBadge({ taxa }: { taxa: number }) {
  const bg = taxa >= 70 ? "#D1FAE5" : taxa >= 40 ? "#FEF3C7" : "#FEE2E2";
  const fg = taxa >= 70 ? "#065F46" : taxa >= 40 ? "#92400E" : "#991B1B";
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
      {taxa}%
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabaseAuth = await createClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
  const role = authUser?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria"].includes(role)) redirect("/painel");

  const supabase = createServiceClient();

  const [
    { data: candidatos },
    { data: vagas },
    { data: encaminhamentos },
    { data: candidatosVagas },
    { data: clientes },
  ] = await Promise.all([
    supabase
      .from("candidatos")
      .select("id, etapa_kanban, status, responsavel, origem, created_at, updated_at"),
    supabase.from("vagas").select("id, status, titulo, data_abertura, data_fechamento, created_at"),
    supabase.from("encaminhamentos").select("id, cliente_id, status, created_at"),
    supabase.from("candidatos_vagas").select("vaga_id, candidato_id, etapa, created_at"),
    supabase.from("clientes").select("id, nome"),
  ]);

  const c = candidatos ?? [];
  const v = vagas ?? [];
  const e = encaminhamentos ?? [];
  const cv = candidatosVagas ?? [];
  const cl = clientes ?? [];

  const clienteNomeMap = new Map(cl.map((x) => [x.id, x.nome as string]));

  // ── 1. Candidatos por etapa ──────────────────────────────────────────────
  const ativos = c.filter((x) => x.status === "ativo");
  const reprovadoTotal = c.filter(
    (x) => x.status === "reprovado" || x.status === "negativado"
  ).length;

  const etapaRows = [
    { label: "Triagem", key: "triagem", color: "#6B7280" },
    { label: "Entrevista Salmazos", key: "entrevista_salmazos", color: "#3B82F6" },
    { label: "Entrevista Cliente", key: "entrevista_cliente", color: "#8B5CF6" },
    { label: "Aprovado Cliente", key: "aprovado_cliente", color: "#10B981" },
    { label: "Reprovado / Negativado", key: "__reprovado__", color: "#EF4444" },
  ];
  const etapaData = etapaRows.map((row) => ({
    label: row.label,
    color: row.color,
    value:
      row.key === "__reprovado__"
        ? reprovadoTotal
        : ativos.filter((x) => x.etapa_kanban === row.key).length,
  }));
  const maxEtapa = Math.max(1, ...etapaData.map((x) => x.value));

  // ── 2. Vagas por status ──────────────────────────────────────────────────
  const vagaStatusRows = [
    { label: "Abertas", key: "aberta", color: "#10B981" },
    { label: "Fechadas", key: "fechada", color: "#6B7280" },
    { label: "Canceladas", key: "cancelada", color: "#EF4444" },
  ];
  const vagaData = vagaStatusRows.map((row) => ({
    label: row.label,
    color: row.color,
    value: v.filter((x) => x.status === row.key).length,
  }));
  const maxVaga = Math.max(1, ...vagaData.map((x) => x.value));
  const vagasAbertas = v.filter((x) => x.status === "aberta").length;

  // ── 2b. Tempo médio de fechamento (date-based) ─────────────────────────
  const vagasFechadas = v.filter(
    (x) => x.status === "fechada" && x.data_abertura && x.data_fechamento
  );
  const temposFechamento = vagasFechadas.map((x) =>
    Math.round(
      (new Date(x.data_fechamento as string).getTime() -
        new Date(x.data_abertura as string).getTime()) /
        86400000
    )
  );
  const tempoMedioFechamento =
    temposFechamento.length > 0
      ? Math.round(temposFechamento.reduce((a, b) => a + b, 0) / temposFechamento.length)
      : null;

  // ── 3. Taxa de aprovação por cliente ────────────────────────────────────
  const clienteStatsMap = new Map<string, { aprovados: number; total: number }>();
  for (const enc of e) {
    if (!enc.cliente_id) continue;
    const entry = clienteStatsMap.get(enc.cliente_id) ?? { aprovados: 0, total: 0 };
    entry.total++;
    if (enc.status === "aprovado") entry.aprovados++;
    clienteStatsMap.set(enc.cliente_id, entry);
  }
  const taxaClientes = Array.from(clienteStatsMap.entries())
    .map(([id, stats]) => ({
      nome: clienteNomeMap.get(id) ?? `Cliente ${id.slice(0, 8)}`,
      ...stats,
      taxa: stats.total > 0 ? Math.round((stats.aprovados / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const totalEnc = e.length;
  const totalAprovadosEnc = e.filter((x) => x.status === "aprovado").length;
  const taxaGeralAprovacao =
    totalEnc > 0 ? Math.round((totalAprovadosEnc / totalEnc) * 100) : 0;

  // ── 4. Performance por analista ──────────────────────────────────────────
  const analistaMap = new Map<string, { cadastrados: number; aprovados: number }>();
  for (const cand of c) {
    const key = (cand.responsavel as string | null) || "Não atribuído";
    const entry = analistaMap.get(key) ?? { cadastrados: 0, aprovados: 0 };
    entry.cadastrados++;
    if (cand.etapa_kanban === "aprovado_cliente") entry.aprovados++;
    analistaMap.set(key, entry);
  }
  const performanceAnalistas = Array.from(analistaMap.entries())
    .map(([nome, data]) => ({ nome, ...data }))
    .sort((a, b) => b.cadastrados - a.cadastrados)
    .slice(0, 10);

  // ── 5. Tempo médio de preenchimento de vagas ─────────────────────────────
  const vagaMap = new Map(v.map((x) => [x.id as string, x]));
  const candidatoMap = new Map(c.map((x) => [x.id as string, x]));

  const vagaFirstApproval = new Map<string, Date>();

  // Primary: cv.etapa === "aprovado_cliente"
  for (const entry of cv) {
    if (entry.etapa === "aprovado_cliente") {
      const date = new Date(entry.created_at as string);
      const existing = vagaFirstApproval.get(entry.vaga_id as string);
      if (!existing || date < existing) vagaFirstApproval.set(entry.vaga_id as string, date);
    }
  }
  // Fallback: candidato with etapa_kanban = "aprovado_cliente" linked to a vaga
  if (vagaFirstApproval.size === 0) {
    for (const entry of cv) {
      const cand = candidatoMap.get(entry.candidato_id as string);
      if (cand?.etapa_kanban === "aprovado_cliente") {
        const date = new Date(cand.updated_at as string);
        const existing = vagaFirstApproval.get(entry.vaga_id as string);
        if (!existing || date < existing) vagaFirstApproval.set(entry.vaga_id as string, date);
      }
    }
  }

  const tempos: number[] = [];
  for (const [vagaId, firstApproval] of vagaFirstApproval) {
    const vaga = vagaMap.get(vagaId);
    if (vaga) {
      const dias =
        (firstApproval.getTime() - new Date(vaga.created_at as string).getTime()) / 86400000;
      if (dias >= 0) tempos.push(dias);
    }
  }
  const tempoMedio =
    tempos.length > 0
      ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
      : null;

  // ── 6. Candidaturas por período ──────────────────────────────────────────
  const now = Date.now();
  const candidaturas = {
    d7: c.filter((x) => now - new Date(x.created_at as string).getTime() <= 7 * 86400000).length,
    d30: c.filter((x) => now - new Date(x.created_at as string).getTime() <= 30 * 86400000).length,
    d90: c.filter((x) => now - new Date(x.created_at as string).getTime() <= 90 * 86400000).length,
  };

  const totalAtivos = ativos.length;

  // ── 7. Candidatos por origem ────────────────────────────────────────────
  const origemCount: Record<string, number> = { cadastro_rapido: 0, vaga_especifica: 0, banco_talentos: 0 };
  for (const cand of c) {
    const key = (cand.origem as string) ?? "cadastro_rapido";
    origemCount[key] = (origemCount[key] ?? 0) + 1;
  }

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

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Dashboard Executivo
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Indicadores em tempo real da operação
        </p>
      </div>

      {/* KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <KpiCard
          title="Candidatos Ativos"
          value={totalAtivos}
          sub={`${c.length} cadastrados no total`}
          accent="#FFD700"
        />
        <KpiCard
          title="Vagas em Aberto"
          value={vagasAbertas}
          sub={`${v.length} vagas cadastradas`}
          accent="#3B82F6"
        />
        <KpiCard
          title="Taxa de Aprovação"
          value={`${taxaGeralAprovacao}%`}
          sub={`${totalAprovadosEnc} de ${totalEnc} encaminhamentos`}
          accent="#10B981"
        />
        <KpiCard
          title="Tempo Médio Preench."
          value={tempoMedio !== null ? `${tempoMedio}d` : "—"}
          sub={`${vagaFirstApproval.size} vagas com histórico`}
          accent="#8B5CF6"
        />
        <KpiCard
          title="Tempo Médio Fechamento"
          value={tempoMedioFechamento !== null ? `${tempoMedioFechamento}d` : "—"}
          sub={`Baseado em ${vagasFechadas.length} vagas fechadas`}
          accent="#F59E0B"
        />
      </div>

      {/* Candidaturas por período */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {(
          [
            { label: "Últimos 7 dias", value: candidaturas.d7 },
            { label: "Últimos 30 dias", value: candidaturas.d30 },
            { label: "Últimos 90 dias", value: candidaturas.d90 },
          ] as const
        ).map(({ label, value }) => (
          <div key={label} className="card" style={{ textAlign: "center" }}>
            <p className="section-title">{label}</p>
            <p
              style={{
                fontSize: 44,
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1,
                margin: 0,
              }}
            >
              {value}
            </p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>
              candidaturas recebidas
            </p>
          </div>
        ))}
      </div>

      {/* Candidatos por Origem */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {([
          {
            key: "cadastro_rapido",
            icon: (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            ),
            bg: "#374151",
            fg: "#F9FAFB",
            accent: "#6B7280",
          },
          {
            key: "vaga_especifica",
            icon: (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            ),
            bg: "#DBEAFE",
            fg: "#1E40AF",
            accent: "#3B82F6",
          },
          {
            key: "banco_talentos",
            icon: (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
            bg: "#D1FAE5",
            fg: "#065F46",
            accent: "#10B981",
          },
        ] as const).map(({ key, icon, bg, fg, accent }) => (
          <div
            key={key}
            className="card"
            style={{ position: "relative", overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: bg,
                  color: fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              <p className="section-title" style={{ margin: 0 }}>
                {ORIGEM_LABELS[key]}
              </p>
            </div>
            <p
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1,
                margin: 0,
              }}
            >
              {origemCount[key] ?? 0}
            </p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>
              candidatos
            </p>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 3,
                background: accent,
                borderRadius: "0 0 12px 12px",
              }}
            />
          </div>
        ))}
      </div>

      {/* Bar charts row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div className="card">
          <p className="section-title">Candidatos por Etapa</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {etapaData.map((row) => (
              <BarRow
                key={row.label}
                label={row.label}
                value={row.value}
                max={maxEtapa}
                color={row.color}
              />
            ))}
          </div>
        </div>

        <div className="card">
          <p className="section-title">Vagas por Status</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {vagaData.map((row) => (
              <BarRow
                key={row.label}
                label={row.label}
                value={row.value}
                max={maxVaga}
                color={row.color}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Taxa de aprovação por cliente */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-title">Taxa de Aprovação por Cliente</p>
        {taxaClientes.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhum encaminhamento registrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Encam.</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Aprovados</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Reprovados</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Taxa</th>
                </tr>
              </thead>
              <tbody>
                {taxaClientes.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid #F9FAFB",
                      transition: "background 0.15s",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        fontSize: 14,
                        color: "#111827",
                        fontWeight: 600,
                      }}
                    >
                      {row.nome}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontSize: 14,
                        color: "#374151",
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {row.total}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span style={{ color: "#059669", fontWeight: 700, fontSize: 14 }}>
                        {row.aprovados}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span style={{ color: "#DC2626", fontWeight: 700, fontSize: 14 }}>
                        {row.total - row.aprovados}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <TaxaBadge taxa={row.taxa} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance por analista */}
      <div className="card">
        <p className="section-title">Performance por Analista</p>
        {performanceAnalistas.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhum candidato cadastrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Analista</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Cadastrados</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Aprovados</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Taxa</th>
                </tr>
              </thead>
              <tbody>
                {performanceAnalistas.map((a, i) => {
                  const taxa =
                    a.cadastrados > 0
                      ? Math.round((a.aprovados / a.cadastrados) * 100)
                      : 0;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F9FAFB" }}>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontSize: 14,
                          color: "#111827",
                          fontWeight: 600,
                        }}
                      >
                        {a.nome}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontSize: 14,
                          color: "#374151",
                          textAlign: "center",
                          fontWeight: 600,
                        }}
                      >
                        {a.cadastrados}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ color: "#059669", fontWeight: 700, fontSize: 14 }}>
                          {a.aprovados}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span
                          style={{
                            background: "#F3F4F6",
                            color: taxa >= 30 ? "#059669" : "#374151",
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {taxa}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
