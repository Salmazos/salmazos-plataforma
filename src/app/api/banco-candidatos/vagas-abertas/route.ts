import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirContextoUnidade } from "@/lib/unidadeAuth";

type VagaAbertaRow = {
  id: string;
  titulo: string;
  cliente_id: string | null;
  cidade: string | null;
  clientes: { nome: string } | null;
};

const SEM_CLIENTE_SORT_KEY = "￿";

export async function GET() {
  const { ctx, erro } = await exigirContextoUnidade();
  if (erro) return erro;

  const supabase = createServiceClient();

  // Banco de candidatos é compartilhado entre unidades, mas as vagas oferecidas pra
  // vincular um candidato são só as da unidade de quem está vinculando.
  let query = supabase
    .from("vagas")
    .select("id, titulo, cliente_id, cidade, clientes(nome)")
    .eq("status", "aberta")
    .order("titulo", { ascending: true });
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agrupa por cliente (ordem alfabética) para facilitar a leitura em listas longas;
  // vagas sem cliente vinculado (internas) vão para o final.
  const vagas = ((data ?? []) as unknown as VagaAbertaRow[]).slice().sort((a, b) => {
    const clienteA = a.clientes?.nome ?? SEM_CLIENTE_SORT_KEY;
    const clienteB = b.clientes?.nome ?? SEM_CLIENTE_SORT_KEY;
    const cmp = clienteA.localeCompare(clienteB, "pt-BR");
    if (cmp !== 0) return cmp;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });

  return NextResponse.json({ vagas });
}
