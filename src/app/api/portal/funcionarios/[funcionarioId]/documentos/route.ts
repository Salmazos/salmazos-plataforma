import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

export interface DocumentoPortalItem {
  id: string;
  label: string;
  // Só a extensão (ex.: "pdf", "jpg") — nunca o storage_path inteiro, que revelaria o
  // admissao_id e a estrutura interna de pastas do bucket pro cliente. Usada só pra dar um
  // nome de arquivo com extensão correta no "Baixar" (ver PortalDocumentosFuncionarioModal).
  extensao: string | null;
}

// Lista os documentos da admissão liberados pro cliente ver — mesma trava de segurança de
// aso-url/contrato-url (funcionário precisa pertencer ao cliente_id do usuário logado e
// estar ativo). ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O OLVER: só entram documentos com
// status='aprovado' (nunca pendente/enviado/rejeitado — o cliente não deve ver documento
// que a Salmazos ainda não validou) e com arquivo de fato anexado. O rótulo replica a
// numeração "(1)", "(2)" de tipos multi-arquivo usada no painel interno
// (AdmissaoDetalheClient), pra manter a mesma linguagem entre as duas telas.
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
    .select("id, admissao_id")
    .eq("id", funcionarioId)
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "ativo")
    .maybeSingle();
  if (!funcionario) return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });

  if (!funcionario.admissao_id) return NextResponse.json({ data: [] });

  const { data: documentos } = await service
    .from("admissao_documentos")
    .select("id, tipo_documento, storage_path, created_at")
    .eq("admissao_id", funcionario.admissao_id)
    .eq("status", "aprovado")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true });

  const itens: DocumentoPortalItem[] = [];
  for (const def of DOCUMENTOS_ADMISSAO) {
    if (def.apenasPainel) continue;
    const rows = (documentos ?? []).filter((d) => d.tipo_documento === def.tipo_documento);
    rows.forEach((doc, idx) => {
      const partes = doc.storage_path?.split(".") ?? [];
      const extensao = partes.length > 1 ? partes[partes.length - 1] : null;
      itens.push({ id: doc.id, label: rows.length > 1 ? `${def.label} (${idx + 1})` : def.label, extensao });
    });
  }

  return NextResponse.json({ data: itens });
}
