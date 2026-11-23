"use client";

// Aba Férias (RH): lista por urgência dos funcionários de Terceirização e dos efetivados, com data-limite, semáforo e as ações do RH (programar, em gozo, gozada,
// reabrir, ajustar data-base, informar saldo inicial) e exportação CSV. Modelo do Vencimento de Contrato; as regras vêm de feriasRegras.ts / feriasLinhas.ts
// (nada de regra duplicada aqui) e todas as gravações passam pelas rotas /api/ferias.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dataBR } from "@/lib/dataBR";
import { ROTULO_SITUACAO_FERIAS, SITUACOES_FERIAS, textoDiasRestantes, type SemaforoFerias, type SituacaoFerias } from "@/lib/feriasRegras";
import {
  acoesDaLinha, contarFaixas, FAIXAS_FERIAS, filtrarLinhasFerias, ROTULO_FAIXA_FERIAS, seloDoPrazo, type FaixaFerias, type FiltrosFerias, type LinhaFerias,
} from "@/lib/feriasLinhas";
import { useScrollHorizontalSincronizado } from "@/hooks/useScrollHorizontalSincronizado";
import BarraScrollFlutuante from "./BarraScrollFlutuante";
import { ModalDataBase, ModalProgramar, ModalReabrir, ModalSaldoInicial, ModalSituacao, textoDoErro } from "./ferias/ModaisFerias";

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  linhasIniciais: LinhaFerias[];
  clientes: ClienteOption[];
  // "Hoje" em Brasília, vindo do servidor: a tela e as janelas nunca dependem do fuso do navegador.
  hojeISO: string;
  // Filtros vindos do link dos avisos de férias (/painel/ferias?funcionario=<id>&faixa=<faixa>).
  funcionarioInicial?: string | null;
  faixaInicial?: FaixaFerias | null;
  // Mensagem pronta quando o servidor não conseguiu montar a lista (ex.: tabelas de férias ainda não existem no banco).
  erroCarga?: string | null;
}

// Mesmos estilos de tabela do Vencimento de Contrato.
const TH_STYLE: React.CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap",
  borderBottom: "1px solid #E5E7EB",
};
const TD_STYLE: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: "#111827", whiteSpace: "nowrap", verticalAlign: "top" };
const SELO: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", display: "inline-block" };
const SELO_TERCEIRIZACAO = { bg: "#111827", text: "#FFD700" } as const;
const SELO_MOT = { bg: "#DBEAFE", text: "#1D4ED8" } as const;

// Ajuda do selo cinza "Quitadas: a informar" (e do card do resumo): o que falta para o funcionário entrar nos avisos.
const TEXTO_AJUDA_QUITADAS =
  "A contabilidade precisa informar até que período as férias já foram quitadas. Enquanto isso, o funcionário não aparece como vencido e não gera aviso.";

const COR_FAIXA: Record<FaixaFerias, { bg: string; text: string; borda: string }> = {
  vencidos: { bg: "#FEE2E2", text: "#991B1B", borda: "#FCA5A5" },
  ate30: { bg: "#FFEDD5", text: "#C2410C", borda: "#FDBA74" },
  ate90: { bg: "#FEF3C7", text: "#92400E", borda: "#FCD34D" },
  pendente: { bg: "#F3F4F6", text: "#374151", borda: "#D1D5DB" },
};

const ROTULO_SEMAFORO: Record<SemaforoFerias, string> = { verde: "Verde (no prazo)", amarelo: "Amarelo (até 90 dias)", vermelho: "Vermelho (até 30 dias ou vencido)", cinza: "Cinza (sem prazo calculado)" };

type Janela =
  | { tipo: "programar" | "em_gozo" | "gozada" | "reabrir" | "data_base" | "saldo"; linha: LinhaFerias }
  | null;

