"use client";

import React from "react";
import { formatarCentavosBRL } from "@/lib/propostaMotCalculo";
import { formatarPercentualBp } from "@/lib/propostaMotCalculo";
import type { PlanilhaTsTela } from "@/lib/propostaTs";
import { fmtData, fmtDataHora } from "@/components/propostas/propostasUi";

// O ganho efetivo pode ser negativo (preço manual abaixo do custo): o formatador do MOT só conhece percentual positivo.
export const formatarGanhoBp = (bp: number): string => `${bp < 0 ? "-" : ""}${formatarPercentualBp(Math.abs(bp))}`;
const moeda = (c: number | undefined) => (typeof c === "number" ? formatarCentavosBRL(c) : "—");

// Planilha da proposta de Terceirização (só valores calculados pelo SERVIDOR; a tela não calcula nada). O vendedor vê apenas o valor mensal por posto e o total (é só
// o que a rota devolve a ele). Gestor/diretoria vê também a decomposição do custo, o ganho aplicado e o aviso de ganho abaixo do mínimo.
export function PlanilhaTsView({ planilha, gestor, rotuloVigencia }: { planilha: PlanilhaTsTela; gestor: boolean; rotuloVigencia: string }) {
  return (
    <div data-previa-ts>
      {gestor && typeof planilha.ganho_bp === "number" && (
        <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
          Ganho sobre o custo aplicado: <strong data-ganho-aplicado>{formatarGanhoBp(planilha.ganho_bp)}</strong>
          {typeof planilha.encargos_sobre_adicionais === "boolean" && <span data-base-encargos> · Encargos {planilha.encargos_sobre_adicionais ? "também sobre os adicionais e horas extras" : "só sobre o salário"}</span>}
        </div>
      )}
      {planilha.servicos.map((s, i) => (
        <div key={i} data-servico={i} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginBottom: 8, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 14 }}>
            <strong>{s.nome}</strong>
            <span>Valor mensal <strong data-valor-servico={i}>{formatarCentavosBRL(s.preco_centavos)}</strong></span>
          </div>
          {s.modo === "fechado" ? (
            <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>Serviço fechado.</div>
          ) : (
            s.postos.map((p, k) => {
              const resumo = (
                <>
                  <span>{p.funcao} · <span data-quantidade={`${i}-${k}`}>{p.efetivos}</span> efetivo{p.efetivos === 1 ? "" : "s"}</span>
                  <span>
                    {gestor && typeof p.custo_unit_centavos === "number" && <>Custo por efetivo <span data-custo-efetivo={`${i}-${k}`}>{moeda(p.custo_unit_centavos)}</span> · </>}
                    {typeof p.preco_posto_centavos === "number" && <>Valor mensal <strong data-valor-posto={`${i}-${k}`}>{moeda(p.preco_posto_centavos)}</strong></>}
                  </span>
                </>
              );
              const linha: React.CSSProperties = { fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" };
              if (!gestor || !p.linhas) return <div key={k} data-posto={`${i}-${k}`} style={{ ...linha, marginTop: 6 }}>{resumo}</div>;
              return (
                <details key={k} data-posto={`${i}-${k}`} style={{ marginTop: 6 }}>
                  <summary style={{ ...linha, cursor: "pointer" }}>{resumo}</summary>
                  <table data-decomposicao={`${i}-${k}`} style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#111827", marginTop: 6 }}>
                    <tbody>
                      {p.linhas.map((l) => (
                        <tr key={l.chave} data-linha={l.chave}>
                          <td style={{ padding: "3px 8px", fontWeight: l.subtotal ? 700 : 400 }}>
                            {l.rotulo}{l.fornecido_pelo_cliente && <span data-fornecido-cliente={l.chave} style={{ color: "#6B7280" }}> (fornecido pelo cliente)</span>}
                          </td>
                          <td style={{ padding: "3px 8px", textAlign: "right", fontWeight: l.subtotal ? 700 : 400, whiteSpace: "nowrap" }}>{formatarCentavosBRL(l.valor_centavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              );
            })
          )}
          {gestor && (
            <div style={{ fontSize: 13, color: "#374151", marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>Custo do serviço <strong data-custo-servico={i}>{moeda(s.custo_centavos)}</strong></span>
              {typeof s.ganho_real_bp === "number" && <span>Ganho sobre o custo <strong data-ganho={i}>{formatarGanhoBp(s.ganho_real_bp)}</strong></span>}
              {typeof s.preco_manual_centavos === "number" && <span data-preco-manual={i}>Preço manual (calculado: {moeda(s.preco_calculado_centavos)})</span>}
            </div>
          )}
          {gestor && s.abaixo_ganho_minimo === true && (
            <div data-abaixo-ganho={i} style={{ marginTop: 6, padding: "6px 10px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, color: "#991B1B", fontSize: 13, fontWeight: 600 }}>
              Abaixo do ganho mínimo{typeof planilha.ganho_minimo_bp === "number" ? ` (${formatarGanhoBp(planilha.ganho_minimo_bp)})` : ""}.
            </div>
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 14 }}>
        <strong>TOTAL MENSAL</strong>
        <strong data-total-mensal>{formatarCentavosBRL(planilha.total_mensal_centavos)}</strong>
      </div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
        {rotuloVigencia} {fmtData(planilha.vigente_desde)}. {planilha.total_mensal_extenso}.
      </div>
      {gestor && planilha.liberacao_ganho && (
        <div data-liberacao-ganho style={{ marginTop: 8, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 13 }}>
          <strong>Ganho abaixo do mínimo liberado</strong> por {planilha.liberacao_ganho.liberado_por_nome} em {fmtDataHora(planilha.liberacao_ganho.liberado_em)}.
          <div style={{ color: "#4B5563", marginTop: 2 }}>Justificativa: {planilha.liberacao_ganho.justificativa}</div>
        </div>
      )}
    </div>
  );
}
