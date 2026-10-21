import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";

// Contatos de uma empresa da Carteira para o campo A/C da proposta (só id, nome, cargo e principal).
// A empresa só é acessível se for da unidade do usuário (ou de qualquer uma, com acesso a todas as unidades).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });

  const svc = createServiceClient();
  const { data: empresa } = await svc.from("empresas_visitadas").select("id, unidade_id").eq("id", id).maybeSingle();
  const alcance = !!empresa && (ctx.todasUnidades || (!!ctx.unidadeId && empresa.unidade_id === ctx.unidadeId));
  if (!empresa || !alcance) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const { data, error } = await svc
    .from("empresa_contatos")
    .select("id, nome, cargo, principal")
    .eq("empresa_visitada_id", id)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
