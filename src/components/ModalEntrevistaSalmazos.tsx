"use client";

import { useState, useEffect } from "react";
import type { KanbanCard } from "@/types";

type ClienteOpcao = { id: string; nome: string };

interface Props {
  isOpen: boolean;
  card: KanbanCard;
  onClose: () => void;
  onConfirmar: (dados: {
    cliente_id: string;
    data_entrevista_salmazos: string;
    comentario: string;
  }) => void;
}

export default function ModalEntrevistaSalmazos({ isOpen, card, onClose, onConfirmar }: Props) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [dataEntrevista, setDataEntrevista] = useState("");
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setClienteId(card.cliente_id ?? "");
    setDataEntrevista("");
    setComentario("");
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((j) => setClientes(j.data ?? []))
      .catch(() => {});
  }, [isOpen, card.cliente_id]);

  if (!isOpen) return null;

  const handleConfirmar = () => {
    onConfirmar({
      cliente_id: clienteId,
      data_entrevista_salmazos: dataEntrevista,
      comentario: comentario.trim(),
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "24px 28px",
          width: 460,
          maxWidth: "90vw",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
          {"📋"} Agendar Entrevista Salmazos
        </h2>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 4px" }}>
          {card.nome_completo}
        </p>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 20px" }}>
          Vaga: {card.vaga_titulo}
        </p>

        <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
          Para qual cliente? (opcional)
        </label>
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: clienteId ? "#111827" : "#9CA3AF",
            outline: "none",
            marginBottom: 16,
            boxSizing: "border-box",
            background: "#fff",
          }}
        >
          <option value="">Selecione se já souber...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
          Data da entrevista (opcional)
        </label>
        <input
          type="date"
          value={dataEntrevista}
          onChange={(e) => setDataEntrevista(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: "#111827",
            outline: "none",
            marginBottom: 16,
            boxSizing: "border-box",
          }}
        />

        <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
          Comentário (opcional)
        </label>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Adicione um comentário..."
          rows={3}
          style={{
            width: "100%",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: "#111827",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              background: "#fff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "#FFB800",
              color: "#000",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
