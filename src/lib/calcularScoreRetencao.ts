import { createServiceClient } from "@/lib/supabase/server";

export type RetencaoLabel = "Alto" | "Médio" | "Baixo" | "Risco";

export interface ScoreRetencao {
  score: number;
  label: RetencaoLabel;
  resumo: string;
  fatores: string[];
}

function getLabel(score: number): RetencaoLabel {
  if (score >= 75) return "Alto";
  if (score >= 50) return "Médio";
  if (score >= 25) return "Baixo";
  return "Risco";
}

export async function calcularScoreRetencao(
  candidatoId: string,
  vagaId: string
): Promise<ScoreRetencao | null> {
  const supabase = createServiceClient();

  const [{ data: candidato }, { data: vaga }] = await Promise.all([
    supabase
      .from("candidatos")
      .select(
        "cargo_pretendido, pretensao_salarial, cidade, estado, experiencias_profissionais, tempo_experiencia, habilidades"
      )
      .eq("id", candidatoId)
      .single(),
    supabase
      .from("vagas")
      .select("titulo, cidade, estado, salario, requisitos, habilidades_desejadas")
      .eq("id", vagaId)
      .single(),
  ]);

  if (!candidato || !vaga) return null;

  const prompt = `Analise o potencial de retenção deste candidato para esta vaga. Retorne APENAS um JSON válido, sem markdown, sem explicação.

{
  "score": number (0-100),
  "resumo": "máx 120 chars em português explicando o score de retenção",
  "fatores": ["fator 1", "fator 2", "fator 3"]
}

CRITÉRIOS DE RETENÇÃO (pese cada fator):
1. Estabilidade de emprego (25%): Analise experiencias_profissionais — empregos longos (2+ anos cada) = pontos altos. Saídas frequentes (< 1 ano por emprego) = risco de retenção.
2. Compatibilidade salarial (25%): Compare pretensao_salarial vs salário da vaga. Quanto mais próximos, menor o risco de saída por salário. Pretensão > salário vaga em mais de 20% = risco alto.
3. Localização (20%): Mesma cidade = sem risco de distância. Mesmo estado = risco baixo. Estado diferente = risco de desistência.
4. Relevância da experiência (15%): Experiência diretamente alinhada à vaga = menos risco de frustração com o cargo.
5. Trajetória de carreira (15%): Crescimento consistente na mesma área = score alto. Mudanças frequentes de área = instabilidade.

CANDIDATO:
- Cargo pretendido: ${candidato.cargo_pretendido}
- Pretensão salarial: ${candidato.pretensao_salarial ?? "não informado"}
- Cidade/Estado: ${candidato.cidade ?? "?"} / ${candidato.estado ?? "?"}
- Tempo de experiência: ${candidato.tempo_experiencia ?? "não informado"}
- Experiências: ${candidato.experiencias_profissionais ?? "não informado"}
- Habilidades: ${JSON.stringify(candidato.habilidades ?? [])}

VAGA:
- Título: ${vaga.titulo}
- Salário: ${vaga.salario ?? "não informado"}
- Cidade/Estado: ${vaga.cidade ?? "?"} / ${vaga.estado ?? "?"}
- Requisitos: ${vaga.requisitos ?? "não informado"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "Você é um especialista em retenção de talentos. Retorne APENAS um JSON válido sem markdown ou texto extra.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const aiData = await response.json();
  if (aiData.type === "error") throw new Error(aiData.error?.message ?? "Erro na IA");

  const texto = (aiData.content ?? [])
    .map((i: { type: string; text?: string }) => i.text ?? "")
    .join("");
  const limpo = texto.replace(/```json|```/g, "").trim();
  const resultado = JSON.parse(limpo);

  const score = Math.max(0, Math.min(100, Math.round(resultado.score)));

  return {
    score,
    label: getLabel(score),
    resumo: resultado.resumo ?? "",
    fatores: Array.isArray(resultado.fatores) ? resultado.fatores : [],
  };
}
