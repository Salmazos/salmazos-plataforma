"use client";

import CampoMoeda from "@/components/ui/CampoMoeda";
import {
  BEN_ALIMENTACAO, BEN_QUALIDADE, BEN_SAUDE, BEN_TRANSPORTE, ESTADOS, HORARIO_TIPOS, INTERVALOS, gerarBeneficiosTexto,
  type HorarioForm, type HorarioTipo,
} from "@/lib/solicitacaoVagaCampos";
import ChipGroupPublico from "./ChipGroupPublico";
import { AvisoAnuncio, CLASSE_ENTRADA, CampoSelecao, CampoTexto, ChipToggle, ListaPersonalizada, PreviaTextoGerado, Segmentado } from "./controles";
import { OPCOES_SALARIO, escolherOpcaoSalario, opcaoSalarioAtual } from "@/lib/solicitacaoVagaPublicaForm";
import type { PropsEtapa } from "./tipos";

const OPCOES_ESTADO = ESTADOS.map((uf) => ({ id: uf, label: uf }));
const TIPOS_COM_HORAS = new Set<HorarioTipo | "">(["seg_sex", "6x1", "6x2", "12x36", "turno_fixo"]);

function SeletorHorario({ horario, onChange, erro }: { horario: HorarioForm; onChange: (h: HorarioForm) => void; erro?: string }) {
  const mudar = (parcial: Partial<HorarioForm>) => onChange({ ...horario, ...parcial });
  return (
    <div className="space-y-4">
      <Segmentado
        id="campo-horario"
        rotulo="Horário e jornada"
        ajuda="Escolha o modelo que mais se parece com o da vaga."
        opcoes={HORARIO_TIPOS}
        valor={horario.tipo}
        onChange={(v) => mudar({ tipo: v })}
        colunas="grid-cols-2 sm:grid-cols-3"
        erro={erro}
      />
      {horario.tipo === "12x36" && (
        <Segmentado
          id="campo-horario_turno"
          rotulo="Turno"
          opcoes={[
            { id: "diurno", label: "Diurno" },
            { id: "noturno", label: "Noturno" },
          ]}
          valor={horario.diurnoNoturno}
          onChange={(v) => mudar({ diurnoNoturno: v })}
        />
      )}
      {horario.tipo === "turno_fixo" && (
        <CampoTexto
          id="campo-horario_turnoNome"
          rotulo="Nome do turno"
          valor={horario.turnoNome}
          onChange={(v) => mudar({ turnoNome: v })}
          placeholder="Ex.: Turno da manhã"
          maxLength={60}
        />
      )}
      {TIPOS_COM_HORAS.has(horario.tipo) && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <CampoTexto id="campo-horario_entrada" rotulo="Entrada" tipo="time" valor={horario.entrada} onChange={(v) => mudar({ entrada: v })} />
            <CampoTexto id="campo-horario_saida" rotulo="Saída" tipo="time" valor={horario.saida} onChange={(v) => mudar({ saida: v })} />
          </div>
          <CampoSelecao
            id="campo-horario_intervalo"
            rotulo="Intervalo"
            valor={horario.intervalo}
            onChange={(v) => mudar({ intervalo: v })}
            opcoes={INTERVALOS}
          />
          {horario.intervalo === "personalizado" && (
            <div className="grid grid-cols-2 gap-3">
              <CampoTexto id="campo-horario_intervaloInicio" rotulo="Intervalo de" tipo="time" valor={horario.intervaloInicio} onChange={(v) => mudar({ intervaloInicio: v })} />
              <CampoTexto id="campo-horario_intervaloFim" rotulo="até" tipo="time" valor={horario.intervaloFim} onChange={(v) => mudar({ intervaloFim: v })} />
            </div>
          )}
        </>
      )}
      {horario.tipo === "personalizado" && (
        <CampoTexto
          id="campo-horario_custom"
          rotulo="Descreva o horário"
          valor={horario.custom}
          onChange={(v) => mudar({ custom: v })}
          placeholder="Ex.: Segunda a sábado, das 8h às 17h"
          maxLength={300}
        />
      )}
    </div>
  );
}

