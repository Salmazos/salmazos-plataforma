import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: mediaType ?? "application/pdf", data: base64 },
              },
              {
                type: "text",
                text: `Extraia do curriculo as seguintes informacoes e responda APENAS em JSON valido, sem texto adicional:\n{\n  "nome": "nome completo do candidato ou null",\n  "telefone": "telefone com DDD apenas numeros ou null",\n  "cargo": "cargo pretendido ou area de atuacao principal ou null"\n}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("Resposta Anthropic:", JSON.stringify(data));

    if (data.type === "error") {
      return NextResponse.json({ ok: false, erro: data.error?.message }, { status: 500 });
    }

    const texto = data.content?.map((i: { type: string; text?: string }) => i.text || "").join("") || "";
    const limpo = texto.replace(/```json|```/g, "").trim();
    const extraido = JSON.parse(limpo);

    return NextResponse.json({ ok: true, ...extraido });
  } catch (err) {
    console.error("Erro extrair curriculo:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}