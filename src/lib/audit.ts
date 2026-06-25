import { createServiceClient } from "@/lib/supabase/server";

interface AuditoriaParams {
  usuario_id?: string | null;
  usuario_nome?: string | null;
  acao: string;
  entidade: string;
  entidade_id?: string | null;
  detalhes?: Record<string, unknown> | null;
  ip_address?: string | null;
}

export function registrarAuditoria(params: AuditoriaParams): void {
  const supabase = createServiceClient();
  void (async () => {
    try {
      await supabase.from("audit_logs").insert({
        usuario_id: params.usuario_id ?? null,
        usuario_nome: params.usuario_nome ?? null,
        acao: params.acao,
        entidade: params.entidade,
        entidade_id: params.entidade_id ?? null,
        detalhes: params.detalhes ?? null,
        ip_address: params.ip_address ?? null,
      });
    } catch (err) {
      console.error("[audit]", err);
    }
  })();
}
