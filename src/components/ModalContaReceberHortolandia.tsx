"use client";

import { useEffect, useState } from "react";
import CampoMoeda from "@/components/ui/CampoMoeda";
import CampoUnidadeFaturamento from "@/components/ui/CampoUnidadeFaturamento";
import { ehUnidadeFaturamento, MSG_UNIDADE_FATURAMENTO_OBRIGATORIA } from "@/lib/unidadeFaturamento";
import type { ContaReceberRow } from "./FaturamentoHortolandiaPageClient";

interface ClienteOpcao {
  id: string;
  nome: string;
  ativo?: boolean;
  unidade_id?: string;
  unidade_faturamento?: string | null;
}

// Pré-preenchimento do modo criação (ex.: lançamento vindo de uma Cobrança R&S). Ignorado na edição.
export type LancamentoInicial = Partial<Pick<FormState, "cliente_id" | "valor" | "data_vencimento" | "observacoes" | "unidade_faturamento">>;

interface Props {
  unidadeId: string;
  // Só a unidade Monte Mor/Hortolândia usa o campo; SBC não mostra nem envia.
  usaUnidadeFaturamento: boolean;
  // Aba aberta na tela — sugestão na criação quando o cliente ainda não tem unidade de faturamento (editável).
  unidadeFaturamentoPadrao: string;
  conta: ContaReceberRow | null;
  inicial?: LancamentoInicial;
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
  unidade_faturamento: string;
}

function estadoInicial(conta: ContaReceberRow | null, inicial?: LancamentoInicial): FormState {
  if (!conta && inicial) {
    return { ...estadoInicial(null), ...inicial };
  }
  return {
    cliente_id: conta?.clienteId ?? "",
    numero_nf: conta?.numeroNf ?? "",
    valor: conta?.valor ?? 0,
    data_vencimento: conta?.dataVencimento ?? "",
    data_pagamento: conta?.dataPagamento ?? "",
    data_emissao_nf: conta?.dataEmissaoNf ?? "",
    status: (conta?.status as FormState["status"]) ?? "pendente",
    observacoes: conta?.observacoes ?? "",
    unidade_faturamento: conta?.unidadeFaturamento ?? "",
  };
}

export default function ModalContaReceberHortolandia({ unidadeId, usaUnidadeFaturamento, unidadeFaturamentoPadrao, conta, inicial, onClose, onSalva, onExcluida }: Props) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [form, setForm] = useState<FormState>(estadoInicial(conta, inicial));
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clientes")
      .then((r) => r.json())
      // Só clientes da unidade do faturamento aberto — a API recusa cliente de outra unidade.
      .then((j) => setClientes((j.data ?? []).filter((c: ClienteOpcao) => c.ativo !== false && c.unidade_id === unidadeId)))
      .catch(() => setClientes([]));
  }, [unidadeId]);

  // Criação: o lançamento guarda a unidade de faturamento do cliente no momento (snapshot, editável aqui). Cliente sem unidade definida
  // cai na aba aberta; se a aba for "A definir" fica em branco e o campo obrigatório pede para escolher.
  useEffect(() => {
    if (conta || !usaUnidadeFaturamento) return;
    setForm((f) => {
      if (f.unidade_faturamento) return f;
      const doCliente = clientes.find((c) => c.id === f.cliente_id)?.unidade_faturamento;
      const valor = ehUnidadeFaturamento(doCliente) ? doCliente : unidadeFaturamentoPadrao;
      return valor ? { ...f, unidade_faturamento: valor } : f;
    });
  }, [clientes, conta, usaUnidadeFaturamento, unidadeFaturamentoPadrao]);

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.cliente_id) return setErro("Selecione um cliente.");
    if (!form.data_vencimento) return setErro("Informe o vencimento.");
    if (usaUnidadeFaturamento && !conta && !form.unidade_faturamento) return setErro(MSG_UNIDADE_FATURAMENTO_OBRIGATORIA);
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
        // Na edição, vazio volta para "a definir"; SBC não envia o campo.
        ...(usaUnidadeFaturamento ? { unidade_faturamento: form.unidade_faturamento || null } : {}),
      };
      const res = await fetch(conta ? `/api/faturamento-hortolandia/${conta.id}` : "/api/faturamento-hortolandia", {
        method: conta ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // Unidade só na criação — a edição nunca troca a unidade do lançamento.
        body: JSON.stringify(conta ? payload : { ...payload, unidade_id: unidadeId }),
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
        unidadeFaturamento: c.unidade_faturamento ?? null,
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
              onChange={(e) => {
                const id = e.target.value;
                set("cliente_id", id);
                // Troca de cliente na criação: acompanha a unidade de faturamento do novo cliente, se ela estiver definida.
                const doCliente = clientes.find((c) => c.id === id)?.unidade_faturamento;
                if (!conta && usaUnidadeFaturamento && ehUnidadeFaturamento(doCliente)) set("unidade_faturamento", doCliente);
              }}
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

          {usaUnidadeFaturamento && (
            <CampoUnidadeFaturamento
              value={form.unidade_faturamento}
              onChange={(v) => set("unidade_faturamento", v)}
              obrigatorio={!conta}
            />
          )}

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
