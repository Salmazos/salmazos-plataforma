"use client";

import { useState } from "react";
import ModalNovoCliente from "./ModalNovoCliente";
import { TIPOS_SERVICO } from "@/lib/constants";

const CORES_SERVICO: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#ffffff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000000" },
  terceirizacao:         { bg: "#1D9E75", color: "#ffffff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#ffffff" },
};
import type { Cliente } from "@/types";

interface ClienteComCount extends Cliente {
  total_encaminhamentos: number;
}

interface Props {
  clientes: ClienteComCount[];
}

export default function ClientesPageClient({ clientes: inicial }: Props) {
  const [clientes, setClientes] = useState<ClienteComCount[]>(inicial);
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [filtroAtivos, setFiltroAtivos] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [busca, setBusca] = useState("");

  const handleSalvo = (clienteAtualizado: Cliente) => {
    setClientes((prev) => {
      const existe = prev.find((c) => c.id === clienteAtualizado.id);
      if (existe) {
        return prev.map((c) =>
          c.id === clienteAtualizado.id
            ? { ...clienteAtualizado, total_encaminhamentos: c.total_encaminhamentos }
            : c
        );
      }
      return [{ ...clienteAtualizado, total_encaminhamentos: 0 }, ...prev];
    });
  };

  const abrirEdicao = (c: Cliente) => {
    setClienteEditando(c);
    setModalAberto(true);
  };

  const abrirNovo = () => {
    setClienteEditando(null);
    setModalAberto(true);
  };

  const filtrados = clientes.filter((c) => {
    const matchFiltro =
      filtroAtivos === "todos" ||
      (filtroAtivos === "ativos" && c.ativo) ||
      (filtroAtivos === "inativos" && !c.ativo);
    const matchBusca =
      !busca ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.cidade.toLowerCase().includes(busca.toLowerCase()) ||
      c.segmento.toLowerCase().includes(busca.toLowerCase());
    return matchFiltro && matchBusca;
  });

  const totais = {
    ativos: clientes.filter((c) => c.ativo).length,
    inativos: clientes.filter((c) => !c.ativo).length,
    encaminhamentos: clientes.reduce((s, c) => s + c.total_encaminhamentos, 0),
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Empresas parceiras e encaminhamentos
          </p>
        </div>
        <button onClick={abrirNovo} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo cliente
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-black">{totais.ativos}</p>
          <p className="text-xs text-gray-500 mt-1">Clientes ativos</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-gray-400">{totais.inativos}</p>
          <p className="text-xs text-gray-500 mt-1">Inativos</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-3xl font-bold text-[#FFD700]">{totais.encaminhamentos}</p>
          <p className="text-xs text-gray-500 mt-1">Encaminhamentos</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar cliente, cidade ou segmento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(["ativos", "todos", "inativos"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroAtivos(f)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                filtroAtivos === f
                  ? "bg-black text-[#FFD700] font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "ativos" ? "Ativos" : f === "inativos" ? "Inativos" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="font-medium">Nenhum cliente encontrado</p>
          {filtroAtivos === "ativos" && clientes.length > 0 && (
            <p className="text-sm mt-1">Tente mudar o filtro para "Todos"</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((c) => (
            <ClienteRow key={c.id} cliente={c} onEditar={() => abrirEdicao(c)} />
          ))}
        </div>
      )}

      <ModalNovoCliente
        isOpen={modalAberto}
        cliente={clienteEditando}
        onClose={() => setModalAberto(false)}
        onSalvo={handleSalvo}
      />
    </div>
  );
}

function ClienteRow({
  cliente,
  onEditar,
}: {
  cliente: ClienteComCount;
  onEditar: () => void;
}) {
  return (
    <div className={`card flex flex-wrap items-center gap-4 ${!cliente.ativo ? "opacity-60" : ""}`}>
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-black text-[#FFD700] flex items-center justify-center text-sm font-bold shrink-0">
        {cliente.nome.charAt(0).toUpperCase()}
      </div>

      {/* Dados */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900">{cliente.nome}</p>
          {!cliente.ativo && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              Inativo
            </span>
          )}
          <span className="text-xs bg-black/5 text-gray-600 px-2 py-0.5 rounded-full">
            {cliente.segmento}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            {cliente.cidade}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {cliente.contato_nome} · {cliente.contato_telefone}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {cliente.contato_email}
          </span>
          {cliente.responsavel_comercial && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6a4 4 0 11-8 0 4 4 0 018 0zm-8 8a4 4 0 00-4 4h16a4 4 0 00-4-4H8z" />
              </svg>
              Resp.: {cliente.responsavel_comercial}
            </span>
          )}
        </div>
      </div>

      {/* Badges de serviços */}
      {cliente.servicos?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 shrink-0 max-w-[200px]">
          {TIPOS_SERVICO.filter((t) => cliente.servicos.includes(t.id)).map((t) => {
            const cores = CORES_SERVICO[t.id];
            return (
              <span
                key={t.id}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: cores.bg, color: cores.color }}
              >
                {t.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Encaminhamentos count */}
      <div className="text-center shrink-0">
        <p className="text-2xl font-bold text-[#FFD700]">
          {cliente.total_encaminhamentos}
        </p>
        <p className="text-xs text-gray-400">encaminhamentos</p>
      </div>

      {/* Editar */}
      <button
        onClick={onEditar}
        className="btn-outline shrink-0 text-sm"
      >
        Editar
      </button>
    </div>
  );
}
