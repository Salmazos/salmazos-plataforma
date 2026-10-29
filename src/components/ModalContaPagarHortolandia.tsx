"use client";

import { useState } from "react";
import CampoMoeda from "@/components/ui/CampoMoeda";
import CampoUnidadeFaturamento from "@/components/ui/CampoUnidadeFaturamento";
import { MSG_UNIDADE_FATURAMENTO_OBRIGATORIA } from "@/lib/unidadeFaturamento";
import type { ContaPagarRow } from "./FaturamentoHortolandiaPageClient";

interface Props {
  unidadeId: string;
  // Só a unidade Monte Mor/Hortolândia usa o campo; SBC não mostra nem envia.
  usaUnidadeFaturamento: boolean;
  // Aba aberta na tela — sugestão na criação (editável).
  unidadeFaturamentoPadrao: string;
  conta: ContaPagarRow | null;
  onClose: () => void;
  onSalva: (row: ContaPagarRow) => void;
  onExcluida: (id: string) => void;
}

interface FormState {
  data_pagamento: string;
  descricao: string;
  valor: number;
  responsavel: string;
  unidade_faturamento: string;
}

function estadoInicial(conta: ContaPagarRow | null, padrao: string): FormState {
  return {
    data_pagamento: conta?.dataPagamento ?? "",
    descricao: conta?.descricao ?? "",
    valor: conta?.valor ?? 0,
    responsavel: conta?.responsavel ?? "",
    unidade_faturamento: conta ? conta.unidadeFaturamento ?? "" : padrao,
  };
}

export default function ModalContaPagarHortolandia({ unidadeId, usaUnidadeFaturamento, unidadeFaturamentoPadrao, conta, onClose, onSalva, onExcluida }: Props) {
  const [form, setForm] = useState<FormState>(estadoInicial(conta, unidadeFaturamentoPadrao));
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.data_pagamento) return setErro("Informe a data de pagamento.");
    if (!form.descricao.trim()) return setErro("Informe a descrição do pagamento.");
    if (!form.responsavel.trim()) return setErro("Informe o responsável.");
    if (usaUnidadeFaturamento && !conta && !form.unidade_faturamento) return setErro(MSG_UNIDADE_FATURAMENTO_OBRIGATORIA);
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        data_pagamento: form.data_pagamento,
        descricao: form.descricao.trim(),
        valor: form.valor,
        responsavel: form.responsavel.trim(),
        // Na edição, vazio volta para "a definir"; SBC não envia o campo.
        ...(usaUnidadeFaturamento ? { unidade_faturamento: form.unidade_faturamento || null } : {}),
      };
      const res = await fetch(
        conta ? `/api/faturamento-hortolandia/saidas/${conta.id}` : "/api/faturamento-hortolandia/saidas",
        {
          method: conta ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // Unidade só na criação — a edição nunca troca a unidade do lançamento.
          body: JSON.stringify(conta ? payload : { ...payload, unidade_id: unidadeId }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao salvar.");
        return;
      }
      const s = json.data;
      onSalva({
        id: s.id,
        dataPagamento: s.data_pagamento,
        descricao: s.descricao,
        valor: s.valor,
        responsavel: s.responsavel,
        unidadeFaturamento: s.unidade_faturamento ?? null,
      });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!conta) return;
    if (!confirm("Excluir este lançamento de saída? Essa ação não pode ser desfeita.")) return;
    setExcluindo(true);
    setErro(null);
    try {
      const res = await fetch(`/api/faturamento-hortolandia/saidas/${conta.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao excluir.");
        return;
      }
      onExcluida(conta.id);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              {conta ? "Editar saída" : "Nova saída"} — Contas a Pagar
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              ×
            </button>
          </div>

          {erro && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

          <div>
            <label className="label">Data de Pagamento *</label>
            <input
              type="date"
              className="input-field"
              value={form.data_pagamento}
              onChange={(e) => set("data_pagamento", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Descrição Pagamento *</label>
            <input
              type="text"
              className="input-field"
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder="Ex: Aluguel do galpão, energia, manutenção..."
            />
          </div>

          <div>
            <label className="label">Valor (R$) *</label>
            <CampoMoeda
              value={form.valor}
              onChange={(v) => set("valor", v)}
              className="input-field"
              placeholder="0,00"
            />
          </div>

          <div>
            <label className="label">Responsável *</label>
            <input
              type="text"
              className="input-field"
              value={form.responsavel}
              onChange={(e) => set("responsavel", e.target.value)}
              placeholder="Quem autorizou/efetuou o pagamento"
            />
          </div>

          {usaUnidadeFaturamento && (
            <CampoUnidadeFaturamento
              value={form.unidade_faturamento}
              onChange={(v) => set("unidade_faturamento", v)}
              obrigatorio={!conta}
            />
          )}

          <div className="flex items-center justify-between pt-2">
            {conta ? (
              <button
                onClick={excluir}
                disabled={excluindo || salvando}
                className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
              >
                {excluindo ? "Excluindo..." : "Excluir"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-outline">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando} className="btn-primary">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
