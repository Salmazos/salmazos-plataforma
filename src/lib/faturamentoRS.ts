import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Limites do mês em Brasília (UTC-3 fixo — Brasil não tem mais horário de verão), pra
// filtrar cobrancas_rs.pago_em corretamente mesmo perto da virada do dia/mês em UTC.
// Compartilhado entre GET /api/faturamento-rs, GET .../historico e a página (SSR do
// mês atual) — extraído aqui pra não duplicar em 3+ arquivos.
export function limitesMesBrasil(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(`${ano}-${String(mes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
  const proxMes = mes === 12 ? 1 : mes + 1;
  const anoProx = mes === 12 ? ano + 1 : ano;
  const fim = new Date(`${anoProx}-${String(proxMes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
  return { inicio, fim };
}

export interface ReceitaMes {
  cobrancas: { id: string; cliente_nome_snapshot: string; candidato_nome_snapshot: string | null; tipo: "contratacao" | "cancelamento"; fee_valor: number | null; pago_em: string }[];
  ajustes: { id: string; valor: number; descricao: string; criado_por: string | null; criado_em: string; criadoPorNome: string | null }[];
  receitaBrutaCobrancas: number;
  receitaBrutaAjustes: number;
  receitaBrutaTotal: number;
  imposto: { ano: number; mes: number; percentual: number; atualizado_em: string } | null;
}

// Monta os 3 componentes (cobranças pagas, ajustes manuais, imposto) de um mês/ano —
// reaproveitado por GET /api/faturamento-rs e pelo SSR inicial da página.
export async function obterReceitaMes(svc: ServiceClient, ano: number, mes: number): Promise<ReceitaMes> {
  const { inicio, fim } = limitesMesBrasil(ano, mes);

  const [{ data: cobrancas }, { data: ajustesRaw }, { data: imposto }] = await Promise.all([
    svc
      .from("cobrancas_rs")
      .select("id, cliente_nome_snapshot, candidato_nome_snapshot, tipo, fee_valor, pago_em")
      .eq("status", "paga")
      .gte("pago_em", inicio)
      .lt("pago_em", fim)
      .order("pago_em", { ascending: false }),
    svc
      .from("faturamento_rs_ajustes_manuais")
      .select("id, valor, descricao, criado_por, criado_em")
      .eq("ano", ano)
      .eq("mes", mes)
      .order("criado_em", { ascending: false }),
    svc
      .from("faturamento_rs_impostos_mensais")
      .select("ano, mes, percentual, atualizado_em")
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle(),
  ]);

  const ajustesLista = ajustesRaw ?? [];
  const idsAnalistas = [...new Set(ajustesLista.map((a) => a.criado_por).filter((id): id is string => !!id))];
  let nomesPorUserId = new Map<string, string>();
  if (idsAnalistas.length > 0) {
    const { data: perfis } = await svc.from("analistas_perfil").select("user_id, nome_completo").in("user_id", idsAnalistas);
    nomesPorUserId = new Map((perfis ?? []).map((p) => [p.user_id as string, p.nome_completo]));
  }

  const ajustes = ajustesLista.map((a) => ({
    ...a,
    criadoPorNome: a.criado_por ? nomesPorUserId.get(a.criado_por) ?? null : null,
  }));

  const receitaBrutaCobrancas = (cobrancas ?? []).reduce((soma, c) => soma + (c.fee_valor ?? 0), 0);
  const receitaBrutaAjustes = ajustes.reduce((soma, a) => soma + a.valor, 0);

  return {
    cobrancas: cobrancas ?? [],
    ajustes,
    receitaBrutaCobrancas,
    receitaBrutaAjustes,
    receitaBrutaTotal: receitaBrutaCobrancas + receitaBrutaAjustes,
    imposto: imposto ?? null,
  };
}
