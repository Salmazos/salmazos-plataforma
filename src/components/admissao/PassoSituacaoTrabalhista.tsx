"use client";

import type { SituacaoTrabalhistaState } from "./AdmissaoFormClient";
import CampoSimNao from "./CampoSimNao";
import { cardStyle } from "./styles";

interface Props {
  situacaoTrabalhista: SituacaoTrabalhistaState;
  setCampo: <K extends keyof SituacaoTrabalhistaState>(campo: K, valor: SituacaoTrabalhistaState[K]) => void;
  errosVisiveis: Set<string>;
}

export default function PassoSituacaoTrabalhista({ situacaoTrabalhista, setCampo, errosVisiveis }: Props) {
  const erro = (campo: string) => errosVisiveis.has(campo);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Situação Trabalhista e Benefícios</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Algumas perguntas exigidas para o seu cadastro.</p>

      <CampoSimNao
        label="Está recebendo seguro-desemprego?"
        valor={situacaoTrabalhista.recebendo_seguro_desemprego}
        onChange={(v) => setCampo("recebendo_seguro_desemprego", v)}
        erro={erro("recebendo_seguro_desemprego")}
      />
      <CampoSimNao
        label="Este é o seu primeiro emprego?"
        valor={situacaoTrabalhista.primeiro_emprego}
        onChange={(v) => setCampo("primeiro_emprego", v)}
        erro={erro("primeiro_emprego")}
      />
      <CampoSimNao
        label="Já trabalhou nesta empresa antes?"
        valor={situacaoTrabalhista.trabalhou_empresa_antes}
        onChange={(v) => setCampo("trabalhou_empresa_antes", v)}
        erro={erro("trabalhou_empresa_antes")}
      />
      <CampoSimNao
        label="É aposentado?"
        valor={situacaoTrabalhista.aposentado}
        onChange={(v) => setCampo("aposentado", v)}
        erro={erro("aposentado")}
      />
      <CampoSimNao
        label="Possui dependente para Imposto de Renda?"
        valor={situacaoTrabalhista.dependente_ir}
        onChange={(v) => setCampo("dependente_ir", v)}
        erro={erro("dependente_ir")}
      />
      <CampoSimNao
        label="Possui dependente para Salário Família?"
        valor={situacaoTrabalhista.dependente_salario_familia}
        onChange={(v) => setCampo("dependente_salario_familia", v)}
        erro={erro("dependente_salario_familia")}
      />
      <CampoSimNao
        label="Terá adiantamento salarial?"
        valor={situacaoTrabalhista.tera_adiantamento}
        onChange={(v) => setCampo("tera_adiantamento", v)}
        erro={erro("tera_adiantamento")}
      />
    </div>
  );
}
