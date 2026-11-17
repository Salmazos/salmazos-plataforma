"use client";

import type { CSSProperties, ReactNode } from "react";
import CamposAdmissaoPadrao from "@/components/CamposAdmissaoPadrao";
import CampoDiasTeste from "@/components/CampoDiasTeste";
import { PERIODOS_EXP } from "@/lib/admissaoCamposPadrao";
import { TIPO_RS, camposPadraoObrigatorios } from "@/lib/admissaoObrigatorios";
import { comHorario, type DadosAdmissaoForm } from "@/lib/admissaoForm";
import { MOSTRAR_DIA_TESTE_NO_PORTAL } from "@/lib/diaTestePortal";

// "Dados para Admissão" do Portal do Cliente. UM componente para a indicação COM vaga, SEM vaga e a edição da indicação: mesmos controles,
// máscaras, listas e ordem nos três (os 7 campos padronizados vêm de CamposAdmissaoPadrao). O tipo de serviço vem da vaga ou, no sem vaga,
// da própria indicação. Quem usa guarda o estado (DadosAdmissaoForm) e troca `key` ao mudar de tipo.
//
// ocultarFuncao: no sem vaga a função é o "Cargo / função" do cartão "Sobre a indicação" (um campo só, sem digitar duas vezes).

const INPUT = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2";
const LABEL = "block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1";
const INVALIDO: CSSProperties = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };

function Campo({ rotulo, obrigatorio, children, id }: { rotulo: string; obrigatorio?: boolean; children: ReactNode; id?: string }) {
  return (
    <div id={id}>
      <label className={LABEL}>{rotulo}{obrigatorio && " *"}</label>
      {children}
    </div>
  );
}

interface Props {
  tipoServico: string | null | undefined;
  valores: DadosAdmissaoForm;
  onChange: (patch: Partial<DadosAdmissaoForm>) => void;
  tentouEnviar?: boolean;
  ocultarFuncao?: boolean;
  dataMinima?: string;
  inputStyle?: CSSProperties;
}

export default function BlocoDadosAdmissao({ tipoServico, valores, onChange, tentouEnviar = false, ocultarFuncao = false, dataMinima, inputStyle }: Props) {
  const rs = tipoServico === TIPO_RS;
  const horario = comHorario(tipoServico);
  const vazio = (v: string) => tentouEnviar && v.trim() === "";
  const estilo = (invalido: boolean): CSSProperties | undefined => (invalido ? INVALIDO : undefined);

  return (
    <div className="space-y-4">
      <Campo rotulo="Data de Início" obrigatorio>
        <input type="date" min={dataMinima} className={INPUT} value={valores.data_inicio} onChange={(e) => onChange({ data_inicio: e.target.value })}
          style={estilo(vazio(valores.data_inicio))} />
      </Campo>

      {!ocultarFuncao && (
        <Campo rotulo={rs ? "Função confirmada" : "Função"} obrigatorio>
          <input className={INPUT} value={valores.funcao} onChange={(e) => onChange({ funcao: e.target.value })}
            placeholder="Ex: Auxiliar de Produção" style={estilo(vazio(valores.funcao))} />
        </Campo>
      )}

      {horario && (
        <Campo rotulo="Setor" obrigatorio>
          <input className={INPUT} value={valores.setor} onChange={(e) => onChange({ setor: e.target.value })}
            placeholder="Ex: Produção" style={estilo(vazio(valores.setor))} />
        </Campo>
      )}

      {/* Salário, centro de custo, horário, turno, escala e tempo de contrato: o componente padronizado. key: trocar o tipo refaz as listas. */}
      <CamposAdmissaoPadrao
        key={tipoServico ?? "sem-tipo"}
        tipoServico={tipoServico}
        valores={valores.padrao}
        onChange={(patch) => onChange({ padrao: { ...valores.padrao, ...patch } })}
        inputClassName={INPUT}
        labelClassName={LABEL}
        obrigatorios={camposPadraoObrigatorios(tipoServico)}
      />

      {rs && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Departamento/Setor">
              <input className={INPUT} value={valores.setor} onChange={(e) => onChange({ setor: e.target.value })} placeholder="Ex: Administrativo" />
            </Campo>
            <Campo rotulo="Gestor Direto">
              <input className={INPUT} value={valores.gestor} onChange={(e) => onChange({ gestor: e.target.value })} placeholder="Nome do gestor" />
            </Campo>
          </div>
          <Campo rotulo="Período de Experiência">
            <select className={INPUT} style={{ background: "#fff", cursor: "pointer" }} value={valores.periodo_exp} onChange={(e) => onChange({ periodo_exp: e.target.value })}>
              <option value="">Selecione...</option>
              {PERIODOS_EXP.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
        </>
      )}

      {horario && (
        <>
          <Campo rotulo="Vale Transporte?" obrigatorio>
            <div className="flex gap-4 mt-1">
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="radio" name="vt" checked={valores.vt === v} onChange={() => onChange({ vt: v })} className="accent-black" />
                  {v ? "Sim" : "Não"}
                </label>
              ))}
            </div>
            {tentouEnviar && valores.vt === null && <p className="text-red-500 text-xs mt-1">Selecione uma opção.</p>}
          </Campo>

          <Campo rotulo="Exame Admissional — Responsável" obrigatorio>
            <input className={INPUT} value={valores.exame} onChange={(e) => onChange({ exame: e.target.value })}
              placeholder="Ex: Clínica MedTrab / RH do cliente" style={estilo(vazio(valores.exame))} />
          </Campo>

          <Campo rotulo="Local/Data/Hora da Integração">
            <div className="grid grid-cols-3 gap-2">
              <input className={INPUT} value={valores.integ_local} onChange={(e) => onChange({ integ_local: e.target.value })} placeholder="Ex: Portaria" />
              <input type="date" className={INPUT} value={valores.integ_data} onChange={(e) => onChange({ integ_data: e.target.value })} />
              <input type="time" className={INPUT} value={valores.integ_hora} onChange={(e) => onChange({ integ_hora: e.target.value })} />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Preencha os três campos, ou deixe todos em branco.</p>
          </Campo>

          {MOSTRAR_DIA_TESTE_NO_PORTAL && (
            <Campo rotulo="Dia(s) de teste antes do início?" obrigatorio>
              <CampoDiasTeste id="campo-dias-teste" valor={valores.dias_teste} onChange={(dias_teste) => onChange({ dias_teste })}
                mostrarErro={tentouEnviar} inputStyle={inputStyle} inputClassName={INPUT} />
            </Campo>
          )}
        </>
      )}

      <Campo rotulo="Observações">
        <textarea className={INPUT} rows={2} value={valores.observacoes} onChange={(e) => onChange({ observacoes: e.target.value })}
          placeholder="Observações adicionais..." style={{ resize: "vertical" }} />
      </Campo>
    </div>
  );
}
