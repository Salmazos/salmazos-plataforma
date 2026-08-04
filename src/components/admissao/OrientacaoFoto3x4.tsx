"use client";

import type { CSSProperties } from "react";
import { ORIENTACAO_FOTO_3X4_PRINCIPAL, ORIENTACAO_FOTO_3X4_COMPLEMENTO } from "@/lib/admissaoConstants";

// Bloco de destaque (fundo dourado clarinho, ícone à esquerda, frase principal em negrito
// + complemento discreto) pra orientação da selfie 3x4 — reaproveitado no card desktop
// (PassoUploadDocumentos, card com QR) e na tela de escolha mobile (CapturaComEnquadramento,
// antes de abrir a câmera), pra não divergir se um dos dois for editado sem o outro.
export default function OrientacaoFoto3x4({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: "#FFFBEA", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px",
        ...style,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>📸</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", margin: 0, lineHeight: 1.4 }}>{ORIENTACAO_FOTO_3X4_PRINCIPAL}</p>
        <p style={{ fontSize: 12, fontWeight: 500, color: "#B45309", margin: "2px 0 0", lineHeight: 1.4 }}>{ORIENTACAO_FOTO_3X4_COMPLEMENTO}</p>
      </div>
    </div>
  );
}
