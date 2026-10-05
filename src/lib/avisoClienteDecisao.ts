import { createServiceClient } from "@/lib/supabase/server";
import { canaisClienteLigados, criarAvisoCliente } from "@/lib/avisoCliente";
import {
  chaveDedupPedidoDecidido,
  chaveDedupSolicitacaoDecidida,
  textoAvisoPedidoDecidido,
  textoAvisoSolicitacaoDecidida,
  type TipoPedidoCliente,
} from "@/lib/avisoClienteRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

export const EVENTO_SOLICITACAO_DECIDIDA = "solicitacao_vaga_decidida_cliente";
export const EVENTO_PEDIDO_DECIDIDO = "pedido_vaga_decidido_cliente";

// Onde o cliente vê o status da solicitação e os selos de resultado dos pedidos.
const LINK_SOLICITACOES = "/portal/solicitacoes";

// Aviso "Solicitação de vaga decidida" no portal (sino e popup, conforme Configurações > Avisos). Chamada
// extra, só depois de a decisão já estar gravada e de o e-mail da rota ter sido tentado. NUNCA lança. Os
// dados (cliente, cargo, motivo, instante da decisão) são lidos da própria linha já gravada, então o texto
// usa exatamente o que o cliente vê no portal e o mesmo motivo_recusa do e-mail.
export async function avisarSolicitacaoDecidida(svc: ServiceClient, solicitacaoId: string, decisao: "aprovada" | "recusada"): Promise<boolean> {
  try {
    // Canais desligados: nem lê a solicitação.
    const canais = await canaisClienteLigados(EVENTO_SOLICITACAO_DECIDIDA, svc);
    if (!canais.sino && !canais.popup) return false;

    const { data, error } = await svc
      .from("solicitacoes_vagas")
      .select("cliente_id, cargo, status, motivo_recusa, aprovada_em")
      .eq("id", solicitacaoId)
      .maybeSingle();
    if (error) {
      console.error("[avisoClienteDecisao] Erro ao ler a solicitação decidida:", error.message);
      return false;
    }
    const sol = data as { cliente_id: string | null; cargo: string | null; status: string | null; motivo_recusa: string | null; aprovada_em: string | null } | null;
    // Na dúvida (linha sumiu ou o status não é o da decisão), não avisa.
    if (!sol || sol.status !== decisao) return false;

    return await criarAvisoCliente(
      EVENTO_SOLICITACAO_DECIDIDA,
      sol.cliente_id,
      () => ({
        ...textoAvisoSolicitacaoDecidida({ decisao, cargo: sol.cargo, motivo: decisao === "recusada" ? sol.motivo_recusa : null }),
        link: LINK_SOLICITACOES,
        referencia_tipo: "solicitacao_vaga",
        referencia_id: solicitacaoId,
        chaveDedup: chaveDedupSolicitacaoDecidida(solicitacaoId, decisao, sol.aprovada_em),
      }),
      svc
    );
  } catch (err) {
    console.error("[avisoClienteDecisao] Erro inesperado ao avisar a solicitação decidida:", err);
    return false;
  }
}

// Aviso "Pedido do cliente decidido" (alteração, encerramento ou reativação). Mesmo contrato: chamada extra
// depois da decisão, nunca lança. `pedidoId` é o id do pedido (solicitacao_vaga_alteracoes para alteração,
// vaga_solicitacoes_status para encerramento e reativação). O motivo vem do motivo_recusa gravado, o mesmo
// que o e-mail da rota envia e que o selo do portal mostra.
export async function avisarPedidoDecidido(svc: ServiceClient, tipo: TipoPedidoCliente, pedidoId: string): Promise<boolean> {
  try {
    const canais = await canaisClienteLigados(EVENTO_PEDIDO_DECIDIDO, svc);
    if (!canais.sino && !canais.popup) return false;

    type LinhaPedido = { status: string | null; decidido_em: string | null; motivo_recusa: string | null; solicitacao_vaga_id?: string | null; vaga_id?: string | null };
    const alteracao = tipo === "alteracao";
    const { data, error } = await svc
      .from(alteracao ? "solicitacao_vaga_alteracoes" : "vaga_solicitacoes_status")
      .select(alteracao ? "status, decidido_em, motivo_recusa, solicitacao_vaga_id" : "status, decidido_em, motivo_recusa, vaga_id")
      .eq("id", pedidoId)
      .maybeSingle();
    if (error) {
      console.error("[avisoClienteDecisao] Erro ao ler o pedido decidido:", error.message);
      return false;
    }
    const pedido = data as LinhaPedido | null;
    if (!pedido || (pedido.status !== "aprovada" && pedido.status !== "recusada")) return false;
    const decisao = pedido.status === "aprovada" ? "aprovado" : "recusado";

    // Alteração: o cliente e o cargo vêm da solicitação. Encerramento e reativação: da vaga (o mesmo título
    // que o e-mail da rota usa como cargo).
    const { data: alvo, error: erroAlvo } = alteracao
      ? await svc.from("solicitacoes_vagas").select("cliente_id, cargo").eq("id", pedido.solicitacao_vaga_id ?? "").maybeSingle()
      : await svc.from("vagas").select("cliente_id, titulo").eq("id", pedido.vaga_id ?? "").maybeSingle();
    if (erroAlvo) {
      console.error("[avisoClienteDecisao] Erro ao ler o cliente do pedido decidido:", erroAlvo.message);
      return false;
    }
    const linha = alvo as { cliente_id: string | null; cargo?: string | null; titulo?: string | null } | null;
    if (!linha) return false;

    return await criarAvisoCliente(
      EVENTO_PEDIDO_DECIDIDO,
      linha.cliente_id,
      () => ({
        ...textoAvisoPedidoDecidido({
          tipo,
          decisao,
          cargo: alteracao ? linha.cargo : linha.titulo,
          motivo: decisao === "recusado" ? pedido.motivo_recusa : null,
        }),
        link: LINK_SOLICITACOES,
        referencia_tipo: "pedido_vaga",
        referencia_id: pedidoId,
        chaveDedup: chaveDedupPedidoDecidido(tipo, pedidoId, decisao, pedido.decidido_em),
      }),
      svc
    );
  } catch (err) {
    console.error("[avisoClienteDecisao] Erro inesperado ao avisar o pedido decidido:", err);
    return false;
  }
}
