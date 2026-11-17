// "Salvar horário" do painel "+ Usar modelo" (telas do RH): grava SOMENTE o campo de horário, pelas mesmas rotas PATCH que as telas já usam ao salvar
// (mesmas permissões, validações e auditoria do servidor — os dois schemas aceitam edição parcial, então o servidor não muda). Nada além do horário
// vai no corpo: campos que o analista alterou na tela e ainda não salvou ficam fora, e continuam na tela como estão.

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface ResultadoSalvarHorario {
  erro: string | null;
  // Linha devolvida pelo servidor (só quando salvou).
  data: Record<string, unknown> | null;
}

async function patchHorario(url: string, texto: string, fetchImpl: FetchLike, msgPadrao: string): Promise<ResultadoSalvarHorario> {
  try {
    const res = await fetchImpl(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ horario_trabalho: texto }) });
    const json = (await res.json().catch(() => ({}))) as { error?: unknown; data?: Record<string, unknown> };
    if (!res.ok) return { erro: typeof json.error === "string" && json.error ? json.error : msgPadrao, data: null };
    return { erro: null, data: json.data ?? null };
  } catch {
    return { erro: "Erro de conexão. Tente novamente.", data: null };
  }
}

export const salvarHorarioAdmissao = (admissaoId: string, texto: string, fetchImpl: FetchLike = fetch as unknown as FetchLike) =>
  patchHorario(`/api/admissoes/${admissaoId}/dados-admissao`, texto, fetchImpl, "Erro ao salvar o horário.");

export const salvarHorarioFuncionario = (funcionarioId: string, texto: string, fetchImpl: FetchLike = fetch as unknown as FetchLike) =>
  patchHorario(`/api/funcionarios/${funcionarioId}`, texto, fetchImpl, "Erro ao salvar o horário.");
