"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL, PADROES_RS, condicoesRsSchema, quantidadeItensFixosRs,
} from "@/lib/propostaModelos";
import { itensDasCondicoes } from "@/lib/solicitacaoVagaCondicoes";
import { MAX_USOS_LINK, ROTULO_STATUS_LINK, VALIDADES_LINK_DIAS, VALIDADE_LINK_PADRAO_DIAS, type StatusLink } from "@/lib/solicitacaoVagaLink";

// Link público de solicitação de vaga para cliente novo (sem acesso ao portal). O analista define as condições comerciais
// (as mesmas cláusulas da proposta R&S), gera o link, copia para o WhatsApp e acompanha/revoga os links da unidade.

interface LinkItem {
  id: string;
  url: string;
  nome_empresa: string | null;
  status: StatusLink;
  usos: number;
  max_usos: number;
  expira_em: string;
  created_at: string;
  criado_por_nome: string | null;
}

interface PropostaOpcao {
  id: string;
  numero: string;
  cliente_nome: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface CondicoesForm {
  taxa_sem_reposicao_pct: string;
  taxa_com_reposicao_pct: string;
  prazo_envio_curriculos_dias_uteis: string;
  taxa_cancelamento_pct: string;
  prazo_faturamento_dias: string;
}

const CAMPOS: { chave: keyof CondicoesForm; rotulo: string; sufixo: string; ajuda?: string }[] = [
  { chave: "taxa_sem_reposicao_pct", rotulo: "Taxa sobre o 1º salário — vagas sem reposição", sufixo: "%" },
  { chave: "taxa_com_reposicao_pct", rotulo: "Taxa sobre o 1º salário — vagas com 01 reposição em 30 dias", sufixo: "%" },
  { chave: "prazo_envio_curriculos_dias_uteis", rotulo: "Envio dos currículos em até", sufixo: "dias úteis" },
  {
    chave: "taxa_cancelamento_pct",
    rotulo: "Taxa em caso de cancelamento/congelamento",
    sufixo: "%",
    ajuda: "Deixe em branco ou 0 se não cobrar taxa de cancelamento (a cláusula sai do texto que o cliente vê).",
  },
  { chave: "prazo_faturamento_dias", rotulo: "Faturamento com vencimento em até", sufixo: "dias" },
];

const ROTULO_ERRO: Record<string, string> = Object.fromEntries(CAMPOS.map((c) => [c.chave, c.rotulo]));

function condicoesPadrao(): CondicoesForm {
  return {
    taxa_sem_reposicao_pct: String(PADROES_RS.taxa_sem_reposicao_pct),
    taxa_com_reposicao_pct: String(PADROES_RS.taxa_com_reposicao_pct),
    prazo_envio_curriculos_dias_uteis: String(PADROES_RS.prazo_envio_curriculos_dias_uteis),
    taxa_cancelamento_pct: String(PADROES_RS.taxa_cancelamento_pct),
    prazo_faturamento_dias: String(PADROES_RS.prazo_faturamento_dias),
  };
}

const numero = (v: string) => v.trim().replace(",", ".");
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const COR_STATUS: Record<StatusLink, { bg: string; color: string }> = {
  ativo: { bg: "#DCFCE7", color: "#166534" },
  expirado: { bg: "#F3F4F6", color: "#6B7280" },
  revogado: { bg: "#FEE2E2", color: "#991B1B" },
  limite: { bg: "#FEF3C7", color: "#92400E" },
};

function mensagemWhatsapp(link: Pick<LinkItem, "url" | "nome_empresa" | "expira_em">): string {
  const saudacao = link.nome_empresa ? `Olá, ${link.nome_empresa}!` : "Olá!";
  return `${saudacao} Para abrir a sua vaga com a Salmazos, preencha a solicitação neste link (leva cerca de 5 minutos):\n${link.url}\n\nO link vale até ${fmtData(link.expira_em)}. Qualquer dúvida, é só falar com a gente.`;
}

export default function ModalLinkSolicitacaoVaga({ isOpen, onClose }: Props) {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [gerado, setGerado] = useState<LinkItem | null>(null);
  const [copiado, setCopiado] = useState("");

  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [validade, setValidade] = useState<number>(VALIDADE_LINK_PADRAO_DIAS);
  const [condicoes, setCondicoes] = useState<CondicoesForm>(condicoesPadrao);
  const [clausulas, setClausulas] = useState<string[]>([]);

  // Pré-preenchimento a partir de uma proposta R&S (opcional; só quem tem acesso a Propostas enxerga). A lista só é buscada quando
  // o analista pede, porque o endpoint de propostas faz a varredura de propostas vencidas a cada leitura.
  const [propostasAbertas, setPropostasAbertas] = useState(false);
  const [propostas, setPropostas] = useState<PropostaOpcao[] | null>(null);
  const [erroProposta, setErroProposta] = useState("");

  const carregarLinks = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/solicitacoes-vagas/links");
      const json = await res.json();
      setLinks(res.ok ? json.data ?? [] : []);
      if (!res.ok) setErro(json.error || "Não foi possível carregar os links.");
    } catch {
      setErro("Não foi possível carregar os links.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setErro("");
      setGerado(null);
      carregarLinks();
    }
  }, [isOpen, carregarLinks]);

  const clausulasPreenchidas = useMemo(() => clausulas.map((c) => c.trim()).filter(Boolean), [clausulas]);
  const previa = useMemo(() => {
    const parsed = condicoesRsSchema.safeParse({
      taxa_sem_reposicao_pct: numero(condicoes.taxa_sem_reposicao_pct),
      taxa_com_reposicao_pct: numero(condicoes.taxa_com_reposicao_pct),
      prazo_envio_curriculos_dias_uteis: numero(condicoes.prazo_envio_curriculos_dias_uteis),
      taxa_cancelamento_pct: numero(condicoes.taxa_cancelamento_pct),
      prazo_faturamento_dias: numero(condicoes.prazo_faturamento_dias),
    });
    if (!parsed.success) {
      return { itens: null, mensagens: parsed.error.issues.map((i) => `${ROTULO_ERRO[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`), taxa: null };
    }
    return { itens: itensDasCondicoes(parsed.data, clausulasPreenchidas), mensagens: [] as string[], taxa: parsed.data.taxa_cancelamento_pct };
  }, [condicoes, clausulasPreenchidas]);

  const primeiroAdicional = quantidadeItensFixosRs(previa.taxa ?? PADROES_RS.taxa_cancelamento_pct) + 1;

  async function copiar(chave: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o link e copie manualmente.");
    }
  }

  async function abrirPropostas() {
    setPropostasAbertas(true);
    if (propostas !== null) return;
    try {
      const res = await fetch("/api/comercial/propostas?modelo=RS");
      if (!res.ok) {
        setPropostas([]);
        setErroProposta(res.status === 403 ? "Seu perfil não tem acesso a Propostas." : "Não foi possível carregar as propostas.");
        return;
      }
      const json = await res.json();
      setPropostas(
        (json.data ?? []).map((p: { id: string; numero: string; cliente_nome: string }) => ({ id: p.id, numero: p.numero, cliente_nome: p.cliente_nome }))
      );
    } catch {
      setPropostas([]);
      setErroProposta("Não foi possível carregar as propostas.");
    }
  }

  async function usarProposta(id: string) {
    setErroProposta("");
    if (!id) return;
    try {
      const res = await fetch(`/api/comercial/propostas/${id}`);
      const json = await res.json();
      if (!res.ok) {
        setErroProposta(json.error || "Não foi possível ler a proposta.");
        return;
      }
      const c = { ...PADROES_RS, ...(json.data?.conteudo?.condicoes ?? {}) } as typeof PADROES_RS;
      setCondicoes({
        taxa_sem_reposicao_pct: String(c.taxa_sem_reposicao_pct),
        taxa_com_reposicao_pct: String(c.taxa_com_reposicao_pct),
        prazo_envio_curriculos_dias_uteis: String(c.prazo_envio_curriculos_dias_uteis),
        taxa_cancelamento_pct: String(c.taxa_cancelamento_pct ?? ""),
        prazo_faturamento_dias: String(c.prazo_faturamento_dias),
      });
      setClausulas(Array.isArray(json.data?.conteudo?.clausulas_adicionais) ? json.data.conteudo.clausulas_adicionais : []);
      if (!nomeEmpresa.trim() && json.data?.cliente_nome) setNomeEmpresa(String(json.data.cliente_nome).slice(0, 150));
    } catch {
      setErroProposta("Não foi possível ler a proposta.");
    }
  }

  async function gerar() {
    setErro("");
    setGerado(null);
    if (!previa.itens) {
      setErro("Corrija as condições comerciais antes de gerar o link.");
      return;
    }
    setGerando(true);
    try {
      const res = await fetch("/api/solicitacoes-vagas/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_empresa: nomeEmpresa.trim() || null,
          validade_dias: validade,
          condicoes: {
            taxa_sem_reposicao_pct: numero(condicoes.taxa_sem_reposicao_pct),
            taxa_com_reposicao_pct: numero(condicoes.taxa_com_reposicao_pct),
            prazo_envio_curriculos_dias_uteis: numero(condicoes.prazo_envio_curriculos_dias_uteis),
            taxa_cancelamento_pct: numero(condicoes.taxa_cancelamento_pct),
            prazo_faturamento_dias: numero(condicoes.prazo_faturamento_dias),
          },
          clausulas_adicionais: clausulasPreenchidas,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error || "Não foi possível gerar o link.");
        return;
      }
      setGerado(json.data);
      setNomeEmpresa("");
      carregarLinks();
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  async function revogar(id: string) {
    setErro("");
    const res = await fetch("/api/solicitacoes-vagas/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setErro(json?.error || "Não foi possível revogar o link.");
      return;
    }
    if (gerado?.id === id) setGerado(null);
    carregarLinks();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-link-solicitacao" className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <h2 id="titulo-link-solicitacao" className="font-bold text-lg">{"🔗"} Link para cliente novo</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <p className="text-sm text-gray-600">
            Gere um link de solicitação de vaga (Recrutamento e Seleção) para um cliente que ainda não tem acesso ao portal. A solicitação chega na
            mesma fila de “Solicitações”. Cada link aceita até {MAX_USOS_LINK} envios.
          </p>

          {erro && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

          {/* Novo link */}
          <section className="space-y-4 border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-900">Novo link</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="link-nome" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome da empresa (opcional)</label>
                <input id="link-nome" className="input-field" value={nomeEmpresa} maxLength={150} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Pré-preenche a saudação e o formulário" />
              </div>
              <div>
                <label htmlFor="link-validade" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Validade</label>
                <select id="link-validade" className="input-field" value={validade} onChange={(e) => setValidade(Number(e.target.value))}>
                  {VALIDADES_LINK_DIAS.map((d) => <option key={d} value={d}>{d} dias</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">Condições comerciais</p>
                {!propostasAbertas ? (
                  <button type="button" onClick={abrirPropostas} className="text-xs font-semibold text-blue-700 underline underline-offset-2">
                    Usar condições de uma proposta
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select aria-label="Proposta R&S" className="input-field !py-1.5 text-xs" defaultValue="" onChange={(e) => usarProposta(e.target.value)} disabled={propostas === null}>
                      <option value="">{propostas === null ? "Carregando..." : propostas.length === 0 ? "Nenhuma proposta" : "Escolha uma proposta..."}</option>
                      {(propostas ?? []).map((p) => <option key={p.id} value={p.id}>{p.numero} — {p.cliente_nome}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {erroProposta && <p className="text-xs text-red-700">{erroProposta}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {CAMPOS.map((c) => (
                  <div key={c.chave}>
                    <label htmlFor={`link-${c.chave}`} className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{c.rotulo}</label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`link-${c.chave}`}
                        className="input-field"
                        inputMode="decimal"
                        value={condicoes[c.chave]}
                        onChange={(e) => setCondicoes({ ...condicoes, [c.chave]: e.target.value })}
                      />
                      <span className="text-sm text-gray-500 whitespace-nowrap">{c.sufixo}</span>
                    </div>
                    {c.ajuda && <p className="text-xs text-gray-500 mt-1">{c.ajuda}</p>}
                  </div>
                ))}
              </div>

              <div>
                <p className="text-sm font-bold text-gray-900">Cláusulas adicionais (opcional)</p>
                <p className="text-xs text-gray-500 mb-2">
                  Entram depois da cláusula 1.{primeiroAdicional - 1}, numeradas em sequência. Até {MAX_CLAUSULAS_ADICIONAIS} cláusulas de {MAX_CLAUSULA_ADICIONAL} caracteres.
                </p>
                {clausulas.map((texto, i) => (
                  <div key={i} className="grid grid-cols-[44px_1fr_auto] gap-2 items-start mb-2">
                    <strong className="text-sm pt-2">{`1.${primeiroAdicional + i}`}</strong>
                    <div>
                      <textarea
                        aria-label={`Cláusula 1.${primeiroAdicional + i}`}
                        className="input-field min-h-[64px]"
                        value={texto}
                        maxLength={MAX_CLAUSULA_ADICIONAL}
                        onChange={(e) => setClausulas(clausulas.map((c, k) => (k === i ? e.target.value : c)))}
                      />
                      <div className="text-xs text-gray-500 text-right">{texto.length}/{MAX_CLAUSULA_ADICIONAL}</div>
                    </div>
                    <button type="button" aria-label={`Remover cláusula 1.${primeiroAdicional + i}`} onClick={() => setClausulas(clausulas.filter((_, k) => k !== i))} className="btn-outline !px-3 !py-1.5 text-red-700">✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-outline"
                  disabled={clausulas.length >= MAX_CLAUSULAS_ADICIONAIS}
                  onClick={() => setClausulas([...clausulas, ""])}
                >
                  + Adicionar cláusula
                </button>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs font-bold text-gray-700 mb-2">Como o cliente verá</p>
                {previa.itens ? (
                  <ol className="space-y-1">
                    {previa.itens.map((item) => (
                      <li key={item.numero} className="grid grid-cols-[2.5rem_1fr] gap-1 text-xs text-gray-800">
                        <span className="font-bold">{item.numero}</span>
                        <span className="break-words">{item.texto}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className="space-y-1 text-xs text-red-700">
                    {previa.mensagens.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="btn-primary disabled:opacity-50" onClick={gerar} disabled={gerando || !previa.itens}>
                {gerando ? "Gerando..." : "Gerar link"}
              </button>
            </div>

            {gerado && (
              <div className="rounded-lg border border-green-300 bg-green-50 p-3 space-y-2" role="status">
                <p className="text-sm font-bold text-green-900">Link gerado — vale até {fmtData(gerado.expira_em)}</p>
                <input readOnly className="input-field text-xs" value={gerado.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link gerado" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={() => copiar("novo-link", gerado.url)}>{copiado === "novo-link" ? "Copiado ✓" : "Copiar link"}</button>
                  <button type="button" className="btn-outline" onClick={() => copiar("novo-msg", mensagemWhatsapp(gerado))}>{copiado === "novo-msg" ? "Copiado ✓" : "Copiar mensagem p/ WhatsApp"}</button>
                </div>
              </div>
            )}
          </section>

          {/* Links da unidade */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Links da unidade</h3>
            {carregando ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum link gerado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {links.map((l) => (
                  <li key={l.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{l.nome_empresa || "Sem nome de empresa"}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: COR_STATUS[l.status].bg, color: COR_STATUS[l.status].color }}>
                        {ROTULO_STATUS_LINK[l.status]}
                      </span>
                      <span className="text-xs text-gray-500 ml-auto">{l.usos}/{l.max_usos} envios · expira em {fmtData(l.expira_em)}</span>
                    </div>
                    <p className="text-xs text-gray-500">Criado em {fmtData(l.created_at)}{l.criado_por_nome ? ` por ${l.criado_por_nome}` : ""}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-outline !px-3 !py-1" onClick={() => copiar(`l-${l.id}`, l.url)}>{copiado === `l-${l.id}` ? "Copiado ✓" : "Copiar link"}</button>
                      <button type="button" className="btn-outline !px-3 !py-1" onClick={() => copiar(`m-${l.id}`, mensagemWhatsapp(l))}>{copiado === `m-${l.id}` ? "Copiado ✓" : "Copiar mensagem"}</button>
                      {l.status === "ativo" && (
                        <button type="button" className="btn-outline !px-3 !py-1 text-red-700 !border-red-300" onClick={() => revogar(l.id)}>Revogar</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
