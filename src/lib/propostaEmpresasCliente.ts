// Clientes cadastrados que ainda não têm empresa na Carteira: busca da tela "Nova proposta" e regras usadas pela rota de criação da empresa a partir do cliente.
// A empresa só é criada quando alguém ESCOLHE o cliente (rota empresas/de-cliente); a busca nunca grava nada.
import type { createServiceClient } from "@/lib/supabase/server";

type Svc = ReturnType<typeof createServiceClient>;

export const LIMITE_BUSCA_CLIENTES = 20;
// Mesma ordem de grandeza de carteiraVinculo.buscarEmpresasCandidatas: a Carteira de uma unidade cabe com folga.
export const LIMITE_EMPRESAS_UNIDADE = 2000;
const LIMITE_CLIENTES_CONSULTADOS = 500;

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Mesma regra de nome nos dois lados (busca e rota): sem diferenciar maiúscula/minúscula e sem espaços nas pontas. Só igualdade EXATA:
// nome parecido nunca liga nem esconde nada (nunca se decide no escuro).
export const nomeNormalizado = (nome: string | null | undefined): string => (nome ?? "").trim().toLowerCase();

// Item de cliente na resposta da busca: sem id de empresa, sem contatos e sem CNPJ, telefone ou e-mail.
export interface ItemClienteBusca {
  origem: "cliente";
  cliente_id: string;
  nome: string;
  cidade?: string;
}

export interface EmpresaResumo {
  id: string;
  nome: string;
  cliente_id: string | null;
  created_at?: string | null;
}

// Mais antiga primeiro (created_at, depois id). created_at ausente conta como a MAIS NOVA: a mais antiga nunca é a que perde.
export function ordenarPorAntiguidade<T extends { id: string; created_at?: string | null }>(a: T, b: T): number {
  const ca = a.created_at ?? null, cb = b.created_at ?? null;
  if (ca !== cb) {
    if (ca === null) return 1;
    if (cb === null) return -1;
    return ca < cb ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function empresasDaUnidade(svc: Svc, unidadeId: string): Promise<EmpresaResumo[] | null> {
  const { data, error } = await svc.from("empresas_visitadas").select("id, nome, cliente_id, created_at").eq("unidade_id", unidadeId).limit(LIMITE_EMPRESAS_UNIDADE);
  if (error) return null;
  return (data ?? []) as EmpresaResumo[];
}

// Cliente SEM Carteira = nenhuma empresa da unidade (de teste ou não) ligada por cliente_id e nenhuma com o mesmo nome. As empresas de teste contam:
// o vendedor nunca pode ver como "sem Carteira" um cliente cuja empresa é de teste.
export function filtrarClientesSemCarteira<C extends { id: string; nome: string }>(clientes: C[], empresas: EmpresaResumo[]): C[] {
  const ligados = new Set(empresas.map((e) => e.cliente_id).filter((x): x is string => !!x));
  const nomes = new Set(empresas.map((e) => nomeNormalizado(e.nome)));
  return clientes.filter((c) => !ligados.has(c.id) && !nomes.has(nomeNormalizado(c.nome)));
}

// null = não foi possível ler (a rota responde erro: nada de lista incompleta sem aviso).
export async function buscarClientesSemCarteira(svc: Svc, unidadeId: string, q: string): Promise<ItemClienteBusca[] | null> {
  // Só clientes ATIVOS da unidade do usuário (nunca a de outra unidade, mesmo com acesso a todas).
  let consulta = svc.from("clientes").select("id, nome, cidade").eq("unidade_id", unidadeId).eq("ativo", true).order("nome", { ascending: true }).limit(LIMITE_CLIENTES_CONSULTADOS);
  if (q) consulta = consulta.ilike("nome", `%${escapeLike(q)}%`);
  const { data: clientes, error } = await consulta;
  if (error) return null;
  if (!clientes || clientes.length === 0) return [];
  const empresas = await empresasDaUnidade(svc, unidadeId);
  if (!empresas) return null;
  return filtrarClientesSemCarteira(clientes as { id: string; nome: string; cidade: string | null }[], empresas)
    .slice(0, LIMITE_BUSCA_CLIENTES)
    .map((c) => ({ origem: "cliente" as const, cliente_id: c.id, nome: c.nome, ...(c.cidade?.trim() ? { cidade: c.cidade.trim() } : {}) }));
}
