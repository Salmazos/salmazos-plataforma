import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsVencimentoSchema } from "@/lib/schemas";
import { podeRevisarCobranca } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Rota dedicada (não o PATCH genérico de /api/cobrancas-rs/[id]) porque aquele bloqueia
// qualquer edição fora de status='pendente_revisao' — trava proposital pra congelar
// cargo/salário/CNPJ/endereço depois da aprovação. Vencimento é um campo operacional à
// parte, editável a qualquer momento até a cobrança ser marcada como paga.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(cobrancaRsVencimentoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data_vencimento } = parsed.data;

  const svc = createServiceClient();

  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status, gerado_por_user_id")
    .eq("id", id)
    .single();

  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  const pode = await podeRevisarCobranca(user, atual);
  if (!pode) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  if (atual.status === "paga") {
    return NextResponse.json({ error: "Esta cobrança já foi paga — o vencimento não pode mais ser alterado." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({ data_vencimento: data_vencimento || null })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "cobranca_rs_vencimento_definido",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: { data_vencimento: data_vencimento || null },
  });

  return NextResponse.json({ data });
}
