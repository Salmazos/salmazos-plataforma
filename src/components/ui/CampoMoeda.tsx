"use client";

import { useEffect, useRef, useState } from "react";

interface CampoMoedaProps {
  value: number | string | null;
  onChange: (valorNumerico: number) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  permitirZero?: boolean;
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

function centavosParaTexto(centavos: number, permitirZero?: boolean): string {
  if (!centavos && !(permitirZero && centavos === 0)) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Máscara estilo caixa registradora: dígitos entram pela direita, sempre 2 casas decimais.
export default function CampoMoeda({ value, onChange, placeholder, className, style, disabled, permitirZero }: CampoMoedaProps) {
  const [centavos, setCentavos] = useState<number>(() => paraCentavos(value));
  const [preenchido, setPreenchido] = useState<boolean>(() => {
    return value !== "" && value !== null && value !== undefined && !Number.isNaN(Number(value));
  });
  const ultimoValorExterno = useRef(value);

  useEffect(() => {
    if (value !== ultimoValorExterno.current) {
      ultimoValorExterno.current = value;
      setCentavos(paraCentavos(value));
      setPreenchido(value !== "" && value !== null && value !== undefined && !Number.isNaN(Number(value)));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitos = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const novoCentavos = digitos ? parseInt(digitos, 10) : 0;
    setCentavos(novoCentavos);

    if (permitirZero) {
      if (digitos === "") {
        setPreenchido(false);
        ultimoValorExterno.current = NaN;
        onChange(NaN);
      } else {
        setPreenchido(true);
        const novoValor = novoCentavos / 100;
        ultimoValorExterno.current = novoValor;
        onChange(novoValor);
      }
    } else {
      const novoValor = novoCentavos / 100;
      ultimoValorExterno.current = novoValor;
      onChange(novoValor);
    }
  };

  const displayText = permitirZero && preenchido ? (centavosParaTexto(centavos, true) || "0,00") : centavosParaTexto(centavos, false);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayText}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
    />
  );
}
