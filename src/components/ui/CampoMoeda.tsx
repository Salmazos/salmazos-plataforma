"use client";

import { useEffect, useRef, useState } from "react";

interface CampoMoedaProps {
  value: number | string | null;
  onChange: (valorNumerico: number) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

function paraCentavos(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Math.round(value * 100);
  let cleaned = value.trim().replace(/^R\$\s?/i, "");
  if (!cleaned || /[a-zA-ZÀ-ú]/.test(cleaned)) return 0;
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function centavosParaTexto(centavos: number): string {
  if (!centavos) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Máscara estilo caixa registradora: dígitos entram pela direita, sempre 2 casas decimais.
export default function CampoMoeda({ value, onChange, placeholder, className, style, disabled }: CampoMoedaProps) {
  const [centavos, setCentavos] = useState<number>(() => paraCentavos(value));
  const ultimoValorExterno = useRef(value);

  useEffect(() => {
    if (value !== ultimoValorExterno.current) {
      ultimoValorExterno.current = value;
      setCentavos(paraCentavos(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitos = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const novoCentavos = digitos ? parseInt(digitos, 10) : 0;
    setCentavos(novoCentavos);
    const novoValor = novoCentavos / 100;
    ultimoValorExterno.current = novoValor;
    onChange(novoValor);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={centavosParaTexto(centavos)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
    />
  );
}
