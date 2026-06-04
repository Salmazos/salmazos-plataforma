import { createServiceClient } from "@/lib/supabase/server";

interface TriagemResult {
  score: number;
  label: string;
  resumo: string;
}

export async function calcularTriagem(candidatoId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: c, error } = await supabase
    .from("candidatos")
    .select(
      "nome_completo, cargo_pretendido, tempo_experiencia, formacao_academica, habilidades, resumo_candidato, resumo_profissional, experiencias_profissionais, idade, email, telefone, cidade"
    )
    .eq("id", candidatoId)
    .single();

  if (error || !c) throw new Error(`Candidato ${candidatoId} não encontrado`);

  const campos = [
    `cargo: ${c.cargo_pretendido ?? "não informado"}`,
    `experiencia: ${c.tempo_experiencia ?? "não informada"}`,
    `formacao: ${c.formacao_academica ?? "não informada"}`,
    `habilidades: ${Array.isArray(c.habilidades) && c.habilidades.length ? c.habilidades.join(", ") : "nenhuma"}`,
    `resumo: ${c.resumo_candidato ?? c.resumo_profissional ?? "não informado"}`,
    `experiencias: ${c.experiencias_profissionais ?? "não informadas"}`,
    `completude: nome=${!!c.nome_completo}, email=${!!c.email}, telefone=${!!c.telefone}, cidade=${!!c.cidade}`,
  ].join("\n");

  const userPrompt = `Analyze this candidate and return ONLY a valid JSON object with no other text:
{
  "score": <number 0-100>,
  "label": <"Excelente" | "Bom" | "Regular" | "Baixo">,
  "resumo": <string max 100 chars in Portuguese explaining the score>
}

Scoring criteria:
- Professional experience relevance and duration (30%)
- Education level and relevance (20%)
- Skills variety and market relevance (20%)
- Profile completeness: name, email, phone, city, resume filled (15%)
- Career progression and stability (15%)

Labels: Excelente (80-100), Bom (60-79), Regular (40-59), Baixo (0-39)

CANDIDATE:
${campos}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      temperature: 0,
      system:
        "You are an expert HR recruiter. Analyze candidate profiles and return ONLY a JSON object, no markdown, no explanation.",
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const aiData = await res.json();

  if (aiData.type === "error") {
    throw new Error(`Anthropic error: ${aiData.error?.message}`);
  }

  const texto =
    aiData.content
      ?.map((i: { type: string; text?: string }) => i.text ?? "")
      .join("") ?? "";
  const limpo = texto.replace(/```json|```/g, "").trim();
  const result: TriagemResult = JSON.parse(limpo);

  await supabase
    .from("candidatos")
    .update({
      triagem_score: result.score,
      triagem_label: result.label,
      triagem_resumo: result.resumo,
      triagem_calculada_em: new Date().toISOString(),
    })
    .eq("id", candidatoId);
}
