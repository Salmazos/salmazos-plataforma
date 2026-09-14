import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface DestinatarioSupervisao {
  user_id: string;
  email: string;
  nome_completo: string;
}

/**
 * Destinatários do aviso de supervisão atrasada/nunca supervisionada: diretoria/superuser
 * (analistas_perfil.nivel_acesso) sempre + o supervisor responsável daquele cliente
 * específico (clientes_meta_supervisao.supervisor_responsavel_id, que referencia
 * analistas_perfil.id — não auth.users.id, por isso a comparação é por `a.id`, diferente de
 * obterDestinatariosCobrancaRS que compara por `a.user_id`). supervisorResponsavelId pode ser
 * null (cliente sem supervisor definido) — nesse caso só a diretoria/superuser entra.
 */
export async function obterDestinatariosSupervisaoAtraso(
  supervisorResponsavelId: string | null,
  supabase?: ServiceClient
): Promise<DestinatarioSupervisao[]> {
  const svc = supabase ?? createServiceClient();

  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, user_id, email, nome_completo, nivel_acesso")
    .eq("ativo", true);

  const destinatarios = new Map<string, DestinatarioSupervisao>();

  for (const a of analistas ?? []) {
    if (!a.user_id || !a.email) continue;
    const ehFullAccess = a.nivel_acesso === "diretoria" || a.nivel_acesso === "superuser";
    const ehSupervisorResponsavel = supervisorResponsavelId != null && a.id === supervisorResponsavelId;
    if (ehFullAccess || ehSupervisorResponsavel) {
      destinatarios.set(a.user_id, { user_id: a.user_id, email: a.email, nome_completo: a.nome_completo });
    }
  }

  return Array.from(destinatarios.values());
}

/**
 * Destinatários do E-MAIL de supervisão atrasada — só o supervisor responsável do cliente
 * (clientes_meta_supervisao.supervisor_responsavel_id), sem incluir diretoria/superuser
 * automaticamente (decisão de negócio 14/09: e-mail de todo cliente pra todo full-access
 * gerava volume excessivo). Diferente de obterDestinatariosSupervisaoAtraso (usada pro sino
 * dentro da plataforma, que continua incluindo diretoria/superuser) — dois resolvers
 * separados de propósito, não uma flag na mesma função, porque os dois canais têm regras de
 * negócio independentes agora. Retorna lista vazia se o cliente não tiver supervisor
 * definido (não há fallback pra diretoria aqui).
 */
export async function obterDestinatarioEmailSupervisaoAtraso(
  supervisorResponsavelId: string | null,
  supabase?: ServiceClient
): Promise<DestinatarioSupervisao[]> {
  if (!supervisorResponsavelId) return [];

  const svc = supabase ?? createServiceClient();

  const { data: analista } = await svc
    .from("analistas_perfil")
    .select("id, user_id, email, nome_completo")
    .eq("id", supervisorResponsavelId)
    .eq("ativo", true)
    .maybeSingle();

  if (!analista?.user_id || !analista.email) return [];

  return [{ user_id: analista.user_id, email: analista.email, nome_completo: analista.nome_completo }];
}
