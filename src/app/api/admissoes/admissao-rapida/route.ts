import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, admissaoRapidaSchema } from "@/lib/schemas";
import { generateUniqueSlug } from "@/lib/slug";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { sincronizarEncaminhamentoComEtapa } from "@/lib/sincronizarEncaminhamento";

// "Vaga casada": o cliente já traz o candidato pronto pra registro, sem processo seletivo
// (ver comentário completo em admissaoRapidaSchema, lib/schemas.ts). Esta rota é dedicada —
// não reaproveita POST /api/vagas (dispara e-mail/sino de "nova vaga criada" pra toda a
// equipe, errado aqui: não é uma vaga real em aberto) nem PATCH .../finalizar (dispara
// fluxo de fee/garantia R&S e outros efeitos colaterais pensados pro funil normal).
function statusAlocacao(tipoServico: "mao_obra_temporaria" | "terceirizacao"): string {
  return tipoServico === "mao_obra_temporaria" ? "alocado_mot" : "alocado_terceirizacao";
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarPapelAdmissoes(user);
    if (acessoNegado) return acessoNegado;

    const body = await request.json();
    const parsed = parseBody(admissaoRapidaSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const {
      cliente_id, tipo_servico, funcao,
      candidato_nome, candidato_telefone, candidato_email, candidato_cpf,
      confirmar_duplicata,
    } = parsed.data;

    const supabase = createServiceClient();

    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, nome, entidade_contratante")
      .eq("id", cliente_id)
      .maybeSingle();
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });

    // Match de CPF exato (nunca nome/telefone aproximado — "nunca decide no escuro"): só
    // trava aqui porque candidatos.cpf tem constraint UNIQUE no banco, então um CPF que já
    // existe quebraria o insert abaixo de qualquer forma. Mesmo com match confiável, o
    // reaproveitamento do cadastro exige confirmação explícita do RH antes de prosseguir —
    // vincular alguém a uma vaga e já marcar como contratado é uma ação de alto impacto pra
    // decidir sozinho.
    let candidatoId: string;
    let candidatoNomeFinal: string;
    let candidatoTelefoneFinal: string | null;
    let candidatoReaproveitado = false;

    const cpfLimpo = candidato_cpf?.trim() || null;
    let candidatoExistente: { id: string; nome_completo: string; etapa_kanban: string; created_at: string } | null = null;
    if (cpfLimpo) {
      const { data: existente } = await supabase
        .from("candidatos")
        .select("id, nome_completo, etapa_kanban, created_at")
        .eq("cpf", cpfLimpo)
        .maybeSingle();
      candidatoExistente = existente;
    }

    if (candidatoExistente && !confirmar_duplicata) {
      return NextResponse.json(
        {
          error: "Já existe um candidato cadastrado com este CPF.",
          jaExiste: true,
          candidatoExistente,
        },
        { status: 409 }
      );
    }

    if (candidatoExistente) {
      candidatoId = candidatoExistente.id;
      candidatoNomeFinal = candidatoExistente.nome_completo;
      const { data: candidatoAtual } = await supabase
        .from("candidatos")
        .select("telefone")
        .eq("id", candidatoExistente.id)
        .maybeSingle();
      candidatoTelefoneFinal = candidatoAtual?.telefone ?? candidato_telefone?.trim() ?? null;
      candidatoReaproveitado = true;
    } else {
      const { data: novoCandidato, error: candidatoError } = await supabase
        .from("candidatos")
        .insert({
          nome_completo: candidato_nome.trim(),
          // telefone/email são NOT NULL no banco (sem default) — "" é o vazio válido usado
          // em todo o resto do app quando o dado é opcional na tela (ver ModalCadastroRapido).
          telefone: candidato_telefone?.trim() || "",
          email: candidato_email?.trim() || "",
          cpf: cpfLimpo || `TEMP-${Date.now()}`,
          cargo_pretendido: funcao.trim(),
          etapa_kanban: "triagem",
          origem: "admissao_rapida",
        })
        .select("id, nome_completo, telefone")
        .single();
      if (candidatoError) {
        console.error("[POST /api/admissoes/admissao-rapida] Erro ao criar candidato:", candidatoError);
        return NextResponse.json({ error: candidatoError.message }, { status: 400 });
      }
      candidatoId = novoCandidato.id;
      candidatoNomeFinal = novoCandidato.nome_completo;
      candidatoTelefoneFinal = novoCandidato.telefone;

      void registrarHistorico({
        candidato_id: candidatoId,
        tipo: "cadastro",
        descricao: `Candidato cadastrado via Admissão Rápida (vaga casada), cliente ${cliente.nome}.`,
        metadata: { origem: "admissao_rapida", cliente_id, cargo: funcao.trim() },
        criado_por: user.id,
      });

      registrarAuditoria({
        usuario_id: user.id,
        acao: "candidato_criado",
        entidade: "candidatos",
        entidade_id: candidatoId,
        detalhes: { nome: candidatoNomeFinal, cargo: funcao.trim(), origem: "admissao_rapida" },
      });
    }

    const responsavel = await resolverNomeUsuario(user.id, user.email ?? null, supabase);
    const slug = await generateUniqueSlug(funcao.trim(), supabase);
    const agoraISO = new Date().toISOString();
    const hojeISO = agoraISO.split("T")[0];

    // Nasce e já morre "fechada": não é uma vaga real em processo, já veio preenchida pelo
    // cliente. visivel_publicamente=false é redundante com status='fechada' (ambos já
    // escondem do site, ver vagas/page.tsx e vagas/[slug]/page.tsx), mantido pra nunca
    // depender de só um dos dois filtros.
    const { data: vaga, error: vagaError } = await supabase
      .from("vagas")
      .insert({
        titulo: funcao.trim(),
        slug,
        cliente_id: cliente.id,
        tipo_servico,
        num_posicoes: 1,
        num_posicoes_abertas: 0,
        status: "fechada",
        visivel_publicamente: false,
        responsavel: responsavel ?? (user.email ?? "Admissão Rápida"),
        confidencial: false,
        taxa_cancelamento: false,
        observacoes: `Vaga casada — criada via Admissão Rápida para registrar ${candidatoNomeFinal}, indicado diretamente pelo cliente ${cliente.nome}.`,
        data_abertura: agoraISO,
        data_fechamento: agoraISO,
      })
      .select("id, titulo, tipo_servico, cliente_id")
      .single();
    if (vagaError) {
      console.error("[POST /api/admissoes/admissao-rapida] Erro ao criar vaga:", vagaError);
      return NextResponse.json({ error: vagaError.message }, { status: 400 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      acao: "vaga_criada",
      entidade: "vagas",
      entidade_id: vaga.id,
      detalhes: { titulo: vaga.titulo, tipo_servico: vaga.tipo_servico, status: "fechada", origem: "admissao_rapida" },
    });

    const { data: cv, error: cvError } = await supabase
      .from("candidatos_vagas")
      .insert({
        vaga_id: vaga.id,
        candidato_id: candidatoId,
        cliente_id: cliente.id,
        etapa: "contratado",
        data_inicio: hojeISO,
        responsavel,
      })
      .select("id")
      .single();
    if (cvError) {
      console.error("[POST /api/admissoes/admissao-rapida] Erro ao vincular candidato à vaga:", cvError);
      return NextResponse.json({ error: cvError.message }, { status: 400 });
    }

    void sincronizarEncaminhamentoComEtapa(candidatoId, cliente.id, "contratado", supabase);

    await supabase
      .from("candidatos")
      .update({
        status_alocacao: statusAlocacao(tipo_servico),
        alocacao_cliente_nome: cliente.nome,
        alocacao_vaga_titulo: vaga.titulo,
        alocacao_data_inicio: hojeISO,
        alocacao_data_fim: null,
        alocacao_tipo_servico: tipo_servico,
        alocacao_renovavel: tipo_servico === "terceirizacao",
      })
      .eq("id", candidatoId);

    void registrarHistorico({
      candidato_id: candidatoId,
      tipo: "contratado",
      descricao: `Registrado via Admissão Rápida (vaga casada) para ${cliente.nome} — ${funcao.trim()}.`,
      metadata: { cv_id: cv.id, vaga_id: vaga.id, data_inicio: hojeISO, tipo_servico, origem: "admissao_rapida" },
    });

    registrarAuditoria({
      usuario_id: user.id,
      acao: "admissao_rapida_criada",
      entidade: "candidatos_vagas",
      entidade_id: cv.id,
      detalhes: {
        candidato_id: candidatoId, vaga_id: vaga.id, cliente_id: cliente.id,
        tipo_servico, funcao: funcao.trim(), candidato_reaproveitado: candidatoReaproveitado,
      },
    });

    return NextResponse.json({
      data: {
        id: cv.id,
        candidato_id: candidatoId,
        vaga_id: vaga.id,
        candidatos: { id: candidatoId, nome_completo: candidatoNomeFinal, cargo_pretendido: funcao.trim(), telefone: candidatoTelefoneFinal },
        vagas: {
          id: vaga.id, titulo: vaga.titulo, tipo_servico,
          cliente_id: cliente.id,
          clientes: { nome: cliente.nome, entidade_contratante: cliente.entidade_contratante ?? null },
        },
        tipo_servico_vigente: tipo_servico,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admissoes/admissao-rapida]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
