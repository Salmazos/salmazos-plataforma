import { createServiceClient } from "@/lib/supabase/server";

type ResolveResult =
  | { ok: true; admissaoId: string; status: string; svc: ReturnType<typeof createServiceClient> }
  | { ok: false; error: string; httpStatus: number };

export async function resolveAdmissaoByToken(token: string): Promise<ResolveResult> {
  const svc = createServiceClient();
  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("id, status, token_expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 400 };
  if (!admissao) return { ok: false, error: "Link inválido.", httpStatus: 404 };
  if (new Date(admissao.token_expira_em) < new Date()) {
    return { ok: false, error: "Este link expirou.", httpStatus: 410 };
  }

  return { ok: true, admissaoId: admissao.id, status: admissao.status, svc };
}
