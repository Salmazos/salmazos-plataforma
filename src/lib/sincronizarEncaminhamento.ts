import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Domínio de candidatos_vagas.etapa que indica avaliação concluída do lado do cliente —
// fonte: lib/etapasCandidatura.ts (ETAPAS_CANDIDATURA). "reprovado_cliente" (registrado a
// partir da etapa "Entrevista Cliente", via ModalMotivoEtapa) é, na prática, o valor de
// rejeição mais comum — mais que "reprovado" (rejeição antes da entrevista) e
// "reprovado_final" (encerramento depois de aprovado_cliente) somados. Os três fecham a
// pendência do lado do cliente do mesmo jeito.
const ETAPAS_APROVACAO = new Set(["aprovado_cliente", "aprovado", "contratado"]);
const ETAPAS_REPROVACAO = new Set(["reprovado", "reprovado_cliente", "reprovado_final"]);

const FEEDBACK_SINCRONIZACAO = "Avaliação registrada internamente pelo analista (fora do portal)";

// Sentido 2 da sincronização bidirecional encaminhamentos ⇄ candidatos_vagas.etapa (ver
// PATCH /api/portal/avaliar pro sentido 1, onde o cliente avalia pelo portal). Chamada
// depois de qualquer update bem-sucedido de etapa nas rotas internas — fecha
// automaticamente o encaminhamento "aguardando" correspondente (se existir) quando o
// analista já decidiu por fora do portal do cliente, evitando que o candidato continue
// aparecendo como "aguardando avaliação" pro cliente muito depois de já ter sido
// contratado/reprovado internamente.
//
// Idempotente por design: se a etapa não indicar avaliação concluída (ex: triagem,
// entrevista_cliente, nao_compareceu, nao_tem_interesse, bloqueado — fora do escopo desta
// sincronização), não faz nada — nunca lança erro, nunca bloqueia o caller. Se já existe
// um encaminhamento (aguardando ou já avaliado) pra esse par, só atualiza o 'aguardando'
// e nunca sobrescreve um que já foi avaliado. Se nunca existiu nenhum, cria um novo já
// fechado — mas só pra aprovação, nunca pra reprovação (ver comentário mais abaixo).
//
// Trava de corrida com o sentido 1: o update final tem WHERE status='aguardando' de novo
// (não só a leitura anterior) — se o cliente avaliou pelo portal entre a leitura e a
// escrita daqui, o update não afeta nenhuma linha, sem sobrescrever a avaliação real dele.
export async function sincronizarEncaminhamentoComEtapa(
  candidatoId: string,
  clienteId: string | null,
  novaEtapa: string,
  supabase?: ServiceClient
): Promise<void> {
  if (!clienteId) return;

  let novoStatus: "aprovado" | "reprovado" | null = null;
  if (ETAPAS_APROVACAO.has(novaEtapa)) novoStatus = "aprovado";
  else if (ETAPAS_REPROVACAO.has(novaEtapa)) novoStatus = "reprovado";
  if (!novoStatus) return;

  const svc = supabase ?? createServiceClient();

  const { data: encaminhamento } = await svc
    .from("encaminhamentos")
    .select("id, status")
    .eq("candidato_id", candidatoId)
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (encaminhamento) {
    if (encaminhamento.status !== "aguardando") return;
    await svc
      .from("encaminhamentos")
      .update({
        status: novoStatus,
        feedback_cliente: FEEDBACK_SINCRONIZACAO,
        avaliado_em: new Date().toISOString(),
      })
      .eq("id", encaminhamento.id)
      .eq("status", "aguardando");
    return;
  }

  // Nunca existiu nenhum encaminhamento pra esse par candidato+cliente — só cria um
  // já fechado quando a etapa é de APROVAÇÃO. Regra de negócio confirmada com o
  // Olver: "contratado" só existe se o cliente aprovou, então o registro que o
  // portal do cliente lê precisa existir, nem que seja retroativo (ver caso real do
  // Carlos Henrique/Embalatec, ago/2026). Nunca faz o mesmo pra reprovação: um
  // candidato reprovado internamente ANTES de ser mostrado ao cliente (ex: descartado
  // ainda na triagem) não pode ganhar um "reprovado" fantasma no portal dele — criaria
  // a impressão de que o cliente rejeitou alguém que nunca chegou a ver.
  if (novoStatus !== "aprovado") return;

  const { data: vagaCv } = await svc
    .from("candidatos_vagas")
    .select("vaga_id")
    .eq("candidato_id", candidatoId)
    .eq("cliente_id", clienteId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await svc.from("encaminhamentos").insert({
    candidato_id: candidatoId,
    cliente_id: clienteId,
    vaga_id: vagaCv?.vaga_id ?? null,
    status: "aprovado",
    feedback_cliente: FEEDBACK_SINCRONIZACAO,
    avaliado_em: new Date().toISOString(),
  });
}
