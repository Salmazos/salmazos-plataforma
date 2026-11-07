import type { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria } from "@/lib/audit";
import { gerarCobrancaRSSeAplicavel } from "@/lib/cobrancaRS";
import { resolverTipoServicoVigente } from "@/lib/tipoServicoVigente";
import { sincronizarEncaminhamentoComEtapa } from "@/lib/sincronizarEncaminhamento";
import { sincronizarPosicoesAbertas } from "@/lib/vagaPosicoes";

type Service = ReturnType<typeof createServiceClient>;

function statusAlocacao(tipoServico: string | null): string {
  switch (tipoServico) {
    case "mao_obra_temporaria": return "alocado_mot";
    case "recrutamento_selecao": return "alocado_rs";
    case "terceirizacao": return "alocado_terceirizacao";
    default: return "alocado_rs";
  }
}

export interface FinalizarContratadoInput {
  cvId: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  renovavel?: boolean | null;
  observacoes?: string | null;
  admissao_salario?: number | null;
  fee_ausente_justificativa?: string | null;
  gerar_cobranca_rs?: boolean | null;
  // Só atribui a autoria da cobrança R&S (cobrancas_rs.gerado_por_user_id); nunca bloqueia a finalização.
  userId?: string | null;
}

export type ResultadoFinalizarContratado =
  | { ok: true; vagaEncerrada: boolean; cobrancaRsId: string | null }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

