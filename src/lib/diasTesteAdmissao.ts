// Dias de teste de uma ADMISSÃO. admissoes não tem FK para candidatos_vagas, mas as duas tabelas compartilham o par
// (candidato_id, vaga_id) e candidatos_vagas tem UNIQUE (vaga_id, candidato_id): o vínculo é determinístico (é o mesmo
// critério de "admissão já iniciada" em painel/admissoes e candidatos-elegiveis). Sem candidatura (vaga removida, etc.) = sem dados.
import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

export interface DiasTesteDaAdmissao {
  dias: unknown; // admissao_dias_teste (jsonb): null | [] | lista
  legado: string | null; // admissao_dia_teste (texto antigo)
}

const LOTE = 40;

interface ParAdmissao {
  id: string;
  candidato_id: string;
  vaga_id: string | null;
}

// Devolve um mapa admissao.id -> dados, lendo candidatos_vagas em poucas consultas (lotes) para a lista toda.
export async function buscarDiasTestePorAdmissao(service: Service, admissoes: ParAdmissao[]): Promise<Map<string, DiasTesteDaAdmissao>> {
  const resultado = new Map<string, DiasTesteDaAdmissao>();
  const comVaga = admissoes.filter((a) => a.vaga_id);
  if (comVaga.length === 0) return resultado;

  // Em lotes: dois .in() com centenas de UUIDs estourariam o limite de tamanho da URL do PostgREST (a lista cresce com o tempo).
  const dados: { candidato_id: string; vaga_id: string; admissao_dias_teste: unknown; admissao_dia_teste: string | null }[] = [];
  for (let i = 0; i < comVaga.length; i += LOTE) {
    const lote = comVaga.slice(i, i + LOTE);
    const { data, error } = await service
      .from("candidatos_vagas")
      .select("candidato_id, vaga_id, admissao_dias_teste, admissao_dia_teste")
      .in("candidato_id", Array.from(new Set(lote.map((a) => a.candidato_id))))
      .in("vaga_id", Array.from(new Set(lote.map((a) => a.vaga_id as string))));
    if (error) {
      // Exibição complementar: falhar aqui não pode derrubar a tela da admissão.
      console.error("[diasTesteAdmissao] Erro ao ler dias de teste:", error);
      return resultado;
    }
    dados.push(...(data ?? []));
  }

  const porPar = new Map<string, DiasTesteDaAdmissao>();
  for (const cv of dados) {
    porPar.set(`${cv.candidato_id}|${cv.vaga_id}`, { dias: cv.admissao_dias_teste ?? null, legado: cv.admissao_dia_teste ?? null });
  }
  for (const a of comVaga) {
    const achado = porPar.get(`${a.candidato_id}|${a.vaga_id}`);
    if (achado) resultado.set(a.id, achado);
  }
  return resultado;
}
