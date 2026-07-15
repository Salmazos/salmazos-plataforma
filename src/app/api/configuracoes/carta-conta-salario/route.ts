import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, configCartaBancoSchema } from "@/lib/schemas";
import { getConfiguracoesGerais, setConfiguracaoGeral } from "@/lib/configuracoesGerais";

const CHAVE_PARA = "carta_conta_salario_destinatarios_para";
const CHAVE_CC = "carta_conta_salario_destinatarios_cc";
const CHAVE_RESPONSAVEL = "carta_conta_salario_responsavel_rh_user_id";

// Leitura liberada pra qualquer perfil com acesso ao módulo de Admissões (é quem abre o
// modal da carta e precisa dos destinatários padrão) — só a escrita (PATCH) é restrita
// a superuser, que é quem vê o item "Carta de Abertura de Conta" em Configurações.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const config = await getConfiguracoesGerais([CHAVE_PARA, CHAVE_CC, CHAVE_RESPONSAVEL]);
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
    para: config[CHAVE_PARA] ?? "",
    cc: config[CHAVE_CC] ?? "",
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

  const updates: { chave: string; valor: string | null }[] = [];
  if (parsed.data.para !== undefined) updates.push({ chave: CHAVE_PARA, valor: parsed.data.para.trim() || null });
  if (parsed.data.cc !== undefined) updates.push({ chave: CHAVE_CC, valor: parsed.data.cc.trim() || null });
  if (parsed.data.responsavel_rh_user_id !== undefined) {
    updates.push({ chave: CHAVE_RESPONSAVEL, valor: parsed.data.responsavel_rh_user_id });
  }

  for (const u of updates) {
    const { error } = await setConfiguracaoGeral(u.chave, u.valor, user.id);
    if (error) return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
