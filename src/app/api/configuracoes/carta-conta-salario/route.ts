import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, configCartaBancoSchema } from "@/lib/schemas";
import { getConfiguracoesGerais, setConfiguracaoGeral } from "@/lib/configuracoesGerais";

const CHAVE_RESPONSAVEL = "carta_conta_salario_responsavel_rh_user_id";

// Bloco 2 (Responsável pelo RH / assinatura) — o Bloco 1 (destinatários por banco
// parceiro) virou cadastro próprio em /api/configuracoes/bancos-parceiros.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const config = await getConfiguracoesGerais([CHAVE_RESPONSAVEL]);
  const responsavelUserId = config[CHAVE_RESPONSAVEL];

  let responsavelNome: string | null = null;
  let responsavelAssinaturaUrl: string | null = null;
  if (responsavelUserId) {
    const svc = createServiceClient();
    const { data } = await svc
      .from("analistas_perfil")
      .select("nome_completo, assinatura_url")
      .eq("user_id", responsavelUserId)
      .maybeSingle();
    responsavelNome = data?.nome_completo ?? null;
    responsavelAssinaturaUrl = data?.assinatura_url ?? null;
  }

  return NextResponse.json({
    responsavel_rh_user_id: responsavelUserId,
    responsavel_rh_nome: responsavelNome,
    responsavel_rh_assinatura_url: responsavelAssinaturaUrl,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (user.app_metadata?.role !== "superuser") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(configCartaBancoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (parsed.data.responsavel_rh_user_id !== undefined) {
    const { error } = await setConfiguracaoGeral(CHAVE_RESPONSAVEL, parsed.data.responsavel_rh_user_id, user.id);
    if (error) return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
