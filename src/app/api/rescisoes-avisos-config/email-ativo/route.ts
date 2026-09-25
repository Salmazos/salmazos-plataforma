import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, rescisaoAvisosEmailAtivoSchema } from "@/lib/schemas";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { setConfiguracaoGeral } from "@/lib/configuracoesGerais";
import { CHAVE_AVISOS_EMAIL_RESCISAO } from "@/lib/dispararAvisosRescisao";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(rescisaoAvisosEmailAtivoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await setConfiguracaoGeral(CHAVE_AVISOS_EMAIL_RESCISAO, String(parsed.data.ativo), user.id);
  if (error) return NextResponse.json({ error }, { status: 500 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "rescisao_avisos_email_ativo_alterado",
    entidade: "configuracoes_gerais",
    entidade_id: CHAVE_AVISOS_EMAIL_RESCISAO,
    detalhes: { ativo: parsed.data.ativo },
  });

  return NextResponse.json({ ativo: parsed.data.ativo });
}
