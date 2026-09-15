"use client";

import { useEffect, useState } from "react";
import { TIPOS_SERVICO } from "@/lib/constants";
import { formatarCPF } from "@/lib/utils";
import type { CandidatoElegivel } from "./ModalIniciarAdmissao";

// Só MOT e Terceirização — R&S "vaga casada" não faz sentido (cliente contrata direto, sem
// fee/garantia de uma seleção que nunca existiu) e Avaliação Psicológica não gera admissão.
// Mesma restrição decidida com o Olver (15/09) que já está travada no backend
// (admissaoRapidaSchema, lib/schemas.ts) — repetida aqui só pra não deixar a tela oferecer
// uma opção que a API vai rejeitar de qualquer forma.
const TIPOS_SERVICO_VAGA_CASADA = TIPOS_SERVICO.filter(
  (t) => t.id === "mao_obra_temporaria" || t.id === "terceirizacao"
);

interface ClienteOpcao {
  id: string;
  nome: string;
}

interface CandidatoExistente {
  id: string;
  nome_completo: string;
  etapa_kanban: string;
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // Vaga casada + candidato já criados no backend, no estado exato que ModalIniciarAdmissao
  // espera em `preSelecionado` — quem chama abre aquele modal em seguida pro passo final
  // ("Criar admissão"), sem duplicar nenhuma tela.
  onCriado: (candidato: CandidatoElegivel) => void;
}

export default function ModalAdmissaoRapida({ isOpen, onClose, onCriado }: Props) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [tipoServico, setTipoServico] = useState<"mao_obra_temporaria" | "terceirizacao">("mao_obra_temporaria");
  const [funcao, setFuncao] = useState("");
  const [candidatoNome, setCandidatoNome] = useState("");
  const [candidatoTelefone, setCandidatoTelefone] = useState("");
  const [candidatoEmail, setCandidatoEmail] = useState("");
  const [candidatoCpf, setCandidatoCpf] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [candidatoJaExiste, setCandidatoJaExiste] = useState<CandidatoExistente | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setClienteId("");
    setTipoServico("mao_obra_temporaria");
    setFuncao("");
    setCandidatoNome("");
    setCandidatoTelefone("");
    setCandidatoEmail("");
    setCandidatoCpf("");
    setErro("");
    setEnviando(false);
    setCandidatoJaExiste(null);
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((j) => setClientes((j.data ?? []).map((c: { id: string; nome: string }) => ({ id: c.id, nome: c.nome }))));
  }, [isOpen]);

  if (!isOpen) return null;

  const dadosValidos = Boolean(clienteId && funcao.trim() && candidatoNome.trim());

  const enviar = async (confirmarDuplicata: boolean) => {
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/admissoes/admissao-rapida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: clienteId,
          tipo_servico: tipoServico,
          funcao: funcao.trim(),
          candidato_nome: candidatoNome.trim(),
          candidato_telefone: candidatoTelefone.trim(),
          candidato_email: candidatoEmail.trim(),
          candidato_cpf: candidatoCpf.trim(),
          confirmar_duplicata: confirmarDuplicata,
        }),
      });
      const json = await res.json();

      if (res.status === 409 && json.jaExiste) {
        setCandidatoJaExiste(json.candidatoExistente);
        setEnviando(false);
        return;
      }

      if (!res.ok) {
        setErro(json.error || "Erro ao criar a vaga casada.");
        setEnviando(false);
        return;
      }

      onCriado(json.data as CandidatoElegivel);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      setEnviando(false);
    }
  };

  const handleSubmit = () => {
    if (!dadosValidos) return;
    enviar(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900">Admissão Rápida</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Vaga casada — o cliente já indicou o candidato, sem processo seletivo. Cria a vaga
          internamente (nunca aparece no site) e já vincula o candidato como contratado.
        </p>

        {candidatoJaExiste ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-2xl mb-2">⚠️</p>
            <p className="font-bold text-gray-900 text-base mb-1">Candidato já cadastrado</p>
            <p className="text-sm text-gray-600 mb-1">
              <strong>{candidatoJaExiste.nome_completo}</strong> já está em nosso banco de dados com este CPF,
              desde {new Date(candidatoJaExiste.created_at).toLocaleDateString("pt-BR")}.
            </p>
            <p className="text-sm text-gray-500 mb-5">
              Deseja usar o cadastro existente para vincular a esta vaga casada?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setCandidatoJaExiste(null)} className="btn-outline" disabled={enviando}>
                Corrigir CPF
              </button>
              <button onClick={() => enviar(true)} className="btn-primary" disabled={enviando}>
                {enviando ? "Vinculando..." : "Usar candidato existente"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente *</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="input-field">
                <option value="">Selecione o cliente...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de serviço *</label>
              <select
                value={tipoServico}
                onChange={(e) => setTipoServico(e.target.value as "mao_obra_temporaria" | "terceirizacao")}
                className="input-field"
              >
                {TIPOS_SERVICO_VAGA_CASADA.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Função / cargo *</label>
              <input
                type="text" value={funcao} onChange={(e) => setFuncao(e.target.value)}
                placeholder="Ex: Auxiliar de Produção"
                className="input-field"
              />
            </div>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 pt-2 border-t">
              Candidato indicado pelo cliente
            </p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome completo *</label>
              <input
                type="text" value={candidatoNome} onChange={(e) => setCandidatoNome(e.target.value)}
                placeholder="Nome do candidato"
                className="input-field"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Telefone</label>
              <input
                type="text" value={candidatoTelefone} onChange={(e) => setCandidatoTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="input-field"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
              <input
                type="email" value={candidatoEmail} onChange={(e) => setCandidatoEmail(e.target.value)}
                placeholder="candidato@exemplo.com"
                className="input-field"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CPF</label>
              <input
                type="text" value={candidatoCpf} onChange={(e) => setCandidatoCpf(formatarCPF(e.target.value))}
                placeholder="000.000.000-00"
                className="input-field"
              />
              <p className="text-xs text-gray-400 mt-1">
                Usado só pra evitar cadastro duplicado. Sem CPF, um cadastro novo é sempre criado.
              </p>
            </div>

            {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>Cancelar</button>
              <button onClick={handleSubmit} disabled={!dadosValidos || enviando} className="btn-primary flex-1 disabled:opacity-50">
                {enviando ? "Criando..." : "Criar vaga e continuar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
