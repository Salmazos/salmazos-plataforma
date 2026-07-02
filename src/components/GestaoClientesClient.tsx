"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ETAPAS_KANBAN } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { ClienteComAtividade, CandidatoAtivo } from "@/app/painel/gestao-clientes/page";
import ModalAtencaoEspecial from "./ModalAtencaoEspecial";

type Tab = "clientes" | "responsaveis";

const HORAS_PARADO_LIMITE = 48;

function horasParado(updatedAt: string): number {
  return (Date.now() - new Date(updatedAt).getTime()) / 3600000;
}

function BadgeParado({ updatedAt }: { updatedAt: string }) {
  const horas = horasParado(updatedAt);
  if (horas < HORAS_PARADO_LIMITE) return null;
  const dias = Math.floor(horas / 24);
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
        background: "#FEF3C7", color: "#92400E", whiteSpace: "nowrap",
      }}
    >
      ⏱ Parado há {dias} dia{dias !== 1 ? "s" : ""}
    </span>
  );
}

function etapaLabel(etapa: string): string {
  return ETAPAS_KANBAN.find((e) => e.id === etapa)?.label ?? etapa;
}

function etapaCor(etapa: string): { bg: string; text: string } {
  const def = ETAPAS_KANBAN.find((e) => e.id === etapa);
  return { bg: def?.bgHex ?? "#F3F4F6", text: def?.textHex ?? "#374151" };
}

export default function GestaoClientesClient({ clientes, role }: { clientes: ClienteComAtividade[]; role: string }) {
  const router = useRouter();
  useAutoRefresh(30000);

  const [tab, setTab] = useState<Tab>("clientes");
  const [modalCliente, setModalCliente] = useState<{ id: string; nome: string; atencao_especial: boolean; nota: string | null } | null>(null);

  const podeMarcar = ["superuser", "diretoria"].includes(role);

  const clientesAtencao = useMemo(() => clientes.filter((c) => c.atencao_especial), [clientes]);
  const clientesComCandidatos = useMemo(() => clientes.filter((c) => c.candidatos.length > 0), [clientes]);

  const porResponsavel = useMemo(() => {
    const map = new Map<string, { candidatos: CandidatoAtivo[]; clientes: Set<string> }>();
    for (const cliente of clientes) {
      for (const cand of cliente.candidatos) {
        const key = cand.responsavel ?? "Não atribuído";
        const entry = map.get(key) ?? { candidatos: [], clientes: new Set<string>() };
        entry.candidatos.push(cand);
        entry.clientes.add(cliente.nome);
        map.set(key, entry);
      }
    }
    return Array.from(map.entries())
      .map(([nome, data]) => ({
        nome,
        total: data.candidatos.length,
        parados: data.candidatos.filter((c) => horasParado(c.updated_at) >= HORAS_PARADO_LIMITE).length,
        clientes: Array.from(data.clientes).sort(),
      }))
      .sort((a, b) => b.total - a.total);
  }, [clientes]);

  const handleSalvo = () => {
    setModalCliente(null);
    router.refresh();
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Gestão de Clientes</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
          Visibilidade em tempo real de candidatos em atendimento por cliente
        </p>
      </div>

      {/* Destaque — atenção especial */}
      {clientesAtencao.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            🚩 Clientes com atenção especial
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {clientesAtencao.map((c) => (
              <div key={c.id} style={{ background: "#FEF2F2", border: "2px solid #FCA5A5", borderRadius: 12, padding: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#991B1B", margin: "0 0 6px" }}>{c.nome}</p>
                {c.atencao_especial_nota && (
                  <p style={{ fontSize: 13, color: "#7F1D1D", margin: "0 0 8px", lineHeight: 1.4 }}>{c.atencao_especial_nota}</p>
                )}
                <p style={{ fontSize: 11, color: "#B91C1C", margin: 0 }}>
                  Marcado {c.atencao_especial_marcado_em ? `em ${formatarData(c.atencao_especial_marcado_em)}` : ""}
                  {c.atencao_especial_marcado_por_nome ? ` por ${c.atencao_especial_marcado_por_nome}` : ""}
                </p>
                {podeMarcar && (
                  <button
                    onClick={() => setModalCliente({ id: c.id, nome: c.nome, atencao_especial: true, nota: c.atencao_especial_nota })}
                    className="btn-outline"
                    style={{ marginTop: 10, padding: "5px 12px", fontSize: 12 }}
                  >
                    Editar / remover
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-gray-100 mb-5">
        {[{ id: "clientes" as Tab, label: "Por Cliente" }, { id: "responsaveis" as Tab, label: "Por Responsável" }].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontWeight: tab === t.id ? 700 : 500, fontSize: 14,
              color: tab === t.id ? "#111827" : "#6B7280", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid #FFB800" : "2px solid transparent", marginBottom: -2, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clientes" && (
        <div>
          {clientesComCandidatos.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhum candidato em atendimento vinculado a cliente no momento.</p>
          ) : (
            clientesComCandidatos.map((cliente) => {
              const contagemPorEtapa = new Map<string, number>();
              for (const cand of cliente.candidatos) {
                contagemPorEtapa.set(cand.etapa, (contagemPorEtapa.get(cand.etapa) ?? 0) + 1);
              }
              return (
                <div key={cliente.id} className="card mb-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>{cliente.nome}</p>
                    {podeMarcar && !cliente.atencao_especial && (
                      <button
                        onClick={() => setModalCliente({ id: cliente.id, nome: cliente.nome, atencao_especial: false, nota: null })}
                        className="btn-outline"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                      >
                        🚩 Marcar atenção especial
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {Array.from(contagemPorEtapa.entries()).map(([etapa, count]) => {
                      const cor = etapaCor(etapa);
                      return (
                        <span
                          key={etapa}
                          style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: cor.bg, color: cor.text }}
                        >
                          {count} em {etapaLabel(etapa)}
                        </span>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {cliente.candidatos.map((cand) => (
                      <div
                        key={cand.cv_id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                          padding: "8px 10px", background: "#F9FAFB", borderRadius: 8, fontSize: 13,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: "#111827" }}>{cand.nome_completo}</span>
                          <span style={{ color: "#9CA3AF", marginLeft: 8 }}>
                            {etapaLabel(cand.etapa)} · {cand.responsavel ?? "Sem responsável"}
                          </span>
                        </div>
                        <BadgeParado updatedAt={cand.updated_at} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "responsaveis" && (
        <div>
          {porResponsavel.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>Nenhum candidato em atendimento vinculado a cliente no momento.</p>
          ) : (
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                    {["Responsável", "Candidaturas em aberto", "Clientes", "Parados há 48h+"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porResponsavel.map((r) => (
                    <tr key={r.nome} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{r.nome}</td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{r.total}</td>
                      <td style={{ padding: "10px 12px", color: "#6B7280" }}>{r.clientes.join(", ")}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {r.parados > 0 ? (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>
                            ⏱ {r.parados}
                          </span>
                        ) : (
                          <span style={{ color: "#D1D5DB" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ModalAtencaoEspecial cliente={modalCliente} onClose={() => setModalCliente(null)} onSaved={handleSalvo} />
    </div>
  );
}
