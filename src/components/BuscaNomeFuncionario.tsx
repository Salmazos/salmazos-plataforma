"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nomeContem } from "@/lib/funcionariosBusca";

export interface NomeOpcao {
  id: string;
  nome: string;
  detalhe?: string | null;
}

// Campo "Buscar por nome" com a janela de nomes: ao clicar (ou digitar) abre a lista de TODOS os nomes (já na ordem recebida) e vai
// afunilando conforme se digita. Escolher um nome preenche o campo (a lista da tela passa a mostrar só essa pessoa). Funciona também só
// digitando (a lista da tela filtra a cada letra, como sempre foi). Teclado: ↑ ↓ navegam, Enter escolhe, Esc fecha.
export default function BuscaNomeFuncionario({ value, onChange, opcoes, placeholder = "Buscar por nome..." }: {
  value: string;
  onChange: (texto: string) => void;
  opcoes: readonly NomeOpcao[];
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const visiveis = useMemo(() => opcoes.filter((o) => nomeContem(o.nome, value)), [opcoes, value]);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  useEffect(() => {
    if (ativo >= 0) (lista.current?.children[ativo] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function escolher(nome: string) {
    onChange(nome);
    setAberto(false);
    setAtivo(-1);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setAberto(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((i) => Math.min(visiveis.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && aberto && ativo >= 0 && visiveis[ativo]) { e.preventDefault(); escolher(visiveis[ativo].nome); }
  }

  return (
    <div ref={raiz} style={{ position: "relative", width: 260 }}>
      <input
        ref={campo}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls="lista-nomes-funcionarios"
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value); setAberto(true); setAtivo(-1); }}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        onKeyDown={teclado}
        placeholder={placeholder}
        className="input-field"
        style={{ paddingRight: value ? 34 : undefined }}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => { onChange(""); setAtivo(-1); setAberto(true); campo.current?.focus(); }}
          style={{ position: "absolute", right: 8, top: 8, width: 26, height: 26, border: "none", background: "transparent", color: "#6B7280", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
        >
          ×
        </button>
      )}
      {aberto && (
        <div
          style={{ position: "absolute", zIndex: 30, left: 0, top: "calc(100% + 4px)", width: "max(100%, 320px)", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}
        >
          <p style={{ margin: 0, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
            {visiveis.length} {visiveis.length === 1 ? "nome" : "nomes"} · ordem alfabética
          </p>
          {visiveis.length === 0 ? (
            <p style={{ margin: 0, padding: "14px 12px", fontSize: 13, color: "#9CA3AF" }}>Nenhum nome encontrado.</p>
          ) : (
            <ul id="lista-nomes-funcionarios" role="listbox" ref={lista} style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 320, overflowY: "auto" }}>
              {visiveis.map((o, i) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={i === ativo}
                  onMouseDown={(e) => { e.preventDefault(); escolher(o.nome); }}
                  onMouseEnter={() => setAtivo(i)}
                  style={{ padding: "8px 12px", cursor: "pointer", background: i === ativo ? "#FFF7CC" : "#fff", borderBottom: "1px solid #F9FAFB" }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{o.nome}</span>
                  {o.detalhe && <span style={{ display: "block", fontSize: 11, color: "#9CA3AF" }}>{o.detalhe}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
