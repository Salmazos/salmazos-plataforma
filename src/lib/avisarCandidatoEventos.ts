import { createServiceClient } from "@/lib/supabase/server";
import { buscarPerfilResponsavel } from "@/lib/perfilResponsavel";
import { gravarSinoConfiguravel, jaExisteAvisoRecente } from "@/lib/avisoConfiguravel";
import {
  EVENTO_CANDIDATO_TRANSFERIDO,
  EVENTO_CURRICULO_ATUALIZADO,
  EVENTO_FUNCIONARIO_NAO_CRIADO,
  TIPO_ATUALIZACAO_CURRICULO,
  TIPO_FUNCIONARIO_NAO_CRIADO,
  TIPO_TRANSFERENCIA_RESPONSAVEL,
  inicioJanelaSemRepetir,
  textoCurriculoAtualizado,
  textoFuncionarioNaoCriado,
  textoTransferenciaResponsavel,
  type ResultadoCanalAviso,
} from "@/lib/avisosRestantesRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

async function userIdDoResponsavel(svc: ServiceClient, nome: string | null | undefined): Promise<string | null> {
  if (!nome) return null;
  try {
    return (await buscarPerfilResponsavel(svc, nome))?.user_id ?? null;
  } catch (err) {
    console.error("[avisarCandidatoEventos] Erro ao resolver o responsável (segue sem ele):", err);
    return null;
  }
}

// Transferência de responsável: o responsável ANTIGO (como sempre), o NOVO e a lista do canal sino, uma linha por
// usuário e sem repetir. Roda depois de a troca estar gravada e NUNCA lança.
export async function avisarCandidatoTransferido(
  svc: ServiceClient,
  o: { candidatoId: string; candidatoNome?: string | null; antigoNome?: string | null; novoNome?: string | null }
): Promise<ResultadoCanalAviso> {
  try {
    const [antigoId, novoId] = await Promise.all([userIdDoResponsavel(svc, o.antigoNome), userIdDoResponsavel(svc, o.novoNome)]);
    const t = textoTransferenciaResponsavel({ candidato: o.candidatoNome, antigo: o.antigoNome, novo: o.novoNome });
    const textoPorUsuario: Record<string, { titulo: string; mensagem: string }> = {};
    if (antigoId) textoPorUsuario[antigoId] = t.antigo;
    if (novoId) textoPorUsuario[novoId] = t.novo;
    return await gravarSinoConfiguravel(svc, {
      evento: EVENTO_CANDIDATO_TRANSFERIDO,
      deSempre: [antigoId, novoId],
      linha: { tipo: TIPO_TRANSFERENCIA_RESPONSAVEL, ...t.lista, candidato_id: o.candidatoId },
      textoPorUsuario,
      geral: "nunca",
    });
  } catch (err) {
    console.error("[avisarCandidatoTransferido] Falha:", err);
    return "falhou";
  }
}

// Currículo atualizado: o responsável do candidato + a lista; sem responsável resolvível, a linha geral como sempre
// (sem unidade). Nunca lança.
export async function avisarCurriculoAtualizado(
  svc: ServiceClient,
  o: { candidatoId: string; candidatoNome?: string | null; resumo?: string | null; responsavelNome?: string | null }
): Promise<ResultadoCanalAviso> {
  try {
    const responsavelId = await userIdDoResponsavel(svc, o.responsavelNome);
    return await gravarSinoConfiguravel(svc, {
      evento: EVENTO_CURRICULO_ATUALIZADO,
      deSempre: [responsavelId],
      linha: { tipo: TIPO_ATUALIZACAO_CURRICULO, ...textoCurriculoAtualizado({ candidato: o.candidatoNome, resumo: o.resumo }), candidato_id: o.candidatoId },
      geral: "se_sem_de_sempre",
    });
  } catch (err) {
    console.error("[avisarCurriculoAtualizado] Falha:", err);
    return "falhou";
  }
}

// Funcionário não criado automaticamente: a linha geral de sempre (sem unidade, de propósito: o RH é centralizado)
// MAIS a lista do canal sino. Não repete o mesmo aviso (mesmo candidato e vaga) em 24 horas. Nunca lança.
export async function avisarFuncionarioNaoCriado(
  svc: ServiceClient,
  o: { candidatoId: string; vagaId?: string | null; candidatoNome?: string | null }
): Promise<ResultadoCanalAviso> {
  try {
    const repetido = await jaExisteAvisoRecente(svc, {
      tipo: TIPO_FUNCIONARIO_NAO_CRIADO,
      candidatoId: o.candidatoId,
      vagaId: o.vagaId ?? null,
      desde: inicioJanelaSemRepetir(),
    });
    if (repetido) return "enviado";
    return await gravarSinoConfiguravel(svc, {
      evento: EVENTO_FUNCIONARIO_NAO_CRIADO,
      deSempre: [],
      linha: { tipo: TIPO_FUNCIONARIO_NAO_CRIADO, ...textoFuncionarioNaoCriado({ candidato: o.candidatoNome }), candidato_id: o.candidatoId, vaga_id: o.vagaId ?? null, unidade_id: null },
      geral: "sempre",
    });
  } catch (err) {
    console.error("[avisarFuncionarioNaoCriado] Falha:", err);
    return "falhou";
  }
}
