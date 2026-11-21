import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { previaMotSchema } from "@/lib/propostaMot";
import { previaMot } from "@/lib/propostaServico";

// Prévia do cálculo da proposta MOT para a tela de Nova proposta: recebe os salários (em centavos) e devolve a planilha de cada função, o total mensal e a
// data da vigência usada. NÃO grava nada e NUNCA devolve os percentuais (só a diretoria os lê, em mot/parametros). Aberta a quem pode escrever em Propostas.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const r = await exigirContextoPropostas(user);
  if (r.erro) return r.erro;

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return NextResponse.json({ error: "Informe os salários das funções." }, { status: 400 });
  const parsed = previaMotSchema.safeParse(corpo);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });

  const res = await previaMot(createServiceClient(), r.ctx, parsed.data.salarios_centavos);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.data });
}
