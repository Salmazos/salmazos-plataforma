"use client";

import type { FormState } from "./AdmissaoFormClient";
import Campo from "./Campo";
import { campoErroStyle, cardStyle, infoBoxStyle } from "./styles";
import { BANCOS } from "@/lib/admissaoConstants";

interface Props {
  form: FormState;
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void;
  errosVisiveis: Set<string>;
}

export default function PassoDadosBancarios({ form, setCampo, errosVisiveis }: Props) {
  const erro = (campo: keyof FormState) => errosVisiveis.has(campo);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Dados Bancários</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Para o pagamento do seu salário.</p>

      <div style={{ ...infoBoxStyle, marginBottom: 16 }}>
        Estes dados são utilizados exclusivamente para pagamento de salário e não serão compartilhados com terceiros.
      </div>

      <Campo label="Banco" required erro={erro("banco")}>
        <select value={form.banco} onChange={(e) => setCampo("banco", e.target.value)} style={campoErroStyle(erro("banco"))}>
          <option value="" disabled>Selecione...</option>
          {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Campo>

      <Campo label="Agência" required erro={erro("agencia")}>
        <input type="text" inputMode="numeric" value={form.agencia} onChange={(e) => setCampo("agencia", e.target.value)} style={campoErroStyle(erro("agencia"))} />
      </Campo>

      <Campo label="Conta (com dígito)" required erro={erro("conta")}>
        <input type="text" value={form.conta} onChange={(e) => setCampo("conta", e.target.value)} style={campoErroStyle(erro("conta"))} />
      </Campo>

      <Campo label="Tipo de conta" required erro={erro("tipo_conta")}>
        <div style={{ display: "flex", gap: 20 }}>
          {[{ v: "corrente", l: "Conta Corrente" }, { v: "poupanca", l: "Conta Poupança" }].map((opt) => (
            <label key={opt.v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, minHeight: 44 }}>
              <input
                type="radio" name="tipo_conta" checked={form.tipo_conta === opt.v}
                onChange={() => setCampo("tipo_conta", opt.v)}
                style={{ width: 20, height: 20 }}
              />
              {opt.l}
            </label>
          ))}
        </div>
      </Campo>
    </div>
  );
}
