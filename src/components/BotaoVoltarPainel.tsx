"use client";

import { useRouter } from "next/navigation";

export default function BotaoVoltarPainel() {
  const router = useRouter();

  function handleClick() {
    // Se o usuário chegou direto nessa página (aba nova, link externo, etc),
    // não há histórico dentro do site pra voltar — cai no fallback /painel.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/painel");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hover:text-[#FFB800] transition-colors"
    >
      ← Voltar ao painel
    </button>
  );
}
