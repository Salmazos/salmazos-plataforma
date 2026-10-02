import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface LembreteVencido {
  id: string;
  empresa_visitada_id: string | null;
  oportunidade_id: string | null;
  contato_id: string | null;
  tipo: string;
  data_lembrete: string;
  texto: string | null;
  empresa_nome: string | null;
}

// Lembretes PENDENTES do vendedor com data <= hoje (vencidos ou de hoje), mais antigos primeiro.
// O service client ignora RLS: o filtro por vendedor_id é obrigatório e fica aqui, em código.
export async function buscarLembretesVencidos(svc: ServiceClient, vendedorId: string, hoje: string, limite = 100): Promise<LembreteVencido[]> {
  const { data, error } = await svc
    .from("lembretes")
    .select("id, empresa_visitada_id, oportunidade_id, contato_id, tipo, data_lembrete, texto")
    .eq("vendedor_id", vendedorId)
    .eq("status", "pendente")
    .lte("data_lembrete", hoje)
    .order("data_lembrete", { ascending: true })
    .limit(limite);
  if (error) throw new Error(error.message);
  const lista = data ?? [];
  const empresaIds = [...new Set(lista.map((l) => l.empresa_visitada_id as string | null).filter((x): x is string => !!x))];
  const { data: empresas } = empresaIds.length
    ? await svc.from("empresas_visitadas").select("id, nome").in("id", empresaIds)
    : { data: [] as { id: string; nome: string }[] };
  const nomePorId = new Map((empresas ?? []).map((e) => [e.id, e.nome]));
  return lista.map((l) => ({
    id: l.id as string,
    empresa_visitada_id: (l.empresa_visitada_id as string | null) ?? null,
    oportunidade_id: (l.oportunidade_id as string | null) ?? null,
    contato_id: (l.contato_id as string | null) ?? null,
    tipo: l.tipo as string,
    data_lembrete: l.data_lembrete as string,
    texto: (l.texto as string | null) ?? null,
    empresa_nome: l.empresa_visitada_id ? nomePorId.get(l.empresa_visitada_id as string) ?? null : null,
  }));
}
