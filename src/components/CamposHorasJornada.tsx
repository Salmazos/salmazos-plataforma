"use client";

import type { CSSProperties } from "react";
import { type HorasJornada, type ModeloJornada, horaParaInput } from "@/lib/jornadaTrabalho";

// Horas EXTRAS das escalas com compensação (jornadaTrabalho.ts): sexta-feira reduzida (só a saída) ou sábado reduzido (entrada e saída). A entrada e a
// saída de segunda a quinta/sexta continuam nos campos que cada tela já tem. Um componente só, para todas as telas mostrarem os mesmos campos.
// Não renderiza nada para "Segunda a sexta-feira" simples nem sem escala escolhida.

interface Props {
  modelo: ModeloJornada | null;
  horas: Pick<HorasJornada, "sextaSaida" | "sabadoEntrada" | "sabadoSaida">;
  onChange: (patch: Partial<Pick<HorasJornada, "sextaSaida" | "sabadoEntrada" | "sabadoSaida">>) => void;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  labelClassName?: string;
  labelStyle?: CSSProperties;
  obrigatorio?: boolean;
}

export default function CamposHorasJornada({ modelo, horas, onChange, inputClassName, inputStyle, labelClassName, labelStyle, obrigatorio = true }: Props) {
  if (modelo !== "seg_qui_sex_reduzida" && modelo !== "seg_sex_sab_reduzido") return null;
  const ast = obrigatorio ? " *" : "";
  const campo = (rotulo: string, valor: string | undefined, aoMudar: (v: string) => void, id: string) => (
    <label className={labelClassName} style={labelStyle} htmlFor={id}>{rotulo}{ast}
      <input id={id} type="time" value={horaParaInput(valor ?? "") || (valor ?? "")} onChange={(e) => aoMudar(e.target.value)} className={inputClassName} style={inputStyle} />
    </label>
  );
  if (modelo === "seg_qui_sex_reduzida") {
    return <>{campo("Sexta-feira: saída", horas.sextaSaida, (v) => onChange({ sextaSaida: v }), "jornada-sexta-saida")}</>;
  }
  return (
    <>
      {campo("Sábado: entrada", horas.sabadoEntrada, (v) => onChange({ sabadoEntrada: v }), "jornada-sabado-entrada")}
      {campo("Sábado: saída", horas.sabadoSaida, (v) => onChange({ sabadoSaida: v }), "jornada-sabado-saida")}
    </>
  );
}