async function baixarCsv(res: Response): Promise<void> {
  const blob = await res.blob();
  const nome = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "ferias.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function FeriasPageClient({ linhasIniciais, clientes: clientesDoServidor, hojeISO, erroCarga = null, funcionarioInicial = null, faixaInicial = null }: Props) {
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [clientes, setClientes] = useState(clientesDoServidor);
  useEffect(() => { setLinhas(linhasIniciais); }, [linhasIniciais]);
  useEffect(() => { setClientes(clientesDoServidor); }, [clientesDoServidor]);

  const [busca, setBusca] = useState("");
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"" | SituacaoFerias>("");
  const [filtroSemaforo, setFiltroSemaforo] = useState<"" | SemaforoFerias>("");
  const [faixa, setFaixa] = useState<"" | FaixaFerias>(faixaInicial ?? "");
  const [funcionarioFoco, setFuncionarioFoco] = useState<string | null>(funcionarioInicial);
  const [janela, setJanela] = useState<Janela>(null);
  const [mensagem, setMensagem] = useState("");
  const [erroTela, setErroTela] = useState(erroCarga ?? "");
  const [exportando, setExportando] = useState(false);

  const filtros: FiltrosFerias = useMemo(
    () => ({
      ...(filtroClienteId ? { cliente_id: filtroClienteId } : {}),
      ...(filtroSituacao ? { situacao: filtroSituacao } : {}),
      ...(filtroSemaforo ? { semaforo: filtroSemaforo } : {}),
      ...(faixa ? { faixa } : {}),
      ...(funcionarioFoco ? { funcionario_id: funcionarioFoco } : {}),
      ...(busca.trim() ? { busca: busca.trim() } : {}),
    }),
    [filtroClienteId, filtroSituacao, filtroSemaforo, faixa, funcionarioFoco, busca]
  );
  const filtradas = useMemo(() => filtrarLinhasFerias(linhas, filtros), [linhas, filtros]);
  // Contagens do resumo sobre a lista cheia (não sobre o resultado filtrado), como em Vencimento de Contrato.
  const contagens = useMemo(() => contarFaixas(linhas), [linhas]);
  const temFiltro = Object.keys(filtros).length > 0;

  const { scrollRef, floatScrollRef, floatBar, handleScroll, handleFloatScroll } = useScrollHorizontalSincronizado();
  useEffect(() => { handleScroll(); }, [handleScroll, filtradas]);

  function limparFiltros() {
    setBusca(""); setFiltroClienteId(""); setFiltroSituacao(""); setFiltroSemaforo(""); setFaixa(""); setFuncionarioFoco(null);
  }

  // Depois de qualquer ação: fecha a janela, mostra o aviso e busca a lista de novo (a rota é a fonte da verdade).
  async function aposAcao(texto: string) {
    setJanela(null);
    setMensagem(texto);
    setErroTela("");
    try {
      const res = await fetch("/api/ferias");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroTela(typeof json.error === "string" ? json.error : "Não foi possível atualizar a lista. Atualize a página.");
        return;
      }
      setLinhas(json.data ?? []);
      setClientes(json.clientes ?? []);
    } catch {
      setErroTela("Falha de conexão ao atualizar a lista. Atualize a página.");
    }
  }

  async function exportar() {
    if (exportando) return;
    setExportando(true);
    setErroTela("");
    try {
      const res = await fetch("/api/ferias/exportar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filtros) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErroTela(textoDoErro({ ok: false, status: res.status, json }));
        return;
      }
      await baixarCsv(res);
      setMensagem("Arquivo gerado.");
    } catch {
      setErroTela("Falha de conexão ao gerar o arquivo. Tente novamente.");
    } finally {
      setExportando(false);
    }
  }

  const fechar = () => setJanela(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Férias</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            Funcionários de Terceirização e efetivados, ativos. Avisa quem está perto de perder o prazo de tirar férias (a data-limite é o fim do período aquisitivo mais 12 meses; depois dela há pagamento em dobro). A contabilidade faz os cálculos e os lançamentos.
          </p>
        </div>
        <button type="button" className="btn-secondary" disabled={exportando || filtradas.length === 0 || !!erroCarga} onClick={exportar}>
          {exportando ? "Gerando..." : "Exportar CSV"}
        </button>
      </div>

      {erroTela && (
        <div role="alert" className="mb-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
          {erroTela}
        </div>
      )}
      {mensagem && !erroTela && (
        <div role="status" className="mb-4 flex items-center justify-between gap-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
          <span>{mensagem}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setMensagem("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#166534", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {!erroCarga && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap" aria-label="Resumo">
            {FAIXAS_FERIAS.map((f) => {
              const ativo = faixa === f;
              const cor = COR_FAIXA[f];
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={ativo}
                  title={f === "pendente" ? TEXTO_AJUDA_QUITADAS : undefined}
                  onClick={() => setFaixa(ativo ? "" : f)}
                  style={{
                    background: cor.bg, color: cor.text, border: `2px solid ${ativo ? cor.text : cor.borda}`, borderRadius: 10, padding: "8px 16px", cursor: "pointer",
                    textAlign: "left", minWidth: 150,
                  }}
                >
                  <span style={{ display: "block", fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{contagens[f]}</span>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>{ROTULO_FAIXA_FERIAS[f]}</span>
                </button>
              );
            })}
          </div>

          {funcionarioFoco && (
            <p className="mb-3 text-sm text-gray-700" role="status">
              Mostrando só {linhas.find((l) => l.funcionario_id === funcionarioFoco)?.nome_completo ?? "o funcionário do aviso"}.{" "}
              <button type="button" onClick={() => setFuncionarioFoco(null)} style={{ color: "#1D4ED8", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Ver todos
              </button>
            </p>
          )}

          <div className="flex gap-3 mb-4 flex-wrap">
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome..." className="input-field" style={{ maxWidth: 240 }} aria-label="Buscar por nome" />
            <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)} className="input-field" style={{ maxWidth: 260 }} aria-label="Empresa">
              <option value="">Todas as empresas</option>
              {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
            </select>
            <select value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value as typeof filtroSituacao)} className="input-field" style={{ maxWidth: 260 }} aria-label="Situação">
              <option value="">Todas as situações</option>
              {SITUACOES_FERIAS.map((s) => (<option key={s} value={s}>{ROTULO_SITUACAO_FERIAS[s]}</option>))}
            </select>
            <select value={filtroSemaforo} onChange={(e) => setFiltroSemaforo(e.target.value as typeof filtroSemaforo)} className="input-field" style={{ maxWidth: 280 }} aria-label="Semáforo">
              <option value="">Todos os prazos</option>
              {(Object.keys(ROTULO_SEMAFORO) as SemaforoFerias[]).map((s) => (<option key={s} value={s}>{ROTULO_SEMAFORO[s]}</option>))}
            </select>
            {temFiltro && (
              <button type="button" className="btn-secondary" onClick={limparFiltros}>Limpar filtros</button>
            )}
          </div>

          <div ref={scrollRef} onScroll={handleScroll} className="card" style={{ padding: 0, overflowX: "auto" }}>
            {filtradas.length === 0 ? (
              <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
                {linhas.length === 0
                  ? "Nenhum funcionário no controle de férias. Entram os funcionários de Terceirização ativos e os de mão de obra temporária que já foram efetivados."
                  : "Nenhum funcionário encontrado com esses filtros."}
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Funcionário</th>
                    <th style={TH_STYLE}>Empresa</th>
                    <th style={TH_STYLE}>Data-base</th>
                    <th style={TH_STYLE}>Período aquisitivo atual</th>
                    <th style={TH_STYLE}>Data-limite</th>
                    <th style={TH_STYLE}>Dias restantes</th>
                    <th style={TH_STYLE}>Prazo</th>
                    <th style={TH_STYLE}>Situação</th>
                    <th style={TH_STYLE}>Férias programadas</th>
                    <th style={TH_STYLE}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((l) => (
                    <LinhaTabela key={l.funcionario_id} l={l} hojeISO={hojeISO} abrir={(tipo) => setJanela({ tipo, linha: l })} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {janela?.tipo === "programar" && <ModalProgramar linha={janela.linha} hojeISO={hojeISO} onClose={fechar} onConcluido={aposAcao} />}
      {janela?.tipo === "em_gozo" && <ModalSituacao acao="em_gozo" linha={janela.linha} hojeISO={hojeISO} onClose={fechar} onConcluido={aposAcao} />}
      {janela?.tipo === "gozada" && <ModalSituacao acao="gozada" linha={janela.linha} hojeISO={hojeISO} onClose={fechar} onConcluido={aposAcao} />}
      {janela?.tipo === "reabrir" && <ModalReabrir linha={janela.linha} hojeISO={hojeISO} onClose={fechar} onConcluido={aposAcao} />}
      {janela?.tipo === "data_base" && <ModalDataBase linha={janela.linha} hojeISO={hojeISO} onClose={fechar} onConcluido={aposAcao} />}
      {janela?.tipo === "saldo" && <ModalSaldoInicial linha={janela.linha} hojeISO={hojeISO} onClose={fechar} onConcluido={aposAcao} />}
      <BarraScrollFlutuante floatBar={floatBar} floatScrollRef={floatScrollRef} onScroll={handleFloatScroll} />
    </div>
  );
}

function BotaoAcao({ rotulo, acao, onClick, destaque = false }: { rotulo: string; acao: { habilitada: boolean; motivo: string }; onClick: () => void; destaque?: boolean }) {
  const base: React.CSSProperties = { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" };
  const estilo: React.CSSProperties = !acao.habilitada
    ? { ...base, color: "#9CA3AF", border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "not-allowed" }
    : destaque
      ? { ...base, color: "#111827", border: "1px solid #FFD700", background: "#FFD700", cursor: "pointer" }
      : { ...base, color: "#166534", border: "1px solid #86EFAC", background: "#F0FDF4", cursor: "pointer" };
  return (
    <button type="button" disabled={!acao.habilitada} title={acao.motivo || undefined} onClick={onClick} style={estilo}>
      {rotulo}
    </button>
  );
}

function LinhaTabela({ l, hojeISO, abrir }: { l: LinhaFerias; hojeISO: string; abrir: (tipo: "programar" | "em_gozo" | "gozada" | "reabrir" | "data_base" | "saldo") => void }) {
  const p = l.periodo;
  const acoes = acoesDaLinha(l, hojeISO);
  const selo = seloDoPrazo(l);
  const ehTerceirizacao = l.tipo_servico === "terceirizacao";
  const modalidade = ehTerceirizacao ? SELO_TERCEIRIZACAO : SELO_MOT;
  // Quando a linha está cinza, o motivo (escrito) das ações bloqueadas aparece embaixo dos botões.
  const motivoBloqueio = [acoes.programar, acoes.emGozo, acoes.gozada].find((a) => !a.habilitada)?.motivo ?? "";
  const ehOk = l.estado === "ok";

  return (
    <tr style={{ borderBottom: "1px solid #F3F4F6" }} data-funcionario={l.funcionario_id}>
      <td style={TD_STYLE}>
        <Link href={`/painel/funcionarios/${l.funcionario_id}`} style={{ color: "#111827", fontWeight: 700, textDecoration: "underline", textDecorationThickness: 1 }}>
          {l.nome_completo}
        </Link>
        <div style={{ marginTop: 4 }}>
          <span style={{ ...SELO, background: modalidade.bg, color: modalidade.text }}>{ehTerceirizacao ? "Terceirização" : "MOT efetivado"}</span>
          {l.efetivado_em && <span style={{ fontSize: 11, color: "#6B7280", marginLeft: 6 }}>efetivado em {dataBR(l.efetivado_em)}</span>}
        </div>
      </td>
      <td style={{ ...TD_STYLE, color: "#374151" }}>{l.cliente_nome}</td>
      <td style={{ ...TD_STYLE, color: "#374151" }}>
        {dataBR(l.data_base)}
        {l.data_base_ajustada && (
          <span title={l.data_admissao ? `Data de admissão: ${dataBR(l.data_admissao)}` : "Sem data de admissão"} style={{ ...SELO, background: "#EDE9FE", color: "#5B21B6", marginLeft: 6 }}>
            ajustada
          </span>
        )}
      </td>
      <td style={{ ...TD_STYLE, color: "#374151" }}>
        {p && l.estado !== "base_alterada" ? (
          <>
            {dataBR(p.aquisitivo_inicio)} a {dataBR(p.aquisitivo_fim)}
            <div style={{ fontSize: 11, color: "#6B7280" }}>Período {p.numero}</div>
          </>
        ) : "—"}
      </td>
      <td style={{ ...TD_STYLE, color: "#374151" }}>{ehOk && p ? dataBR(p.data_limite) : "—"}</td>
      <td style={{ ...TD_STYLE, color: "#374151" }}>{ehOk ? textoDiasRestantes(l.dias_restantes) : "—"}</td>
      <td style={TD_STYLE}>
        <span style={{ ...SELO, background: selo.bg, color: selo.text }} title={l.saldo_calculado ? "Menos de 12 meses de casa: nenhum período terminou, então não há férias já quitadas a informar." : l.estado === "saldo_pendente" ? TEXTO_AJUDA_QUITADAS : undefined}>
          {selo.rotulo}
        </span>
      </td>
      <td style={TD_STYLE}>
        {ehOk && p ? (
          <>
            {ROTULO_SITUACAO_FERIAS[p.situacao]}
            {l.programacao_vencida && <div style={{ fontSize: 11, fontWeight: 700, color: "#B91C1C" }}>Data de início já passou</div>}
          </>
        ) : "—"}
      </td>
      <td style={{ ...TD_STYLE, color: "#374151" }}>
        {ehOk && p?.gozo_inicio && p.gozo_fim ? `${dataBR(p.gozo_inicio)} a ${dataBR(p.gozo_fim)}` : "—"}
        {ehOk && p?.observacao && <div style={{ fontSize: 11, color: "#6B7280", whiteSpace: "normal", maxWidth: 220 }}>{p.observacao}</div>}
      </td>
      <td style={{ ...TD_STYLE, whiteSpace: "normal", minWidth: 260 }}>
        <div className="flex gap-2 flex-wrap">
          {acoes.saldoEmDestaque && <BotaoAcao rotulo="Informar férias já quitadas" acao={acoes.informarSaldo} destaque onClick={() => abrir("saldo")} />}
          {acoes.dataBaseEmDestaque && <BotaoAcao rotulo="Ajustar data-base" acao={acoes.ajustarDataBase} destaque onClick={() => abrir("data_base")} />}
          <BotaoAcao rotulo={p?.situacao === "programada" ? "Alterar datas" : "Programar"} acao={acoes.programar} onClick={() => abrir("programar")} />
          <BotaoAcao rotulo="Iniciou férias" acao={acoes.emGozo} onClick={() => abrir("em_gozo")} />
          <BotaoAcao rotulo="Concluir férias" acao={acoes.gozada} onClick={() => abrir("gozada")} />
        </div>
        {motivoBloqueio && <p style={{ fontSize: 11, color: "#6B7280", margin: "6px 0 0" }}>{motivoBloqueio}</p>}
        <div className="flex gap-3 flex-wrap" style={{ marginTop: 6 }}>
          {acoes.reabrir.habilitada && (
            <button type="button" onClick={() => abrir("reabrir")} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reabrir</button>
          )}
          {!acoes.dataBaseEmDestaque && (
            <button type="button" onClick={() => abrir("data_base")} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Ajustar data-base</button>
          )}
          {!acoes.saldoEmDestaque && acoes.informarSaldo.habilitada && (
            <button type="button" onClick={() => abrir("saldo")} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Férias já quitadas</button>
          )}
        </div>
      </td>
    </tr>
  );
}
