// Efetivação do funcionário MOT/Terceirização (colunas efetivado_* em funcionarios, ver
// supabase/migration_funcionario_efetivado.sql). Efetivado continua ATIVO; só o relógio de vencimento de contrato para.

type ErroPg = { code?: string | null; message?: string | null } | null | undefined;

// A migração é aplicada separada do deploy: enquanto a coluna não existe, o Postgres responde 42703
// (undefined_column) e o PostgREST pode responder PGRST204 (coluna fora do schema cache) numa escrita. Qualquer
// OUTRO erro (rede, timeout, permissão) não pode cair no fallback — o aviso de vencimento sumiria por engano.
export function ehErroColunaAusente(erro: ErroPg): boolean {
  if (!erro) return false;
  if (erro.code === "42703" || erro.code === "PGRST204") return true;
  return typeof erro.message === "string" && /efetivado_(em|por|obs)/.test(erro.message);
}

export const COLUNAS_EFETIVACAO = "efetivado_em, efetivado_por, efetivado_obs";

type Resultado<T> = { data: T[] | null; error: ErroPg };

// Roda a consulta pedindo/filtrando efetivados; se a coluna ainda não existe, repete SEM a parte nova (o comportamento
// de antes da efetivação). `montar(true)` = consulta com efetivado_em; `montar(false)` = consulta antiga.
export async function consultarComEfetivacao<T>(
  montar: (comEfetivacao: boolean) => PromiseLike<Resultado<T>>,
  onde: string
): Promise<{ data: T[]; efetivacaoDisponivel: boolean }> {
  const nova = await montar(true);
  if (!nova.error) return { data: nova.data ?? [], efetivacaoDisponivel: true };
  if (ehErroColunaAusente(nova.error)) {
    console.error(`[efetivacao] coluna efetivado_em ausente em ${onde} (migração pendente) — usando consulta sem efetivação.`);
    const antiga = await montar(false);
    if (antiga.error) console.error(`[efetivacao] erro em ${onde}:`, antiga.error.message);
    return { data: antiga.data ?? [], efetivacaoDisponivel: false };
  }
  console.error(`[efetivacao] erro em ${onde}:`, nova.error.message);
  return { data: [], efetivacaoDisponivel: true };
}
