"use client";

import { formatarTelefone } from "@/lib/utils";

interface CampoTelefoneProps {
  value: string;
  onChange: (valorFormatado: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

// Formata (xx) xxxxx-xxxx enquanto digita, reusando o mesmo formatarTelefone já usado
// em outros formulários (FormularioCadastro, candidatura pública, etc.) — aqui embalado
// como componente, no mesmo espírito do CampoMoeda.
export default function CampoTelefone({ value, onChange, placeholder, className, style, disabled }: CampoTelefoneProps) {
  return (
    <input
      type="text"
      inputMode="tel"
      value={value}
      onChange={(e) => onChange(formatarTelefone(e.target.value))}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
    />
  );
}
