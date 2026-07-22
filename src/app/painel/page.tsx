import { createClient, createServiceClient } from "@/lib/supabase/server";
import PainelLayout from "@/components/PainelLayout";
import type { KanbanCard } from "@/types";
import { ETAPAS_KANBAN_VISIVEIS } from "@/lib/constants";
import { mapTipoServicoPorCandidatura, mapEncaminhamentoAgendamentoPorCandidatura } from "@/lib/tipoServicoVigente";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const supabase = createServiceClient();
  const authClient = await createClient();

  const { data: cvData, error: cvError } = await supabase
    .from("candidatos_vagas")
    .select(`
      id, etapa, vaga_id, cliente_id, observacoes, created_at,
      candidatos!inner(id, nome_completo, cargo_pretendido, cidade, estado, triagem_score, triagem_label, origem, bloqueado, responsavel, habilidades, resumo_profissional, created_at, updated_at),
      vagas!inner(id, titulo, tipo_servico, cliente_id, clientes(nome)),
      clientes(nome)
    `)
    .in("etapa", ETAPAS_KANBAN_VISIVEIS)
    .order("created_at", { ascending: false });

  // Mesma fonte usada em Gestão de Clientes e Relatórios — não a constante ANALISTAS
  // (nomes curtos, usada só para responsavel_comercial de clientes/vagas).
  const { data: analistasPerfil } = await supabase
    .from("analistas_perfil")
    .select("nome_completo")
    .eq("ativo", true)
    .order("nome_completo");

  if (cvError) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        Erro ao carregar candidatos: {cvError.message}
      </div>
    );
  }

  // Modalidade "vigente" de cada candidatura — ver src/lib/tipoServicoVigente.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatoIds = Array.from(new Set((cvData ?? []).map((cv: any) => cv.candidatos.id)));
  const tipoServicoPorCandidatura = await mapTipoServicoPorCandidatura(supabase, candidatoIds);
  const agendamentoPorCandidatura = await mapEncaminhamentoAgendamentoPorCandidatura(supabase, candidatoIds);

  const cards: KanbanCard[] = ((cvData ?? []) as unknown as {
    id: string;
    etapa: string;
    vaga_id: string;
    cliente_id: string | null;
    observacoes: string | null;
    created_at: string;
    candidatos: {
      id: string;
      nome_completo: string;
      cargo_pretendido: string;
      cidade: string;
      estado: string;
      triagem_score: number | null;
      triagem_label: string | null;
      origem: string | null;
      bloqueado: boolean | null;
      responsavel: string | null;
      habilidades: string[] | null;
      resumo_profissional: string | null;
      created_at: string;
      updated_at: string;
    };
    vagas: { id: string; titulo: string; tipo_servico: string | null; cliente_id: string | null; clientes: { nome: string } | null };
    clientes: { nome: string } | null;
  }[]).map((cv) => ({
    cv_id: cv.id,
    etapa: cv.etapa,
    vaga_id: cv.vaga_id,
    vaga_titulo: cv.vagas.titulo,
    vaga_tipo_servico: cv.vagas.tipo_servico,
    encaminhamento_tipo_servico: tipoServicoPorCandidatura.get(`${cv.candidatos.id}|${cv.vaga_id}`) ?? null,
    encaminhamento_status: agendamentoPorCandidatura.get(`${cv.candidatos.id}|${cv.vaga_id}`)?.status ?? null,
    encaminhamento_data_entrevista: agendamentoPorCandidatura.get(`${cv.candidatos.id}|${cv.vaga_id}`)?.data_entrevista ?? null,
    // candidatos_vagas.cliente_id é exceção manual (renegociação para outro cliente);
    // na ausência, o padrão é o cliente já vinculado à vaga.
    cliente_id: cv.cliente_id ?? cv.vagas.cliente_id ?? null,
    cliente_nome: cv.clientes?.nome ?? cv.vagas.clientes?.nome ?? null,
    observacoes: cv.observacoes,
    candidato_id: cv.candidatos.id,
    nome_completo: cv.candidatos.nome_completo,
    cargo_pretendido: cv.candidatos.cargo_pretendido,
    cidade: cv.candidatos.cidade,
    estado: cv.candidatos.estado,
    triagem_score: cv.candidatos.triagem_score,
    triagem_label: cv.candidatos.triagem_label,
    origem: cv.candidatos.origem,
    bloqueado: cv.candidatos.bloqueado,
    responsavel: cv.candidatos.responsavel,
    habilidades: cv.candidatos.habilidades,
    resumo_profissional: cv.candidatos.resumo_profissional,
    created_at: cv.created_at,
    candidato_created_at: cv.candidatos.created_at,
  }));

  // ── Auth + role ───────────────────────────────────────────────
  let analistaLogado = "";
  const { data: { user } } = await authClient.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  const isFullAccess = ["superuser", "diretoria"].includes(role);

  if (user) {
    const { data: perfil } = await supabase
      .from("analistas_perfil")
      .select("nome_completo")
      .eq("user_id", user.id)
      .single();
    analistaLogado = perfil?.nome_completo ?? "";
  }

  // ── Métricas ──────────────────────────────────────────────────
  const metricsCards = isFullAccess
    ? cards
    : cards.filter((c) => c.responsavel === analistaLogado);

  const totalAtivos = metricsCards.length;

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const aprovadosNoMes = metricsCards.filter(
    (c) => c.etapa === "aprovado_cliente" && new Date(c.created_at) >= inicioMes
  ).length;

  const origensMap = new Map<string, number>();
  metricsCards.forEach((c) => {
    const key = c.origem ?? "cadastro_rapido";
    origensMap.set(key, (origensMap.get(key) ?? 0) + 1);
  });
  const vagas = Array.from(origensMap.entries())
    .map(([cargo, count]) => ({ cargo, count }))
    .sort((a, b) => b.count - a.count);

  const recentes = metricsCards.slice(0, 5).map((c) => ({
    id: c.candidato_id,
    nome_completo: c.nome_completo,
    cargo_pretendido: c.cargo_pretendido,
    created_at: c.candidato_created_at,
  }));

  return (
    <PainelLayout
      cards={cards}
      totalAtivos={totalAtivos}
      aprovadosNoMes={aprovadosNoMes}
      tempoMedioDias={0}
      vagas={vagas}
      recentes={recentes}
      analistaLogado={analistaLogado}
      isFullAccess={isFullAccess}
      analistas={(analistasPerfil ?? []).map((a) => a.nome_completo)}
    />
  );
}
