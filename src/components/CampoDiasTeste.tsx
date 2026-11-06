"use client";

// Pergunta "Dia(s) de teste antes do início?" (avaliação, indicação direta e edição da indicação do portal; ajuste do RH ao
// iniciar a admissão). O cliente só informa SE houve e QUANTOS dias (1 ou 2; a Salmazos paga por dia): sem datas nem horários.
// Controlado: o pai guarda o EstadoDiasTeste e converte para o corpo da API com diasTesteParaEnvio.
// Sem pré-seleção de propósito: "não houve" (0) e "não respondeu" (null) são coisas diferentes no banco. O estado precisa de
// "resposta" além da quantidade porque "Sim" ainda sem quantidade não é nem 0 nem null.
import type { CSSProperties } from "react";
import { MAX_DIAS_TESTE, MSG_INFORME_DIAS_TESTE } from "@/lib/diasTeste";

export interface EstadoDiasTeste {
  resposta: "" | "nao" | "sim";
  // Só vale com resposta "sim": 1..MAX_DIAS_TESTE, ou null enquanto o cliente não escolheu.
  qtd: number | null;
}

export const ESTADO_DIAS_TESTE_VAZIO: EstadoDiasTeste = { resposta: "", qtd: null };

export const MSG_INFORME_QTD_DIAS_TESTE = "Informe a quantidade de dias de teste.";

// Valor salvo (admissao_qtd_dias_teste) -> estado do formulário: null = ainda não respondido; 0 = "Não"; 1..MAX = "Sim".
export function estadoDiasTesteDeValor(valor: unknown): EstadoDiasTeste {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > MAX_DIAS_TESTE) return ESTADO_DIAS_TESTE_VAZIO;
  return valor === 0 ? { resposta: "nao", qtd: null } : { resposta: "sim", qtd: valor };
}

// Estado -> corpo da API: null (sem resposta) | 0 | 1..MAX. "Sim" sem quantidade também vira null: quem envia checa erroDiasTeste antes.
export function diasTesteParaEnvio(estado: EstadoDiasTeste): number | null {
  if (estado.resposta === "nao") return 0;
  if (estado.resposta === "sim") return estado.qtd;
  return null;
}

export function erroDiasTeste(estado: EstadoDiasTeste): string | null {
  if (estado.resposta === "") return MSG_INFORME_DIAS_TESTE;
  if (estado.resposta === "sim" && estado.qtd === null) return MSG_INFORME_QTD_DIAS_TESTE;
  return null;
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

const OPCOES_QTD = Array.from({ length: MAX_DIAS_TESTE }, (_, i) => i + 1);

export default function CampoDiasTeste({ valor, onChange, mostrarErro = false, inputClassName, inputStyle, id }: Props) {
  const erro = mostrarErro ? erroDiasTeste(valor) : null;

  const escolher = (resposta: "nao" | "sim") => onChange(resposta === "nao" ? { resposta, qtd: null } : { resposta, qtd: valor.qtd });
  const escolherQtd = (texto: string) => onChange({ resposta: "sim", qtd: texto === "" ? null : Number(texto) });

  const semResposta = mostrarErro && valor.resposta === "";
  const semQtd = mostrarErro && valor.resposta === "sim" && valor.qtd === null;

  return (
    <div id={id} data-campo-dias-teste>
      <div className="flex gap-4" style={semResposta ? { outline: "1px solid #EF4444", borderRadius: 6, padding: 4 } : undefined}>
        {([["nao", "Não"], ["sim", "Sim"]] as const).map(([v, rotulo]) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="radio" name={id ? `${id}-resposta` : "dias-teste-resposta"} checked={valor.resposta === v} onChange={() => escolher(v)} className="accent-black" />
            {rotulo}
          </label>
        ))}
      </div>

      {valor.resposta === "sim" && (
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1" htmlFor={id ? `${id}-qtd` : undefined}>Quantos dias?</label>
          <select
            id={id ? `${id}-qtd` : undefined}
            value={valor.qtd === null ? "" : String(valor.qtd)}
            onChange={(e) => escolherQtd(e.target.value)}
            className={inputClassName}
            style={{ ...inputStyle, width: "auto", ...(semQtd ? invalido : {}) }}
          >
            <option value="">Selecione</option>
            {OPCOES_QTD.map((n) => (
              <option key={n} value={n}>{n === 1 ? "1 dia" : `${n} dias`}</option>
            ))}
          </select>
        </div>
      )}
      {erro && <p className="text-red-500 text-xs mt-1">{erro}</p>}
    </div>
  );
}
