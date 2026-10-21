import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { varrerVencidas } from "@/lib/propostaServico";

// Painel de gestão: só gestor (diretoria/superuser), somente leitura, restrito à unidade quando não tem acesso a todas.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.gestor) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  await varrerVencidas(svc, hoje);

  let query = svc.from("propostas").select("id, modelo, situacao, vendedor_id, valor_estimado, validade_ate");
  if (!ctx.todasUnidades && ctx.unidadeId) query = query.eq("unidade_id", ctx.unidadeId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porSituacao: Record<string, number> = {};
  const porModelo: Record<string, number> = {};
  const porVendedor = new Map<string, { total: number; abertas: number; aceitas: number; valor_aceito: number }>();
  for (const p of data ?? []) {
    porSituacao[p.situacao] = (porSituacao[p.situacao] ?? 0) + 1;
    porModelo[p.modelo] = (porModelo[p.modelo] ?? 0) + 1;
    const v = porVendedor.get(p.vendedor_id) ?? { total: 0, abertas: 0, aceitas: 0, valor_aceito: 0 };
    v.total += 1;
    if (p.situacao === "enviada" || p.situacao === "em_negociacao") v.abertas += 1;
    if (p.situacao === "aceita") {
      v.aceitas += 1;
      v.valor_aceito += Number(p.valor_estimado) || 0;
    }
    porVendedor.set(p.vendedor_id, v);
  }
  const ids = [...porVendedor.keys()];
  const { data: nomes } = ids.length ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", ids) : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((nomes ?? []).map((n) => [n.id, n.nome_completo]));

  return NextResponse.json({
    hoje,
    total: (data ?? []).length,
    por_situacao: porSituacao,
    por_modelo: porModelo,
    por_vendedor: ids.map((id) => ({ vendedor_id: id, vendedor_nome: nomePorId.get(id) ?? null, ...porVendedor.get(id) })),
  });
}
