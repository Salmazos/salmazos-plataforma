"use client";

import type { FloatBarState } from "@/hooks/useScrollHorizontalSincronizado";

interface Props {
  floatBar: FloatBarState;
  floatScrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

// Renderização da barra flutuante fixa no rodapé — comportamento vem de useScrollHorizontalSincronizado.
export default function BarraScrollFlutuante({ floatBar, floatScrollRef, onScroll }: Props) {
  if (!floatBar.visible) return null;

  return (
    <div
      ref={floatScrollRef}
      onScroll={onScroll}
      style={{
        position: "fixed",
        bottom: 0,
        left: floatBar.left,
        width: floatBar.width,
        height: 14,
        overflowX: "auto",
        overflowY: "hidden",
        zIndex: 50,
        background: "#F9FAFB",
        borderTop: "1px solid #E5E7EB",
      }}
    >
      <div style={{ width: floatBar.innerW, height: 1 }} />
    </div>
  );
}
