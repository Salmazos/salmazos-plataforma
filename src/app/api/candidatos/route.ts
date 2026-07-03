import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { enviarEmailConfirmacao } from "@/lib/email";
import { registrarLogEmail } from "@/lib/emailLogger";
import { calcularTriagem } from "@/lib/triagemAutomatica";
import { calcularMatchCandidato } from "@/lib/calcularMatchCandidato";
import { detectarDuplicata } from "@/lib/detectarDuplicata";
import { consultarProcessos } from "@/lib/consultaJuridica";
import mammoth from "mammoth";
import { calcularDuracaoResumo } from "@/lib/calcularDuracaoResumo";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, candidatoCreateSchema } from "@/lib/schemas";

async function extractAndUpdateCandidato(
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

async function enviarEmailsVaga({
  body,
  candidatoId,
  cargoPretendido,
}: {
  body: Record<string, unknown>;
  candidatoId: string;
  cargoPretendido: string;
}) {
  const email = body.email as string | undefined;
  const vagaId = body.vaga_id as string | undefined;
  const assunto = `✅ Candidatura recebida – ${cargoPretendido} | Salmazos RH`;

  if (email) {
    try {
      await enviarEmailConfirmacao({
        to: email,
        nomeCandidato: body.nome_completo as string,
        cargoPretendido,
      });
      await registrarLogEmail({
        destinatario: email,
        assunto,
        tipo: "confirmacao_candidatura",
        status: "enviado",
        candidato_id: candidatoId,
        vaga_id: vagaId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Email] ERRO confirmação:", msg);
      await registrarLogEmail({
        destinatario: email,
        assunto,
        tipo: "confirmacao_candidatura",
        status: "erro",
        erro_mensagem: msg,
        candidato_id: candidatoId,
        vaga_id: vagaId,
      });
    }
  }
}

export async function GET(request: NextRequest) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    if (body.honeypot && body.honeypot.trim() !== "") {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const parsed = parseBody(candidatoCreateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    if (body.origem !== "cadastro_rapido" && !body.lgpd_consentimento) {
      return NextResponse.json({ error: "Consentimento LGPD obrigatório" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Duplicate detection ────────────────────────────────────────────────────
    const origemTipo: "publico" | "rapido" =
      body.origem === "cadastro_rapido" ? "rapido" : "publico";

    const duplicata = await detectarDuplicata(body, origemTipo);

    if (duplicata.isDuplicata) {
      const existente = duplicata.candidatoExistente;

      if (!duplicata.isAtualizacao) {
        const allVagaIds: string[] = Array.isArray(body.vaga_ids) ? body.vaga_ids : body.vaga_id ? [body.vaga_id] : [];
        if (allVagaIds.length > 0) {
          await supabase
            .from("candidatos")
            .update({ vagas_interesse: allVagaIds })
            .eq("id", existente.id);
        }

        if (origemTipo === "publico") {
          waitUntil(
            enviarEmailsVaga({
              body,
              candidatoId: existente.id,
              cargoPretendido: body.cargo_pretendido,
            })
          );
          return NextResponse.json(
            { ok: true, duplicata: true, redirect: "/obrigado" },
            { status: 200 }
          );
        }
        return NextResponse.json(
          {
            ok: false,
            duplicata: true,
            jaExiste: true,
            candidatoExistente: {
              id: existente.id,
              nome: existente.nome_completo,
              etapa_kanban: existente.etapa_kanban,
              created_at: existente.created_at,
            },
          },
          { status: 409 }
        );
      }

      // Meaningful update — merge non-empty fields into existing record
      const atualizar: Record<string, unknown> = {
        ultima_atualizacao_ia: new Date().toISOString(),
        atualizacao_resumo: duplicata.resumoAtualizacao,
        updated_at: new Date().toISOString(),
      };
      if (body.telefone) atualizar.telefone = body.telefone;
      if (body.email) atualizar.email = body.email;
      if (body.cidade) atualizar.cidade = body.cidade;
      if (body.estado) atualizar.estado = body.estado;
      if (body.cargo_pretendido) atualizar.cargo_pretendido = body.cargo_pretendido;
      if (body.tempo_experiencia) atualizar.tempo_experiencia = body.tempo_experiencia;
      if (body.formacao_academica) atualizar.formacao_academica = body.formacao_academica;
      if (body.habilidades?.length) atualizar.habilidades = body.habilidades;
      if (body.resumo_candidato) atualizar.resumo_candidato = body.resumo_candidato;
      if (body.resumo_profissional) atualizar.resumo_profissional = body.resumo_profissional;
      if (body.experiencias_profissionais) atualizar.experiencias_profissionais = body.experiencias_profissionais;
      if (body.curriculo_url) atualizar.curriculo_url = body.curriculo_url;
      if (body.cpf && !body.cpf.startsWith("TEMP-")) atualizar.cpf = body.cpf;

      await supabase.from("candidatos").update(atualizar).eq("id", existente.id);

      const updateVagaIds: string[] = Array.isArray(body.vaga_ids) ? body.vaga_ids : body.vaga_id ? [body.vaga_id] : [];
      if (updateVagaIds.length > 0) {
        await supabase
          .from("candidatos")
          .update({ vagas_interesse: updateVagaIds })
          .eq("id", existente.id);
      }

      await supabase.from("notificacoes_analista").insert({
        tipo: "atualizacao_curriculo",
        titulo: `Currículo atualizado: ${existente.nome_completo}`,
        mensagem: duplicata.resumoAtualizacao,
        candidato_id: existente.id,
      });

      // Re-run triagem with enriched data
      calcularTriagem(existente.id).catch(() => {});
      waitUntil(calcularMatchCandidato(existente.id).catch(console.error));

      if (origemTipo === "publico") {
        waitUntil(
          enviarEmailsVaga({
            body,
            candidatoId: existente.id,
            cargoPretendido: body.cargo_pretendido,
          })
        );
        return NextResponse.json(
          { ok: true, atualizado: true, redirect: "/obrigado" },
          { status: 200 }
        );
      }
      return NextResponse.json(
        {
          ok: true,
          atualizado: true,
          candidatoId: existente.id,
          nome: existente.nome_completo,
          resumoAtualizacao: duplicata.resumoAtualizacao,
        },
        { status: 200 }
      );
    }
    // ── End duplicate detection ────────────────────────────────────────────────

    let resumo_candidato: string | null = body.resumo_candidato || null;
    if (typeof resumo_candidato === "string" && resumo_candidato.trim()) {
      resumo_candidato = calcularDuracaoResumo(resumo_candidato);
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
        resumo_candidato,
        experiencias_profissionais: body.experiencias_profissionais || null,
        curriculo_url: body.curriculo_url || null,
        idade: body.idade || null,
        formacao_academica: body.formacao_academica || null,
        origem: body.origem || "cadastro_rapido",
        etapa_kanban: "triagem",
        lgpd_consentimento: body.lgpd_consentimento === true,
        lgpd_data_consentimento: body.lgpd_consentimento === true ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/candidatos] Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    void registrarHistorico({
      candidato_id: data.id,
      tipo: "cadastro",
      descricao: `Candidato cadastrado via ${body.origem || "cadastro_rapido"}`,
      metadata: { origem: body.origem || "cadastro_rapido", cargo: body.cargo_pretendido },
      criado_por: body.origem || null,
    });

    registrarAuditoria({
      acao: "candidato_criado",
      entidade: "candidatos",
      entidade_id: data.id,
      detalhes: { nome: data.nome_completo, cargo: data.cargo_pretendido, origem: data.origem },
    });

    // Salvar vagas de interesse e vincular candidato às vagas
    if (data?.id && body.origem !== "cadastro_rapido") {
      const newVagaIds: string[] = Array.isArray(body.vaga_ids) ? body.vaga_ids : body.vaga_id ? [body.vaga_id] : [];
      if (newVagaIds.length > 0) {
        await supabase
          .from("candidatos")
          .update({ vagas_interesse: newVagaIds })
          .eq("id", data.id);
      }
    }

    // Enviar e-mails (confirmação ao candidato + notificação à equipe)
    waitUntil(
      enviarEmailsVaga({
        body,
        candidatoId: data.id,
        cargoPretendido: body.cargo_pretendido,
      })
    );

    // Extrair dados do currículo assincronamente (não bloqueia a resposta)
    // Triagem é disparada dentro de extractAndUpdateCandidato após o enriquecimento.
    // Para candidatos sem currículo, dispara diretamente.
    if (body.curriculo_url) {
      console.log("Triggering AI extraction for candidato:", data.id);
      waitUntil(
        extractAndUpdateCandidato(data.id, body.curriculo_url, body.resumo_candidato ?? "")
          .catch(console.error)
          .finally(() => calcularMatchCandidato(data.id).catch(console.error))
      );
    } else {
      waitUntil(calcularTriagem(data.id).catch(console.error));
      waitUntil(calcularMatchCandidato(data.id).catch(console.error));
    }

    waitUntil(
      (async () => {
        try {
          const svc = createServiceClient();
          const resultado = await consultarProcessos(
            body.nome_completo,
            body.cidade ?? undefined
          );
          const updatePayload: Record<string, unknown> = {
            juridico_consultado_em: new Date().toISOString(),
            juridico_tem_trabalhista: resultado.temTrabalhista,
            juridico_total_processos: resultado.totalProcessos,
            juridico_resumo: resultado.resumo,
          };
          await svc.from("candidatos").update(updatePayload).eq("id", data.id);
        } catch (err) {
          console.error("[consulta-juridica fire-and-forget]", err);
        }
      })()
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/candidatos]", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
