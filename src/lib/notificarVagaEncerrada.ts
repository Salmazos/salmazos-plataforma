import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { getEmailTemplate } from "@/lib/emailTemplates";

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
    .select("id, titulo, tipo_servico, cidade, estado, responsavel, confidencial, cliente_id, clientes(nome)")
    .eq("id", vagaId)
    .single();

  if (!vaga) { console.error("[notificarVagaEncerrada] Vaga não encontrada:", vagaId); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaClienteNome = (vaga.clientes as any)?.nome ?? null;

  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("email, nome_completo")
    .eq("ativo", true);

  if (!analistas?.length) { console.log("[notificarVagaEncerrada] Nenhum analista ativo"); return; }

  const vagaUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas/${vagaId}`;
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

  const destinatarios = analistas.filter((a) => a.email);
  console.log(`[notificarVagaEncerrada] Enviando para ${destinatarios.length} analistas`);

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
  ).catch((err) => console.error("[notificarVagaEncerrada] Erro:", err));

  const vagaConfidencial = vaga.confidencial === true;
  const { error: errNotifSino } = await svc.from("notificacoes_analista").insert({
    tipo: "vaga_encerrada",
    titulo: `${vagaConfidencial ? "🔴 [CONFIDENCIAL] " : ""}Vaga encerrada: ${vaga.titulo}`,
    mensagem: `Vaga "${vaga.titulo}" (${TIPO_LABELS[vaga.tipo_servico] ?? vaga.tipo_servico}) foi encerrada (${status}).`,
    vaga_id: vagaId,
  });
  if (errNotifSino) console.error("[notificarVagaEncerrada] Erro ao registrar notificação de sino:", errNotifSino.message);
}
