"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface FloatBarState {
  visible: boolean;
  left: number;
  width: number;
  innerW: number;
}

// Sincroniza uma barra de rolagem horizontal flutuante (fixa no rodapé da viewport)
// com o scroll de um container cujo conteúdo estoura a largura da tela — extraído do
// Banco de Candidatos (tabela) para reuso também no Kanban (colunas).
export function useScrollHorizontalSincronizado() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const floatScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const [floatBar, setFloatBar] = useState<FloatBarState>({ visible: false, left: 0, width: 0, innerW: 0 });

  const refreshFloatBar = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const visible = el.scrollWidth > el.clientWidth && rect.top < window.innerHeight && rect.bottom > 0;
    setFloatBar((prev) => {
      const next = { visible, left: rect.left, width: rect.width, innerW: el.scrollWidth };
      if (prev.visible === next.visible && prev.left === next.left && prev.width === next.width && prev.innerW === next.innerW) return prev;
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    const el = scrollRef.current;
    const float = floatScrollRef.current;
    if (el && float && float.scrollLeft !== el.scrollLeft) {
      isSyncingRef.current = true;
      float.scrollLeft = el.scrollLeft;
      isSyncingRef.current = false;
    }
    refreshFloatBar();
  }, [refreshFloatBar]);

  const handleFloatScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    const el = scrollRef.current;
    const float = floatScrollRef.current;
    if (el && float && el.scrollLeft !== float.scrollLeft) {
      isSyncingRef.current = true;
      el.scrollLeft = float.scrollLeft;
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    refreshFloatBar();
    const ro = new ResizeObserver(refreshFloatBar);
    ro.observe(el);
    const io = new IntersectionObserver(refreshFloatBar, { threshold: 0 });
    io.observe(el);
    window.addEventListener("scroll", refreshFloatBar, { passive: true });
    window.addEventListener("resize", refreshFloatBar, { passive: true });
    return () => {
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("scroll", refreshFloatBar);
      window.removeEventListener("resize", refreshFloatBar);
    };
  }, [refreshFloatBar]);

  useEffect(() => {
    if (floatBar.visible && floatScrollRef.current && scrollRef.current) {
      floatScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }, [floatBar.visible]);

  return { scrollRef, floatScrollRef, floatBar, handleScroll, handleFloatScroll };
}
