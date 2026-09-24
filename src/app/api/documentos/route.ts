import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, documentoCreateSchema } from "@/lib/schemas";
import { checarAcessoDocumentos, checarAcessoCaminhoDocumento } from "@/lib/documentosAuth";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoDocumentos(user);
    if (acessoNegado) return acessoNegado;

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");
    const categoria = searchParams.get("categoria");
    const cliente_id = searchParams.get("cliente_id");
    const pasta_id = searchParams.get("pasta_id");
    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    console.log("[GET /api/documentos] params →", { tipo, categoria, cliente_id, pasta_id });

    const supabase = createServiceClient();
    let query = supabase
      .from("documentos")
      .select("*, clientes(nome, unidade_id)")
      .order("created_at", { ascending: false });

    if (tipo) query = query.eq("tipo", tipo);
    if (categoria) query = query.eq("categoria", categoria);
    if (cliente_id) query = query.eq("cliente_id", cliente_id);
    if (pasta_id) query = query.eq("pasta_id", pasta_id);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Documento de cliente só aparece pra unidade do cliente (sócios veem todos); documento
    // interno da Salmazos (sem cliente) é compartilhado. Ver checarAcessoCaminhoDocumento.
    const visiveis = (data ?? []).filter((d) => {
      if (!d.cliente_id) return true;
      // PostgREST devolve o embed many-to-one como objeto, mas o tipo inferido é array.
      const cliente = d.clientes as unknown as { unidade_id: string } | null;
      return podeVerUnidade(ctx, cliente?.unidade_id);
    });

    return NextResponse.json({ data: visiveis });
  } catch (err) {
    console.error("[GET /api/documentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoDocumentos(user);
    if (acessoNegado) return acessoNegado;

    const body = await request.json();
    const parsed = parseBody(documentoCreateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (parsed.data.tipo === "cliente" && !parsed.data.cliente_id) {
      return NextResponse.json(
        { error: "cliente_id é obrigatório para documentos do tipo 'cliente'." },
        { status: 400 }
      );
    }
    if (parsed.data.tipo === "cliente" && !parsed.data.categoria) {
      return NextResponse.json(
        { error: "categoria é obrigatória para documentos do tipo 'cliente'." },
        { status: 400 }
      );
    }
    if (parsed.data.tipo === "salmazos" && !parsed.data.pasta_id) {
      return NextResponse.json(
        { error: "pasta_id é obrigatório para documentos do tipo 'salmazos'." },
        { status: 400 }
      );
    }

    // O arquivo tem que estar na pasta do próprio cliente (ou nas pastas internas, pra doc da
    // Salmazos) — senão daria pra registrar um documento apontando pro arquivo de outro cliente.
    const pastaEsperada =
      parsed.data.tipo === "cliente" ? `clientes/${parsed.data.cliente_id}/` : "salmazos/";
    if (!parsed.data.storage_path.startsWith(pastaEsperada)) {
      return NextResponse.json({ error: "Caminho do arquivo não confere com o documento." }, { status: 400 });
    }
    const bloqueioCaminho = await checarAcessoCaminhoDocumento(user, parsed.data.storage_path);
    if (bloqueioCaminho) return bloqueioCaminho;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        nome: parsed.data.nome,
        descricao: parsed.data.descricao ?? null,
        categoria: parsed.data.categoria ?? null,
        tipo: parsed.data.tipo,
        cliente_id: parsed.data.cliente_id ?? null,
        pasta_id: parsed.data.pasta_id ?? null,
        storage_path: parsed.data.storage_path,
        tamanho_bytes: parsed.data.tamanho_bytes ?? null,
        extensao: parsed.data.extensao ?? null,
        uploaded_by: parsed.data.uploaded_by ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/documentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
