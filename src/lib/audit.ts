import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Resolve o nome pra usuario_nome em registrarAuditoria a partir de analistas_perfil.nome_completo
// (mesmo padrão já usado em outras partes do sistema, ex: candidatos/[id]/reprovar/route.ts) —
// nunca user.email direto, que é o que os pontos do módulo de Cobrança R&S faziam antes desta
// correção. Cai pro e-mail só no caso raro de não existir linha correspondente em
// analistas_perfil (nunca falha a operação por causa disso).
export async function resolverNomeUsuario(
  userId: string,
  emailFallback: string | null,
  supabase?: ServiceClient
): Promise<string | null> {
  const svc = supabase ?? createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("nome_completo")
    .eq("user_id", userId)
    .maybeSingle();
  return perfil?.nome_completo ?? emailFallback;
}

interface AuditoriaParams {
  usuario_id?: string | null;
  usuario_nome?: string | null;
  acao: string;
  entidade: string;
  entidade_id?: string | null;
  detalhes?: Record<string, unknown> | null;
  ip_address?: string | null;
}

// Compara só as chaves presentes em `depois` (o patch enviado) contra o valor
// correspondente em `antes` (a linha antes do update) — usado nas rotas de edição total
// do analista pra registrar exatamente o que mudou, não a linha inteira.
export function diffCampos(
  antes: Record<string, unknown> | null | undefined,
  depois: Record<string, unknown>
): Record<string, { antes: unknown; depois: unknown }> {
  const diff: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const key of Object.keys(depois)) {
    const valorAntes = antes?.[key] ?? null;
    const valorDepois = depois[key] ?? null;
    if (valorAntes !== valorDepois) diff[key] = { antes: valorAntes, depois: valorDepois };
  }
  return diff;
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
