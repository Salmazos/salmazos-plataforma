import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoDadosPessoaisAdminUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Rota do RH — hoje só cobre "Data do exame admissional", único campo de
// admissao_dados_pessoais que o RH preenche depois do link já ter sido gerado
// (os demais campos dessa tabela são preenchidos pelo próprio candidato).
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(admissaoDadosPessoaisAdminUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data, error } = await svc
    .from("admissao_dados_pessoais")
    .upsert({ admissao_id: id, ...parsed.data }, { onConflict: "admissao_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_atualizada",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: parsed.data,
  });

  return NextResponse.json({ data });
}
