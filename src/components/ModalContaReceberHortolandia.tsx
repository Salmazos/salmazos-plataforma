"use client";

import { useEffect, useState } from "react";
import CampoMoeda from "@/components/ui/CampoMoeda";
import type { ContaReceberRow } from "./FaturamentoHortolandiaPageClient";

interface ClienteOpcao {
  id: string;
  nome: string;
  ativo?: boolean;
}

interface Props {
  conta: ContaReceberRow | null;
  onClose: () => void;
  onSalva: (row: ContaReceberRow) => void;
  onExcluida: (id: string) => void;
}

interface FormState {
  cliente_id: string;
  numero_nf: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string;
  data_emissao_nf: string;
  status: "pendente" | "pago" | "cancelado";
  observacoes: string;
}

function estadoInicial(conta: ContaReceberRow | null): FormState {
  return {
    cliente_id: conta?.clienteId ?? "",
    numero_nf: conta?.numeroNf ?? "",
    valor: conta?.valor ?? 0,
    data_vencimento: conta?.dataVencimento ?? "",
    data_pagamento: conta?.dataPagamento ?? "",
    data_emissao_nf: conta?.dataEmissaoNf ?? "",
    status: (conta?.status as FormState["status"]) ?? "pendente",
    observacoes: conta?.observacoes ?? "",
  };
}

export default function ModalContaReceberHortolandia({ conta, onClose, onSalva, onExcluida }: Props) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [form, setForm] = useState<FormState>(estadoInicial(conta));
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((j) => setClientes((j.data ?? []).filter((c: ClienteOpcao) => c.ativo !== false)))
      .catch(() => setClientes([]));
  }, []);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.cliente_id) return setErro("Selecione um cliente.");
    if (!form.data_vencimento) return setErro("Informe o vencimento.");
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        cliente_id: form.cliente_id,
        numero_nf: form.numero_nf || null,
        valor: form.valor,
        data_vencimento: form.data_vencimento,
        data_pagamento: form.data_pagamento || null,
        data_emissao_nf: form.data_emissao_nf || null,
        status: form.status,
        observacoes: form.observacoes || null,
      };
      const res = await fetch(conta ? `/api/faturamento-hortolandia/${conta.id}` : "/api/faturamento-hortolandia", {
        method: conta ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao salvar.");
        return;
      }
      const c = json.data;
      onSalva({
        id: c.id,
        clienteId: c.cliente_id,
        clienteNome: (Array.isArray(c.clientes) ? c.clientes[0]?.nome : c.clientes?.nome) ?? "—",
        numeroNf: c.numero_nf,
        valor: c.valor,
        dataVencimento: c.data_vencimento,
        dataPagamento: c.data_pagamento,
        dataEmissaoNf: c.data_emissao_nf,
        status: c.status,
        observacoes: c.observacoes,
        impostoPercentualManual: c.imposto_percentual_manual,
      });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!conta) return;
    if (!confirm("Excluir este lançamento de contas a receber? Essa ação não pode ser desfeita.")) return;
    setExcluindo(true);
    setErro(null);
    try {
      const res = await fetch(`/api/faturamento-hortolandia/${conta.id}`, { method: "DELETE" });
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
              {conta ? "Editar lançamento" : "Novo lançamento"} — Contas a Receber
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              ×
            </button>
          </div>

          {erro && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

          <div>
            <label className="label">Cliente *</label>
            <select
              className="input-field"
              value={form.cliente_id}
              onChange={(e) => set("cliente_id", e.target.value)}
            >
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nº NF</label>
              <input
                type="text"
                className="input-field"
                value={form.numero_nf}
                onChange={(e) => set("numero_nf", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input-field"
                value={form.status}
                onChange={(e) => set("status", e.target.value as FormState["status"])}
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vencimento *</label>
              <input
                type="date"
                className="input-field"
                value={form.data_vencimento}
                onChange={(e) => set("data_vencimento", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Emissão NF/Acordo</label>
              <input
                type="date"
                className="input-field"
                value={form.data_emissao_nf}
                onChange={(e) => set("data_emissao_nf", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Pagamento</label>
            <input
              type="date"
              className="input-field"
              value={form.data_pagamento}
              onChange={(e) => set("data_pagamento", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea
              className="input-field"
              rows={2}
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
            />
          </div>

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
