import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, contatoEmpresaUpdateSchema } from "@/lib/schemas";
import { exigirContextoComercial, podeEscreverNaUnidade } from "@/lib/comercial";

// Escrita só por vendedor, em empresa da própria unidade (service client ignora RLS).
async function carregar(id: string, contatoId: string, ctx: Parameters<typeof podeEscreverNaUnidade>[0]) {
  const svc = createServiceClient();
  const { data: empresa } = await svc.from("empresas_visitadas").select("id, unidade_id").eq("id", id).maybeSingle();
  if (!empresa || !podeEscreverNaUnidade(ctx, empresa.unidade_id)) return { svc, empresa: null, contato: null };
  const { data: contato } = await svc
    .from("empresa_contatos")
    .select("id, nome, cargo, telefone, email, principal, created_at")
    .eq("id", contatoId)
    .eq("empresa_visitada_id", id)
    .maybeSingle();
  return { svc, empresa, contato };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; contatoId: string }> }) {
  const { id, contatoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não edita contatos." }, { status: 403 });

  const { svc, empresa, contato } = await carregar(id, contatoId, ctx);
  if (!empresa || !contato) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const parsed = parseBody(contatoEmpresaUpdateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.nome !== undefined) campos.nome = d.nome;
  for (const k of ["cargo", "telefone", "email"] as const) {
    if (d[k] !== undefined) campos[k] = d[k] || null;
  }

  if (d.principal === false && contato.principal) {
    return NextResponse.json({ error: "Defina outro contato como principal para trocar." }, { status: 400 });
  }

  if (d.principal === true && !contato.principal) {
    // Índice único parcial (um principal por empresa): desmarca o atual antes de marcar este.
    const { data: atual } = await svc
      .from("empresa_contatos")
      .select("id")
      .eq("empresa_visitada_id", id)
      .eq("principal", true)
      .neq("id", contatoId)
      .maybeSingle();
    if (atual) {
      const { error: e1 } = await svc.from("empresa_contatos").update({ principal: false, updated_at: campos.updated_at }).eq("id", atual.id);
      if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });
    }
    campos.principal = true;
    const { data, error } = await svc.from("empresa_contatos").update(campos).eq("id", contatoId).eq("empresa_visitada_id", id).select("id, nome, cargo, telefone, email, principal").single();
    if (error) {
      // Restaura o principal anterior para a empresa não ficar sem principal.
      if (atual) await svc.from("empresa_contatos").update({ principal: true }).eq("id", atual.id);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  }

  const { data, error } = await svc.from("empresa_contatos").update(campos).eq("id", contatoId).eq("empresa_visitada_id", id).select("id, nome, cargo, telefone, email, principal").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; contatoId: string }> }) {
  const { id, contatoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não exclui contatos." }, { status: 403 });

  const { svc, empresa, contato } = await carregar(id, contatoId, ctx);
  if (!empresa || !contato) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const { data: emUso } = await svc
    .from("oportunidades")
    .select("id")
    .eq("empresa_visitada_id", id)
    .eq("contato_id", contatoId)
    .not("etapa", "in", "(ganho,perdido)")
    .limit(1)
    .maybeSingle();
  if (emUso) {
    return NextResponse.json({ error: "Este contato está em uma oportunidade aberta. Troque o contato da oportunidade antes de excluir." }, { status: 409 });
  }

  const { error } = await svc.from("empresa_contatos").delete().eq("id", contatoId).eq("empresa_visitada_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Era o principal e sobraram outros: o mais antigo assume.
  if (contato.principal) {
    const { data: proximo } = await svc
      .from("empresa_contatos")
      .select("id")
      .eq("empresa_visitada_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (proximo) await svc.from("empresa_contatos").update({ principal: true, updated_at: new Date().toISOString() }).eq("id", proximo.id);
  }
  return NextResponse.json({ success: true });
}
