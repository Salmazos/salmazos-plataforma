import { SITE_URL } from "@/lib/siteUrl";
import { resolverDestinatarios } from "@/lib/avisos";
import { emailsOuPadrao } from "@/lib/avisosResolucao";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, indicacaoCandidatoDecisaoSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { sendEmail } from "@/lib/sendEmail";
import { defaultsCandidatoNovo } from "@/lib/candidatoDefaults";
import { criarAvisoCliente } from "@/lib/avisoCliente";
import { chaveDedupAviso, textoAvisoIndicacaoDecidida } from "@/lib/avisoClienteRegras";

interface Params {
  params: Promise<{ id: string }>;
}

interface CriadosNestasRequisicao {
  candidatoId?: string;
  candidatoVagaId?: string;
  encaminhamentoId?: string;
}

interface ResultadoReversao {
  erroEncaminhamento?: string | null;
  erroCandidatoVaga?: string | null;
  erroCandidato?: string | null;
  sucesso: boolean;
}

async function reverterCriados(
  service: ReturnType<typeof createServiceClient>,
  ids: CriadosNestasRequisicao
): Promise<ResultadoReversao> {
  const resultado: ResultadoReversao = { sucesso: true };

  if (ids.encaminhamentoId) {
    const { error: encErr } = await service
      .from("encaminhamentos")
      .delete()
      .eq("id", ids.encaminhamentoId);
    if (encErr) {
      resultado.erroEncaminhamento = msgErro(encErr);
      resultado.sucesso = false;
    }
  }

  if (ids.candidatoVagaId) {
    const { error: cvErr } = await service
      .from("candidatos_vagas")
      .delete()
      .eq("id", ids.candidatoVagaId);
    if (cvErr) {
      resultado.erroCandidatoVaga = msgErro(cvErr);
      resultado.sucesso = false;
    }
  }

  if (ids.candidatoId) {
    const { error: canErr } = await service
      .from("candidatos")
      .delete()
      .eq("id", ids.candidatoId);
    if (canErr) {
      resultado.erroCandidato = msgErro(canErr);
      resultado.sucesso = false;
    }
  }

  return resultado;
}

function gerarSuffixoAleatorio(): string {
  return Math.random().toString(36).substring(2, 10);
}

function msgErro(e: unknown): string {
  if (e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    if (err.message) {
      const details = [err.message];
      if (err.code) details.push(`code: ${err.code}`);
      if (err.details) details.push(`details: ${err.details}`);
      return details.join(" | ");
    }
  }
  return JSON.stringify(e);
}

const ADM_LABELS: Record<string, string> = {
  admissao_data_inicio: "Data de Início",
  admissao_setor: "Setor",
  admissao_centro_custo: "Centro de Custo",
  admissao_horario: "Horário",
  admissao_gestor: "Gestor Direto",
  admissao_periodo_experiencia: "Período de Experiência",
  admissao_funcao: "Função",
  admissao_turno: "Turno",
  admissao_escala: "Escala",
  admissao_tempo_contrato: "Tempo de Contrato",
  admissao_vt: "Vale Transporte",
  admissao_exame_responsavel: "Exame Admissional",
  admissao_local_integracao: "Local/Data Integração",
  admissao_observacoes: "Observações",
};

