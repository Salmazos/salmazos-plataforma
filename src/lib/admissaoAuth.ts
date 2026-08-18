import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Admissão Digital lida com dados sensíveis (CPF, RG, endereço, dados bancários, PIX) —
// acesso restrito por padrão a superuser/diretoria/supervisor/dp (Fase 2b — migrado pro
// sistema central de exceção, ver podeAcessarAba). "analista" foi removido de propósito
// (revertido depois de ter sido liberado por engano numa sessão anterior) e não deve voltar
// a ter acesso por papel — mas agora pode ser liberado individualmente via exceção em
// usuario_acesso_customizado (chave_aba "rh_admissoes") sem reabrir pra todo mundo. Toda
// rota administrativa do módulo (tudo em src/app/api/admissoes/** exceto o namespace
// público token/[token]/**, que não passa por aqui), a página (src/app/painel/admissoes/**)
// e o Sidebar (canAccessAdmissoes em painel/layout.tsx) usam a MESMA função
// podeAcessarAdmissoes, pra nunca divergir entre o que o menu mostra, a tela libera e a API
// aceita.
export const PAPEIS_PAINEL_ADMISSOES = ["superuser", "diretoria", "supervisor", "dp"];

export async function podeAcessarAdmissoes(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_PAINEL_ADMISSOES.includes(role);
  return podeAcessarAba(user, "rh_admissoes", comportamentoPadrao);
}

export async function checarPapelAdmissoes(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarAdmissoes(user))) {
    return NextResponse.json({ error: "Acesso restrito à equipe de RH." }, { status: 403 });
  }
  return null;
}

// Restrição decidida com o negócio: só quem tem um desses cargos em
// analistas_perfil.cargo pode ser o signatário "Contratante" (pela empresa) no pacote de
// assinatura eletrônica da contabilidade via ZapSign (ver montar-enviar/route.ts). Quem
// processa a admissão mas não tem esse cargo precisa delegar pra um diretor ativo (ver
// diretores-disponiveis/route.ts). `cargo` é texto livre no banco (sem enum/CHECK) — esta
// comparação é exata e sensível a variação de grafia futura (ex.: "Diretor(a)", cargo
// composto) — se alguém cadastrar um diretor com um texto de cargo diferente destes dois,
// essa pessoa não vai aparecer na lista de signatários disponíveis.
export const CARGOS_DIRETORIA = ["Diretor", "Diretora"];

export function ehCargoDiretoria(cargo: string | null | undefined): boolean {
  return !!cargo && CARGOS_DIRETORIA.includes(cargo);
}
