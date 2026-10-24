import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, solicitacaoLinkCreateSchema, solicitacaoLinkRevogarSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { urlSite } from "@/lib/siteUrl";
import { MAX_USOS_LINK, calcularExpiraEm, statusDoLink } from "@/lib/solicitacaoVagaLink";
import { lerCondicoesDoLink } from "@/lib/solicitacaoVagaCondicoes";
import { inserirComTokenNovo } from "@/lib/solicitacaoVagaToken";
import type { LinkSolicitacao } from "@/lib/solicitacaoVagaLinkServidor";

// Links públicos de solicitação de vaga (cliente novo, sem acesso ao portal). Mesmo guard de /api/solicitacoes-vagas: sessão do
// analista + contexto de unidade. O link nasce na unidade de quem gera (sem seletor) e é listado só dessa unidade.

function serializar(link: LinkSolicitacao) {
  const { condicoes, clausulas } = lerCondicoesDoLink(link);
  return {
    id: link.id,
    url: urlSite(`/solicitar-vaga/${link.token}`),
    nome_empresa: link.nome_empresa,
    status: statusDoLink(link, new Date()),
    usos: link.usos,
    max_usos: MAX_USOS_LINK,
    expira_em: link.expira_em,
    revogado_em: link.revogado_em,
    created_at: link.created_at,
    criado_por_nome: link.criado_por_nome,
    condicoes,
    clausulas_adicionais: clausulas,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const service = createServiceClient();
  const { data, error } = await service
    .from("solicitacao_vaga_links")
    .select("*")
    .eq("unidade_id", ctx.unidadeId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Não foi possível carregar os links." }, { status: 500 });
  return NextResponse.json({ data: ((data ?? []) as LinkSolicitacao[]).map(serializar) });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const parsed = parseBody(solicitacaoLinkCreateSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { nome_empresa, validade_dias, condicoes, clausulas_adicionais } = parsed.data;

  const service = createServiceClient();
  const criadoPorNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? null;
  const nomeEmpresa = nome_empresa?.trim() || null;

  // Token novo a cada tentativa: colisão no índice único gera outra tentativa (no máximo 3).
  const { data, error } = await inserirComTokenNovo<LinkSolicitacao>(nomeEmpresa, (token) =>
    service
      .from("solicitacao_vaga_links")
      .insert({
        token,
        unidade_id: ctx.unidadeId,
        nome_empresa: nomeEmpresa,
        criado_por_user_id: user.id,
        criado_por_nome: criadoPorNome,
        expira_em: calcularExpiraEm(new Date(), validade_dias),
        condicoes,
        clausulas_adicionais,
      })
      .select("*")
      .single()
  );
  if (error || !data) {
    // Só o código do erro: nada que possa carregar o token ou dados do link.
    console.error("[POST /api/solicitacoes-vagas/links]", error?.code ?? "sem código");
    return NextResponse.json({ error: "Não foi possível gerar o link." }, { status: 500 });
  }

  // Só o id e as condições — nunca o token (ele é a chave de acesso do link).
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: criadoPorNome,
    acao: "solicitacao_link_criado",
    entidade: "solicitacao_vaga_links",
    entidade_id: data.id,
    detalhes: { validade_dias, condicoes, clausulas_adicionais },
  });

  return NextResponse.json({ data: serializar(data as LinkSolicitacao) }, { status: 201 });
}

async function revogar(user: { id: string; email?: string | null }, id: string) {
  const { ctx, erro } = await obterContextoUnidade(user as Parameters<typeof obterContextoUnidade>[0]);
  if (erro) return erro;

  const service = createServiceClient();
  const { data: link } = await service.from("solicitacao_vaga_links").select("*").eq("id", id).maybeSingle();
  // Link de outra unidade responde igual a inexistente.
  if (!link || !podeVerUnidade(ctx, link.unidade_id)) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }
  if (link.revogado_em) return NextResponse.json({ data: serializar(link as LinkSolicitacao) });

  const { data, error } = await service
    .from("solicitacao_vaga_links")
    .update({ revogado_em: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível revogar o link." }, { status: 500 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, service),
    acao: "solicitacao_link_revogado",
    entidade: "solicitacao_vaga_links",
    entidade_id: id,
    detalhes: { link_id: id },
  });
  return NextResponse.json({ data: serializar(data as LinkSolicitacao) });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = parseBody(solicitacaoLinkRevogarSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return revogar(user, parsed.data.id);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = parseBody(solicitacaoLinkRevogarSchema, { id: request.nextUrl.searchParams.get("id") });
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return revogar(user, parsed.data.id);
}
