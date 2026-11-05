"use client";

// Pergunta "Houve dia(s) de teste antes do início?" do portal do cliente (avaliação, indicação direta e edição da
// indicação). Controlado: o pai guarda o EstadoDiasTeste e converte para o corpo da API com diasTesteParaEnvio.
// Sem pré-seleção de propósito: "não houve" ([]) e "não respondeu" (null) são coisas diferentes no banco.
import type { CSSProperties } from "react";
import { MAX_DIAS_TESTE, diasTesteSchema, horasDoDiaTeste, type DiaTeste } from "@/lib/diasTeste";

export interface EstadoDiasTeste {
  resposta: "" | "nao" | "sim";
  dias: DiaTeste[];
}

export const ESTADO_DIAS_TESTE_VAZIO: EstadoDiasTeste = { resposta: "", dias: [] };

const DIA_EM_BRANCO: DiaTeste = { data: "", entrada: "", saida: "" };

// Valor salvo (jsonb) -> estado do formulário: null = ainda não respondido; [] = "Não"; lista = "Sim".
export function estadoDiasTesteDeValor(valor: unknown): EstadoDiasTeste {
  if (!Array.isArray(valor)) return ESTADO_DIAS_TESTE_VAZIO;
  if (valor.length === 0) return { resposta: "nao", dias: [] };
  return { resposta: "sim", dias: (valor as DiaTeste[]).map((d) => ({ data: d.data, entrada: d.entrada, saida: d.saida })) };
}

// Estado -> corpo da API: null (sem resposta) | [] | lista. Não valida; quem envia checa erroDiasTeste antes.
export function diasTesteParaEnvio(estado: EstadoDiasTeste): DiaTeste[] | null {
  if (estado.resposta === "") return null;
  if (estado.resposta === "nao") return [];
  return estado.dias;
}

export function erroDiasTeste(estado: EstadoDiasTeste): string | null {
  if (estado.resposta === "") return "Informe se houve dia(s) de teste.";
  if (estado.resposta === "nao") return null;
  if (estado.dias.length === 0) return "Informe ao menos um dia de teste.";
  if (estado.dias.some((d) => !d.data || !d.entrada || !d.saida)) return "Preencha data, entrada e saída de cada dia de teste.";
  const r = diasTesteSchema.safeParse(estado.dias);
  return r.success ? null : r.error.issues[0]?.message ?? "Dia(s) de teste inválido(s).";
}

interface Props {
  valor: EstadoDiasTeste;
  onChange: (novo: EstadoDiasTeste) => void;
  mostrarErro?: boolean;
  // Cada tela já tem o seu padrão de input: className ("input-field") ou style (inputStyle).
  inputClassName?: string;
  inputStyle?: CSSProperties;
  id?: string;
}

const invalido: CSSProperties = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };

export default function CampoDiasTeste({ valor, onChange, mostrarErro = false, inputClassName, inputStyle, id }: Props) {
  const erro = mostrarErro ? erroDiasTeste(valor) : null;

  const escolher = (resposta: "nao" | "sim") =>
    onChange(resposta === "nao" ? { resposta, dias: [] } : { resposta, dias: valor.dias.length > 0 ? valor.dias : [{ ...DIA_EM_BRANCO }] });
  const alterarDia = (i: number, parte: Partial<DiaTeste>) =>
    onChange({ ...valor, dias: valor.dias.map((d, j) => (j === i ? { ...d, ...parte } : d)) });
  const adicionar = () => onChange({ ...valor, dias: [...valor.dias, { ...DIA_EM_BRANCO }] });
  const remover = (i: number) => onChange({ ...valor, dias: valor.dias.filter((_, j) => j !== i) });

  // Borda vermelha só no que falta: a pergunta sem resposta, ou o input da linha ainda vazio.
  const estiloInput = (vazio: boolean): CSSProperties => ({ ...inputStyle, ...(mostrarErro && vazio ? invalido : {}) });

  return (
    <div id={id} data-campo-dias-teste>
      <div className="flex gap-4" style={mostrarErro && valor.resposta === "" ? { outline: "1px solid #EF4444", borderRadius: 6, padding: 4 } : undefined}>
        {([["nao", "Não"], ["sim", "Sim"]] as const).map(([v, rotulo]) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="radio" name={id ? `${id}-resposta` : "dias-teste-resposta"} checked={valor.resposta === v} onChange={() => escolher(v)} className="accent-black" />
            {rotulo}
          </label>
        ))}
      </div>

      {valor.resposta === "sim" && (
        <div className="mt-3 space-y-2">
          {valor.dias.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-dia-teste-linha>
              <input type="date" aria-label={`Data do dia de teste ${i + 1}`} value={d.data} onChange={(e) => alterarDia(i, { data: e.target.value })} className={inputClassName} style={{ ...estiloInput(!d.data), width: "auto" }} />
              <input type="time" aria-label={`Entrada do dia de teste ${i + 1}`} value={d.entrada} onChange={(e) => alterarDia(i, { entrada: e.target.value })} className={inputClassName} style={{ ...estiloInput(!d.entrada), width: "auto" }} />
              <span className="text-xs text-gray-500">às</span>
              <input type="time" aria-label={`Saída do dia de teste ${i + 1}`} value={d.saida} onChange={(e) => alterarDia(i, { saida: e.target.value })} className={inputClassName} style={{ ...estiloInput(!d.saida), width: "auto" }} />
              {d.entrada && d.saida && d.entrada !== d.saida && <span className="text-xs font-semibold text-gray-600" data-horas>{horasDoDiaTeste(d)}</span>}
              {valor.dias.length > 1 && (
                <button type="button" onClick={() => remover(i)} className="text-xs text-red-600 hover:underline">Remover</button>
              )}
            </div>
          ))}
          {valor.dias.length < MAX_DIAS_TESTE && (
            <button type="button" onClick={adicionar} className="text-xs font-semibold text-gray-700 hover:underline">+ Adicionar dia</button>
          )}
          <p className="text-[11px] text-gray-400">Informe o horário trabalhado em cada dia.</p>
        </div>
      )}
      {erro && <p className="text-red-500 text-xs mt-1">{erro}</p>}
    </div>
  );
}
