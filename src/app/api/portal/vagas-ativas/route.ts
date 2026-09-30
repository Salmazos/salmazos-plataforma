import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

// Lista enxuta das vagas abertas do cliente — usada pelo formulário de Indicar Candidato
// pra ele escolher em qual vaga o candidato indicado entra. Só "aberta": não faz sentido
// indicar candidato pra vaga pausada/fechada/cancelada.
export async function GET() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();

  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  // Avaliação Psicológica fica de fora: não é uma vaga de contratação, não faz sentido
  // indicar candidato "pra registro" nela.
  const { data: vagas, error } = await service
    .from("vagas")
    .select("id, titulo, tipo_servico, cidade, estado")
    .eq("cliente_id", cu.cliente_id)
    .eq("status", "aberta")
    .neq("tipo_servico", "avaliacao_psicologica")
    .order("titulo", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: vagas ?? [] });
}
