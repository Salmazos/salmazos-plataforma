import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { resolverDestinatarios } from "@/lib/avisos";
import { executarCanaisIndependentes, type ResultadoCanal } from "@/lib/avisosResolucao";

export const EVENTO_INDICACAO_RECEBIDA = "indicacao_candidato_recebida";

interface Opts {
  solicitacaoId: string;
  unidadeId: string;
  vagaId: string;
  vagaTitulo: string;
  clienteNome: string;
  candidatoNome: string;
  subject: string;
  html: string;
}

// Avisos internos de "cliente enviou indicação direta". Cada canal roda isolado: a falha de um
// nunca impede o outro, e esta função NUNCA lança — a indicação já foi gravada quando ela roda.
// O popup não é "enviado": ele é lido por quem entra no painel (ver /api/indicacoes-popup) a
// partir da mesma lista de Configurações > Avisos.
export async function avisarIndicacaoRecebida(o: Opts): Promise<ResultadoCanal[]> {
  const ctx = `avisarIndicacaoRecebida solicitacao_id=${o.solicitacaoId}`;
  return executarCanaisIndependentes(ctx, {
    sino: () => gravarSino(o),
    email: () => enviarEmails(o),
  });
}

async function gravarSino(o: Opts): Promise<void> {
  const svc = createServiceClient();
  const r = await resolverDestinatarios(EVENTO_INDICACAO_RECEBIDA, "sino", o.unidadeId, svc);
  if (r.modo === "desligado") return;

  // vaga_id fica de fora de propósito: o clique deve abrir a indicação pendente (ver
  // solicitacao_indicacao_id e NotificacoesProvider.tsx), não a página da vaga.
  const base = {
    tipo: "nova_indicacao_candidato",
    titulo: "Indicação direta de candidato",
    mensagem: `${o.clienteNome} indicou ${o.candidatoNome} para a vaga ${o.vagaTitulo}`,
    solicitacao_indicacao_id: o.solicitacaoId,
    unidade_id: o.unidadeId,
  };

  // Com lista configurada: uma linha por usuário da lista. Sem configuração (ou falha ao ler
  // a config): a linha geral de sempre (user_id null, visível à equipe da unidade).
  const rows: (typeof base & { user_id: string | null })[] = r.modo === "configurado" ? r.userIds.map((userId) => ({ ...base, user_id: userId })) : [{ ...base, user_id: null }];
  if (rows.length === 0) return;

  const { error } = await svc.from("notificacoes_analista").insert(rows);
  if (error) throw new Error(`Erro ao gravar sino: ${error.message}`);
}

async function enviarEmails(o: Opts): Promise<void> {
  const svc = createServiceClient();
  const r = await resolverDestinatarios(EVENTO_INDICACAO_RECEBIDA, "email", o.unidadeId, svc);
  if (r.modo === "desligado") return;

  let attempted = 0;
  let succeeded = 0;
  if (r.modo === "configurado") {
    const resultados = await Promise.all(
      r.emails.map((d) => sendEmail({ to: d.email, subject: o.subject, html: o.html, tipo: "indicacao_candidato", vaga_id: o.vagaId }))
    );
    attempted = resultados.length;
    succeeded = resultados.filter((x) => x.success).length;
  } else {
    // Sem configuração: comportamento antigo (todos os analistas ativos da unidade).
    const res = await notifyAllAnalysts({ subject: o.subject, html: o.html, tipo: "indicacao_candidato", vaga_id: o.vagaId, unidadeId: o.unidadeId });
    attempted = res.attempted;
    succeeded = res.succeeded;
  }

  if (succeeded > 0) return;

  // Ninguém foi avisado por e-mail: mesmo alerta interno de portal/solicitar-vaga, para a
  // indicação não passar batida. Somente superuser, por decisão do diretor.
  const motivo = attempted === 0 ? "nenhum destinatário com e-mail para notificar" : `${attempted - succeeded}/${attempted} envio(s) de e-mail falharam`;
  console.error(`[avisarIndicacaoRecebida] Notificação por e-mail NÃO foi entregue a ninguém (solicitacao_id=${o.solicitacaoId}, ${motivo}).`);
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("user_id")
    .eq("nivel_acesso", "superuser")
    .eq("ativo", true);
  const alertas = (analistas ?? [])
    .filter((a) => a.user_id)
    .map((a) => ({
      tipo: "email_falhou",
      titulo: "⚠️ Falha ao notificar por e-mail",
      mensagem: `O e-mail da indicação direta de ${o.clienteNome} (${o.candidatoNome}) não foi entregue (${motivo}). A indicação já está no painel de Vagas.`,
      user_id: a.user_id,
      candidato_id: null,
      solicitacao_indicacao_id: o.solicitacaoId,
    }));
  if (alertas.length > 0) {
    const { error } = await svc.from("notificacoes_analista").insert(alertas);
    if (error) throw new Error(`Erro ao gravar alerta email_falhou: ${error.message}`);
  }
}
