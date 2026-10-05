import { createServiceClient } from "@/lib/supabase/server";
import { buscarPerfilResponsavel } from "@/lib/perfilResponsavel";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import {
  enviarEmailParaLista,
  gravarSinoConfiguravel,
  jaExisteAvisoRecente,
  resolverEmailConfiguravel,
} from "@/lib/avisoConfiguravel";
import { inicioJanelaSemRepetir, type ResultadoCanalAviso } from "@/lib/avisosRestantesRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface OpcoesAvisoComResponsavel {
  // Evento de Configurações > Avisos (agendamento_cliente ou lembrete_agendamento_pendente_analista).
  evento: string;
  // Tipo gravado em notificacoes_analista e email_logs (não muda).
  tipo: string;
  titulo: string;
  mensagem: string;
  responsavelNome?: string | null;
  candidatoId?: string | null;
  vagaId?: string | null;
  // Unidade do cliente: filtra a lista do canal e define o aviso geral do fallback.
  unidadeId?: string | null;
  email: { subject: string; html: string };
  // Sem responsável ativo: o fallback de cada fluxo. Omitido, vale o padrão (aviso geral da unidade + e-mail para os
  // analistas da unidade, ou a lista).
  fallback?: () => Promise<unknown>;
  // Não repetir o aviso ao mesmo candidato dentro desta janela (lembrete diário que tenta de novo).
  semRepetirHoras?: number;
  contexto: string;
}

export interface ResultadoAvisoComResponsavel {
  alvo: "responsavel" | "fallback" | "repetido";
  sino: ResultadoCanalAviso | "n/a";
  email: ResultadoCanalAviso | "n/a";
}

// Aviso ao responsável do candidato COM interruptor por canal e lista: com responsável ativo (login e e-mail) ele SEMPRE
// recebe (sino nominal + e-mail, como antes) E a lista do canal também; sem responsável vale o fallback de cada fluxo.
// Sino ou e-mail desligado em Configurações > Avisos = ninguém recebe aquele canal (nem o responsável). Nunca lança.
export async function avisarComResponsavel(svc: ServiceClient, o: OpcoesAvisoComResponsavel): Promise<ResultadoAvisoComResponsavel> {
  try {
    if (o.semRepetirHoras && o.candidatoId) {
      const repetido = await jaExisteAvisoRecente(svc, { tipo: o.tipo, candidatoId: o.candidatoId, desde: inicioJanelaSemRepetir(new Date(), o.semRepetirHoras) });
      if (repetido) return { alvo: "repetido", sino: "n/a", email: "n/a" };
    }

    let perfil: { user_id: string; email: string } | null = null;
    if (o.responsavelNome) {
      try {
        const p = await buscarPerfilResponsavel(svc, o.responsavelNome);
        if (p?.user_id && p.email) perfil = { user_id: p.user_id, email: p.email };
      } catch (err) {
        console.error(`[${o.contexto}] Erro ao resolver o responsável (segue pelo fallback):`, err);
      }
    }
    const msgEmail = { subject: o.email.subject, html: o.email.html, tipo: o.tipo, candidato_id: o.candidatoId ?? undefined, vaga_id: o.vagaId ?? undefined };
    const linha = { tipo: o.tipo, titulo: o.titulo, mensagem: o.mensagem, candidato_id: o.candidatoId ?? null };

    if (perfil) {
      const [sino, email] = await Promise.all([
        gravarSinoConfiguravel(svc, { evento: o.evento, deSempre: [perfil.user_id], linha, geral: "nunca", unidadeFiltro: o.unidadeId ?? null }),
        (async (): Promise<ResultadoCanalAviso> => {
          const d = await resolverEmailConfiguravel(svc, o.evento, o.unidadeId ?? null);
          if (d.modo === "desligado") return "desligado";
          return enviarEmailParaLista(d.modo === "lista" ? [perfil!.email, ...d.emails] : [perfil!.email], msgEmail, o.contexto);
        })().catch((): ResultadoCanalAviso => "falhou"),
      ]);
      return { alvo: "responsavel", sino, email };
    }

    if (o.fallback) {
      try {
        await o.fallback();
      } catch (err) {
        console.error(`[${o.contexto}] Erro no fallback configurável:`, err);
      }
      return { alvo: "fallback", sino: "n/a", email: "n/a" };
    }

    const [sino, email] = await Promise.all([
      gravarSinoConfiguravel(svc, { evento: o.evento, deSempre: [], linha: { ...linha, unidade_id: o.unidadeId ?? null }, geral: "sempre", unidadeFiltro: o.unidadeId ?? null }),
      (async (): Promise<ResultadoCanalAviso> => {
        const d = await resolverEmailConfiguravel(svc, o.evento, o.unidadeId ?? null);
        if (d.modo === "desligado") return "desligado";
        if (d.modo === "lista") return enviarEmailParaLista(d.emails, msgEmail, o.contexto);
        const r = await notifyAllAnalysts({ ...msgEmail, unidadeId: o.unidadeId ?? null });
        return r.succeeded > 0 ? "enviado" : r.attempted === 0 ? "sem_destinatario" : "falhou";
      })().catch((): ResultadoCanalAviso => "falhou"),
    ]);
    return { alvo: "fallback", sino, email };
  } catch (err) {
    console.error(`[${o.contexto}] Falha ao avisar:`, err);
    return { alvo: "fallback", sino: "falhou", email: "falhou" };
  }
}
