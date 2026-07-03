import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { enviarEmailConfirmacao } from "@/lib/email";
import { registrarLogEmail } from "@/lib/emailLogger";
import { calcularTriagem } from "@/lib/triagemAutomatica";
import { calcularMatchCandidato } from "@/lib/calcularMatchCandidato";
import { extractAndUpdateCandidato } from "@/lib/extrairCurriculo";
import { detectarDuplicata } from "@/lib/detectarDuplicata";
import { consultarProcessos } from "@/lib/consultaJuridica";
import { calcularDuracaoResumo } from "@/lib/calcularDuracaoResumo";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, candidatoCreateSchema } from "@/lib/schemas";

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
