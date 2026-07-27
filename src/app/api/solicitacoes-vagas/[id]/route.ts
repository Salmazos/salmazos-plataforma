import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

// Busca uma solicitação específica independente do status — usado pelo deep-link
// da notificação "nova_solicitacao_vaga" (que pode apontar pra uma solicitação já
// aprovada/recusada por outra pessoa desde que a notificação foi criada).
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("solicitacoes_vagas")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  return NextResponse.json({ data });
}
