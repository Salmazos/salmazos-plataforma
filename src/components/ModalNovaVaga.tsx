"use client";

import { useState, useEffect } from "react";
import { ANALISTAS, TIPOS_SERVICO, HABILIDADES, ESTADOS } from "@/lib/constants";
import type { Vaga } from "@/types";

interface ClienteOpcao {
  id: string;
  nome: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSalvo: (vaga: Vaga) => void;
}

const FORM_VAZIO = {
  titulo: "",
  cliente_id: "",
  tipo_servico: "",
  num_posicoes: "",
  prazo: "",
  status: "aberta",
  cidade: "",
  estado: "",
  salario: "",
  requisitos: "",
  beneficios: "",
  horario: "",
  observacoes: "",
  responsavel: "",
};

const CORES_TIPO: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#ffffff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000000" },
  terceirizacao:         { bg: "#1D9E75", color: "#ffffff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#ffffff" },
};

export default function ModalNovaVaga({ isOpen, onClose, onSalvo }: Props) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [habilidades, setHabilidades] = useState<string[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (isOpen) {
      setForm(FORM_VAZIO);
      setHabilidades([]);
      setErro("");
      fetch("/api/clientes")
        .then((r) => r.json())
        .then((j) => setClientes(j.data ?? []));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleHabilidade = (h: string) =>
    setHabilidades((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );

  const handleSalvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/vagas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cliente_id: form.cliente_id || null,
          num_posicoes: Number(form.num_posicoes),
          habilidades_desejadas: habilidades,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao salvar.");
        return;
      }
      onSalvo(json.data);
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg">Nova vaga</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Título da vaga *
            </label>
            <input
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex: Analista de RH Pleno"
              className="input-field"
            />
          </div>

          {/* Cliente + Responsável */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Cliente vinculado
              </label>
              <select
                value={form.cliente_id}
                onChange={(e) => set("cliente_id", e.target.value)}
                className="input-field"
              >
                <option value="">Banco de Talentos</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Responsável *
              </label>
              <select
                value={form.responsavel}
                onChange={(e) => set("responsavel", e.target.value)}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {ANALISTAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo de serviço */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Tipo de serviço *
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_SERVICO.map((tipo) => {
                const ativo = form.tipo_servico === tipo.id;
                const cores = CORES_TIPO[tipo.id];
                const btnStyle: React.CSSProperties = ativo
                  ? { backgroundColor: cores.bg, color: cores.color, border: `2px solid ${cores.bg}` }
                  : { backgroundColor: "#FFFFFF", color: "#374151", border: "2px solid #D1D5DB" };
                const checkColor = ativo ? cores.color : "#9CA3AF";

                return (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => set("tipo_servico", tipo.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all"
                    style={btnStyle}
                  >
                    <span
                      className="flex items-center justify-center shrink-0 rounded-full"
                      style={{
                        width: 16,
                        height: 16,
                        border: `2px solid ${checkColor}`,
                        color: checkColor,
                      }}
                    >
                      {ativo && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: checkColor,
                            display: "block",
                          }}
                        />
                      )}
                    </span>
                    <span style={{ lineHeight: 1.3 }}>{tipo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Posições + Prazo + Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Nº de posições *
              </label>
              <input
                type="number"
                min="1"
                value={form.num_posicoes}
                onChange={(e) => set("num_posicoes", e.target.value)}
                placeholder="1"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Prazo
              </label>
              <input
                type="date"
                value={form.prazo}
                onChange={(e) => set("prazo", e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="input-field"
              >
                <option value="aberta">Aberta</option>
                <option value="em_andamento">Em andamento</option>
                <option value="fechada">Fechada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>

          {/* Cidade + Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Cidade
              </label>
              <input
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                placeholder="Ex: São Paulo"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Estado
              </label>
              <select
                value={form.estado}
                onChange={(e) => set("estado", e.target.value)}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {ESTADOS.map((e) => (
                  <option key={e.uf} value={e.uf}>
                    {e.uf} — {e.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Salário */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Salário
            </label>
            <input
              value={form.salario}
              onChange={(e) => set("salario", e.target.value)}
              placeholder="Ex: R$ 2.500,00 ou À combinar ou Enviar Pretensão Salarial"
              className="input-field"
            />
          </div>

          {/* Horário */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Horário de trabalho
            </label>
            <textarea
              value={form.horario}
              onChange={(e) => set("horario", e.target.value)}
              placeholder="Ex: Segunda à sexta das 08h00 às 17h30"
              rows={2}
              className="input-field resize-none"
            />
          </div>

          {/* Requisitos */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Requisitos
            </label>
            <textarea
              value={form.requisitos}
              onChange={(e) => set("requisitos", e.target.value)}
              placeholder="Descreva os requisitos e responsabilidades da vaga..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Benefícios */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Benefícios
            </label>
            <textarea
              value={form.beneficios}
              onChange={(e) => set("beneficios", e.target.value)}
              placeholder="Vale transporte, Vale refeição, Convênio Médico..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Habilidades desejadas */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Habilidades desejadas
            </p>
            <div className="flex flex-wrap gap-2">
              {HABILIDADES.map((h) => {
                const ativo = habilidades.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHabilidade(h)}
                    className="text-xs px-3 py-1.5 rounded-full border transition-all font-medium"
                    style={
                      ativo
                        ? { backgroundColor: "#000000", color: "#FFD700", borderColor: "#000000" }
                        : { backgroundColor: "#FFFFFF", color: "#374151", borderColor: "#D1D5DB" }
                    }
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Observações internas */}
          <div className="border-t pt-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Observações internas
            </label>
            <textarea
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              placeholder="Anotações internas sobre a vaga..."
              rows={2}
              className="input-field resize-none"
            />
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={onClose} className="btn-outline" disabled={salvando}>
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={salvando}
              className="btn-primary disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Cadastrar vaga"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
