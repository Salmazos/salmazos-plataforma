import type { Metadata } from "next";
import FormularioSolicitacaoPublica from "@/components/solicitacao-publica/FormularioSolicitacaoPublica";
import TelaLinkIndisponivel from "@/components/solicitacao-publica/TelaLinkIndisponivel";
import { formatoTokenValido } from "@/lib/solicitacaoVagaToken";

// Página pública (sem login) do link de solicitação de vaga: fora do matcher do middleware, como /admissao/[token]. A validade do
// token é conferida pela API a cada chamada; aqui só se resolvem os metadados.
export const metadata: Metadata = {
  title: "Solicitação de vaga | Salmazos RH",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SolicitarVagaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Endereço fora do formato (novo ou legado): mesma tela amigável de link indisponível, sem chamar a API.
  if (!formatoTokenValido(token)) return <TelaLinkIndisponivel />;
  return <FormularioSolicitacaoPublica token={token} />;
}
