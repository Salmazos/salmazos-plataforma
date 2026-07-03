"use client";

import type { FormState } from "./AdmissaoFormClient";
import Campo from "./Campo";
import { campoErroStyle, cardStyle } from "./styles";
import { formatarCPF } from "@/lib/utils";
import { ESTADOS } from "@/lib/constants";
import { ESTADO_CIVIL_OPTIONS, GRAU_INSTRUCAO_OPTIONS, COR_RACA_OPTIONS } from "@/lib/admissaoConstants";

interface Props {
  form: FormState;
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void;
  errosVisiveis: Set<string>;
}

export default function PassoDadosPessoais({ form, setCampo, errosVisiveis }: Props) {
  const erro = (campo: keyof FormState) => errosVisiveis.has(campo);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Dados Pessoais</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Preencha com os dados do seu documento de identidade.</p>

      <Campo label="Nome completo" required erro={erro("nome_completo")}>
        <input
          type="text" value={form.nome_completo}
          onChange={(e) => setCampo("nome_completo", e.target.value)}
          style={campoErroStyle(erro("nome_completo"))}
        />
      </Campo>

      <Campo label="Data de nascimento" required erro={erro("data_nascimento")}>
        <input
          type="date" value={form.data_nascimento}
          onChange={(e) => setCampo("data_nascimento", e.target.value)}
          style={campoErroStyle(erro("data_nascimento"))}
        />
      </Campo>

      <Campo label="Sexo" required erro={erro("sexo")}>
        <div style={{ display: "flex", gap: 20 }}>
          {[{ v: "M", l: "Masculino" }, { v: "F", l: "Feminino" }].map((opt) => (
            <label key={opt.v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, minHeight: 44 }}>
              <input
                type="radio" name="sexo" checked={form.sexo === opt.v}
                onChange={() => setCampo("sexo", opt.v)}
                style={{ width: 20, height: 20 }}
              />
              {opt.l}
            </label>
          ))}
        </div>
      </Campo>

      <Campo label="Estado civil" required erro={erro("estado_civil")}>
        <select
          value={form.estado_civil} onChange={(e) => setCampo("estado_civil", e.target.value)}
          style={campoErroStyle(erro("estado_civil"))}
        >
          <option value="" disabled>Selecione...</option>
          {ESTADO_CIVIL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Campo>

      <Campo label="Nacionalidade">
        <input
          type="text" value={form.nacionalidade}
          onChange={(e) => setCampo("nacionalidade", e.target.value)}
          style={campoErroStyle(false)}
        />
      </Campo>

      <Campo label="Naturalidade (cidade onde nasceu)" required erro={erro("naturalidade")}>
        <input
          type="text" value={form.naturalidade}
          onChange={(e) => setCampo("naturalidade", e.target.value)}
          style={campoErroStyle(erro("naturalidade"))}
        />
      </Campo>

      <Campo label="País de nascimento">
        <input
          type="text" value={form.pais_nascimento}
          onChange={(e) => setCampo("pais_nascimento", e.target.value)}
          style={campoErroStyle(false)}
        />
      </Campo>

      <Campo label="Cor/Raça">
        <select
          value={form.cor_raca} onChange={(e) => setCampo("cor_raca", e.target.value)}
          style={campoErroStyle(false)}
        >
          <option value="" disabled>Selecione...</option>
          {COR_RACA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Campo>

      <Campo label="CPF" required erro={erro("cpf")}>
        <input
          type="text" inputMode="numeric" value={form.cpf}
          onChange={(e) => setCampo("cpf", formatarCPF(e.target.value))}
          style={campoErroStyle(erro("cpf"))}
        />
      </Campo>

      <Campo label="Número do RG" required erro={erro("rg_numero")}>
        <input
          type="text" value={form.rg_numero}
          onChange={(e) => setCampo("rg_numero", e.target.value)}
          style={campoErroStyle(erro("rg_numero"))}
        />
      </Campo>

      <Campo label="Órgão emissor do RG" required erro={erro("rg_orgao_emissor")}>
        <input
          type="text" placeholder="Ex: SSP" value={form.rg_orgao_emissor}
          onChange={(e) => setCampo("rg_orgao_emissor", e.target.value)}
          style={campoErroStyle(erro("rg_orgao_emissor"))}
        />
      </Campo>

      <Campo label="UF do RG" required erro={erro("rg_uf")}>
        <select
          value={form.rg_uf} onChange={(e) => setCampo("rg_uf", e.target.value)}
          style={campoErroStyle(erro("rg_uf"))}
        >
          <option value="" disabled>Selecione...</option>
          {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
        </select>
      </Campo>

      <Campo label="Data de emissão do RG" required erro={erro("rg_data_emissao")}>
        <input
          type="date" value={form.rg_data_emissao}
          onChange={(e) => setCampo("rg_data_emissao", e.target.value)}
          style={campoErroStyle(erro("rg_data_emissao"))}
        />
      </Campo>

      <Campo label="Nome da mãe" required erro={erro("nome_mae")}>
        <input
          type="text" value={form.nome_mae}
          onChange={(e) => setCampo("nome_mae", e.target.value)}
          style={campoErroStyle(erro("nome_mae"))}
        />
      </Campo>

      <Campo label="Nacionalidade da mãe">
        <input
          type="text" value={form.nacionalidade_mae}
          onChange={(e) => setCampo("nacionalidade_mae", e.target.value)}
          style={campoErroStyle(false)}
        />
      </Campo>

      <Campo label="Nome do pai">
        <input
          type="text" value={form.nome_pai}
          onChange={(e) => setCampo("nome_pai", e.target.value)}
          style={campoErroStyle(false)}
        />
      </Campo>

      <Campo label="Nacionalidade do pai">
        <input
          type="text" value={form.nacionalidade_pai}
          onChange={(e) => setCampo("nacionalidade_pai", e.target.value)}
          style={campoErroStyle(false)}
        />
      </Campo>

      <Campo label="Grau de instrução" required erro={erro("grau_instrucao")}>
        <select
          value={form.grau_instrucao} onChange={(e) => setCampo("grau_instrucao", e.target.value)}
          style={campoErroStyle(erro("grau_instrucao"))}
        >
          <option value="" disabled>Selecione...</option>
          {GRAU_INSTRUCAO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Campo>
    </div>
  );
}
