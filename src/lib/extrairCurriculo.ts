import { createServiceClient } from "@/lib/supabase/server";
import mammoth from "mammoth";
import { calcularDuracaoResumo } from "@/lib/calcularDuracaoResumo";
import { calcularTriagem } from "@/lib/triagemAutomatica";

export async function extractAndUpdateCandidato(
  candidatoId: string,
  curriculoUrl: string,
  resumoExistente: string
) {
  const supabaseStorage = createServiceClient();
  const { data: fileBlob, error: downloadError } = await supabaseStorage.storage
    .from("curriculos")
    .download(curriculoUrl);
  if (downloadError || !fileBlob) {
    throw new Error(`Falha ao baixar currículo do storage: ${downloadError?.message ?? "arquivo não encontrado"}`);
  }
  const buffer = await fileBlob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const urlPath = curriculoUrl.split("?")[0];
  const ext = urlPath.split(".").pop()?.toLowerCase() ?? "pdf";
  const mediaType =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "png" ? "image/png" :
    ext === "doc" || ext === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";

  const isWord = mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  let wordText = "";
  if (isWord) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    wordText = result.value;
  }

  const resumoInstruction = resumoExistente
    ? `Escreva um resumo profissional conciso em português (máx 4 linhas), combinando o texto já escrito pelo candidato com as informações do currículo. Preserve a voz do candidato mas enriqueça com os dados extraídos. Texto existente: "${resumoExistente}"`
    : `Escreva um resumo profissional conciso em português (máx 4 linhas) apresentando o candidato como um recrutador faria.`;
  const resumoFinal = resumoInstruction + ` REGRA OBRIGATÓRIA: sempre que mencionar um intervalo de datas, você DEVE calcular e adicionar a duração entre parênteses imediatamente após. Sem exceções. Exemplos que você deve seguir exatamente: '1997 à Atual' → '1997 à Atual (29 anos)' | '1990 à 1997' → '1990 à 1997 (7 anos)' | '1992 à 1996' → '1992 à 1996 (4 anos)' | '2021 – Presente' → '2021 – Presente (5 anos)'. Use 2026 como ano atual. Nunca omita a duração quando datas estiverem presentes. Não invente datas que não estejam no currículo.`;

  const prompt = `Você é um especialista em recrutamento e seleção. Analise este currículo e extraia as informações no formato JSON abaixo. Para o resumo e experiências, escreva como um recrutador apresentando o candidato para um cliente.\n\nResponda APENAS com JSON válido, sem texto adicional:\n{\n  "nome": "nome completo do candidato ou null",\n  "telefone": "telefone com DDD apenas números ou null",\n  "email": "email ou null",\n  "cpf": "CPF apenas números ou null",\n  "cidade": "cidade ou null",\n  "estado": "sigla do estado 2 letras maiúsculas ou null",\n  "cargo": "cargo pretendido ou área de atuação ou null",\n  "idade": "idade em número inteiro ou null",\n  "tempo_experiencia": "tempo total de experiência ex: 15 anos, 2 anos, Sem experiência ou null",\n  "formacao": "formação acadêmica mais recente ou null",\n  "resumo": "${resumoFinal}",\n  "experiencias": [{"empresa": "nome da empresa", "cargo": "cargo exercido", "setor": "setor ou segmento de atuação", "periodo": "datas originais seguidas da duração entre parênteses — exemplos: 2006 – 2015 (9 anos) | Abril/2023 – Novembro/2023 (7 meses) | 2021 – Presente (5 anos). Use 2026 como ano atual para calcular duração de experiências em andamento.", "duracao": "apenas a duração calculada — ex: 9 anos | 7 meses | 2 anos e 3 meses", "descricao": "principais atividades e responsabilidades nesta empresa ou período"}],\n  "habilidades": ["lista de habilidades extraídas — priorize: Atendimento ao cliente, Pacote Office, Excel avançado, Redes sociais, Liderança, Trabalho em equipe, Comunicação, Vendas, Negociação, Gestão de pessoas, Financeiro, Administrativo, Logística, Operacional, Informática, SAP/ERP, Gestão de projetos, Inglês, Espanhol — ou array vazio"]\n}`;

  const isImage = mediaType === "image/jpeg" || mediaType === "image/png";
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

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
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

  const aiData = await aiRes.json();
  const texto = aiData.content?.map((i: { type: string; text?: string }) => i.text || "").join("") || "";
  const limpo = texto.replace(/```json|```/g, "").trim();
  const extraido = JSON.parse(limpo);

  if (typeof extraido.resumo === "string") {
    extraido.resumo = calcularDuracaoResumo(extraido.resumo);
  }

  const supabase = createServiceClient();
  await supabase
    .from("candidatos")
    .update({
      resumo_profissional:        extraido.resumo        || null,
      experiencias_profissionais: Array.isArray(extraido.experiencias)
        ? extraido.experiencias.map((e: object) => JSON.stringify(e)).join("|")
        : extraido.experiencias || null,
      formacao_academica:         extraido.formacao      || null,
      tempo_experiencia:          extraido.tempo_experiencia || undefined,
      idade:                      extraido.idade         || undefined,
      habilidades:                extraido.habilidades?.length ? extraido.habilidades : undefined,
    })
    .eq("id", candidatoId);

  // Run triagem after extraction so the score reflects the enriched profile
  await calcularTriagem(candidatoId).catch(console.error);
}
