"use client";

import React from "react";
import { formatarCentavosBRL } from "@/lib/propostaMotCalculo";
import { textoBaseCalculoMot, type FuncaoPreviaMot, type PreviaMot } from "@/lib/propostaMot";
import { fmtData } from "@/components/propostas/propostasUi";

// Planilha de verbas de UMA função (só valores: percentual nunca aparece nas telas do vendedor).
export function PlanilhaFuncao({ f }: { f: FuncaoPreviaMot }) {
  const linha = (rotulo: string, centavos: number | null, forte = false, chave?: string) => (
    <tr key={chave ?? rotulo} data-linha={chave ?? rotulo}>
      <td style={{ padding: "3px 8px", fontWeight: forte ? 700 : 400 }}>{rotulo}</td>
      <td style={{ padding: "3px 8px", textAlign: "right", fontWeight: forte ? 700 : 400, whiteSpace: "nowrap" }}>{centavos === null ? "" : formatarCentavosBRL(centavos)}</td>
    </tr>
  );
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#111827" }}>
      <tbody>
        {f.linhas.map((l) => linha(l.rotulo, l.valor_centavos, l.chave === "subtotal", l.chave))}
        {f.retencoes.map((r) => linha(`Retenção de ${r.rotulo}`, r.valor_centavos, false, r.chave))}
        {linha("Total das retenções", f.total_retencoes_centavos, false, "total_retencoes")}
        {linha("TOTAL N. FISCAL", f.total_nf_centavos, true, "total_nf")}
      </tbody>
    </table>
  );
}

export interface DescricaoFuncao {
  area: string;
  descricao?: string | null;
}

// Uma linha por função (salário → valor mensal), com a planilha completa ao abrir, e o total mensal da proposta no fim.
export function ResumoFuncoesMot({ previa, funcoes, rotuloVigencia }: { previa: PreviaMot; funcoes: DescricaoFuncao[]; rotuloVigencia: string }) {
  // Layout "unica" (propostas e revisões novas): as funções só listam o salário; a planilha é UMA, sobre a soma, e o valor mensal total é o dela.
  if (previa.unica) {
    const preenchidas = previa.funcoes.flatMap((f, i) => (f === null ? [] : [{ f, i }]));
    return (
      <div data-previa-mot data-layout="unica">
        {preenchidas.map(({ f, i }) => (
          <div key={i} data-salario-funcao={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "6px 10px", marginBottom: 6, border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", fontSize: 14 }}>
            <span>
              <strong>Função {i + 1}</strong>
              {funcoes[i] ? ` · ${funcoes[i].area}${funcoes[i].descricao ? ` — ${funcoes[i].descricao}` : ""}` : ""}
            </span>
            <span>Salário {formatarCentavosBRL(f.salario_centavos)}</span>
          </div>
        ))}
        <details open style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginBottom: 8, background: "#fff" }}>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Planilha de verbas (única)</summary>
          <div data-base-calculo style={{ fontSize: 13, color: "#374151", margin: "6px 0 8px" }}>
            {textoBaseCalculoMot(preenchidas.map(({ f, i }) => ({ area: funcoes[i]?.area ?? `Função ${i + 1}`, salario_centavos: f.salario_centavos })), previa.unica.salario_centavos)}
          </div>
          <PlanilhaFuncao f={previa.unica} />
        </details>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 14 }}>
          <strong>Valor mensal total da proposta</strong>
          <strong data-total-mensal>{formatarCentavosBRL(previa.total_mensal_centavos)}</strong>
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
          {rotuloVigencia} {fmtData(previa.vigente_desde)}. A planilha é calculada sobre a soma dos salários; o valor mensal é o TOTAL N. FISCAL dela.
        </div>
      </div>
    );
  }
  return (
    <div data-previa-mot>
      {previa.funcoes.map((f, i) =>
        f === null ? null : (
          <details key={i} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px", marginBottom: 8, background: "#fff" }}>
            <summary style={{ cursor: "pointer", fontSize: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>
                <strong>Função {i + 1}</strong>
                {funcoes[i] ? ` · ${funcoes[i].area}${funcoes[i].descricao ? ` — ${funcoes[i].descricao}` : ""}` : ""}
              </span>
              <span data-valor-funcao={i}>
                Salário {formatarCentavosBRL(f.salario_centavos)} → valor mensal <strong>{formatarCentavosBRL(f.total_nf_centavos)}</strong>
              </span>
            </summary>
            <div style={{ marginTop: 8 }}><PlanilhaFuncao f={f} /></div>
          </details>
        )
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 14 }}>
        <strong>Valor mensal total da proposta</strong>
        <strong data-total-mensal>{formatarCentavosBRL(previa.total_mensal_centavos)}</strong>
      </div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
        {rotuloVigencia} {fmtData(previa.vigente_desde)}. O valor mensal de cada função é o TOTAL N. FISCAL da planilha.
      </div>
    </div>
  );
}
