"use client";

import { useId, useState } from "react";
import { NIVEIS_ESCOLARIDADE, NIVEIS_COM_CURSO, condicoesPorNivel, montarTextoEscolaridade } from "@/lib/escolaridadeConstants";

interface Props {
  onChange: (textoFinal: string) => void;
}

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#374151",
  marginBottom: "4px",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#ffffff",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

function chipStyle(ativo: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "8px",
    border: `1px solid ${ativo ? "#FFD700" : "#d1d5db"}`,
    backgroundColor: ativo ? "rgba(255,215,0,0.1)" : "#f3f4f6",
    cursor: "pointer",
    fontSize: "13px",
    color: ativo ? "#92400e" : "#374151",
    fontWeight: ativo ? 600 : 400,
  };
}

// Seleção única de escolaridade (Fundamental/Médio/Técnico/Superior/Pós-graduação), com
// campo de curso condicional e condição (Completo/Cursando/...) por nível — ver
// src/lib/escolaridadeConstants.ts. Estado (nível/curso/condição) fica interno ao
// componente porque os 3 formulários que o usam sempre começam em branco (diferente do
// seletor multi-chip do portal, que precisa reidratar de um template salvo). Só expõe o
// texto final já composto via onChange, pra gravar direto no mesmo campo de texto livre
// que já existia (formacao_academica).
export default function SeletorEscolaridade({ onChange }: Props) {
  const nome = useId();
  const [nivel, setNivel] = useState("");
  const [curso, setCurso] = useState("");
  const [condicao, setCondicao] = useState("");

  const emitir = (novoNivel: string, novoCurso: string, novaCondicao: string) => {
    onChange(montarTextoEscolaridade(novoNivel, novoCurso, novaCondicao));
  };

  const selecionarNivel = (novoNivel: string) => {
    // Clicar no nível já selecionado desmarca (seleção única, mas desmarcável).
    if (nivel === novoNivel) {
      setNivel("");
      setCurso("");
      setCondicao("");
      emitir("", "", "");
      return;
    }
    setNivel(novoNivel);
    setCurso("");
    setCondicao("");
    emitir(novoNivel, "", "");
  };

  const alterarCurso = (novoCurso: string) => {
    setCurso(novoCurso);
    emitir(nivel, novoCurso, condicao);
  };

  const alterarCondicao = (novaCondicao: string) => {
    setCondicao(novaCondicao);
    emitir(nivel, curso, novaCondicao);
  };

  const pedeCurso = nivel && NIVEIS_COM_CURSO.has(nivel);
  const opcoesCondicao = nivel ? condicoesPorNivel(nivel) : [];

  return (
    <div>
      <div className="flex flex-wrap gap-2" style={{ marginBottom: pedeCurso || nivel ? "10px" : 0 }}>
        {NIVEIS_ESCOLARIDADE.map((n) => {
          const ativo = nivel === n;
          return (
            <label key={n} style={chipStyle(ativo)}>
              <input
                type="radio"
                name={nome}
                checked={ativo}
                onChange={() => selecionarNivel(n)}
                style={{ flexShrink: 0, accentColor: "#FFD700" }}
              />
              <span>{n}</span>
            </label>
          );
        })}
      </div>

      {nivel && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pedeCurso && (
            <div>
              <label style={LABEL}>Curso</label>
              <input
                type="text"
                style={INPUT}
                placeholder="Ex: Administração"
                value={curso}
                onChange={(e) => alterarCurso(e.target.value)}
              />
            </div>
          )}
          <div>
            <label style={LABEL}>Situação</label>
            <select style={{ ...INPUT, cursor: "pointer" }} value={condicao} onChange={(e) => alterarCondicao(e.target.value)}>
              <option value="">Selecione</option>
              {opcoesCondicao.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
