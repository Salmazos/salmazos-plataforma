"use client";

import { useState } from "react";
import type { ValeTransporteState, ValeTransporteLinha } from "./AdmissaoFormClient";
import Campo from "./Campo";
import { campoErroStyle, cardStyle, botaoSecundarioStyle, erroTextStyle } from "./styles";
import { TERMOS_VALE_TRANSPORTE_TEXTO } from "@/lib/admissaoConstants";
import CampoMoeda from "@/components/ui/CampoMoeda";

interface Props {
  valeTransporte: ValeTransporteState;
  setCampo: <K extends keyof ValeTransporteState>(campo: K, valor: ValeTransporteState[K]) => void;
  errosVisiveis: Set<string>;
}

const OPCOES = [
  { value: "vale_transporte", label: "Opto pela utilização do Vale Transporte" },
  { value: "nao_opta", label: "Não opto pela utilização do Vale Transporte" },
  { value: "transporte_fretado", label: "Opto pela utilização do Transporte Fretado pela Empresa" },
];

const DIAS_SEMANA_PRESETS = ["Segunda a Sexta-feira", "Segunda a Sábado"];

const LINHA_VAZIA: ValeTransporteLinha = { onibus_viacao: "", percurso: "", valor_unitario: "", valor_total_diario: "" };

export default function PassoValeTransporte({ valeTransporte, setCampo, errosVisiveis }: Props) {
  const erro = (campo: string) => errosVisiveis.has(campo);

  // "Outros" precisa de um modo local só pra saber que o rádio está nessa opção mesmo
  // com o texto ainda vazio — o valor final continua indo direto pro campo dias_semana.
  const [diasModo, setDiasModo] = useState<"preset" | "outros">(() =>
    valeTransporte.dias_semana && !DIAS_SEMANA_PRESETS.includes(valeTransporte.dias_semana) ? "outros" : "preset"
  );

  const linhas = valeTransporte.linhas;
  const atualizarLinha = (idx: number, campo: keyof ValeTransporteLinha, valor: string) => {
    setCampo("linhas", linhas.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  };
  const adicionarLinha = () => {
    if (linhas.length >= 2) return;
    setCampo("linhas", [...linhas, { ...LINHA_VAZIA }]);
  };
  const removerLinha = (idx: number) => {
    setCampo("linhas", linhas.filter((_, i) => i !== idx));
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Vale Transporte</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Como você vai se deslocar até o trabalho.</p>

      <Campo label="Opção" required erro={erro("vt_opcao")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {OPCOES.map((opt) => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, minHeight: 44 }}>
              <input
                type="radio" name="vt_opcao" checked={valeTransporte.opcao === opt.value}
                onChange={() => setCampo("opcao", opt.value)}
                style={{ width: 20, height: 20 }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </Campo>

      <Campo label="Dias que irá trabalhar na semana" required erro={erro("vt_dias_semana")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: diasModo === "outros" ? 10 : 0 }}>
          {DIAS_SEMANA_PRESETS.map((preset) => (
            <label key={preset} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, minHeight: 44 }}>
              <input
                type="radio" name="vt_dias_semana" checked={diasModo === "preset" && valeTransporte.dias_semana === preset}
                onChange={() => { setDiasModo("preset"); setCampo("dias_semana", preset); }}
                style={{ width: 20, height: 20 }}
              />
              {preset}
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, minHeight: 44 }}>
            <input
              type="radio" name="vt_dias_semana" checked={diasModo === "outros"}
              onChange={() => { setDiasModo("outros"); setCampo("dias_semana", ""); }}
              style={{ width: 20, height: 20 }}
            />
            Outros
          </label>
        </div>
        {diasModo === "outros" && (
          <input
            type="text" value={valeTransporte.dias_semana}
            onChange={(e) => setCampo("dias_semana", e.target.value)}
            placeholder="Ex: Terça, quinta e sábado"
            style={campoErroStyle(erro("vt_dias_semana"))}
          />
        )}
      </Campo>

      <Campo label="Bairro e cidade do local de trabalho" required erro={erro("vt_bairro_cidade")}>
        <input
          type="text" value={valeTransporte.bairro_cidade_trabalho}
          onChange={(e) => setCampo("bairro_cidade_trabalho", e.target.value)}
          placeholder="Ex: Centro, Guarulhos"
          style={campoErroStyle(erro("vt_bairro_cidade"))}
        />
      </Campo>

      {valeTransporte.opcao === "vale_transporte" && (
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          {TERMOS_VALE_TRANSPORTE_TEXTO.map((linha, i) => (
            <p key={i} style={{ fontSize: 12, color: "#374151", lineHeight: 1.6, margin: i === 0 ? "0 0 8px" : "0 0 6px" }}>{linha}</p>
          ))}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginTop: 8 }}>
            <input
              type="checkbox" checked={valeTransporte.termos_aceitos}
              onChange={(e) => setCampo("termos_aceitos", e.target.checked)}
              style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Li e concordo com os termos acima</span>
          </label>
          {erro("vt_termos_aceitos") && (
            <p style={erroTextStyle}>⚠️ Você precisa concordar com os termos do Vale Transporte para continuar.</p>
          )}
        </div>
      )}

      {valeTransporte.opcao === "vale_transporte" && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "4px 0 10px" }}>Linhas de ônibus</p>
          {erro("vt_linhas") && <p style={erroTextStyle}>Preencha ao menos uma linha (ônibus/viação, percurso e valor).</p>}

          {linhas.map((linha, idx) => (
            <div key={idx} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Linha {idx + 1}</span>
                <button
                  onClick={() => removerLinha(idx)}
                  style={{ background: "none", border: "none", color: "#DC2626", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 8 }}
                >
                  Remover
                </button>
              </div>
              <Campo label="Ônibus/Viação">
                <input type="text" value={linha.onibus_viacao} onChange={(e) => atualizarLinha(idx, "onibus_viacao", e.target.value)} style={campoErroStyle(false)} />
              </Campo>
              <Campo label="Percurso">
                <input type="text" value={linha.percurso} onChange={(e) => atualizarLinha(idx, "percurso", e.target.value)} placeholder="Ex: Terminal Centro - Bairro X" style={campoErroStyle(false)} />
              </Campo>
              <Campo label="Valor unitário (R$)">
                <CampoMoeda value={linha.valor_unitario} onChange={(v) => atualizarLinha(idx, "valor_unitario", v > 0 ? String(v) : "")} style={campoErroStyle(false)} />
              </Campo>
              <Campo label="Valor total diário (R$)">
                <CampoMoeda value={linha.valor_total_diario} onChange={(v) => atualizarLinha(idx, "valor_total_diario", v > 0 ? String(v) : "")} style={campoErroStyle(false)} />
              </Campo>
            </div>
          ))}

          {linhas.length < 2 && (
            <button onClick={adicionarLinha} style={{ ...botaoSecundarioStyle, marginTop: 4 }}>
              + Adicionar linha
            </button>
          )}
        </div>
      )}
    </div>
  );
}
