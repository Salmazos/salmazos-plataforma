import type { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";

// Avisos por SINO (notificacoes_analista) ao beneficiário da comissão — sem e-mail e sem popup. Mesmo padrão dos sinos existentes:
// uma linha direcionada (user_id) com tipo/título/mensagem; o clique abre Minhas comissões (NotificacoesProvider trata os tipos
// "comissao_*"). Nunca lança: o aviso é complemento, a ação da diretoria já foi gravada.

type Service = ReturnType<typeof createServiceClient>;

export const TIPO_AVISO_COMISSAO = {
  contestada: "comissao_contestada",
  contestacaoResolvida: "comissao_contestacao_resolvida",
  retroativoAprovado: "comissao_retroativo_aprovado",
  retroativoRecusado: "comissao_retroativo_recusado",
  fechamento: "comissao_fechamento",
  pagamento: "comissao_pagamento",
} as const;

export type TipoAvisoComissao = (typeof TIPO_AVISO_COMISSAO)[keyof typeof TIPO_AVISO_COMISSAO];

export const LINK_MINHAS_COMISSOES = "/painel/minhas-comissoes";

export interface AvisoComissao {
  beneficiarioId: string;
  tipo: TipoAvisoComissao;
  titulo: string;
  mensagem: string;
  // Só para a auditoria (quem disparou e a que se refere).
  referencia: { lancamento_id?: string; fechamento_id?: string };
  disparadoPor: { id: string; nome: string | null };
}

// Cria o sino para UM beneficiário (resolve beneficiário -> analista -> user_id). Devolve true se gravou.
export async function avisarBeneficiario(svc: Service, a: AvisoComissao): Promise<boolean> {
  try {
    const { data: ben } = await svc.from("comissao_beneficiarios").select("analista_perfil_id").eq("id", a.beneficiarioId).maybeSingle();
    if (!ben) return false;
    const { data: perfil } = await svc.from("analistas_perfil").select("user_id").eq("id", ben.analista_perfil_id).maybeSingle();
    if (!perfil?.user_id) return false;
    const { error } = await svc.from("notificacoes_analista").insert({ tipo: a.tipo, titulo: a.titulo, mensagem: a.mensagem, user_id: perfil.user_id, lida: false });
    if (error) {
      console.error("[comissao] Erro ao gravar sino:", error.message);
      return false;
    }
    registrarAuditoria({
      usuario_id: a.disparadoPor.id || null,
      usuario_nome: a.disparadoPor.nome,
      acao: "comissao_aviso_criado",
      entidade: "notificacoes_analista",
      entidade_id: a.referencia.lancamento_id ?? a.referencia.fechamento_id ?? null,
      // Sem o texto do aviso (já está na notificação): só o tipo e a quem foi.
      detalhes: { tipo: a.tipo, beneficiario_id: a.beneficiarioId, destinatario_user_id: perfil.user_id, ...a.referencia },
    });
    return true;
  } catch (e) {
    console.error("[comissao] Erro ao avisar beneficiário:", e);
    return false;
  }
}

const moedaBR = (v: number): string => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Textos curtos. `cliente`/`vaga` identificam a cobrança sem expor dado fiscal.
export const textos = {
  contestada: (o: { cliente: string | null; valor: number; motivo: string }) => ({
    titulo: "💰 Comissão contestada",
    mensagem: `${o.cliente ?? "Cobrança"}: a diretoria contestou sua comissão de ${moedaBR(o.valor)}. Motivo: ${o.motivo}`,
  }),
  contestacaoResolvida: (o: { cliente: string | null; acao: "mantem" | "ajuste" | "remover"; nota: string }) => ({
    titulo: "💰 Contestação resolvida",
    mensagem: `${o.cliente ?? "Cobrança"}: ${o.acao === "mantem" ? "comissão mantida" : o.acao === "ajuste" ? "comissão ajustada" : "comissão removida"}. ${o.nota}`,
  }),
  retroativoAprovado: (o: { cliente: string | null; valor: number; mes: string }) => ({
    titulo: "💰 Retroativo aprovado",
    mensagem: `${o.cliente ?? "Cobrança"} (${o.mes}): a diretoria aprovou sua comissão de ${moedaBR(o.valor)}.`,
  }),
  retroativoRecusado: (o: { cliente: string | null; mes: string; motivo: string }) => ({
    titulo: "💰 Retroativo recusado",
    mensagem: `${o.cliente ?? "Cobrança"} (${o.mes}): a diretoria recusou o lançamento retroativo. Motivo: ${o.motivo}`,
  }),
  fechamento: (o: { mes: string; total: number; qtd: number }) => ({
    titulo: "💰 Fechamento de comissões concluído",
    mensagem: `${o.mes}: sua parte no fechamento é ${moedaBR(o.total)} (${o.qtd} lançamento${o.qtd === 1 ? "" : "s"}). Aguardando pagamento na folha.`,
  }),
  pagamento: (o: { mes: string; total: number; pagoEm: string }) => ({
    titulo: "💰 Comissão paga na folha",
    mensagem: `Fechamento de ${o.mes}: ${moedaBR(o.total)} pago em ${o.pagoEm.split("-").reverse().join("/")}.`,
  }),
};
