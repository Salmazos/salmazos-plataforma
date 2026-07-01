import type { CSSProperties } from "react";

// Requisitos mobile-first: alvo de toque >= 44px, fonte >= 16px (evita zoom automático no iOS).

export const campoStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  fontSize: 16,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  outline: "none",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

export function campoErroStyle(temErro: boolean): CSSProperties {
  return temErro ? { ...campoStyle, borderColor: "#DC2626", boxShadow: "0 0 0 1px #DC2626" } : campoStyle;
}

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};

export const campoWrapStyle: CSSProperties = { marginBottom: 16 };

export const botaoPrimarioStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  fontSize: 16,
  fontWeight: 700,
  borderRadius: 12,
  border: "none",
  background: "#000",
  color: "#FFD700",
  cursor: "pointer",
};

export const botaoSecundarioStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 12,
  border: "1px solid #D1D5DB",
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
};

export const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  border: "1px solid #F3F4F6",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

export const infoBoxStyle: CSSProperties = {
  background: "#EFF6FF",
  border: "1px solid #BFDBFE",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 13,
  color: "#1E40AF",
  lineHeight: 1.5,
};

export const erroTextStyle: CSSProperties = {
  color: "#DC2626",
  fontSize: 12,
  marginTop: 4,
};
