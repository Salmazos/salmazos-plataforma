import { redirect } from "next/navigation";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import PortalClienteClient, { type EncaminhamentoPortal, type CandidatoEmAvaliacao } from "@/components/PortalClienteClient";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();

  if (!clienteUsuario) redirect("/portal/login");

  const clienteId = clienteUsuario.cliente_id;

  const [{ data: cliente }, { data: encRows }, { data: vagasCliente }] = await Promise.all([
    service
      .from("clientes")
      .select("id, nome, contato_nome")
      .eq("id", clienteId)
      .single(),
    service
      .from("encaminhamentos")
      .select(
        "id, status, data_entrevista, feedback_cliente, avaliado_em, created_at, candidatos(id, nome_completo, cargo_pretendido, cidade, estado, habilidades)"
      )
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false }),
    service.from("vagas").select("id, titulo").eq("cliente_id", clienteId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaIds = (vagasCliente ?? []).map((v: any) => v.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatoIds = (encRows ?? []).map((e: any) => e.candidatos?.id).filter(Boolean);

  // Build maps: candidato_id → best match score + vaga titulo + etapa
  const matchMap: Record<string, number> = {};
  const vagaTituloMap: Record<string, string> = {};
  const etapaMap: Record<string, { etapa: string; responsavel: string | null; updated_at: string }> = {};

  if (vagaIds.length > 0 && candidatoIds.length > 0) {
    const { data: cvRows } = await service
      .from("candidatos_vagas")
      .select("candidato_id, match_score, etapa, responsavel, updated_at, vagas(titulo)")
      .in("vaga_id", vagaIds)
      .in("candidato_id", candidatoIds);

    for (const row of (cvRows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const titulo: string | undefined = r.vagas?.titulo;
      // Keep vaga titulo (first match wins; any linked vaga counts)
      if (titulo && !vagaTituloMap[r.candidato_id]) {
        vagaTituloMap[r.candidato_id] = titulo;
      }
      // Keep highest match score
      if (r.match_score != null && (matchMap[r.candidato_id] == null || r.match_score > matchMap[r.candidato_id])) {
        matchMap[r.candidato_id] = r.match_score;
        // Prefer titulo from the row with the best score
        if (titulo) vagaTituloMap[r.candidato_id] = titulo;
      }
      // Keep latest etapa (overwrite if newer)
      if (r.etapa && (!etapaMap[r.candidato_id] || r.updated_at > etapaMap[r.candidato_id].updated_at)) {
        etapaMap[r.candidato_id] = {
          etapa: r.etapa,
          responsavel: r.responsavel ?? null,
          updated_at: r.updated_at,
        };
      }
    }
  }

  // Candidates in entrevista_salmazos linked to this client via candidatos_vagas.cliente_id
  const { data: cvEmAvaliacao } = await service
    .from("candidatos_vagas")
    .select("id, etapa, candidato_id, vaga_id, data_entrevista_salmazos, responsavel, updated_at, candidatos(id, nome_completo, cargo_pretendido, cidade, estado), vagas(titulo)")
    .eq("cliente_id", clienteId)
    .eq("etapa", "entrevista_salmazos");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emAvaliacao: CandidatoEmAvaliacao[] = (cvEmAvaliacao ?? []).map((cv: any) => ({
    cv_id: cv.id,
    vaga_titulo: cv.vagas?.titulo ?? "—",
    responsavel: cv.responsavel ?? null,
    data_entrevista_salmazos: cv.data_entrevista_salmazos ?? null,
    updated_at: cv.updated_at,
    cargo_pretendido: cv.candidatos?.cargo_pretendido ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encaminhamentos: EncaminhamentoPortal[] = (encRows ?? []).map((e: any) => {
    const cid = e.candidatos?.id;
    const cv = cid ? etapaMap[cid] : undefined;
    return {
      id: e.id,
      status: e.status,
      data_entrevista: e.data_entrevista,
      feedback_cliente: e.feedback_cliente ?? undefined,
      avaliado_em: e.avaliado_em ?? undefined,
      match_score: matchMap[cid],
      vaga_titulo: vagaTituloMap[cid],
      etapa_kanban: cv?.etapa ?? null,
      responsavel_analista: cv?.responsavel ?? null,
      etapa_updated_at: cv?.updated_at ?? null,
      candidato: e.candidatos,
    };
  });

  const nomeCliente = cliente?.contato_nome || cliente?.nome || "Cliente";

  // Brasil não observa horário de verão desde 2019 — comparar a data em
  // America/Sao_Paulo com toLocaleDateString é suficiente, sem precisar de lib de timezone.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const entrevistasHoje = encaminhamentos
    .filter((e) => e.status === "aguardando" && e.data_entrevista)
    .filter((e) => new Date(e.data_entrevista as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === hojeSP)
    .map((e) => ({
      id: e.id,
      candidato_nome: e.candidato?.nome_completo ?? "Candidato",
      hora: new Date(e.data_entrevista as string).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

  return (
    <PortalClienteClient
      nomeCliente={nomeCliente}
      encaminhamentos={encaminhamentos}
      emAvaliacao={emAvaliacao}
      entrevistasHoje={entrevistasHoje}
    />
  );
}
