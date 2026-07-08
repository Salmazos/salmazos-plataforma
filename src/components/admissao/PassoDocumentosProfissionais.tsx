"use client";

import type { FormState } from "./AdmissaoFormClient";
import Campo from "./Campo";
import { campoErroStyle, cardStyle } from "./styles";
import { ESTADOS } from "@/lib/constants";
import { CNH_CATEGORIAS } from "@/lib/admissaoConstants";

interface Props {
  form: FormState;
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void;
  errosVisiveis: Set<string>;
  isMotorista: boolean;
  setIsMotorista: (v: boolean) => void;
}

export default function PassoDocumentosProfissionais({ form, setCampo, errosVisiveis, isMotorista, setIsMotorista }: Props) {
  const erro = (campo: keyof FormState) => errosVisiveis.has(campo);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Documentos Profissionais</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Dados dos seus documentos trabalhistas.</p>

      <Campo label="PIS/PASEP" required erro={erro("pis_pasep")}>
        <input type="text" inputMode="numeric" value={form.pis_pasep} onChange={(e) => setCampo("pis_pasep", e.target.value)} style={campoErroStyle(erro("pis_pasep"))} />
      </Campo>

      <Campo label="Data de cadastramento do PIS">
        <input type="date" value={form.pis_data_cadastramento} onChange={(e) => setCampo("pis_data_cadastramento", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 8, paddingTop: 16, marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, minHeight: 44, cursor: "pointer" }}>
          <input
            type="checkbox" checked={form.possui_ctps_digital}
            onChange={(e) => setCampo("possui_ctps_digital", e.target.checked)}
            style={{ width: 22, height: 22 }}
          />
          Possuo CTPS Digital (vinculada ao CPF)
        </label>
      </div>

      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 8px" }}>
        Se você ainda tiver a Carteira de Trabalho física (modelo antigo), preencha os dados abaixo. Não é obrigatório.
      </p>

      <Campo label="Número da Carteira de Trabalho (física)">
        <input type="text" value={form.carteira_trabalho_numero} onChange={(e) => setCampo("carteira_trabalho_numero", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      <Campo label="Série da Carteira de Trabalho (física)">
        <input type="text" value={form.carteira_trabalho_serie} onChange={(e) => setCampo("carteira_trabalho_serie", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      <Campo label="UF da Carteira de Trabalho (física)">
        <select value={form.carteira_trabalho_uf} onChange={(e) => setCampo("carteira_trabalho_uf", e.target.value)} style={campoErroStyle(false)}>
          <option value="" disabled>Selecione...</option>
          {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
        </select>
      </Campo>

      <Campo label="Data de emissão da Carteira de Trabalho (física)">
        <input type="date" value={form.ctps_data_emissao} onChange={(e) => setCampo("ctps_data_emissao", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      <Campo label="Título de eleitor" required erro={erro("titulo_eleitor")}>
        <input type="text" inputMode="numeric" value={form.titulo_eleitor} onChange={(e) => setCampo("titulo_eleitor", e.target.value)} style={campoErroStyle(erro("titulo_eleitor"))} />
      </Campo>

      <Campo label="Zona eleitoral">
        <input type="text" inputMode="numeric" value={form.zona_eleitoral} onChange={(e) => setCampo("zona_eleitoral", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      <Campo label="Seção eleitoral">
        <input type="text" inputMode="numeric" value={form.secao_eleitoral} onChange={(e) => setCampo("secao_eleitoral", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      {form.sexo === "M" && (
        <Campo label="Certificado de reservista" required erro={erro("reservista")}>
          <input type="text" value={form.reservista} onChange={(e) => setCampo("reservista", e.target.value)} style={campoErroStyle(erro("reservista"))} />
        </Campo>
      )}

      <div style={{ borderTop: "1px solid #F3F4F6", marginTop: 8, paddingTop: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, minHeight: 44, cursor: "pointer" }}>
          <input
            type="checkbox" checked={isMotorista}
            onChange={(e) => setIsMotorista(e.target.checked)}
            style={{ width: 22, height: 22 }}
          />
          Sou motorista profissional
        </label>

        {isMotorista && (
          <div style={{ marginTop: 12 }}>
            <Campo label="Número da CNH" required erro={erro("cnh_numero")}>
              <input type="text" inputMode="numeric" value={form.cnh_numero} onChange={(e) => setCampo("cnh_numero", e.target.value)} style={campoErroStyle(erro("cnh_numero"))} />
            </Campo>
            <Campo label="Categoria da CNH" required erro={erro("cnh_categoria")}>
              <select value={form.cnh_categoria} onChange={(e) => setCampo("cnh_categoria", e.target.value)} style={campoErroStyle(erro("cnh_categoria"))}>
                <option value="" disabled>Selecione...</option>
                {CNH_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
            <Campo label="Validade da CNH" required erro={erro("cnh_validade")}>
              <input type="date" value={form.cnh_validade} onChange={(e) => setCampo("cnh_validade", e.target.value)} style={campoErroStyle(erro("cnh_validade"))} />
            </Campo>
            <Campo label="Data de emissão da CNH">
              <input type="date" value={form.cnh_data_emissao} onChange={(e) => setCampo("cnh_data_emissao", e.target.value)} style={campoErroStyle(false)} />
            </Campo>
            <Campo label="UF da CNH">
              <select value={form.cnh_uf} onChange={(e) => setCampo("cnh_uf", e.target.value)} style={campoErroStyle(false)}>
                <option value="" disabled>Selecione...</option>
                {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
              </select>
            </Campo>
          </div>
        )}
      </div>
    </div>
  );
}
