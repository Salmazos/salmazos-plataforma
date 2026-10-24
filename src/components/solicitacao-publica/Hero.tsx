"use client";

import { useState } from "react";
import ImagemMarca from "./ImagemMarca";
import { MARCA } from "./marca";

// Desktop: texto à esquerda sobre a foto (terço esquerdo escuro e limpo) com degradê preto da esquerda para a direita.
// Celular: texto em cima, foto embaixo com degradê preto de cima para baixo; o título nunca cobre os rostos.
// Sem a foto: fundo preto com detalhes amarelos.
export default function Hero({ nomeEmpresa, carregando }: { nomeEmpresa: string | null; carregando: boolean }) {
  const [semImagem, setSemImagem] = useState(false);

  return (
    <header className="relative isolate flex flex-col overflow-hidden bg-black text-white">
      {semImagem && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#FFD700]/15 blur-3xl" />
          <div className="absolute bottom-0 right-0 hidden h-1.5 w-1/3 bg-[#FFD700] md:block" />
        </div>
      )}

      <div className="relative z-10 order-1 mx-auto w-full max-w-6xl px-4 pb-8 pt-6 md:px-8 md:pb-20 md:pt-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARCA.logoAmarelo} alt="Salmazos RH" className="h-12 w-auto" />
        <div className="mt-8 max-w-xl md:mt-16">
          <span aria-hidden="true" className="mb-4 block h-1 w-16 rounded-full bg-[#FFD700]" />
          {/* A linha da saudação ocupa o mesmo espaço antes e depois de a API responder, para o título não pular. */}
          <p className={`mb-2 min-h-[28px] break-words text-lg font-semibold text-[#FFD700] ${carregando ? "invisible" : ""}`}>
            {nomeEmpresa ? `Olá, ${nomeEmpresa}!` : "Olá!"}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl md:text-5xl">
            Vamos encontrar o profissional certo para a sua empresa.
          </h1>
          <p className="mt-4 text-lg text-gray-200">
            Leva cerca de 5 minutos. Assim que recebermos, nossa equipe começa a busca.
          </p>
          <a
            href="#formulario"
            className="mt-6 inline-flex min-h-[52px] items-center justify-center rounded-xl bg-[#FFD700] px-8 text-base font-bold text-black hover:bg-[#FFB800] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD700]"
          >
            Começar agora
          </a>
        </div>
      </div>

      {!semImagem && (
        <div className="relative order-2 h-[340px] w-full md:absolute md:inset-0 md:-z-10 md:h-auto">
          <ImagemMarca prioridade onFalha={() => setSemImagem(true)} className="h-full w-full object-cover object-center md:object-right" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black via-black/30 to-transparent md:hidden" />
          <div aria-hidden="true" className="absolute inset-0 hidden bg-gradient-to-r from-black via-black/85 to-transparent md:block" />
          {/* Entre 768 e 1023px o texto ocupa quase a largura toda e o degradê sozinho não garante contraste 4,5:1 no subtítulo. */}
          <div aria-hidden="true" className="absolute inset-0 hidden bg-black/40 md:block lg:hidden" />
        </div>
      )}
    </header>
  );
}
