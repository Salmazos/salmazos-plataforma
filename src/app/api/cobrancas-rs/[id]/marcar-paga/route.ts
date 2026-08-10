import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const temAcesso = await checarAcessoCobrancaRS(user);
  if (!temAcesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const { id } = await params;
  const svc = createServiceClient();

  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status")
    .eq("id", id)
    .single();

  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  if (atual.status !== "aprovada_enviada") {
    return NextResponse.json({ error: "Só é possível marcar como paga uma cobrança já enviada." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({ status: "paga", pago_em: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "cobranca_rs_marcada_paga",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: { cliente: data.cliente_nome_snapshot, candidato: data.candidato_nome_snapshot },
  });

  return NextResponse.json({ data });
}
