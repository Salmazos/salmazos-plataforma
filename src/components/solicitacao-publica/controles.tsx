"use client";

import React, { useRef, useState } from "react";

// Controles de toque do formulário público: alvos de pelo menos 44px, 16px de fonte (evita o zoom do iOS), foco visível em preto
// sobre branco (o amarelo da marca só entra sobre preto) e erro ligado ao campo por aria-describedby.

export const CLASSE_ENTRADA =
  "block w-full min-h-[48px] scroll-mt-28 rounded-xl border bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-500 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:bg-gray-100";

function descreve(id: string, ajuda?: string, erro?: string): string | undefined {
  const ids = [ajuda ? `${id}-ajuda` : "", erro ? `${id}-erro` : ""].filter(Boolean).join(" ");
  return ids || undefined;
}

function Rotulo({ id, texto, obrigatorio }: { id: string; texto: string; obrigatorio?: boolean }) {
  return (
    <label htmlFor={id} className="block text-sm font-semibold text-gray-900">
      {texto}
      {obrigatorio && (
        <>
          <span aria-hidden="true" className="text-red-700"> *</span>
          <span className="sr-only"> (obrigatório)</span>
        </>
      )}
    </label>
  );
}

function Mensagens({ id, ajuda, erro }: { id: string; ajuda?: string; erro?: string }) {
  return (
    <>
      {ajuda && <p id={`${id}-ajuda`} className="text-sm text-gray-600">{ajuda}</p>}
      {erro && <p id={`${id}-erro`} className="text-sm font-medium text-red-700">{erro}</p>}
    </>
  );
}

interface CampoTextoProps {
  id: string; // sempre "campo-<nome>": é o que a validação usa para levar o foco ao primeiro erro
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  obrigatorio?: boolean;
  ajuda?: string;
  erro?: string;
  placeholder?: string;
  tipo?: "text" | "email" | "tel" | "date" | "time" | "number";
  multilinha?: boolean;
  linhas?: number;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  autoComplete?: string;
  min?: number;
  max?: number;
}

export function CampoTexto(p: CampoTextoProps) {
  const comum = {
    id: p.id,
    value: p.valor,
    placeholder: p.placeholder,
    maxLength: p.maxLength,
    autoComplete: p.autoComplete,
    "aria-invalid": p.erro ? true : undefined,
    "aria-describedby": descreve(p.id, p.ajuda, p.erro),
    className: `${CLASSE_ENTRADA} ${p.erro ? "border-red-600" : "border-gray-400"}`,
  };
  return (
    <div className="space-y-1.5">
      <Rotulo id={p.id} texto={p.rotulo} obrigatorio={p.obrigatorio} />
      {p.multilinha ? (
        <textarea {...comum} rows={p.linhas ?? 4} onChange={(e) => p.onChange(e.target.value)} />
      ) : (
        <input
          {...comum}
          type={p.tipo ?? "text"}
          inputMode={p.inputMode}
          min={p.min}
          max={p.max}
          onChange={(e) => p.onChange(e.target.value)}
        />
      )}
      <Mensagens id={p.id} ajuda={p.ajuda} erro={p.erro} />
    </div>
  );
}

export function CampoSelecao({
  id, rotulo, valor, onChange, opcoes, obrigatorio, ajuda, erro, vazio = "Selecione...", autoComplete,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  opcoes: readonly { id: string; label: string }[];
  obrigatorio?: boolean;
  ajuda?: string;
  erro?: string;
  vazio?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Rotulo id={id} texto={rotulo} obrigatorio={obrigatorio} />
      <select
        id={id}
        value={valor}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descreve(id, ajuda, erro)}
        className={`${CLASSE_ENTRADA} ${erro ? "border-red-600" : "border-gray-400"}`}
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <Mensagens id={id} ajuda={ajuda} erro={erro} />
    </div>
  );
}

