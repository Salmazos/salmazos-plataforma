// Indicação direta de candidato SEM vaga aberta (migration_indicacao_sem_vaga.sql). "Aguardando direcionamento" =
// status 'pendente' E vaga_id nulo — não existe status novo, então tudo que já filtra por 'pendente' continua valendo.
// A indicação sem vaga NÃO cria candidatura, admissão, cobrança nem comissão: isso só nasce quando ela ganha vaga e é aprovada.

export const TIPOS_SERVICO_INDICACAO = ["recrutamento_selecao", "mao_obra_temporaria", "terceirizacao"] as const;
export type TipoServicoIndicacao = (typeof TIPOS_SERVICO_INDICACAO)[number];

export const ROTULO_TIPO_SERVICO: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização",
};

export const MSG_SEM_VAGA_APROVAR =
  "Esta indicação ainda não tem vaga. Direcione para uma vaga existente ou crie a vaga a partir da indicação antes de aprovar.";
export const MSG_SEM_VAGA_INDISPONIVEL = "A indicação sem vaga ainda não está disponível neste ambiente. Tente novamente em instantes.";
export const MSG_JA_TEM_VAGA = "Esta indicação já tem vaga.";

export const indicacaoSemVaga = (sol: { vaga_id?: string | null }): boolean => !sol.vaga_id;

// A migração é aplicada separada do deploy: gravar vaga_id nulo antes dela dá 23502 (NOT NULL) e as colunas novas dão 42703 /
// PGRST204. Só esses casos viram o aviso "indisponível" (503); qualquer OUTRO erro (rede, permissão) segue como erro genérico.
export function ehErroSemVagaIndisponivel(erro: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erro) return false;
  if (erro.code === "23502" || erro.code === "42703" || erro.code === "PGRST204") return true;
  return typeof erro.message === "string" && /(vaga_id|tipo_servico|sem_vaga_origem|direcionada_(em|por)|direcionamento_tipo)/.test(erro.message) && /(null|column|coluna|schema cache)/i.test(erro.message);
}

// ── Duplicidade (só AVISA, nunca bloqueia): mesmo cliente + mesmo telefone + indicação ainda pendente ──
export const somenteDigitos = (t: string | null | undefined): string => (t ?? "").replace(/\D/g, "");

export function indicacoesPendentesComMesmoTelefone(pendentes: readonly { id: string; candidato_telefone: string | null }[], telefone: string): string[] {
  const alvo = somenteDigitos(telefone);
  // Telefone curto demais não identifica ninguém: sem aviso em vez de aviso falso.
  if (alvo.length < 8) return [];
  return pendentes.filter((p) => somenteDigitos(p.candidato_telefone) === alvo).map((p) => p.id);
}

// ── Direcionar para vaga EXISTENTE: mesmo cliente, vaga aberta, mesmo tipo de serviço e mesma unidade ──
export interface IndicacaoParaDirecionar {
  status: string;
  vaga_id: string | null;
  cliente_id: string;
  unidade_id: string;
  tipo_servico: string | null;
}
export interface VagaParaDirecionar {
  id: string;
  cliente_id: string | null;
  status: string;
  tipo_servico: string;
  unidade_id: string | null;
}

export function validarDirecionamento(sol: IndicacaoParaDirecionar, vaga: VagaParaDirecionar | null): string | null {
  if (sol.status !== "pendente") return "Esta indicação já foi decidida.";
  if (sol.vaga_id) return MSG_JA_TEM_VAGA;
  if (!vaga || vaga.cliente_id !== sol.cliente_id) return "Vaga não encontrada para este cliente.";
  if (vaga.status !== "aberta") return "Esta vaga não está aberta.";
  if (vaga.tipo_servico !== sol.tipo_servico) return "A vaga precisa ser do mesmo tipo de serviço da indicação.";
  if (vaga.unidade_id !== sol.unidade_id) return "A vaga precisa ser da mesma unidade da indicação.";
  return null;
}

// ── Vaga criada a partir da indicação ──
// Sempre PRIVADA (visivel_publicamente=false: o padrão do banco é público e o site lista aberta+visível), ABERTA (a aprovação
// exige vaga aberta), 1 posição, responsável = quem está criando (é quem recebe a comissão R&S), na unidade da indicação (= a do
// cliente). Função pura: a rota só acrescenta slug e data. Nunca lê visivel_publicamente do corpo da requisição.
export function dadosVagaDaIndicacao(o: {
  titulo: string;
  tipoServico: string;
  clienteId: string;
  clienteNome: string | null;
  unidadeId: string;
  responsavel: string;
  candidatoNome: string;
  cidade?: string | null;
  estado?: string | null;
}) {
  return {
    titulo: o.titulo.trim(),
    cliente_id: o.clienteId,
    cliente_nome: o.clienteNome,
    tipo_servico: o.tipoServico,
    num_posicoes: 1,
    num_posicoes_abertas: 1,
    status: "aberta" as const,
    cidade: o.cidade || null,
    estado: o.estado || null,
    responsavel: o.responsavel,
    unidade_id: o.unidadeId,
    visivel_publicamente: false,
    observacoes: `Criada a partir da indicação direta de ${o.candidatoNome}.`,
  };
}

// R&S: sem taxa (%) a vaga trava no Finalizar (finalizarContratacao.ts). A vaga nasce sem taxa — avisa antes, não bloqueia.
export function avisoTaxaVagaCriada(tipoServico: string): string | null {
  return tipoServico === "recrutamento_selecao"
    ? "Vaga de Recrutamento e Seleção criada sem taxa (%). Configure a taxa na vaga antes de finalizar a contratação."
    : null;
}
