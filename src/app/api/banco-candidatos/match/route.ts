import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

const SYSTEM_PROMPT =
  "Você é um especialista em recrutamento. Avalie a compatibilidade entre o candidato e a vaga. Responda APENAS com um número de 0 a 100 representando o percentual de match. Sem explicações.";

export async function GET(req: NextRequest) {
  const candidatoId = req.nextUrl.searchParams.get("candidato_id");
  if (!candidatoId) {
    return NextResponse.json({ error: "candidato_id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: candidato } = await supabase
    .from("candidatos")
    .select("nome_completo, cargo_pretendido, resumo_profissional, experiencias_profissionais, formacao_academica, habilidades")
    .eq("id", candidatoId)
    .single();

  if (!candidato) {
    return NextResponse.json({ error: "Candidato not found" }, { status: 404 });
  }

  const { data: vagas } = await supabase
    .from("vagas")
    .select("id, titulo, requisitos")
    .eq("status", "aberta");

  if (!vagas || vagas.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const nome = candidato.nome_completo as string;
  const cargo = ((candidato.cargo_pretendido as string | null) ?? "").trim() || null;
  const resumo = (candidato.resumo_profissional as string | null) || "Não informado";
  const experiencias = (candidato.experiencias_profissionais as string | null) || "Não informado";
  const semCargo = !cargo;
  const cargoText = cargo ?? "Generalista - sem cargo definido";

  const results = await Promise.all(
    (vagas as { id: string; titulo: string; requisitos: string | null }[]).map(async (vaga) => {
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
    })
  );

  const top3 = results.sort((a, b) => b.score - a.score).slice(0, 3);

  if (top3.length > 0) {
    const best = top3[0];
    await supabase
      .from("candidatos")
      .update({
        melhor_match_score: best.score,
        melhor_match_vaga_titulo: best.titulo,
      })
      .eq("id", candidatoId);
  }

  return NextResponse.json({ matches: top3 });
}
