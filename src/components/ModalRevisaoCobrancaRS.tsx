"use client";

import { useEffect, useState } from "react";
import CampoMoeda from "@/components/ui/CampoMoeda";
import type { CobrancaRSRow } from "./CobrancasRSPageClient";

interface CobrancaDetalhe {
  id: string;
  tipo: "contratacao" | "cancelamento";
  vaga_id: string;
  candidato_id: string | null;
  cliente_id: string | null;
  cliente_nome_snapshot: string;
  cliente_cnpj_snapshot: string | null;
  cliente_endereco_snapshot: string | null;
  cliente_telefone_snapshot: string | null;
  cliente_email_snapshot: string | null;
  candidato_nome_snapshot: string | null;
  cargo: string | null;
  salario: number | null;
  data_inicio: string | null;
  fee_percentual: number | null;
  fee_valor: number | null;
  prazo_cobranca: string | null;
  status: "pendente_revisao" | "aprovada_enviada" | "paga" | "cancelada";
  enviado_em: string | null;
  pago_em: string | null;
  data_vencimento: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vagas: { titulo: string } | any;
}

interface Props {
  cobrancaId: string;
  onClose: () => void;
  onAtualizada: (row: CobrancaRSRow) => void;
  isFullAccess: boolean;
  // Acesso amplo ao módulo — quem só pode revisar por ter gerado esta cobrança
  // específica (ver podeRevisarCobranca) consegue editar vencimento normalmente, mas não
  // marcar como paga (ação de operação financeira, fora do escopo "gerar → revisar →
  // aprovar" que motivou dar acesso a essa pendência específica pra ele).
  acessoAmplo: boolean;
}

function formatarMoeda(v: number | null): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function paraLinha(c: CobrancaDetalhe): CobrancaRSRow {
  return {
    id: c.id,
    tipo: c.tipo,
    clienteNomeSnapshot: c.cliente_nome_snapshot,
    clienteCnpjSnapshot: c.cliente_cnpj_snapshot,
    clienteEnderecoSnapshot: c.cliente_endereco_snapshot,
    clienteTelefoneSnapshot: c.cliente_telefone_snapshot,
    clienteEmailSnapshot: c.cliente_email_snapshot,
    candidatoNomeSnapshot: c.candidato_nome_snapshot,
    vagaTitulo: c.vagas?.titulo ?? "—",
    cargo: c.cargo,
    salario: c.salario,
    dataInicio: c.data_inicio,
    feePercentual: c.fee_percentual,
    feeValor: c.fee_valor,
    status: c.status,
    createdAt: c.created_at,
    enviadoEm: c.enviado_em,
    pagoEm: c.pago_em,
    dataVencimento: c.data_vencimento,
  };
}

