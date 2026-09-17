"use client";

import { useState } from "react";

interface Props {
  // Percentual que a linha usa de fato hoje (próprio ou herdado do mês) — só pra exibição.
  percentualEfetivo: number | null;
  // Valor gravado nessa linha (não o herdado) — null = segue o mês. Decide o estilo (cinza
  // "herdado" vs. preto "exceção travada") e o que aparece no campo ao abrir pra editar.
  valorProprio: number | null;
  onSalvar: (novoValor: number | null) => Promise<boolean>;
}

// Célula clicável da coluna "Imposto (%)" — clique abre um campo numérico, Enter/blur
// salva, Esc cancela. Deixar o campo em branco ao salvar volta o lançamento a seguir o
// imposto do mês normalmente (ver percentualEfetivoRow em FaturamentoHortolandiaPageClient).
export default function ImpostoLinhaCelula({ percentualEfetivo, valorProprio, onSalvar }: Props) {
  const [editando, setEditando] = useState(false);
  const [valorInput, setValorInput] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function abrirEdicao() {
    setValorInput(valorProprio != null ? valorProprio.toString().replace(".", ",") : "");
    setErro("");
    setEditando(true);
  }

  async function confirmar() {
    const texto = valorInput.trim();
    if (texto === "") {
      setSalvando(true);
      const ok = await onSalvar(null);
      setSalvando(false);
      if (ok) setEditando(false);
      else setErro("Erro ao salvar.");
      return;
    }
    const numero = Number(texto.replace(",", "."));
    if (isNaN(numero) || numero < 0 || numero > 100) {
      setErro("Percentual inválido (0 a 100).");
      return;
    }
    setSalvando(true);
    const ok = await onSalvar(numero);
    setSalvando(false);
    if (ok) setEditando(false);
    else setErro("Erro ao salvar.");
  }

  if (editando) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={valorInput}
          disabled={salvando}
          onChange={(e) => setValorInput(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditando(false);
          }}
          placeholder="Mês"
          className="input-field"
          style={{ width: 70, padding: "3px 6px", fontSize: 13, textAlign: "right" }}
        />
        {erro && <span style={{ fontSize: 10, color: "#DC2626" }}>{erro}</span>}
      </div>
    );
  }

  const ehExcecao = valorProprio != null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        abrirEdicao();
      }}
      title={ehExcecao ? "Imposto próprio deste lançamento — clique pra editar" : "Seguindo o imposto do mês — clique pra definir uma exceção"}
      className="hover:underline"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        fontSize: 13,
        fontWeight: ehExcecao ? 700 : 400,
        color: ehExcecao ? "#92400E" : "#9CA3AF",
      }}
    >
      {percentualEfetivo != null ? `${percentualEfetivo.toString().replace(".", ",")}%` : "—"}
    </button>
  );
}
