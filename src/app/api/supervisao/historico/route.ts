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

export interface ParetoClienteItem {
  clienteId: string;
  clienteNome: string;
  total: number;
}

// Alimenta os 4 níveis de drill-down da aba Histórico de Visitas do Painel de Supervisão:
// sem cliente_id -> Nível 0 (Pareto: total de visitas de supervisão no mês, por cliente, pra
// todo o universo que o usuário pode ver); com cliente_id -> Níveis 1-3 (lista de visitas
// daquele cliente no mês, agrupada em semana/visita individual no client). Uma única rota (em
// vez de duas) porque os dois modos compartilham auth, cálculo do intervalo do mês e a
// filtragem por tipo_visita='supervisao' — só o agregado final muda. Mesma regra de acesso em
// ambos os modos: full access vê qualquer cliente, supervisor só vê a própria carteira
// (clientes_meta_supervisao) — inclusive no Pareto, que nunca lista o programa inteiro pra
// quem não é full access.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const clienteId = params.get("cliente_id");
  const ano = Number(params.get("ano"));
  const mes = Number(params.get("mes"));
  if (!ano || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "ano e mes são obrigatórios." }, { status: 400 });
  }

  const { acesso, fullAccess, analistaPerfilId } = await checarAcessoSupervisao(user);
  if (!acesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const svc = createServiceClient();

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const anoProxMes = mes === 12 ? ano + 1 : ano;
  const fim = `${anoProxMes}-${String(proxMes).padStart(2, "0")}-01`;

  // ── Nível 0: sem cliente_id, devolve totais agregados por cliente (Pareto) ──
  if (!clienteId) {
    let metasQuery = svc.from("clientes_meta_supervisao").select("cliente_id, clientes(nome)");
    if (!fullAccess) {
      metasQuery = metasQuery.eq("supervisor_responsavel_id", analistaPerfilId ?? "00000000-0000-0000-0000-000000000000");
    }
    const { data: metas, error: metasError } = await metasQuery;
    if (metasError) return NextResponse.json({ error: metasError.message }, { status: 500 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metasTyped = (metas ?? []) as any[];
    const clienteIds = metasTyped.map((m) => m.cliente_id);
    if (clienteIds.length === 0) return NextResponse.json({ data: [] as ParetoClienteItem[] });

    const { data: visitasCont, error: visitasError } = await svc
      .from("km_visitas")
      .select("cliente_id, km_registros!inner(data)")
      .eq("tipo_visita", "supervisao")
      .in("cliente_id", clienteIds)
      .gte("km_registros.data", inicio)
      .lt("km_registros.data", fim);

    if (visitasError) return NextResponse.json({ error: visitasError.message }, { status: 500 });

    const contagem = new Map<string, number>();
    for (const v of visitasCont ?? []) {
      contagem.set(v.cliente_id, (contagem.get(v.cliente_id) ?? 0) + 1);
    }

    const paretoItems: ParetoClienteItem[] = metasTyped
      .map((m) => ({
        clienteId: m.cliente_id as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clienteNome: ((m.clientes as any)?.nome as string | undefined) ?? "—",
        total: contagem.get(m.cliente_id) ?? 0,
      }))
      .sort((a, b) => b.total - a.total || a.clienteNome.localeCompare(b.clienteNome));

    return NextResponse.json({ data: paretoItems });
  }

  // ── Níveis 1-3: com cliente_id, devolve a lista individual de visitas do mês ──
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
