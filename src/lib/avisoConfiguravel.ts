import { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { sendEmail } from "@/lib/sendEmail";
import { popupDecisaoLigado } from "@/lib/decisaoClienteCandidato";
import { unirUserIds, type ResultadoCanalAviso, type TextoAviso } from "@/lib/avisosRestantesRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Peças comuns dos avisos internos configuráveis em Configurações > Avisos (mesmas regras de avisarGarantiaRS e
// avisarPosVendaRS). NUNCA lançam: devolvem o resultado do canal para quem chama decidir o carimbo.

export interface LinhaSino extends TextoAviso {
  tipo: string;
  candidato_id?: string | null;
  vaga_id?: string | null;
  unidade_id?: string | null;
  // Colunas de vínculo de cada tipo (cliente_meta_supervisao_id, conta_receber_hortolandia_id…).
  extra?: Record<string, unknown>;
}

export interface OpcoesSino {
  evento: string;
  // user_id dos destinatários de sempre (o responsável, o vendedor, a diretoria…); a lista do canal entra por cima.
  deSempre: readonly (string | null | undefined)[];
  linha: LinhaSino;
  // Texto específico de um usuário (o responsável antigo e o novo recebem textos diferentes).
  textoPorUsuario?: Record<string, TextoAviso>;
  // Linha geral (user_id nulo, visível a todos): "sempre" = como hoje, além dos nominais; "se_sem_de_sempre" = só se
  // não houver destinatário de sempre; "nunca".
  geral: "sempre" | "se_sem_de_sempre" | "nunca";
  // Filtro de unidade/ativo na lista do canal (como em Vagas); omitido = sem filtro.
  unidadeFiltro?: string | null;
}

// SINO: sem linha de canal ou erro de leitura = ligado; só ativo = false desliga TUDO (nominais e geral).
export async function gravarSinoConfiguravel(svc: ServiceClient, o: OpcoesSino): Promise<ResultadoCanalAviso> {
  try {
    const lista = await resolverDestinatarios(o.evento, "sino", o.unidadeFiltro, svc);
    if (lista.modo === "desligado") return "desligado";
    const userIdsLista = lista.modo === "configurado" && !lista.falhou ? lista.userIds : [];

    const deSempre = o.deSempre.filter((x): x is string => !!x);
    const userIds = unirUserIds(deSempre, userIdsLista);
    const base: Record<string, unknown> = {
      tipo: o.linha.tipo,
      candidato_id: o.linha.candidato_id ?? null,
      ...(o.linha.vaga_id !== undefined ? { vaga_id: o.linha.vaga_id } : {}),
      ...(o.linha.unidade_id !== undefined ? { unidade_id: o.linha.unidade_id } : {}),
      ...(o.linha.extra ?? {}),
    };

    const rows: Record<string, unknown>[] = userIds.map((user_id) => {
      const t = o.textoPorUsuario?.[user_id] ?? o.linha;
      return { ...base, titulo: t.titulo, mensagem: t.mensagem, user_id };
    });
    const comGeral = o.geral === "sempre" || (o.geral === "se_sem_de_sempre" && deSempre.length === 0);
    if (comGeral) rows.push({ ...base, titulo: o.linha.titulo, mensagem: o.linha.mensagem, user_id: null });
    if (rows.length === 0) return "sem_destinatario";

    const { error } = await svc.from("notificacoes_analista").insert(rows);
    if (error) {
      console.error(`[avisoConfiguravel] Erro ao gravar o sino (evento="${o.evento}"):`, error.message);
      return "falhou";
    }
    return "enviado";
  } catch (err) {
    console.error(`[avisoConfiguravel] Falha no sino (evento="${o.evento}"):`, err);
    return "falhou";
  }
}

export type DestinoEmail = { modo: "desligado" } | { modo: "legado" } | { modo: "lista"; emails: string[] };

// E-MAIL: desligado = ninguém; com lista no canal = só a lista; sem lista (ou sem conseguir ler) = "legado"
// (o comportamento de sempre de quem chama). `unidadeId` filtra a lista por analista ativo da unidade, como em Vagas.
export async function resolverEmailConfiguravel(
  svc: ServiceClient,
  evento: string,
  unidadeId?: string | null
): Promise<DestinoEmail> {
  try {
    const r = await resolverDestinatarios(evento, "email", unidadeId ?? null, svc);
    if (r.modo === "desligado") return { modo: "desligado" };
    if (r.modo === "configurado" && !r.falhou) return { modo: "lista", emails: r.emails.map((d) => d.email).filter(Boolean) };
    return { modo: "legado" };
  } catch (err) {
    console.error(`[avisoConfiguravel] Falha ao resolver o e-mail (evento="${evento}"):`, err);
    return { modo: "legado" };
  }
}

export interface EmailAviso {
  subject: string;
  html: string;
  tipo: string;
  candidato_id?: string;
  vaga_id?: string;
}

// Envia para uma lista de endereços (sem repetir). Nunca lança.
export async function enviarEmailParaLista(emails: readonly string[], msg: EmailAviso, contexto: string): Promise<ResultadoCanalAviso> {
  try {
    const unicos = [...new Map(emails.filter(Boolean).map((e) => [e.toLowerCase(), e])).values()];
    if (unicos.length === 0) return "sem_destinatario";
    const resultados = await Promise.all(unicos.map((to) => sendEmail({ to, ...msg })));
    const falhas = resultados.filter((x) => !x.success).length;
    if (falhas > 0) console.error(`[${contexto}] ${falhas}/${resultados.length} e-mail(s) falharam.`);
    return resultados.some((x) => x.success) ? "enviado" : "falhou";
  } catch (err) {
    console.error(`[${contexto}] Falha ao enviar e-mails:`, err);
    return "falhou";
  }
}

// POPUP: sem linha de canal ou erro de leitura = desligado (não mostra).
export async function popupEventoLigado(svc: ServiceClient, evento: string): Promise<boolean> {
  try {
    const { data, error } = await svc.from("aviso_eventos_canais").select("ativo").eq("evento", evento).eq("canal", "popup").maybeSingle();
    if (error) {
      console.error(`[popupEventoLigado] Erro ao ler o canal popup (evento="${evento}"; segue desligado):`, error.message);
      return false;
    }
    return popupDecisaoLigado({ linha: data ? { ativo: data.ativo } : null, erro: false });
  } catch (err) {
    console.error(`[popupEventoLigado] Erro inesperado (evento="${evento}"; segue desligado):`, err);
    return false;
  }
}

// Guarda sem coluna nova: já existe aviso deste tipo/candidato/vaga desde `desde` (ISO)? Em caso de erro devolve
// false (melhor avisar do que calar).
export async function jaExisteAvisoRecente(
  svc: ServiceClient,
  o: { tipo: string; candidatoId?: string | null; vagaId?: string | null; titulo?: string | null; desde: string }
): Promise<boolean> {
  try {
    let q = svc.from("notificacoes_analista").select("id").eq("tipo", o.tipo).gte("created_at", o.desde).limit(1);
    if (o.candidatoId) q = q.eq("candidato_id", o.candidatoId);
    if (o.vagaId) q = q.eq("vaga_id", o.vagaId);
    if (o.titulo) q = q.eq("titulo", o.titulo);
    const { data, error } = await q;
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
