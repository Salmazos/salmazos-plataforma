import { createServiceClient } from "@/lib/supabase/server";

export type TipoHistorico =
  | "cadastro"
  | "etapa_alterada"
  | "encaminhamento"
  | "aprovacao_cliente"
  | "reprovacao_cliente"
  | "email_enviado"
  | "whatsapp"
  | "curriculo_atualizado"
  | "triagem_ia"
  | "match_ia"
  | "comentario_interno"
  | "retencao_ia"
  | "contratado"
  | "reprovado_final";

interface Params {
  candidato_id: string;
  tipo: TipoHistorico;
  descricao: string;
  metadata?: Record<string, unknown>;
  criado_por?: string | null;
}

/**
 * Fire-and-forget helper — swallows all errors so callers are never blocked.
 * Always call as `void registrarHistorico(...)` from API routes.
 */
export async function registrarHistorico(params: Params): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("historico_candidato").insert({
      candidato_id: params.candidato_id,
      tipo: params.tipo,
      descricao: params.descricao,
      metadata: params.metadata ?? null,
      criado_por: params.criado_por ?? null,
    });
    if (error) console.error("[registrarHistorico]", error.message);
  } catch (err) {
    console.error("[registrarHistorico] unexpected:", err);
  }
}
