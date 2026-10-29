"use client";

import { ROTULO_BUCKET_FATURAMENTO, UNIDADES_FATURAMENTO } from "@/lib/unidadeFaturamento";

interface Props {
  value: string;
  onChange: (valor: string) => void;
  // Criação: obrigatório (sem a opção "A definir"). Edição: pode voltar para "a definir".
  obrigatorio: boolean;
}

export default function CampoUnidadeFaturamento({ value, onChange, obrigatorio }: Props) {
  return (
    <div>
      <label className="label">Unidade de faturamento{obrigatorio ? " *" : ""}</label>
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{obrigatorio ? "Selecione..." : ROTULO_BUCKET_FATURAMENTO.a_definir}</option>
        {UNIDADES_FATURAMENTO.map((u) => (
          <option key={u} value={u}>
            {ROTULO_BUCKET_FATURAMENTO[u]}
          </option>
        ))}
      </select>
    </div>
  );
}
