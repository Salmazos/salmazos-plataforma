"use client";

import { useState } from "react";
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

  // "Outro" precisa de um modo local só pra saber que o select está nessa opção mesmo
  // com o texto ainda vazio — o valor final continua indo direto pro campo banco (mesmo
  // raciocínio do modo "outros" em Dias que irá trabalhar, no Vale Transporte).
  const [bancoModo, setBancoModo] = useState<"lista" | "outro">(() =>
    form.banco && !BANCOS.includes(form.banco) ? "outro" : "lista"
  );
  const [bancoPortabilidadeModo, setBancoPortabilidadeModo] = useState<"lista" | "outro">(() =>
    form.banco_portabilidade && !BANCOS.includes(form.banco_portabilidade) ? "outro" : "lista"
  );

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Dados Bancários</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Para o pagamento do seu salário.</p>

      <div style={{ ...infoBoxStyle, marginBottom: 16 }}>
        Estes dados são utilizados exclusivamente para pagamento de salário e não serão compartilhados com terceiros.
      </div>

      <Campo label="Banco" required erro={erro("banco")}>
        <select
          value={bancoModo === "outro" ? "outro" : form.banco}
          onChange={(e) => {
            if (e.target.value === "outro") { setBancoModo("outro"); setCampo("banco", ""); }
            else { setBancoModo("lista"); setCampo("banco", e.target.value); }
          }}
          style={campoErroStyle(erro("banco"))}
        >
          <option value="" disabled>Selecione...</option>
          {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value="outro">Outro (não está na lista)</option>
        </select>
        {bancoModo === "outro" && (
          <input
            type="text" value={form.banco}
            onChange={(e) => setCampo("banco", e.target.value)}
            placeholder="Digite o nome do banco"
            style={{ ...campoErroStyle(erro("banco")), marginTop: 8 }}
          />
        )}
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

      <Campo label="Chave PIX">
        <input type="text" value={form.pix} onChange={(e) => setCampo("pix", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      {/* Portabilidade de salário — conceito separado do cadastro bancário geral acima:
          o candidato pode ter conta em outro banco e querer portar o salário só pra ela. */}
      <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 20, paddingTop: 16 }}>
        <Campo label="Deseja portar seu salário para uma conta bancária que você já possui?">
          <div style={{ display: "flex", gap: 20 }}>
            {[{ v: true, l: "Sim" }, { v: false, l: "Não" }].map((opt) => (
              <label key={String(opt.v)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, minHeight: 44 }}>
                <input
                  type="radio" name="deseja_portabilidade_salario"
                  checked={form.deseja_portabilidade_salario === opt.v}
                  onChange={() => setCampo("deseja_portabilidade_salario", opt.v)}
                  style={{ width: 20, height: 20 }}
                />
                {opt.l}
              </label>
            ))}
          </div>
        </Campo>

        {form.deseja_portabilidade_salario && (
          <div style={{ background: "#F5F4FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
            <p style={{ fontSize: 13, color: "#5B21B6", margin: "0 0 12px", lineHeight: 1.5 }}>
              Essa é a conta para onde seu salário será portado. Pode ser diferente da conta informada acima.
            </p>

            <Campo label="Banco (portabilidade)" required erro={erro("banco_portabilidade")}>
              <select
                value={bancoPortabilidadeModo === "outro" ? "outro" : form.banco_portabilidade}
                onChange={(e) => {
                  if (e.target.value === "outro") { setBancoPortabilidadeModo("outro"); setCampo("banco_portabilidade", ""); }
                  else { setBancoPortabilidadeModo("lista"); setCampo("banco_portabilidade", e.target.value); }
                }}
                style={campoErroStyle(erro("banco_portabilidade"))}
              >
                <option value="" disabled>Selecione...</option>
                {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="outro">Outro (não está na lista)</option>
              </select>
              {bancoPortabilidadeModo === "outro" && (
                <input
                  type="text" value={form.banco_portabilidade}
                  onChange={(e) => setCampo("banco_portabilidade", e.target.value)}
                  placeholder="Digite o nome do banco"
                  style={{ ...campoErroStyle(erro("banco_portabilidade")), marginTop: 8 }}
                />
              )}
            </Campo>

            <Campo label="Agência (portabilidade)" required erro={erro("agencia_portabilidade")}>
              <input
                type="text" inputMode="numeric" value={form.agencia_portabilidade}
                onChange={(e) => setCampo("agencia_portabilidade", e.target.value)}
                style={campoErroStyle(erro("agencia_portabilidade"))}
              />
            </Campo>

            <Campo label="Conta (portabilidade, com dígito)" required erro={erro("conta_portabilidade")}>
              <input
                type="text" value={form.conta_portabilidade}
                onChange={(e) => setCampo("conta_portabilidade", e.target.value)}
                style={campoErroStyle(erro("conta_portabilidade"))}
              />
            </Campo>

            <Campo label="Tipo de conta (portabilidade)" required erro={erro("tipo_conta_portabilidade")}>
              <div style={{ display: "flex", gap: 20 }}>
                {[{ v: "corrente", l: "Conta Corrente" }, { v: "poupanca", l: "Conta Poupança" }].map((opt) => (
                  <label key={opt.v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, minHeight: 44 }}>
                    <input
                      type="radio" name="tipo_conta_portabilidade" checked={form.tipo_conta_portabilidade === opt.v}
                      onChange={() => setCampo("tipo_conta_portabilidade", opt.v)}
                      style={{ width: 20, height: 20 }}
                    />
                    {opt.l}
                  </label>
                ))}
              </div>
            </Campo>
          </div>
        )}
      </div>
    </div>
  );
}
