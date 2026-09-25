"use client";

// Formulário de edição de uma solicitação de vaga, compartilhado entre o painel (equipe edita
// direto — ModalSolicitacoesVagas) e o portal (cliente pede alteração, que a Salmazos aprova —
// portal/solicitacoes). Mesmos campos que o card mostra e que viram a vaga (ver
// lib/solicitacaoAlteracao.ts).

export interface FormEdicaoSolicitacao {
  cargo: string;
  tipo_servico: string;
  num_posicoes: string;
  cidade: string;
  estado: string;
  salario: string;
  adicionais_salariais: string;
  previsao_inicio: string;
  horario_texto: string;
  requisitos: string;
  beneficios: string;
  observacoes: string;
  confidencial: boolean;
}

export interface SolicitacaoEditavel {
  cargo: string;
  tipo_servico: string;
  num_posicoes: number | null;
  cidade: string | null;
  estado: string | null;
  salario: string | null;
  adicionais_salariais: string | null;
  previsao_inicio: string | null;
  horario_texto: string | null;
  requisitos: string | null;
  beneficios: string | null;
  observacoes: string | null;
  confidencial: boolean;
}

export function formDeSolicitacao(s: SolicitacaoEditavel): FormEdicaoSolicitacao {
  return {
    cargo: s.cargo,
    tipo_servico: s.tipo_servico,
    num_posicoes: String(s.num_posicoes ?? 1),
    cidade: s.cidade ?? "",
    estado: s.estado ?? "",
    salario: s.salario ?? "",
    adicionais_salariais: s.adicionais_salariais ?? "",
    previsao_inicio: s.previsao_inicio ?? "",
    horario_texto: s.horario_texto ?? "",
    requisitos: s.requisitos ?? "",
    beneficios: s.beneficios ?? "",
    observacoes: s.observacoes ?? "",
    confidencial: s.confidencial,
  };
}

// Corpo pro PATCH/POST: número e UF normalizados, data vazia vira null.
export function corpoDoForm(form: FormEdicaoSolicitacao) {
  return {
    ...form,
    num_posicoes: Number(form.num_posicoes) || 1,
    estado: form.estado.toUpperCase(),
    previsao_inicio: form.previsao_inicio || null,
  };
}

export default function FormularioEdicaoSolicitacao({
  aviso,
  rotuloSalvar,
  form,
  onChange,
  erro,
  salvando,
  onCancelar,
  onSalvar,
}: {
  aviso: string;
  rotuloSalvar: string;
  form: FormEdicaoSolicitacao;
  onChange: (f: FormEdicaoSolicitacao) => void;
  erro: string;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const set = <K extends keyof FormEdicaoSolicitacao>(campo: K, valor: FormEdicaoSolicitacao[K]) =>
    onChange({ ...form, [campo]: valor });
  const labelCls = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1";
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400 bg-white";

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-xs text-gray-500">{aviso}</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Cargo *</label>
          <input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tipo de serviço</label>
          <select value={form.tipo_servico} onChange={(e) => set("tipo_servico", e.target.value)} className={inputCls}>
            <option value="recrutamento_selecao">R&S</option>
            <option value="mao_obra_temporaria">MOT</option>
            <option value="terceirizacao">Terceirização</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Posições</label>
          <input
            type="number"
            min={1}
            value={form.num_posicoes}
            onChange={(e) => set("num_posicoes", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls}>Cidade *</label>
          <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>UF</label>
          <input
            value={form.estado}
            maxLength={2}
            onChange={(e) => set("estado", e.target.value.toUpperCase())}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Salário</label>
          <input value={form.salario} onChange={(e) => set("salario", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Adicionais salariais</label>
          <input
            value={form.adicionais_salariais}
            onChange={(e) => set("adicionais_salariais", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Previsão de início</label>
          <input
            type="date"
            value={form.previsao_inicio}
            onChange={(e) => set("previsao_inicio", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Horário</label>
          <input value={form.horario_texto} onChange={(e) => set("horario_texto", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Requisitos</label>
          <textarea
            rows={4}
            value={form.requisitos}
            onChange={(e) => set("requisitos", e.target.value)}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Benefícios (um por linha)</label>
          <textarea
            rows={3}
            value={form.beneficios}
            onChange={(e) => set("beneficios", e.target.value)}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Observações</label>
          <textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            className={`${inputCls} resize-y`}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={form.confidencial} onChange={(e) => set("confidencial", e.target.checked)} />
        Vaga confidencial
      </label>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancelar}
          disabled={salvando}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => {
            if (!form.cargo.trim() || !form.cidade.trim()) return;
            onSalvar();
          }}
          disabled={salvando || !form.cargo.trim() || !form.cidade.trim()}
          className="text-xs px-4 py-1.5 rounded-lg font-bold bg-black text-[#FFD700] disabled:opacity-50"
        >
          {salvando ? "Salvando..." : rotuloSalvar}
        </button>
      </div>
    </div>
  );
}
