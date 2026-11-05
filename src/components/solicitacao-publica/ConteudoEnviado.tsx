import { MARCA } from "./marca";

// Conteúdo da confirmação de envio (marca de verificação, título e os 3 passos "o que acontece agora"), sem o invólucro do site público (fundo,
// imagem, rodapé). As classes sp-pop, sp-draw vêm de ESTILOS em FormularioSolicitacaoPublica.tsx: quem usar este conteúdo fora dele precisa
// incluir esse <style>. `textoFinal` é a frase de fechamento (o padrão é a do link público). `onAdicionarOutra` (só o link público passa)
// acrescenta a lista do que já foi enviado e o botão para pedir outra vaga; sem ele o conteúdo é exatamente o de sempre.
export default function ConteudoEnviado({
  prazoDiasUteis,
  textoFinal = `Você já pode fechar esta página. Obrigado por escolher a ${MARCA.nome}.`,
  enviadas = [],
  onAdicionarOutra,
}: {
  prazoDiasUteis: number;
  textoFinal?: string;
  enviadas?: string[];
  onAdicionarOutra?: () => void;
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
      {onAdicionarOutra && (
        <section aria-labelledby="enviadas-titulo" className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
          {enviadas.length > 0 && (
            <>
              <p id="enviadas-titulo" className="text-sm font-bold text-gray-900">Você já enviou:</p>
              <ul className="mt-1 list-disc pl-5 text-base text-gray-900">
                {enviadas.map((cargo, i) => (
                  <li key={`${i}-${cargo}`}>{cargo}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-sm text-gray-700">Os dados da empresa e os benefícios já vêm preenchidos.</p>
          <button
            type="button"
            onClick={onAdicionarOutra}
            className="mt-3 min-h-[52px] w-full rounded-xl bg-black px-4 text-base font-bold text-[#FFD700] hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            Adicionar outra vaga
          </button>
        </section>
      )}
      <p className="mt-8 text-sm text-gray-600">{textoFinal}</p>
    </>
  );
}
