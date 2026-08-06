"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAgingLevel } from "./VagasPageClient";

export interface VagaFinanceiraRow {
  id: string;
  titulo: string;
  clienteNome: string;
  diasAberta: number | null;
  salarioModo: "fixo" | "a_combinar" | "pretensao";
  salarioValor: number | null;
  feeRsPercentual: number | null;
  feeProjetado: number | null;
  taxaCancelamento: boolean;
  taxaCancelamentoPercentual: number | null;
  valorSeCancelar: number | null;
  etapaMaisAvancada: string | null;
  candidatosAtivos: number;
}

interface Props {
  rows: VagaFinanceiraRow[];
}

type SortField = "diasAberta" | "feeProjetado" | "valorSeCancelar";
type SortDir = "asc" | "desc";

const AGING_COLOR: Record<"critica" | "atencao" | "normal", { bg: string; color: string; label: string }> = {
  critica: { bg: "#ef4444", color: "#ffffff", label: "Crítica" },
  atencao: { bg: "#f59e0b", color: "#000000", label: "Atenção" },
  normal: { bg: "#22c55e", color: "#ffffff", label: "Normal" },
};

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SortIcon({ ativo, dir }: { ativo: boolean; dir: SortDir }) {
  if (!ativo) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
  return <span style={{ marginLeft: 4 }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function FinanceiroRSPageClient({ rows }: Props) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("diasAberta");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      // Valores indefinidos (null) sempre vão pro final, independente da direção —
      // "sem dado" não é nem o maior nem o menor valor, é a ausência dele.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [rows, sortField, sortDir]);

  const resumo = useMemo(() => {
    const totalVagas = rows.length;
    const comSalarioDefinido = rows.filter((r) => r.salarioValor != null);
    const semSalarioDefinido = totalVagas - comSalarioDefinido.length;
    const receitaPotencial = rows.reduce((soma, r) => soma + (r.feeProjetado ?? 0), 0);
    const receitaMinima = rows.reduce((soma, r) => soma + (r.valorSeCancelar ?? 0), 0);
    const vagasSemTaxa = rows.filter((r) => r.feeRsPercentual == null).length;
    return { totalVagas, semSalarioDefinido, receitaPotencial, receitaMinima, vagasSemTaxa };
  }, [rows]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Financeiro R&S — Vagas Abertas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Projeção de receita das vagas de Recrutamento e Seleção ainda em aberto.
        </p>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "#F3F4F6", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#374151", margin: 0 }}>{resumo.totalVagas}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "2px 0 0" }}>Vagas R&S abertas</p>
        </div>

        <div style={{ background: "#D1FAE5", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#166534", margin: 0 }}>{formatarMoeda(resumo.receitaPotencial)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "2px 0 0" }}>Receita potencial (se todas fecharem)</p>
          {resumo.semSalarioDefinido > 0 && (
            <p style={{ fontSize: 10, color: "#166534", opacity: 0.75, margin: "4px 0 0" }}>
              +{resumo.semSalarioDefinido} vaga{resumo.semSalarioDefinido > 1 ? "s" : ""} com salário indefinido, não incluída{resumo.semSalarioDefinido > 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div style={{ background: "#DBEAFE", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#1D4ED8", margin: 0 }}>{formatarMoeda(resumo.receitaMinima)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8", margin: "2px 0 0" }}>Receita mínima garantida (se todas cancelarem)</p>
        </div>

        <div style={{ background: "#FEE2E2", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#991B1B", margin: 0 }}>{resumo.vagasSemTaxa}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#991B1B", margin: "2px 0 0" }}>⚠ Vagas sem taxa configurada</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
              <th style={{ ...thStyle, width: "12%" }}>Cliente</th>
              <th style={{ ...thStyle, width: "12%" }}>Vaga</th>
              <th style={{ ...thStyle, width: "8%", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("diasAberta")}>
                Dias em aberto<SortIcon ativo={sortField === "diasAberta"} dir={sortDir} />
              </th>
              <th style={{ ...thStyle, width: "12%" }}>Salário</th>
              <th style={{ ...thStyle, width: "8%" }}>Taxa %</th>
              <th style={{ ...thStyle, width: "9%", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("feeProjetado")}>
                Receita Projetada<SortIcon ativo={sortField === "feeProjetado"} dir={sortDir} />
              </th>
              <th style={{ ...thStyle, width: "9%", paddingRight: 20 }}>Taxa cancelamento %</th>
              <th style={{ ...thStyle, width: "9%", paddingLeft: 20, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("valorSeCancelar")}>
                Valor se cancelar<SortIcon ativo={sortField === "valorSeCancelar"} dir={sortDir} />
              </th>
              <th style={{ ...thStyle, width: "15%" }}>Funil</th>
              <th style={{ ...thStyle, width: "6%" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhuma vaga de R&S em aberto no momento.
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => {
                const semTaxa = r.feeRsPercentual == null;
                const aging = r.diasAberta != null ? getAgingLevel("recrutamento_selecao", r.diasAberta) ?? "normal" : null;
                const agingInfo = aging ? AGING_COLOR[aging] : null;
                const hover = hoveredId === r.id;
                // ?origem=financeiro-rs pro botão "Voltar" na tela de detalhe da vaga saber
                // pra onde retornar (ver ORIGEM_VOLTAR em VagaDetalheClient.tsx) em vez de
                // sempre cair na lista geral de vagas.
                const hrefVaga = `/painel/vagas/${r.id}?origem=financeiro-rs`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(hrefVaga)}
                    onMouseEnter={() => setHoveredId(r.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      borderBottom: "1px solid #F3F4F6",
                      background: hover ? (semTaxa ? "#FEF3C7" : "#F9FAFB") : semTaxa ? "#FFFBEB" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td style={tdStyle}>{r.clienteNome}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>{r.titulo}</td>
                    <td style={tdStyle}>
                      {r.diasAberta != null && agingInfo ? (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: agingInfo.bg, color: agingInfo.color, whiteSpace: "nowrap" }}>
                          {r.diasAberta}d
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ ...tdStyle, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.salarioModo === "fixo" ? (
                        r.salarioValor != null ? formatarMoeda(r.salarioValor) : "—"
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280", whiteSpace: "nowrap" }}>
                          {r.salarioModo === "a_combinar" ? "À combinar" : "Pretensão Salarial"}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {semTaxa ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", whiteSpace: "nowrap" }}>⚠ sem taxa</span>
                      ) : (
                        `${r.feeRsPercentual}%`
                      )}
                    </td>
                    <td style={tdStyle}>{r.feeProjetado != null ? formatarMoeda(r.feeProjetado) : "—"}</td>
                    <td style={{ ...tdStyle, paddingRight: 20 }}>{r.taxaCancelamento && r.taxaCancelamentoPercentual != null ? `${r.taxaCancelamentoPercentual}%` : "—"}</td>
                    <td style={{ ...tdStyle, paddingLeft: 20 }}>{r.valorSeCancelar != null ? formatarMoeda(r.valorSeCancelar) : "—"}</td>
                    <td style={tdStyle}>
                      {r.etapaMaisAvancada ? (
                        <>
                          {r.etapaMaisAvancada}
                          <span style={{ color: "#9CA3AF" }}> · {r.candidatosAtivos} ativo{r.candidatosAtivos !== 1 ? "s" : ""}</span>
                        </>
                      ) : (
                        <span style={{ color: "#9CA3AF" }}>Sem candidato ativo</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <Link
                        href={hrefVaga}
                        className="btn-outline"
                        style={{ padding: "4px 8px", fontSize: 12, whiteSpace: "nowrap", display: "inline-block" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sem white-space: nowrap de propósito — cabeçalhos como "Taxa cancelamento %" e "Valor
// se cancelar" precisam poder quebrar em 2 linhas (ver width por coluna acima, tableLayout:
// "fixed") pra a tabela inteira caber em ~1440px sem scroll horizontal. lineHeight mais
// justo compensa a quebra pra não esticar demais a altura do cabeçalho.
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 8px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6B7280",
  textTransform: "uppercase",
  lineHeight: 1.3,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 8px",
  color: "#374151",
};
