"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarDataSemFuso } from "@/lib/utils";
import ModalLancarRescisao, { type FuncionarioRescisaoAlvo } from "./ModalLancarRescisao";
import { acoesDisponiveisMot } from "@/lib/contratoMotEventos";

interface EventoMot {
  id: string;
  tipo: "prorrogacao" | "afastamento_inicio" | "afastamento_fim";
  data_evento: string;
  tipo_beneficio: string | null;
  observacoes: string | null;
  arquivo_path: string | null;
  nome_arquivo_original: string | null;
  corrige_evento_id: string | null;
  criado_em: string;
  anulado: boolean;
  eh_correcao: boolean;
  criado_por_nome: string | null;
}

interface DadosMot {
  funcionario: {
    id: string;
    nome_completo: string;
    cargo: string | null;
    empresa: string | null;
    status: string;
    tipo_servico: string | null;
    data_admissao: string | null;
    clientes: { nome: string } | { nome: string }[] | null;
  };
  hoje: string;
  eventos: EventoMot[];
  resumo: { afastadoEmAberto: boolean; afastadoDesde: string | null; diasAfastado: number | null; prorrogado: boolean; rescisaoProgramadaEm: string | null } | null;
  rescisao_programada: { id: string; data_desligamento: string } | null;
  pode_corrigir: boolean;
}

type Modo = "menu" | "prorrogar" | "afastar" | "fim_afastamento";

const ROTULO_EVENTO: Record<EventoMot["tipo"], string> = {
  prorrogacao: "Prorrogação",
  afastamento_inicio: "Início de afastamento",
  afastamento_fim: "Fim de afastamento",
};

const ROTULO_BENEFICIO: Record<string, string> = {
  auxilio_doenca: "Auxílio-doença (INSS)",
  acidentario: "Acidentário (INSS)",
  outro: "Outro",
};

interface Props {
  funcionarioId: string;
  // Chamado depois de qualquer ação que mude o estado do contrato (a lista do popup/ficha se atualiza).
  onAlterado?: () => void;
}

