import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";
import { parseBody, funcionarioFotoUploadSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { BUCKET_FOTOS_FUNCIONARIO, pathFotoFuncionario, resolverFotosFuncionarios } from "@/lib/funcionarioFoto";

interface Params {
  params: Promise<{ id: string }>;
}

const EXTENSAO_POR_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const TAMANHO_MAXIMO_BYTES = 3 * 1024 * 1024; // 3MB — foto de rosto, nunca precisa ser maior.

// Upload direto (não signed-upload-url): quem sobe aqui é sempre o RH já autenticado no
// painel, com um arquivo pequeno — dispensa o fluxo em 2 etapas usado por ASO/Contrato
// (pensado pro candidato sem sessão no formulário público de admissão). Mesmo padrão de
// api/meu-perfil/avatar/route.ts, adaptado pro bucket privado (aqui a foto é de um terceiro,
// não do próprio usuário logado, então fica atrás de signed URL, nunca pública).
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id: funcionarioId } = await params;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, funcionarioId);
  if (bloqueioUnidade) return bloqueioUnidade;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(funcionarioFotoUploadSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const buffer = Buffer.from(parsed.data.base64, "base64");
  if (buffer.length > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ error: "Imagem muito grande. Máximo 3MB." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: funcionarioAntes } = await svc
    .from("funcionarios")
    .select("foto_path, admissao_id, nome_completo")
    .eq("id", funcionarioId)
    .maybeSingle();
  if (!funcionarioAntes) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });

  const extensao = EXTENSAO_POR_CONTENT_TYPE[parsed.data.contentType] ?? "jpg";
  const path = pathFotoFuncionario(funcionarioId, extensao);

  const { error: uploadError } = await svc.storage.from(BUCKET_FOTOS_FUNCIONARIO).upload(path, buffer, {
    contentType: parsed.data.contentType,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const fotoAnteriorPath = funcionarioAntes.foto_path;

  const { error: updateError } = await svc.from("funcionarios").update({ foto_path: path }).eq("id", funcionarioId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Substitui de verdade (não deixa órfão acumulando): só remove a anterior depois do update
  // confirmar, senão um upload que falhasse no meio deixaria o funcionário sem nenhuma foto.
  if (fotoAnteriorPath) {
    await svc.storage.from(BUCKET_FOTOS_FUNCIONARIO).remove([fotoAnteriorPath]);
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: fotoAnteriorPath ? "funcionario_foto_atualizada" : "funcionario_foto_enviada",
    entidade: "funcionarios",
    entidade_id: funcionarioId,
    detalhes: { nome_completo: funcionarioAntes.nome_completo },
  });

  const fotoUrlPorId = await resolverFotosFuncionarios([
    { id: funcionarioId, foto_path: path, admissao_id: funcionarioAntes.admissao_id },
  ]);

  return NextResponse.json({ fotoUrl: fotoUrlPorId.get(funcionarioId) ?? null });
}

// Remove a foto própria — funcionário volta a cair no fallback da Foto 3x4 da admissão
// (se existir) ou fica sem foto nenhuma, nunca é um "desfazer" pra uma foto anterior.
export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id: funcionarioId } = await params;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, funcionarioId);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();
  const { data: funcionario } = await svc
    .from("funcionarios")
    .select("foto_path, admissao_id, nome_completo")
    .eq("id", funcionarioId)
    .maybeSingle();
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (!funcionario.foto_path) return NextResponse.json({ error: "Funcionário não tem foto própria." }, { status: 400 });

  const { error: updateError } = await svc.from("funcionarios").update({ foto_path: null }).eq("id", funcionarioId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await svc.storage.from(BUCKET_FOTOS_FUNCIONARIO).remove([funcionario.foto_path]);

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_foto_removida",
    entidade: "funcionarios",
    entidade_id: funcionarioId,
    detalhes: { nome_completo: funcionario.nome_completo },
  });

  const fotoUrlPorId = await resolverFotosFuncionarios([
    { id: funcionarioId, foto_path: null, admissao_id: funcionario.admissao_id },
  ]);

  return NextResponse.json({ fotoUrl: fotoUrlPorId.get(funcionarioId) ?? null });
}