// Decisão do analista sobre uma indicação direta de candidato (mesmo padrão de
// POST /api/solicitacoes-vagas/[id]/alteracao — discriminated union aprovar/recusar).
//
// Aprovar NÃO cria o candidato já "contratado": cria candidato + candidatos_vagas na etapa
// "aprovado_cliente" (o mesmo estado em que uma aprovação normal via portal/avaliar deixa as
// coisas) + um encaminhamento "aprovado", e o analista segue dali com o "Finalizar" normal do
// Kanban — que já recalcula garantia, fee e fechamento automático de posição (incl. a correção
// de MOT reativada). Isso evita duplicar essa lógica aqui.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(indicacaoCandidatoDecisaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: sol } = await service
      .from("solicitacoes_indicacao_candidato")
      .select("*, vagas(id, titulo, tipo_servico, cidade, estado, cliente_id, status)")
      .eq("id", id)
      .maybeSingle();

    if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) {
      return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
    }
    if (sol.status !== "pendente") {
      return NextResponse.json({ error: "Esta indicação já foi decidida." }, { status: 409 });
    }

    const usuarioNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaga = sol.vagas as any;

    if (parsed.data.acao === "recusar") {
      const { data: decidida } = await service
        .from("solicitacoes_indicacao_candidato")
        .update({
          status: "recusada",
          motivo_recusa: parsed.data.motivo,
          decidido_por: usuarioNome,
          decidido_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pendente")
        .select("*")
        .single();

      if (!decidida) {
        return NextResponse.json({ error: "A indicação mudou de status enquanto era analisada." }, { status: 409 });
      }

      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: "indicacao_candidato_recusada",
        entidade: "solicitacoes_indicacao_candidato",
        entidade_id: id,
        detalhes: { cliente: sol.cliente_nome, candidato_nome: sol.candidato_nome, motivo: parsed.data.motivo },
      });

      // Aviso ao cliente no portal (sino e popup, conforme Configurações > Avisos). Chamada extra, isolada
      // e que nunca lança: a decisão acima já foi gravada. Só texto que o cliente já vê (candidato, vaga e
      // o motivo da recusa, igual a /portal/minhas-indicacoes).
      await criarAvisoCliente("indicacao_decidida_cliente", sol.cliente_id, () => ({
        ...textoAvisoIndicacaoDecidida({ decisao: "recusada", candidato: sol.candidato_nome, vagaTitulo: vaga?.titulo, motivo: decidida.motivo_recusa }),
        link: "/portal/minhas-indicacoes",
        referencia_tipo: "indicacao_candidato",
        referencia_id: id,
        chaveDedup: chaveDedupAviso("indicacao_decidida_cliente", id, `recusada:${decidida.decidido_em}`),
      }));

      return NextResponse.json({ data: decidida });
    }

    // ── Aprovar ──────────────────────────────────────────────────────────────────────
    if (!vaga || vaga.status !== "aberta") {
      return NextResponse.json({ error: "A vaga desta indicação não está mais aberta." }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    let candidato: { id: string };
    let vinculadoAoCandidatoExistente = false;

    // Se candidato_existente_id foi informado, usar o candidato existente
    if (parsed.data.candidato_existente_id) {
      const { data: candExistente } = await service
        .from("candidatos")
        .select("id, etapa_kanban")
        .eq("id", parsed.data.candidato_existente_id)
        .maybeSingle();

      if (!candExistente) {
        return NextResponse.json({ error: "Candidato existente não encontrado." }, { status: 404 });
      }

      candidato = candExistente;
      vinculadoAoCandidatoExistente = true;

      // Validar que o candidato não tem candidatura ativa nesta mesma vaga
      const { data: jaEmVaga, error: jaEmVagaErr } = await service
        .from("candidatos_vagas")
        .select("id")
        .eq("candidato_id", candidato.id)
        .eq("vaga_id", vaga.id)
        .limit(1)
        .maybeSingle();

      if (jaEmVagaErr) {
        console.error("[decisao indicacao] Erro ao verificar se já está na vaga:", jaEmVagaErr);
      }

      if (jaEmVaga) {
        await registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          acao: "indicacao_candidato_erro_ja_candidatou_mesma_vaga",
          entidade: "solicitacoes_indicacao_candidato",
          entidade_id: id,
          detalhes: { candidato_id: candidato.id, vaga_id: vaga.id, cliente: sol.cliente_nome },
        });
        return NextResponse.json({
          error: "Este candidato já possui uma candidatura nesta mesma vaga.",
        }, { status: 409 });
      }
    } else {
      // Criar novo candidato (fluxo original)
      const cpf = `TEMP-${Date.now()}-${gerarSuffixoAleatorio()}`;

      const { data: candidatoNovo, error: candidatoErr } = await service
        .from("candidatos")
        .insert({
          nome_completo: sol.candidato_nome,
          cpf,
          telefone: sol.candidato_telefone,
          email: "",
          cidade: vaga.cidade ?? "",
          estado: vaga.estado ?? "",
          cargo_pretendido: vaga.titulo,
          ...defaultsCandidatoNovo(),
          curriculo_url: sol.curriculo_url ?? null,
          origem: "indicacao_direta_cliente",
          etapa_kanban: "aprovado_cliente",
          responsavel: usuarioNome || null,
        })
        .select("id")
        .single();

      if (candidatoErr || !candidatoNovo) {
        console.error("[decisao indicacao] Erro ao criar candidato:", candidatoErr);
        return NextResponse.json({ error: "Não foi possível criar o candidato." }, { status: 400 });
      }

      candidato = candidatoNovo;
    }

    const { data: candidatoVaga, error: cvErr } = await service
      .from("candidatos_vagas")
      .insert({
        vaga_id: vaga.id,
        candidato_id: candidato.id,
        cliente_id: vaga.cliente_id,
        etapa: "aprovado_cliente",
        responsavel: usuarioNome || null,
        admissao_data_inicio: sol.admissao_data_inicio,
        admissao_salario: sol.admissao_salario,
        admissao_salario_hora: sol.admissao_salario_hora,
        admissao_setor: sol.admissao_setor,
        admissao_centro_custo: sol.admissao_centro_custo,
        admissao_horario: sol.admissao_horario,
        admissao_gestor: sol.admissao_gestor,
        admissao_periodo_experiencia: sol.admissao_periodo_experiencia,
        admissao_funcao: sol.admissao_funcao,
        admissao_turno: sol.admissao_turno,
        admissao_escala: sol.admissao_escala,
        admissao_tempo_contrato: sol.admissao_tempo_contrato,
        admissao_vt: sol.admissao_vt,
        admissao_exame_responsavel: sol.admissao_exame_responsavel,
        admissao_local_integracao: sol.admissao_local_integracao,
        admissao_observacoes: sol.admissao_observacoes,
      })
      .select("id")
      .single();

    if (cvErr || !candidatoVaga) {
      console.error("[decisao indicacao] Erro ao vincular candidato à vaga:", cvErr);
      const reversao = await reverterCriados(service, { ...(vinculadoAoCandidatoExistente ? {} : { candidatoId: candidato.id }) });
      if (!reversao.sucesso) {
        await registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          acao: "indicacao_candidato_erro_candidatos_vagas_rollback_falhou",
          entidade: "solicitacoes_indicacao_candidato",
          entidade_id: id,
          detalhes: {
            erro_candidatos_vagas: msgErro(cvErr),
            erro_delete_candidatos: reversao.erroCandidato,
            candidato_id_orfo: candidato.id,
          },
        });
        return NextResponse.json({ error: "Falha ao vincular candidato e não foi possível reverter. Conferir banco de dados (registros órfãos)." }, { status: 500 });
      }
      await registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: "indicacao_candidato_erro_candidatos_vagas",
        entidade: "solicitacoes_indicacao_candidato",
        entidade_id: id,
        detalhes: { erro: msgErro(cvErr), cliente: sol.cliente_nome, vaga_id: vaga.id },
      });
      return NextResponse.json({ error: "Não foi possível vincular o candidato à vaga." }, { status: 400 });
    }

    // Encaminhamento é obrigatório — se falhar, rollback de tudo que foi criado nesta requisição.
    let encaminhamentoId: string | undefined;
    if (vaga.cliente_id) {
      const { data: encaminhamento, error: encErr } = await service
        .from("encaminhamentos")
        .insert({
          candidato_id: candidato.id,
          cliente_id: vaga.cliente_id,
          vaga_id: vaga.id,
          status: "aprovado",
          tipo_servico: vaga.tipo_servico,
          avaliado_em: nowIso,
        })
        .select("id")
        .single();

      if (encErr || !encaminhamento) {
        console.error("[decisao indicacao] Erro ao criar encaminhamento:", encErr);
        const reversao = await reverterCriados(service, {
          ...(vinculadoAoCandidatoExistente ? {} : { candidatoId: candidato.id }),
          candidatoVagaId: candidatoVaga.id,
        });

        if (!reversao.sucesso) {
          await registrarAuditoria({
            usuario_id: user.id,
            usuario_nome: usuarioNome,
            acao: "indicacao_candidato_erro_encaminhamento_rollback_falhou",
            entidade: "solicitacoes_indicacao_candidato",
            entidade_id: id,
            detalhes: {
              erro_encaminhamento: msgErro(encErr),
              erro_delete_candidatos_vagas: reversao.erroCandidatoVaga,
              erro_delete_candidatos: reversao.erroCandidato,
              candidato_id_orfo: candidato.id,
              candidatos_vaga_id_orfo: candidatoVaga.id,
            },
          });
          return NextResponse.json({ error: "Falha ao criar encaminhamento e não foi possível reverter. Conferir banco de dados (registros órfãos)." }, { status: 500 });
        }

        await registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          acao: "indicacao_candidato_erro_encaminhamento",
          entidade: "solicitacoes_indicacao_candidato",
          entidade_id: id,
          detalhes: { erro: msgErro(encErr), cliente: sol.cliente_nome, vaga_id: vaga.id },
        });
        return NextResponse.json({ error: "Não foi possível criar o encaminhamento (cliente não veria o candidato aprovado no portal). Indicação não foi aprovada." }, { status: 500 });
      }
      encaminhamentoId = encaminhamento.id;
    }

    const { data: aprovada, error: updateErr } = await service
      .from("solicitacoes_indicacao_candidato")
      .update({
        status: "aprovada",
        candidato_id: candidato.id,
        candidatos_vaga_id: candidatoVaga.id,
        decidido_por: usuarioNome,
        decidido_em: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("status", "pendente")
      .select("*")
      .maybeSingle();

    // Caso 1: Erro de banco
    if (updateErr) {
      console.error("[decisao indicacao] Erro ao marcar indicação como aprovada:", updateErr);
      const reversao = await reverterCriados(service, {
        ...(vinculadoAoCandidatoExistente ? {} : { candidatoId: candidato.id }),
        candidatoVagaId: candidatoVaga.id,
        encaminhamentoId,
      });

      if (!reversao.sucesso) {
        await registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          acao: "indicacao_candidato_erro_update_rollback_falhou",
          entidade: "solicitacoes_indicacao_candidato",
          entidade_id: id,
          detalhes: {
            erro_update: msgErro(updateErr),
            erro_delete_encaminhamentos: reversao.erroEncaminhamento,
            erro_delete_candidatos_vagas: reversao.erroCandidatoVaga,
            erro_delete_candidatos: reversao.erroCandidato,
            candidato_id_orfo: candidato.id,
            candidatos_vaga_id_orfo: candidatoVaga.id,
            encaminhamento_id_orfo: encaminhamentoId,
          },
        });
        return NextResponse.json({ error: "Falha ao finalizar indicação e não foi possível reverter. Conferir banco de dados (registros órfãos)." }, { status: 500 });
      }

      await registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: "indicacao_candidato_erro_update",
        entidade: "solicitacoes_indicacao_candidato",
        entidade_id: id,
        detalhes: { erro: msgErro(updateErr) },
      });
      return NextResponse.json({ error: "Erro ao finalizar a indicação." }, { status: 500 });
    }

    // Caso 2: Indicação já não está pendente (aprovada por outro analista)
    if (!aprovada) {
      const reversao = await reverterCriados(service, {
        ...(vinculadoAoCandidatoExistente ? {} : { candidatoId: candidato.id }),
        candidatoVagaId: candidatoVaga.id,
        encaminhamentoId,
      });

      if (!reversao.sucesso) {
        await registrarAuditoria({
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          acao: "indicacao_candidato_concorrencia_rollback_falhou",
          entidade: "solicitacoes_indicacao_candidato",
          entidade_id: id,
          detalhes: {
            erro_delete_encaminhamentos: reversao.erroEncaminhamento,
            erro_delete_candidatos_vagas: reversao.erroCandidatoVaga,
            erro_delete_candidatos: reversao.erroCandidato,
            candidato_id_orfo: candidato.id,
            candidatos_vaga_id_orfo: candidatoVaga.id,
            encaminhamento_id_orfo: encaminhamentoId,
          },
        });
        return NextResponse.json({ error: "Falha ao reverter: esta indicação foi decidida por outro analista. Conferir banco de dados (registros órfãos)." }, { status: 500 });
      }

      await registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: usuarioNome,
        acao: "indicacao_candidato_aprovacao_concorrente",
        entidade: "solicitacoes_indicacao_candidato",
        entidade_id: id,
        detalhes: { candidato_id_criado: candidato.id },
      });
      return NextResponse.json({ error: "Esta indicação já foi decidida por outro analista." }, { status: 409 });
    }

    await registrarHistorico({
      candidato_id: candidato.id,
      tipo: vinculadoAoCandidatoExistente ? "encaminhamento" : "cadastro",
      descricao: vinculadoAoCandidatoExistente
        ? `Candidato vinculado por indicação direta de ${sol.cliente_nome ?? "cliente"} (${usuarioNome})`
        : `Candidato registrado por indicação direta de ${sol.cliente_nome ?? "cliente"} (${usuarioNome})`,
      metadata: { origem: "indicacao_direta_cliente", vaga_id: vaga.id, solicitacao_id: id, vinculado_existente: vinculadoAoCandidatoExistente },
      criado_por: usuarioNome,
    });

    await registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: vinculadoAoCandidatoExistente ? "indicacao_candidato_aprovada_vinculada" : "indicacao_candidato_aprovada",
      entidade: "solicitacoes_indicacao_candidato",
      entidade_id: id,
      detalhes: {
        cliente: sol.cliente_nome,
        candidato_id: candidato.id,
        candidatos_vaga_id: candidatoVaga.id,
        vaga_id: vaga.id,
        vinculado_candidato_existente: vinculadoAoCandidatoExistente,
      },
    });

    // E-mail pro RH com os dados de admissão que o cliente já mandou — mesmo público que recebe
    // isso hoje quando o cliente aprova pelo portal (ver /api/portal/avaliar), já que essa
    // indicação nunca passa por lá.
    try {
      let admRows = "";
      if (sol.admissao_salario_hora != null) {
        admRows += `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">Salário</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">R$ ${Number(sol.admissao_salario_hora).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/hora (Horista)</td></tr>`;
      } else if (sol.admissao_salario != null) {
        admRows += `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">Salário</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">R$ ${Number(sol.admissao_salario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</td></tr>`;
      }
      for (const [key, label] of Object.entries(ADM_LABELS)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = (sol as any)[key];
        if (val != null && val !== "" && val !== false) {
          const display = typeof val === "boolean" ? (val ? "Sim" : "Não")
            : key === "admissao_data_inicio" ? String(val).split("-").reverse().join("/")
            : String(val);
          admRows += `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${label}</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${display}</td></tr>`;
        }
      }

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">🧑‍💼 Indicação Direta Aprovada</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Candidato</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${sol.candidato_nome}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${sol.candidato_telefone} · CPF/e-mail a completar pelo RH</p>
    </div>
    <div style="margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:8px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Vaga</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${vaga.titulo}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${sol.cliente_nome ?? ""}</p>
    </div>
    ${admRows ? `<div style="margin-bottom:20px"><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">📋 Dados para Admissão</p><table style="width:100%;border-collapse:collapse">${admRows}</table></div>` : ""}
    ${sol.curriculo_url ? `<p style="margin:0 0 20px;font-size:13px;color:#374151">📎 Currículo anexado no perfil do candidato.</p>` : ""}
    <div style="text-align:center;padding-top:16px;border-top:1px solid #f3f4f6">
      <a href="${SITE_URL}/painel/candidato/${candidato.id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil completo</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;

      // Padrão antigo (fixo) vale enquanto não houver config em Configurações > Avisos
      // (evento indicacao_decisao_cliente).
      const DESTINATARIOS_PADRAO = ["olver@salmazos.com.br", "rh@salmazos.com.br"];
      const DESTINATARIOS = emailsOuPadrao(await resolverDestinatarios("indicacao_decisao_cliente", "email"), DESTINATARIOS_PADRAO);
      await Promise.all(
        DESTINATARIOS.map((destinatario) =>
          sendEmail({
            to: destinatario,
            subject: `🧑‍💼 Indicação Direta Aprovada — ${sol.candidato_nome} — ${sol.cliente_nome ?? ""}`,
            html,
            tipo: "indicacao_candidato_aprovada",
            candidato_id: candidato.id,
            vaga_id: vaga.id,
          })
        )
      );
    } catch (emailErr) {
      console.error("[decisao indicacao] Erro ao enviar e-mail pro RH:", emailErr);
    }

    // Aviso ao cliente no portal (ver a recusa acima): extra, isolado, depois de tudo ter dado certo.
    await criarAvisoCliente("indicacao_decidida_cliente", sol.cliente_id, () => ({
      ...textoAvisoIndicacaoDecidida({ decisao: "aprovada", candidato: sol.candidato_nome, vagaTitulo: vaga?.titulo }),
      link: "/portal/minhas-indicacoes",
      referencia_tipo: "indicacao_candidato",
      referencia_id: id,
      chaveDedup: chaveDedupAviso("indicacao_decidida_cliente", id, `aprovada:${aprovada.decidido_em ?? nowIso}`),
    }));

    return NextResponse.json({
      data: aprovada,
      candidato_id: candidato.id,
      candidatos_vaga_id: candidatoVaga.id,
    });
  } catch (err) {
    console.error("[POST /api/solicitacoes-indicacao-candidato/[id]/decisao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
