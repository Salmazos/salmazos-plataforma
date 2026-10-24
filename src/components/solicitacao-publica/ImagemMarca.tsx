"use client";

import { useEffect, useRef } from "react";
import { MARCA } from "./marca";

// Imagem de marca (hero-desktop.webp a partir de 768px e hero-mobile.webp abaixo disso, ambos em public/solicitar-vaga/; ver marca.ts). Um só <picture>, para o navegador
// baixar apenas a versão certa. Arquivo ausente ou com erro: avisa quem chamou (onFalha) e não desenha nada, sem quebrar a página.
export default function ImagemMarca({
  className = "",
  prioridade = false,
  onFalha,
  alt = MARCA.heroAlt,
}: {
  className?: string;
  prioridade?: boolean;
  onFalha: () => void;
  alt?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);

  // Se o erro de carregamento aconteceu antes da hidratação, o onError do React não dispara: confere aqui.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) onFalha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={MARCA.heroMobile} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={MARCA.heroDesktop}
        alt={alt}
        className={className}
        fetchPriority={prioridade ? "high" : "auto"}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
        sizes="(max-width: 767px) 100vw, 100vw"
        onError={onFalha}
      />
    </picture>
  );
}
