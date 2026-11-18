// Dados ORIGINAIS da solicitação do cliente que gerou uma vaga (solicitacoes_vagas.vaga_id), para a ficha da vaga no painel. Só leitura e só
// para a equipe: nada disto é copiado para `vagas` nem aparece no site público, no portal, no PDF ou para o candidato (a ficha lê pelo vaga_id, na
// página do painel, com o mesmo controle de unidade das solicitações). Lista de colunas EXPLÍCITA, nunca "*": o que vai para a tela é só isto,
// sem o usuário que pediu (solicitado_por_user_id), o IP do aceite nem o snapshot das condições comerciais.
import type { DadosEmpresaLink, PerfilExtraLink } from "@/components/BlocosSolicitacaoLink";

export const COLUNAS_SOLICITACAO_ORIGINAL =
  "id, origem, cliente_nome, cargo, tipo_servico, created_at, aprovada_por, aprovada_em, previsao_inicio, requisitos, observacoes, perfil_extra, dados_empresa, unidade_id";

export interface SolicitacaoOriginalDaVaga {
  id: string;
  origem: string | null;
  cliente_nome: string | null;
  cargo: string | null;
  tipo_servico: string | null;
  created_at: string | null;
  aprovada_por: string | null;
  aprovada_em: string | null;
  previsao_inicio: string | null;
  requisitos: string | null;
  observacoes: string | null;
  perfil_extra: PerfilExtraLink | null;
  dados_empresa: DadosEmpresaLink | null;
  unidade_id: string;
}

// Só a equipe da unidade da solicitação vê (mesma regra de GET /api/solicitacoes-vagas e de POST /api/vagas/from-solicitacao: podeVerUnidade).
// Sem solicitação ligada, ou de outra unidade: sem bloco.
export function solicitacaoVisivel(
  sol: SolicitacaoOriginalDaVaga | null | undefined,
  podeVer: (unidadeId: string) => boolean
): SolicitacaoOriginalDaVaga | null {
  return sol && podeVer(sol.unidade_id) ? sol : null;
}
