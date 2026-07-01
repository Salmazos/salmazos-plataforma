"use client";

import { useState } from "react";
import type { AdmissaoDependente } from "@/types";
import Campo from "./Campo";
import { campoErroStyle, cardStyle, botaoSecundarioStyle, erroTextStyle } from "./styles";
import { PARENTESCO_OPTIONS } from "@/lib/admissaoConstants";

interface Props {
  token: string;
  possuiDependentes: boolean;
  setPossuiDependentes: (v: boolean) => void;
  dependentes: AdmissaoDependente[];
  setDependentes: (deps: AdmissaoDependente[]) => void;
  errosVisiveis: Set<string>;
}

interface NovoDependente {
  nome: string;
  parentesco: string;
  data_nascimento: string;
  cpf: string;
  nome_mae: string;
  cpf_mae: string;
}

const DEPENDENTE_VAZIO: NovoDependente = { nome: "", parentesco: "", data_nascimento: "", cpf: "", nome_mae: "", cpf_mae: "" };

export default function PassoDependentes({ token, possuiDependentes, setPossuiDependentes, dependentes, setDependentes, errosVisiveis }: Props) {
  const [formAberto, setFormAberto] = useState(false);
  const [novo, setNovo] = useState<NovoDependente>(DEPENDENTE_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const ehFilho = novo.parentesco === "filho" || novo.parentesco === "filha";

  const handleAdicionar = async () => {
    setErroForm("");
    if (!novo.nome.trim() || !novo.parentesco || !novo.data_nascimento) {
      setErroForm("Preencha nome, parentesco e data de nascimento.");
      return;
    }
    if (ehFilho && !novo.nome_mae.trim()) {
      setErroForm("Nome da mãe é obrigatório para filho(a).");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch(`/api/admissoes/token/${token}/dependentes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novo),
      });
      const json = await res.json();
      if (!res.ok) { setErroForm(json.error || "Erro ao adicionar dependente."); return; }
      setDependentes([...dependentes, json.data]);
      setNovo(DEPENDENTE_VAZIO);
      setFormAberto(false);
    } finally {
      setSalvando(false);
    }
  };

  const handleRemover = async (dep: AdmissaoDependente) => {
    if (!window.confirm(`Remover ${dep.nome} da lista de dependentes?`)) return;
    setRemovendoId(dep.id);
    try {
      const res = await fetch(`/api/admissoes/token/${token}/dependentes/${dep.id}`, { method: "DELETE" });
      if (res.ok) setDependentes(dependentes.filter((d) => d.id !== dep.id));
    } finally {
      setRemovendoId(null);
    }
  };

  const parentescoLabel = (v: string | null) => PARENTESCO_OPTIONS.find((p) => p.value === v)?.label ?? v ?? "—";

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Dependentes</h2>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 16px" }}>Filhos ou cônjuge que constam como seus dependentes.</p>

      <Campo label="Você possui dependentes (filhos ou cônjuge)?">
        <div style={{ display: "flex", gap: 20 }}>
          {[{ v: false, l: "Não" }, { v: true, l: "Sim" }].map((opt) => (
            <label key={String(opt.v)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, minHeight: 44 }}>
              <input
                type="radio" name="possui_dependentes" checked={possuiDependentes === opt.v}
                onChange={() => setPossuiDependentes(opt.v)}
                style={{ width: 20, height: 20 }}
              />
              {opt.l}
            </label>
          ))}
        </div>
      </Campo>

      {possuiDependentes && (
        <>
          {errosVisiveis.has("dependentes") && (
            <p style={erroTextStyle}>Adicione ao menos um dependente ou selecione &quot;Não&quot; acima.</p>
          )}

          {dependentes.map((dep) => (
            <div key={dep.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{dep.nome}</p>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>
                    {parentescoLabel(dep.parentesco)} · Nascimento: {dep.data_nascimento || "—"}
                  </p>
                  {dep.cpf && <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>CPF: {dep.cpf}</p>}
                </div>
                <button
                  onClick={() => handleRemover(dep)}
                  disabled={removendoId === dep.id}
                  style={{ background: "none", border: "none", color: "#DC2626", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 8 }}
                >
                  {removendoId === dep.id ? "Removendo..." : "Remover"}
                </button>
              </div>
            </div>
          ))}

          {formAberto ? (
            <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginTop: 8 }}>
              <Campo label="Nome" required>
                <input type="text" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} style={campoErroStyle(false)} />
              </Campo>
              <Campo label="Parentesco" required>
                <select value={novo.parentesco} onChange={(e) => setNovo({ ...novo, parentesco: e.target.value })} style={campoErroStyle(false)}>
                  <option value="" disabled>Selecione...</option>
                  {PARENTESCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Campo>
              <Campo label="Data de nascimento" required>
                <input type="date" value={novo.data_nascimento} onChange={(e) => setNovo({ ...novo, data_nascimento: e.target.value })} style={campoErroStyle(false)} />
              </Campo>
              <Campo label="CPF">
                <input type="text" inputMode="numeric" value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: e.target.value })} style={campoErroStyle(false)} />
              </Campo>
              {ehFilho && (
                <>
                  <Campo label="Nome da mãe" required>
                    <input type="text" value={novo.nome_mae} onChange={(e) => setNovo({ ...novo, nome_mae: e.target.value })} style={campoErroStyle(false)} />
                  </Campo>
                  <Campo label="CPF da mãe">
                    <input type="text" inputMode="numeric" value={novo.cpf_mae} onChange={(e) => setNovo({ ...novo, cpf_mae: e.target.value })} style={campoErroStyle(false)} />
                  </Campo>
                </>
              )}

              {erroForm && <p style={erroTextStyle}>{erroForm}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => { setFormAberto(false); setNovo(DEPENDENTE_VAZIO); setErroForm(""); }}
                  style={botaoSecundarioStyle}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAdicionar} disabled={salvando}
                  style={{ ...botaoSecundarioStyle, background: "#000", color: "#FFD700", border: "none", opacity: salvando ? 0.7 : 1 }}
                >
                  {salvando ? "Salvando..." : "Salvar dependente"}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setFormAberto(true)} style={{ ...botaoSecundarioStyle, marginTop: 4 }}>
              + Adicionar dependente
            </button>
          )}
        </>
      )}
    </div>
  );
}
