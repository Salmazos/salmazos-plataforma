// Vaga PCD na parte pública do site. Regra do negócio: publicamente SÓ a sigla "PCD" (selo neutro "Vaga PCD"); a palavra por extenso nunca aparece
// em nada público (selo, título, meta, og, texto). Funções puras, sem I/O.

export const ROTULO_PCD_PUBLICO = "Vaga PCD";

export function vagaEhPcd(v: { pcd?: unknown } | null | undefined): boolean {
  return v?.pcd === true;
}

// Título da aba e do compartilhamento: a vaga PCD leva a sigla, as demais ficam com o título puro.
export function tituloPublicoDaVaga(titulo: string, pcd: boolean): string {
  return pcd ? `${titulo} (${ROTULO_PCD_PUBLICO}) | Salmazos RH & Serviços` : titulo;
}

interface RespostaSelect<T> {
  data: T | null;
  error: unknown;
}

// As páginas públicas pedem a coluna pcd junto com as demais. Se o banco ainda não a tem (migração não aplicada) ou a leitura falha por isso, repete
// SEM ela: o site continua no ar, só sem o selo. `consultar` recebe a lista de colunas e devolve a resposta do Supabase.
export async function selecionarComPcd<T>(
  consultar: (colunas: string) => PromiseLike<RespostaSelect<T>>,
  colunas: string
): Promise<{ data: T | null; comPcd: boolean }> {
  const primeira = await consultar(`${colunas}, pcd`);
  if (!primeira.error) return { data: primeira.data, comPcd: true };
  const segunda = await consultar(colunas);
  return { data: segunda.data, comPcd: false };
}
