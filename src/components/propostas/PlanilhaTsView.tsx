"use client";

import React from "react";
import { formatarCentavosBRL } from "@/lib/propostaMotCalculo";
import { formatarPercentualBp } from "@/lib/propostaMotCalculo";
import type { PlanilhaTsTela } from "@/lib/propostaTs";
import { fmtData, fmtDataHora } from "@/components/propostas/propostasUi";

// Margem pode ser negativa (preço manual abaixo do custo): o formatador do MOT só conhece percentual positivo.
export const formatarMargemBp = (bp: number): string => `${bp < 0 ? "-" : ""}${formatarPercentualBp(Math.abs(bp))}`;

// Planilha da proposta de Terceirização (só valores calculados pelo SERVIDOR; a tela não calcula nada). Por posto: custo por efetivo, quantidade e valor mensal.
// Só o gestor/diretoria recebe (e portanto vê) a decomposição das linhas, a margem real e o aviso de margem abaixo do mínimo: o vendedor vê só o que a rota devolve.
export function PlanilhaTsView({ planilha, gestor, rotuloVigencia }: { planilha: PlanilhaTsTela; gestor: boolean; rotuloVigencia: string }) {
  return (
    <div data-previa-ts>
      {planilha.servicos.map((s, i) => (
        <div key={i} data-servico={i} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginBottom: 8, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 14 }}>
            <strong>{s.nome}</strong>
            <span>Valor mensal <strong data-valor-servico={i}>{formatarCentavosBRL(s.preco_centavos)}</strong></span>
          </div>
          {s.modo === "fechado" ? (
            <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>Serviço fechado: valor calculado a partir do custo informado.</div>
          ) : (
            s.postos.map((p, k) => (
              <details key={k} data-posto={`${i}-${k}`} style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span>{p.funcao} · {p.efetivos} efetivo{p.efetivos === 1 ? "" : "s"}</span>
                  <span>
                    Custo por efetivo <span data-custo-efetivo={`${i}-${k}`}>{formatarCentavosBRL(p.custo_unit_centavos)}</span> · Quantidade <span data-quantidade={`${i}-${k}`}>{p.efetivos}</span> · Valor mensal <strong data-valor-posto={`${i}-${k}`}>{formatarCentavosBRL(p.preco_posto_centavos)}</strong>
                  </span>
                </summary>
                {gestor && (
                  <table data-decomposicao={`${i}-${k}`} style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#111827", marginTop: 6 }}>
                    <tbody>
                      {p.linhas.map((l) => (
                        <tr key={l.chave} data-linha={l.chave}>
                          <td style={{ padding: "3px 8px", fontWeight: l.subtotal ? 700 : 400 }}>{l.rotulo}</td>
                          <td style={{ padding: "3px 8px", textAlign: "right", fontWeight: l.subtotal ? 700 : 400, whiteSpace: "nowrap" }}>{formatarCentavosBRL(l.valor_centavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </details>
            ))
          )}
          {gestor && (
            <div style={{ fontSize: 13, color: "#374151", marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>Custo do serviço <strong data-custo-servico={i}>{formatarCentavosBRL(s.custo_centavos)}</strong></span>
              {typeof s.margem_real_bp === "number" && <span>Margem real <strong data-margem={i}>{formatarMargemBp(s.margem_real_bp)}</strong></span>}
              {s.preco_manual_centavos !== null && <span data-preco-manual={i}>Preço manual (calculado: {formatarCentavosBRL(s.preco_calculado_centavos)})</span>}
            </div>
          )}
          {gestor && s.abaixo_margem_minima === true && (
            <div data-abaixo-margem={i} style={{ marginTop: 6, padding: "6px 10px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, color: "#991B1B", fontSize: 13, fontWeight: 600 }}>
              Abaixo da margem mínima.
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
      {gestor && planilha.liberacao_margem && (
        <div data-liberacao-margem style={{ marginTop: 8, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 13 }}>
          <strong>Margem abaixo do mínimo liberada</strong> por {planilha.liberacao_margem.liberado_por_nome} em {fmtDataHora(planilha.liberacao_margem.liberado_em)}.
          <div style={{ color: "#4B5563", marginTop: 2 }}>Justificativa: {planilha.liberacao_margem.justificativa}</div>
        </div>
      )}
    </div>
  );
}
