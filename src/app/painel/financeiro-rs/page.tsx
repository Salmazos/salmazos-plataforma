import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FinanceiroRSPageClient, { type VagaFinanceiraRow } from "@/components/FinanceiroRSPageClient";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { ETAPAS_KANBAN, ETAPAS_KANBAN_VISIVEIS, detectarModoSalario } from "@/lib/constants";

export const dynamic = "force-dynamic";

// vagas.salario mistura dois formatos reais em produção: número puro sem separador de
// milhar (ex.: "2500.4", vindo do CampoMoeda em ModalNovaVaga/ModalEditarVaga) e moeda
// formatada em pt-BR com prefixo (ex.: "R$ 3.500,00", vindo de outros fluxos como
// vagas/from-solicitacao). formatarSalario (usado em VagaDetalheClient etc.) não precisa
// resolver isso — é só exibição, e no caso "R$..." ele devolve a string como está. Aqui
// precisamos do valor numérico de verdade pra multiplicar pela taxa, então tratamos os
// dois formatos: se tiver vírgula, assume pt-BR (ponto = milhar, vírgula = decimal);
// senão, assume ponto decimal direto.
function parseSalarioFixo(raw: string): number | null {
  const semPrefixo = raw.replace(/^R\$\s?/, "").trim();
  const normalizado = semPrefixo.includes(",")
    ? semPrefixo.replace(/\./g, "").replace(",", ".")
    : semPrefixo;
  const num = parseFloat(normalizado);
  return isNaN(num) ? null : num;
}

interface VagaRow {
  id: string;
  titulo: string;
  salario: string | null;
  fee_rs_percentual: number | null;
  taxa_cancelamento: boolean | null;
  taxa_cancelamento_percentual: number | null;
  data_abertura: string | null;
  created_at: string;
  clientes: { nome: string } | { nome: string }[] | null;
}

export default async function FinanceiroRSPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) redirect("/painel");

  const svc = createServiceClient();

  const [{ data: vagas }, { data: candidatosVagas }] = await Promise.all([
    svc
      .from("vagas")
      .select(
        "id, titulo, salario, fee_rs_percentual, taxa_cancelamento, taxa_cancelamento_percentual, data_abertura, created_at, clientes(nome)"
      )
      .eq("status", "aberta")
      .eq("tipo_servico", "recrutamento_selecao"),
    // Mesma fonte de verdade de etapa ativa usada em Relatórios/Dashboard — não
    // candidatos.etapa_kanban, que não é atualizada de forma confiável.
    svc
      .from("candidatos_vagas")
      .select("vaga_id, etapa")
      .in("etapa", ETAPAS_KANBAN_VISIVEIS),
  ]);

  // Índice de cada etapa dentro de ETAPAS_KANBAN = ordem de avanço no funil (maior índice
  // = mais avançada). Agrupa por vaga_id: quantos candidatos ativos + qual a etapa mais
  // avançada entre eles.
  const ordemEtapa = new Map(ETAPAS_KANBAN.map((e, idx) => [e.id, idx]));
  const porVaga = new Map<string, { count: number; melhorIdx: number }>();
  for (const cv of candidatosVagas ?? []) {
    if (!cv.vaga_id) continue;
    const idx = ordemEtapa.get(cv.etapa) ?? -1;
    const atual = porVaga.get(cv.vaga_id);
    if (!atual) {
      porVaga.set(cv.vaga_id, { count: 1, melhorIdx: idx });
    } else {
      atual.count += 1;
      if (idx > atual.melhorIdx) atual.melhorIdx = idx;
    }
  }

  const agora = Date.now();

  const rows: VagaFinanceiraRow[] = ((vagas ?? []) as VagaRow[]).map((v) => {
    const clienteRel = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes;
    const clienteNome = clienteRel?.nome ?? "—";

    // data_abertura é o campo correto (mesmo usado no Aging de Vagas Abertas), mas 1 vaga
    // aberta hoje não tem ela preenchida — cai pro created_at em vez de sumir do painel
    // financeiro (diferente do relatório de Aging, que simplesmente exclui esse caso).
    const dataBase = v.data_abertura ?? v.created_at;
    const diasAberta = dataBase ? Math.round((agora - new Date(dataBase).getTime()) / 86400000) : null;

    const salarioRaw = (v.salario ?? "").trim();
    const salarioModo = detectarModoSalario(salarioRaw);
    const salarioValor = salarioModo === "fixo" && salarioRaw ? parseSalarioFixo(salarioRaw) : null;

    const feeRsPercentual = v.fee_rs_percentual ?? null;
    const feeProjetado =
      salarioValor != null && feeRsPercentual != null ? (salarioValor * feeRsPercentual) / 100 : null;

    const taxaCancelamento = v.taxa_cancelamento === true;
    const taxaCancelamentoPercentual = v.taxa_cancelamento_percentual ?? null;
    const valorSeCancelar =
      taxaCancelamento && salarioValor != null && taxaCancelamentoPercentual != null
        ? (salarioValor * taxaCancelamentoPercentual) / 100
        : null;

    const info = porVaga.get(v.id);
    const etapaMaisAvancada =
      info && info.melhorIdx >= 0 ? ETAPAS_KANBAN[info.melhorIdx]?.label ?? null : null;

    return {
      id: v.id,
      titulo: v.titulo,
      clienteNome,
      diasAberta,
      salarioModo,
      salarioValor,
      feeRsPercentual,
      feeProjetado,
      taxaCancelamento,
      taxaCancelamentoPercentual,
      valorSeCancelar,
      etapaMaisAvancada,
      candidatosAtivos: info?.count ?? 0,
    };
  });

  return <FinanceiroRSPageClient rows={rows} />;
}