export default function EtapaVaga({ form, atualizar, erros }: PropsEtapa) {
  const alternarBeneficio = (chip: string) =>
    atualizar("beneficios", { ...form.beneficios, chips: { ...form.beneficios.chips, [chip]: !form.beneficios.chips[chip] } });
  const grupo = (rotulo: string, chips: string[]) => (
    <ChipGroupPublico rotulo={rotulo} chips={chips} selecionados={form.beneficios.chips} onToggle={alternarBeneficio} />
  );

  return (
    <div className="space-y-5">
      <CampoTexto
        id="campo-cargo"
        rotulo="Cargo ou função"
        obrigatorio
        valor={form.cargo}
        onChange={(v) => atualizar("cargo", v)}
        placeholder="Ex.: Auxiliar administrativo"
        maxLength={120}
        erro={erros.cargo}
      />
      <CampoTexto
        id="campo-num_posicoes"
        rotulo="Quantas vagas?"
        obrigatorio
        tipo="number"
        inputMode="numeric"
        min={1}
        max={99}
        valor={form.num_posicoes}
        onChange={(v) => atualizar("num_posicoes", v)}
        erro={erros.num_posicoes}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <CampoTexto
            id="campo-cidade"
            rotulo="Cidade"
            obrigatorio
            valor={form.cidade}
            onChange={(v) => atualizar("cidade", v)}
            placeholder="Ex.: Hortolândia"
            autoComplete="address-level2"
            maxLength={100}
            erro={erros.cidade}
          />
        </div>
        <CampoSelecao
          id="campo-estado"
          rotulo="Estado"
          obrigatorio
          valor={form.estado}
          onChange={(v) => atualizar("estado", v)}
          opcoes={OPCOES_ESTADO}
          autoComplete="address-level1"
          erro={erros.estado}
        />
      </div>
      <CampoTexto
        id="campo-local_trabalho"
        rotulo="Local de trabalho"
        valor={form.local_trabalho}
        onChange={(v) => atualizar("local_trabalho", v)}
        placeholder="Endereço ou bairro onde a pessoa vai trabalhar"
        maxLength={300}
        ajuda="Fica só para a nossa equipe, não é publicado."
        erro={erros.local_trabalho}
      />
      <CampoTexto
        id="campo-previsao_inicio"
        rotulo="Previsão de início"
        tipo="date"
        valor={form.previsao_inicio}
        onChange={(v) => atualizar("previsao_inicio", v)}
        ajuda="Quando você gostaria que a pessoa começasse?"
        erro={erros.previsao_inicio}
      />

      <div id="campo-salario" role="group" aria-labelledby="salario-rotulo" className="scroll-mt-28 space-y-3">
        <p id="salario-rotulo" className="text-sm font-semibold text-gray-900">Salário</p>
        <div className="flex flex-wrap gap-2">
          {OPCOES_SALARIO.map((o) => (
            <ChipToggle key={o.id} ativo={opcaoSalarioAtual(form) === o.id} onClick={() => {
              const novo = escolherOpcaoSalario(form, o.id);
              atualizar("salario_modo", novo.salario_modo);
              atualizar("salario_periodo", novo.salario_periodo);
              atualizar("salario", novo.salario);
            }}>
              {o.label}
            </ChipToggle>
          ))}
        </div>
        {form.salario_modo === "fixo" && (
          // CampoMoeda (compartilhado com o painel) não expõe id/aria: o rótulo implícito dá o nome acessível ao campo.
          <label className="block">
            <span className="sr-only">{form.salario_periodo === "hora" ? "Valor do salário por hora" : "Valor do salário por mês"}</span>
            <CampoMoeda
              value={form.salario}
              onChange={(v) => atualizar("salario", v > 0 ? String(v) : "")}
              placeholder={form.salario_periodo === "hora" ? "Ex: 12,50 (por hora)" : "Ex: 2.000,00 (por mês)"}
              className={`${CLASSE_ENTRADA} border-gray-400 sm:max-w-xs`}
            />
          </label>
        )}
      </div>
      {form.salario_modo === "fixo" && (
        <CampoTexto
          id="campo-adicionais_salariais"
          rotulo="Adicionais salariais"
          valor={form.adicionais_salariais}
          onChange={(v) => atualizar("adicionais_salariais", v)}
          placeholder="Ex.: comissão, adicional noturno, insalubridade"
          maxLength={300}
          erro={erros.adicionais_salariais}
        />
      )}

      <SeletorHorario horario={form.horario} onChange={(h) => atualizar("horario", h)} erro={erros.horario} />

      <section aria-labelledby="beneficios-titulo" className="space-y-4">
        <div>
          <h3 id="beneficios-titulo" className="text-base font-bold text-gray-900">Benefícios</h3>
          <p className="text-sm text-gray-600">Selecione os benefícios que serão oferecidos</p>
        </div>
        {grupo("Transporte", BEN_TRANSPORTE)}
        {grupo("Alimentação", BEN_ALIMENTACAO)}
        {grupo("Saúde", BEN_SAUDE)}
        {grupo("Qualidade de Vida", BEN_QUALIDADE)}
        <ListaPersonalizada
          id="campo-beneficio_extra"
          rotulo="Benefício personalizado"
          itens={form.beneficios.custom}
          onChange={(custom) => atualizar("beneficios", { ...form.beneficios, custom })}
          placeholder="Adicionar benefício personalizado..."
        />
        <AvisoAnuncio />
        <PreviaTextoGerado titulo="Benefícios selecionados" texto={gerarBeneficiosTexto(form.beneficios)} />
      </section>
    </div>
  );
}
