"use client";

import { useState } from "react";
import CampoMoeda from "@/components/ui/CampoMoeda";
import { TEMPO_CONTRATO_PADRAO } from "@/lib/constants";
import { DIAS_AUXILIAR_PRORROGACAO, MAX_DIAS_CONTRATO } from "@/lib/dataTerminoContrato";
import {
  CENTRO_CUSTO_MAX, ESCALA_OPCOES_MOT, OPCAO_OUTRO, TURNO_OPCOES, TURNO_OPCOES_MOT,
  comporHorario, decomporHorario, erroTempoContrato, escalaValida, turnoValido, validarCamposAdmissao,
  type CamposAdmissaoPadrao,
} from "@/lib/admissaoCamposPadrao";

// Campos de admissão no PADRÃO da plataforma, à prova de texto livre (mesmos componentes e listas do Portal do Cliente: CampoMoeda, selects de
// turno/escala, entrada/saída em type="time", tempo de contrato padrão). Usado pelo "Completar dados" do analista e pela edição do cliente.
// Emite sempre os MESMOS valores que o formulário de Indicar Candidato grava: salário em número, horário "Turno B, 08h00 às 17h00",
// turno e escala como texto da lista (ou "Turno X" / "NxM" quando "Outro"), tempo de contrato em texto padronizado.

interface Props {
  tipoServico: string | null | undefined;
  valores: CamposAdmissaoPadrao;
  onChange: (patch: CamposAdmissaoPadrao) => void;
  inputClassName?: string;
  labelClassName?: string;
}

const INPUT_PADRAO = "w-full text-xs border border-gray-300 rounded-md px-2 py-1.5";
const LABEL_PADRAO = "text-[11px] text-gray-600";
const SO_CODIGO = /[^A-Za-z0-9._/-]/g;

const MOT = "mao_obra_temporaria";
const TERC = "terceirizacao";

// Valor "Outro" digitado na tela: o banco guarda só o texto; aqui reconhece quando o valor atual é um desses formatos.
const REGEX_TURNO_OUTRO = /^Turno [A-Z]$/;
const REGEX_TEMPO_OUTRO = /^(\d{1,3}) dias(?:, prorrogável por mais (\d{1,3}) dias)?$/;

function estadoInicialLista(valor: string | null | undefined, lista: string[], valido: (v: string) => boolean): { sel: string; outro: string; foraDoPadrao: boolean } {
  const v = (valor ?? "").trim();
  if (!v) return { sel: "", outro: "", foraDoPadrao: false };
  if (lista.includes(v) && v !== OPCAO_OUTRO) return { sel: v, outro: "", foraDoPadrao: false };
  if (valido(v)) return { sel: OPCAO_OUTRO, outro: v, foraDoPadrao: false };
  return { sel: "", outro: "", foraDoPadrao: true };
}

