import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { checarAcessoAdmissaoRH } from "@/lib/rhUnidadeAuth";
import { nomeArquivoAnexo } from "@/lib/emailPacoteContabilidade";

interface Params {
  params: Promise<{ id: string }>;
}

// Pacote de contabilidade contém dados sensíveis (LGPD) — signed URL de no máximo 15 minutos.
const SIGNED_URL_TTL_SECONDS = 900;

// Signed URL para reabrir o pacote de contabilidade já gerado para esta admissão. Com ?baixar=1 a URL força o download
// (Content-Disposition: attachment) com o nome "admissao-<candidato>.pdf" — é o download OPCIONAL do painel, para o envio manual
// à contabilidade; gerar o pacote não baixa mais nada sozinho (a cópia já vai por e-mail, com o RH em cópia).
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;
  const bloqueioUnidade = await checarAcessoAdmissaoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;

  const svc = createServiceClient();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("pdf_pacote_path, candidatos(nome_completo)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!admissao.pdf_pacote_path) return NextResponse.json({ error: "Nenhum pacote foi gerado ainda para esta admissão." }, { status: 400 });

  const baixar = request.nextUrl.searchParams.get("baixar") === "1";
  // O embed pode vir como objeto ou array conforme a inferência do supabase-js.
  const candidato = admissao.candidatos as { nome_completo: string } | { nome_completo: string }[] | null;
  const nomeCandidato = (Array.isArray(candidato) ? candidato[0]?.nome_completo : candidato?.nome_completo) ?? "";
  const { data, error: signError } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(admissao.pdf_pacote_path, SIGNED_URL_TTL_SECONDS, baixar ? { download: nomeArquivoAnexo(nomeCandidato) } : undefined);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
