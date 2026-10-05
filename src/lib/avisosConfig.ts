import { createServiceClient } from "@/lib/supabase/server";
import { ROTULO_CANAL, ROTULO_EVENTO, canalSemListaPermitido } from "@/lib/avisosCatalogo";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Regra de segurança: com o canal ligado, o evento nunca pode ficar sem nenhum destinatário
// ativo por ação da tela (remover ou desativar o último). Devolve a mensagem de bloqueio, ou
// null se a ação pode seguir. `ignorarId` é o destinatário que está sendo removido/desativado.
export async function bloqueioUltimoDestinatario(
  svc: ServiceClient,
  evento: string,
  canal: string,
  ignorarId: string
): Promise<string | null> {
  // Sino e popup dos avisos de decisão do cliente podem ficar ligados com a lista vazia (o responsável sempre é avisado).
  if (canalSemListaPermitido(evento, canal)) return null;
  const [{ data: cfg }, { data: outros, error }] = await Promise.all([
    svc.from("aviso_eventos_canais").select("ativo").eq("evento", evento).eq("canal", canal).maybeSingle(),
    svc.from("aviso_destinatarios").select("id").eq("evento", evento).eq("canal", canal).eq("ativo", true).neq("id", ignorarId).limit(1),
  ]);
  if (error) return `Não foi possível verificar os destinatários: ${error.message}`;
  const canalLigado = cfg ? cfg.ativo : true;
  if (canalLigado && (outros ?? []).length === 0) {
    return `Não é possível remover ou desativar o último destinatário ativo de "${ROTULO_EVENTO[evento] ?? evento}" no canal ${ROTULO_CANAL[canal] ?? canal} enquanto o aviso estiver ligado. Adicione outro destinatário ou desligue o canal antes.`;
  }
  return null;
}
