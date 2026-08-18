import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes, ehCargoDiretoria, CARGOS_DIRETORIA } from "@/lib/admissaoAuth";

// Usado pela tela de montar/enviar o pacote da contabilidade (ModalUploadDocumentosContabilidade.tsx)
// pra decidir se mostra o seletor "Quem vai assinar pela empresa?" — só aparece quando o
// analista logado não tem cargo de diretoria (ver ehCargoDiretoria em lib/admissaoAuth.ts).
// Rota própria (não reaproveita GET /api/analistas) porque aquela é de uso geral (ver
// CandidatoCard.tsx) e não deve herdar essa lógica de filtro nem o gate de acesso deste
// módulo.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const { data: meuPerfil, error: meuPerfilError } = await svc
    .from("analistas_perfil")
    .select("cargo")
    .eq("user_id", user.id)
    .single();
  if (meuPerfilError || !meuPerfil) {
    return NextResponse.json({ error: "Perfil de analista não encontrado." }, { status: 404 });
  }

  const { data: diretores, error: diretoresError } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo, cargo")
    .eq("ativo", true)
    .in("cargo", CARGOS_DIRETORIA)
    .order("nome_completo");
  if (diretoresError) return NextResponse.json({ error: diretoresError.message }, { status: 500 });

  return NextResponse.json({
    souDiretor: ehCargoDiretoria(meuPerfil.cargo),
    diretores: diretores ?? [],
  });
}
