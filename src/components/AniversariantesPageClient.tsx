"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { AniversarianteContato, Cliente } from "@/types";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function diaMes(dataISO: string): { dia: number; mes: number } {
  const [, mes, dia] = dataISO.split("-").map(Number);
  return { dia, mes };
}

function formatarDiaMes(dataISO: string): string {
  const { dia, mes } = diaMes(dataISO);
  return `${dia} de ${MESES[mes - 1] ?? "—"}`;
}

function formatarDataHoraBrasil(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function templateFelicitacao(nome: string): string {
  return `Olá ${nome},

A equipe da Salmazos RH & Terceirização de Serviços deseja um Feliz Aniversário! Que este novo ciclo seja repleto de conquistas, saúde e realizações, tanto na vida pessoal quanto profissional.

Agradecemos a parceria de sempre e estamos à disposição para o que precisar.

Um forte abraço,
Equipe Salmazos RH`;
}

interface FormState {
  clienteSelecionado: { id: string; nome: string } | null;
  empresaNome: string;
  buscaCliente: string;
  nomeContato: string;
  cargo: string;
  dataNascimento: string;
  email: string;
  telefone: string;
  observacoes: string;
}

const FORM_VAZIO: FormState = {
  clienteSelecionado: null, empresaNome: "", buscaCliente: "",
  nomeContato: "", cargo: "", dataNascimento: "", email: "", telefone: "", observacoes: "",
};

export default function AniversariantesPageClient() {
  const [itens, setItens] = useState<AniversarianteContato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [busca, setBusca] = useState("");
  const [toast, setToast] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [arquivandoId, setArquivandoId] = useState<string | null>(null);

  const [modalFelicitacaoAberto, setModalFelicitacaoAberto] = useState(false);
  const [contatoFelicitacao, setContatoFelicitacao] = useState<AniversarianteContato | null>(null);
  const [assuntoFelicitacao, setAssuntoFelicitacao] = useState("");
  const [corpoFelicitacao, setCorpoFelicitacao] = useState("");
  const [enviandoFelicitacao, setEnviandoFelicitacao] = useState(false);
  const [erroFelicitacao, setErroFelicitacao] = useState("");
  const [ultimaFelicitacao, setUltimaFelicitacao] = useState<{ enviado_em: string; enviado_por_nome: string | null } | null>(null);
  const [carregandoUltimaFelicitacao, setCarregandoUltimaFelicitacao] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (mostrarInativos) params.set("incluir_inativos", "1");
      const res = await fetch(`/api/aniversariantes?${params}`);
      const json = await res.json();
      setItens(json.data ?? []);
    } catch {
      showToast("Erro ao carregar aniversariantes.");
    } finally {
      setCarregando(false);
    }
  }, [mostrarInativos]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarClientes = () => {
    if (clientes.length > 0) return;
    fetch("/api/clientes")
      .then((r) => r.json())
      .then(({ data }) => setClientes((data ?? []).filter((c: Cliente) => c.ativo)))
      .catch(() => showToast("Erro ao carregar lista de clientes."));
  };

  const hoje = useMemo(() => obterDataHojeBrasil(), []);
  const mesAtual = hoje.getMonth() + 1;
  const diaAtual = hoje.getDate();

  // Ordenado por dia/mês, ignorando o ano — a ideia é ver o calendário anual de
  // aniversários, não "quem é mais velho".
  const ordenados = useMemo(() => {
    return [...itens].sort((a, b) => {
      const A = diaMes(a.data_nascimento);
      const B = diaMes(b.data_nascimento);
      return A.mes - B.mes || A.dia - B.dia;
    });
  }, [itens]);

  const filtrados = ordenados.filter((it) => {
    if (!busca.trim()) return true;
    const termo = busca.trim().toLowerCase();
    const empresa = it.clientes?.nome ?? it.empresa_nome ?? "";
    return it.nome_contato.toLowerCase().includes(termo) || empresa.toLowerCase().includes(termo);
  });

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErroModal("");
    setTentouSalvar(false);
    setModalAberto(true);
    carregarClientes();
  };

  const abrirEdicao = (item: AniversarianteContato) => {
    setEditandoId(item.id);
    setForm({
      clienteSelecionado: item.clientes ? { id: item.clientes.id, nome: item.clientes.nome } : null,
      empresaNome: item.empresa_nome ?? "",
      buscaCliente: "",
      nomeContato: item.nome_contato,
      cargo: item.cargo ?? "",
      dataNascimento: item.data_nascimento,
      email: item.email ?? "",
      telefone: item.telefone ?? "",
      observacoes: item.observacoes ?? "",
    });
    setErroModal("");
    setTentouSalvar(false);
    setModalAberto(true);
    carregarClientes();
  };

  const clientesFiltrados = form.buscaCliente.trim()
    ? clientes.filter((c) => c.nome.toLowerCase().includes(form.buscaCliente.trim().toLowerCase())).slice(0, 8)
    : [];

  const handleSalvar = async () => {
    setTentouSalvar(true);
    const temEmpresaOuCliente = !!form.clienteSelecionado || !!form.empresaNome.trim();
    if (!form.nomeContato.trim() || !form.dataNascimento || !temEmpresaOuCliente) {
      setErroModal("Preencha o nome do contato, a data de nascimento, e selecione um cliente ou informe a empresa.");
      return;
    }

    setSalvando(true);
    setErroModal("");
    try {
      const payload = {
        cliente_id: form.clienteSelecionado?.id ?? null,
        empresa_nome: form.clienteSelecionado ? null : form.empresaNome.trim() || null,
        nome_contato: form.nomeContato.trim(),
        cargo: form.cargo.trim() || null,
        data_nascimento: form.dataNascimento,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      const url = editandoId ? `/api/aniversariantes/${editandoId}` : "/api/aniversariantes";
      const res = await fetch(url, {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setErroModal(json.error ?? "Erro ao salvar."); setSalvando(false); return; }
      setModalAberto(false);
      showToast(editandoId ? "Aniversariante atualizado." : "Aniversariante cadastrado.");
      carregar();
    } catch {
      setErroModal("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  };

  const handleArquivar = async (item: AniversarianteContato) => {
    if (!confirm(`Arquivar "${item.nome_contato}"? Ele deixa de aparecer na lista, mas o histórico é preservado.`)) return;
    setArquivandoId(item.id);
    try {
      const res = await fetch(`/api/aniversariantes/${item.id}`, { method: "DELETE" });
      if (!res.ok) { showToast("Erro ao arquivar."); return; }
      showToast("Aniversariante arquivado.");
      carregar();
    } catch {
      showToast("Erro de conexão ao arquivar.");
    } finally {
      setArquivandoId(null);
    }
  };

  const abrirFelicitacao = (item: AniversarianteContato) => {
    setContatoFelicitacao(item);
    setAssuntoFelicitacao(`Feliz Aniversário, ${item.nome_contato}! 🎉`);
    setCorpoFelicitacao(templateFelicitacao(item.nome_contato));
    setErroFelicitacao("");
    setUltimaFelicitacao(null);
    setModalFelicitacaoAberto(true);

    setCarregandoUltimaFelicitacao(true);
    fetch(`/api/aniversariantes/${item.id}/enviar-felicitacao`)
      .then((r) => r.json())
      .then((json) => setUltimaFelicitacao(json.ultima_felicitacao ?? null))
      .catch(() => {})
      .finally(() => setCarregandoUltimaFelicitacao(false));
  };

  const handleEnviarFelicitacao = async () => {
    if (!contatoFelicitacao) return;
    if (!assuntoFelicitacao.trim() || !corpoFelicitacao.trim()) {
      setErroFelicitacao("Preencha o assunto e a mensagem.");
      return;
    }
    setEnviandoFelicitacao(true);
    setErroFelicitacao("");
    try {
      const res = await fetch(`/api/aniversariantes/${contatoFelicitacao.id}/enviar-felicitacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assunto: assuntoFelicitacao.trim(), corpo: corpoFelicitacao.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setErroFelicitacao(json.error ?? "Erro ao enviar."); return; }
      setModalFelicitacaoAberto(false);
      showToast(`Felicitação enviada para ${contatoFelicitacao.nome_contato}!`);
    } catch {
      setErroFelicitacao("Erro de conexão.");
    } finally {
      setEnviandoFelicitacao(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🎂 Aniversários</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contatos de clientes por data de nascimento — base para lembretes automáticos (em breve)</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary">+ Novo aniversariante</button>
      </div>

      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div style={{ flex: "1 1 260px" }}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Buscar</label>
          <input
            type="text" placeholder="Nome do contato ou empresa..."
            value={busca} onChange={(e) => setBusca(e.target.value)}
            className="input-field"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-2">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          Mostrar arquivados
        </label>
      </div>

      {carregando ? (
        <p className="text-center text-gray-400 text-sm py-16">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm">
            {busca ? `Nenhum aniversariante encontrado para "${busca}".` : "Nenhum aniversariante cadastrado ainda."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFAFA" }}>
                  {["Data", "Contato", "Cargo", "Empresa/Cliente", "E-mail", "Telefone", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", borderBottom: "2px solid #F3F4F6", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => {
                  const { mes, dia } = diaMes(it.data_nascimento);
                  const doMes = mes === mesAtual;
                  const ehHoje = it.ativo && mes === mesAtual && dia === diaAtual;
                  const empresa = it.clientes?.nome ?? it.empresa_nome ?? "—";
                  const td: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle", borderBottom: "1px solid #F3F4F6" };
                  return (
                    <tr key={it.id} style={{ background: doMes ? "#FFFBEB" : it.ativo ? undefined : "#FAFAFA", opacity: it.ativo ? 1 : 0.6 }}>
                      <td style={{ ...td, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
                        {doMes && <span style={{ marginRight: 6 }}>🎂</span>}
                        {formatarDiaMes(it.data_nascimento)}
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "#111827" }}>
                        {it.nome_contato}
                        {!it.ativo && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>(arquivado)</span>}
                      </td>
                      <td style={td}>{it.cargo ?? "—"}</td>
                      <td style={td}>{empresa}</td>
                      <td style={td}>
                        {it.email ? <a href={`mailto:${it.email}`} style={{ color: "#3B82F6", textDecoration: "none" }}>{it.email}</a> : "—"}
                      </td>
                      <td style={td}>{it.telefone ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {ehHoje && (
                          it.email ? (
                            <button
                              onClick={() => abrirFelicitacao(it)}
                              className="btn-outline"
                              style={{ padding: "4px 10px", fontSize: 12, marginRight: 6, borderColor: "#FFD700", color: "#92700C", background: "#FFFBEB" }}
                            >
                              🎉 Enviar felicitação
                            </button>
                          ) : (
                            <button
                              disabled
                              title="Contato sem e-mail cadastrado"
                              className="btn-outline"
                              style={{ padding: "4px 10px", fontSize: 12, marginRight: 6, opacity: 0.5, cursor: "not-allowed" }}
                            >
                              🎉 Enviar felicitação
                            </button>
                          )
                        )}
                        <button onClick={() => abrirEdicao(it)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12, marginRight: 6 }}>
                          Editar
                        </button>
                        {it.ativo && (
                          <button
                            onClick={() => handleArquivar(it)}
                            disabled={arquivandoId === it.id}
                            style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "1px solid #DC2626", background: "#FEF2F2", color: "#991B1B", cursor: "pointer", opacity: arquivandoId === it.id ? 0.6 : 1 }}
                          >
                            {arquivandoId === it.id ? "..." : "Arquivar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) setModalAberto(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-black text-white px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">{editandoId ? "Editar aniversariante" : "Novo aniversariante"}</h2>
                <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Cliente cadastrado
                </label>
                {form.clienteSelecionado ? (
                  <div className="input-field flex items-center justify-between" style={{ background: "#F9FAFB" }}>
                    <span className="text-sm text-gray-800 font-medium">{form.clienteSelecionado.nome}</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, clienteSelecionado: null }))}
                      className="text-gray-400 hover:text-gray-700 text-sm font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Buscar cliente cadastrado..."
                      value={form.buscaCliente}
                      onChange={(e) => setForm((f) => ({ ...f, buscaCliente: e.target.value }))}
                      disabled={!!form.empresaNome.trim()}
                      className="input-field"
                    />
                    {clientesFiltrados.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, marginTop: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 220, overflowY: "auto" }}>
                        {clientesFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => setForm((f) => ({ ...f, clienteSelecionado: { id: c.id, nome: c.nome }, buscaCliente: "" }))}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                            style={{ borderBottom: "1px solid #F3F4F6", display: "block" }}
                          >
                            <span className="font-medium text-gray-900">{c.nome}</span>
                            {c.cidade && <span className="text-gray-400 text-xs"> — {c.cidade}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Ou nome da empresa (se não for cliente cadastrado)
                </label>
                <input
                  type="text"
                  placeholder="Nome da empresa..."
                  value={form.empresaNome}
                  onChange={(e) => setForm((f) => ({ ...f, empresaNome: e.target.value }))}
                  disabled={!!form.clienteSelecionado}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome do contato *</label>
                <input
                  type="text" value={form.nomeContato}
                  onChange={(e) => setForm((f) => ({ ...f, nomeContato: e.target.value }))}
                  className="input-field"
                  style={tentouSalvar && !form.nomeContato.trim() ? { borderColor: "#EF4444" } : undefined}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cargo</label>
                <input type="text" value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} className="input-field" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de nascimento *</label>
                <input
                  type="date" value={form.dataNascimento}
                  onChange={(e) => setForm((f) => ({ ...f, dataNascimento: e.target.value }))}
                  className="input-field"
                  style={tentouSalvar && !form.dataNascimento ? { borderColor: "#EF4444" } : undefined}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Telefone</label>
                  <input type="text" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className="input-field resize-none"
                />
              </div>

              {erroModal && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroModal}</p>
              )}

              <div className="flex gap-3 pt-2 border-t">
                <button onClick={() => setModalAberto(false)} className="btn-outline flex-1" disabled={salvando}>Cancelar</button>
                <button onClick={handleSalvar} disabled={salvando} className="btn-primary flex-1 disabled:opacity-50">
                  {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalFelicitacaoAberto && contatoFelicitacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget && !enviandoFelicitacao) setModalFelicitacaoAberto(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-black px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg text-[#FFD700]">🎉 Felicitação — {contatoFelicitacao.nome_contato}</h2>
                <button
                  onClick={() => !enviandoFelicitacao && setModalFelicitacaoAberto(false)}
                  className="text-[#FFD700]/70 hover:text-[#FFD700] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {!carregandoUltimaFelicitacao && ultimaFelicitacao && (
                <p style={{ fontSize: 13, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 8, padding: "8px 12px" }}>
                  ⚠️ Uma felicitação já foi enviada para este contato em {formatarDataHoraBrasil(ultimaFelicitacao.enviado_em)}
                  {ultimaFelicitacao.enviado_por_nome ? ` por ${ultimaFelicitacao.enviado_por_nome}` : ""}.
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assunto</label>
                <input
                  type="text"
                  value={assuntoFelicitacao}
                  onChange={(e) => setAssuntoFelicitacao(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mensagem</label>
                <textarea
                  value={corpoFelicitacao}
                  onChange={(e) => setCorpoFelicitacao(e.target.value)}
                  rows={10}
                  className="input-field resize-none"
                  style={{ fontFamily: "inherit" }}
                />
              </div>

              {erroFelicitacao && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroFelicitacao}</p>
              )}

              <div className="flex gap-3 pt-2 border-t">
                <button onClick={() => setModalFelicitacaoAberto(false)} className="btn-outline flex-1" disabled={enviandoFelicitacao}>
                  Cancelar
                </button>
                <button onClick={handleEnviarFelicitacao} disabled={enviandoFelicitacao} className="btn-primary flex-1 disabled:opacity-50">
                  {enviandoFelicitacao ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", maxWidth: 420, textAlign: "center", background: "#111827", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 60 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
