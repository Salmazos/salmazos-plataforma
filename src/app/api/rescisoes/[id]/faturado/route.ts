import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, rescisaoFaturadoSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Rota dedicada (mesmo padrão de /api/cobrancas-rs/[id]/vencimento) para o toggle rápido
// de "Faturado" direto na tabela, sem passar pelo modal de edição completo. O modal
// completo (PATCH /api/rescisoes/[id]) também aceita `faturado` no corpo — os dois
// caminhos escrevem a mesma coluna com a mesma validação (z.boolean()), só a rota isolada
// evita mandar o payload inteiro da rescisão pra mudar um único campo a partir da tabela.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(rescisaoFaturadoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data, error } = await svc
    .from("rescisoes")
    .update({ faturado: parsed.data.faturado })
    .eq("id", id)
    .select("*, funcionarios(nome_completo, cargo)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "rescisao_faturado_alterado",
    entidade: "rescisoes",
    entidade_id: id,
    detalhes: { faturado: parsed.data.faturado },
  });

  return NextResponse.json({ data });
}
