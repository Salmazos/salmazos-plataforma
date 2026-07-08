import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { registrarAuditoria } from "@/lib/audit";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";

interface Params {
  params: Promise<{ id: string; tipo: string }>;
}

const TAMANHO_MAX = 10 * 1024 * 1024; // 10MB
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/heic", "application/pdf"];
// Mesma regra da rota pública (token/[token]/documentos/[tipo]) — tipos condicionados a
// "dependente" aceitam múltiplos arquivos (um por dependente, sem vínculo nominal).
const MAX_ARQUIVOS_POR_TIPO = 10;

function isTipoValido(tipo: string): boolean {
  return DOCUMENTOS_ADMISSAO.some((d) => d.tipo_documento === tipo);
}

// Caminho paralelo à rota pública, exclusivo do painel interno (superuser/diretoria/
// supervisor — ver checarPapelAdmissoes) — a equipe faz upload em nome do candidato quando
// ele perde acesso, se confunde no preenchimento, ou é mais rápido resolver direto. Fica em
// /documentos-upload/ (em vez de dentro de /documentos/[docId]/) porque o Next.js não
// permite dois segmentos dinâmicos com nomes diferentes ([docId] e [tipo]) na mesma pasta.
// A lógica de doc_id/múltiplos arquivos é deliberadamente reimplementada aqui em vez de
// compartilhada com a rota do candidato — assim uma mudança aqui nunca arrisca aquele
// caminho público.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, tipo } = await params;
  if (!isTipoValido(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const formData = await request.formData();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Campo 'arquivo' ausente." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAX) return NextResponse.json({ error: "Arquivo maior que 10MB." }, { status: 400 });
  if (!TIPOS_ACEITOS.includes(arquivo.type) && !arquivo.name.toLowerCase().endsWith(".heic")) {
    return NextResponse.json({ error: "Formato não aceito. Envie JPG, PNG, PDF ou HEIC." }, { status: 400 });
  }
  const docIdRaw = formData.get("doc_id");
  const docId = typeof docIdRaw === "string" && docIdRaw.trim() ? docIdRaw.trim() : undefined;

  const svc = createServiceClient();

  const safeFilename = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${id}/${tipo}/${Date.now()}-${safeFilename}`;
  const buffer = Buffer.from(await arquivo.arrayBuffer());

  const { error: uploadError } = await svc.storage
    .from("admissao-docs")
    .upload(storagePath, buffer, { contentType: arquivo.type || "application/octet-stream", upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const def = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === tipo)!;
  const aceitaMultiplos = def.condicional === "dependente";

  let data;
  if (docId) {
    // Substitui uma linha específica (ex.: trocar o arquivo de um documento já enviado
    // ou rejeitado) — nunca cria linha nova.
    const { data: updated, error } = await svc
      .from("admissao_documentos")
      .update({ storage_path: storagePath, status: "enviado", motivo_rejeicao: null })
      .eq("id", docId)
      .eq("admissao_id", id)
      .eq("tipo_documento", tipo)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    data = updated;
  } else if (aceitaMultiplos) {
    // Sem doc_id num tipo multi-arquivo = "adicionar mais um": reaproveita a linha vazia
    // semeada na criação da admissão se existir, senão cria uma linha nova.
    const { data: slotVazio } = await svc
      .from("admissao_documentos")
      .select("id")
      .eq("admissao_id", id)
      .eq("tipo_documento", tipo)
      .is("storage_path", null)
      .limit(1)
      .maybeSingle();

    if (slotVazio) {
      const { data: updated, error } = await svc
        .from("admissao_documentos")
        .update({ storage_path: storagePath, status: "enviado", motivo_rejeicao: null })
        .eq("id", slotVazio.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      data = updated;
    } else {
      const { count } = await svc
        .from("admissao_documentos")
        .select("id", { count: "exact", head: true })
        .eq("admissao_id", id)
        .eq("tipo_documento", tipo);
      if ((count ?? 0) >= MAX_ARQUIVOS_POR_TIPO) {
        return NextResponse.json({ error: `Limite de ${MAX_ARQUIVOS_POR_TIPO} arquivos por documento atingido.` }, { status: 400 });
      }

      const { data: inserted, error } = await svc
        .from("admissao_documentos")
        .insert({
          admissao_id: id,
          tipo_documento: tipo,
          obrigatorio: def.obrigatorio,
          condicional: def.condicional,
          storage_path: storagePath,
          status: "enviado",
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      data = inserted;
    }
  } else {
    // Tipo de arquivo único, sem doc_id — substitui a linha única existente (mesma
    // semântica de "reenviar" já usada em todo o resto do módulo).
    const { data: updated, error } = await svc
      .from("admissao_documentos")
      .update({ storage_path: storagePath, status: "enviado", motivo_rejeicao: null })
      .eq("admissao_id", id)
      .eq("tipo_documento", tipo)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    data = updated;
  }

  // Ação distinta de "admissao_documento_enviado" (candidato) de propósito — deixa
  // explícito na auditoria que este arquivo não veio do próprio candidato.
  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_documento_upload_pela_equipe",
    entidade: "admissao_documentos",
    entidade_id: data.id,
    detalhes: { admissao_id: id, tipo_documento: tipo, enviado_por: user.email ?? user.id },
  });

  return NextResponse.json({ data });
}