export default function ModalRevisaoCobrancaRS({ cobrancaId, onClose, onAtualizada, isFullAccess, acessoAmplo }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [cobranca, setCobranca] = useState<CobrancaDetalhe | null>(null);
  const [erro, setErro] = useState("");

  const [cargo, setCargo] = useState("");
  const [salario, setSalario] = useState<number>(0);
  const [dataInicio, setDataInicio] = useState("");
  const [clienteCnpj, setClienteCnpj] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");
  const [prazoCobranca, setPrazoCobranca] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [marcandoPaga, setMarcandoPaga] = useState(false);
  const [salvandoVencimento, setSalvandoVencimento] = useState(false);
  const [vencimentoSalvo, setVencimentoSalvo] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    setCarregando(true);
    fetch(`/api/cobrancas-rs/${cobrancaId}`)
      .then((r) => r.json())
      .then((json) => {
        const c = json.data as CobrancaDetalhe;
        setCobranca(c);
        setCargo(c.tipo === "cancelamento" ? "" : c.cargo ?? c.vagas?.titulo ?? "");
        setSalario(c.salario ?? 0);
        setDataInicio(c.data_inicio ?? "");
        setClienteCnpj(c.cliente_cnpj_snapshot ?? "");
        setClienteEndereco(c.cliente_endereco_snapshot ?? "");
        setPrazoCobranca(c.prazo_cobranca ?? "");
        setDataVencimento(c.data_vencimento ?? "");
      })
      .catch(() => setErro("Erro ao carregar cobrança."))
      .finally(() => setCarregando(false));
  }, [cobrancaId]);

  const feeValorPreview =
    salario > 0 && cobranca?.fee_percentual != null ? (salario * cobranca.fee_percentual) / 100 : null;

  const ehCancelamento = cobranca?.tipo === "cancelamento";

  // Mesma lista de "faltando" validada em /api/cobrancas-rs/[id]/aprovar (fonte de verdade,
  // continua sendo quem decide de fato) — replicada aqui só pra desabilitar o botão
  // proativamente e evitar o clique frustrado, em vez de descobrir o campo faltante só depois
  // do erro 400. Lê do estado local (cargo/salario/etc.), não do snapshot de `cobranca`, pra
  // reagir em tempo real enquanto o usuário preenche o formulário.
  const camposFaltando: string[] = [];
  if (!ehCancelamento) {
    if (!cargo.trim()) camposFaltando.push("Cargo");
    if (!dataInicio) camposFaltando.push("Data de início");
  }
  if (salario <= 0) camposFaltando.push(ehCancelamento ? "Salário-base" : "Salário");
  if (!clienteCnpj.trim()) camposFaltando.push("CNPJ do cliente");
  if (!clienteEndereco.trim()) camposFaltando.push("Endereço do cliente");
  const camposCompletos = camposFaltando.length === 0;

  const salvarRascunho = async (): Promise<boolean> => {
    setSalvando(true);
    setErro("");
    setSalvo(false);
    try {
      const res = await fetch(`/api/cobrancas-rs/${cobrancaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cargo: ehCancelamento ? undefined : cargo,
          salario: salario > 0 ? salario : null,
          data_inicio: ehCancelamento ? undefined : dataInicio || null,
          cliente_cnpj: clienteCnpj || undefined,
          cliente_endereco: clienteEndereco || undefined,
          prazo_cobranca: prazoCobranca || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar rascunho."); return false; }
      setCobranca(json.data);
      return true;
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarRascunho = async () => {
    const ok = await salvarRascunho();
    if (ok) {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    }
  };

  const handleAprovar = async () => {
    setAprovando(true);
    setErro("");
    try {
      const ok = await salvarRascunho();
      if (!ok) return;

      const res = await fetch(`/api/cobrancas-rs/${cobrancaId}/aprovar`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao aprovar cobrança."); return; }
      if (json.emailFalhou) {
        setErro("Cobrança aprovada, mas houve falha ao enviar para 1 ou mais destinatários — confira o Log de E-mails.");
      } else if ((json.destinatariosCount ?? 0) === 0) {
        setErro("Cobrança aprovada, mas nenhum destinatário de e-mail está configurado em Avisos de Cobrança R&S — ninguém recebeu o e-mail.");
      }
      onAtualizada(paraLinha(json.data));
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setAprovando(false);
    }
  };

  const handleSalvarVencimento = async () => {
    setSalvandoVencimento(true);
    setErro("");
    setVencimentoSalvo(false);
    try {
      const res = await fetch(`/api/cobrancas-rs/${cobrancaId}/vencimento`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_vencimento: dataVencimento || null }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar vencimento."); return; }
      setCobranca(json.data);
      setVencimentoSalvo(true);
      setTimeout(() => setVencimentoSalvo(false), 2500);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvandoVencimento(false);
    }
  };

  const handleReenviar = async () => {
    setReenviando(true);
    setErro("");
    setReenviado(false);
    try {
      const res = await fetch(`/api/cobrancas-rs/${cobrancaId}/reenviar`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao reenviar notificação."); return; }
      setReenviado(true);
      setTimeout(() => setReenviado(false), 3500);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setReenviando(false);
    }
  };

  const handleMarcarPaga = async () => {
    setMarcandoPaga(true);
    setErro("");
    try {
      const res = await fetch(`/api/cobrancas-rs/${cobrancaId}/marcar-paga`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao marcar como paga."); return; }
      onAtualizada(paraLinha(json.data));
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setMarcandoPaga(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg">Cobrança R&S</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {carregando ? (
            <p className="text-sm text-gray-400 py-6 text-center">Carregando...</p>
          ) : !cobranca ? (
            <p className="text-sm text-red-600 py-6 text-center">Cobrança não encontrada.</p>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cliente</p>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                  <p><strong>{cobranca.cliente_nome_snapshot}</strong></p>
                  <p className="text-gray-500">Telefone: {cobranca.cliente_telefone_snapshot ?? "—"}</p>
                  <p className="text-gray-500">E-mail: {cobranca.cliente_email_snapshot ?? "—"}</p>
                </div>
              </div>

              {cobranca.status === "pendente_revisao" && !cobranca.cliente_cnpj_snapshot ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CNPJ do cliente *</label>
                  <input value={clienteCnpj} onChange={(e) => setClienteCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="input-field" />
                  <p className="text-xs text-gray-400 mt-1">Ausente no cadastro do cliente — será salvo aqui e no cadastro.</p>
                </div>
              ) : (
                <p className="text-sm"><span className="text-gray-500">CNPJ:</span> {cobranca.cliente_cnpj_snapshot ?? "—"}</p>
              )}

              {cobranca.status === "pendente_revisao" && !cobranca.cliente_endereco_snapshot ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Endereço do cliente *</label>
                  <input value={clienteEndereco} onChange={(e) => setClienteEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade/UF" className="input-field" />
                  <p className="text-xs text-gray-400 mt-1">Ausente no cadastro do cliente — será salvo aqui e no cadastro.</p>
                </div>
              ) : (
                <p className="text-sm"><span className="text-gray-500">Endereço:</span> {cobranca.cliente_endereco_snapshot ?? "—"}</p>
              )}

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {ehCancelamento ? "Vaga" : "Candidato / Vaga"}
                </p>
                {!ehCancelamento && <p className="text-sm"><strong>{cobranca.candidato_nome_snapshot}</strong></p>}
                <p className="text-sm text-gray-500">{cobranca.vagas?.titulo ?? "—"}</p>
              </div>

              <div className="border-t pt-4 space-y-3">
                {!ehCancelamento && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cargo *</label>
                    <input
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value)}
                      disabled={cobranca.status !== "pendente_revisao"}
                      className="input-field"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {ehCancelamento ? "Salário da vaga (base de cálculo) *" : "Salário *"}
                  </label>
                  <CampoMoeda
                    value={salario}
                    onChange={setSalario}
                    placeholder="Ex: 2.500,00"
                    className="input-field"
                    disabled={cobranca.status !== "pendente_revisao"}
                  />
                </div>
                {!ehCancelamento && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de início *</label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      disabled={cobranca.status !== "pendente_revisao"}
                      className="input-field"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prazo de cobrança</label>
                  <input
                    value={prazoCobranca}
                    onChange={(e) => setPrazoCobranca(e.target.value)}
                    disabled={cobranca.status !== "pendente_revisao"}
                    placeholder="Ex: 30 dias após início do candidato"
                    className="input-field"
                  />
                  <p className="text-gray-400 text-xs mt-1">Copiado da vaga — texto livre, informativo (não define a data de vencimento abaixo).</p>
                </div>
              </div>

              <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Taxa {cobranca.fee_percentual != null ? `(${cobranca.fee_percentual}%)` : ""}
                </p>
                <p className="text-lg font-bold" style={{ color: "#166534" }}>
                  {cobranca.status === "pendente_revisao" ? formatarMoeda(feeValorPreview) : formatarMoeda(cobranca.fee_valor)}
                </p>
              </div>

              {erro && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
              {salvo && !erro && <p className="text-green-700 text-sm">Rascunho salvo!</p>}

              {cobranca.status === "pendente_revisao" && (
                <div className="pt-2 border-t">
                  <div className="flex gap-3">
                    <button onClick={handleSalvarRascunho} disabled={salvando || aprovando} className="btn-outline flex-1 disabled:opacity-50">
                      {salvando ? "Salvando..." : "Salvar rascunho"}
                    </button>
                    <button onClick={handleAprovar} disabled={salvando || aprovando || !camposCompletos} className="btn-primary flex-1 disabled:opacity-50">
                      {aprovando ? "Aprovando..." : "Aprovar e enviar"}
                    </button>
                  </div>
                  {!camposCompletos && (
                    <p className="text-xs text-gray-400 mt-2">
                      Preencha antes de aprovar: {camposFaltando.join(", ")}.
                    </p>
                  )}
                </div>
              )}

              {cobranca.status === "aprovada_enviada" && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-gray-400 mb-3">Enviada em {cobranca.enviado_em ? new Date(cobranca.enviado_em).toLocaleString("pt-BR") : "—"}</p>

                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de vencimento</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="date"
                        value={dataVencimento}
                        onChange={(e) => setDataVencimento(e.target.value)}
                        className="input-field"
                      />
                      <button
                        onClick={handleSalvarVencimento}
                        disabled={salvandoVencimento}
                        className="btn-outline disabled:opacity-50"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {salvandoVencimento ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                    {vencimentoSalvo && <p className="text-green-700 text-xs mt-1">Vencimento salvo!</p>}
                  </div>

                  {acessoAmplo && (
                    <button onClick={handleMarcarPaga} disabled={marcandoPaga} className="btn-primary w-full disabled:opacity-50">
                      {marcandoPaga ? "Marcando..." : "Marcar como paga"}
                    </button>
                  )}

                  {isFullAccess && (
                    <div className="mt-3">
                      <button onClick={handleReenviar} disabled={reenviando} className="btn-outline w-full disabled:opacity-50">
                        {reenviando ? "Reenviando..." : "Reenviar notificação"}
                      </button>
                      {reenviado && <p className="text-green-700 text-xs mt-1">Notificação reenviada!</p>}
                    </div>
                  )}
                </div>
              )}

              {cobranca.status === "paga" && (
                <p className="text-xs text-gray-400 pt-2 border-t">Paga em {cobranca.pago_em ? new Date(cobranca.pago_em).toLocaleString("pt-BR") : "—"}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
