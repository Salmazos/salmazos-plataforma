"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import CampoTelefone from "@/components/ui/CampoTelefone";
import { dataAdiamentoValida, diasDeAtraso } from "@/lib/lembretesRegras";
import { exibirTelefone, emailContatoValido, MSG_EMAIL_INVALIDO } from "@/lib/utils";
import { ROTULO_RESULTADO_CONTATO, ROTULO_MOTIVO_PERDA, rotuloEtapa, ehAberta } from "@/lib/comercialRotulos";

interface Vendedor { id: string; nome_completo: string; unidade_nome: string | null }
interface Props { vendedor: boolean; gestor: boolean; meuAnalistaId: string; vendedores: Vendedor[] }

interface Oportunidade {
  id: string;
  empresa: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  origem: string;
  servico_interesse: string | null;
  valor_estimado: number | null;
  etapa: string;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  motivo_perda: string | null;
  motivo_perda_categoria: string | null;
  empresa_visitada_id: string | null;
  contato_id: string | null;
  updated_at: string;
}
interface Interacao { id: string; tipo: string; resultado: string | null; descricao: string | null; created_at: string; contato_nome?: string | null }
interface Contato { id: string; nome: string; cargo: string | null; telefone: string | null; email: string | null; principal: boolean }
interface EmpresaOpc { id: string; nome: string; contatos: Contato[]; oportunidade_aberta: { id: string; vendedor_nome: string | null; etapa: string } | null }
interface Carteira { id: string; nome: string; contato_nome: string | null; contato_telefone: string | null; ultima_visita_em: string; total_visitas: number }
interface LembreteMeuDia {
  id: string; empresa_visitada_id: string | null; empresa_nome: string | null; texto: string | null;
  data_lembrete: string; contato_id: string | null; empresa_tem_oportunidade_aberta: boolean;
}
interface MeuDia { hoje: Oportunidade[]; atrasadas: Oportunidade[]; semRetorno: Carteira[]; lembretes: LembreteMeuDia[] }

// Fases em que valor e serviço já são exigidos (a partir de Proposta enviada; "negociacao" é legado).
const FASES_COM_VALOR = ["proposta_enviada", "negociacao", "ganho"];
const FASES_ABERTAS_NOVAS = ["prospeccao", "contato_feito", "reuniao_visita", "proposta_enviada"];
const FASES_SELECIONAVEIS = [...FASES_ABERTAS_NOVAS, "ganho", "perdido"];
const CODIGOS_ETAPA_RE = /\b(prospeccao|contato_feito|reuniao_visita|proposta_enviada|negociacao|ganho|perdido)\b/g;
const ROTULO_TIPO: Record<string, string> = {
  ligacao: "Ligação", visita: "Visita", email: "E-mail", whatsapp: "WhatsApp", anotacao: "Anotação", mudanca_etapa: "Mudança de fase",
};