// Botões lado a lado em que só um vale (radiogroup): setas movem a escolha, como no padrão ARIA.
export function Segmentado<T extends string>({
  id, rotulo, opcoes, valor, onChange, obrigatorio, ajuda, erro, colunas,
}: {
  id: string;
  rotulo: string;
  opcoes: readonly { id: T; label: string }[];
  valor: T | "";
  onChange: (valor: T) => void;
  obrigatorio?: boolean;
  ajuda?: string;
  erro?: string;
  colunas?: string; // classes de grid, por exemplo "grid-cols-2"
}) {
  const grupo = useRef<HTMLDivElement>(null);
  const indiceAtual = opcoes.findIndex((o) => o.id === valor);

  function aoTeclar(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const proximo = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : null;
    if (proximo === null) return;
    e.preventDefault();
    const alvo = (proximo + opcoes.length) % opcoes.length;
    onChange(opcoes[alvo].id);
    (grupo.current?.querySelectorAll("button")[alvo] as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <div className="space-y-1.5">
      <p id={`${id}-rotulo`} className="text-sm font-semibold text-gray-900">
        {rotulo}
        {obrigatorio && <span aria-hidden="true" className="text-red-700"> *</span>}
      </p>
      {ajuda && <p id={`${id}-ajuda`} className="text-sm text-gray-600">{ajuda}</p>}
      <div
        id={id}
        ref={grupo}
        role="radiogroup"
        tabIndex={-1}
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={descreve(id, undefined, erro)}
        className={`grid scroll-mt-28 gap-2 outline-none ${colunas ?? "grid-cols-2"}`}
      >
        {opcoes.map((o, i) => {
          const ativo = o.id === valor;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={ativo || (indiceAtual === -1 && i === 0) ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={`min-h-[48px] rounded-xl border-2 px-3 py-2 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                ativo ? "border-black bg-black text-[#FFD700]" : "border-gray-300 bg-white text-gray-900 hover:border-gray-500"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {erro && <p id={`${id}-erro`} className="text-sm font-medium text-red-700">{erro}</p>}
    </div>
  );
}

export function ChipToggle({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`min-h-[44px] rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
        ativo ? "border-black bg-black text-[#FFD700]" : "border-gray-300 bg-white text-gray-900 hover:border-gray-500"
      }`}
    >
      {ativo && <span aria-hidden="true">✓ </span>}
      {children}
    </button>
  );
}

// Texto que o cliente digita livremente e que pode ir para o anúncio da vaga.
export const AVISO_TEXTO_ANUNCIO = "Este texto pode aparecer no anúncio da vaga. Não inclua telefones, e-mails ou informações confidenciais.";

export function AvisoAnuncio({ id }: { id?: string }) {
  return (
    <p id={id} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
      <span aria-hidden="true">⚠</span>
      <span>{AVISO_TEXTO_ANUNCIO}</span>
    </p>
  );
}

// Itens livres do cliente (requisitos ou benefícios além dos chips). Mesmas regras da lista do portal: digitar e Enter (ou
// "Adicionar") inclui, texto repetido é ignorado e o "×" remove. Diferença: teto de itens e de tamanho por item (o formulário público
// não tem login, então a API limita; o portal não limita).
export const MAX_ITENS_PERSONALIZADOS = 30;
export const MAX_TAMANHO_ITEM_PERSONALIZADO = 100;

export function ListaPersonalizada({
  id, rotulo, itens, onChange, placeholder,
}: {
  id: string;
  rotulo: string; // só para leitor de tela: o portal mostra apenas o placeholder
  itens: string[];
  onChange: (itens: string[]) => void;
  placeholder: string;
}) {
  const [texto, setTexto] = useState("");
  function adicionar() {
    const v = texto.trim();
    if (!v || itens.includes(v) || itens.length >= MAX_ITENS_PERSONALIZADOS) return;
    onChange([...itens, v]);
    setTexto("");
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="sr-only">{rotulo}</label>
      {itens.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {itens.map((item) => (
            <li key={item} className="inline-flex min-h-[44px] items-center gap-1 rounded-full border-2 border-black bg-black pl-4 pr-1 text-sm font-semibold text-[#FFD700]">
              <span className="break-words">{item}</span>
              <button
                type="button"
                aria-label={`Remover ${item}`}
                onClick={() => onChange(itens.filter((x) => x !== item))}
                className="flex h-11 w-11 items-center justify-center rounded-full text-[#FFD700] hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFD700]"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={texto}
          maxLength={MAX_TAMANHO_ITEM_PERSONALIZADO}
          placeholder={placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          className={`${CLASSE_ENTRADA} border-gray-400`}
        />
        <button
          type="button"
          onClick={adicionar}
          disabled={!texto.trim() || itens.length >= MAX_ITENS_PERSONALIZADOS}
          className="min-h-[48px] shrink-0 rounded-xl border-2 border-black bg-white px-4 text-base font-semibold text-black hover:bg-black hover:text-[#FFD700] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}

// Prévia do texto gerado ("Requisitos selecionados" / "Benefícios selecionados"), como no portal.
export function PreviaTextoGerado({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="mb-1 text-xs font-bold uppercase text-gray-600">{titulo}</p>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800">{texto}</pre>
    </div>
  );
}
