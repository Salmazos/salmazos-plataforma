import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, contatoRegistroCreateSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo, podeEscreverNaUnidade } from "@/lib/comercial";
import { recalcularEmpresaVisitada } from "@/lib/carteiraClientes";

// Contato avulso: conversa/visita de relacionamento registrada na Carteira, SEM oportunidade.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não registra contatos." }, { status: 403 });

  const svc = createServiceClient();
  const { data: empresa } = await svc.from("empresas_visitadas").select("id, nome, unidade_id").eq("id", id).maybeSingle();
  if (!empresa || !podeEscreverNaUnidade(ctx, empresa.unidade_id)) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const parsed = parseBody(contatoRegistroCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const hoje = hojeSaoPaulo();
  const ocorridoEm = d.ocorrido_em ?? hoje;
  if (ocorridoEm > hoje) return NextResponse.json({ error: "A data do contato não pode ser no futuro." }, { status: 400 });
  if (d.proximo_contato_em && d.proximo_contato_em < hoje) {
    return NextResponse.json({ error: "A data para retornar não pode ser no passado." }, { status: 400 });
  }

  if (d.contato_id) {
    const { data: c } = await svc.from("empresa_contatos").select("id, empresa_visitada_id").eq("id", d.contato_id).maybeSingle();
    if (!c || c.empresa_visitada_id !== empresa.id) {
      return NextResponse.json({ error: "Esse contato não pertence à empresa." }, { status: 400 });
    }
  }

  const { data: registro, error } = await svc
    .from("contatos_registros")
    .insert({
      empresa_visitada_id: empresa.id,
      unidade_id: empresa.unidade_id,
      contato_id: d.contato_id ?? null,
      autor_id: ctx.analistaId,
      tipo: d.tipo,
      resultado: d.resultado ?? null,
      descricao: d.descricao || null,
      ocorrido_em: ocorridoEm,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (d.proximo_contato_em) {
    const { error: lembErr } = await svc.from("lembretes").insert({
      vendedor_id: ctx.analistaId,
      unidade_id: empresa.unidade_id,
      empresa_visitada_id: empresa.id,
      contato_id: d.contato_id ?? null,
      tipo: "retorno",
      data_lembrete: d.proximo_contato_em,
      texto: `Retornar contato com ${empresa.nome}`,
      status: "pendente",
    });
    if (lembErr) {
      // Sem o lembrete o registro ficaria pela metade: desfaz (best effort) e avisa.
      await svc.from("contatos_registros").delete().eq("id", registro.id);
      return NextResponse.json({ error: `Não foi possível criar o lembrete de retorno: ${lembErr.message}` }, { status: 500 });
    }
  }

  try {
    await recalcularEmpresaVisitada(svc, empresa.nome, empresa.unidade_id, empresa.id);
  } catch (err) {
    console.error("[POST /api/comercial/empresas/[id]/registros] Carteira não recalculada:", err);
  }
  return NextResponse.json({ data: registro }, { status: 201 });
}
