"use client";

import { useState } from "react";
import { RodapePublico } from "./BlocosInformativos";
import ConteudoEnviado from "./ConteudoEnviado";
import ImagemMarca from "./ImagemMarca";

// Confirmação do link público: o invólucro do site (fundo com a foto em opacidade baixa, cartão e rodapé) em volta do ConteudoEnviado, que não
// mostra dados do cliente nem link para o portal.
export default function TelaSucesso({ prazoDiasUteis }: { prazoDiasUteis: number }) {
  const [semImagem, setSemImagem] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
        {!semImagem && (
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <ImagemMarca alt="" onFalha={() => setSemImagem(true)} className="h-full w-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-black/60" />
          </div>
        )}
        <div className="sp-subir w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-xl sm:p-8">
          <ConteudoEnviado prazoDiasUteis={prazoDiasUteis} />
        </div>
      </main>
      <RodapePublico />
    </div>
  );
}
