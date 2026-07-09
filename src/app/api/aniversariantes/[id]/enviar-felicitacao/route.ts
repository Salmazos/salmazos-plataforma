import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, aniversarianteFelicitacaoSchema } from "@/lib/schemas";
import { sendEmail } from "@/lib/sendEmail";
import { envolucroAniversario, escapeHtml } from "@/lib/emailAniversarioTemplate";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

// GET: última felicitação enviada pra esse contato neste ano (se houver) — usado pela UI
// pra mostrar o aviso não-bloqueante "já foi enviada em [data] por [nome]" ao abrir o modal.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const anoAtual = obterDataHojeBrasil().getFullYear();
  const inicioAno = `${anoAtual}-01-01T00:00:00-03:00`;
  const inicioAnoSeguinte = `${anoAtual + 1}-01-01T00:00:00-03:00`;

  const { data: ultima, error } = await svc
    .from("aniversario_felicitacoes_enviadas")
    .select("enviado_em, enviado_por")
    .eq("contato_id", id)
    .gte("enviado_em", inicioAno)
    .lt("enviado_em", inicioAnoSeguinte)
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ultima) return NextResponse.json({ ultima_felicitacao: null });

  let enviadoPorNome: string | null = null;
  if (ultima.enviado_por) {
    const { data: perfil } = await svc
      .from("analistas_perfil")
      .select("nome_completo")
      .eq("user_id", ultima.enviado_por)
      .maybeSingle();
    enviadoPorNome = perfil?.nome_completo ?? null;
  }

  return NextResponse.json({
    ultima_felicitacao: { enviado_em: ultima.enviado_em, enviado_por_nome: enviadoPorNome },
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(aniversarianteFelicitacaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const svc = createServiceClient();
    const { data: contato, error: errContato } = await svc
      .from("aniversariantes_contatos")
      .select("id, nome_contato, email")
      .eq("id", id)
      .single();

    if (errContato || !contato) {
      return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    }
    if (!contato.email) {
      return NextResponse.json({ error: "Este contato não tem e-mail cadastrado." }, { status: 400 });
    }

    const { assunto, corpo } = parsed.data;
    const corpoHtml = escapeHtml(corpo).replace(/\n/g, "<br>");
    const html = envolucroAniversario(
      "🎉 Feliz Aniversário!",
      `<div style="color:#111827;font-size:14px;line-height:1.6">${corpoHtml}</div>`
    );

    const resultado = await sendEmail({
      to: contato.email,
      subject: assunto,
      html,
      tipo: "aniversario_felicitacao_manual",
    });

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error ?? "Falha ao enviar e-mail." }, { status: 500 });
    }

    const { error: errLog } = await svc.from("aniversario_felicitacoes_enviadas").insert({
      contato_id: id,
      enviado_por: user.id,
      assunto,
      corpo,
    });
    if (errLog) {
      console.error("[POST /api/aniversariantes/[id]/enviar-felicitacao] Erro ao registrar log:", errLog.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/aniversariantes/[id]/enviar-felicitacao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
