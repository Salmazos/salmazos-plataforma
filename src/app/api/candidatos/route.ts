import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { enviarEmailConfirmacao } from "@/lib/email";
import mammoth from "mammoth";
import { calcularDuracaoResumo } from "@/lib/calcularDuracaoResumo";

async function extractAndUpdateCandidato(
  candidatoId: string,
  curriculoUrl: string,
  resumoExistente: string
) {
  const fileRes = await fetch(curriculoUrl);
  const buffer = await fileRes.arrayBuffer();
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
}

export async function GET(request: NextRequest) {
  const busca  = request.nextUrl.searchParams.get("busca") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "ativo";

  const supabase = createServiceClient();
  let query = supabase
    .from("candidatos")
    .select("id, nome_completo, cargo_pretendido, cidade, estado, origem, etapa_kanban, responsavel, status")
    .order("nome_completo")
    .limit(30);

  if (status) query = query.eq("status", status);
  if (busca)  query = query.ilike("nome_completo", `%${busca}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const required = [
      "nome_completo",
      "telefone",
      "cargo_pretendido",
      "tempo_experiencia",
      "turno_disponivel",
    ];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Campo obrigatório ausente: ${field}` },
          { status: 400 }
        );
      }
    }

    const supabase = createServiceClient();

    // Verificar CPF duplicado apenas quando informado
    if (body.cpf) {
      const { data: existente } = await supabase
        .from("candidatos")
        .select("id")
        .eq("cpf", body.cpf)
        .maybeSingle();

      if (existente) {
        return NextResponse.json(
          { error: "Já existe um cadastro com este CPF." },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("candidatos")
      .insert({
        nome_completo: body.nome_completo,
        cpf: body.cpf || `TEMP-${Date.now()}`,
        telefone: body.telefone,
        email: body.email,
        cidade: body.cidade,
        estado: body.estado,
        cargo_pretendido: body.cargo_pretendido,
        tempo_experiencia: body.tempo_experiencia,
        turno_disponivel: body.turno_disponivel,
        pretensao_salarial: body.pretensao_salarial || null,
        habilidades: body.habilidades || [],
        resumo_profissional: body.resumo_profissional || null,
        resumo_candidato: body.resumo_candidato || null,
        experiencias_profissionais: body.experiencias_profissionais || null,
        curriculo_url: body.curriculo_url || null,
        idade: body.idade || null,
        formacao_academica: body.formacao_academica || null,
        origem: body.origem || "Banco de talentos",
        etapa_kanban: "triagem",
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/candidatos] Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    // Enviar e-mail de confirmação apenas quando e-mail foi informado
    if (body.email) {
      enviarEmailConfirmacao({
        to: body.email,
        nomeCandidato: body.nome_completo,
        cargoPretendido: body.cargo_pretendido,
      }).catch((err) => console.error("[Email]", err));
    }

    // Extrair dados do currículo assincronamente (não bloqueia a resposta)
    if (body.curriculo_url) {
      console.log("Triggering AI extraction for candidato:", data.id);
      void extractAndUpdateCandidato(data.id, body.curriculo_url, body.resumo_candidato ?? "")
        .catch(console.error);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/candidatos]", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
