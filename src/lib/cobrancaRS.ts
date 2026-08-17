import { createServiceClient } from "@/lib/supabase/server";
import { parseSalarioFixo } from "@/lib/constants";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface ResultadoCobranca {
  criada: boolean;
  motivo?:
    | "ja_existe"
    | "nao_e_rs"
    | "sem_fee_configurado"
    | "sem_cliente_vinculado"
    | "candidato_vaga_nao_encontrado"
    | "sem_taxa_cancelamento_configurada"
    | "vaga_com_candidato_contratado";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CandidatoVagaComRelacoes = any;

/**
 * Gera o rascunho de cobrança R&S (status 'pendente_revisao') para um candidato_vaga
 * específico, se aplicável — chamado direto no momento da finalização da contratação
 * (PATCH /api/candidatos-vagas/[id]/finalizar), quando o analista responde "Sim" à
 * pergunta de gerar cobrança. Cada contratação decide por si (candidatos_vagas.
 * gerar_cobranca_rs), não há mais geração em lote por vaga. Idempotente: não cria
 * duplicata se já existir uma cobrança para esse candidato_vaga_id (também garantido a
 * nível de banco pelo UNIQUE em cobrancas_rs.candidato_vaga_id).
 */
export async function gerarCobrancaRSSeAplicavel(
  vagaId: string,
  candidatoVagaId: string,
  supabase?: ServiceClient,
  geradoPorUserId?: string | null
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
      "id, candidato_id, vaga_id, candidatos(nome_completo), vagas!candidatos_vagas_vaga_id_fkey(id, titulo, tipo_servico, fee_rs_percentual, fee_rs_prazo_cobranca, cliente_id, cliente_nome, clientes(nome, cnpj, endereco, contato_telefone, contato_email))"
    )
    .eq("id", candidatoVagaId)
    .single();

  if (!cv) return { criada: false, motivo: "candidato_vaga_nao_encontrado" };

  const row = cv as CandidatoVagaComRelacoes;
  const vaga = row.vagas as {
    id: string; titulo: string; tipo_servico: string; fee_rs_percentual: number | null;
    fee_rs_prazo_cobranca: string | null;
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
    prazo_cobranca: vaga.fee_rs_prazo_cobranca,

    status: "pendente_revisao",
    gerado_por_user_id: geradoPorUserId ?? null,
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

export interface ContratacaoAnteriorRecente {
  candidatoVagaId: string;
  candidatoNome: string | null;
  dataInicio: string;
}

/**
 * Contratação anterior mais recente para essa mesma vaga (mesmo vaga_id), usada pra dar
 * contexto à decisão de cobrança no momento de finalizar uma NOVA contratação (ver
 * ModalFinalizarProcesso) — cobre tanto reabertura manual da vaga (sem vínculo explícito)
 * quanto o caso de garantia acionada, se a vaga em questão for a mesma (não costuma ser,
 * porque acionar-garantia cria uma vaga nova). Chamado ANTES da contratação atual ser
 * gravada como 'contratado', então o candidato mais recente já encontrado aqui é sempre de
 * uma contratação anterior de verdade, nunca a que está em andamento. Quem chama decide se
 * a diferença de datas é "recente o bastante" (< 30 dias) pra ser tratada como garantia.
 */
export async function buscarContratacaoAnteriorRecente(
  vagaId: string,
  supabase?: ServiceClient
): Promise<ContratacaoAnteriorRecente | null> {
  const svc = supabase ?? createServiceClient();

  const { data: rows } = await svc
    .from("candidatos_vagas")
    .select("id, data_inicio, candidatos(nome_completo)")
    .eq("vaga_id", vagaId)
    .eq("etapa", "contratado")
    .not("data_inicio", "is", null)
    .order("data_inicio", { ascending: false })
    .limit(1);

  if (!rows || rows.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = rows[0] as any;
  return {
    candidatoVagaId: row.id,
    candidatoNome: row.candidatos?.nome_completo ?? null,
    dataInicio: row.data_inicio,
  };
}

/**
 * Gera o rascunho de cobrança de cancelamento (tipo='cancelamento', status
 * 'pendente_revisao') para uma vaga R&S cancelada com taxa de cancelamento
 * configurada — chamada em PATCH /api/vagas/[id] quando body.status === 'cancelada'.
 * Diferente de gerarCobrancaRSSeAplicavel: é uma checagem em nível de vaga, não por
 * candidato_vaga (cancelamento não tem candidato contratado associado).
 */
export async function gerarCobrancaCancelamentoRSSeAplicavel(
  vagaId: string,
  supabase?: ServiceClient
): Promise<ResultadoCobranca> {
  const svc = supabase ?? createServiceClient();

  const { data: existente } = await svc
    .from("cobrancas_rs")
    .select("id")
    .eq("vaga_id", vagaId)
    .eq("tipo", "cancelamento")
    .maybeSingle();
  if (existente) return { criada: false, motivo: "ja_existe" };

  const { data: vaga } = await svc
    .from("vagas")
    .select(
      "id, titulo, tipo_servico, taxa_cancelamento, taxa_cancelamento_percentual, salario, fee_rs_prazo_cobranca, cliente_id, cliente_nome, clientes(nome, cnpj, endereco, contato_telefone, contato_email)"
    )
    .eq("id", vagaId)
    .single();

  if (!vaga || vaga.tipo_servico !== "recrutamento_selecao") {
    return { criada: false, motivo: "nao_e_rs" };
  }

  if (vaga.taxa_cancelamento !== true || vaga.taxa_cancelamento_percentual == null) {
    // Mesmo padrão de notificação já usado pra "taxa não configurada" no fluxo de
    // contratação, com mensagem equivalente pra este contexto.
    try {
      await svc.from("notificacoes_analista").insert({
        tipo: "fee_rs_nao_configurado",
        titulo: "Taxa de cancelamento R&S não configurada",
        mensagem: `A vaga "${vaga.titulo}" foi cancelada, mas não tem taxa de cancelamento (%) configurada — o rascunho de cobrança de cancelamento não pôde ser gerado automaticamente.`,
        user_id: null,
        candidato_id: null,
        vaga_id: vaga.id,
      });
    } catch (err) {
      console.error("[gerarCobrancaCancelamentoRSSeAplicavel] Erro ao notificar taxa ausente:", err);
    }
    return { criada: false, motivo: "sem_taxa_cancelamento_configurada" };
  }

  // Edge case de contradição: vaga cancelada mas ainda com candidato em etapa
  // 'contratado' vinculado — situação ambígua (cobra fee de contratação ou multa de
  // cancelamento?) que não deveria acontecer no fluxo normal. Não trava nada, só não
  // gera cobrança de cancelamento automaticamente e loga pra investigação manual.
  const { data: contratadoExistente } = await svc
    .from("candidatos_vagas")
    .select("id")
    .eq("vaga_id", vagaId)
    .eq("etapa", "contratado")
    .maybeSingle();

  if (contratadoExistente) {
    console.error(
      `[gerarCobrancaCancelamentoRSSeAplicavel] Vaga ${vagaId} ("${vaga.titulo}") cancelada mas ainda tem candidato em etapa 'contratado' — cobrança de cancelamento não gerada automaticamente, requer decisão manual.`
    );
    return { criada: false, motivo: "vaga_com_candidato_contratado" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clienteRel = vaga.clientes as any;
  const clienteNome = clienteRel?.nome ?? vaga.cliente_nome ?? null;
  if (!clienteNome) {
    console.error(
      `[gerarCobrancaCancelamentoRSSeAplicavel] Vaga ${vagaId} ("${vaga.titulo}") sem cliente vinculado e sem cliente_nome — cobrança de cancelamento não gerada.`
    );
    return { criada: false, motivo: "sem_cliente_vinculado" };
  }

  const salarioValor = vaga.salario ? parseSalarioFixo(vaga.salario) : null;
  const feePercentual = vaga.taxa_cancelamento_percentual;
  const feeValor = salarioValor != null ? Math.round(((salarioValor * feePercentual) / 100) * 100) / 100 : null;

  const { error } = await svc.from("cobrancas_rs").insert({
    tipo: "cancelamento",
    vaga_id: vaga.id,
    candidato_id: null,
    candidato_vaga_id: null,
    cliente_id: vaga.cliente_id,

    cliente_nome_snapshot: clienteNome,
    cliente_cnpj_snapshot: clienteRel?.cnpj ?? null,
    cliente_endereco_snapshot: clienteRel?.endereco ?? null,
    cliente_telefone_snapshot: clienteRel?.contato_telefone ?? null,
    cliente_email_snapshot: clienteRel?.contato_email ?? null,

    candidato_nome_snapshot: null,

    salario: salarioValor,
    fee_percentual: feePercentual,
    fee_valor: feeValor,
    prazo_cobranca: vaga.fee_rs_prazo_cobranca,

    status: "pendente_revisao",
  });

  if (error) {
    if (error.code === "23505") return { criada: false, motivo: "ja_existe" };
    console.error("[gerarCobrancaCancelamentoRSSeAplicavel] Erro ao inserir cobrança de cancelamento:", error.message);
    return { criada: false };
  }

  return { criada: true };
}

export interface DestinatarioAtrasoCobranca {
  user_id: string;
  email: string;
  nome_completo: string;
}

/**
 * Destinatários compartilhados dos avisos de Cobrança R&S (cobranca_rs_gerada, cron
 * lembrete-cobranca-atraso, e-mail de cobrança marcada como paga, e o reenvio manual): base
 * fixa (PAPEIS_FULL_ACCESS + cobranca_rs_avisos_destinatarios ativos — mesma query de leitura
 * usada em /painel/cobranca-rs-acesso-config, sem alterar checarAcessoCobrancaRS em si, que só
 * checa um usuário por vez) + o analista com acesso configurável, mas SÓ se ele for o revisor
 * daquela cobrança específica (cobrancas_rs.revisado_por, que guarda auth.users.id — comparado
 * contra analistas_perfil.user_id, não contra .id). Não usa mais responsavel_comercial do
 * cliente (removido — deixou de fazer parte da regra de negócio deste fluxo). revisadoPor pode
 * ser null (cobrança ainda não tem revisor — ex: cron de atraso processando uma cobrança cujo
 * revisor nunca foi setado por algum motivo): nesse caso nenhum analista extra entra, só a base
 * fixa, sem quebrar nem cair pra broadcast geral.
 */
export async function obterDestinatariosCobrancaRS(
  revisadoPor: string | null,
  supabase?: ServiceClient
): Promise<DestinatarioAtrasoCobranca[]> {
  const svc = supabase ?? createServiceClient();

  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, user_id, email, nome_completo, nivel_acesso")
    .eq("ativo", true);

  const { data: acessos } = await svc
    .from("cobranca_rs_analistas_acesso")
    .select("analista_perfil_id")
    .eq("ativo", true);

  const acessoIds = new Set((acessos ?? []).map((a) => a.analista_perfil_id));
  const destinatarios = new Map<string, DestinatarioAtrasoCobranca>();

  for (const a of analistas ?? []) {
    if (!a.user_id || !a.email) continue;
    const ehFullAccess = a.nivel_acesso === "diretoria" || a.nivel_acesso === "superuser";
    const ehRevisorComAcesso = revisadoPor != null && a.user_id === revisadoPor && acessoIds.has(a.id);
    if (ehFullAccess || ehRevisorComAcesso) {
      destinatarios.set(a.user_id, { user_id: a.user_id, email: a.email, nome_completo: a.nome_completo });
    }
  }

  return Array.from(destinatarios.values());
}
