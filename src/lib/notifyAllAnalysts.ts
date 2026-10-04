import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { buscarPerfilResponsavel } from "@/lib/perfilResponsavel";

interface NotifyOpts {
  subject: string;
  html: string;
  tipo: string;
  candidato_id?: string;
  vaga_id?: string;
  // Níveis de acesso a excluir do broadcast por e-mail (ex: ["diretoria", "superuser"]).
  // Opcional e aditivo — sem isso, comportamento idêntico ao anterior (todo analista
  // ativo com e-mail recebe). Não afeta sino/notificacoes_analista, que continua sendo
  // gravado separadamente pelo chamador quando aplicável.
  excluirNiveisAcesso?: string[];
  // Unidade do assunto (vaga/cliente/solicitação). Com unidade, só recebem os analistas
  // dela + quem tem acesso a todas as unidades (sócios). null/ausente = todos os analistas
  // (assunto sem unidade, ex: candidato, que é compartilhado).
  unidadeId?: string | null;
}

// Filtro de destinatários por unidade, compartilhado pelos envios em massa (e-mail) — mesma
// regra de ContextoUnidade em unidadeAuth.ts.
// Implementação em avisosResolucao.ts (módulo puro, também usado no script de verificação).
import { analistaAtendeUnidade } from "@/lib/avisosResolucao";
export { analistaAtendeUnidade };

interface NotifyResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

// Precisa ser aguardada pelo chamador até o fim: se o handler retornar a resposta HTTP
// antes disso, a função serverless pode congelar com os envios ainda pendentes — e nem
// sucesso nem erro chegam a ser gravados em email_logs.
export async function notifyAllAnalysts({ subject, html, tipo, candidato_id, vaga_id, excluirNiveisAcesso, unidadeId }: NotifyOpts): Promise<NotifyResult> {
  const supabase = createServiceClient();

  const { data: analistasTodos, error } = await supabase
    .from("analistas_perfil")
    .select("email, nivel_acesso, unidade_id, acesso_todas_unidades")
    .eq("ativo", true)
    .not("email", "is", null);
  const analistas = (analistasTodos ?? []).filter((a) => analistaAtendeUnidade(a, unidadeId));

  if (error) {
    console.error(`[notifyAllAnalysts] Erro ao buscar destinatários (tipo="${tipo}"):`, error.message);
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  const analistasFiltrados = excluirNiveisAcesso && excluirNiveisAcesso.length > 0
    ? (analistas ?? []).filter((a) => !excluirNiveisAcesso.includes(a.nivel_acesso))
    : (analistas ?? []);

  const destinatarios = analistasFiltrados.map((a) => a.email).filter((email): email is string => !!email);
  if (destinatarios.length === 0) {
    console.error(`[notifyAllAnalysts] Nenhum analista ativo com e-mail cadastrado — notificação (tipo="${tipo}") não foi enviada a ninguém.`);
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  const resultados = await Promise.all(
    destinatarios.map((email) => sendEmail({ to: email, subject, html, tipo, candidato_id, vaga_id }))
  );

  const succeeded = resultados.filter((r) => r.success).length;
  const failed = resultados.length - succeeded;
  if (failed > 0) {
    console.error(`[notifyAllAnalysts] ${failed}/${resultados.length} e-mail(s) falharam para tipo="${tipo}".`);
  }

  return { attempted: resultados.length, succeeded, failed };
}

interface NotifyResponsibleOpts {
  responsavelNome: string | null;
  subject: string;
  html: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  candidato_id?: string;
  vaga_id?: string;
  // Usado só no broadcast de fallback (sem responsável resolvido): sino e e-mail vão pra
  // unidade do assunto, não pra todo mundo.
  unidadeId?: string | null;
  // Opcional e aditivo: quando informado, SUBSTITUI só o broadcast de fallback (sem responsável
  // resolvido) — o ramo do responsável acima fica exatamente como sempre foi. Usado para o fallback
  // passar pela lista do evento em Configurações > Avisos. Quem chama garante que ele não lança;
  // se lançar, o erro é registrado e nada derruba a ação.
  fallbackBroadcast?: () => Promise<unknown>;
}

interface NotifyResponsibleResult extends NotifyResult {
  targeted: boolean;
}

// Notifica só o analista responsável pelo candidato (sino direcionado + e-mail
// individual) quando dá pra resolver candidatos.responsavel (nome) pra um
// analistas_perfil.user_id ativo. Sem responsável definido, ou responsável não
// encontrado/inativo, cai pro mesmo padrão de broadcast já usado em
// notificações gerais (sino sem user_id + e-mail pra todos os analistas ativos).
export async function notifyResponsibleOrAll(opts: NotifyResponsibleOpts): Promise<NotifyResponsibleResult> {
  const supabase = createServiceClient();

  if (opts.responsavelNome) {
    const analista = await buscarPerfilResponsavel(supabase, opts.responsavelNome);

    if (analista?.user_id && analista.email) {
      await supabase.from("notificacoes_analista").insert({
        tipo: opts.tipo,
        titulo: opts.titulo,
        mensagem: opts.mensagem,
        user_id: analista.user_id,
        candidato_id: opts.candidato_id ?? null,
      });

      const resultado = await sendEmail({
        to: analista.email,
        subject: opts.subject,
        html: opts.html,
        tipo: opts.tipo,
        candidato_id: opts.candidato_id,
        vaga_id: opts.vaga_id,
      });

      return {
        targeted: true,
        attempted: 1,
        succeeded: resultado.success ? 1 : 0,
        failed: resultado.success ? 0 : 1,
      };
    }
  }

  if (opts.fallbackBroadcast) {
    try {
      await opts.fallbackBroadcast();
    } catch (err) {
      console.error(`[notifyResponsibleOrAll] Erro no fallback configurável (tipo="${opts.tipo}"):`, err);
    }
    return { targeted: false, attempted: 0, succeeded: 0, failed: 0 };
  }

  await supabase.from("notificacoes_analista").insert({
    tipo: opts.tipo,
    titulo: opts.titulo,
    mensagem: opts.mensagem,
    user_id: null,
    candidato_id: opts.candidato_id ?? null,
    unidade_id: opts.unidadeId ?? null,
  });

  const resultado = await notifyAllAnalysts({
    subject: opts.subject,
    html: opts.html,
    tipo: opts.tipo,
    candidato_id: opts.candidato_id,
    vaga_id: opts.vaga_id,
    unidadeId: opts.unidadeId,
  });

  return { targeted: false, ...resultado };
}
