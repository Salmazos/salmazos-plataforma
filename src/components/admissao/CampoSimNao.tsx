"use client";

import Campo from "./Campo";

interface Props {
  label: string;
  valor: string; // "sim" | "nao" | ""
  onChange: (v: string) => void;
  erro: boolean;
}

export default function CampoSimNao({ label, valor, onChange, erro }: Props) {
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
