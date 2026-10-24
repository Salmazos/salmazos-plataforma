"use client";

import { useState } from "react";
import { RodapePublico } from "./BlocosInformativos";
import ImagemMarca from "./ImagemMarca";
import { MARCA } from "./marca";

// Confirmação: sem dados do cliente na tela e sem link para o portal. A foto aparece só como fundo discreto (opacidade baixa).
export default function TelaSucesso({ prazoDiasUteis }: { prazoDiasUteis: number }) {
  const [semImagem, setSemImagem] = useState(false);
  const etapas = [
    { titulo: "Análise pela equipe", texto: "Revisamos os dados da sua solicitação." },
    { titulo: "Publicação da vaga", texto: "Divulgamos a vaga nos nossos canais de captação." },
    { titulo: `Currículos em até ${prazoDiasUteis} dias úteis`, texto: "Você recebe os candidatos que combinam com o perfil pedido." },
  ];
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
          <div className="sp-pop mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-black" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#FFD700" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path className="sp-draw" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 role="status" className="mt-5 text-2xl font-extrabold text-gray-900 sm:text-3xl">Recebemos sua solicitação!</h1>
          <p className="mt-2 text-base text-gray-700">A equipe Salmazos vai analisar e entrar em contato.</p>

          <h2 className="mt-8 text-left text-xs font-bold uppercase tracking-widest text-gray-700">O que acontece agora</h2>
          <ol className="mt-3 space-y-4 text-left">
            {etapas.map((e, i) => (
              <li key={e.titulo} className="flex gap-3">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-[#FFD700]">{i + 1}</span>
                <div>
                  <p className="text-base font-bold text-gray-900">{e.titulo}</p>
                  <p className="text-sm text-gray-700">{e.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-gray-600">Você já pode fechar esta página. Obrigado por escolher a {MARCA.nome}.</p>
        </div>
      </main>
      <RodapePublico />
    </div>
  );
}
