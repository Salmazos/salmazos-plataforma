import { createServiceClient } from "@/lib/supabase/server";

interface NovosDados {
  nome_completo: string;
  telefone: string;
  cpf?: string;
  cargo_pretendido?: string;
  tempo_experiencia?: string;
  formacao_academica?: string;
  habilidades?: string[];
  resumo_candidato?: string;
  resumo_profissional?: string;
  experiencias_profissionais?: string;
  email?: string;
  cidade?: string;
}

export interface DuplicataResult {
  isDuplicata: false;
  candidatoExistente?: never;
  isAtualizacao?: never;
  resumoAtualizacao?: never;
}

export interface DuplicataEncontrada {
  isDuplicata: true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candidatoExistente: Record<string, any>;
  isAtualizacao: boolean;
  resumoAtualizacao: string;
}

export type DetectarResult = DuplicataResult | DuplicataEncontrada;

export async function detectarDuplicata(
  novosDados: NovosDados,
  tipo: "publico" | "rapido"
): Promise<DetectarResult> {
  void tipo; // used by caller, not internally
  const supabase = createServiceClient();

  // 1. CPF lookup (skip TEMP- placeholders)
  let candidatoExistente: Record<string, unknown> | null = null;
  const cpf = novosDados.cpf;
  if (cpf && !cpf.startsWith("TEMP-")) {
    const { data } = await supabase
      .from("candidatos")
      .select("*")
      .eq("cpf", cpf)
      .maybeSingle();
    candidatoExistente = data;
  }

  // 2. Name + phone fallback
  if (!candidatoExistente) {
    const tokens = novosDados.nome_completo.trim().split(/\s+/);
    const primeiro = tokens[0];
    const ultimo = tokens[tokens.length - 1];
    const foneLimpo = novosDados.telefone.replace(/\D/g, "");

    if (primeiro && foneLimpo.length >= 8) {
      const { data: candidatos } = await supabase
        .from("candidatos")
        .select("*")
        .ilike("nome_completo", `%${primeiro}%`)
        .ilike("nome_completo", `%${ultimo}%`)
        .limit(10);

      if (candidatos?.length) {
        candidatoExistente =
          candidatos.find((c) => {
            const foneDb = (c.telefone ?? "").replace(/\D/g, "");
            return foneDb.length >= 8 && foneDb === foneLimpo;
          }) ?? null;
      }
    }
  }

  if (!candidatoExistente) {
    return { isDuplicata: false };
  }

  // 3. AI comparison to determine if it's a meaningful update
  const perfilExistente = {
    cargo: candidatoExistente.cargo_pretendido,
    experiencia: candidatoExistente.tempo_experiencia,
    formacao: candidatoExistente.formacao_academica,
    habilidades: candidatoExistente.habilidades,
    resumo: candidatoExistente.resumo_candidato || candidatoExistente.resumo_profissional,
    experiencias: candidatoExistente.experiencias_profissionais,
    email: candidatoExistente.email,
    telefone: candidatoExistente.telefone,
    cidade: candidatoExistente.cidade,
  };

  const novosPerfil = {
    cargo: novosDados.cargo_pretendido,
    experiencia: novosDados.tempo_experiencia,
    formacao: novosDados.formacao_academica,
    habilidades: novosDados.habilidades,
    resumo: novosDados.resumo_candidato || novosDados.resumo_profissional,
    experiencias: novosDados.experiencias_profissionais,
    email: novosDados.email,
    telefone: novosDados.telefone,
    cidade: novosDados.cidade,
  };

  const userPrompt = `Compare these profiles and return ONLY a valid JSON object:
{
  "isAtualizacao": boolean,
  "resumoAtualizacao": string (max 200 chars in Portuguese describing what changed, or "Nenhuma alteração relevante detectada"),
  "mudancas": string[]
}

Consider as meaningful update (isAtualizacao: true) if:
- New job experience added
- New education/certification added
- New skills added (3+ new skills)
- Significant resume content change
- Contact info updated (phone, email, city)

Consider as duplicate (isAtualizacao: false) if:
- Same content with minor wording changes
- No new experiences, education or skills
- Only whitespace or punctuation differences

PERFIL EXISTENTE: ${JSON.stringify(perfilExistente)}
NOVO ENVIO: ${JSON.stringify(novosPerfil)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system:
          "You are an HR data analyst. Compare two candidate profiles and determine if the new submission is a meaningful update or just a duplicate. Return ONLY valid JSON, no markdown.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const aiData = await res.json();
    const texto =
      aiData.content
        ?.map((i: { type: string; text?: string }) => i.text ?? "")
        .join("") ?? "";
    const limpo = texto.replace(/```json|```/g, "").trim();
    const resultado = JSON.parse(limpo);

    return {
      isDuplicata: true,
      candidatoExistente,
      isAtualizacao: Boolean(resultado.isAtualizacao),
      resumoAtualizacao:
        resultado.resumoAtualizacao ?? "Nenhuma alteração relevante detectada",
    };
  } catch {
    // AI failure → treat as plain duplicate (safe default)
    return {
      isDuplicata: true,
      candidatoExistente,
      isAtualizacao: false,
      resumoAtualizacao: "Nenhuma alteração relevante detectada",
    };
  }
}
