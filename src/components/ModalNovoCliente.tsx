"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SEGMENTOS_CLIENTE, TIPOS_SERVICO, ANALISTAS, ENTIDADES_CONTRATANTES } from "@/lib/constants";
import type { Cliente } from "@/types";

interface Props {
  isOpen: boolean;
  cliente?: Cliente | null;
  onClose: () => void;
  onSalvo: (cliente: Cliente) => void;
}

const FORM_VAZIO = {
  nome: "",
  contato_nome: "",
  contato_telefone: "",
  contato_email: "",
  cidade: "",
  segmento: "",
  responsavel_comercial: "",
  entidade_contratante: "",
};

export default function ModalNovoCliente({ isOpen, cliente, onClose, onSalvo }: Props) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [servicos, setServicos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmandoInativar, setConfirmandoInativar] = useState(false);
  const [senhaPortal, setSenhaPortal] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [criandoAcesso, setCriandoAcesso] = useState(false);
  const [acessoCriado, setAcessoCriado] = useState(false);
  const [erroAcesso, setErroAcesso] = useState("");
  const [temAcesso, setTemAcesso] = useState<boolean | null>(null);

  const editando = !!cliente;

  useEffect(() => {
    if (isOpen) {
      setForm(
        cliente
          ? {
              nome: cliente.nome,
              contato_nome: cliente.contato_nome,
              contato_telefone: cliente.contato_telefone,
              contato_email: cliente.contato_email,
              cidade: cliente.cidade,
              segmento: cliente.segmento,
              responsavel_comercial: cliente.responsavel_comercial ?? "",
              entidade_contratante: cliente.entidade_contratante ?? "",
            }
          : FORM_VAZIO
      );
      setServicos(cliente?.servicos ?? []);
      setErro("");
      setConfirmandoInativar(false);
      setSenhaPortal("");
      setMostrarSenha(false);
      setCriandoAcesso(false);
      setAcessoCriado(false);
      setErroAcesso("");
      setTemAcesso(null);

      if (cliente) {
        let active = true;
        fetch(`/api/clientes/portal-acesso?cliente_id=${cliente.id}`)
          .then((r) => r.json())
          .then((json) => { if (active) setTemAcesso(json.temAcesso ?? false); })
          .catch(() => { if (active) setTemAcesso(false); });
        return () => { active = false; };
      }
    }
  }, [isOpen, cliente]);

  if (!isOpen) return null;

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleServico = (id: string) =>
    setServicos((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const handleSalvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const url = editando ? `/api/clientes/${cliente!.id}` : "/api/clientes";
      const method = editando ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, servicos }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao salvar."); return; }
      onSalvo(json.data);
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  const handleCriarAcesso = async () => {
    setCriandoAcesso(true);
    setErroAcesso("");
    try {
      const atualizando = temAcesso === true;
      const res = await fetch("/api/clientes/portal-acesso", {
        method: atualizando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          atualizando
            ? { cliente_id: cliente!.id, senha: senhaPortal }
            : { cliente_id: cliente!.id, email: form.contato_email, senha: senhaPortal }
        ),
      });
      const json = await res.json();
      if (!res.ok) { setErroAcesso(json.error ?? "Erro."); return; }
      setAcessoCriado(true);
    } catch {
      setErroAcesso("Erro de conexão.");
    } finally {
      setCriandoAcesso(false);
    }
  };

  const handleInativar = async () => {
    if (!confirmandoInativar) { setConfirmandoInativar(true); return; }
    setSalvando(true);
    try {
      const res = await fetch(`/api/clientes/${cliente!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !cliente!.ativo }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro."); return; }
      onSalvo(json.data);
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg">
            {editando ? "Editar cliente" : "Novo cliente"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Nome da empresa */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Nome da empresa *
            </label>
            <input
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Ex: Indústrias Exemplo Ltda"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Cidade *
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
                Segmento *
              </label>
              <select
                value={form.segmento}
                onChange={(e) => set("segmento", e.target.value)}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {SEGMENTOS_CLIENTE.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsável Comercial */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Responsável Comercial
            </label>
            <select
              value={form.responsavel_comercial}
              onChange={(e) => set("responsavel_comercial", e.target.value)}
              className="input-field"
            >
              <option value="">Sem responsável</option>
              {ANALISTAS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Entidade contratante */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Entidade contratante (razão social)
            </label>
            <select
              value={form.entidade_contratante}
              onChange={(e) => set("entidade_contratante", e.target.value)}
              className="input-field"
            >
              <option value="">Não definido</option>
              {ENTIDADES_CONTRATANTES.map((e) => (
                <option key={e.value} value={e.value}>{e.razaoSocial}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Necessário para gerar a Autorização Sindical na admissão de candidatos deste cliente.
            </p>
          </div>

          {/* Tipos de serviço */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Tipos de serviço
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_SERVICO.map((tipo) => {
                const ativo = servicos.includes(tipo.id);
                const bgAtivo: Record<string, string> = {
                  recrutamento_selecao:  "#1D6FA4",
                  mao_obra_temporaria:   "#FFD700",
                  terceirizacao:         "#1D9E75",
                  avaliacao_psicologica: "#6B4FBB",
                };
                const colorAtivo: Record<string, string> = {
                  recrutamento_selecao:  "#FFFFFF",
                  mao_obra_temporaria:   "#000000",
                  terceirizacao:         "#FFFFFF",
                  avaliacao_psicologica: "#FFFFFF",
                };
                const btnStyle: React.CSSProperties = ativo
                  ? { backgroundColor: bgAtivo[tipo.id], color: colorAtivo[tipo.id], border: `2px solid ${bgAtivo[tipo.id]}` }
                  : { backgroundColor: "#FFFFFF", color: "#374151", border: "2px solid #D1D5DB" };
                const checkColor = ativo ? colorAtivo[tipo.id] : "#9CA3AF";

                return (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => toggleServico(tipo.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all"
                    style={btnStyle}
                  >
                    <span
                      className="flex items-center justify-center shrink-0 rounded"
                      style={{ width: 16, height: 16, border: `2px solid ${checkColor}`, color: checkColor }}
                    >
                      {ativo && (
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span style={{ lineHeight: 1.3 }}>{tipo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contato */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Dados do contato
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome do contato *</label>
                <input
                  value={form.contato_nome}
                  onChange={(e) => set("contato_nome", e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Telefone *</label>
                  <input
                    value={form.contato_telefone}
                    onChange={(e) => set("contato_telefone", e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
                  <input
                    type="email"
                    value={form.contato_email}
                    onChange={(e) => set("contato_email", e.target.value)}
                    placeholder="contato@empresa.com"
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Acesso ao Portal */}
          {editando && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Acesso ao Portal do Cliente
              </p>
              {acessoCriado ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {temAcesso ? "Senha atualizada com sucesso!" : "Acesso criado com sucesso!"}
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">E-mail</label>
                    <input
                      value={form.contato_email}
                      readOnly
                      className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      {temAcesso ? "Nova senha do portal" : "Senha do portal"}
                    </label>
                    <div className="relative">
                      <input
                        type={mostrarSenha ? "text" : "password"}
                        value={senhaPortal}
                        onChange={(e) => setSenhaPortal(e.target.value)}
                        placeholder="Digite a senha de acesso"
                        className="input-field pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((v) => !v)}
                        aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                        className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {erroAcesso && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {erroAcesso}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleCriarAcesso}
                    disabled={criandoAcesso || !senhaPortal || temAcesso === null}
                    className="text-sm px-4 py-2 rounded-lg bg-black text-[#FFD700] font-medium transition-colors hover:bg-gray-800 disabled:opacity-50"
                  >
                    {criandoAcesso
                      ? (temAcesso ? "Atualizando..." : "Criando...")
                      : temAcesso === null
                      ? "Verificando..."
                      : temAcesso
                      ? "Atualizar senha do portal"
                      : "Criar acesso ao portal"}
                  </button>
                </div>
              )}
            </div>
          )}

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          {/* Ações */}
          <div className="flex items-center justify-between pt-2 border-t gap-3">
            {editando && (
              <button
                onClick={handleInativar}
                disabled={salvando}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                  confirmandoInativar
                    ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                    : cliente!.ativo
                    ? "text-red-600 border-red-200 hover:bg-red-50"
                    : "text-green-700 border-green-200 hover:bg-green-50"
                }`}
              >
                {confirmandoInativar
                  ? "Confirmar?"
                  : cliente!.ativo
                  ? "Inativar cliente"
                  : "Reativar cliente"}
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button onClick={onClose} className="btn-outline" disabled={salvando}>
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando}
                className="btn-primary disabled:opacity-50"
              >
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar cliente"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