// Bloco único "Contrato MOT": ações (Prorrogar, Afastamento, Encerrar contrato) + histórico dos eventos.
// Usado dentro do modal do popup do aviso e na ficha do funcionário — o mesmo componente nos dois, pra
// nunca divergir. Tudo vem de GET /api/funcionarios/[id]/mot-eventos (nada é calculado no cliente).
export default function ContratoMotPainel({ funcionarioId, onAlterado }: Props) {
  const [dados, setDados] = useState<DadosMot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modo, setModo] = useState<Modo>("menu");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [rescisaoAberta, setRescisaoAberta] = useState(false);

  const [dataEvento, setDataEvento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [beneficio, setBeneficio] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const [corrigindoId, setCorrigindoId] = useState<string | null>(null);
  const [motivoCorrecao, setMotivoCorrecao] = useState("");
  const [abrindoAnexoId, setAbrindoAnexoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch(`/api/funcionarios/${funcionarioId}/mot-eventos`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar o contrato.");
      setDados(json.data);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }, [funcionarioId]);

  useEffect(() => {
    setCarregando(true);
    setDados(null);
    setModo("menu");
    carregar();
  }, [carregar]);

  function abrirForm(novoModo: Modo) {
    setDataEvento("");
    setObservacoes("");
    setBeneficio("");
    setArquivo(null);
    setErroForm("");
    setModo(novoModo);
  }

  async function enviarEvento() {
    if (!dados || modo === "menu") return;
    const tipo = modo === "prorrogar" ? "prorrogacao" : modo === "afastar" ? "afastamento_inicio" : "afastamento_fim";
    setEnviando(true);
    setErroForm("");
    try {
      let arquivoPath: string | null = null;
      if (tipo === "prorrogacao" && arquivo) {
        const urlRes = await fetch(`/api/funcionarios/${funcionarioId}/mot-eventos/aditivo-upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome_arquivo: arquivo.name }),
        });
        const urlJson = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlJson.error || "Erro ao gerar URL de upload do aditivo.");
        const uploadRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": arquivo.type || "application/octet-stream" },
          body: arquivo,
        });
        if (!uploadRes.ok) throw new Error("Erro ao enviar o arquivo do aditivo.");
        arquivoPath = urlJson.path;
      }

      const res = await fetch(`/api/funcionarios/${funcionarioId}/mot-eventos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          data_evento: dataEvento,
          tipo_beneficio: tipo === "afastamento_inicio" ? beneficio : null,
          observacoes: observacoes.trim() || null,
          arquivo_path: arquivoPath,
          nome_arquivo_original: arquivoPath && arquivo ? arquivo.name : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao registrar o evento.");

      setModo("menu");
      await carregar();
      onAlterado?.();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function corrigirEvento(eventoId: string) {
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/funcionarios/${funcionarioId}/mot-eventos/${eventoId}/corrigir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivoCorrecao }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao corrigir o evento.");
      setCorrigindoId(null);
      setMotivoCorrecao("");
      await carregar();
      onAlterado?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelarRescisaoProgramada() {
    if (!dados?.rescisao_programada) return;
    if (!window.confirm("Cancelar a rescisão programada? O funcionário continua ativo e o aviso do contrato volta a valer.")) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/rescisoes/${dados.rescisao_programada.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao cancelar a rescisão programada.");
      await carregar();
      onAlterado?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function verAnexo(eventoId: string) {
    setAbrindoAnexoId(eventoId);
    setErro("");
    try {
      const res = await fetch(`/api/funcionarios/${funcionarioId}/mot-eventos/${eventoId}/arquivo-url`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao abrir o anexo.");
      window.open(json.signedUrl, "_blank");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setAbrindoAnexoId(null);
    }
  }

  if (carregando) return <p className="text-sm text-gray-400 py-4">Carregando...</p>;
  if (!dados) return <p className="text-red-600 text-sm py-2">{erro || "Não foi possível carregar o contrato."}</p>;

  const { funcionario, resumo, rescisao_programada: rescisaoProgramada } = dados;
  const ativo = funcionario.status === "ativo";
  const afastado = !!resumo?.afastadoEmAberto;
  const acoes = acoesDisponiveisMot({ ativo, resumo, rescisaoProgramada, hoje: dados.hoje, podeCorrigir: dados.pode_corrigir });
  const cliente = Array.isArray(funcionario.clientes) ? funcionario.clientes[0] : funcionario.clientes;
  const alvoRescisao: FuncionarioRescisaoAlvo = {
    id: funcionario.id,
    nome_completo: funcionario.nome_completo,
    cargo: funcionario.cargo,
    empresa: funcionario.empresa,
    clientes: cliente ?? null,
  };
  const dataMin = modo === "fim_afastamento" ? resumo?.afastadoDesde ?? funcionario.data_admissao : funcionario.data_admissao;
  const formValido =
    dataEvento !== "" && (modo !== "afastar" || beneficio !== "") && !(dataMin && dataEvento < dataMin) && dataEvento <= dados.hoje;

  return (
    <div>
      {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

      <div className="flex flex-wrap gap-2 mb-3" style={{ fontSize: 11, fontWeight: 700 }}>
        {afastado && resumo?.afastadoDesde && (
          <span style={{ background: "#E0E7FF", color: "#3730A3", padding: "3px 10px", borderRadius: 999 }}>
            Afastado desde {formatarDataSemFuso(resumo.afastadoDesde)} ({resumo.diasAfastado} {resumo.diasAfastado === 1 ? "dia" : "dias"})
          </span>
        )}
        {resumo?.prorrogado && (
          <span style={{ background: "#DBEAFE", color: "#1E40AF", padding: "3px 10px", borderRadius: 999 }}>Prorrogado</span>
        )}
        {rescisaoProgramada && (
          <span style={{ background: "#FCE7F3", color: "#9D174D", padding: "3px 10px", borderRadius: 999 }}>
            Desligamento programado para {formatarDataSemFuso(rescisaoProgramada.data_desligamento)}
          </span>
        )}
      </div>

      {ativo && modo === "menu" && (
        <div className="flex flex-wrap gap-2 mb-4">
          {acoes.prorrogar && (
            <button onClick={() => abrirForm("prorrogar")} className="btn-primary" style={{ fontSize: 13 }} disabled={enviando}>
              Prorrogar
            </button>
          )}
          {acoes.encerrarAfastamento && (
            <button onClick={() => abrirForm("fim_afastamento")} className="btn-outline" style={{ fontSize: 13 }} disabled={enviando}>
              Encerrar afastamento
            </button>
          )}
          {acoes.registrarAfastamento && (
            <button onClick={() => abrirForm("afastar")} className="btn-outline" style={{ fontSize: 13 }} disabled={enviando}>
              Registrar afastamento
            </button>
          )}
          {acoes.encerrarContrato && (
            <button onClick={() => setRescisaoAberta(true)} className="btn-outline" style={{ fontSize: 13, color: "#B91C1C", borderColor: "#FCA5A5" }} disabled={enviando}>
              Encerrar contrato
            </button>
          )}
          {acoes.cancelarRescisaoProgramada && (
            <button onClick={cancelarRescisaoProgramada} className="btn-outline" style={{ fontSize: 13 }} disabled={enviando}>
              Cancelar rescisão programada
            </button>
          )}
        </div>
      )}

      {ativo && modo !== "menu" && (
        <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <p className="text-sm font-bold text-gray-900 mb-3">
            {modo === "prorrogar" ? "Prorrogar contrato" : modo === "afastar" ? "Registrar afastamento" : "Encerrar afastamento"}
          </p>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {modo === "prorrogar" ? "Data do aditivo *" : modo === "afastar" ? "Início do afastamento *" : "Fim do afastamento (retorno) *"}
            </label>
            <input
              type="date"
              value={dataEvento}
              min={dataMin ?? undefined}
              max={dados.hoje}
              onChange={(e) => setDataEvento(e.target.value)}
              className="input-field"
            />
          </div>

          {modo === "afastar" && (
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de benefício *</label>
              <select value={beneficio} onChange={(e) => setBeneficio(e.target.value)} className="input-field">
                <option value="">Selecione</option>
                {Object.entries(ROTULO_BENEFICIO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </div>
          )}

          {modo === "prorrogar" && (
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Aditivo (opcional)</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
          )}

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações (opcional)</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="input-field"
              maxLength={2000}
            />
          </div>

          {erroForm && <p className="text-red-600 text-sm mb-3">{erroForm}</p>}

          <div className="flex gap-2">
            <button onClick={() => setModo("menu")} className="btn-outline flex-1" disabled={enviando}>Voltar</button>
            <button onClick={enviarEvento} disabled={!formValido || enviando} className="btn-primary flex-1 disabled:opacity-50">
              {enviando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {!ativo && <p className="text-xs text-gray-400 mb-3">Funcionário desligado — só o histórico fica disponível.</p>}

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Histórico</p>
      {dados.eventos.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">Nenhum evento registrado.</p>
      ) : (
        <div className="space-y-2">
          {dados.eventos.map((e) => (
            <div
              key={e.id}
              style={{ border: "1px solid #F3F4F6", borderRadius: 8, padding: "8px 12px", opacity: e.anulado || e.eh_correcao ? 0.6 : 1 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900" style={{ textDecoration: e.anulado ? "line-through" : undefined }}>
                    {e.eh_correcao ? `Correção — ${ROTULO_EVENTO[e.tipo]}` : ROTULO_EVENTO[e.tipo]} · {formatarDataSemFuso(e.data_evento)}
                    {e.anulado && <span className="text-xs text-gray-500"> (anulado)</span>}
                  </p>
                  {e.tipo_beneficio && <p className="text-xs text-gray-600">{ROTULO_BENEFICIO[e.tipo_beneficio] ?? e.tipo_beneficio}</p>}
                  {e.observacoes && <p className="text-xs text-gray-600">{e.observacoes}</p>}
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                    {e.criado_por_nome ?? "—"} em {new Date(e.criado_em).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  {e.arquivo_path && (
                    <button onClick={() => verAnexo(e.id)} disabled={abrindoAnexoId === e.id} className="btn-outline" style={{ padding: "3px 10px", fontSize: 12 }}>
                      {abrindoAnexoId === e.id ? "Abrindo..." : "Ver aditivo"}
                    </button>
                  )}
                  {dados.pode_corrigir && !e.anulado && !e.eh_correcao && (
                    <button
                      onClick={() => { setCorrigindoId(e.id); setMotivoCorrecao(""); }}
                      className="text-xs font-semibold"
                      style={{ color: "#DC2626" }}
                    >
                      Corrigir
                    </button>
                  )}
                </div>
              </div>

              {corrigindoId === e.id && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={motivoCorrecao}
                    onChange={(ev) => setMotivoCorrecao(ev.target.value)}
                    placeholder="Motivo da correção (o evento não é apagado, só anulado)"
                    className="input-field mb-2"
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setCorrigindoId(null)} className="btn-outline" style={{ fontSize: 12 }} disabled={enviando}>Cancelar</button>
                    <button
                      onClick={() => corrigirEvento(e.id)}
                      className="btn-primary disabled:opacity-50"
                      style={{ fontSize: 12 }}
                      disabled={!motivoCorrecao.trim() || enviando}
                    >
                      Anular evento
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalLancarRescisao
        isOpen={rescisaoAberta}
        funcionario={alvoRescisao}
        onClose={() => setRescisaoAberta(false)}
        onLancado={async () => {
          setRescisaoAberta(false);
          await carregar();
          onAlterado?.();
        }}
      />
    </div>
  );
}
