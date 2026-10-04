import { sendEmail } from "@/lib/sendEmail";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { executarCanaisIndependentes, type ResultadoCanal } from "@/lib/avisosResolucao";
import { gravarSinoAvisoVaga, resolverAvisoVaga, type EventoAvisoVaga } from "@/lib/avisosVagas";

interface Opts {
  evento: EventoAvisoVaga;
  // Unidade do cliente/vaga: filtro fixo por cima de qualquer lista (e do padrão antigo).
  unidadeId: string | null | undefined;
  // Só para o log de erro de cada canal.
  contexto: string;
  sino: {
    tipo: string;
    titulo: string;
    mensagem: string;
    vagaId?: string | null;
    solicitacaoVagaId?: string | null;
    candidatoId?: string | null;
  };
  email: {
    subject: string;
    html: string;
    tipo: string;
    candidatoId?: string;
    vagaId?: string;
  };
}

// Avisos internos de ação do cliente no portal (pedido de alteração/reativação/pausa e agendamento sem
// responsável). Sino e e-mail leem a lista do evento em Configurações > Avisos; sem configuração
// (ou com falha ao ler) vale EXATAMENTE o comportamento de antes: sino geral (user_id nulo) da unidade
// e e-mail para todos os analistas da unidade. Cada canal roda isolado e esta função NUNCA lança —
// o pedido do cliente já foi gravado quando ela roda. O popup não é "enviado": é lido por quem entra
// no painel (ver /api/pedidos-cliente-popup).
export async function avisarPedidoCliente(o: Opts): Promise<ResultadoCanal[]> {
  const resolvido = await resolverAvisoVaga(o.evento, o.unidadeId);

  return executarCanaisIndependentes(o.contexto, {
    sino: () =>
      gravarSinoAvisoVaga({
        evento: o.evento,
        unidadeId: o.unidadeId,
        tipo: o.sino.tipo,
        titulo: o.sino.titulo,
        mensagem: o.sino.mensagem,
        vagaId: o.sino.vagaId,
        solicitacaoVagaId: o.sino.solicitacaoVagaId,
        candidatoId: o.sino.candidatoId,
        resolvido,
      }),
    email: async () => {
      if (resolvido.email.modo === "desligado") return;

      if (resolvido.email.modo === "configurado") {
        const destinos = (resolvido.email.destinatarios ?? []).filter((d) => d.email);
        const resultados = await Promise.all(
          destinos.map((d) =>
            sendEmail({
              to: d.email,
              subject: o.email.subject,
              html: o.email.html,
              tipo: o.email.tipo,
              candidato_id: o.email.candidatoId,
              vaga_id: o.email.vagaId,
            })
          )
        );
        const falhas = resultados.filter((r) => !r.success).length;
        if (falhas > 0) console.error(`[${o.contexto}] ${falhas}/${resultados.length} e-mail(s) falharam (evento="${o.evento}").`);
        return;
      }

      await notifyAllAnalysts({
        subject: o.email.subject,
        html: o.email.html,
        tipo: o.email.tipo,
        candidato_id: o.email.candidatoId,
        vaga_id: o.email.vagaId,
        unidadeId: o.unidadeId,
      });
    },
  });
}
