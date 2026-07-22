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
      className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
    >
      <span className="text-base font-bold">←</span>
      Voltar
    </button>
  );
}