// Regra única de "candidato contratado" (candidatos_vagas → contratado, alocação, baixa de posição da vaga com
// fechamento automático, histórico, garantia/fee R&S). Usada pelo "Finalizar" do Kanban
// (PATCH /api/candidatos-vagas/[id]/finalizar) e pela aprovação de indicação direta MOT/Terceirização
// (POST /api/solicitacoes-indicacao-candidato/[id]/decisao) — mudar aqui muda os dois, de propósito.
// Falha de validação ou de gravação da candidatura devolve `ok: false` ANTES de qualquer efeito colateral
// (e-mail de fechamento, alocação, histórico); os passos depois do update da candidatura não lançam.
export async function finalizarContratado(supabase: Service, input: FinalizarContratadoInput): Promise<ResultadoFinalizarContratado> {
  const { cvId, data_inicio, data_fim, renovavel, observacoes, admissao_salario, fee_ausente_justificativa, gerar_cobranca_rs, userId } = input;

  const { data: cv, error: cvErr } = await supabase
    .from("candidatos_vagas")
    .select("id, candidato_id, vaga_id, admissao_fee_valor, vagas!candidatos_vagas_vaga_id_fkey(id, titulo, status, tipo_servico, num_posicoes, cliente_id, fee_rs_percentual, fee_rs_prazo_cobranca, clientes(nome))")
    .eq("id", cvId)
    .single();

  if (cvErr || !cv) return { ok: false, status: 404, error: "Registro não encontrado." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vaga = (cv as any).vagas as {
    id: string; titulo: string; status: string; tipo_servico: string;
    num_posicoes: number; cliente_id: string | null; clientes: { nome: string } | null;
    fee_rs_percentual: number | null; fee_rs_prazo_cobranca: string | null;
  } | null;
  const vagaTitulo = vaga?.titulo ?? "vaga";
  const clienteNome = vaga?.clientes?.nome ?? null;
  // Nunca confia no tipo_servico que o client mandou no body — resolve aqui o "vigente"
  // de verdade (encaminhamento mais recente daquele candidato+vaga, com fallback pra
  // vagas.tipo_servico), mesma fonte usada pro Kanban (ver tipoServicoVigente.ts). Client
  // desatualizado ou manipulado não consegue mais forçar a trava de fee R&S numa vaga
  // que não é R&S.
  const tipoServicoFinal = await resolverTipoServicoVigente(supabase, cv.candidato_id, cv.vaga_id, vaga?.tipo_servico ?? null);

  if (!data_inicio)
    return { ok: false, status: 400, error: "Data de início é obrigatória." };

  const cvFields: Record<string, unknown> = {
    etapa: "contratado",
    data_inicio,
    data_fim: data_fim || null,
    observacoes: observacoes || null,
  };

  // Fee R&S — mesma regra de portal/avaliar/route.ts, mas com proteção contra
  // sobrescrita: essa rota pode ser chamada depois de o cliente já ter aprovado
  // (e lançado o fee) pelo portal dele, então só grava se ainda não existir nada.
  const feeRsPercentual = vaga?.fee_rs_percentual ?? null;

  // Trava preventiva: vaga R&S sem taxa configurada não pode ser finalizada em
  // silêncio (já aconteceu 2x de passar batido, sem fee lançado e sem ninguém
  // perceber). Só bloqueia quando o fee ainda não foi lançado por nenhum caminho
  // (aqui ou pelo portal do cliente) — senão travaria reprocessamentos legítimos.
  // O frontend (ModalFinalizarProcesso) já resolve isso antes de chegar aqui —
  // essa checagem é o backstop server-side pra chamada direta à API não pular
  // a trava.
  const precisaFeeSemTaxaConfigurada =
    tipoServicoFinal === "recrutamento_selecao" &&
    feeRsPercentual == null &&
    cv.admissao_fee_valor == null;

  if (precisaFeeSemTaxaConfigurada && !fee_ausente_justificativa?.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Esta vaga é de Recrutamento e Seleção mas não tem taxa (%) configurada. Configure a taxa da vaga ou informe uma justificativa para continuar sem ela.",
      extra: { requiresFeeJustificativa: true },
    };
  }

  // Decisão de gerar cobrança R&S passa a ser por contratação, capturada aqui, não
  // mais no fechamento da vaga. Obrigatória pra toda vaga R&S — o frontend
  // (ModalFinalizarProcesso) já pergunta isso no mesmo formulário; essa checagem é o
  // backstop server-side pra chamada direta à API não pular a decisão.
  if (tipoServicoFinal === "recrutamento_selecao" && gerar_cobranca_rs == null) {
    return {
      ok: false,
      status: 400,
      error: "Informe se deve gerar cobrança de R&S para esta contratação.",
      extra: { requiresDecisaoCobranca: true },
    };
  }

  if (
    tipoServicoFinal === "recrutamento_selecao" &&
    admissao_salario != null &&
    cv.admissao_fee_valor == null &&
    feeRsPercentual != null
  ) {
    cvFields.admissao_fee_percentual = feeRsPercentual;
    cvFields.admissao_fee_valor = admissao_salario * feeRsPercentual / 100;
    cvFields.admissao_fee_prazo = vaga?.fee_rs_prazo_cobranca ?? null;
    cvFields.admissao_fee_origem = "analista_interno";
  }

  // Garantia é sempre 30 dias a partir da data de início do candidato, independente
  // de a taxa/fee ter sido calculada nesta contratação (ex: "sem taxa configurada" com
  // justificativa) — antes esse cálculo só rodava dentro do bloco de fee acima, e
  // contratações sem fee calculado ficavam sem garantia registrada mesmo tendo data de
  // início. Ver nota de memória de 14/09.
  if (tipoServicoFinal === "recrutamento_selecao") {
    const inicioGarantia = new Date(data_inicio + "T00:00:00");
    inicioGarantia.setDate(inicioGarantia.getDate() + 30);
    cvFields.garantia_data_fim = inicioGarantia.toISOString().split("T")[0];
  }

  if (tipoServicoFinal === "recrutamento_selecao") {
    cvFields.gerar_cobranca_rs = gerar_cobranca_rs === true;
    cvFields.decisao_cobranca_registrada_em = new Date().toISOString();
  }

  const { error: updateCvErr } = await supabase
    .from("candidatos_vagas")
    .update(cvFields)
    .eq("id", cvId);
  // Antes o erro era ignorado: a rota seguia, gravava alocação, histórico e o audit
  // "candidato_finalizado" mesmo com a etapa sem mudar. Agora para aqui, sem efeitos colaterais.
  if (updateCvErr) {
    console.error(`[finalizar] Falha ao gravar contratação (cv_id=${cvId}):`, updateCvErr.message);
    return {
      ok: false,
      status: 500,
      error: "Não foi possível registrar a contratação (falha ao atualizar a candidatura). Nada foi alterado; tente novamente.",
    };
  }

  void sincronizarEncaminhamentoComEtapa(cv.candidato_id, vaga?.cliente_id ?? null, "contratado", supabase);

  // Preenchido só quando a cobrança é criada com sucesso — usado pra redirecionar o
  // analista direto pra revisão dela (?abrir={id}) na resposta desta rota. Precisa ser
  // aguardado de verdade (não fire-and-forget) porque o id só existe depois do insert
  // completar; se a criação falhar, loga o erro mas não quebra a finalização do
  // candidato em si — ele já foi gravado como contratado acima.
  let cobrancaRsId: string | null = null;

  if (tipoServicoFinal === "recrutamento_selecao") {
    registrarAuditoria({
      acao: "cobranca_rs_decisao",
      entidade: "candidatos_vagas",
      entidade_id: cvId,
      detalhes: { candidato_id: cv.candidato_id, vaga_id: cv.vaga_id, gerar_cobranca_rs: gerar_cobranca_rs === true },
    });

    // Gera na hora, não espera a vaga fechar — cada contratação decide por si.
    if (gerar_cobranca_rs === true) {
      try {
        const resultadoCobranca = await gerarCobrancaRSSeAplicavel(cv.vaga_id, cvId, supabase, userId ?? null);
        if (resultadoCobranca.criada) cobrancaRsId = resultadoCobranca.id ?? null;
      } catch (err) {
        console.error("[finalizar] Erro ao gerar cobrança R&S:", err);
      }
    }
  }

  if (precisaFeeSemTaxaConfigurada) {
    registrarAuditoria({
      acao: "admissao_finalizada_sem_fee_rs",
      entidade: "candidatos_vagas",
      entidade_id: cvId,
      detalhes: {
        candidato_id: cv.candidato_id,
        vaga_id: cv.vaga_id,
        vaga_titulo: vagaTitulo,
        justificativa: fee_ausente_justificativa!.trim(),
      },
    });
  }

  // Update candidatos allocation
  await supabase
    .from("candidatos")
    .update({
      status_alocacao: statusAlocacao(tipoServicoFinal),
      alocacao_cliente_nome: clienteNome,
      alocacao_vaga_titulo: vagaTitulo,
      alocacao_data_inicio: data_inicio,
      alocacao_data_fim: data_fim || null,
      alocacao_tipo_servico: tipoServicoFinal,
      alocacao_renovavel: tipoServicoFinal === "terceirizacao" ? (renovavel ?? true) : false,
    })
    .eq("id", cv.candidato_id);

  // Recalcula num_posicoes_abertas a partir da contagem real de contratados (nunca
  // mais decrementa "no escuro" um contador solto — ver vagaPosicoes.ts pro histórico
  // completo dos bugs que esse padrão antigo causou, incluindo o caso real da vaga
  // Auxiliar de Produção/Novacki de 21-22/09). Fecha a vaga automaticamente quando a
  // contagem real bate com o total de posições, e já cuida do e-mail/audit_log de
  // encerramento.
  let vagaEncerrada = false;
  if (vaga) {
    // Cobrança R&S da contratação que motivou esse fechamento já foi decidida e
    // gerada (ou não) logo acima, no momento da finalização — fechar a vaga aqui não
    // mexe em cobrança.
    const resultado = await sincronizarPosicoesAbertas(vaga.id, supabase);
    vagaEncerrada = resultado?.vagaFechadaAgora ?? false;
  }

  const dataFmt = data_inicio.split("-").reverse().join("/");
  const dataFimFmt = data_fim ? ` até ${data_fim.split("-").reverse().join("/")}` : "";
  void registrarHistorico({
    candidato_id: cv.candidato_id,
    tipo: "contratado",
    descricao: `Candidato contratado para ${vagaTitulo}${clienteNome ? ` (${clienteNome})` : ""}. Início em ${dataFmt}${dataFimFmt}.${observacoes ? ` Obs: ${observacoes}` : ""}`,
    metadata: { cv_id: cvId, vaga_id: cv.vaga_id, data_inicio, data_fim, tipo_servico: tipoServicoFinal, observacoes },
  });

  registrarAuditoria({
    acao: "candidato_finalizado",
    entidade: "candidatos_vagas",
    entidade_id: cvId,
    detalhes: { resultado: "contratado", candidato_id: cv.candidato_id, vaga_id: cv.vaga_id, data_inicio },
  });

  return { ok: true, vagaEncerrada, cobrancaRsId };
}
