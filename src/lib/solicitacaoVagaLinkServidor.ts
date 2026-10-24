import { createServiceClient } from "@/lib/supabase/server";
import { MAX_USOS_LINK } from "@/lib/solicitacaoVagaLink";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface LinkSolicitacao {
  id: string;
  token: string;
  unidade_id: string;
  nome_empresa: string | null;
  criado_por_user_id: string | null;
  criado_por_nome: string | null;
  expira_em: string;
  revogado_em: string | null;
  usos: number;
  created_at: string;
  condicoes: unknown;
  clausulas_adicionais: unknown;
}

// Token gerado por crypto.randomBytes(24).toString("base64url") = 32 caracteres; o formato é checado antes de consultar o banco.
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export async function resolverLinkPorToken(svc: ServiceClient, token: string): Promise<LinkSolicitacao | null> {
  if (!FORMATO_TOKEN.test(token)) return null;
  const { data, error } = await svc.from("solicitacao_vaga_links").select("*").eq("token", token).maybeSingle();
  if (error) {
    console.error("[solicitacaoVagaLink] Erro ao ler o link:", error.code ?? error.message);
    return null;
  }
  return (data as LinkSolicitacao | null) ?? null;
}

// Reserva um envio do link de forma atômica (compara e troca em `usos`): duas requisições ao mesmo tempo não passam do teto.
export async function reservarUsoDoLink(svc: ServiceClient, link: Pick<LinkSolicitacao, "id" | "usos">): Promise<boolean> {
  let usosAtuais = link.usos;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    if (usosAtuais >= MAX_USOS_LINK) return false;
    const { data, error } = await svc
      .from("solicitacao_vaga_links")
      .update({ usos: usosAtuais + 1 })
      .eq("id", link.id)
      .eq("usos", usosAtuais)
      .select("usos");
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return true;
    const { data: atual } = await svc.from("solicitacao_vaga_links").select("usos").eq("id", link.id).maybeSingle();
    if (!atual) return false;
    usosAtuais = atual.usos as number;
  }
  return false;
}

// Se a gravação da solicitação falhar depois da reserva, devolve o envio ao link (melhor esforço, nunca lança).
export async function devolverUsoDoLink(svc: ServiceClient, linkId: string): Promise<void> {
  try {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const { data: atual } = await svc.from("solicitacao_vaga_links").select("usos").eq("id", linkId).maybeSingle();
      if (!atual || (atual.usos as number) <= 0) return;
      const { data } = await svc
        .from("solicitacao_vaga_links")
        .update({ usos: (atual.usos as number) - 1 })
        .eq("id", linkId)
        .eq("usos", atual.usos as number)
        .select("usos");
      if (data && data.length > 0) return;
    }
  } catch (err) {
    console.error("[solicitacaoVagaLink] Erro ao devolver o envio do link:", err instanceof Error ? err.message : err);
  }
}
