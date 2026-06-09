import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

interface DadosQuantitativos {
  acertos?: number | null;
  erros?: number | null;
  omissoes?: number | null;
  pontos?: number | null;
  percentil?: number | null;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  palografico:
    "Você é um psicólogo especialista em grafologia e no teste Palográfico. Analise as imagens do teste manuscrito e forneça um parecer profissional detalhado sobre o perfil comportamental, traços de personalidade, ritmo de trabalho, pressão gráfica e aspectos emocionais identificados.",
  ac: "Você é um psicólogo especialista no Teste AC (Atenção Concentrada) de Cambraia. Analise as imagens do teste. O teste AC consiste em uma folha densa com pequenos símbolos triangulares em diversas orientações, onde o candidato deve marcar com traço de lápis os símbolos-alvo. Os traços de marcação podem ser sutis. Tente identificar e contar as marcações visíveis. Se dados quantitativos foram fornecidos pelo psicólogo, USE-OS como verdade absoluta e elabore o parecer com base neles. Forneça: nível de atenção concentrada, velocidade de processamento, precisão, classificação percentílica e recomendações.",
  disc: "Você é um psicólogo especialista no modelo DISC. Analise as imagens do teste DISC preenchido e identifique o perfil dominante (D, I, S ou C), subperfis, pontos fortes, pontos de desenvolvimento e adequação a ambientes de trabalho.",
};

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
}

function buildUserMessage(
  tipoTeste: string,
  dadosQuantitativos: DadosQuantitativos | null
): string {
  const base =
    "Por favor, analise este teste e forneça um parecer psicológico profissional e detalhado.";

  if (tipoTeste !== "ac" || !dadosQuantitativos) return base;

  const campos = [
    dadosQuantitativos.acertos != null
      ? `Acertos: ${dadosQuantitativos.acertos}`
      : null,
    dadosQuantitativos.erros != null
      ? `Erros: ${dadosQuantitativos.erros}`
      : null,
    dadosQuantitativos.omissoes != null
      ? `Omissões: ${dadosQuantitativos.omissoes}`
      : null,
    dadosQuantitativos.pontos != null
      ? `Pontos: ${dadosQuantitativos.pontos}`
      : null,
    dadosQuantitativos.percentil != null
      ? `Percentil: ${dadosQuantitativos.percentil}`
      : null,
  ].filter((v): v is string => v !== null);

  if (campos.length === 0) return base;

  return `DADOS FORNECIDOS PELO PSICÓLOGO (use estes como verdade absoluta): ${campos.join(", ")}\n\n${base}`;
}

async function analisarPDFComClaude(
  pdfBase64: string,
  tipoTeste: string,
  dadosQuantitativos: DadosQuantitativos | null
): Promise<string> {
  const systemPrompt =
    SYSTEM_PROMPTS[tipoTeste] ?? SYSTEM_PROMPTS.palografico;
  const userMessage = buildUserMessage(tipoTeste, dadosQuantitativos);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            { type: "text", text: userMessage },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as AnthropicMessage;
  return json.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: avaliacao, error: fetchError } = await svc
    .from("avaliacoes_psicologicas")
    .select("candidato_id, tipo_teste, dados_quantitativos")
    .eq("id", id)
    .single();

  if (fetchError || !avaliacao)
    return NextResponse.json(
      { error: "Avaliação não encontrada" },
      { status: 404 }
    );

  const formData = await request.formData();
  const arquivo = formData.get("arquivo") as File | null;

  if (!arquivo)
    return NextResponse.json(
      { error: "Campo 'arquivo' ausente." },
      { status: 400 }
    );

  if (arquivo.type !== "application/pdf")
    return NextResponse.json(
      { error: "Apenas arquivos PDF são aceitos." },
      { status: 400 }
    );

  const MAX_SIZE = 32 * 1024 * 1024;
  if (arquivo.size > MAX_SIZE)
    return NextResponse.json(
      { error: "Arquivo excede o limite de 32 MB." },
      { status: 400 }
    );

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const filename = `${Date.now()}-${arquivo.name.replace(/\s+/g, "_")}`;
  const storagePath = `${avaliacao.candidato_id}/${id}/${filename}`;

  const { error: uploadError } = await svc.storage
    .from("avaliacoes")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 400 });

  await svc
    .from("avaliacoes_psicologicas")
    .update({
      pdf_url: storagePath,
      status: "aplicado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  try {
    const pdfBase64 = buffer.toString("base64");
    const dadosQ = avaliacao.dados_quantitativos as DadosQuantitativos | null;
    const parecerIa = await analisarPDFComClaude(
      pdfBase64,
      avaliacao.tipo_teste,
      dadosQ
    );

    await svc
      .from("avaliacoes_psicologicas")
      .update({
        parecer_ia: parecerIa,
        status: "laudo_emitido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, parecer_ia: parecerIa });
  } catch (aiError) {
    console.error("[upload-pdf] Erro na análise IA:", aiError);
    return NextResponse.json(
      {
        error:
          "PDF salvo, mas a análise IA falhou. Tente gerar o laudo novamente.",
      },
      { status: 500 }
    );
  }
}
