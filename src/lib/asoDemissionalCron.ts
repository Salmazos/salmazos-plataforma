import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverDestinatarios } from "@/lib/avisos";
import {
  ASO_DEMISSIONAL_CONTROLE_INICIO,
  ASO_DEMISSIONAL_PRAZO_DIAS,
  entraNoAvisoInterno,
  EVENTO_ASO_PENDENTE,
  diasDesdeDesligamento,
  mensagemAsoPendente,
  type RescisaoSemAso,
} from "@/lib/asoDemissional";

// Quarto passo do cron diário rescisao-avisos (sem cron novo). Avisa a lista de "Avisos de Rescisão" (evento
// rescisao_aso_pendente, sino) sobre rescisões SEM ASO demissional com ASO_DEMISSIONAL_PRAZO_DIAS ou mais desde o
// desligamento; repete 1x por dia enquanto houver pendência.
//
// Uma notificação CONSOLIDADA por destinatário por dia (e não uma por rescisão): com dezenas de rescisões antigas sem
// ASO, o aviso individual viraria uma enxurrada de sinos e popups todo dia.
//
// Idempotência (mesmo critério do resto do cron: marcar SÓ DEPOIS de confirmar o envio): ultimo_aviso_aso_pendente_enviado_em
// guarda o dia (Brasília) do último aviso que incluiu a rescisão. Se o cron rodar duas vezes no mesmo dia, as
// rescisões já marcadas não entram e ninguém recebe de novo. Falha no insert = nada é marcado e o cron de amanhã tenta.
// Sem pendência, ou sem ninguém na lista/canal desligado, não grava nada (silêncio total).
export async function avisarAsoDemissionalPendente(
  svc: SupabaseClient,
  hojeISO: string
): Promise<{ pendentes: number; destinatarios: number }> {
  // Rescisão anterior a ASO_DEMISSIONAL_CONTROLE_INICIO (legado) nunca entra; rescisão programada (data futura) também não.
  const limite = new Date(Date.parse(`${hojeISO}T00:00:00Z`) - ASO_DEMISSIONAL_PRAZO_DIAS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: candidatas, error } = await svc
    .from("rescisoes")
    .select("id, data_desligamento, empresa, ultimo_aviso_aso_pendente_enviado_em, funcionarios(nome_completo)")
    .is("aso_documento_path", null)
    .gte("data_desligamento", ASO_DEMISSIONAL_CONTROLE_INICIO)
    .lte("data_desligamento", limite);
  if (error) throw new Error(`buscar rescisões sem ASO: ${error.message}`);

  // Dia do último aviso em Brasília (timestamptz -> AAAA-MM-DD) para comparar com "hoje".
  const diaBrasilia = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todas = (candidatas ?? []) as any[];
  const pendentes = todas.filter((r) => entraNoAvisoInterno(r, hojeISO));
  const aindaNaoAvisadasHoje = pendentes.filter((r) => diaBrasilia(r.ultimo_aviso_aso_pendente_enviado_em) !== hojeISO);
  if (aindaNaoAvisadasHoje.length === 0) return { pendentes: pendentes.length, destinatarios: 0 };

  const sino = await resolverDestinatarios(EVENTO_ASO_PENDENTE, "sino", undefined, svc);
  if (sino.falhou) throw new Error("buscar destinatários do aviso de ASO pendente");
  if (sino.modo !== "configurado" || sino.userIds.length === 0) return { pendentes: pendentes.length, destinatarios: 0 };

  // O aviso do dia lista TODAS as pendentes (não só as ainda não marcadas), para a mensagem ser coerente.
  const lista: RescisaoSemAso[] = pendentes.map((r) => ({
    id: r.id,
    data_desligamento: r.data_desligamento,
    empresa: r.empresa,
    nome: r.funcionarios?.nome_completo?.trim() || "Funcionário",
  }));
  const { titulo, mensagem } = mensagemAsoPendente(lista, hojeISO);

  const { error: insertError } = await svc.from("notificacoes_analista").insert(
    sino.userIds.map((usuarioId) => ({
      tipo: EVENTO_ASO_PENDENTE,
      titulo,
      mensagem,
      user_id: usuarioId,
      candidato_id: null,
      rescisao_id: null,
    }))
  );
  if (insertError) throw new Error(`criar notificações: ${insertError.message}`);

  const { error: marcaError } = await svc
    .from("rescisoes")
    .update({ ultimo_aviso_aso_pendente_enviado_em: new Date().toISOString() })
    .in("id", aindaNaoAvisadasHoje.map((r) => r.id));
  if (marcaError) console.error("[asoDemissionalCron] Aviso enviado mas falha ao marcar dedup:", marcaError.message);

  return { pendentes: pendentes.length, destinatarios: sino.userIds.length };
}
