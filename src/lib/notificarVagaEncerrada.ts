import { SITE_URL } from "@/lib/siteUrl";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { analistaAtendeUnidade } from "@/lib/notifyAllAnalysts";
import { resolverAvisoVaga, gravarSinoAvisoVaga } from "@/lib/avisosVagas";

type ServiceClient = ReturnType<typeof createServiceClient>;

const TIPO_LABELS: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização de Serviços",
  avaliacao_psicologica: "Avaliação Psicológica",
};

// Extraído de api/vagas/[id]/notificar-encerramento/route.ts pra ser reaproveitado também
// no fechamento automático de vaga (finalizar/route.ts, quando a última posição é
// preenchida) — esse caminho atualiza a tabela `vagas` diretamente, sem passar pelo PATCH
// /api/vagas/[id], então nunca chegava a notificar ninguém. Erros aqui são só logados —
// quem chama decide se quer aplicar timeout/catch adicional (ver finalizar/route.ts).
export async function notificarVagaEncerrada(
  vagaId: string,
  status: "fechada" | "cancelada",
  supabase?: ServiceClient
): Promise<void> {
  const svc = supabase ?? createServiceClient();

  const { data: vaga } = await svc
    .from("vagas")
    .select("id, titulo, tipo_servico, cidade, estado, responsavel, confidencial, cliente_id, unidade_id, clientes(nome)")
    .eq("id", vagaId)
    .single();

  if (!vaga) { console.error("[notificarVagaEncerrada] Vaga não encontrada:", vagaId); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaClienteNome = (vaga.clientes as any)?.nome ?? null;

  const vagaUrl = `${SITE_URL}/painel/vagas/${vagaId}`;
  const template = getEmailTemplate("vaga_encerrada", {
    nome: "",
    cargo: vaga.titulo,
    tipoServicoLabel: TIPO_LABELS[vaga.tipo_servico] ?? vaga.tipo_servico,
    cidade: vaga.cidade ?? undefined,
    estado: vaga.estado ?? undefined,
    responsavel: vaga.responsavel,
    statusEncerramento: status,
    confidencial: vaga.confidencial === true,
    vagaUrl,
    nomeCliente: vagaClienteNome ?? undefined,
  });

  try {
    const evento = status === "fechada" ? "vaga_fechada" : "vaga_cancelada";
    const resolvido = await resolverAvisoVaga(evento, vaga.unidade_id);

    if (resolvido.email.modo === "desligado") {
      console.log(`[notificarVagaEncerrada] E-mail de ${evento} está desligado`);
    } else if (resolvido.email.modo === "configurado" && resolvido.email.destinatarios) {
      const dests = resolvido.email.destinatarios.filter((d) => d.email);
      console.log(`[notificarVagaEncerrada] Enviando para ${dests.length} destinatários configurados`);
      await Promise.all(
        dests.map((d) =>
          sendEmail({
            to: d.email,
            subject: template.subject,
            html: template.html,
            tipo: "vaga_encerrada",
            vaga_id: vagaId,
          })
        )
      ).catch((err) => console.error("[notificarVagaEncerrada] Erro ao enviar e-mails:", err));
    } else {
      const { data: analistasTodos } = await svc
        .from("analistas_perfil")
        .select("email, nome_completo, unidade_id, acesso_todas_unidades")
        .eq("ativo", true);
      const analistas = (analistasTodos ?? []).filter((a) => analistaAtendeUnidade(a, vaga.unidade_id));

      if (analistas.length) {
        const destinatarios = analistas.filter((a) => a.email);
        console.log(`[notificarVagaEncerrada] Enviando para ${destinatarios.length} analistas (modo legado)`);
        await Promise.all(
          destinatarios.map((a) =>
            sendEmail({
              to: a.email,
              subject: template.subject,
              html: template.html,
              tipo: "vaga_encerrada",
              vaga_id: vagaId,
            })
          )
        ).catch((err) => console.error("[notificarVagaEncerrada] Erro ao enviar e-mails:", err));
      }
    }

    const vagaConfidencial = vaga.confidencial === true;
    await gravarSinoAvisoVaga({
      evento,
      unidadeId: vaga.unidade_id,
      tipo: "vaga_encerrada",
      titulo: `${vagaConfidencial ? "🔴 [CONFIDENCIAL] " : ""}Vaga encerrada: ${vaga.titulo}`,
      mensagem: `Vaga "${vaga.titulo}" (${TIPO_LABELS[vaga.tipo_servico] ?? vaga.tipo_servico}) foi encerrada (${status}).`,
      vagaId,
      resolvido,
    });
  } catch (err) {
    console.error("[notificarVagaEncerrada] Erro:", err);
  }
}
