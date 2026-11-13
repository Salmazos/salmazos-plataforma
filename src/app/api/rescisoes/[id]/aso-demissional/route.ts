import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, rescisaoAsoDemissionalSchema } from "@/lib/schemas";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoRescisaoRH } from "@/lib/rhUnidadeAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { BUCKET_ASO, pathAsoDoFuncionario, registrarAnexoAsoDemissional } from "@/lib/asoDemissional";

interface Params {
  params: Promise<{ id: string }>;
}

// Anexa (ou substitui) o ASO demissional de uma rescisão já lançada, sem exigir nenhum outro campo dela.
// O arquivo já subiu direto pro Storage via aso-upload-url (signed URL); aqui só se confirma o caminho.
// ASO é dado de saúde: a auditoria guarda só ids/ação, nunca nome de arquivo nem conteúdo.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const bloqueioUnidade = await checarAcessoRescisaoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(rescisaoAsoDemissionalSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data: antes } = await svc
    .from("rescisoes")
    .select("id, funcionario_id, aso_documento_path")
    .eq("id", id)
    .maybeSingle();
  if (!antes) return NextResponse.json({ error: "Rescisão não encontrada." }, { status: 404 });

  if (!pathAsoDoFuncionario(parsed.data.path, antes.funcionario_id)) {
    return NextResponse.json({ error: "Arquivo do ASO inválido. Envie um PDF, JPG ou PNG." }, { status: 400 });
  }

  const campos: Record<string, unknown> = { aso_documento_path: parsed.data.path };
  if (parsed.data.data_exame !== undefined) campos.aso_demissional_data_exame = parsed.data.data_exame;

  const { data, error } = await svc
    .from("rescisoes")
    .update(campos)
    .eq("id", id)
    .select("*, funcionarios(nome_completo, cargo)")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Erro ao salvar o ASO." }, { status: 400 });

  // Substituição: o arquivo antigo só sai do Storage depois do update confirmado (mesmo padrão de PATCH /api/rescisoes/[id]).
  const substituiu = !!antes.aso_documento_path && antes.aso_documento_path !== parsed.data.path;
  if (substituiu) {
    const { error: removeError } = await svc.storage.from(BUCKET_ASO).remove([antes.aso_documento_path as string]);
    if (removeError) {
      console.error(`[rescisoes] ASO demissional substituído (rescisao_id=${id}), mas falha ao remover o arquivo antigo do Storage:`, removeError.message);
    }
  }

  const { primeiraVez } = await registrarAnexoAsoDemissional(svc, { rescisaoId: id, userId: user.id });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: substituiu ? "rescisao_aso_demissional_substituido" : "rescisao_aso_demissional_anexado",
    entidade: "rescisoes",
    entidade_id: id,
    detalhes: { funcionario_id: antes.funcionario_id, primeira_vez: primeiraVez, data_exame_informada: !!parsed.data.data_exame },
  });

  // Devolve a linha já com os carimbos gravados por registrarAnexoAsoDemissional.
  const { data: atualizada } = await svc
    .from("rescisoes")
    .select("*, funcionarios(nome_completo, cargo)")
    .eq("id", id)
    .single();

  return NextResponse.json({ data: atualizada ?? data });
}
