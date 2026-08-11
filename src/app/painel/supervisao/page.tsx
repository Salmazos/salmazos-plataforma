import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoSupervisao } from "@/lib/supervisaoAuth";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import SupervisaoPainelClient, { type ClienteSupervisaoRow, type RankingEntry } from "@/components/SupervisaoPainelClient";

export const dynamic = "force-dynamic";

function parseDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export default async function SupervisaoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { acesso, fullAccess, analistaPerfilId } = await checarAcessoSupervisao(user);
  if (!acesso) redirect("/painel");

  const svc = createServiceClient();

  let metasQuery = svc
    .from("clientes_meta_supervisao")
    .select("id, cliente_id, frequencia_dias, supervisor_responsavel_id, modo, data_fim_implantacao, clientes(id, nome, ativo)");
  if (!fullAccess) {
    metasQuery = metasQuery.eq("supervisor_responsavel_id", analistaPerfilId ?? "00000000-0000-0000-0000-000000000000");
  }
  const { data: metas } = await metasQuery;

  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo, nivel_acesso")
    .eq("ativo", true)
    .order("nome_completo");
  const nomeAnalista = new Map((analistas ?? []).map((a) => [a.id, a.nome_completo]));
  const supervisoresOptions = (analistas ?? [])
    .filter((a) => ["supervisor", "diretoria", "superuser"].includes(a.nivel_acesso ?? ""))
    .map((a) => ({ id: a.id, nome: a.nome_completo }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type MetaRow = any;
  const metasTyped = (metas ?? []) as MetaRow[];
  const clienteIds = metasTyped.map((m) => m.cliente_id);

  const { data: visitasSupervisao } = clienteIds.length > 0
    ? await svc
        .from("km_visitas")
        .select("cliente_id, km_registros(data, analista_id)")
        .eq("tipo_visita", "supervisao")
        .in("cliente_id", clienteIds)
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type VisitaRow = any;
  const visitasTyped = (visitasSupervisao ?? []) as VisitaRow[];

  // Última visita de supervisão por cliente
  const ultimaVisitaPorCliente = new Map<string, { data: string; analista_id: string | null }>();
  for (const v of visitasTyped) {
    const reg = v.km_registros;
    if (!reg?.data || !v.cliente_id) continue;
    const atual = ultimaVisitaPorCliente.get(v.cliente_id);
    if (!atual || reg.data > atual.data) {
      ultimaVisitaPorCliente.set(v.cliente_id, { data: reg.data, analista_id: reg.analista_id });
    }
  }

  // Ranking do mês corrente (por analista que realizou a visita)
  const hoje = obterDataHojeBrasil();
  const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const rankingMap = new Map<string, number>();
  for (const v of visitasTyped) {
    const reg = v.km_registros;
    if (!reg?.data || !reg.analista_id) continue;
    if (!reg.data.startsWith(anoMes)) continue;
    rankingMap.set(reg.analista_id, (rankingMap.get(reg.analista_id) ?? 0) + 1);
  }
  const ranking: RankingEntry[] = Array.from(rankingMap.entries())
    .map(([analistaId, total]) => ({ analistaId, nome: nomeAnalista.get(analistaId) ?? "—", total }))
    .sort((a, b) => b.total - a.total);

  const hojeISO = formatarDataISO(hoje);

  const rows: ClienteSupervisaoRow[] = metasTyped
    .filter((m) => m.clientes)
    .map((m) => {
      const ultima = ultimaVisitaPorCliente.get(m.cliente_id) ?? null;
      const diasDesde = ultima ? Math.floor((hoje.getTime() - parseDataLocal(ultima.data).getTime()) / 86400000) : null;
      const badge: "em_dia" | "atrasado" | "nunca" = !ultima ? "nunca" : diasDesde! >= m.frequencia_dias ? "atrasado" : "em_dia";
      const modoEfetivo: "padrao" | "implantacao" =
        m.modo === "implantacao" && m.data_fim_implantacao && m.data_fim_implantacao < hojeISO ? "padrao" : m.modo;
      return {
        metaId: m.id,
        clienteId: m.cliente_id,
        clienteNome: m.clientes.nome as string,
        clienteAtivo: m.clientes.ativo as boolean,
        frequenciaDias: m.frequencia_dias,
        supervisorResponsavelId: m.supervisor_responsavel_id,
        supervisorResponsavelNome: m.supervisor_responsavel_id ? (nomeAnalista.get(m.supervisor_responsavel_id) ?? "—") : null,
        modo: modoEfetivo,
        dataFimImplantacao: m.data_fim_implantacao,
        ultimaVisitaData: ultima?.data ?? null,
        ultimaVisitaAnalistaId: ultima?.analista_id ?? null,
        ultimaVisitaAnalistaNome: ultima?.analista_id ? (nomeAnalista.get(ultima.analista_id) ?? "—") : null,
        diasDesde,
        badge,
        coberturaEventual: !!(ultima?.analista_id && m.supervisor_responsavel_id && ultima.analista_id !== m.supervisor_responsavel_id),
      };
    });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Supervisão de Postos de Trabalho</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
          {fullAccess ? "Acompanhamento de todos os clientes no programa de supervisão" : "Acompanhamento da sua carteira de clientes"}
        </p>
      </div>
      <SupervisaoPainelClient rows={rows} ranking={ranking} supervisores={supervisoresOptions} fullAccess={fullAccess} />
    </div>
  );
}
