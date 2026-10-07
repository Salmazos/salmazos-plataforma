import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";

interface Params {
  params: Promise<{ id: string; eventoId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id, eventoId } = await params;
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();
  // O evento precisa ser DESTE funcionário (a unidade foi checada pelo [id] da URL) — nunca confia só no eventoId.
  const { data: evento } = await svc
    .from("funcionario_mot_eventos")
    .select("arquivo_path")
    .eq("id", eventoId)
    .eq("funcionario_id", id)
    .maybeSingle();
  if (!evento?.arquivo_path) {
    return NextResponse.json({ error: "Evento não encontrado ou sem anexo." }, { status: 404 });
  }

  const { data, error } = await svc.storage.from("admissao-docs").createSignedUrl(evento.arquivo_path, 60);
  if (error) {
    console.error("[mot-eventos/arquivo-url] Erro ao gerar URL de leitura:", error.message);
    return NextResponse.json({ error: "Não foi possível abrir o aditivo. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
