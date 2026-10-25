"use client";

import type { CSSProperties } from "react";
import { CATEGORIAS_HABILITACAO } from "@/lib/solicitacaoVagaCampos";
import {
  IDADE_MAXIMA_PERMITIDA, IDADE_MINIMA_PERMITIDA, LIMITE_LOCAL_TRABALHO, type PerfilPortal, type SexoPerfil, type SimNaoPerfil,
} from "@/lib/perfilCandidatoPortal";

// Bloco "Perfil do candidato" da solicitação de vaga do portal (visual do portal: cartão branco, rótulos em caixa alta, opções em chips). Tudo
// opcional; uso interno da equipe Salmazos, não é publicado na vaga.

const CHIP_ON: CSSProperties = { backgroundColor: "#16a34a", color: "#fff", border: "2px solid #16a34a" };
const CHIP_OFF: CSSProperties = { backgroundColor: "#fff", color: "#374151", border: "2px solid #D1D5DB" };
const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };
const inputStyle: CSSProperties = { border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#111827", outline: "none", width: "100%", boxSizing: "border-box" };
const inputComErro: CSSProperties = { ...inputStyle, border: "1px solid #DC2626" };

function Opcoes<T extends string>({
  id, rotulo, opcoes, valor, onChange,
}: {
  id: string;
  rotulo: string;
  opcoes: readonly { id: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-labelledby={`${id}-rotulo`}>
      <span id={`${id}-rotulo`} style={labelStyle}>{rotulo}</span>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={valor === o.id}
            onClick={() => onChange(o.id)}
            className="text-sm px-4 py-2 rounded-full font-medium transition-all"
            style={valor === o.id ? CHIP_ON : CHIP_OFF}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const SIM_NAO: readonly { id: SimNaoPerfil; label: string }[] = [
  { id: "nao", label: "Não" },
  { id: "sim", label: "Sim" },
];
const SEXOS: readonly { id: SexoPerfil; label: string }[] = [
  { id: "indiferente", label: "Indiferente" },
  { id: "masc", label: "Masculino" },
  { id: "fem", label: "Feminino" },
];

export default function PerfilCandidatoPortal({
  valor,
  onChange,
  erros,
}: {
  valor: PerfilPortal;
  onChange: (v: PerfilPortal) => void;
  erros: Record<string, string>;
}) {
  const atualizar = <K extends keyof PerfilPortal>(campo: K, v: PerfilPortal[K]) => onChange({ ...valor, [campo]: v });
  const soDigitos = (t: string) => t.replace(/\D/g, "").slice(0, 2);

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Perfil do candidato</p>
        <p className="text-xs text-gray-400 mt-1">Opcional. Ajuda a nossa equipe na busca e fica só para uso interno: não é publicado na vaga.</p>
      </div>

      <Opcoes id="campo-sexo" rotulo="Sexo" opcoes={SEXOS} valor={valor.sexo} onChange={(v) => atualizar("sexo", v)} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="campo-idade_min" style={labelStyle}>Idade mínima</label>
          <input
            id="campo-idade_min"
            inputMode="numeric"
            value={valor.idadeMin}
            onChange={(e) => atualizar("idadeMin", soDigitos(e.target.value))}
            placeholder={`Ex.: ${IDADE_MINIMA_PERMITIDA + 4}`}
            aria-invalid={erros.idade_min ? true : undefined}
            aria-describedby={erros.idade_min ? "campo-idade_min-erro" : undefined}
            style={erros.idade_min ? inputComErro : inputStyle}
          />
          {erros.idade_min && <p id="campo-idade_min-erro" role="alert" className="text-xs text-red-600 mt-1">{erros.idade_min}</p>}
        </div>
        <div>
          <label htmlFor="campo-idade_max" style={labelStyle}>Idade máxima</label>
          <input
            id="campo-idade_max"
            inputMode="numeric"
            value={valor.idadeMax}
            onChange={(e) => atualizar("idadeMax", soDigitos(e.target.value))}
            placeholder={`Ex.: ${IDADE_MAXIMA_PERMITIDA - 55}`}
            aria-invalid={erros.idade_max ? true : undefined}
            aria-describedby={erros.idade_max ? "campo-idade_max-erro" : undefined}
            style={erros.idade_max ? inputComErro : inputStyle}
          />
          {erros.idade_max && <p id="campo-idade_max-erro" role="alert" className="text-xs text-red-600 mt-1">{erros.idade_max}</p>}
        </div>
      </div>

      <Opcoes id="campo-pcd" rotulo="Vaga para pessoa com deficiência (PCD)?" opcoes={SIM_NAO} valor={valor.pcd} onChange={(v) => atualizar("pcd", v)} />

      <Opcoes
        id="campo-habilitacao"
        rotulo="Precisa de habilitação (CNH)?"
        opcoes={SIM_NAO}
        valor={valor.habilitacao}
        onChange={(v) => onChange({ ...valor, habilitacao: v, habilitacaoCategoria: v === "sim" ? valor.habilitacaoCategoria : "" })}
      />
      {valor.habilitacao === "sim" && (
        <div>
          <label htmlFor="campo-habilitacao_categoria" style={labelStyle}>Qual categoria? *</label>
          <select
            id="campo-habilitacao_categoria"
            value={valor.habilitacaoCategoria}
            onChange={(e) => atualizar("habilitacaoCategoria", e.target.value)}
            aria-invalid={erros.habilitacao_categoria ? true : undefined}
            aria-describedby={erros.habilitacao_categoria ? "campo-habilitacao_categoria-erro" : undefined}
            style={erros.habilitacao_categoria ? inputComErro : inputStyle}
          >
            <option value="">Selecione</option>
            {CATEGORIAS_HABILITACAO.map((c) => (
              <option key={c} value={c}>Categoria {c}</option>
            ))}
          </select>
          {erros.habilitacao_categoria && <p id="campo-habilitacao_categoria-erro" role="alert" className="text-xs text-red-600 mt-1">{erros.habilitacao_categoria}</p>}
        </div>
      )}

      <Opcoes id="campo-veiculo_proprio" rotulo="Precisa ter veículo próprio?" opcoes={SIM_NAO} valor={valor.veiculoProprio} onChange={(v) => atualizar("veiculoProprio", v)} />

      <div>
        <label htmlFor="campo-local_trabalho" style={labelStyle}>Local de trabalho</label>
        <input
          id="campo-local_trabalho"
          value={valor.localTrabalho}
          onChange={(e) => atualizar("localTrabalho", e.target.value)}
          maxLength={LIMITE_LOCAL_TRABALHO}
          placeholder="Endereço ou unidade onde a pessoa vai trabalhar"
          aria-invalid={erros.local_trabalho ? true : undefined}
          style={erros.local_trabalho ? inputComErro : inputStyle}
        />
        <p className="text-xs text-gray-400 mt-1">Só a equipe Salmazos vê este campo.</p>
        {erros.local_trabalho && <p role="alert" className="text-xs text-red-600 mt-1">{erros.local_trabalho}</p>}
      </div>
    </div>
  );
}
