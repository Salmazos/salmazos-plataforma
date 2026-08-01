import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Admissão Digital lida com dados sensíveis (CPF, RG, endereço, dados bancários, PIX) —
// acesso restrito a superuser/diretoria/supervisor/dp. "analista" foi removido de propósito
// (revertido depois de ter sido liberado por engano numa sessão anterior) e não deve voltar
// a ter acesso, nem pela tela (ver gates em src/app/painel/admissoes/**/page.tsx e
// requireSupervisor em SidebarMenu.tsx) nem por chamada direta à API — por isso toda rota
// administrativa do módulo (tudo em src/app/api/admissoes/** exceto o namespace
// público token/[token]/**, que não passa por aqui) precisa chamar isto depois do
// `if (!user)`.
// 'dp' foi incluído no mesmo nível de supervisor: a admissão digital alimenta a criação
// automática de `funcionarios` (ver gerar-pdf/route.ts), então quem cuida do Departamento
// Pessoal precisa poder acompanhar/gerenciar admissões, não só a lista de funcionários.
// Exportado (não só privado a este arquivo) pelo mesmo motivo do gêmeo em
// funcionariosAuth.ts: painel/layout.tsx precisa desta MESMA lista pra computar
// canAccessAdmissoes (flag que decide se o link "Admissões" aparece no Sidebar) — uma
// cópia solta ali divergiria silenciosamente do gate real desta função algum dia.
export const PAPEIS_PAINEL_ADMISSOES = ["superuser", "diretoria", "supervisor", "dp"];

export function checarPapelAdmissoes(user: User): NextResponse | null {
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_ADMISSOES.includes(role)) {
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
