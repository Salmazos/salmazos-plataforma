import { createServiceClient } from "@/lib/supabase/server";

type ResolveResult =
  | { ok: true; admissaoId: string; status: string; svc: ReturnType<typeof createServiceClient> }
  | { ok: false; error: string; httpStatus: number };

// Status em que o candidato ainda pode editar/enviar dados via o link público.
// Depois de enviado para análise, escrita fica bloqueada mesmo com token válido —
// evita que o formulário público sobrescreva dados já em revisão pela equipe.
const STATUS_EDITAVEL_PELO_CANDIDATO = ["aguardando_candidato", "em_preenchimento"];

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
  if (!STATUS_EDITAVEL_PELO_CANDIDATO.includes(admissao.status)) {
    return {
      ok: false,
      error: "Esta admissão já foi enviada para análise e não pode mais ser editada por este link.",
      httpStatus: 403,
    };
  }

  return { ok: true, admissaoId: admissao.id, status: admissao.status, svc };
}
