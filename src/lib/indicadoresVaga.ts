export type NivelAlerta = "verde" | "amarelo" | "vermelho";

export interface IndicadoresVaga {
  vaga_id: string;
  titulo: string;
  slug: string;
  cliente_nome: string | null;
  status: string;
  dias_aberta: number;
  posicoes_preenchidas: number;
  posicoes_total: number;
  em_processo: number;
  dias_sem_movimento: number | null; // null se não houver candidatos ativos
  nivel_alerta: NivelAlerta;
}

const ETAPAS_PIPELINE_ATIVO = [
  "triagem",
  "entrevista_rh",
  "entrevista_salmazos",
  "entrevista_cliente",
  "aprovado_cliente",
];

const ETAPA_PREENCHIDA = "contratado";

interface VagaParaIndicadores {
  id: string;
  titulo: string;
  slug: string;
  cliente_nome: string | null;
  status: string;
  created_at: string | null;
  num_posicoes: number;
}

interface CandidatoVagaParaIndicadores {
  etapa: string;
  updated_at: string;
}

function diasEntre(inicio: Date, fim: Date): number {
  return Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
}

export function calcularIndicadoresVaga(
  vaga: VagaParaIndicadores,
  candidatosVagas: CandidatoVagaParaIndicadores[]
): IndicadoresVaga {
  const agora = new Date();

  const posicoes_preenchidas = candidatosVagas.filter((cv) => cv.etapa === ETAPA_PREENCHIDA).length;

  const pipelineAtivo = candidatosVagas.filter((cv) => ETAPAS_PIPELINE_ATIVO.includes(cv.etapa));
  const em_processo = pipelineAtivo.length;

  let dias_sem_movimento: number | null = null;
  if (em_processo > 0) {
    const maisRecente = pipelineAtivo.reduce(
      (mais, cv) => {
        const dataCv = new Date(cv.updated_at);
        return dataCv > mais ? dataCv : mais;
      },
      new Date(pipelineAtivo[0].updated_at)
    );
    dias_sem_movimento = diasEntre(maisRecente, agora);
  }

  let nivel_alerta: NivelAlerta = "verde";
  if (dias_sem_movimento !== null && dias_sem_movimento >= 7) {
    nivel_alerta = "vermelho";
  } else if (dias_sem_movimento !== null && dias_sem_movimento >= 4) {
    nivel_alerta = "amarelo";
  }

  return {
    vaga_id: vaga.id,
    titulo: vaga.titulo,
    slug: vaga.slug,
    cliente_nome: vaga.cliente_nome,
    status: vaga.status,
    dias_aberta: vaga.created_at ? diasEntre(new Date(vaga.created_at), agora) : 0,
    posicoes_preenchidas,
    posicoes_total: vaga.num_posicoes,
    em_processo,
    dias_sem_movimento,
    nivel_alerta,
  };
}
