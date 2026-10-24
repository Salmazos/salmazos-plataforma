import { MENSAGEM_LINK_INDISPONIVEL } from "@/lib/solicitacaoVagaLink";
import { RodapePublico } from "./BlocosInformativos";
import { MARCA } from "./marca";

// Link inválido, expirado, revogado ou no limite de envios: tela de marca, sem dizer o motivo técnico.
// Sem botão de WhatsApp: o projeto não tem um número comercial oficial cadastrado (ver relatório da entrega).
export default function TelaLinkIndisponivel() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARCA.logoAmarelo} alt="Salmazos RH" className="h-14 w-auto" />
        <span aria-hidden="true" className="my-8 block h-1 w-16 rounded-full bg-[#FFD700]" />
        <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">Este link não está disponível</h1>
        <p role="status" className="mt-4 text-lg text-gray-200">{MENSAGEM_LINK_INDISPONIVEL}</p>
        <a
          href={MARCA.siteInstitucional}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex min-h-[48px] items-center rounded-xl border-2 border-[#FFD700] px-6 text-base font-bold text-[#FFD700] hover:bg-[#FFD700] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD700]"
        >
          Conhecer a Salmazos
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      </main>
      <RodapePublico />
    </div>
  );
}
