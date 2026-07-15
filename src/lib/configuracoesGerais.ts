import { createServiceClient } from "@/lib/supabase/server";

// Leitura/escrita da tabela genérica de configuração chave/valor (configuracoes_gerais)
// — pensada pra ser reaproveitada por qualquer configuração futura, não só a carta de
// conta salário. Chaves ausentes retornam null (nunca lançam erro).
export async function getConfiguracoesGerais(chaves: string[]): Promise<Record<string, string | null>> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("configuracoes_gerais")
    .select("chave, valor")
    .in("chave", chaves);

  const resultado: Record<string, string | null> = {};
  for (const chave of chaves) resultado[chave] = null;

  if (error) {
    console.error("[configuracoesGerais] Erro ao ler configurações:", error.message);
    return resultado;
  }

  for (const row of data ?? []) resultado[row.chave] = row.valor;
  return resultado;
}

export async function setConfiguracaoGeral(chave: string, valor: string | null, userId: string): Promise<{ error?: string }> {
  const svc = createServiceClient();
  const { error } = await svc
    .from("configuracoes_gerais")
    .upsert({ chave, valor, atualizado_em: new Date().toISOString(), atualizado_por: userId });

  if (error) return { error: error.message };
  return {};
}
