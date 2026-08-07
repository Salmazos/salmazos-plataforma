import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface ResultadoCobranca {
  criada: boolean;
  motivo?: "ja_existe" | "nao_e_rs" | "sem_fee_configurado" | "sem_cliente_vinculado" | "candidato_vaga_nao_encontrado";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CandidatoVagaComRelacoes = any;

/**
 * Gera o rascunho de cobrança R&S (status 'pendente_revisao') para um candidato_vaga
 * específico, se aplicável — chamado sempre que uma vaga fecha com candidato(s) já
 * contratado(s) (ver gerarCobrancasRSParaVaga). Idempotente: não cria duplicata se já
 * existir uma cobrança para esse candidato_vaga_id (também garantido a nível de banco
 * pelo UNIQUE em cobrancas_rs.candidato_vaga_id).
 */
export async function gerarCobrancaRSSeAplicavel(
  vagaId: string,
  candidatoVagaId: string,
  supabase?: ServiceClient
): Promise<ResultadoCobranca> {
  const svc = supabase ?? createServiceClient();

  const { data: existente } = await svc
    .from("cobrancas_rs")
    .select("id")
    .eq("candidato_vaga_id", candidatoVagaId)
    .maybeSingle();
  if (existente) return { criada: false, motivo: "ja_existe" };

  const { data: cv } = await svc
    .from("candidatos_vagas")
    .select(
      "id, candidato_id, vaga_id, candidatos(nome_completo), vagas(id, titulo, tipo_servico, fee_rs_percentual, cliente_id, cliente_nome, clientes(nome, cnpj, endereco, contato_telefone, contato_email))"
    )
    .eq("id", candidatoVagaId)
    .single();

  if (!cv) return { criada: false, motivo: "candidato_vaga_nao_encontrado" };

  const row = cv as CandidatoVagaComRelacoes;
  const vaga = row.vagas as {
    id: string; titulo: string; tipo_servico: string; fee_rs_percentual: number | null;
    cliente_id: string | null; cliente_nome: string | null;
    clientes: { nome: string; cnpj: string | null; endereco: string | null; contato_telefone: string | null; contato_email: string | null } | null;
  } | null;

  if (!vaga || vaga.id !== vagaId || vaga.tipo_servico !== "recrutamento_selecao") {
    return { criada: false, motivo: "nao_e_rs" };
  }

  if (vaga.fee_rs_percentual == null) {
    // Mesma pendência já sinalizada em outros pontos do sistema (badge/trava/notificação
    // "taxa não configurada") — reaproveita o mesmo tipo de notificação broadcast, só
    // com mensagem específica pra esse contexto (cobrança não pôde ser gerada).
    try {
      await svc.from("notificacoes_analista").insert({
        tipo: "fee_rs_nao_configurado",
        titulo: "Taxa de R&S não configurada",
        mensagem: `A vaga "${vaga.titulo}" fechou com candidato contratado, mas não tem taxa (%) configurada — o rascunho de cobrança R&S não pôde ser gerado automaticamente.`,
        user_id: null,
        candidato_id: row.candidato_id,
        vaga_id: vaga.id,
      });
    } catch (err) {
      console.error("[gerarCobrancaRSSeAplicavel] Erro ao notificar taxa ausente:", err);
    }
    return { criada: false, motivo: "sem_fee_configurado" };
  }

  // Nome do cliente é obrigatório no snapshot — cai pro texto livre legado (cliente_nome)
  // se a vaga não tiver cliente_id vinculado (caso real já visto em vagas importadas).
  // Sem nenhum dos dois, não dá pra gravar a cobrança com um snapshot válido.
  const clienteNome = vaga.clientes?.nome ?? vaga.cliente_nome ?? null;
  if (!clienteNome) {
    console.error(
      `[gerarCobrancaRSSeAplicavel] Vaga ${vaga.id} ("${vaga.titulo}") sem cliente vinculado e sem cliente_nome — cobrança R&S não gerada para candidato_vaga ${candidatoVagaId}.`
    );
    return { criada: false, motivo: "sem_cliente_vinculado" };
  }

  const candidatoNome = row.candidatos?.nome_completo ?? "—";

  const { error } = await svc.from("cobrancas_rs").insert({
    vaga_id: vaga.id,
    candidato_id: row.candidato_id,
    candidato_vaga_id: row.id,
    cliente_id: vaga.cliente_id,

    cliente_nome_snapshot: clienteNome,
    cliente_cnpj_snapshot: vaga.clientes?.cnpj ?? null,
    cliente_endereco_snapshot: vaga.clientes?.endereco ?? null,
    cliente_telefone_snapshot: vaga.clientes?.contato_telefone ?? null,
    cliente_email_snapshot: vaga.clientes?.contato_email ?? null,

    candidato_nome_snapshot: candidatoNome,

    fee_percentual: vaga.fee_rs_percentual,

    status: "pendente_revisao",
  });

  if (error) {
    // UNIQUE(candidato_vaga_id) pode disparar em corrida entre chamadas concorrentes —
    // trata como "já existe" em vez de propagar erro, já que o resultado prático é o
    // mesmo (uma cobrança única para esse candidato_vaga já está garantida).
    if (error.code === "23505") return { criada: false, motivo: "ja_existe" };
    console.error("[gerarCobrancaRSSeAplicavel] Erro ao inserir cobrança R&S:", error.message);
    return { criada: false };
  }

  return { criada: true };
}

/**
 * Chamada nos pontos onde uma vaga R&S pode fechar (fechamento automático por última
 * posição preenchida, ou fechamento manual via PATCH /api/vagas/[id]) — cobre todos os
 * candidatos já em etapa 'contratado' vinculados à vaga, não só o que motivou o
 * fechamento nesse request específico (ex: vaga fechada manualmente que já tinha
 * contratados de antes).
 */
export async function gerarCobrancasRSParaVaga(vagaId: string, supabase?: ServiceClient): Promise<void> {
  const svc = supabase ?? createServiceClient();

  const { data: contratados } = await svc
    .from("candidatos_vagas")
    .select("id")
    .eq("vaga_id", vagaId)
    .eq("etapa", "contratado");

  for (const cv of contratados ?? []) {
    await gerarCobrancaRSSeAplicavel(vagaId, cv.id, svc);
  }
}
