import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALISTA_UNIDADE_SLUG } from "@/lib/constants";
import { apelidoDoNomeCompleto } from "@/lib/responsaveis";

export interface PerfilResponsavel {
  id: string;
  user_id: string | null;
  email: string | null;
}

// Login ativo de um responsável gravado por nome (candidatos.responsavel guarda o nome
// completo). Existe porque o mesmo nome pode ter mais de um login ativo — a Susana tem um
// antigo de analista em Monte Mor e o atual de supervisora em SBC (mantidos os dois a pedido
// do Olver, 25/09) — e o .maybeSingle() direto falhava com dois resultados: dava
// "Responsável inválido" ao atribuir e o aviso ao responsável se perdia. Com mais de um,
// vale o login da unidade do time dela (ANALISTA_UNIDADE_SLUG).
export async function buscarPerfilResponsavel(
  supabase: SupabaseClient,
  nomeCompleto: string
): Promise<PerfilResponsavel | null> {
  const { data } = await supabase
    .from("analistas_perfil")
    .select("id, user_id, email, unidades(slug)")
    .eq("nome_completo", nomeCompleto)
    .eq("ativo", true);
  if (!data || data.length === 0) return null;

  let escolhido = data[0];
  if (data.length > 1) {
    const apelido = apelidoDoNomeCompleto(nomeCompleto);
    const slug = apelido ? ANALISTA_UNIDADE_SLUG[apelido] : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    escolhido = data.find((p) => (p.unidades as any)?.slug === slug) ?? data[0];
  }
  return { id: escolhido.id, user_id: escolhido.user_id, email: escolhido.email };
}
