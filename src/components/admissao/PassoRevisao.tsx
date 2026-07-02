"use client";

import { useState } from "react";
import type { AdmissaoDependente } from "@/types";
import type { FormState, DocumentoToken, ValeTransporteState, AutorizacaoSindicalState } from "./AdmissaoFormClient";
import { cardStyle, botaoPrimarioStyle } from "./styles";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { ESTADO_CIVIL_OPTIONS, GRAU_INSTRUCAO_OPTIONS, PARENTESCO_OPTIONS, OPCAO_VALE_TRANSPORTE_LABEL } from "@/lib/admissaoConstants";

interface Props {
  form: FormState;
  dependentes: AdmissaoDependente[];
  documentos: DocumentoToken[];
  valeTransporte: ValeTransporteState;
  autorizacaoSindical: AutorizacaoSindicalState;
  sexo: string;
  isMotorista: boolean;
  possuiDependentes: boolean;
  lgpdAceite: boolean;
  setLgpdAceite: (v: boolean) => void;
  onEnviar: () => void;
  enviando: boolean;
}

function docVisivel(doc: DocumentoToken, sexo: string, isMotorista: boolean, possuiDependentes: boolean): boolean {
  if (doc.obrigatorio) return true;
  if (doc.condicional === "masculino") return sexo === "M";
  if (doc.condicional === "motorista") return isMotorista;
  if (doc.condicional === "dependente") return possuiDependentes;
  return true;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div style={{ ...cardStyle, marginBottom: 12 }}>
      <button
        onClick={() => setAberto((v) => !v)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{titulo}</span>
        <span style={{ color: "#9CA3AF" }}>{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span style={{ color: "#111827", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function PassoRevisao({ form, dependentes, documentos, valeTransporte, autorizacaoSindical, sexo, isMotorista, possuiDependentes, lgpdAceite, setLgpdAceite, onEnviar, enviando }: Props) {
  const visiveis = documentos.filter((d) => docVisivel(d, sexo, isMotorista, possuiDependentes));
  const pendentesObrigatorios = visiveis.filter((d) => d.obrigatorio && d.status !== "enviado" && d.status !== "aprovado");

  const estadoCivilLabel = ESTADO_CIVIL_OPTIONS.find((o) => o.value === form.estado_civil)?.label ?? form.estado_civil;
  const grauInstrucaoLabel = GRAU_INSTRUCAO_OPTIONS.find((o) => o.value === form.grau_instrucao)?.label ?? form.grau_instrucao;
  const parentescoLabel = (v: string | null) => PARENTESCO_OPTIONS.find((p) => p.value === v)?.label ?? v ?? "—";

  return (
    <div>
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Revisão e Confirmação</h2>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Confira seus dados antes de enviar.</p>
      </div>

      <Secao titulo="Dados Pessoais">
        <Linha label="Nome completo" value={form.nome_completo} />
        <Linha label="Data de nascimento" value={form.data_nascimento} />
        <Linha label="Sexo" value={form.sexo === "M" ? "Masculino" : form.sexo === "F" ? "Feminino" : ""} />
        <Linha label="Estado civil" value={estadoCivilLabel} />
        <Linha label="CPF" value={form.cpf} />
        <Linha label="RG" value={[form.rg_numero, form.rg_orgao_emissor, form.rg_uf].filter(Boolean).join(" / ")} />
        <Linha label="Nome da mãe" value={form.nome_mae} />
        <Linha label="Grau de instrução" value={grauInstrucaoLabel} />
      </Secao>

      <Secao titulo="Documentos Profissionais">
        <Linha label="PIS/PASEP" value={form.pis_pasep} />
        <Linha label="Carteira de Trabalho" value={[form.carteira_trabalho_numero, form.carteira_trabalho_serie, form.carteira_trabalho_uf].filter(Boolean).join(" / ")} />
        <Linha label="Título de eleitor" value={form.titulo_eleitor} />
        {sexo === "M" && <Linha label="Reservista" value={form.reservista} />}
        {isMotorista && <Linha label="CNH" value={form.cnh_numero ? `${form.cnh_numero} - Cat. ${form.cnh_categoria}` : ""} />}
      </Secao>

      <Secao titulo="Endereço">
        <Linha label="Endereço" value={[form.endereco_logradouro, form.endereco_numero].filter(Boolean).join(", ")} />
        <Linha label="Bairro / Cidade / UF" value={[form.endereco_bairro, form.endereco_cidade, form.endereco_uf].filter(Boolean).join(" / ")} />
        <Linha label="CEP" value={form.endereco_cep} />
        <Linha label="Telefone" value={form.telefone} />
        <Linha label="E-mail" value={form.email} />
      </Secao>

      <Secao titulo="Dados Bancários">
        <Linha label="Banco" value={form.banco} />
        <Linha label="Agência" value={form.agencia} />
        <Linha label="Conta" value={form.conta} />
        <Linha label="Tipo de conta" value={form.tipo_conta === "corrente" ? "Conta Corrente" : form.tipo_conta === "poupanca" ? "Conta Poupança" : ""} />
      </Secao>

      {possuiDependentes && dependentes.length > 0 && (
        <Secao titulo="Dependentes">
          {dependentes.map((d) => (
            <Linha key={d.id} label={d.nome} value={parentescoLabel(d.parentesco)} />
          ))}
        </Secao>
      )}

      <Secao titulo="Vale Transporte">
        <Linha label="Opção" value={OPCAO_VALE_TRANSPORTE_LABEL[valeTransporte.opcao] ?? ""} />
        <Linha label="Dias na semana" value={valeTransporte.dias_semana} />
        <Linha label="Local de trabalho" value={valeTransporte.bairro_cidade_trabalho} />
        {valeTransporte.opcao === "vale_transporte" && valeTransporte.linhas.map((l, i) => (
          <Linha key={i} label={`Linha ${i + 1}`} value={[l.onibus_viacao, l.percurso].filter(Boolean).join(" — ")} />
        ))}
      </Secao>

      <Secao titulo="Autorização Sindical">
        <Linha label="Sindicato" value={autorizacaoSindical.nome_sindicato} />
        <Linha
          label="Desconto assistencial/confederativa"
          value={autorizacaoSindical.autoriza_assistencial_confederativa === "sim" ? "Autorizado" : autorizacaoSindical.autoriza_assistencial_confederativa === "nao" ? "Não autorizado" : ""}
        />
        <Linha
          label="Desconto sindical"
          value={autorizacaoSindical.autoriza_sindical === "sim" ? "Autorizado" : autorizacaoSindical.autoriza_sindical === "nao" ? "Não autorizado" : ""}
        />
      </Secao>

      <Secao titulo="Documentos">
        {pendentesObrigatorios.length > 0 && (
          <p style={{ fontSize: 13, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
            ⚠️ {pendentesObrigatorios.length} documento(s) obrigatório(s) pendente(s)
          </p>
        )}
        {visiveis.map((doc) => {
          const def = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento);
          const enviado = doc.status === "enviado" || doc.status === "aprovado";
          return (
            <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
              <span style={{ color: "#374151" }}>{def?.label ?? doc.tipo_documento}</span>
              <span>{enviado ? "✅ Enviado" : "⚠️ Pendente"}</span>
            </div>
          );
        })}
      </Secao>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox" checked={lgpdAceite}
            onChange={(e) => setLgpdAceite(e.target.checked)}
            style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
            Li e aceito a{" "}
            <a
              href="/politica-de-privacidade"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#B45309", textDecoration: "underline", fontWeight: 600 }}
            >
              Política de Privacidade
            </a>{" "}
            da Salmazos RH. Autorizo o uso dos meus dados pessoais e documentos para fins de admissão
            trabalhista, conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
          </span>
        </label>
      </div>

      <button
        onClick={onEnviar}
        disabled={!lgpdAceite || enviando}
        style={{ ...botaoPrimarioStyle, opacity: !lgpdAceite || enviando ? 0.5 : 1, cursor: !lgpdAceite || enviando ? "not-allowed" : "pointer" }}
      >
        {enviando ? "Enviando..." : "Enviar para análise"}
      </button>
      {!lgpdAceite && (
        <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>
          ⚠️ Você precisa ler e aceitar a Política de Privacidade (LGPD) para enviar seus dados.
        </p>
      )}
    </div>
  );
}
