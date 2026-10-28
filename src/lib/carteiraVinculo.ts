import type { createServiceClient } from "@/lib/supabase/server";
import { nomeParecido } from "@/lib/clienteDuplicidade";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface EmpresaCandidata { id: string; nome: string; cidade: string | null }

// Empresas da Carteira (prospects) da unidade, ainda sem cliente, cujo nome é igual/parecido ao do cliente. Usa a mesma regra de nome da trava
// de duplicidade de clientes (sem acento/caixa/Ltda/S.A.). Só SUGERE: quem vincula é o usuário, depois de escolher.
export async function buscarEmpresasCandidatas(svc: ServiceClient, nomeCliente: string, unidadeId: string): Promise<EmpresaCandidata[] | null> {
  const { data, error } = await svc
    .from("empresas_visitadas")
    .select("id, nome, cidade")
    .eq("unidade_id", unidadeId)
    .is("cliente_id", null)
    .limit(2000);
  if (error) return null;
  return (data ?? [])
    .filter((e) => nomeParecido(e.nome as string, nomeCliente))
    .map((e) => ({ id: e.id as string, nome: e.nome as string, cidade: (e.cidade as string | null) ?? null }));
}
