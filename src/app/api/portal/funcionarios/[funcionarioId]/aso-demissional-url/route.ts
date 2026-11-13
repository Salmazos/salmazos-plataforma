import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { BUCKET_ASO, pathAsoDoFuncionario } from "@/lib/asoDemissional";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// ASO DEMISSIONAL no portal (aba Rescindidos). Mesma regra de acesso do ASO periódico (cliente_usuarios), mas aqui
// o funcionário é o da rescisão e o arquivo é o aso_documento_path dela. O cliente só LÊ — nunca anexa.
// ASO é dado de saúde: URL assinada de 60s, nada público, nada do conteúdo em log. Tudo o que não for dele
// (funcionário de outro cliente, sem rescisão, sem ASO, path suspeito) devolve o MESMO 404 genérico, para nunca
// revelar que o funcionário ou o arquivo existem.
const NAO_ENCONTRADO = () => NextResponse.json({ error: "ASO não encontrado." }, { status: 404 });

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { funcionarioId } = await params;
  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: funcionario } = await service
    .from("funcionarios")
    .select("id")
    .eq("id", funcionarioId)
    .eq("cliente_id", clienteUsuario.cliente_id)
    .maybeSingle();
  if (!funcionario) return NAO_ENCONTRADO();

  const { data: rescisao } = await service
    .from("rescisoes")
    .select("aso_documento_path")
    .eq("funcionario_id", funcionarioId)
    .not("aso_documento_path", "is", null)
    .limit(1)
    .maybeSingle();
  // O path precisa ser de uma pasta DESTE funcionário (defesa extra contra apontar para arquivo de outro).
  if (!rescisao?.aso_documento_path || !pathAsoDoFuncionario(rescisao.aso_documento_path, funcionarioId)) {
    return NAO_ENCONTRADO();
  }

  const { data, error } = await service.storage.from(BUCKET_ASO).createSignedUrl(rescisao.aso_documento_path, 60);
  if (error || !data) return NAO_ENCONTRADO();

  return NextResponse.json({ signedUrl: data.signedUrl });
}
