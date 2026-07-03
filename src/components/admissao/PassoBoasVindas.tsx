"use client";

import { cardStyle, botaoPrimarioStyle } from "./styles";

interface Props {
  onIniciar: () => void;
}

const LISTA_PRINCIPAL = [
  "CPF ou CIC",
  "Título de Eleitor",
  "Cartão do SUS",
  "Identidade (RG)",
  "Reservista (para homens)",
  "Certidão de Nascimento, ou Casamento, ou Comprovação de Relação Estável",
  "Comprovante de Escolaridade (histórico escolar)",
  "Cartão Original do PIS/PASEP (Com data de cadastramento)",
  "Comprovante de Endereço (preferencialmente conta de energia elétrica)",
  "Carteira de Habilitação (obrigatório para Motoristas)",
  "TODAS AS PÁGINAS da Carteira de Trabalho Digital",
];

const LISTA_DEPENDENTES = [
  "Certidão de Nascimento (Filhos menores de 18 anos) – enviar dados da mãe junto (Nome e CPF)",
  "CPF dos filhos dependentes de qualquer idade, e das esposas/maridos caso sejam cadastrados como dependentes",
  "Caderneta de Vacinação (Filhos menores de 07 anos) – exigência que deverá ser cumprida anualmente",
  "Comprovante de Frequência Escolar (Filhos maiores de 07 anos)",
];

export default function PassoBoasVindas({ onIniciar }: Props) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Antes de começar</h2>
      <p style={{ fontSize: 13, color: "#374151", margin: "0 0 12px", lineHeight: 1.5 }}>
        Para iniciarmos o processo de admissão, é necessário que você esteja com os seguintes documentos em mãos:
      </p>

      <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
        {LISTA_PRINCIPAL.map((item, i) => <li key={i}>{item}</li>)}
      </ul>

      <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
        Documentação em caso de dependentes (filhos):
      </p>
      <ul style={{ margin: "0 0 20px", paddingLeft: 20, fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
        {LISTA_DEPENDENTES.map((item, i) => <li key={i}>{item}</li>)}
      </ul>

      <button onClick={onIniciar} style={botaoPrimarioStyle}>
        Já tenho os documentos em mãos, começar
      </button>
    </div>
  );
}
