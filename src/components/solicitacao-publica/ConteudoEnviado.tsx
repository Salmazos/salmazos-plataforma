import { MARCA } from "./marca";

// Conteúdo da confirmação de envio (marca de verificação, título e os 3 passos "o que acontece agora"), sem o invólucro do site público (fundo,
// imagem, rodapé). As classes sp-pop, sp-draw vêm de ESTILOS em FormularioSolicitacaoPublica.tsx: quem usar este conteúdo fora dele precisa
// incluir esse <style>. `textoFinal` é a frase de fechamento (o padrão é a do link público).
export default function ConteudoEnviado({
  prazoDiasUteis,
  textoFinal = `Você já pode fechar esta página. Obrigado por escolher a ${MARCA.nome}.`,
}: {
  prazoDiasUteis: number;
  textoFinal?: string;
}) {
  const etapas = [
    { titulo: "Análise pela equipe", texto: "Revisamos os dados da sua solicitação." },
    { titulo: "Publicação da vaga", texto: "Divulgamos a vaga nos nossos canais de captação." },
    { titulo: `Currículos em até ${prazoDiasUteis} dias úteis`, texto: "Você recebe os candidatos que combinam com o perfil pedido." },
  ];
  return (
    <>
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
      <p className="mt-8 text-sm text-gray-600">{textoFinal}</p>
    </>
  );
}
