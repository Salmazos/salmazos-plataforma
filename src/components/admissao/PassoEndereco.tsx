"use client";

import { useState } from "react";
import type { FormState } from "./AdmissaoFormClient";
import Campo from "./Campo";
import { campoErroStyle, cardStyle } from "./styles";
import { ESTADOS } from "@/lib/constants";
import { formatarTelefone } from "@/lib/utils";
import { buscarCep } from "@/lib/viacep";

interface Props {
  form: FormState;
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void;
  errosVisiveis: Set<string>;
}

export default function PassoEndereco({ form, setCampo, errosVisiveis }: Props) {
  const erro = (campo: keyof FormState) => errosVisiveis.has(campo);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const handleCepBlur = async () => {
    const digits = form.endereco_cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const endereco = await buscarCep(digits);
      if (endereco) {
        setCampo("endereco_logradouro", endereco.logradouro);
        setCampo("endereco_bairro", endereco.bairro);
        setCampo("endereco_cidade", endereco.cidade);
        setCampo("endereco_uf", endereco.uf);
      }
    } finally {
      setBuscandoCep(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Endereço e Contato</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Onde você mora e como podemos falar com você.</p>

      <Campo label="CEP" required erro={erro("endereco_cep")}>
        <input
          type="text" inputMode="numeric" value={form.endereco_cep}
          onChange={(e) => setCampo("endereco_cep", e.target.value.replace(/\D/g, "").slice(0, 8))}
          onBlur={handleCepBlur}
          style={campoErroStyle(erro("endereco_cep"))}
        />
        {buscandoCep && <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Buscando endereço...</p>}
      </Campo>

      <Campo label="Logradouro (rua/avenida)" required erro={erro("endereco_logradouro")}>
        <input type="text" value={form.endereco_logradouro} onChange={(e) => setCampo("endereco_logradouro", e.target.value)} style={campoErroStyle(erro("endereco_logradouro"))} />
      </Campo>

      <Campo label="Número" required erro={erro("endereco_numero")}>
        <input type="text" inputMode="numeric" value={form.endereco_numero} onChange={(e) => setCampo("endereco_numero", e.target.value)} style={campoErroStyle(erro("endereco_numero"))} />
      </Campo>

      <Campo label="Complemento">
        <input type="text" value={form.endereco_complemento} onChange={(e) => setCampo("endereco_complemento", e.target.value)} style={campoErroStyle(false)} />
      </Campo>

      <Campo label="Bairro" required erro={erro("endereco_bairro")}>
        <input type="text" value={form.endereco_bairro} onChange={(e) => setCampo("endereco_bairro", e.target.value)} style={campoErroStyle(erro("endereco_bairro"))} />
      </Campo>

      <Campo label="Cidade" required erro={erro("endereco_cidade")}>
        <input type="text" value={form.endereco_cidade} onChange={(e) => setCampo("endereco_cidade", e.target.value)} style={campoErroStyle(erro("endereco_cidade"))} />
      </Campo>

      <Campo label="Estado" required erro={erro("endereco_uf")}>
        <select value={form.endereco_uf} onChange={(e) => setCampo("endereco_uf", e.target.value)} style={campoErroStyle(erro("endereco_uf"))}>
          <option value="" disabled>Selecione...</option>
          {ESTADOS.map((e) => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
        </select>
      </Campo>

      <Campo label="Telefone (com WhatsApp)" required erro={erro("telefone")}>
        <input
          type="tel" inputMode="numeric" value={form.telefone}
          onChange={(e) => setCampo("telefone", formatarTelefone(e.target.value))}
          placeholder="(00) 00000-0000"
          style={campoErroStyle(erro("telefone"))}
        />
      </Campo>

      <Campo label="E-mail" required erro={erro("email")}>
        <input type="email" inputMode="email" value={form.email} onChange={(e) => setCampo("email", e.target.value)} style={campoErroStyle(erro("email"))} />
      </Campo>
    </div>
  );
}
