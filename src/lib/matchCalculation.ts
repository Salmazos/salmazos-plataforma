import { createServiceClient } from "@/lib/supabase/server";
import type { MatchDetalhes } from "@/types";

export async function calcularMatch(
  vagaId: string,
  candidatoId: string
): Promise<{ score: number; detalhes: MatchDetalhes } | null> {
  const supabase = createServiceClient();

  const { data: cv } = await supabase
    .from("candidatos_vagas")
    .select("id")
    .eq("vaga_id", vagaId)
    .eq("candidato_id", candidatoId)
    .single();

  if (!cv) return null;

  const [{ data: candidato }, { data: vaga }] = await Promise.all([
    supabase
      .from("candidatos")
      .select(
        "cargo_pretendido, habilidades, cidade, estado, experiencias_profissionais, formacao_academica, resumo_profissional, tempo_experiencia"
      )
      .eq("id", candidatoId)
      .single(),
    supabase
      .from("vagas")
      .select("titulo, requisitos, cidade, estado, observacoes, habilidades_desejadas")
      .eq("id", vagaId)
      .single(),
  ]);

  if (!candidato || !vaga) return null;

  const userPrompt = `Analise o match e retorne APENAS JSON (sem markdown, sem texto extra):
{
  "score": number (0-100),
  "cargo_match": number (0-100),
  "habilidades_match": number (0-100),
  "localizacao_match": number (0-100),
  "experiencia_match": number (0-100),
  "resumo": "máx 100 chars em português explicando o score"
}

CANDIDATO: cargo=${candidato.cargo_pretendido}, habilidades=${JSON.stringify(candidato.habilidades ?? [])}, cidade=${candidato.cidade}, estado=${candidato.estado}, experiencia=${candidato.tempo_experiencia}, formacao=${candidato.formacao_academica ?? "não informado"}

VAGA: titulo=${vaga.titulo}, requisitos=${vaga.requisitos ?? "não informado"}, cidade=${vaga.cidade ?? "qualquer"}, estado=${vaga.estado ?? "qualquer"}, habilidades_desejadas=${JSON.stringify(vaga.habilidades_desejadas ?? [])}

Regras: cargo_match=compatibilidade cargo/título; habilidades_match=sobreposição habilidades; localizacao_match=100 mesma cidade/70 mesmo estado/30 diferente; experiencia_match=adequação experiência; score=média ponderada(cargo 30%, habilidades 35%, localização 20%, experiência 15%)`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "You are a recruitment specialist. Analyze the match between a candidate and a job vacancy. Return ONLY a JSON object with no explanation, no markdown, no extra text.",
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const aiData = await response.json();
  if (aiData.type === "error") throw new Error(aiData.error?.message ?? "Erro na IA");

  const texto = (aiData.content ?? [])
    .map((i: { type: string; text?: string }) => i.text ?? "")
    .join("");
  const limpo = texto.replace(/```json|```/g, "").trim();
  const resultado = JSON.parse(limpo);

  const detalhes: MatchDetalhes = {
    cargo_match: resultado.cargo_match,
    habilidades_match: resultado.habilidades_match,
    localizacao_match: resultado.localizacao_match,
    experiencia_match: resultado.experiencia_match,
    resumo: resultado.resumo,
  };

  await supabase
    .from("candidatos_vagas")
    .update({
      match_score: resultado.score,
      match_detalhes: detalhes,
      match_calculado_em: new Date().toISOString(),
    })
    .eq("id", cv.id);

  return { score: resultado.score, detalhes };
}
