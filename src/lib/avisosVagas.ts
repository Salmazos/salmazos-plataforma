import { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";

// Inclui os pedidos do cliente no portal (Fase 3): mesmo mecanismo de sino/e-mail de Vagas — sem
// configuração nova, o resultado é o modo "legado" e cada chamador mantém o comportamento antigo.
export type EventoAvisoVaga =
  | "vaga_criada"
  | "solicitacao_vaga"
  | "vaga_fechada"
  | "vaga_cancelada"
  | "vaga_reativada"
  | "solicitacao_alteracao_pedida"
  | "vaga_reativacao_pedida"
  | "vaga_pausa_pedida"
  | "agendamento_cliente";

interface AvisoVagaEmailMode {
  modo: "legado" | "desligado" | "configurado";
  destinatarios?: { nome: string; email: string }[];
}

interface AvisoVagaPlataformaMode {
  modo: "legado" | "desligado" | "configurado";
  userIds?: string[];
}

interface ResolverAvisoVagaResult {
  email: AvisoVagaEmailMode;
  plataforma: AvisoVagaPlataformaMode;
}

// Quem recebe o aviso de vaga em cada canal. A decisão (tabelas novas de Avisos, com fallback
// para as tabelas antigas de vagas) mora em resolverDestinatarios; aqui só se mantém o formato
// que os chamadores já usam. Falha de leitura = modo legado (aviso nunca derruba a ação).
export async function resolverAvisoVaga(
  evento: EventoAvisoVaga,
  unidadeId: string | null | undefined
): Promise<ResolverAvisoVagaResult> {
  const legado: ResolverAvisoVagaResult = { email: { modo: "legado" }, plataforma: { modo: "legado" } };
  try {
    // `?? null` de propósito: para vagas o filtro de analista ativo/unidade vale mesmo sem unidade.
    const [email, sino] = await Promise.all([
      resolverDestinatarios(evento, "email", unidadeId ?? null),
      resolverDestinatarios(evento, "sino", unidadeId ?? null),
    ]);
    if (email.falhou) return legado;

    const emailMode: AvisoVagaEmailMode =
      email.modo === "configurado" ? { modo: "configurado", destinatarios: email.emails } : { modo: email.modo };
    if (sino.falhou) return { email: emailMode, plataforma: { modo: "legado" } };

    if (sino.modo === "configurado" && sino.userIds.length === 0) {
      console.warn(
        `[resolverAvisoVaga] Evento "${evento}" tem destinatários configurados, mas NENHUM passou no filtro de unidade/ativo (unidadeId="${unidadeId}")`
      );
    }
    const plataforma: AvisoVagaPlataformaMode =
      sino.modo === "configurado" ? { modo: "configurado", userIds: sino.userIds } : { modo: sino.modo };
    return { email: emailMode, plataforma };
  } catch (err) {
    console.error("[resolverAvisoVaga] Erro inesperado:", err);
    return legado;
  }
}

interface GravarSinoAvisoVagaOpts {
  evento: EventoAvisoVaga;
  unidadeId: string | null | undefined;
  tipo: string;
  titulo: string;
  mensagem: string;
  vagaId?: string | null;
  solicitacaoVagaId?: string | null;
  candidatoId?: string | null;
  resolvido?: ResolverAvisoVagaResult;
}

export async function gravarSinoAvisoVaga({
  evento,
  unidadeId,
  tipo,
  titulo,
  mensagem,
  vagaId,
  solicitacaoVagaId,
  candidatoId,
  resolvido,
}: GravarSinoAvisoVagaOpts): Promise<void> {
  const supabase = createServiceClient();
  const modo = resolvido ?? await resolverAvisoVaga(evento, unidadeId);

  if (modo.plataforma.modo === "desligado") {
    // Canal Sino desligado em Avisos: ninguém recebe.
    return;
  }

  if (modo.plataforma.modo === "legado") {
    // Modo legado: uma linha com user_id nulo e unidade_id
    const { error } = await supabase.from("notificacoes_analista").insert({
      tipo,
      titulo,
      mensagem,
      user_id: null,
      unidade_id: unidadeId ?? null,
      vaga_id: vagaId ?? null,
      solicitacao_vaga_id: solicitacaoVagaId ?? null,
      ...(candidatoId ? { candidato_id: candidatoId } : {}),
    });
    if (error) {
      console.error(`[gravarSinoAvisoVaga] Erro ao registrar notificação legado (evento="${evento}"):`, error.message);
    }
  } else if (modo.plataforma.modo === "configurado") {
    // Modo configurado: uma linha por userId
    const userIds = modo.plataforma.userIds ?? [];
    if (userIds.length === 0) {
      // Ninguém recebe sino
      return;
    }

    const notificacoes = userIds.map((userId) => ({
      tipo,
      titulo,
      mensagem,
      user_id: userId,
      unidade_id: unidadeId ?? null,
      vaga_id: vagaId ?? null,
      solicitacao_vaga_id: solicitacaoVagaId ?? null,
      ...(candidatoId ? { candidato_id: candidatoId } : {}),
    }));

    const { error } = await supabase.from("notificacoes_analista").insert(notificacoes);
    if (error) {
      console.error(`[gravarSinoAvisoVaga] Erro ao registrar notificações configuradas (evento="${evento}"):`, error.message);
    }
  }
}
