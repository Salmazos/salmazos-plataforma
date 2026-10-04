import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { TIPOS_PEDIDO_CLIENTE, type TipoPedidoCliente } from "@/lib/pedidosClientePopup";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marca como dispensados, para este usuário, exatamente os pedidos que o popup estava mostrando
// (ou só o clicado). Mesmo padrão de /api/indicacoes-popup/marcar-visto, com o tipo junto do id
// porque os pedidos moram em tabelas diferentes.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const brutos: unknown[] = Array.isArray(body?.itens) ? body.itens : [];
  const itens: { tipo: TipoPedidoCliente; id: string }[] = [];
  for (const i of brutos) {
    const tipo = (i as { tipo?: unknown })?.tipo;
    const id = (i as { id?: unknown })?.id;
    if (typeof tipo === "string" && (TIPOS_PEDIDO_CLIENTE as readonly string[]).includes(tipo) && typeof id === "string" && UUID.test(id)) {
      itens.push({ tipo: tipo as TipoPedidoCliente, id });
    }
  }
  if (itens.length === 0) return NextResponse.json({ success: true });

  const svc = createServiceClient();
  const { error } = await svc
    .from("pedido_cliente_popup_vistos")
    .upsert(
      itens.map((i) => ({ usuario_id: user.id, tipo_pedido: i.tipo, pedido_id: i.id })),
      { onConflict: "usuario_id,tipo_pedido,pedido_id", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
