import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const TIPO_LABEL: Record<string, string> = {
  palografico: "Palográfico",
  ac: "AC (Atenção Concentrada)",
  disc: "DISC",
};

const SYSTEM_PROMPT =
  "Você é um psicólogo clínico sênior especialista em avaliação psicológica organizacional. Com base nos pareceres individuais dos testes aplicados, elabore um LAUDO PSICOLÓGICO CONSOLIDADO integrado, profissional e estruturado, adequado para apresentação a um cliente empresarial. O laudo deve incluir: 1) Identificação do avaliado, 2) Instrumentos utilizados, 3) Análise integrada do perfil psicológico, 4) Pontos fortes identificados, 5) Pontos de atenção e desenvolvimento, 6) Conclusão e recomendação para o ambiente de trabalho. Use linguagem técnica e profissional.";

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { candidato_id } = body as { candidato_id?: string };
  if (!candidato_id)
    return NextResponse.json(
      { error: "candidato_id é obrigatório" },
      { status: 400 }
    );

  const svc = createServiceClient();

  const [{ data: avaliacoes, error: avError }, { data: candidato, error: cError }] =
    await Promise.all([
      svc
        .from("avaliacoes_psicologicas")
        .select("tipo_teste, parecer_ia")
        .eq("candidato_id", candidato_id)
        .not("parecer_ia", "is", null)
        .order("created_at", { ascending: true }),
      svc
        .from("candidatos")
        .select("nome_completo")
        .eq("id", candidato_id)
        .single(),
    ]);

  if (avError || cError)
    return NextResponse.json(
      { error: avError?.message ?? cError?.message },
      { status: 400 }
    );

  if (!avaliacoes || avaliacoes.length === 0)
    return NextResponse.json(
      { error: "Nenhum parecer disponível para gerar o laudo." },
      { status: 400 }
    );

  const nome = candidato?.nome_completo ?? "Candidato";

  const pareceresTxt = avaliacoes
    .map(
      (a) =>
        `Teste ${TIPO_LABEL[a.tipo_teste] ?? a.tipo_teste}:\n${a.parecer_ia}`
    )
    .join("\n\n---\n\n");

  const userMessage = `Candidato: ${nome}\n\nPareceres dos testes aplicados:\n\n${pareceresTxt}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3072,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: `Erro na API de IA: ${err}` },
      { status: 500 }
    );
  }

  const json = (await res.json()) as AnthropicMessage;
  const laudo = json.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  return NextResponse.json({ laudo });
}