const inputStyle: React.CSSProperties = { padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", width: "100%", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
const btnPrimario: React.CSSProperties = { padding: "9px 16px", background: "#FFB800", color: "#111", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnSecundario: React.CSSProperties = { padding: "9px 16px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 16 };

function fmtData(d: string | null): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(d).toLocaleDateString("pt-BR");
}
function fmtMoeda(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function diasParado(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
// Data de hoje em Brasília (AAAA-MM-DD) e soma de dias, para o padrão do lembrete de reconexão.
function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function somarDiasStr(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function textoSemMovimento(iso: string): string {
  const n = diasParado(iso);
  return `sem movimento há ${n} dia${n === 1 ? "" : "s"}`;
}
// Entradas antigas do histórico guardam códigos crus ("Etapa: contato_feito → ganho"); só as de
// mudança de fase são reescritas, para não trocar palavras comuns ("ganho", "perdido") em texto livre.
function descricaoHistorico(h: { tipo: string; descricao: string | null }): string | null {
  if (!h.descricao || h.tipo !== "mudanca_etapa") return h.descricao;
  return h.descricao.replace(/^Etapa:/, "Fase alterada:").replace(CODIGOS_ETAPA_RE, (c) => rotuloEtapa(c));
}

function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: React.ReactNode; largo?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: largo ? 720 : 480, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280" }} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ComercialClient({ vendedor, gestor, meuAnalistaId, vendedores }: Props) {
  const [aba, setAba] = useState<"dia" | "funil" | "lista">(vendedor ? "dia" : "funil");
  const [ops, setOps] = useState<Oportunidade[]>([]);
  const [hoje, setHoje] = useState<string>("");
  const [meuDia, setMeuDia] = useState<MeuDia>({ hoje: [], atrasadas: [], semRetorno: [], lembretes: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [novaAberta, setNovaAberta] = useState<null | { empresa_id?: string; empresa?: string }>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const qs = filtroVendedor ? `?vendedor=${encodeURIComponent(filtroVendedor)}` : "";
      const [r1, r2] = await Promise.all([
        fetch(`/api/comercial/oportunidades${qs}`),
        vendedor ? fetch("/api/comercial/meu-dia") : Promise.resolve(null),
      ]);
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "Erro ao carregar oportunidades.");
      setOps(j1.data ?? []);
      setHoje(j1.hoje ?? "");
      if (r2) {
        const j2 = await r2.json();
        if (r2.ok) setMeuDia({ hoje: [], atrasadas: [], semRetorno: [], lembretes: [], ...(j2.data ?? {}) });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [filtroVendedor, vendedor]);

  useEffect(() => { carregar(); }, [carregar]);

  // Vindo da Carteira ("Criar oportunidade"): abre o modal já com a empresa e limpa o parâmetro da URL.
  useEffect(() => {
    const empresaId = new URLSearchParams(window.location.search).get("empresa");
    if (!empresaId) return;
    if (vendedor) setNovaAberta({ empresa_id: empresaId });
    const url = new URL(window.location.href);
    url.searchParams.delete("empresa");
    window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }, [vendedor]);

  const detalhe = useMemo(() => ops.find((o) => o.id === detalheId) ?? null, [ops, detalheId]);
  const abas = [
    ...(vendedor ? [{ k: "dia" as const, t: "Meu dia" }] : []),
    { k: "funil" as const, t: "Funil" },
    { k: "lista" as const, t: "Lista" },
  ];

  function atrasada(o: Oportunidade): boolean {
    return ehAberta(o.etapa) && !!o.proxima_acao_em && !!hoje && o.proxima_acao_em < hoje;
  }
  function semProxima(o: Oportunidade): boolean {
    return ehAberta(o.etapa) && (!o.proxima_acao || !o.proxima_acao_em);
  }

  function CartaoOp({ o }: { o: Oportunidade }) {
    const alerta = atrasada(o) || semProxima(o);
    return (
      <div onClick={() => setDetalheId(o.id)} style={{ background: "#fff", border: `1px solid ${alerta ? "#FCA5A5" : "#E5E7EB"}`, borderLeft: `4px solid ${alerta ? "#DC2626" : "#FFB800"}`, borderRadius: 10, padding: 10, marginBottom: 8, cursor: "pointer" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{o.empresa}</div>
        {gestor && !vendedor || (gestor && o.vendedor_nome) ? <div style={{ fontSize: 11, color: "#6B7280" }}>{o.vendedor_nome}</div> : null}
        {/* Oportunidade encerrada (venda fechada / não desta vez) não mostra próxima ação nem data. */}
        {ehAberta(o.etapa) && (
          <>
            <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{o.proxima_acao || "Sem próxima ação"}</div>
            <div style={{ fontSize: 11, color: alerta ? "#B91C1C" : "#6B7280", marginTop: 2 }}>
              {o.proxima_acao_em ? fmtData(o.proxima_acao_em) : "sem data"}{atrasada(o) ? " · precisa de atenção" : ""}
            </div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginTop: 4 }}>
          <span>{FASES_COM_VALOR.includes(o.etapa) ? fmtMoeda(o.valor_estimado) : ""}</span>
          {ehAberta(o.etapa) && <span>{textoSemMovimento(o.updated_at)}</span>}
        </div>
        {o.etapa === "perdido" && o.motivo_perda_categoria && (
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{ROTULO_MOTIVO_PERDA[o.motivo_perda_categoria] ?? o.motivo_perda_categoria}</div>
        )}
      </div>
    );
  }

  const opsFiltradas = ops.filter((o) => !filtroEtapa || o.etapa === filtroEtapa || (filtroEtapa === "proposta_enviada" && o.etapa === "negociacao"));
  const vermelhas = gestor ? ops.filter((o) => atrasada(o) || semProxima(o)).length : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>Funil Comercial</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B7280" }}>
            {vendedor ? "Suas oportunidades e as próximas ações." : "Acompanhamento do funil (somente leitura)."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {gestor && vendedores.length > 0 && (
            <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome_completo}{v.unidade_nome ? ` — ${v.unidade_nome}` : ""}</option>
              ))}
            </select>
          )}
          {vendedor && <button style={btnPrimario} onClick={() => setNovaAberta({})}>+ Nova oportunidade</button>}
        </div>
      </div>

      {gestor && vermelhas > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
          <b>Aguardando um próximo passo:</b> {vermelhas} oportunidade(s) com contato atrasado ou sem próxima ação definida.
        </div>
      )}
      {erro && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{erro}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "2px solid #E5E7EB" }}>
        {abas.map((a) => (
          <button key={a.k} onClick={() => setAba(a.k)} style={{ padding: "9px 16px", background: "none", border: "none", borderBottom: aba === a.k ? "3px solid #FFB800" : "3px solid transparent", fontWeight: aba === a.k ? 800 : 600, color: aba === a.k ? "#111827" : "#6B7280", cursor: "pointer", fontSize: 14, marginBottom: -2 }}>
            {a.t}
          </button>
        ))}
      </div>

      {carregando ? <p style={{ color: "#6B7280" }}>Carregando...</p> : (
        <>
          {aba === "dia" && vendedor && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={cardStyle}>
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Precisam de atenção ({meuDia.atrasadas.length})</h3>
                {meuDia.atrasadas.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Nada precisando de atenção.</p> : meuDia.atrasadas.map((o) => <CartaoOp key={o.id} o={o} />)}
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Retomar contato ({meuDia.lembretes.length})</h3>
                {meuDia.lembretes.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Nenhuma empresa esperando seu retorno.</p> : meuDia.lembretes.map((l) => (
                  <LembreteCartao key={l.id} l={l} onMudou={carregar} onCriarOportunidade={(id, nome) => setNovaAberta({ empresa_id: id, empresa: nome })} />
                ))}
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Para hoje ({meuDia.hoje.length})</h3>
                {meuDia.hoje.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Nada agendado para hoje.</p> : meuDia.hoje.map((o) => <CartaoOp key={o.id} o={o} />)}
              </div>
              <div style={cardStyle}>
                <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Para reconectar (30+ dias sem contato) ({meuDia.semRetorno.length})</h3>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#6B7280" }}>Empresas da carteira que você visitou por último e que não têm oportunidade aberta.</p>
                {meuDia.semRetorno.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Nada a retomar.</p> : meuDia.semRetorno.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #F3F4F6" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>Última visita {fmtData(c.ultima_visita_em)} · {c.total_visitas} visita(s){c.contato_nome ? ` · ${c.contato_nome}` : ""}</div>
                    </div>
                    <button style={{ ...btnSecundario, padding: "6px 12px", fontSize: 12 }} onClick={() => setNovaAberta({ empresa_id: c.id, empresa: c.nome })}>Abrir oportunidade</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aba === "funil" && (
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
              {FASES_ABERTAS_NOVAS.map((k) => {
                const col = ops.filter((o) => o.etapa === k || (k === "proposta_enviada" && o.etapa === "negociacao"));
                const total = col.reduce((t, o) => t + (o.valor_estimado ?? 0), 0);
                return (
                  <div key={k} style={{ minWidth: 220, flex: "1 0 220px", background: "#F3F4F6", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "#374151" }}>{rotuloEtapa(k)} · {col.length}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>{FASES_COM_VALOR.includes(k) ? fmtMoeda(total) : " "}</div>
                    {col.map((o) => <CartaoOp key={o.id} o={o} />)}
                  </div>
                );
              })}
              <div style={{ minWidth: 220, flex: "1 0 220px", background: "#F3F4F6", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "#374151", marginBottom: 8 }}>Resultado</div>
                {(["ganho", "perdido"] as const).map((k) => {
                  const col = ops.filter((o) => o.etapa === k);
                  const total = col.reduce((t, o) => t + (o.valor_estimado ?? 0), 0);
                  return (
                    <div key={k} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: k === "ganho" ? "#166534" : "#6B7280" }}>{rotuloEtapa(k)} · {col.length}</div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>{k === "ganho" ? fmtMoeda(total) : " "}</div>
                      {col.map((o) => <CartaoOp key={o.id} o={o} />)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {aba === "lista" && (
            <div style={cardStyle}>
              <div style={{ marginBottom: 10 }}>
                <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  <option value="">Todas as fases</option>
                  {FASES_SELECIONAVEIS.map((k) => <option key={k} value={k}>{rotuloEtapa(k)}</option>)}
                </select>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#B45309", fontSize: 11, textTransform: "uppercase" }}>
                      <th style={{ padding: 8 }}>Empresa</th>
                      {gestor && <th style={{ padding: 8 }}>Vendedor</th>}
                      <th style={{ padding: 8 }}>Fase</th>
                      <th style={{ padding: 8 }}>Próxima ação</th>
                      <th style={{ padding: 8 }}>Data</th>
                      <th style={{ padding: 8 }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opsFiltradas.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 16, color: "#6B7280" }}>Nenhuma oportunidade.</td></tr>
                    ) : opsFiltradas.map((o) => (
                      <tr key={o.id} onClick={() => setDetalheId(o.id)} style={{ borderTop: "1px solid #F3F4F6", cursor: "pointer", background: atrasada(o) || semProxima(o) ? "#FEF2F2" : undefined }}>
                        <td style={{ padding: 8, fontWeight: 700 }}>{o.empresa}</td>
                        {gestor && <td style={{ padding: 8 }}>{o.vendedor_nome ?? "—"}</td>}
                        <td style={{ padding: 8 }}>{rotuloEtapa(o.etapa)}</td>
                        <td style={{ padding: 8 }}>{o.proxima_acao || "—"}</td>
                        <td style={{ padding: 8 }}>{fmtData(o.proxima_acao_em)}</td>
                        <td style={{ padding: 8 }}>{FASES_COM_VALOR.includes(o.etapa) ? fmtMoeda(o.valor_estimado) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {novaAberta && <ModalNova inicial={novaAberta} onClose={() => setNovaAberta(null)} onSalvo={() => { setNovaAberta(null); carregar(); }} />}
      {detalhe && <ModalDetalhe op={detalhe} podeEditar={vendedor && detalhe.vendedor_id === meuAnalistaId} onClose={() => setDetalheId(null)} onMudou={carregar} />}
    </div>
  );
}

// Item da seção "Retomar contato" do Meu dia: registrar contato, adiar ou dispensar o lembrete.
function LembreteCartao({ l, onMudou, onCriarOportunidade }: { l: LembreteMeuDia; onMudou: () => void; onCriarOportunidade: (empresaId: string, nome: string) => void }) {
  const hoje = hojeSP();
  const atraso = diasDeAtraso(l.data_lembrete, hoje);
  const [modo, setModo] = useState<"" | "adiar" | "registrar">("");
  const [novaData, setNovaData] = useState(somarDiasStr(hoje, 1));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function acao(corpo: { acao: "adiar" | "concluir" | "cancelar"; nova_data?: string }) {
    setSalvando(true); setErro("");
    const r = await fetch(`/api/comercial/lembretes/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(j.error || "Não foi possível concluir a ação."); return false; }
    setModo(""); onMudou();
    return true;
  }
  function adiar() {
    if (!dataAdiamentoValida(novaData, hoje)) { setErro("Escolha uma data depois de hoje."); return; }
    acao({ acao: "adiar", nova_data: novaData });
  }
  function dispensar() {
    if (!window.confirm("Não é mais necessário retomar contato com esta empresa?")) return;
    acao({ acao: "cancelar" });
  }

  return (
    <div style={{ borderTop: "1px solid #F3F4F6", padding: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>
            {l.empresa_nome ?? "Empresa"}
            {l.empresa_tem_oportunidade_aberta && (
              <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#DBEAFE", color: "#1E40AF" }}>Já tem oportunidade aberta</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#374151" }}>{l.texto || "Retomar contato"}</div>
          <div style={{ fontSize: 11, color: atraso > 0 ? "#B91C1C" : "#6B7280" }}>
            para {fmtData(l.data_lembrete)}{atraso > 0 ? ` · atrasado há ${atraso} dia${atraso === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
          <button style={{ ...btnPrimario, padding: "6px 12px", fontSize: 12 }} disabled={salvando || !l.empresa_visitada_id} onClick={() => { setErro(""); setModo("registrar"); }}>Registrar contato</button>
          <button style={{ ...btnSecundario, padding: "6px 12px", fontSize: 12 }} disabled={salvando} onClick={() => { setErro(""); setModo(modo === "adiar" ? "" : "adiar"); }}>Adiar</button>
          <button style={{ ...btnSecundario, padding: "6px 12px", fontSize: 12 }} disabled={salvando} onClick={dispensar}>Não é mais necessário</button>
          {!l.empresa_tem_oportunidade_aberta && l.empresa_visitada_id && (
            <button style={{ ...btnSecundario, padding: "6px 12px", fontSize: 12 }} onClick={() => onCriarOportunidade(l.empresa_visitada_id as string, l.empresa_nome ?? "")}>Criar oportunidade</button>
          )}
        </div>
      </div>
      {modo === "adiar" && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8 }}>
          <div><label style={labelStyle}>Nova data</label><input type="date" style={inputStyle} min={somarDiasStr(hoje, 1)} value={novaData} onChange={(x) => setNovaData(x.target.value)} /></div>
          <button style={btnPrimario} disabled={salvando} onClick={adiar}>{salvando ? "Salvando..." : "Confirmar"}</button>
          <button style={btnSecundario} onClick={() => setModo("")}>Cancelar</button>
        </div>
      )}
      {erro && <div style={{ color: "#B91C1C", fontSize: 13, marginTop: 6 }}>{erro}</div>}
      {modo === "registrar" && l.empresa_visitada_id && (
        <ModalRegistrarLembrete
          lembrete={l}
          onClose={() => setModo("")}
          onSalvo={async () => {
            // Contato registrado: o lembrete está cumprido. Se isso falhar, o contato JÁ foi gravado.
            const ok = await acao({ acao: "concluir" });
            if (!ok) setErro("O contato foi registrado, mas não foi possível marcar o lembrete como feito. Tente de novo.");
            else setModo("");
          }}
        />
      )}
    </div>
  );
}

// Modal compacto de registro de contato avulso (POST /api/comercial/empresas/[id]/registros).
// Não abre oportunidade: quem decide isso é o vendedor depois.
function ModalRegistrarLembrete({ lembrete, onClose, onSalvo }: { lembrete: LembreteMeuDia; onClose: () => void; onSalvo: () => void | Promise<void> }) {
  const hoje = hojeSP();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [f, setF] = useState({ contato_id: lembrete.contato_id ?? "", tipo: "ligacao", resultado: "", descricao: "", ocorrido_em: hoje, proximo_contato_em: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/comercial/empresas/${lembrete.empresa_visitada_id}/contatos`);
        const j = await r.json();
        if (!r.ok) return;
        const lista: Contato[] = j.data ?? [];
        setContatos(lista);
        setF((p) => p.contato_id ? p : { ...p, contato_id: (lista.find((c) => c.principal) ?? lista[0])?.id ?? "" });
      } catch { /* sem contatos: o registro vai sem contato */ }
    })();
  }, [lembrete.empresa_visitada_id]);

  async function salvar() {
    setSalvando(true); setErro("");
    const r = await fetch(`/api/comercial/empresas/${lembrete.empresa_visitada_id}/registros`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contato_id: f.contato_id || null, tipo: f.tipo, resultado: f.resultado || null, descricao: f.descricao || null,
        ocorrido_em: f.ocorrido_em || undefined, proximo_contato_em: f.proximo_contato_em || undefined,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setSalvando(false); setErro(j.error || "Erro ao salvar."); return; }
    await onSalvo();
    setSalvando(false);
  }

  return (
    <Modal titulo={`Registrar contato · ${lembrete.empresa_nome ?? ""}`} onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Contato</label>
            <select style={inputStyle} value={f.contato_id} onChange={(x) => setF({ ...f, contato_id: x.target.value })}>
              <option value="">—</option>
              {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ""}</option>)}
            </select></div>
          <div><label style={labelStyle}>Tipo</label>
            <select style={inputStyle} value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })}>
              {Object.entries(ROTULO_TIPO).filter(([k]) => k !== "mudanca_etapa").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
        </div>
        <div><label style={labelStyle}>Resultado</label>
          <select style={inputStyle} value={f.resultado} onChange={(x) => setF({ ...f, resultado: x.target.value })}>
            <option value="">—</option>
            {Object.entries(ROTULO_RESULTADO_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label style={labelStyle}>O que foi conversado</label><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={f.descricao} onChange={(x) => setF({ ...f, descricao: x.target.value })} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Data do contato</label><input type="date" style={inputStyle} max={hoje} value={f.ocorrido_em} onChange={(x) => setF({ ...f, ocorrido_em: x.target.value })} /></div>
          <div><label style={labelStyle}>Quando vamos retornar?</label><input type="date" style={inputStyle} min={hoje} value={f.proximo_contato_em} onChange={(x) => setF({ ...f, proximo_contato_em: x.target.value })} /></div>
        </div>
        {erro && <div style={{ color: "#B91C1C", fontSize: 13 }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnSecundario} onClick={onClose}>Cancelar</button>
          <button style={btnPrimario} disabled={salvando} onClick={salvar}>{salvando ? "Salvando..." : "Salvar contato"}</button>
        </div>
      </div>
    </Modal>
  );
}

function ModalNova({ inicial, onClose, onSalvo }: { inicial: { empresa_id?: string; empresa?: string }; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ servico_interesse: "", valor_estimado: "", origem: "ligacao", etapa: "prospeccao", proxima_acao: "", proxima_acao_em: "" });
  const [q, setQ] = useState(inicial.empresa ?? "");
  const [resultados, setResultados] = useState<EmpresaOpc[]>([]);
  const [empresa, setEmpresa] = useState<EmpresaOpc | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(!inicial.empresa_id);
  const [cadastrando, setCadastrando] = useState(false);
  const [nomeNovaEmpresa, setNomeNovaEmpresa] = useState("");
  const [contatoSel, setContatoSel] = useState("");
  const [novoContato, setNovoContato] = useState({ nome: "", cargo: "", telefone: "", email: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  function escolher(emp: EmpresaOpc) {
    setEmpresa(emp);
    setBuscaAberta(false);
    setContatoSel((emp.contatos.find((c) => c.principal) ?? emp.contatos[0])?.id ?? "novo");
  }

  // Busca na Carteira com debounce simples.
  useEffect(() => {
    if (!buscaAberta) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/comercial/empresas?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        if (r.ok) setResultados(j.data ?? []);
      } catch { /* ignora: a lista só não atualiza */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q, buscaAberta]);

  // Empresa já escolhida (vem do "Para reconectar" do Meu dia).
  useEffect(() => {
    if (!inicial.empresa_id) return;
    (async () => {
      const r = await fetch(`/api/comercial/empresas?id=${encodeURIComponent(inicial.empresa_id ?? "")}`);
      const j = await r.json();
      const achada = (j.data ?? []).find((x: EmpresaOpc) => x.id === inicial.empresa_id);
      if (achada) escolher(achada); else setBuscaAberta(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cadastrarEmpresa() {
    setErro("");
    const r = await fetch("/api/comercial/empresas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nomeNovaEmpresa }) });
    const j = await r.json();
    if (!r.ok) { setErro(j.error || "Erro ao cadastrar empresa."); return; }
    // Se a empresa já existia, a resposta não traz contatos nem oportunidade aberta: recarrega a ficha.
    const r2 = await fetch(`/api/comercial/empresas?q=${encodeURIComponent(j.data.nome)}`);
    const j2 = await r2.json();
    const ficha: EmpresaOpc = (j2.data ?? []).find((x: EmpresaOpc) => x.id === j.data.id) ?? j.data;
    setCadastrando(false); setNomeNovaEmpresa("");
    escolher(ficha);
  }

  async function salvar() {
    if (!empresa) { setErro("Escolha uma empresa da Carteira."); return; }
    if (empresa.oportunidade_aberta) { setErro("Essa empresa já tem uma oportunidade aberta."); return; }
    setSalvando(true); setErro("");
    let contatoId: string | null = contatoSel && contatoSel !== "novo" ? contatoSel : null;
    if (contatoSel === "novo" && novoContato.nome.trim()) {
      if (!emailContatoValido(novoContato.email)) { setSalvando(false); setErro(MSG_EMAIL_INVALIDO); return; }
      const rc = await fetch(`/api/comercial/empresas/${empresa.id}/contatos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novoContato) });
      const jc = await rc.json();
      if (!rc.ok) { setSalvando(false); setErro(jc.error || "Erro ao salvar o contato."); return; }
      contatoId = jc.data.id;
    }
    const res = await fetch("/api/comercial/oportunidades", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f,
        empresa_visitada_id: empresa.id,
        contato_id: contatoId,
        valor_estimado: f.etapa === "proposta_enviada" && f.valor_estimado !== "" ? Number(f.valor_estimado.replace(",", ".")) : null,
      }),
    });
    const j = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar."); return; }
    onSalvo();
  }

  return (
    <Modal titulo="Nova oportunidade" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={labelStyle}>Empresa da Carteira *</label>
          {empresa && !buscaAberta ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, ...inputStyle }}>
              <span style={{ fontWeight: 700 }}>{empresa.nome}</span>
              <button style={{ ...btnSecundario, padding: "4px 10px", fontSize: 12 }} onClick={() => { setBuscaAberta(true); setQ(empresa.nome); }}>Trocar</button>
            </div>
          ) : (
            <>
              <input style={inputStyle} value={q} onChange={(x) => setQ(x.target.value)} placeholder="Digite para buscar na Carteira..." />
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8, marginTop: 4 }}>
                {resultados.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: "#6B7280" }}>Nenhuma empresa encontrada.</div> : resultados.map((r) => (
                  <div key={r.id}
                    onClick={() => { if (!r.oportunidade_aberta) escolher(r); }}
                    style={{ padding: "8px 10px", borderTop: "1px solid #F3F4F6", fontSize: 13, cursor: r.oportunidade_aberta ? "not-allowed" : "pointer", opacity: r.oportunidade_aberta ? 0.6 : 1 }}>
                    <div style={{ fontWeight: 700 }}>{r.nome}</div>
                    {r.oportunidade_aberta && (
                      <div style={{ fontSize: 11, color: "#B45309" }}>Já tem oportunidade aberta ({r.oportunidade_aberta.vendedor_nome ?? "—"} · {rotuloEtapa(r.oportunidade_aberta.etapa)})</div>
                    )}
                  </div>
                ))}
              </div>
              {!cadastrando ? (
                <button style={{ ...btnSecundario, padding: "4px 10px", fontSize: 12, marginTop: 6 }} onClick={() => { setCadastrando(true); setNomeNovaEmpresa(q); }}>Cadastrar nova empresa</button>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input style={inputStyle} value={nomeNovaEmpresa} onChange={(x) => setNomeNovaEmpresa(x.target.value)} placeholder="Nome da nova empresa" />
                  <button style={btnPrimario} onClick={cadastrarEmpresa}>Cadastrar</button>
                  <button style={btnSecundario} onClick={() => setCadastrando(false)}>Cancelar</button>
                </div>
              )}
            </>
          )}
        </div>

        {empresa && !buscaAberta && (
          <div>
            <label style={labelStyle}>Contato</label>
            <select style={inputStyle} value={contatoSel} onChange={(x) => setContatoSel(x.target.value)}>
              {empresa.contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ""}{c.principal ? " (principal)" : ""}</option>)}
              <option value="novo">Novo contato</option>
            </select>
            {contatoSel === "novo" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <div><label style={labelStyle}>Nome *</label><input style={inputStyle} value={novoContato.nome} onChange={(x) => setNovoContato({ ...novoContato, nome: x.target.value })} /></div>
                <div><label style={labelStyle}>Cargo</label><input style={inputStyle} value={novoContato.cargo} onChange={(x) => setNovoContato({ ...novoContato, cargo: x.target.value })} /></div>
                <div><label style={labelStyle}>Telefone</label><CampoTelefone style={inputStyle} placeholder="(00) 00000-0000" value={novoContato.telefone} onChange={(v) => setNovoContato({ ...novoContato, telefone: v })} /></div>
                <div><label style={labelStyle}>E-mail</label><input style={inputStyle} value={novoContato.email} onChange={(x) => setNovoContato({ ...novoContato, email: x.target.value })} /></div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Serviço de interesse</label><input style={inputStyle} value={f.servico_interesse} onChange={(e) => set("servico_interesse", e.target.value)} placeholder="R&S, MOT, Terceirização..." /></div>
          {f.etapa === "proposta_enviada" && <div><label style={labelStyle}>Valor estimado (R$) *</label><input style={inputStyle} inputMode="decimal" value={f.valor_estimado} onChange={(e) => set("valor_estimado", e.target.value)} /></div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Origem</label>
            <select style={inputStyle} value={f.origem} onChange={(e) => set("origem", e.target.value)}>
              <option value="ligacao">Ligação</option><option value="indicacao">Indicação</option><option value="outro">Outro</option>
            </select></div>
          <div><label style={labelStyle}>Fase inicial</label>
            <select style={inputStyle} value={f.etapa} onChange={(e) => set("etapa", e.target.value)}>
              {FASES_ABERTAS_NOVAS.map((k) => <option key={k} value={k}>{rotuloEtapa(k)}</option>)}
            </select></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Próxima ação *</label><input style={inputStyle} value={f.proxima_acao} onChange={(e) => set("proxima_acao", e.target.value)} placeholder="Ex.: ligar para o RH" /></div>
          <div><label style={labelStyle}>Data *</label><input type="date" style={inputStyle} value={f.proxima_acao_em} onChange={(e) => set("proxima_acao_em", e.target.value)} /></div>
        </div>
        {erro && <div style={{ color: "#B91C1C", fontSize: 13 }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnSecundario} onClick={onClose}>Cancelar</button>
          <button style={btnPrimario} disabled={salvando} onClick={salvar}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </Modal>
  );
}

function ModalDetalhe({ op, podeEditar, onClose, onMudou }: { op: Oportunidade; podeEditar: boolean; onClose: () => void; onMudou: () => void }) {
  const [hist, setHist] = useState<Interacao[]>([]);
  const [modo, setModo] = useState<"" | "contato" | "etapa">("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [c, setC] = useState({ tipo: "ligacao", resultado: "", descricao: "", proxima_acao: "", proxima_acao_em: "", contato_id: op.contato_id ?? "" });
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [e, setE] = useState({ etapa: op.etapa === "negociacao" ? "proposta_enviada" : op.etapa, motivo_perda_categoria: "", motivo_perda: "", reconectar_em: somarDiasStr(hojeSP(), 90), valor_estimado: op.valor_estimado != null ? String(op.valor_estimado).replace(".", ",") : "", servico_interesse: op.servico_interesse ?? "", proxima_acao: op.proxima_acao ?? "", proxima_acao_em: op.proxima_acao_em ?? "" });
  const aberta = ehAberta(op.etapa);

  const carregarHist = useCallback(async () => {
    const r = await fetch(`/api/comercial/oportunidades/${op.id}/interacoes`);
    const j = await r.json();
    if (r.ok) setHist(j.data ?? []);
  }, [op.id]);
  useEffect(() => { carregarHist(); }, [carregarHist]);
  useEffect(() => {
    if (!op.empresa_visitada_id) return;
    (async () => {
      const r = await fetch(`/api/comercial/empresas/${op.empresa_visitada_id}/contatos`);
      const j = await r.json();
      if (r.ok) setContatos(j.data ?? []);
    })();
  }, [op.empresa_visitada_id]);
  const contatoAtual = contatos.find((x) => x.id === op.contato_id) ?? null;
  const [novoContatoAberto, setNovoContatoAberto] = useState(false);
  const [novoContato, setNovoContato] = useState({ nome: "", cargo: "", telefone: "", email: "" });

  // Cria o contato na empresa e já o seleciona na oportunidade.
  async function criarContatoESelecionar() {
    if (!op.empresa_visitada_id) return;
    if (!novoContato.nome.trim()) { setErro("Informe o nome do contato."); return; }
    if (!emailContatoValido(novoContato.email)) { setErro(MSG_EMAIL_INVALIDO); return; }
    setSalvando(true); setErro("");
    const rc = await fetch(`/api/comercial/empresas/${op.empresa_visitada_id}/contatos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novoContato) });
    const jc = await rc.json();
    if (!rc.ok) { setSalvando(false); setErro(jc.error || "Erro ao salvar o contato."); return; }
    const rp = await fetch(`/api/comercial/oportunidades/${op.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contato_id: jc.data.id }) });
    const jp = await rp.json();
    setSalvando(false);
    if (!rp.ok) { setErro(jp.error || "Contato criado, mas não foi possível selecioná-lo."); return; }
    setNovoContatoAberto(false); setNovoContato({ nome: "", cargo: "", telefone: "", email: "" });
    setContatos((prev) => [...prev, jc.data]);
    onMudou();
  }

  async function enviar(url: string, method: string, body: unknown) {
    setSalvando(true); setErro("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setSalvando(false);
    if (!r.ok) { setErro(j.error || "Erro ao salvar."); return; }
    setModo(""); carregarHist(); onMudou();
  }

  const novaAberta = ehAberta(e.etapa);
  const exigeValor = e.etapa === "proposta_enviada" || e.etapa === "ganho";

  return (
    <Modal titulo={op.empresa} onClose={onClose} largo>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#374151", marginBottom: 12 }}>
        <div><b>Fase:</b> {rotuloEtapa(op.etapa)}</div>
        <div><b>Valor:</b> {FASES_COM_VALOR.includes(op.etapa) ? fmtMoeda(op.valor_estimado) : "—"}</div>
        <div><b>Contato:</b> {op.contato_nome || "—"}{contatoAtual?.cargo ? ` · ${contatoAtual.cargo}` : ""}{op.contato_telefone ? ` · ${exibirTelefone(op.contato_telefone)}` : ""}</div>
        <div><b>E-mail:</b> {op.contato_email || "—"}</div>
        {podeEditar && op.empresa_visitada_id && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Trocar contato</label>
            <div style={{ display: "flex", gap: 8 }}>
              {contatos.length > 0 && (
                <select style={inputStyle} value={op.contato_id ?? ""} disabled={salvando}
                  onChange={(x) => enviar(`/api/comercial/oportunidades/${op.id}`, "PATCH", { contato_id: x.target.value || null })}>
                  <option value="">Sem contato</option>
                  {contatos.map((k) => <option key={k.id} value={k.id}>{k.nome}{k.cargo ? ` · ${k.cargo}` : ""}</option>)}
                </select>
              )}
              <button style={{ ...btnSecundario, whiteSpace: "nowrap" }} onClick={() => setNovoContatoAberto((v) => !v)}>Novo contato</button>
            </div>
            {novoContatoAberto && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <div><label style={labelStyle}>Nome *</label><input style={inputStyle} value={novoContato.nome} onChange={(x) => setNovoContato({ ...novoContato, nome: x.target.value })} /></div>
                <div><label style={labelStyle}>Cargo</label><input style={inputStyle} value={novoContato.cargo} onChange={(x) => setNovoContato({ ...novoContato, cargo: x.target.value })} /></div>
                <div><label style={labelStyle}>Telefone</label><CampoTelefone style={inputStyle} placeholder="(00) 00000-0000" value={novoContato.telefone} onChange={(v) => setNovoContato({ ...novoContato, telefone: v })} /></div>
                <div><label style={labelStyle}>E-mail</label><input style={inputStyle} value={novoContato.email} onChange={(x) => setNovoContato({ ...novoContato, email: x.target.value })} /></div>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnPrimario} disabled={salvando} onClick={criarContatoESelecionar}>{salvando ? "Salvando..." : "Salvar e selecionar"}</button>
                </div>
              </div>
            )}
          </div>
        )}
        <div><b>Serviço:</b> {op.servico_interesse || "—"}</div>
        <div><b>Vendedor:</b> {op.vendedor_nome || "—"}</div>
        {aberta && <div style={{ gridColumn: "1 / -1" }}><b>Próxima ação:</b> {op.proxima_acao || "—"} {op.proxima_acao_em ? `(${fmtData(op.proxima_acao_em)})` : ""}</div>}
        {(op.motivo_perda_categoria || op.motivo_perda) && (
          <div style={{ gridColumn: "1 / -1" }}><b>Motivo:</b> {op.motivo_perda_categoria ? (ROTULO_MOTIVO_PERDA[op.motivo_perda_categoria] ?? op.motivo_perda_categoria) : ""}{op.motivo_perda ? `${op.motivo_perda_categoria ? " — " : ""}${op.motivo_perda}` : ""}</div>
        )}
      </div>

      {podeEditar && modo === "" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button style={btnPrimario} onClick={() => setModo("contato")}>Registrar contato</button>
          <button style={btnSecundario} onClick={() => setModo("etapa")}>Alterar fase</button>
        </div>
      )}

      {modo === "contato" && (
        <div style={{ ...cardStyle, marginBottom: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={c.tipo} onChange={(x) => setC({ ...c, tipo: x.target.value })}>
                <option value="ligacao">Ligação</option><option value="visita">Visita</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="anotacao">Anotação</option>
              </select></div>
            <div><label style={labelStyle}>Resultado</label>
              <select style={inputStyle} value={c.resultado} onChange={(x) => setC({ ...c, resultado: x.target.value })}>
                <option value="">—</option>
                {Object.entries(ROTULO_RESULTADO_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          {contatos.length > 0 && (
            <div><label style={labelStyle}>Contato</label>
              <select style={inputStyle} value={c.contato_id} onChange={(x) => setC({ ...c, contato_id: x.target.value })}>
                <option value="">—</option>
                {contatos.map((k) => <option key={k.id} value={k.id}>{k.nome}{k.cargo ? ` · ${k.cargo}` : ""}</option>)}
              </select></div>
          )}
          <div><label style={labelStyle}>O que foi conversado</label><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={c.descricao} onChange={(x) => setC({ ...c, descricao: x.target.value })} /></div>
          {aberta && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div><label style={labelStyle}>Próxima ação *</label><input style={inputStyle} value={c.proxima_acao} onChange={(x) => setC({ ...c, proxima_acao: x.target.value })} /></div>
              <div><label style={labelStyle}>Quando vamos retomar? *</label><input type="date" style={inputStyle} value={c.proxima_acao_em} onChange={(x) => setC({ ...c, proxima_acao_em: x.target.value })} /></div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnSecundario} onClick={() => setModo("")}>Cancelar</button>
            <button style={btnPrimario} disabled={salvando} onClick={() => enviar(`/api/comercial/oportunidades/${op.id}/interacoes`, "POST", {
              tipo: c.tipo, resultado: c.resultado || null, descricao: c.descricao || null, contato_id: c.contato_id || null,
              ...(aberta ? { proxima_acao: c.proxima_acao, proxima_acao_em: c.proxima_acao_em } : {}),
            })}>{salvando ? "Salvando..." : "Salvar contato"}</button>
          </div>
        </div>
      )}

      {modo === "etapa" && (
        <div style={{ ...cardStyle, marginBottom: 14, display: "grid", gap: 10 }}>
          <div><label style={labelStyle}>Nova fase</label>
            <select style={inputStyle} value={e.etapa} onChange={(x) => setE({ ...e, etapa: x.target.value })}>
              {FASES_SELECIONAVEIS.map((k) => <option key={k} value={k}>{rotuloEtapa(k)}</option>)}
            </select></div>
          {exigeValor && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelStyle}>Valor estimado (R$) *</label><input style={inputStyle} inputMode="decimal" value={e.valor_estimado} onChange={(x) => setE({ ...e, valor_estimado: x.target.value })} /></div>
              <div><label style={labelStyle}>Serviço de interesse *</label><input style={inputStyle} value={e.servico_interesse} onChange={(x) => setE({ ...e, servico_interesse: x.target.value })} placeholder="R&S, MOT, Terceirização..." /></div>
            </div>
          )}
          {e.etapa === "perdido" && (
            <>
              <div><label style={labelStyle}>Motivo *</label>
                <select style={inputStyle} value={e.motivo_perda_categoria} onChange={(x) => setE({ ...e, motivo_perda_categoria: x.target.value })}>
                  <option value="">Selecione...</option>
                  {Object.entries(ROTULO_MOTIVO_PERDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div><label style={labelStyle}>Quando vamos reconectar? *</label>
                <input type="date" style={inputStyle} value={e.reconectar_em} min={hojeSP()} onChange={(x) => setE({ ...e, reconectar_em: x.target.value })} />
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Você receberá um lembrete nesta data.</div></div>
              {e.motivo_perda_categoria === "outro" && (
                <div><label style={labelStyle}>Qual foi o motivo? *</label><input style={inputStyle} value={e.motivo_perda} onChange={(x) => setE({ ...e, motivo_perda: x.target.value })} /></div>
              )}
            </>
          )}
          {novaAberta && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div><label style={labelStyle}>Próxima ação *</label><input style={inputStyle} value={e.proxima_acao} onChange={(x) => setE({ ...e, proxima_acao: x.target.value })} /></div>
              <div><label style={labelStyle}>Quando vamos retomar? *</label><input type="date" style={inputStyle} value={e.proxima_acao_em} onChange={(x) => setE({ ...e, proxima_acao_em: x.target.value })} /></div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnSecundario} onClick={() => setModo("")}>Cancelar</button>
            <button style={btnPrimario} disabled={salvando} onClick={() => enviar(`/api/comercial/oportunidades/${op.id}`, "PATCH", {
              etapa: e.etapa,
              ...(exigeValor ? { valor_estimado: e.valor_estimado.trim() === "" ? null : Number(e.valor_estimado.replace(",", ".")), servico_interesse: e.servico_interesse } : {}),
              ...(e.etapa === "perdido" ? { motivo_perda_categoria: e.motivo_perda_categoria || undefined, reconectar_em: e.reconectar_em || undefined, ...(e.motivo_perda_categoria === "outro" ? { motivo_perda: e.motivo_perda } : {}) } : {}),
              ...(novaAberta ? { proxima_acao: e.proxima_acao, proxima_acao_em: e.proxima_acao_em } : {}),
            })}>{salvando ? "Salvando..." : "Salvar fase"}</button>
          </div>
        </div>
      )}

      {erro && <div style={{ color: "#B91C1C", fontSize: 13, marginBottom: 10 }}>{erro}</div>}

      <h3 style={{ fontSize: 14, margin: "4px 0 8px" }}>Histórico</h3>
      {hist.length === 0 ? <p style={{ fontSize: 13, color: "#6B7280" }}>Sem interações ainda.</p> : hist.map((h) => (
        <div key={h.id} style={{ borderTop: "1px solid #F3F4F6", padding: "8px 0", fontSize: 13 }}>
          <div style={{ color: "#6B7280", fontSize: 11 }}>{new Date(h.created_at).toLocaleString("pt-BR")} · {ROTULO_TIPO[h.tipo] ?? h.tipo}{h.resultado ? ` · ${ROTULO_RESULTADO_CONTATO[h.resultado] ?? h.resultado}` : ""}{h.contato_nome ? ` · ${h.contato_nome}` : ""}</div>
          {h.descricao && <div style={{ color: "#111827" }}>{descricaoHistorico(h)}</div>}
        </div>
      ))}
    </Modal>
  );
}
