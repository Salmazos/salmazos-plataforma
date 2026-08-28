import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, candidatoUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario, diffCampos } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(candidatoUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const camposAtualizados = {
    nome_completo: parsed.data.nome_completo,
    telefone: parsed.data.telefone,
    email: parsed.data.email,
    cpf: parsed.data.cpf,
    cidade: parsed.data.cidade,
    estado: parsed.data.estado,
    cargo_pretendido: parsed.data.cargo_pretendido,
    tempo_experiencia: parsed.data.tempo_experiencia,
    turno_disponivel: parsed.data.turno_disponivel,
    pretensao_salarial: parsed.data.pretensao_salarial ?? null,
    idade: parsed.data.idade ?? null,
    formacao_academica: parsed.data.formacao_academica ?? null,
    resumo_profissional: parsed.data.resumo_profissional ?? null,
    experiencias_profissionais: parsed.data.experiencias_profissionais ?? null,
  };

  // Snapshot pré-update pra auditoria (diff antes/depois) — mesmo padrão de
  // dados-pessoais/route.ts e reprovar/route.ts. Sem isso, uma edição de e-mail (ou
  // qualquer outro campo sensível) aqui não deixava nenhum rastro de quem alterou o quê.
  // Isolado em try/catch: se essa consulta falhar (ex. erro de rede), a auditoria fica
  // incompleta mas a atualização do candidato — o efeito principal da rota — não pode ser
  // impedida por causa disso.
  let antes: Record<string, unknown> | null = null;
  try {
    const { data } = await svc.from("candidatos").select("*").eq("id", id).maybeSingle();
    antes = data;
  } catch (err) {
    console.error("[PATCH /api/candidatos/[id]] falha ao buscar snapshot pré-update", err);
  }

  const { data, error } = await svc
    .from("candidatos")
    .update(camposAtualizados)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/candidatos/[id]]", JSON.stringify(error));
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const diff = diffCampos(antes, camposAtualizados);
  if (Object.keys(diff).length > 0) {
    let usuarioNome: string | null = user.email ?? null;
    try {
      usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, svc);
    } catch (err) {
      console.error("[PATCH /api/candidatos/[id]] falha ao resolver nome do usuário", err);
    }
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "candidato_editado",
      entidade: "candidatos",
      entidade_id: id,
      detalhes: { diff },
    });
  }

  return NextResponse.json({ data });
}
