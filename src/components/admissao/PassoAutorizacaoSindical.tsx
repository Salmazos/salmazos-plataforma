"use client";

import type { AutorizacaoSindicalState } from "./AdmissaoFormClient";
import Campo from "./Campo";
import { campoErroStyle, cardStyle } from "./styles";

interface Props {
  autorizacaoSindical: AutorizacaoSindicalState;
  setCampo: <K extends keyof AutorizacaoSindicalState>(campo: K, valor: AutorizacaoSindicalState[K]) => void;
  errosVisiveis: Set<string>;
}

function CampoSimNao({
  label, valor, onChange, erro,
}: { label: string; valor: string; onChange: (v: string) => void; erro: boolean }) {
  return (
    <Campo label={label} required erro={erro}>
      <div style={{ display: "flex", gap: 20 }}>
        {[{ v: "sim", l: "Sim" }, { v: "nao", l: "Não" }].map((opt) => (
          <label key={opt.v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, minHeight: 44 }}>
            <input
              type="radio" checked={valor === opt.v}
              onChange={() => onChange(opt.v)}
              style={{ width: 20, height: 20 }}
            />
            {opt.l}
          </label>
        ))}
      </div>
    </Campo>
  );
}

export default function PassoAutorizacaoSindical({ autorizacaoSindical, setCampo, errosVisiveis }: Props) {
  const erro = (campo: string) => errosVisiveis.has(campo);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Autorização Sindical</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Descontos referentes ao seu sindicato de categoria.</p>

      <Campo label="Nome do sindicato">
        <input
          type="text" value={autorizacaoSindical.nome_sindicato}
          onChange={(e) => setCampo("nome_sindicato", e.target.value)}
          placeholder="Se souber — a Salmazos pode confirmar depois"
          style={campoErroStyle(false)}
        />
      </Campo>

      <CampoSimNao
        label="Autorizo o desconto das Contribuições Assistencial e Confederativa"
        valor={autorizacaoSindical.autoriza_assistencial_confederativa}
        onChange={(v) => setCampo("autoriza_assistencial_confederativa", v)}
        erro={erro("as_assistencial")}
      />

      <CampoSimNao
        label="Autorizo o desconto da contribuição sindical"
        valor={autorizacaoSindical.autoriza_sindical}
        onChange={(v) => setCampo("autoriza_sindical", v)}
        erro={erro("as_sindical")}
      />
    </div>
  );
}
