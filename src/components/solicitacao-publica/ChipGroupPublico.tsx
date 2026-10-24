"use client";

import { CONDICOES_SIMPLES, CONDICOES_SUPERIOR, CONDICOES_TECNICO } from "@/lib/solicitacaoVagaCampos";
import { ChipToggle } from "./controles";

// Mesmo comportamento do ChipGroup do formulário do portal (portal/solicitar-vaga/page.tsx), que continua intocado: marcar/desmarcar o
// chip; nos chips de "comCurso" (Ensino Técnico/Superior) aparece o campo "em qual curso"; nesses e nos de "comCondicaoSimples"
// (Fundamental/Médio) aparece a condição, com as opções de CONDICOES_* (Superior tem as suas, Técnico as dele, os demais as simples).
// Só muda a apresentação: cores da marca, alvos de toque de 44px e curso/condição empilhados abaixo do chip em vez de ao lado.
export default function ChipGroupPublico({
  rotulo, chips, selecionados, onToggle, cursos, onCursoChange, condicoes, onCondicaoChange, comCurso, comCondicaoSimples,
}: {
  rotulo: string;
  chips: readonly string[];
  selecionados: Record<string, boolean>;
  onToggle: (chip: string) => void;
  cursos?: Record<string, string>;
  onCursoChange?: (chip: string, valor: string) => void;
  condicoes?: Record<string, string>;
  onCondicaoChange?: (chip: string, valor: string) => void;
  comCurso?: Set<string>;
  comCondicaoSimples?: Set<string>;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-gray-900">{rotulo}</legend>
      <div className="flex flex-wrap items-start gap-2">
        {chips.map((chip) => {
          const ativo = !!selecionados[chip];
          const mostrarCursoECondicao = ativo && comCurso?.has(chip);
          const mostrarCondicaoSimples = ativo && comCondicaoSimples?.has(chip);
          const opcoesCondicao = mostrarCondicaoSimples ? CONDICOES_SIMPLES : chip === "Ensino Superior" ? CONDICOES_SUPERIOR : CONDICOES_TECNICO;
          return (
            <div key={chip} className="flex flex-col gap-2">
              <div>
                <ChipToggle ativo={ativo} onClick={() => onToggle(chip)}>{chip}</ChipToggle>
              </div>
              {(mostrarCursoECondicao || mostrarCondicaoSimples) && (
                <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                  {mostrarCursoECondicao && onCursoChange && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">em</span>
                      <input
                        id={`campo-curso-${chip}`}
                        aria-label={`Em qual curso (${chip})`}
                        value={cursos?.[chip] ?? ""}
                        onChange={(e) => onCursoChange(chip, e.target.value)}
                        placeholder="ex: Administração"
                        maxLength={80}
                        className="block min-h-[44px] w-full min-w-0 rounded-lg border border-gray-400 bg-white px-3 text-base text-gray-900 placeholder:text-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                      />
                    </div>
                  )}
                  {onCondicaoChange && (
                    <select
                      id={`campo-condicao-${chip}`}
                      aria-label={`Condição (${chip})`}
                      value={condicoes?.[chip] ?? ""}
                      onChange={(e) => onCondicaoChange(chip, e.target.value)}
                      className="block min-h-[44px] w-full rounded-lg border border-gray-400 bg-white px-3 text-base text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                    >
                      <option value="">Condição...</option>
                      {opcoesCondicao.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
