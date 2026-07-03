import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();
const SYSTEM_PROMPT =
  "Você é um especialista em recrutamento. Avalie a compatibilidade entre o candidato e a vaga. Responda APENAS com um número de 0 a 100 representando o percentual de match. Sem explicações.";

const MAX_CONCURRENT_AI_CALLS = 5;

async function withConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function calcularMatchCandidato(candidatoId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: candidato } = await supabase
    .from("candidatos")
    .select("nome_completo, cargo_pretendido, resumo_profissional, experiencias_profissionais")
    .eq("id", candidatoId)
    .single();

  if (!candidato) return;

  const { data: vagas } = await supabase
    .from("vagas")
    .select("id, titulo, requisitos")
    .eq("status", "aberta");

  if (!vagas || vagas.length === 0) {
    await supabase.from("candidatos").update({ matches_calculados: [] }).eq("id", candidatoId);
    return;
  }

  const nome = candidato.nome_completo as string;
  const cargo = ((candidato.cargo_pretendido as string | null) ?? "").trim() || null;
  const resumo = (candidato.resumo_profissional as string | null) || "Não informado";
  const experiencias = (candidato.experiencias_profissionais as string | null) || "Não informado";
  const semCargo = !cargo;
  const cargoText = cargo ?? "Generalista - sem cargo definido";

  const results = await withConcurrencyLimit(
    vagas as { id: string; titulo: string; requisitos: string | null }[],
    MAX_CONCURRENT_AI_CALLS,
    async (vaga) => {
      const base = `Candidato: ${nome}, Cargo pretendido: ${cargoText}, Resumo: ${resumo}, Experiências: ${experiencias}. Vaga: ${vaga.titulo}, Requisitos: ${vaga.requisitos ?? "Não informado"}. Retorne apenas o número.`;
      const userPrompt = semCargo
        ? `Este candidato não tem cargo definido. Priorize vagas operacionais, de serviços gerais, auxiliar ou ajudante que não exijam experiência técnica.\n\n${base}`
        : base;
      try {
        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 10,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        });
        const block = message.content[0];
        const text = block?.type === "text" ? block.text.trim() : "0";
        const score = parseInt(text, 10);
        return {
          vaga_id: vaga.id,
          titulo: vaga.titulo,
          score: isNaN(score) ? 0 : Math.min(100, Math.max(0, score)),
        };
      } catch {
        return { vaga_id: vaga.id, titulo: vaga.titulo, score: 0 };
      }
    }
  );

  const top3 = results.sort((a, b) => b.score - a.score).slice(0, 3);

  const update: Record<string, unknown> = { matches_calculados: top3 };
  if (top3.length > 0) {
    update.melhor_match_score = top3[0].score;
    update.melhor_match_vaga_titulo = top3[0].titulo;
  }

  await supabase.from("candidatos").update(update).eq("id", candidatoId);
}
