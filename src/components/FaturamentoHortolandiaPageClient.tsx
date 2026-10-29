"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ModalContaReceberHortolandia from "./ModalContaReceberHortolandia";
import ModalContaPagarHortolandia from "./ModalContaPagarHortolandia";
import SeletorUnidade from "./SeletorUnidade";
import ImpostoLinhaCelula from "./ImpostoLinhaCelula";
import {
  FILTROS_INICIAIS,
  calcularCards,
  entradasDosCards,
  filtrarEntradas,
  filtrarSaidas,
  haFiltroAtivo,
  intervaloAtivo,
  intervaloInvalido,
  percentualEfetivo,
  periodoDosCards,
  periodoEscolhido,
  rotuloMes,
  saidasDosCards,
  type FiltrosFaturamento,
} from "@/lib/faturamentoUnidadesFiltros";
import {
  bucketFaturamento,
  ROTULO_BUCKET_FATURAMENTO,
  contarPorBucket,
  filtrarPorBucket,
  type BucketFaturamento,
} from "@/lib/unidadeFaturamento";

export interface ContaReceberRow {
  id: string;
  clienteId: string;
  clienteNome: string;
  numeroNf: string | null;
  valor: number;
  dataVencimento: string;
  dataPagamento: string | null;
  dataEmissaoNf: string | null;
  status: "pendente" | "pago" | "cancelado";
  observacoes: string | null;
  // Exceção por lançamento ao imposto do mês — null segue o imposto do mês normalmente
  // (ver valorLiquidoRow); preenchido, trava esse lançamento nessa alíquota própria.
  impostoPercentualManual: number | null;
  // Snapshot da unidade de faturamento no lançamento (monte_mor | hortolandia); null = "a definir".
  unidadeFaturamento: string | null;
}

// Contas a pagar (saída) — contraparte de ContaReceberRow. Sem cliente/status/vencimento:
// a saída já nasce paga (ver comentário em contaPagarHortolandiaCreateSchema).
export interface ContaPagarRow {
  id: string;
  dataPagamento: string;
  descricao: string;
  valor: number;
  responsavel: string;
  unidadeFaturamento: string | null;
}

interface Props {
  // Faturamento Unidades: a tela sempre opera numa unidade só (ver painel/faturamento-hortolandia/page.tsx).
  unidadeId: string;
  nomeUnidade: string;
  unidadesOpcoes: { id: string; nome: string }[];
  // Só a unidade Monte Mor/Hortolândia divide em abas Hortolândia | Monte Mor | A definir; SBC segue só por unidade_id.
  usaUnidadeFaturamento: boolean;
  // Não-sócio liberado pelo acesso customizado (ex: supervisor de SBC) só visualiza — a API
  // recusa qualquer escrita (checarEscritaFaturamento); aqui só some com os controles.
  somenteLeitura: boolean;
  rowsIniciais: ContaReceberRow[];
  saidasIniciais: ContaPagarRow[];
  anoInicial: number;
  mesInicial: number;
  impostoInicial: number | null;
  impostosPorMesInicial: Record<string, number>;
}

type Visao = "entradas" | "saidas";

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  pendente: { label: "Pendente", bg: "#FEF3C7", color: "#92400E" },
  pago: { label: "Pago", bg: "#DCFCE7", color: "#166534" },
  cancelado: { label: "Cancelado", bg: "#F3F4F6", color: "#6B7280" },
  atrasado: { label: "Atrasado", bg: "#FEE2E2", color: "#991B1B" },
};

function formatarMoeda(v: number | null): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  // Datas vêm como "YYYY-MM-DD" (coluna DATE do Postgres, sem hora) — monta o Date local
  // direto pelos componentes pra não sofrer o típico bug de virar um dia pra trás por
  // fuso quando parseado como UTC meia-noite.
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR");
}

function diasParaVencimento(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const vencimento = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((vencimento.getTime() - hoje.getTime()) / 86_400_000);
}

