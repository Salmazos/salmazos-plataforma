import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoSupervisao } from "@/lib/supervisaoAuth";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface ClientePendente {
  clienteId: string;
  clienteNome: string;
  diasSemSupervisao: number | null;
}

function parseDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

// Mesmo padrão estrutural de /api/cobrancas-rs/pendentes-popup: estado atual (não fila de
// eventos), gate de acesso resolvido aqui dentro, dedup "1x por usuário por dia" via
// supervisao_popup_visualizacoes. Difere no escopo de visibilidade: supervisor só vê a
// própria carteira (mesma regra do Painel de Supervisão), full access vê tudo — replica
// exatamente a filtragem de clientes_meta_supervisao já usada em /painel/supervisao.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { acesso, fullAccess, analistaPerfilId } = await checarAcessoSupervisao(user);
  if (!acesso) return NextResponse.json({ data: [], ja_visto: true });

  const svc = createServiceClient();

  let metasQuery = svc
    .from("clientes_meta_supervisao")
    .select("id, cliente_id, frequencia_dias, clientes(nome)");
  if (!fullAccess) {
    metasQuery = metasQuery.eq("supervisor_responsavel_id", analistaPerfilId ?? "00000000-0000-0000-0000-000000000000");
  }
  const { data: metas, error } = await metasQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metasTyped = (metas ?? []) as any[];
  const clienteIds = metasTyped.map((m) => m.cliente_id);

  const { data: visitasSupervisao } = clienteIds.length > 0
    ? await svc
        .from("km_visitas")
        .select("cliente_id, km_registros(data)")
        .eq("tipo_visita", "supervisao")
        .in("cliente_id", clienteIds)
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visitasTyped = (visitasSupervisao ?? []) as any[];
  const ultimaVisitaPorCliente = new Map<string, string>();
  for (const v of visitasTyped) {
    const data = v.km_registros?.data;
    if (!data || !v.cliente_id) continue;
    const atual = ultimaVisitaPorCliente.get(v.cliente_id);
    if (!atual || data > atual) ultimaVisitaPorCliente.set(v.cliente_id, data);
  }

  const hoje = obterDataHojeBrasil();
  const pendentes: ClientePendente[] = metasTyped
    .filter((m) => m.clientes)
    .map((m) => {
      const ultimaData = ultimaVisitaPorCliente.get(m.cliente_id) ?? null;
      const diasDesde = ultimaData ? Math.floor((hoje.getTime() - parseDataLocal(ultimaData).getTime()) / 86400000) : null;
      const atrasado = ultimaData === null || diasDesde! >= m.frequencia_dias;
      return atrasado
        ? { clienteId: m.cliente_id as string, clienteNome: (m.clientes as { nome: string }).nome, diasSemSupervisao: diasDesde }
        : null;
    })
    .filter((x): x is ClientePendente => x !== null);

  const hojeISO = formatarDataISO(hoje);
  const { data: visto } = await svc
    .from("supervisao_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: pendentes, ja_visto: !!visto });
}
