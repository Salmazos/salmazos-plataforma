import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoCreateSchema } from "@/lib/schemas";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import { podeVerUnidade } from "@/lib/unidadeAuth";
import { criarAdmissaoSemEnvio } from "@/lib/admissaoCriacao";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { linkAdmissaoWhatsapp } from "@/lib/waLinks";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { candidato_id, vaga_id } = parsed.data;

  const svc = createServiceClient();

  // Admissão fica na unidade da VAGA (o RH é centralizado em Monte Mor, mas o registro
  // precisa dizer de qual unidade é). Sem vaga não dá pra saber a unidade — recusa em vez de
  // cair no DEFAULT do banco (Monte Mor); o único formulário que cria admissão
  // (ModalIniciarAdmissao) sempre manda a vaga.
  if (!vaga_id) return NextResponse.json({ error: "Admissão precisa estar vinculada a uma vaga." }, { status: 400 });
  const { data: vaga } = await svc.from("vagas").select("unidade_id").eq("id", vaga_id).maybeSingle();
  if (!vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 400 });
  // RH por unidade: supervisor só inicia admissão em vaga da própria unidade.
  const ctxRH = await contextoRH(user);
  if (!ctxRH || !podeVerUnidade(ctxRH, vaga.unidade_id)) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 400 });

  const { data: candidato } = await svc
    .from("candidatos")
    .select("nome_completo, telefone, email, cargo_pretendido")
    .eq("id", candidato_id)
    .single();

  const criada = await criarAdmissaoSemEnvio(svc, {
    dados: parsed.data,
    unidadeId: vaga.unidade_id,
    usuario: { id: user.id, nome: user.email ?? null },
  });
  if (!criada.ok) return NextResponse.json({ error: criada.error }, { status: 400 });
  const { admissao, url } = criada;

  // Envio (e-mail + link de WhatsApp) é só deste endpoint: a criação em si não envia nada.
  let whatsappUrl: string | null = null;
  if (candidato?.telefone) {
    whatsappUrl = linkAdmissaoWhatsapp(candidato.nome_completo, candidato.telefone, candidato.cargo_pretendido, url);
  }

  if (candidato?.email) {
    const { subject, html } = getEmailTemplate("admissao_link", {
      nome: candidato.nome_completo,
      cargo: candidato.cargo_pretendido,
      admissaoUrl: url,
    });
    try {
      await sendEmail({ to: candidato.email, subject, html, tipo: "admissao_link", candidato_id, vaga_id: vaga_id ?? undefined });
    } catch (emailErr) {
      console.error(`[admissoes] Erro ao enviar e-mail de link de admissão (candidato_id=${candidato_id}):`, emailErr);
    }
  }

  return NextResponse.json({ data: admissao, url, whatsappUrl });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const modalidade = searchParams.get("modalidade");
  const candidatoId = searchParams.get("candidato_id");

  const svc = createServiceClient();
  let query = svc
    .from("admissoes")
    .select("*, candidatos(id, nome_completo, cargo_pretendido), vagas(id, titulo)")
    .order("criado_em", { ascending: false });
  // RH por unidade: supervisor só lista as admissões da própria unidade.
  const ctx = await contextoRH(user);
  if (!ctx) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);

  if (status) query = query.eq("status", status);
  if (modalidade) query = query.eq("modalidade", modalidade);
  if (candidatoId) query = query.eq("candidato_id", candidatoId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data });
}
