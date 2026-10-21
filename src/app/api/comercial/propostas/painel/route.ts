import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { varrerVencidas } from "@/lib/propostaServico";
import { calcularValidadeAte } from "@/lib/propostas";

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

  let query = svc.from("propostas").select("id, numero, cliente_nome, modelo, situacao, vendedor_id, valor_estimado, validade_ate");
  if (!ctx.todasUnidades && ctx.unidadeId) query = query.eq("unidade_id", ctx.unidadeId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porSituacao: Record<string, number> = {};
  const porModelo: Record<string, number> = {};
  const porVendedor = new Map<string, { total: number; abertas: number; valor_aberto: number; aceitas: number; valor_aceito: number }>();
  let valorEmAberto = 0;
  const limiteVencimento = calcularValidadeAte(hoje, 7);
  const vencendo: { id: string; numero: string; cliente_nome: string; validade_ate: string; vendedor_id: string }[] = [];
  for (const p of data ?? []) {
    porSituacao[p.situacao] = (porSituacao[p.situacao] ?? 0) + 1;
    porModelo[p.modelo] = (porModelo[p.modelo] ?? 0) + 1;
    const v = porVendedor.get(p.vendedor_id) ?? { total: 0, abertas: 0, valor_aberto: 0, aceitas: 0, valor_aceito: 0 };
    v.total += 1;
    if (p.situacao === "enviada" || p.situacao === "em_negociacao") {
      v.abertas += 1;
      v.valor_aberto += Number(p.valor_estimado) || 0;
      valorEmAberto += Number(p.valor_estimado) || 0;
      if (p.validade_ate && p.validade_ate <= limiteVencimento) {
        vencendo.push({ id: p.id, numero: p.numero, cliente_nome: p.cliente_nome, validade_ate: p.validade_ate, vendedor_id: p.vendedor_id });
      }
    }
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
    valor_em_aberto: valorEmAberto,
    por_vendedor: ids.map((id) => ({ vendedor_id: id, vendedor_nome: nomePorId.get(id) ?? null, ...porVendedor.get(id) })),
    vencendo_em_7_dias: vencendo
      .sort((a, b) => a.validade_ate.localeCompare(b.validade_ate))
      .map((v) => ({ ...v, vendedor_nome: nomePorId.get(v.vendedor_id) ?? null })),
  });
}
