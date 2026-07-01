"use client";

import type { ReactNode } from "react";
import { labelStyle, campoWrapStyle, erroTextStyle } from "./styles";

interface Props {
  label: string;
  required?: boolean;
  erro?: boolean;
  mensagemErro?: string;
  children: ReactNode;
}

export default function Campo({ label, required, erro, mensagemErro, children }: Props) {
  return (
    <div style={campoWrapStyle}>
      <label style={labelStyle}>
        {label}{required && " *"}
      </label>
      {children}
      {erro && <p style={erroTextStyle}>{mensagemErro || "Campo obrigatório"}</p>}
    </div>
  );
}
