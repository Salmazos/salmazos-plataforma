"use client";

import { resumoDaSolicitacao, type FormPublico } from "@/lib/solicitacaoVagaPublicaForm";
import type { ItemProposta } from "@/lib/propostaModelos";
import ResumoSolicitacao from "./ResumoSolicitacao";

interface Props {
  form: FormPublico;
  itens: ItemProposta[];
  aceite: boolean;
  onAceite: (v: boolean) => void;
  erroAceite?: string;
}

// Última etapa: resumo, condições comerciais numeradas (texto vindo do servidor, o mesmo do PDF da proposta) e o aceite.
export default function EtapaEnvio({ form, itens, aceite, onAceite, erroAceite }: Props) {
  const secoes = resumoDaSolicitacao(form);
  return (
    <div className="space-y-8">
      <ResumoSolicitacao secoes={secoes} nota="Algo errado? Use o botão “Voltar” para corrigir antes de enviar." />

      <section aria-labelledby="condicoes-titulo" className="space-y-4">
        <h3 id="condicoes-titulo" className="text-lg font-bold text-gray-900">Condições da prestação do serviço de Recrutamento &amp; Seleção</h3>
        <ol className="space-y-3 rounded-2xl border-2 border-black bg-white p-5">
          {itens.map((item) => (
            <li key={item.numero} className="grid grid-cols-[3rem_1fr] gap-2 text-sm text-gray-900">
              <span className="font-bold">{item.numero}</span>
              <span className="whitespace-pre-wrap break-words">{item.texto}</span>
            </li>
          ))}
        </ol>

        <div className={`rounded-xl border-2 p-4 ${erroAceite ? "border-red-600 bg-red-50" : "border-gray-300 bg-gray-50"}`}>
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-base text-gray-900">
            <input
              id="campo-aceite"
              type="checkbox"
              checked={aceite}
              onChange={(e) => onAceite(e.target.checked)}
              aria-invalid={erroAceite ? true : undefined}
              aria-describedby={erroAceite ? "campo-aceite-erro" : undefined}
              className="mt-0.5 h-6 w-6 shrink-0 scroll-mt-28"
            />
            <span className="font-semibold">Li e estou de acordo com as condições comerciais acima</span>
          </label>
          {erroAceite && <p id="campo-aceite-erro" className="mt-2 text-sm font-medium text-red-700">{erroAceite}</p>}
        </div>
      </section>
    </div>
  );
}