function statusEfetivo(row: ContaReceberRow): string {
  if (row.status === "pendente" && diasParaVencimento(row.dataVencimento) < 0) return "atrasado";
  return row.status;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type FiltroTab = "pendente" | "pago" | "cancelado" | "todas";

export default function FaturamentoHortolandiaPageClient({
  unidadeId,
  nomeUnidade,
  unidadesOpcoes,
  usaUnidadeFaturamento,
  somenteLeitura,
  rowsIniciais,
  saidasIniciais,
  anoInicial,
  mesInicial,
  impostoInicial,
  impostosPorMesInicial,
}: Props) {
  const searchParams = useSearchParams();
  const [rowsTodas, setRows] = useState(rowsIniciais);
  const [saidasTodas, setSaidas] = useState(saidasIniciais);
  // Aba de unidade de faturamento. Tudo abaixo (tabela, filtros, cards) trabalha em cima dos itens da aba; o imposto do mês
  // é por lançamento (percentualEfetivo), então a soma das abas fecha com o total da unidade, e o carregamento da página
  // continua trazendo TODOS os lançamentos da unidade_id.
  const [aba, setAba] = useState<BucketFaturamento>("hortolandia");
  const rows = useMemo(() => (usaUnidadeFaturamento ? filtrarPorBucket(rowsTodas, aba) : rowsTodas), [rowsTodas, aba, usaUnidadeFaturamento]);
  const saidas = useMemo(() => (usaUnidadeFaturamento ? filtrarPorBucket(saidasTodas, aba) : saidasTodas), [saidasTodas, aba, usaUnidadeFaturamento]);
  const contagemEntradas = useMemo(() => contarPorBucket(rowsTodas), [rowsTodas]);
  const contagemSaidas = useMemo(() => contarPorBucket(saidasTodas), [saidasTodas]);
  const [visao, setVisao] = useState<Visao>("entradas");
  const [tab, setTab] = useState<FiltroTab>("pendente");
  // Abre SEMPRE sem filtro (regra de abertura do Olver, ver faturamentoUnidadesFiltros.ts) e
  // nunca persiste: só estado local — trocar de unidade remonta o componente (key={unidadeId}).
  const [filtros, setFiltros] = useState<FiltrosFaturamento>(FILTROS_INICIAIS);
  const [contaAberta, setContaAberta] = useState<ContaReceberRow | null | "novo">(null);
  const [contaPagarAberta, setContaPagarAberta] = useState<ContaPagarRow | null | "novo">(null);

  // Deep-link ?abrir={id} do popup de vencidas (PopupContaReceberHortolandiaVencida) —
  // mesmo padrão de CobrancasRSPageClient. Roda só uma vez de propósito (rows não entra
  // nas deps): rows só muda localmente após uma ação no modal, e essa mudança não deve
  // reabrir o modal sozinha.
  useEffect(() => {
    const abrirId = searchParams.get("abrir");
    if (!abrirId) return;
    const row = rowsTodas.find((r) => r.id === abrirId);
    if (row) {
      setAba(bucketFaturamento(row.unidadeFaturamento));
      // Só visualização: mostra na lista (aba Todas), sem abrir o modal de edição.
      if (!somenteLeitura) setContaAberta(row);
      setTab("todas");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState(mesInicial);
  const [percentualImposto, setPercentualImposto] = useState<number | null>(impostoInicial);
  const [percentualInput, setPercentualInput] = useState(impostoInicial?.toString() ?? "");
  const [salvandoImposto, setSalvandoImposto] = useState(false);
  const [impostoSalvo, setImpostoSalvo] = useState(false);
  const [erroImposto, setErroImposto] = useState("");

  // Percentual de imposto por "YYYY-MM" de TODOS os meses já lançados — diferente de
  // percentualImposto (só o mês selecionado no seletor), usado pra calcular o Valor
  // Líquido de cada linha da tabela abaixo, que mistura lançamentos de vários meses.
  const [impostosPorMes, setImpostosPorMes] = useState<Record<string, number>>(impostosPorMesInicial);

  // ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O OLVER: a maioria dos lançamentos segue o imposto
  // do mês de emissão da NF/Acordo, mas alguns clientes têm alíquota própria — quando
  // impostoPercentualManual está preenchido, ele SEMPRE vence, mesmo que o imposto do mês
  // mude depois (é uma trava por lançamento, não um valor calculado). Null (o padrão) volta
  // a seguir o mês normalmente.
  function percentualEfetivoRow(row: ContaReceberRow): number | null {
    return percentualEfetivo(row, impostosPorMes);
  }

  function valorLiquidoRow(row: ContaReceberRow): number | null {
    const percentual = percentualEfetivoRow(row);
    return percentual != null ? row.valor - (row.valor * percentual) / 100 : null;
  }

  // A tabela só é filtrada por data quando o usuário escolhe um mês ou um período; sem escolha,
  // lista todos os meses como sempre (o mês corrente vale só para os cards, mais abaixo).
  const periodoTabela = periodoEscolhido(filtros);

  const rowsFiltradas = useMemo(() => {
    const porFiltros = filtrarEntradas(rows, {
      busca: filtros.buscaEntradas,
      clienteId: filtros.clienteId,
      periodo: periodoTabela,
    });
    return tab === "todas" ? porFiltros : porFiltros.filter((r) => r.status === tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, filtros]);

  // Opções dos selects derivadas dos lançamentos já carregados (mesmo padrão do resto da tela:
  // sem chamada extra à API só pra popular um <select>).
  const responsaveisDisponiveis = useMemo(
    () => Array.from(new Set(saidas.map((s) => s.responsavel))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [saidas]
  );
  const clientesDisponiveis = useMemo(() => {
    const porId = new Map<string, string>();
    for (const r of rows) porId.set(r.clienteId, r.clienteNome);
    return Array.from(porId, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [rows]);

  // Se o último lançamento do responsável/cliente filtrado for editado/apagado, ele some das
  // opções — volta pra "Todos" em vez de deixar a tabela vazia com um filtro que não aparece mais
  // no <select>. Reset no estado (não só derivado na renderização) pra que o filtro não se
  // reaplique sozinho se um lançamento novo desse mesmo responsável/cliente for criado depois.
  useEffect(() => {
    if (filtros.responsavel !== "todos" && !responsaveisDisponiveis.includes(filtros.responsavel)) {
      setFiltros((f) => ({ ...f, responsavel: "todos" }));
    }
    if (filtros.clienteId !== "todos" && !clientesDisponiveis.some((c) => c.id === filtros.clienteId)) {
      setFiltros((f) => ({ ...f, clienteId: "todos" }));
    }
  }, [responsaveisDisponiveis, clientesDisponiveis, filtros.responsavel, filtros.clienteId]);

  const saidasFiltradas = useMemo(
    () =>
      filtrarSaidas(saidas, { busca: filtros.buscaSaidas, responsavel: filtros.responsavel, periodo: periodoTabela }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saidas, filtros]
  );

  const totalFiltrado = rowsFiltradas.reduce((soma, r) => soma + r.valor, 0);

  // Soma só dos lançamentos cujo percentual de imposto é conhecido — quando nenhum tem, mostra
  // "—" em vez de R$ 0,00 (que passaria a falsa impressão de líquido zerado).
  const totalLiquidoFiltrado = rowsFiltradas.reduce((soma, r) => {
    const liquido = valorLiquidoRow(r);
    return liquido != null ? soma + liquido : soma;
  }, 0);
  const existeLiquidoConhecido = rowsFiltradas.some((r) => valorLiquidoRow(r) != null);

  // Cards: mesmos filtros da tabela (busca, cliente, responsável, mês/período) menos a aba de
  // status, que é só navegação (Total Entrada sempre foi independente de status). Sem mês nem
  // período escolhidos, o mês corrente vale SÓ aqui (comportamento de abertura). Cancelados não
  // entram: ver entradasDosCards. O Líquido é somado por lançamento (percentual manual ou do mês
  // de emissão), porque o período pode cruzar meses — e passa a bater com a coluna Valor
  // Líquido da tabela.
  const chaveMesCorrente = `${anoInicial}-${pad2(mesInicial)}`;
  const periodoCards = periodoDosCards(filtros, chaveMesCorrente);
  const cards = useMemo(
    () =>
      calcularCards(
        entradasDosCards(rows, filtros, chaveMesCorrente),
        saidasDosCards(saidas, filtros, chaveMesCorrente),
        impostosPorMes
      ),
    [rows, saidas, filtros, chaveMesCorrente, impostosPorMes]
  );
  const totalMes = cards.totalEntrada;
  const totalSaidaMes = cards.totalSaida;
  const liquido = cards.liquido;
  const saldoLiquidoMes = cards.saldoLiquido;
  const rotuloPeriodoCards =
    periodoCards.tipo === "mes"
      ? `mês ${rotuloMes(periodoCards.chave)}`
      : `período ${periodoCards.de ? formatarData(periodoCards.de) : "início"} a ${
          periodoCards.ate ? formatarData(periodoCards.ate) : "sem fim"
        }`;
  const intervaloComErro = intervaloInvalido(filtros.de, filtros.ate);
  const periodoEmUso = intervaloAtivo(filtros);

  // Imposto do mês (%) e chaveMes: continuam seguindo o seletor interno ano/mes (mês corrente
  // na abertura; o mês escolhido depois), usado só pra editar o percentual do mês.
  const chaveMes = `${ano}-${pad2(mes)}`;

  async function carregarImpostoDoMes(novoAno: number, novoMes: number) {
    setAno(novoAno);
    setMes(novoMes);
    setErroImposto("");
    try {
      const res = await fetch(`/api/faturamento-hortolandia/imposto?ano=${novoAno}&mes=${novoMes}&unidade=${unidadeId}`);
      const json = await res.json();
      setPercentualImposto(json.data?.percentual ?? null);
      setPercentualInput(json.data?.percentual?.toString() ?? "");
      if (json.data?.percentual != null) {
        const chave = `${novoAno}-${pad2(novoMes)}`;
        setImpostosPorMes((prev) => ({ ...prev, [chave]: json.data.percentual }));
      }
    } catch {
      setErroImposto("Erro ao carregar imposto do mês.");
    }
  }

  async function handleMesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value; // "YYYY-MM", ou "" quando o usuário apaga o campo
    if (!valor) {
      // Apagar o mês = voltar a "sem escolha": tabela sem filtro de data, cards no mês corrente.
      setFiltros((f) => ({ ...f, mes: null }));
      await carregarImpostoDoMes(anoInicial, mesInicial);
      return;
    }
    setFiltros((f) => ({ ...f, mes: valor }));
    const [novoAnoStr, novoMesStr] = valor.split("-");
    await carregarImpostoDoMes(Number(novoAnoStr), Number(novoMesStr));
  }

  // Volta ao estado de abertura (sem filtro na tabela, cards no mês corrente). A aba de status
  // fica como está: é navegação, não filtro.
  async function handleLimparFiltros() {
    setFiltros(FILTROS_INICIAIS);
    if (ano !== anoInicial || mes !== mesInicial) await carregarImpostoDoMes(anoInicial, mesInicial);
  }

  async function handleSalvarImposto() {
    const percentual = Number(percentualInput.replace(",", "."));
    if (percentualInput.trim() === "" || isNaN(percentual) || percentual < 0 || percentual > 100) {
      setErroImposto("Informe um percentual válido entre 0 e 100.");
      return;
    }
    setSalvandoImposto(true);
    setErroImposto("");
    setImpostoSalvo(false);
    try {
      const res = await fetch("/api/faturamento-hortolandia/imposto", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unidade_id: unidadeId, ano, mes, percentual }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroImposto(json.error || "Erro ao salvar imposto.");
        return;
      }
      setPercentualImposto(json.data.percentual);
      setImpostosPorMes((prev) => ({ ...prev, [chaveMes]: json.data.percentual }));
      setImpostoSalvo(true);
      setTimeout(() => setImpostoSalvo(false), 2500);
    } catch {
      setErroImposto("Erro de conexão. Tente novamente.");
    } finally {
      setSalvandoImposto(false);
    }
  }

  function handleSalva(row: ContaReceberRow) {
    setRows((prev) => {
      const existe = prev.some((r) => r.id === row.id);
      return existe ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev];
    });
    // Segue o lançamento para a aba da unidade escolhida, senão ele "sumiria" da aba aberta.
    if (usaUnidadeFaturamento) setAba(bucketFaturamento(row.unidadeFaturamento));
    setContaAberta(null);
  }

  function handleExcluida(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setContaAberta(null);
  }

  function handleSalvaSaida(row: ContaPagarRow) {
    setSaidas((prev) => {
      const existe = prev.some((s) => s.id === row.id);
      return existe ? prev.map((s) => (s.id === row.id ? row : s)) : [row, ...prev];
    });
    if (usaUnidadeFaturamento) setAba(bucketFaturamento(row.unidadeFaturamento));
    setContaPagarAberta(null);
  }

  function handleExcluidaSaida(id: string) {
    setSaidas((prev) => prev.filter((s) => s.id !== id));
    setContaPagarAberta(null);
  }

  // Edição inline do imposto por linha (ImpostoLinhaCelula) — PATCH direto, sem passar pelo
  // modal de editar lançamento, pra corrigir uma exceção pontual com o mínimo de cliques.
  async function handleSalvarImpostoLinha(id: string, novoValor: number | null): Promise<boolean> {
    const res = await fetch(`/api/faturamento-hortolandia/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imposto_percentual_manual: novoValor }),
    });
    const json = await res.json();
    if (!res.ok) return false;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, impostoPercentualManual: json.data.imposto_percentual_manual } : r))
    );
    return true;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento Unidades — {nomeUnidade}</h1>
          <p className="text-sm text-gray-500 mt-1 mb-3">Contas a receber e a pagar — controle manual por unidade.</p>
          <SeletorUnidade unidades={unidadesOpcoes} unidadeSel={unidadeId} basePath="/painel/faturamento-hortolandia" semTodas />
        </div>
        {/* Contextual à visão ativa (Entradas/Saídas) — mesmo botão, destino diferente,
            pra não duplicar "+ Novo lançamento" na tela. */}
        {!somenteLeitura && (
        <button
          onClick={() => (visao === "entradas" ? setContaAberta("novo") : setContaPagarAberta("novo"))}
          className="btn-primary"
        >
          + Novo lançamento {visao === "entradas" ? "(entrada)" : "(saída)"}
        </button>
        )}
      </div>

      {erroImposto && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erroImposto}</p>
      )}

      {/* Grid 3 colunas: Entrada/Imposto/Saída na linha de cima, Líquido/(vazio)/Saldo na de
          baixo — Saldo Líquido é o número que fecha a leitura do mês (líquido de imposto
          menos despesa), por isso fica embaixo do Total Líquido, não ao lado da Saída. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div style={{ background: "#D1FAE5", border: "2px solid #166534", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#166534", margin: 0 }}>{formatarMoeda(totalMes)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#166534", margin: "2px 0 0" }}>
            Total Entrada — {rotuloPeriodoCards} (por vencimento, sem cancelados)
          </p>
        </div>

        <div style={{ background: "#F3F4F6", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>Imposto do mês (%)</p>
          {periodoEmUso ? (
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>
              Imposto é por mês — limpe o período para editar.
            </p>
          ) : somenteLeitura ? (
            <p style={{ fontSize: 20, fontWeight: 800, color: "#374151", margin: 0 }}>
              {percentualImposto != null ? `${percentualImposto}%` : "—"}
            </p>
          ) : (
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={percentualInput}
              onChange={(e) => setPercentualInput(e.target.value)}
              placeholder="Ex: 6,5"
              className="input-field"
              style={{ maxWidth: 100 }}
            />
            <button
              onClick={handleSalvarImposto}
              disabled={salvandoImposto}
              className="btn-outline disabled:opacity-50"
              style={{ whiteSpace: "nowrap", padding: "6px 12px", fontSize: 12 }}
            >
              {salvandoImposto ? "Salvando..." : "Salvar"}
            </button>
          </div>
          )}
          {impostoSalvo && <p className="text-green-700 text-xs mt-1">Imposto salvo!</p>}
        </div>

        <div style={{ background: "#FEE2E2", border: "2px solid #991B1B", borderRadius: 12, padding: "14px 16px" }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#991B1B", margin: 0 }}>{formatarMoeda(totalSaidaMes)}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#991B1B", margin: "2px 0 0" }}>
            Total Saída — {rotuloPeriodoCards} (por pagamento)
          </p>
        </div>

        {liquido.valor != null ? (
          <div style={{ background: "#DBEAFE", border: "2px solid #1D4ED8", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#1D4ED8", margin: 0 }}>{formatarMoeda(liquido.valor)}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8", margin: "2px 0 0" }}>
              Total Líquido{liquido.parcial ? " (parcial)" : ""} — {rotuloPeriodoCards}, imposto de cada lançamento
            </p>
            {liquido.parcial && (
              <p style={{ fontSize: 12, color: "#92400E", margin: "4px 0 0" }}>
                ⚠ Faltam impostos
                {liquido.mesesSemImposto.length > 0 ? ` de ${liquido.mesesSemImposto.join(", ")}` : ""}
                {liquido.semDataEmissao > 0 ? ` (${liquido.semDataEmissao} lançamento(s) sem data de emissão)` : ""}; saldo
                não calculado.
              </p>
            )}
          </div>
        ) : (
          <div style={{ background: "#FEF3C7", border: "2px solid transparent", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>
              ⚠ Informe o imposto
              {liquido.mesesSemImposto.length > 0 ? ` de ${liquido.mesesSemImposto.join(", ")}` : " dos lançamentos"} para
              calcular o líquido.
            </p>
          </div>
        )}

        <div />

        <div
          style={{
            background: saldoLiquidoMes != null && saldoLiquidoMes < 0 ? "#FEE2E2" : "#EDE9FE",
            border: `2px solid ${saldoLiquidoMes != null && saldoLiquidoMes < 0 ? "#991B1B" : "#5B21B6"}`,
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <p
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: saldoLiquidoMes != null && saldoLiquidoMes < 0 ? "#991B1B" : "#5B21B6",
              margin: 0,
            }}
          >
            {saldoLiquidoMes != null ? formatarMoeda(saldoLiquidoMes) : "—"}
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: saldoLiquidoMes != null && saldoLiquidoMes < 0 ? "#991B1B" : "#5B21B6",
              margin: "2px 0 0",
            }}
          >
            Saldo Líquido — entrada líquida menos saída ({rotuloPeriodoCards})
          </p>
        </div>
      </div>

      {usaUnidadeFaturamento && (
        <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Unidade de faturamento">
          {(["hortolandia", "monte_mor", "a_definir"] as const).map((b) => {
            const n = contagemEntradas[b] + contagemSaidas[b];
            const ativa = aba === b;
            return (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setAba(b)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  border: ativa ? "1px solid #FFD700" : "1px solid #E5E7EB",
                  background: ativa ? "#000" : "#fff",
                  color: ativa ? "#FFD700" : b === "a_definir" && n > 0 ? "#92400E" : "#374151",
                }}
              >
                {ROTULO_BUCKET_FATURAMENTO[b]} ({n})
              </button>
            );
          })}
        </div>
      )}

      {/* Visão Entradas/Saídas — troca a tabela abaixo, os totais acima sempre mostram os
          dois lados juntos independente da aba selecionada. */}
      <div className="flex gap-2 mb-4">
        {(
          [
            { valor: "entradas" as const, label: "Entradas" },
            { valor: "saidas" as const, label: "Saídas" },
          ]
        ).map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => setVisao(opcao.valor)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: visao === opcao.valor ? "1px solid #FFD700" : "1px solid #E5E7EB",
              background: visao === opcao.valor ? "#FFD700" : "#FFFFFF",
              color: visao === opcao.valor ? "#111827" : "#6B7280",
              transition: "all .15s",
            }}
          >
            {opcao.label}
          </button>
        ))}
      </div>

      {/* Filtros: a tela abre SEM nenhum ativo. Mês e De/Até só filtram a tabela depois de
          escolhidos (até lá o mês corrente vale só para os cards, ver faturamentoUnidadesFiltros.ts);
          escolhidos, filtram tabela e cards. De/Até vale no lugar do mês. Busca é por visão; Cliente
          só em Entradas; Responsável só em Saídas. */}
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="col-span-2 md:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Buscar</label>
            <input
              type="search"
              value={visao === "entradas" ? filtros.buscaEntradas : filtros.buscaSaidas}
              onChange={(e) => {
                const valor = e.target.value;
                setFiltros((f) => (visao === "entradas" ? { ...f, buscaEntradas: valor } : { ...f, buscaSaidas: valor }));
              }}
              placeholder={
                visao === "entradas" ? "Cliente, nº NF ou observação…" : "Descrição ou responsável…"
              }
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mês</label>
            <input
              type="month"
              value={filtros.mes ?? ""}
              onChange={handleMesChange}
              disabled={periodoEmUso}
              title={periodoEmUso ? "Substituído pelo período De/Até" : undefined}
              className="input-field disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">De</label>
            <input
              type="date"
              value={filtros.de}
              onChange={(e) => setFiltros((f) => ({ ...f, de: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Até</label>
            <input
              type="date"
              value={filtros.ate}
              onChange={(e) => setFiltros((f) => ({ ...f, ate: e.target.value }))}
              className="input-field"
            />
          </div>
          {visao === "entradas" ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</label>
              <select
                value={filtros.clienteId}
                onChange={(e) => setFiltros((f) => ({ ...f, clienteId: e.target.value }))}
                className="input-field"
              >
                <option value="todos">Todos</option>
                {clientesDisponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Responsável
              </label>
              <select
                value={filtros.responsavel}
                onChange={(e) => setFiltros((f) => ({ ...f, responsavel: e.target.value }))}
                className="input-field"
              >
                <option value="todos">Todos</option>
                {responsaveisDisponiveis.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button
            type="button"
            onClick={handleLimparFiltros}
            disabled={!haFiltroAtivo(filtros)}
            className="btn-outline disabled:opacity-50"
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            Limpar filtros
          </button>
          <p className="text-xs text-gray-500">
            Cards: {rotuloPeriodoCards}.{" "}
            {periodoEscolhido(filtros)
              ? "Tabela filtrada pelo mesmo período."
              : "Tabela sem filtro de período (todos os meses)."}
            {periodoEmUso && filtros.mes ? " O período De/Até vale no lugar do mês." : ""}
          </p>
          {intervaloComErro && (
            <p className="text-xs text-red-600">&quot;De&quot; é depois de &quot;Até&quot; — período ignorado.</p>
          )}
        </div>
      </div>

      {visao === "entradas" ? (
        <>
          <div className="flex gap-2 mb-4 border-b border-gray-200">
            {(["pendente", "pago", "cancelado", "todas"] as FiltroTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t ? "border-[#FFB800] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "pendente" ? "Pendentes" : t === "pago" ? "Pagos" : t === "cancelado" ? "Cancelados" : "Todas"}
              </button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3">Vencimento</th>
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Nº NF</th>
                  <th className="py-2 px-3 text-right">Valor R$</th>
                  <th className="py-2 px-3 text-right">Imposto (%)</th>
                  <th className="py-2 px-3 text-right">Valor Líquido</th>
                  <th className="py-2 px-3 text-center">Dias p/ venc.</th>
                  <th className="py-2 px-3">Pagamento</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Emissão NF/Acordo</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map((row) => {
                  const status = statusEfetivo(row);
                  const s = STATUS_LABEL[status];
                  const dias = diasParaVencimento(row.dataVencimento);
                  return (
                    <tr
                      key={row.id}
                      onClick={somenteLeitura ? undefined : () => setContaAberta(row)}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${somenteLeitura ? "" : "cursor-pointer"}`}
                    >
                      <td className="py-2 px-3">{formatarData(row.dataVencimento)}</td>
                      <td className="py-2 px-3 font-medium text-gray-900">{row.clienteNome}</td>
                      <td className="py-2 px-3 text-gray-500">{row.numeroNf ?? "—"}</td>
                      <td className="py-2 px-3 text-right font-medium">{formatarMoeda(row.valor)}</td>
                      <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {somenteLeitura ? (
                          <span className="text-gray-500">{percentualEfetivoRow(row) != null ? `${percentualEfetivoRow(row)}%` : "—"}</span>
                        ) : (
                        <ImpostoLinhaCelula
                          percentualEfetivo={percentualEfetivoRow(row)}
                          valorProprio={row.impostoPercentualManual}
                          onSalvar={(novoValor) => handleSalvarImpostoLinha(row.id, novoValor)}
                        />
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600">{formatarMoeda(valorLiquidoRow(row))}</td>
                      <td className="py-2 px-3 text-center text-gray-500">
                        {row.status === "pendente" ? dias : "—"}
                      </td>
                      <td className="py-2 px-3">{formatarData(row.dataPagamento)}</td>
                      <td className="py-2 px-3">
                        <span
                          className="px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: s.bg, color: s.color }}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2 px-3">{formatarData(row.dataEmissaoNf)}</td>
                    </tr>
                  );
                })}
                {rowsFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-gray-400">
                      {haFiltroAtivo(filtros)
                        ? "Nenhum lançamento para os filtros aplicados."
                        : "Nenhum lançamento nessa visão."}
                    </td>
                  </tr>
                )}
              </tbody>
              {rowsFiltradas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-gray-900">
                    <td className="py-2 px-3" colSpan={3}>
                      Total ({rowsFiltradas.length})
                    </td>
                    <td className="py-2 px-3 text-right">{formatarMoeda(totalFiltrado)}</td>
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-right">
                      {existeLiquidoConhecido ? formatarMoeda(totalLiquidoFiltrado) : "—"}
                    </td>
                    <td className="py-2 px-3" colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3">Data de Pagamento</th>
                  <th className="py-2 px-3">Descrição Pagamento</th>
                  <th className="py-2 px-3 text-right">Valor</th>
                  <th className="py-2 px-3">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {saidasFiltradas.map((s) => (
                  <tr
                    key={s.id}
                    onClick={somenteLeitura ? undefined : () => setContaPagarAberta(s)}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${somenteLeitura ? "" : "cursor-pointer"}`}
                  >
                    <td className="py-2 px-3">{formatarData(s.dataPagamento)}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{s.descricao}</td>
                    <td className="py-2 px-3 text-right font-medium text-[#991B1B]">{formatarMoeda(s.valor)}</td>
                    <td className="py-2 px-3 text-gray-600">{s.responsavel}</td>
                  </tr>
                ))}
                {saidasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      {haFiltroAtivo(filtros) ? "Nenhuma saída para os filtros aplicados." : "Nenhuma saída lançada ainda."}
                    </td>
                  </tr>
                )}
              </tbody>
              {saidasFiltradas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-gray-900">
                    <td className="py-2 px-3" colSpan={2}>
                      Total ({saidasFiltradas.length})
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatarMoeda(saidasFiltradas.reduce((soma, s) => soma + s.valor, 0))}
                    </td>
                    <td className="py-2 px-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {contaAberta && (
        <ModalContaReceberHortolandia
          unidadeId={unidadeId}
          usaUnidadeFaturamento={usaUnidadeFaturamento}
          unidadeFaturamentoPadrao={aba === "a_definir" ? "" : aba}
          conta={contaAberta === "novo" ? null : contaAberta}
          onClose={() => setContaAberta(null)}
          onSalva={handleSalva}
          onExcluida={handleExcluida}
        />
      )}

      {contaPagarAberta && (
        <ModalContaPagarHortolandia
          unidadeId={unidadeId}
          usaUnidadeFaturamento={usaUnidadeFaturamento}
          unidadeFaturamentoPadrao={aba === "a_definir" ? "" : aba}
          conta={contaPagarAberta === "novo" ? null : contaPagarAberta}
          onClose={() => setContaPagarAberta(null)}
          onSalva={handleSalvaSaida}
          onExcluida={handleExcluidaSaida}
        />
      )}
    </div>
  );
}
