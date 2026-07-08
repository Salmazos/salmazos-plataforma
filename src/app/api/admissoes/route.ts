import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { linkAdmissaoWhatsapp } from "@/lib/waLinks";

const TOKEN_VALIDADE_DIAS = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { candidato_id, vaga_id, modalidade, funcao, salario, horario_trabalho, data_admissao, entidade_contratante, adicionais, autorizacao_sindical } = parsed.data;

  const svc = createServiceClient();

  const tokenExpiraEm = new Date(Date.now() + TOKEN_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidato } = await svc
    .from("candidatos")
    .select("nome_completo, telefone, email, cargo_pretendido")
    .eq("id", candidato_id)
    .single();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .insert({
      candidato_id,
      vaga_id: vaga_id ?? null,
      modalidade,
      funcao,
      salario,
      horario_trabalho,
      data_admissao,
      entidade_contratante,
      criado_por: user.id,
      token_expira_em: tokenExpiraEm,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const documentosRows = DOCUMENTOS_ADMISSAO.map((doc) => ({
    admissao_id: admissao.id,
    tipo_documento: doc.tipo_documento,
    obrigatorio: doc.obrigatorio,
    condicional: doc.condicional,
  }));

  const { error: docsError } = await svc.from("admissao_documentos").insert(documentosRows);
  if (docsError) return NextResponse.json({ error: docsError.message }, { status: 400 });

  if (adicionais && adicionais.length > 0) {
    const adicionaisRows = adicionais.map((a) => ({
      admissao_id: admissao.id,
      tipo: a.tipo,
      formato_valor: a.formato_valor,
      valor: a.valor,
    }));
    const { error: adicionaisError } = await svc.from("admissao_adicionais").insert(adicionaisRows);
    if (adicionaisError) return NextResponse.json({ error: adicionaisError.message }, { status: 400 });
  }

  if (autorizacao_sindical) {
    const { error: asError } = await svc.from("admissao_autorizacao_sindical").insert({
      admissao_id: admissao.id,
      nome_sindicato: autorizacao_sindical.nome_sindicato ?? null,
      autoriza_assistencial_confederativa: autorizacao_sindical.autoriza_assistencial_confederativa,
      autoriza_sindical: autorizacao_sindical.autoriza_sindical,
    });
    if (asError) return NextResponse.json({ error: asError.message }, { status: 400 });
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_criada",
    entidade: "admissoes",
    entidade_id: admissao.id,
    detalhes: { candidato_id, vaga_id: vaga_id ?? null, modalidade, funcao, salario, horario_trabalho, data_admissao },
  });

  const url = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/admissao/${admissao.token}`;

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
    sendEmail({ to: candidato.email, subject, html, tipo: "admissao_link", candidato_id, vaga_id: vaga_id ?? undefined });
  }

  return NextResponse.json({ data: admissao, url, whatsappUrl });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
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

  if (status) query = query.eq("status", status);
  if (modalidade) query = query.eq("modalidade", modalidade);
  if (candidatoId) query = query.eq("candidato_id", candidatoId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data });
}
