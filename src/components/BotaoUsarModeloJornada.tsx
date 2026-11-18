"use client";

import { useState } from "react";
import CamposHorasJornada from "@/components/CamposHorasJornada";
import { HORAS_JORNADA_VAZIAS, MODELOS_JORNADA, ROTULO_JORNADA, gerarTextoJornada, type HorasJornada, type ModeloJornada } from "@/lib/jornadaTrabalho";

// Botão "Usar modelo" ao lado de campos de horário em TEXTO LIVRE (Admissão, funcionário, edição de solicitação): abre um painel pequeno, o usuário
// escolhe o modelo e digita as horas, e o texto padrão (jornadaTrabalho.ts) é entregue a quem usa. Não troca nem restringe o campo: ele continua
// editável e o que já era digitado continua valendo. Sem escolher e aplicar, nada muda.

interface Props {
  onAplicar: (texto: string) => void;
  // Telas do RH: quando informado, o botão vira "Salvar horário" — preenche o campo (onAplicar) e GRAVA só o horário (onSalvar devolve a mensagem de erro
  // do servidor, ou null se salvou). Em erro o painel fica aberto e o que foi digitado, preservado. Sem onSalvar (ex.: portal do cliente) segue "Aplicar no campo".
  onSalvar?: (texto: string) => Promise<string | null>;
  // Só para teste de renderização (SSR não clica): abre já o painel.
  abertoInicial?: boolean;
}

const INPUT = "input-field text-sm w-full";
const LABEL = "block text-[11px] text-gray-500 mb-1";

export default function BotaoUsarModeloJornada({ onAplicar, onSalvar, abertoInicial = false }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [modelo, setModelo] = useState<ModeloJornada>("seg_sex");
  const [horas, setHoras] = useState<HorasJornada>({ ...HORAS_JORNADA_VAZIAS });
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");
  const texto = gerarTextoJornada(modelo, horas);

  const aplicar = async () => {
    onAplicar(texto);
    if (!onSalvar) { setAberto(false); return; }
    setSalvando(true);
    setErroSalvar("");
    try {
      const erro = await onSalvar(texto);
      if (erro) setErroSalvar(erro);
      else setAberto(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
        {aberto ? "− Fechar modelo" : "+ Usar modelo"}
      </button>
      {aberto && (
        <div className="mt-2 border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <label className={LABEL}>Modelo
            <select className={INPUT} value={modelo} onChange={(e) => setModelo(e.target.value as ModeloJornada)}>
              {MODELOS_JORNADA.map((m) => <option key={m} value={m}>{ROTULO_JORNADA[m]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={LABEL}>Entrada
              <input type="time" className={INPUT} value={horas.entrada.replace("h", ":")} onChange={(e) => setHoras((h) => ({ ...h, entrada: e.target.value }))} />
            </label>
            <label className={LABEL}>Saída
              <input type="time" className={INPUT} value={horas.saida.replace("h", ":")} onChange={(e) => setHoras((h) => ({ ...h, saida: e.target.value }))} />
            </label>
            <CamposHorasJornada
              modelo={modelo}
              horas={{ sextaSaida: horas.sextaSaida, sabadoEntrada: horas.sabadoEntrada, sabadoSaida: horas.sabadoSaida }}
              onChange={(p) => setHoras((h) => ({ ...h, ...p }))}
              inputClassName={INPUT}
              labelClassName={LABEL}
              obrigatorio={false}
            />
          </div>
          {texto && <p className="text-xs text-gray-600">Texto: <strong>{texto}</strong></p>}
          <button
            type="button"
            disabled={!texto || salvando}
            // "Aplicar no campo" muda o texto do campo da janela sem emitir input/change; "Salvar horário" grava direto e não suja.
            data-sujo-botao={onSalvar ? undefined : true}
            onClick={aplicar}
            className={onSalvar
              // "Salvar horário" (telas do RH): azul sólido de destaque (blue-700 = #1D4ED8, o azul já usado nas telas; hover blue-800 como o link "+ Usar modelo").
              // Borda transparente mantém o tamanho idêntico ao do botão neutro.
              ? "text-xs font-semibold border border-transparent rounded-lg px-3 py-1.5 bg-blue-700 text-white hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              : "text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-50"}
          >
            {onSalvar ? (salvando ? "Salvando..." : "Salvar horário") : "Aplicar no campo"}
          </button>
          {erroSalvar && <p className="text-xs text-red-600" role="alert">{erroSalvar}</p>}
        </div>
      )}
    </div>
  );
}
