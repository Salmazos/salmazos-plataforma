"use client";

import { useState } from "react";

// "Compartilhar" do painel de vagas: copia o link público da vaga. Vaga PRIVADA (visivel_publicamente=false) não tem página pública
// (a página /vagas/[slug] devolve 404 para ela), então o botão some e o painel explica por quê, em vez de copiar um link que não abre.
export const TEXTO_VAGA_PRIVADA = "Vaga privada: não tem página pública, por isso não há link para compartilhar.";

interface Props {
  vagaId: string;
  // false = privada. Ausente/true = pública (padrão do banco).
  visivelPublicamente?: boolean | null;
}

export default function BotaoCompartilharVaga({ vagaId, visivelPublicamente }: Props) {
  const [linkCopiado, setLinkCopiado] = useState(false);

  if (visivelPublicamente === false) {
    return <span className="text-xs text-gray-500 max-w-[220px] leading-snug">{TEXTO_VAGA_PRIVADA}</span>;
  }

  const copiar = () => {
    const url = window.location.origin + "/vagas/" + vagaId;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    });
  };

  return (
    <button
      onClick={copiar}
      className="text-sm px-3 py-2 rounded-lg font-semibold transition-colors"
      style={{ backgroundColor: linkCopiado ? "#16a34a" : "#f3f4f6", color: linkCopiado ? "#fff" : "#374151" }}
    >
      {linkCopiado ? "✓ Link copiado!" : "🔗 Compartilhar"}
    </button>
  );
}
