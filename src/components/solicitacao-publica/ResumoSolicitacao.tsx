import type { Ref } from "react";
import type { SecaoResumo } from "@/lib/solicitacaoVagaPublicaForm";

// Resumo "Confira a sua solicitação": recebe as seções já prontas (resumoDaSolicitacao) e só as desenha. Não conhece o formulário, o contratante,
// as condições nem o aceite, então serve ao link público e ao portal. `nota` é a frase de rodapé do cartão (opcional).
// `tituloRef` torna o título focável por código (tabIndex -1), para quem leva o foco até ele ao abrir o resumo; sem essa prop o HTML é o de sempre.
export default function ResumoSolicitacao({
  secoes,
  nota,
  titulo = "Confira a sua solicitação",
  tituloRef,
}: {
  secoes: SecaoResumo[];
  nota?: string;
  titulo?: string;
  tituloRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-labelledby="resumo-titulo" className="space-y-4">
      <h3 id="resumo-titulo" ref={tituloRef} tabIndex={tituloRef ? -1 : undefined} className="text-lg font-bold text-gray-900">{titulo}</h3>
      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {secoes.map((secao) => (
          <div key={secao.titulo}>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-700">{secao.titulo}</h4>
            <dl className="space-y-2">
              {secao.linhas.map((linha) => (
                <div key={linha.rotulo} className="grid grid-cols-1 gap-0.5 sm:grid-cols-3 sm:gap-3">
                  <dt className="text-sm font-semibold text-gray-600">{linha.rotulo}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm text-gray-900 sm:col-span-2">{linha.valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {nota && <p className="text-sm text-gray-600">{nota}</p>}
      </div>
    </section>
  );
}
