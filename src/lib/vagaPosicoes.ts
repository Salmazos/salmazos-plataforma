import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { notificarVagaEncerrada } from "@/lib/notificarVagaEncerrada";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface ResultadoSincronizacao {
  numPosicoesAbertas: number;
  vagaFechadaAgora: boolean;
}

// Fonte única de verdade pro contador `vagas.num_posicoes_abertas`: sempre recalculado a
// partir da contagem real de candidatos_vagas em etapa='contratado', nunca mais
// incrementado/decrementado "no escuro" por cada rota separadamente. Existia um histórico
// de bugs com esse contador como campo solto atualizado manualmente em vários pontos
// (criação, finalização, reabertura manual, edição de num_posicoes) — divergiu da
// realidade mais de uma vez: primeiro o fechamento na 1ª contratação de vagas com várias
// posições (fix 14/09), depois o caso real da vaga "Auxiliar de Produção" (Novacki, 20
// posições) que fechou sozinha 2x em 21-22/09 porque aumentar `num_posicoes` numa vaga já
// existente não reajustava esse contador, que ficou preso num valor baixo de antes do
// ajuste. Chamar esta função depois de QUALQUER mudança que afete o total de posições ou a
// lista de contratados de uma vaga (criação, edição de num_posicoes, finalização como
// contratado, reabertura manual, "vaga cancelada pelo cliente") — nunca mais escrever em
// `num_posicoes_abertas` diretamente fora daqui (exceção: nascimento de uma vaga nova, onde
// ainda não existe nenhum contratado, e a vaga "vaga casada" da Admissão Rápida, que nasce
// e já morre fechada, sem passar por este fluxo).
//
// Só fecha automaticamente (nunca reabre sozinha) — reabrir é sempre decisão manual do RH,
// e esta função é chamada logo depois pra corrigir o contador com a contagem real.
//
// EXCEÇÃO Mão de Obra Temporária (set/2026, caso real vaga "Conferente"): diferente de R&S,
// onde "contratado" é definitivo e ocupa a posição pra sempre, colocação de MOT tem prazo
// (candidatos_vagas.data_fim) e é normal o cliente pedir outro temporário/substituto na
// mesma vaga antes desse prazo acabar. Contar "contratado" como ocupação permanente fazia a
// vaga fechar sozinha na hora, toda vez que o analista clicava em "Reativar" — a colocação
// anterior (ainda dentro do prazo) já esgotava `num_posicoes`, e o fechamento automático
// rodava de novo antes do analista conseguir direcionar o novo candidato. Por isso todo
// caminho que reabre uma vaga MOT por decisão de alguém (reativação manual, aprovação de
// pedido do cliente, cancelamento de processo que reabre a vaga) passa
// `permitirFechamentoAutomatico: false` — o contador continua sendo recalculado
// normalmente, só o fechamento automático é que não roda nesse caso. Fechar de fato passa a
// ser sempre decisão manual do analista pra esse tipo de serviço a partir da reativação.
export async function sincronizarPosicoesAbertas(
  vagaId: string,
  supabase: ServiceClient,
  opcoes?: { permitirFechamentoAutomatico?: boolean }
): Promise<ResultadoSincronizacao | null> {
  const permitirFechamentoAutomatico = opcoes?.permitirFechamentoAutomatico ?? true;

  const { data: vaga } = await supabase
    .from("vagas")
    .select("id, status, num_posicoes")
    .eq("id", vagaId)
    .single();
  if (!vaga) return null;

  const { count } = await supabase
    .from("candidatos_vagas")
    .select("id", { count: "exact", head: true })
    .eq("vaga_id", vagaId)
    .eq("etapa", "contratado");

  const contratados = count ?? 0;
  const numPosicoesAbertas = Math.max(vaga.num_posicoes - contratados, 0);
  const fechariaAutomaticamente = numPosicoesAbertas === 0 && vaga.status === "aberta";
  const vagaFechadaAgora = fechariaAutomaticamente && permitirFechamentoAutomatico;

  const campos: Record<string, unknown> = { num_posicoes_abertas: numPosicoesAbertas };
  if (vagaFechadaAgora) {
    campos.status = "fechada";
    campos.data_fechamento = new Date().toISOString();
  }

  await supabase.from("vagas").update(campos).eq("id", vagaId);

  if (vagaFechadaAgora) {
    // Mesma réplica manual de e-mail + audit_log que o fechamento automático já fazia
    // (ver histórico em finalizar/route.ts) — centralizada aqui agora, pra todo caminho
    // que chama esta função ganhar o mesmo comportamento sem duplicar código.
    await notificarVagaEncerrada(vagaId, "fechada", supabase).catch((err) =>
      console.error("[sincronizarPosicoesAbertas] Erro ao notificar encerramento de vaga:", err)
    );
    registrarAuditoria({
      acao: "vaga_atualizada",
      entidade: "vagas",
      entidade_id: vagaId,
      detalhes: { status_anterior: "aberta", status_novo: "fechada", origem: "fechamento_automatico_finalizar" },
    });
  }

  return { numPosicoesAbertas, vagaFechadaAgora };
}
