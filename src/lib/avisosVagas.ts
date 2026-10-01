import { createServiceClient } from "@/lib/supabase/server";
import { analistaAtendeUnidade } from "@/lib/notifyAllAnalysts";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type EventoAvisoVaga = "vaga_criada" | "solicitacao_vaga" | "vaga_fechada" | "vaga_cancelada" | "vaga_reativada";

interface AvisoVagaEmailMode {
  modo: "legado" | "desligado" | "configurado";
  destinatarios?: { nome: string; email: string }[];
}

interface AvisoVagaPlataformaMode {
  modo: "legado" | "configurado";
  userIds?: string[];
}

interface ResolverAvisoVagaResult {
  email: AvisoVagaEmailMode;
  plataforma: AvisoVagaPlataformaMode;
}

export async function resolverAvisoVaga(
  evento: EventoAvisoVaga,
  unidadeId: string | null | undefined
): Promise<ResolverAvisoVagaResult> {
  const supabase = createServiceClient();

  try {
    // Resolver modo e-mail
    const { data: configEmail, error: errConfig } = await supabase
      .from("aviso_vaga_config")
      .select("email_ativo")
      .eq("evento", evento)
      .single();

    if (errConfig) {
      console.error(`[resolverAvisoVaga] Erro ao buscar config de e-mail (evento="${evento}"):`, errConfig.message);
      return { email: { modo: "legado" }, plataforma: { modo: "legado" } };
    }

    let emailMode: AvisoVagaEmailMode;
    if (configEmail?.email_ativo === false) {
      emailMode = { modo: "desligado" };
    } else {
      const { data: destinatarios, error: errDest } = await supabase
        .from("aviso_vaga_email_destinatarios")
        .select("nome, email")
        .eq("evento", evento)
        .eq("ativo", true);

      if (errDest) {
        console.error(`[resolverAvisoVaga] Erro ao buscar destinatários de e-mail (evento="${evento}"):`, errDest.message);
        return { email: { modo: "legado" }, plataforma: { modo: "legado" } };
      }

      if ((destinatarios ?? []).length === 0) {
        emailMode = { modo: "legado" };
      } else {
        emailMode = { modo: "configurado", destinatarios: destinatarios ?? [] };
      }
    }

    // Resolver modo plataforma
    const { data: destPlataforma, error: errPlat } = await supabase
      .from("aviso_vaga_plataforma_destinatarios")
      .select("usuario_id")
      .eq("evento", evento);

    if (errPlat) {
      console.error(`[resolverAvisoVaga] Erro ao buscar destinatários de plataforma (evento="${evento}"):`, errPlat.message);
      return { email: emailMode, plataforma: { modo: "legado" } };
    }

    const userIdsConfigured = (destPlataforma ?? []).map((d) => d.usuario_id);
    if (userIdsConfigured.length === 0) {
      return { email: emailMode, plataforma: { modo: "legado" } };
    }

    // Buscar analistas_perfil desses usuários
    const { data: analistas, error: errAnalistas } = await supabase
      .from("analistas_perfil")
      .select("user_id, ativo, unidade_id, acesso_todas_unidades")
      .in("user_id", userIdsConfigured);

    if (errAnalistas) {
      console.error(`[resolverAvisoVaga] Erro ao buscar analistas (evento="${evento}"):`, errAnalistas.message);
      return { email: emailMode, plataforma: { modo: "legado" } };
    }

    // Filtrar: ativos e que passam em analistaAtendeUnidade
    const userIdsFiltrados = (analistas ?? [])
      .filter((a) => a.ativo === true && analistaAtendeUnidade(a, unidadeId))
      .map((a) => a.user_id);

    // Se havia usuários configurados mas nenhum passou no filtro
    if (userIdsConfigured.length > 0 && userIdsFiltrados.length === 0) {
      console.warn(
        `[resolverAvisoVaga] Evento "${evento}" tem destinatários configurados, mas NENHUM passou no filtro de unidade/ativo (unidadeId="${unidadeId}")`
      );
    }

    return { email: emailMode, plataforma: { modo: "configurado", userIds: userIdsFiltrados } };
  } catch (err) {
    console.error("[resolverAvisoVaga] Erro inesperado:", err);
    return { email: { modo: "legado" }, plataforma: { modo: "legado" } };
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
  resolvido,
}: GravarSinoAvisoVagaOpts): Promise<void> {
  const supabase = createServiceClient();
  const modo = resolvido ?? await resolverAvisoVaga(evento, unidadeId);

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
    }));

    const { error } = await supabase.from("notificacoes_analista").insert(notificacoes);
    if (error) {
      console.error(`[gravarSinoAvisoVaga] Erro ao registrar notificações configuradas (evento="${evento}"):`, error.message);
    }
  }
}
