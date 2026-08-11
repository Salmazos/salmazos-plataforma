import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoSupervisao } from "@/lib/supervisaoAuth";

// Bucket 'supervisao-fotos' é privado (mesmo padrão do bucket 'curriculos' — ver
// /api/curriculo/signed-url) — evidencias_fotos em km_visitas guarda só o path no storage,
// nunca URL pública. Qualquer exibição de foto (modal de lançamento de KM, histórico de
// visitas) passa por aqui pra gerar um link temporário.
//
// Autorização real, não só "path existe": o path recebido é resolvido de volta pra qual
// km_visitas (e cliente_id) ele pertence, e só então checado contra checarAcessoSupervisao —
// mesmo helper do Painel de Supervisão, sem duplicar a lógica de acesso. Full access libera
// tudo; supervisor só libera se for supervisor_responsavel_id do cliente daquela visita em
// clientes_meta_supervisao; qualquer outro caso (inclusive cliente_usuarios) é 403. Esta rota
// não checa visivel_cliente — é acesso interno da equipe Salmazos, não do futuro portal do
// cliente.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path é obrigatório." }, { status: 400 });

  const svc = createServiceClient();

  const { data: visita } = await svc
    .from("km_visitas")
    .select("id, cliente_id")
    .contains("evidencias_fotos", [path])
    .maybeSingle();

  if (!visita) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  const { acesso, fullAccess, analistaPerfilId } = await checarAcessoSupervisao(user);
  if (!acesso) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  if (!fullAccess) {
    const { data: meta } = await svc
      .from("clientes_meta_supervisao")
      .select("supervisor_responsavel_id")
      .eq("cliente_id", visita.cliente_id)
      .maybeSingle();

    if (!meta || meta.supervisor_responsavel_id !== analistaPerfilId) {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }
  }

  const { data, error } = await svc.storage.from("supervisao-fotos").createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Não foi possível gerar o link da foto." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: 3600 });
}
