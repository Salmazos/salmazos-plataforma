import type { createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { textosSino, TIPO_SINO_COMISSAO, type TextoSino } from "@/lib/comissaoPendenciasRegras";
import { inicioDiaBrasilia } from "@/lib/cobrancaRSRegras";

// Sinos (notificacoes_analista) de comissão para a DIRETORIA e lembretes ao beneficiário. Mesmo mecanismo dos sinos existentes: uma
// linha por pessoa (user_id). NUNCA lançam: o aviso é complemento, a gravação principal (marcação, cron) já aconteceu.

type Service = ReturnType<typeof createServiceClient>;

// Diretoria/superuser ativos que podem ver a unidade (acesso a todas as unidades, ou a própria). A exceção individual de aba
// (usuario_acesso_customizado) não entra aqui: quem tem o papel recebe, como nos demais avisos da diretoria.
export async function userIdsDiretoriaComissao(svc: Service, unidadeId: string | null, excluirUserId?: string | null): Promise<string[]> {
  const { data } = await svc.from("analistas_perfil").select("user_id, nivel_acesso, ativo, unidade_id, acesso_todas_unidades");
  const ids = new Set<string>();
  for (const p of (data ?? []) as { user_id: string | null; nivel_acesso: string; ativo: boolean; unidade_id: string | null; acesso_todas_unidades: boolean | null }[]) {
    if (!p.user_id || !p.ativo || !PAPEIS_FULL_ACCESS.includes(p.nivel_acesso)) continue;
    if (excluirUserId && p.user_id === excluirUserId) continue;
    if (unidadeId && !p.acesso_todas_unidades && p.unidade_id !== unidadeId) continue;
    ids.add(p.user_id);
  }
  return [...ids];
}

// Grava o sino para cada usuário. `umaVezPorDia`: pula quem já recebeu este tipo hoje (Brasília) — o cron pode rodar de novo sem duplicar.
// Devolve quantos sinos foram gravados.
export async function gravarSinoComissao(
  svc: Service,
  o: { userIds: readonly string[]; tipo: string; texto: TextoSino; unidadeId?: string | null; umaVezPorDia?: boolean; agora?: Date }
): Promise<number> {
  try {
    const agora = o.agora ?? new Date();
    let alvos = [...new Set(o.userIds)];
    if (alvos.length === 0) return 0;
    if (o.umaVezPorDia) {
      const desde = inicioDiaBrasilia(agora);
      const { data: jaTem } = await svc.from("notificacoes_analista").select("user_id, created_at, unidade_id").eq("tipo", o.tipo).in("user_id", alvos);
      // Com unidade informada, o "já recebeu hoje" vale por unidade (quem vê as duas recebe um aviso de cada).
      const ja = new Set(((jaTem ?? []) as { user_id: string; created_at: string; unidade_id: string | null }[]).filter((n) => Date.parse(n.created_at) >= Date.parse(desde) && (!o.unidadeId || n.unidade_id === o.unidadeId)).map((n) => n.user_id));
      alvos = alvos.filter((u) => !ja.has(u));
      if (alvos.length === 0) return 0;
    }
    const { error } = await svc.from("notificacoes_analista").insert(
      alvos.map((user_id) => ({
        tipo: o.tipo, titulo: o.texto.titulo, mensagem: o.texto.mensagem, user_id, lida: false, created_at: agora.toISOString(),
        ...(o.unidadeId ? { unidade_id: o.unidadeId } : {}),
      }))
    );
    if (error) {
      console.error(`[comissao] Erro ao gravar sino (${o.tipo}):`, error.message);
      return 0;
    }
    return alvos.length;
  } catch (e) {
    console.error(`[comissao] Falha no sino (${o.tipo}):`, e);
    return 0;
  }
}

// A cada marcação de comissão: a diretoria é avisada na hora (a marcada na folga vem destacada). Quem marcou, se for diretoria, não se auto-avisa.
export async function avisarDiretoriaMarcacao(
  svc: Service,
  o: { marcadoPorUserId: string | null; beneficiario: string | null; cliente: string | null; valor: number; competencia: string; folga: boolean; unidadeId: string; agora?: Date }
): Promise<void> {
  const userIds = await userIdsDiretoriaComissao(svc, o.unidadeId, o.marcadoPorUserId);
  await gravarSinoComissao(svc, {
    userIds, tipo: TIPO_SINO_COMISSAO.diretoriaMarcada, unidadeId: o.unidadeId, agora: o.agora,
    texto: textosSino.marcada({ beneficiario: o.beneficiario ?? "Um beneficiário", cliente: o.cliente, valor: o.valor, competencia: o.competencia, folga: o.folga }),
  });
}
