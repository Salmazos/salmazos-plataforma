import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoSupervisao } from "@/lib/supervisaoAuth";

export interface VisitaHistoricoItem {
  id: string;
  data: string;
  empresa: string;
  contato: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  analista_nome: string | null;
  checklist_equipe_completa: string | null;
  checklist_epi: string | null;
  checklist_uniforme: string | null;
  checklist_pontualidade: string | null;
  checklist_ambiente: string | null;
  checklist_feedback_cliente: string | null;
  problema_identificado: boolean;
  problema_descricao: string | null;
  plano_acao: string | null;
  resultado: string | null;
  evidencias_fotos: string[];
}

// Alimenta o drill-down de histórico (mês → semana → visitas individuais) do Painel de
// Supervisão — devolve todas as visitas de supervisão de um cliente num mês de uma vez só,
// já com o nome de quem visitou; o agrupamento por semana e a paginação entre níveis do
// drill-down acontecem no client (SupervisaoHistoricoClient.tsx), sem round-trip extra por
// nível. Mesma regra de acesso do resto do Painel de Supervisão: full access vê qualquer
// cliente, supervisor só vê cliente da própria carteira (clientes_meta_supervisao).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const clienteId = params.get("cliente_id");
  const ano = Number(params.get("ano"));
  const mes = Number(params.get("mes"));
  if (!clienteId || !ano || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "cliente_id, ano e mes são obrigatórios." }, { status: 400 });
  }

  const { acesso, fullAccess, analistaPerfilId } = await checarAcessoSupervisao(user);
  if (!acesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const svc = createServiceClient();

  if (!fullAccess) {
    const { data: meta } = await svc
      .from("clientes_meta_supervisao")
      .select("supervisor_responsavel_id")
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (!meta || meta.supervisor_responsavel_id !== analistaPerfilId) {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }
  }

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const anoProxMes = mes === 12 ? ano + 1 : ano;
  const fim = `${anoProxMes}-${String(proxMes).padStart(2, "0")}-01`;

  const { data, error } = await svc
    .from("km_visitas")
    .select(
      "id, empresa, contato, contato_telefone, contato_email, checklist_equipe_completa, checklist_epi, checklist_uniforme, checklist_pontualidade, checklist_ambiente, checklist_feedback_cliente, problema_identificado, problema_descricao, plano_acao, resultado, evidencias_fotos, km_registros!inner(data, analista_id, analistas_perfil(nome_completo))"
    )
    .eq("tipo_visita", "supervisao")
    .eq("cliente_id", clienteId)
    .gte("km_registros.data", inicio)
    .lt("km_registros.data", fim)
    .order("data", { referencedTable: "km_registros", ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const items: VisitaHistoricoItem[] = rows.map((r) => ({
    id: r.id,
    data: r.km_registros?.data ?? "",
    empresa: r.empresa,
    contato: r.contato,
    contato_telefone: r.contato_telefone,
    contato_email: r.contato_email,
    analista_nome: r.km_registros?.analistas_perfil?.nome_completo ?? null,
    checklist_equipe_completa: r.checklist_equipe_completa,
    checklist_epi: r.checklist_epi,
    checklist_uniforme: r.checklist_uniforme,
    checklist_pontualidade: r.checklist_pontualidade,
    checklist_ambiente: r.checklist_ambiente,
    checklist_feedback_cliente: r.checklist_feedback_cliente,
    problema_identificado: r.problema_identificado ?? false,
    problema_descricao: r.problema_descricao,
    plano_acao: r.plano_acao,
    resultado: r.resultado,
    evidencias_fotos: r.evidencias_fotos ?? [],
  }));

  return NextResponse.json({ data: items });
}
