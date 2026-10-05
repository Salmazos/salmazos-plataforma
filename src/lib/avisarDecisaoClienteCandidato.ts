import { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { buscarPerfilResponsavel } from "@/lib/perfilResponsavel";
import {
  EVENTO_POR_DECISAO,
  EVENTO_POR_TIPO_NOTIFICACAO,
  TIPO_NOTIFICACAO_POR_DECISAO,
  popupDecisaoLigado,
  textoAvisoDecisaoCliente,
  userIdsDestinoDecisao,
  type DecisaoCliente,
} from "@/lib/decisaoClienteCandidato";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Sino interno "o cliente aprovou/reprovou um candidato" (Configurações > Avisos > Portal do cliente). Roda
// DEPOIS de a decisão estar gravada e NUNCA lança (a ação do cliente já deu certo). Destinatários: o responsável
// do candidato (login ativo de candidatos.responsavel) MAIS a lista do canal sino do evento, uma linha por
// user_id e sem repetir; sem nenhum dos dois, a linha geral da unidade do cliente (user_id nulo), como antes.
// Interruptor do sino desligado = nenhum sino (nem responsável, nem lista, nem geral); sem linha de canal ou
// erro de leitura = ligado. Devolve true só quando gravou.
export async function avisarDecisaoClienteCandidato(
  svc: ServiceClient,
  o: {
    decisao: DecisaoCliente;
    candidatoId: string;
    candidatoNome?: string | null;
    clienteNome?: string | null;
    vagaTitulo?: string | null;
    feedback?: string | null;
    responsavelNome?: string | null;
    unidadeId?: string | null;
  }
): Promise<boolean> {
  try {
    const evento = EVENTO_POR_DECISAO[o.decisao];
    const lista = await resolverDestinatarios(evento, "sino", undefined, svc);
    if (lista.modo === "desligado") return false;
    const userIdsLista = lista.modo === "configurado" && !lista.falhou ? lista.userIds : [];

    let responsavelUserId: string | null = null;
    if (o.responsavelNome) {
      try {
        responsavelUserId = (await buscarPerfilResponsavel(svc, o.responsavelNome))?.user_id ?? null;
      } catch (err) {
        console.error("[avisarDecisaoClienteCandidato] Erro ao resolver o responsável (segue sem ele):", err);
      }
    }

    const userIds = userIdsDestinoDecisao(responsavelUserId, userIdsLista);
    const { titulo, mensagem } = textoAvisoDecisaoCliente({
      decisao: o.decisao,
      cliente: o.clienteNome,
      candidato: o.candidatoNome,
      vagaTitulo: o.vagaTitulo,
      feedback: o.feedback,
    });
    const base = {
      tipo: TIPO_NOTIFICACAO_POR_DECISAO[o.decisao],
      titulo,
      mensagem,
      candidato_id: o.candidatoId,
      // Só pesa na linha geral: vai para a equipe da unidade do cliente.
      unidade_id: o.unidadeId ?? null,
    };
    const rows = userIds.length > 0 ? userIds.map((user_id) => ({ ...base, user_id })) : [{ ...base, user_id: null as string | null }];
    const { error } = await svc.from("notificacoes_analista").insert(rows);
    if (error) {
      console.error(`[avisarDecisaoClienteCandidato] Erro ao gravar o sino (evento="${evento}"):`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[avisarDecisaoClienteCandidato] Erro inesperado:", err);
    return false;
  }
}

// Eventos do popup interno (decisão do cliente e garantia R&S) que estão com o canal popup LIGADO. Sem linha de
// canal ou erro de leitura = desligado (não mostra). NUNCA lança.
export async function eventosComPopupLigado(svc: ServiceClient): Promise<string[]> {
  try {
    const { data, error } = await svc
      .from("aviso_eventos_canais")
      .select("evento, ativo")
      .eq("canal", "popup")
      .in("evento", Object.values(EVENTO_POR_TIPO_NOTIFICACAO));
    if (error) {
      console.error("[eventosComPopupLigado] Erro ao ler o canal popup (segue desligado):", error.message);
      return [];
    }
    return (data ?? []).filter((l) => popupDecisaoLigado({ linha: { ativo: l.ativo }, erro: false })).map((l) => l.evento as string);
  } catch (err) {
    console.error("[eventosComPopupLigado] Erro inesperado (segue desligado):", err);
    return [];
  }
}
