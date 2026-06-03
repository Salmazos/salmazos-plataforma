import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { calcularDuracaoResumo } from "@/lib/calcularDuracaoResumo";

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType, resumo_existente } = await req.json();

    const instrucaoResumo = resumo_existente
      ? `Escreva um resumo profissional conciso em português (máx 4 linhas), combinando o texto já escrito pelo candidato com as informações do currículo. Preserve a voz do candidato mas enriqueça com os dados extraídos. Texto existente: "${resumo_existente}". REGRA OBRIGATÓRIA: sempre que mencionar um intervalo de datas, calcule e adicione a duração entre parênteses imediatamente após — ex: '1990 a 1997 (7 anos)', '2021 – Presente (5 anos)'. Use 2026 como ano atual. Não invente datas.`
      : `Escreva um resumo profissional conciso em português (máx 4 linhas) apresentando o candidato como um recrutador faria. REGRA OBRIGATÓRIA: sempre que mencionar um intervalo de datas, você DEVE calcular e adicionar a duração entre parênteses imediatamente após, sem exceções. Exemplos: '1997 à Atual (29 anos)', '1990 à 1997 (7 anos)', '2021 – Presente (5 anos)'. Use 2026 como ano atual. Nunca omita a duração quando datas estiverem presentes. Não invente datas.`;

    const prompt = `Você é um especialista em recrutamento e seleção. Analise este currículo e extraia as informações no formato JSON abaixo. Escreva como um recrutador apresentando o candidato para um cliente — destaque diferenciais, competências e experiências relevantes de forma profissional e persuasiva.

Responda APENAS com JSON válido, sem texto adicional:
{
  "nome": "nome completo do candidato ou null",
  "telefone": "telefone com DDD apenas números ou null",
  "email": "email do candidato ou null",
  "cpf": "CPF apenas números sem pontos e traços ou null",
  "cidade": "cidade do candidato ou null",
  "estado": "sigla do estado com 2 letras maiúsculas ou null",
  "cargo": "cargo pretendido ou área de atuação principal ou null",
  "idade": "idade em número inteiro ou null",
  "tempo_experiencia": "tempo total de experiência profissional resumido — ex: 15 anos, 2 anos, Sem experiência — ou null",
  "formacao": "formação acadêmica mais recente — pode aparecer como Formação Acadêmica, Escolaridade, Educação ou Instrução — ex: Pós-Graduação em Gestão de Pessoas, Cursando Administração, Ensino Médio Completo — ou null",
  "resumo": "${instrucaoResumo}",
  "experiencias": [
    {
      "empresa": "nome da empresa",
      "cargo": "cargo exercido",
      "setor": "setor ou segmento de atuação",
      "periodo": "datas originais seguidas da duração calculada entre parênteses — exemplos: 2006 – 2015 (9 anos) | Abril/2023 – Novembro/2023 (7 meses) | 2021 – Presente (5 anos). Use 2026 como ano atual para calcular duração de experiências em andamento.",
      "duracao": "apenas a duração calculada — ex: 9 anos | 7 meses | 2 anos e 3 meses",
      "descricao": "principais atividades e responsabilidades nesta empresa ou período"
    }
  ],
  "habilidades": ["lista de habilidades extraídas do currículo — priorize: Atendimento ao cliente, Pacote Office, Excel avançado, Redes sociais, Liderança, Trabalho em equipe, Comunicação, Vendas, Negociação, Gestão de pessoas, Financeiro, Administrativo, Logística, Operacional, Informática, SAP/ERP, Gestão de projetos, Atendimento ao público, Inglês, Espanhol — inclua também habilidades relevantes fora da lista — ou array vazio"]
}`;

    const isImage = mediaType === "image/jpeg" || mediaType === "image/png";
    const isWord = mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let wordText = "";
    if (isWord) {
      const buffer = Buffer.from(base64, "base64");
      const result = await mammoth.extractRawText({ buffer });
      wordText = result.value;
    }

    const content = isWord
      ? [{ type: "text", text: `Extraia do currículo abaixo as informações em JSON:\n\n${wordText}\n\n${prompt}` }]
      : isImage
      ? [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt },
        ]
      : [
          { type: "document", source: { type: "base64", media_type: mediaType ?? "application/pdf", data: base64 } },
          { type: "text", text: prompt },
        ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content }],
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

    if (typeof extraido.resumo === "string") {
      extraido.resumo = calcularDuracaoResumo(extraido.resumo);
    }

    const experienciasStr = Array.isArray(extraido.experiencias)
      ? extraido.experiencias.map((e: object) => JSON.stringify(e)).join("|")
      : extraido.experiencias ?? "";

    return NextResponse.json({ ok: true, ...extraido, experiencias: experienciasStr });
  } catch (err) {
    console.error("Erro extrair curriculo:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