export default function CamposAdmissaoPadrao({ tipoServico, valores, onChange, inputClassName = INPUT_PADRAO, labelClassName = LABEL_PADRAO }: Props) {
  const mot = tipoServico === MOT;
  const terc = tipoServico === TERC;
  const comHorario = mot || terc;
  const listaTurno = mot ? TURNO_OPCOES_MOT : TURNO_OPCOES;

  // Horário e turno vêm juntos: o horário é "<turno>, HHhMM às HHhMM".
  const horarioAtual = decomporHorario(valores.admissao_horario);
  const turnoValor = valores.admissao_turno ?? horarioAtual?.turno ?? "";
  const [turno, setTurno] = useState(() => estadoInicialLista(turnoValor, listaTurno, turnoValido));
  const [entrada, setEntrada] = useState(horarioAtual?.entrada ?? "");
  const [saida, setSaida] = useState(horarioAtual?.saida ?? "");
  const [escala, setEscala] = useState(() => estadoInicialLista(valores.admissao_escala, ESCALA_OPCOES_MOT, escalaValida));
  const [tipoSalario, setTipoSalario] = useState<"horista" | "mensalista">(() => (Number(valores.admissao_salario ?? 0) > 0 && !(Number(valores.admissao_salario_hora ?? 0) > 0) ? "mensalista" : "horista"));

  const tempoAtual = (valores.admissao_tempo_contrato ?? "").trim();
  const tempoOutro = tempoAtual && tempoAtual !== TEMPO_CONTRATO_PADRAO ? REGEX_TEMPO_OUTRO.exec(tempoAtual) : null;
  const [tempoSel, setTempoSel] = useState<"" | "padrao" | "outro">(() => (!tempoAtual ? "" : tempoAtual === TEMPO_CONTRATO_PADRAO ? "padrao" : tempoOutro ? "outro" : ""));
  const [dias, setDias] = useState(tempoOutro?.[1] ?? "");
  const [prorrogacao, setProrrogacao] = useState(tempoOutro?.[2] ?? "");
  const tempoForaDoPadrao = !!tempoAtual && tempoSel === "" && erroTempoContrato(tempoAtual) !== null;

  const emitirHorario = (sel: string, outro: string, ent: string, sai: string) => {
    const t = sel === OPCAO_OUTRO ? outro.trim() : sel;
    onChange({ admissao_turno: t || null, admissao_horario: t && ent && sai ? comporHorario(t, ent, sai) : null });
  };
  const emitirTempo = (sel: "" | "padrao" | "outro", d: string, p: string) => {
    if (sel === "padrao") onChange({ admissao_tempo_contrato: TEMPO_CONTRATO_PADRAO });
    else if (sel === "outro") onChange({ admissao_tempo_contrato: d ? `${d} dias${p ? `, prorrogável por mais ${p} dias` : ""}` : null });
    else onChange({ admissao_tempo_contrato: null });
  };

  // Erros ao vivo (mesmas regras do servidor): o analista vê o que está fora do padrão antes de salvar.
  const erros = validarCamposAdmissao(valores);
  const erroDe = (campo: keyof CamposAdmissaoPadrao) => erros.find((e) => e.campo === campo)?.erro;
  const erroP = (campo: keyof CamposAdmissaoPadrao) => (erroDe(campo) ? <p className="text-[11px] text-red-600 mt-0.5">{erroDe(campo)}</p> : null);
  const entradaSemSaida = comHorario && (!!entrada !== !!saida);

  const moeda = (valor: number | null | undefined, aoMudar: (n: number | null) => void, placeholder: string) => (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500">R$</span>
      <CampoMoeda value={valor ?? null} onChange={(v) => aoMudar(v > 0 ? v : null)} placeholder={placeholder} className={inputClassName} />
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {comHorario && (
        <label className={labelClassName}>Centro de custo
          <input
            value={valores.admissao_centro_custo ?? ""}
            maxLength={CENTRO_CUSTO_MAX}
            onChange={(e) => onChange({ admissao_centro_custo: e.target.value.replace(SO_CODIGO, "") || null })}
            placeholder="Ex.: CC-0042 (sem espaços)"
            className={inputClassName}
          />
          {erroP("admissao_centro_custo")}
        </label>
      )}

      {mot ? (
        <div className={labelClassName}>
          <div className="flex gap-3 mb-1">
            {(["horista", "mensalista"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                <input
                  type="radio" name="tipo-salario" checked={tipoSalario === t}
                  onChange={() => { setTipoSalario(t); onChange(t === "horista" ? { admissao_salario: null } : { admissao_salario_hora: null }); }}
                />
                {t === "horista" ? "Salário por hora" : "Salário mensal"}
              </label>
            ))}
          </div>
          {tipoSalario === "horista"
            ? <>{moeda(valores.admissao_salario_hora, (n) => onChange({ admissao_salario_hora: n }), "Ex.: 8,90")}{erroP("admissao_salario_hora")}</>
            : <>{moeda(valores.admissao_salario, (n) => onChange({ admissao_salario: n }), "Ex.: 2.000,00")}{erroP("admissao_salario")}</>}
        </div>
      ) : (
        <div className={labelClassName}>Salário mensal
          {moeda(valores.admissao_salario, (n) => onChange({ admissao_salario: n }), "Ex.: 2.000,00")}
          {erroP("admissao_salario")}
        </div>
      )}

      {comHorario && (
        <>
          <label className={labelClassName}>Horário de entrada
            <input type="time" value={entrada} onChange={(e) => { setEntrada(e.target.value); emitirHorario(turno.sel, turno.outro, e.target.value, saida); }} className={inputClassName} />
          </label>
          <label className={labelClassName}>Horário de saída
            <input type="time" value={saida} onChange={(e) => { setSaida(e.target.value); emitirHorario(turno.sel, turno.outro, entrada, e.target.value); }} className={inputClassName} />
          </label>
          <label className={labelClassName}>Turno
            <select
              value={turno.sel}
              onChange={(e) => { const t = { ...turno, sel: e.target.value, foraDoPadrao: false }; setTurno(t); emitirHorario(t.sel, t.outro, entrada, saida); }}
              className={inputClassName}
            >
              <option value="">Selecione...</option>
              {listaTurno.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {turno.foraDoPadrao && <p className="text-[11px] text-amber-700 mt-0.5">O valor atual ("{turnoValor}") está fora das opções: escolha o turno de novo.</p>}
          </label>
          {turno.sel === OPCAO_OUTRO && (
            <label className={labelClassName}>Especifique o turno
              <input
                value={turno.outro} placeholder="Ex.: Turno E"
                onChange={(e) => { const t = { ...turno, outro: e.target.value }; setTurno(t); emitirHorario(t.sel, t.outro, entrada, saida); }}
                className={inputClassName}
              />
              {turno.outro.trim() && !REGEX_TURNO_OUTRO.test(turno.outro.trim()) && <p className="text-[11px] text-red-600 mt-0.5">Use o formato "Turno X" (ex.: Turno E).</p>}
            </label>
          )}
          {(entradaSemSaida || erroDe("admissao_horario") || erroDe("admissao_turno")) && (
            <div className="sm:col-span-2">
              {entradaSemSaida && <p className="text-[11px] text-amber-700">Preencha entrada e saída para gravar o horário.</p>}
              {erroP("admissao_horario")}
              {erroP("admissao_turno")}
            </div>
          )}
        </>
      )}

      {mot && (
        <>
          <label className={labelClassName}>Escala
            <select
              value={escala.sel}
              onChange={(e) => { const s = { ...escala, sel: e.target.value, foraDoPadrao: false }; setEscala(s); onChange({ admissao_escala: (s.sel === OPCAO_OUTRO ? s.outro.trim() : s.sel) || null }); }}
              className={inputClassName}
            >
              <option value="">Selecione...</option>
              {ESCALA_OPCOES_MOT.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            {escala.foraDoPadrao && <p className="text-[11px] text-amber-700 mt-0.5">O valor atual ("{valores.admissao_escala}") está fora das opções: escolha a escala de novo.</p>}
            {erroP("admissao_escala")}
          </label>
          {escala.sel === OPCAO_OUTRO && (
            <label className={labelClassName}>Especifique a escala
              <input
                value={escala.outro} placeholder="Ex.: 5x2"
                onChange={(e) => { const s = { ...escala, outro: e.target.value }; setEscala(s); onChange({ admissao_escala: s.outro.trim() || null }); }}
                className={inputClassName}
              />
            </label>
          )}

          <div className={labelClassName}>Tempo de contrato
            <select
              value={tempoSel}
              onChange={(e) => { const v = e.target.value as "" | "padrao" | "outro"; setTempoSel(v); emitirTempo(v, dias, prorrogacao); }}
              className={inputClassName}
            >
              <option value="">Selecione...</option>
              <option value="padrao">{TEMPO_CONTRATO_PADRAO}</option>
              <option value="outro">Outro prazo</option>
            </select>
            {tempoForaDoPadrao && <p className="text-[11px] text-amber-700 mt-0.5">O valor atual ("{tempoAtual}") está fora do padrão: escolha de novo.</p>}
            {tempoSel === "outro" && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number" min={1} max={MAX_DIAS_CONTRATO} value={dias} placeholder="dias"
                  onChange={(e) => { setDias(e.target.value); emitirTempo("outro", e.target.value, prorrogacao); }}
                  className={inputClassName} aria-label="Dias de contrato"
                />
                <input
                  type="number" min={1} max={DIAS_AUXILIAR_PRORROGACAO} value={prorrogacao} placeholder="prorrog. (opcional)"
                  onChange={(e) => { setProrrogacao(e.target.value); emitirTempo("outro", dias, e.target.value); }}
                  className={inputClassName} aria-label="Dias de prorrogação"
                />
              </div>
            )}
            {erroP("admissao_tempo_contrato")}
          </div>
        </>
      )}
    </div>
  );
}
