import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type VagaAbertaRow = {
  id: string;
  titulo: string;
  cliente_id: string | null;
  cidade: string | null;
  clientes: { nome: string } | null;
};

const SEM_CLIENTE_SORT_KEY = "￿";

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("vagas")
    .select("id, titulo, cliente_id, cidade, clientes(nome)")
    .eq("status", "aberta")
    .order("titulo", { ascending: true });

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
