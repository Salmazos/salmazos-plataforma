import { SITE_URL } from "@/lib/siteUrl";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { resolverDestinatarios } from "@/lib/avisos";
import { executarCanaisIndependentes, type ResultadoCanal } from "@/lib/avisosResolucao";
import { montarHtmlEdicao, textoSino, type LinhaAviso } from "@/lib/indicacaoEdicao";

export const EVENTO_INDICACAO_EDITADA = "indicacao_candidato_editada_cliente";

interface Opts {
  solicitacaoId: string;
  // Só indicação aprovada: o clique do sino leva ao perfil do candidato, onde os dados vivem agora.
  candidatoId: string | null;
  // null só se nem a indicação nem a vaga têm unidade (não deveria existir): sem filtro de unidade.
  unidadeId: string | null;
  vagaId: string;
  vagaTitulo: string;
  clienteNome: string;
  candidatoNome: string;
  linhas: LinhaAviso[];
  notas: string[];
}

// Aviso interno de "cliente editou uma indicação". Mesmo modelo de avisoIndicacaoRecebida.ts: cada canal
// roda isolado e esta função NUNCA lança — a edição já foi gravada quando ela roda. Sem popup (decisão de
// negócio): só sino e e-mail, pela lista de Configurações > Avisos.
export async function avisarIndicacaoEditada(o: Opts): Promise<ResultadoCanal[]> {
  const ctx = `avisarIndicacaoEditada solicitacao_id=${o.solicitacaoId}`;
  return executarCanaisIndependentes(ctx, {
    sino: () => gravarSino(o),
    email: () => enviarEmails(o),
  });
}

async function gravarSino(o: Opts): Promise<void> {
  const svc = createServiceClient();
  const r = await resolverDestinatarios(EVENTO_INDICACAO_EDITADA, "sino", o.unidadeId, svc);
  if (r.modo === "desligado") return;

  // Nunca vaga_id: o clique deve abrir a indicação (pendente) ou o candidato (aprovada), não a vaga.
  const base = {
    tipo: "indicacao_editada_cliente",
    titulo: "Indicação editada pelo cliente",
    mensagem: textoSino(o.clienteNome, o.candidatoNome, o.linhas),
    solicitacao_indicacao_id: o.solicitacaoId,
    ...(o.candidatoId ? { candidato_id: o.candidatoId } : {}),
    unidade_id: o.unidadeId,
  };

  const rows: (typeof base & { user_id: string | null })[] = r.modo === "configurado" ? r.userIds.map((userId) => ({ ...base, user_id: userId })) : [{ ...base, user_id: null }];
  if (rows.length === 0) return;

  const { error } = await svc.from("notificacoes_analista").insert(rows);
  if (error) throw new Error(`Erro ao gravar sino: ${error.message}`);
}

async function enviarEmails(o: Opts): Promise<void> {
  const svc = createServiceClient();
  const r = await resolverDestinatarios(EVENTO_INDICACAO_EDITADA, "email", o.unidadeId, svc);
  if (r.modo === "desligado") return;

  const link = o.candidatoId ? `${SITE_URL}/painel/candidato/${o.candidatoId}` : `${SITE_URL}/painel/vagas?indicacao=${o.solicitacaoId}`;
  const html = montarHtmlEdicao({ clienteNome: o.clienteNome, candidatoNome: o.candidatoNome, vagaTitulo: o.vagaTitulo, linhas: o.linhas, notas: o.notas, link });
  const subject = `✏️ Indicação editada — ${o.candidatoNome} — ${o.clienteNome}`;

  let attempted = 0;
  let succeeded = 0;
  if (r.modo === "configurado") {
    const resultados = await Promise.all(r.emails.map((d) => sendEmail({ to: d.email, subject, html, tipo: "indicacao_candidato_editada", vaga_id: o.vagaId })));
    attempted = resultados.length;
    succeeded = resultados.filter((x) => x.success).length;
  } else {
    const res = await notifyAllAnalysts({ subject, html, tipo: "indicacao_candidato_editada", vaga_id: o.vagaId, unidadeId: o.unidadeId });
    attempted = res.attempted;
    succeeded = res.succeeded;
  }
  if (succeeded > 0) return;

  // Ninguém foi avisado por e-mail: o sino geral acima já registrou a edição; só deixa rastro no log.
  console.error(`[avisarIndicacaoEditada] E-mail NÃO entregue a ninguém (solicitacao_id=${o.solicitacaoId}, tentativas=${attempted}).`);
}
