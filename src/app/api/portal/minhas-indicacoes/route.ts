import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { podeEditarIndicacao } from "@/lib/indicacaoEdicao";

export async function GET() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();

  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: indicacoes, error } = await service
    .from("solicitacoes_indicacao_candidato")
    .select("id, candidato_nome, vaga_id, status, motivo_recusa, decidido_em, created_at, candidato_id, candidatos_vaga_id")
    .eq("cliente_id", cu.cliente_id)
    .eq("solicitado_por_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[GET /api/portal/minhas-indicacoes]", error);
    return NextResponse.json({ error: "Erro ao carregar indicações." }, { status: 500 });
  }

  if (!indicacoes || indicacoes.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const vagaIds = indicacoes.map((i) => i.vaga_id).filter((id): id is string => !!id);
  const vagasMap: Record<string, { id: string; titulo: string }> = {};

  if (vagaIds.length > 0) {
    const { data: vagas, error: vagasErr } = await service
      .from("vagas")
      .select("id, titulo")
      .in("id", vagaIds)
      .eq("cliente_id", cu.cliente_id);

    if (vagasErr) {
      console.error("[GET /api/portal/minhas-indicacoes] Erro ao buscar vagas:", vagasErr);
      return NextResponse.json({ error: "Erro ao carregar vagas." }, { status: 500 });
    }

    if (vagas) {
      vagas.forEach((v) => {
        vagasMap[v.id] = v;
      });
    }
  }

  // "Pode editar" calculado aqui (o PATCH revalida sempre). Aprovadas: etapa da candidatura + admissões do
  // candidato, em 2 consultas para a lista inteira (sem N+1). Erro em qualquer uma = não editável.
  const aprovadas = indicacoes.filter((i) => i.status === "aprovada");
  const cvIds = aprovadas.map((i) => i.candidatos_vaga_id).filter((id): id is string => !!id);
  const candIds = aprovadas.map((i) => i.candidato_id).filter((id): id is string => !!id);
  const etapas = new Map<string, string | null>();
  let admissoes: { candidato_id: string; vaga_id: string | null; status: string | null }[] = [];
  let leituraOk = true;
  if (cvIds.length > 0) {
    const { data, error: cvErr } = await service.from("candidatos_vagas").select("id, etapa").in("id", cvIds);
    if (cvErr) leituraOk = false;
    (data ?? []).forEach((c) => etapas.set(c.id, c.etapa));
  }
  if (candIds.length > 0) {
    const { data, error: admErr } = await service.from("admissoes").select("candidato_id, vaga_id, status").in("candidato_id", candIds);
    if (admErr) leituraOk = false;
    admissoes = data ?? [];
  }
  if (!leituraOk) console.error("[GET /api/portal/minhas-indicacoes] Erro ao avaliar edição das indicações aprovadas (botão Editar oculto).");

  // candidato_id e candidatos_vaga_id são internos: não saem na resposta.
  const resultado = indicacoes.map(({ candidato_id, candidatos_vaga_id, ...ind }) => ({
    ...ind,
    vaga_titulo: vagasMap[ind.vaga_id]?.titulo ?? null,
    pode_editar:
      ind.status === "pendente" ||
      (ind.status === "aprovada" &&
        leituraOk &&
        podeEditarIndicacao({
          status: ind.status,
          vagaId: ind.vaga_id,
          etapa: candidatos_vaga_id ? (etapas.get(candidatos_vaga_id) ?? null) : null,
          admissoes: admissoes.filter((a) => a.candidato_id === candidato_id),
        }).pode),
  }));

  return NextResponse.json({ data: resultado });
}
