import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, propostaSituacaoSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { carregarProposta, ehDonoDaProposta, mudarSituacao, podeVerProposta, varrerVencidas } from "@/lib/propostaServico";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const svc = createServiceClient();
  // Uma proposta vencida não deve aceitar "aceita/recusada" como se ainda estivesse valendo: vence antes de decidir.
  await varrerVencidas(svc, hojeSaoPaulo(), id);
  const proposta = await carregarProposta(svc, id);
  if (!proposta || !podeVerProposta(ctx, proposta)) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  if (!ehDonoDaProposta(ctx, proposta)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const parsed = parseBody(propostaSituacaoSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const r = await mudarSituacao(svc, ctx, proposta, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data, aviso: r.aviso ?? null });
}
