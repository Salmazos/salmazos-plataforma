import { createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { sendEmail } from "@/lib/sendEmail";
import { gravarSinoConfiguravel } from "@/lib/avisoConfiguravel";
import type { ResultadoCanalAviso } from "@/lib/avisosRestantesRegras";
import { EVENTO_COBRANCA_RS_ATRASADA, TIPO_COBRANCA_ATRASADA } from "@/lib/cobrancaRSRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface DestinoLegadoCobranca {
  email: string;
  nome_completo?: string | null;
}

export interface OpcoesEmailCobrancaRS {
  // Evento de Configurações > Avisos (cobranca_rs_gerada, _validada, _paga, _cancelada ou _atrasada).
  evento: string;
  // Tipo gravado em email_logs (não muda).
  tipo: string;
  cobrancaId: string;
  contexto: string;
  // O comportamento de hoje de cada aviso: quem recebe quando NÃO há lista no canal e-mail. Só é chamado nesse caso.
  legado: () => Promise<readonly DestinoLegadoCobranca[]>;
  // Monta o e-mail (o conteúdo dos e-mails internos existentes não muda). `nome` só é usado pelo aviso de validação,
  // que cumprimenta o revisor; com lista (sem nome conhecido) vai vazio.
  montar: (nome: string) => { subject: string; html: string };
  // "Sem destinatário" é esperado neste aviso (cobrança paga sem revisor ou revisada pela diretoria): log informativo.
  semDestinatarioEsperado?: boolean;
}

export interface ResultadoEmailCobrancaRS {
  resultado: ResultadoCanalAviso;
  // Quantos endereços foram o alvo do envio (0 = desligado ou ninguém a quem enviar).
  destinatarios: number;
  // Algum envio individual falhou (igual ao `emailFalhou` que aprovar e reenviar sempre devolveram).
  algumaFalha: boolean;
}

// E-mail interno da Cobrança R&S, depois da gravação principal. NUNCA lança: o pagamento, a aprovação etc. já estão no
// banco. Desligado = ninguém; com lista no canal = só a lista; sem lista (ou sem conseguir ler a configuração) = o legado
// de cada aviso. Sem filtro de unidade: cobrança não pertence a uma unidade.
export async function avisarCobrancaRSEmail(svc: ServiceClient, o: OpcoesEmailCobrancaRS): Promise<ResultadoEmailCobrancaRS> {
  try {
    const cfg = await resolverDestinatarios(o.evento, "email", undefined, svc);
    if (cfg.modo === "desligado") return { resultado: "desligado", destinatarios: 0, algumaFalha: false };

    const alvos: { email: string; nome: string }[] =
      cfg.modo === "configurado" && !cfg.falhou
        ? cfg.emails.map((d) => ({ email: d.email, nome: "" }))
        : (await o.legado()).map((d) => ({ email: d.email, nome: d.nome_completo ?? "" }));

    const vistos = new Set<string>();
    const unicos = alvos.filter((a) => {
      const k = a.email?.toLowerCase();
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

    if (unicos.length === 0) {
      const msg = `[${o.contexto}] Nenhum destinatário de e-mail resolvido (cobranca_id=${o.cobrancaId}) — envio pulado.`;
      if (o.semDestinatarioEsperado) console.log(msg);
      else console.error(msg);
      return { resultado: "sem_destinatario", destinatarios: 0, algumaFalha: false };
    }

    const resultados = await Promise.allSettled(
      unicos.map((a) => {
        const { subject, html } = o.montar(a.nome);
        return sendEmail({ to: a.email, subject, html, tipo: o.tipo });
      })
    );
    const ok = resultados.filter((r) => r.status === "fulfilled" && r.value.success).length;
    const algumaFalha = ok < resultados.length;
    if (algumaFalha) console.error(`[${o.contexto}] Falha ao enviar para 1+ destinatário(s) (cobranca_id=${o.cobrancaId}).`);
    return { resultado: ok > 0 ? "enviado" : "falhou", destinatarios: unicos.length, algumaFalha };
  } catch (err) {
    console.error(`[${o.contexto}] Erro ao avisar por e-mail (cobranca_id=${o.cobrancaId}):`, err);
    return { resultado: "falhou", destinatarios: 0, algumaFalha: true };
  }
}

export interface OpcoesSinoAtrasoCobranca {
  cobrancaId: string;
  // Os de sempre: diretoria/superuser e o revisor com acesso (a lista do canal entra por cima, uma linha por usuário).
  userIdsDeSempre: readonly string[];
  titulo: string;
  mensagem: string;
}

// Sino do atraso (cobranca_rs_atrasada). Sem linha de canal ou erro de leitura = ligado; só ativo = false desliga tudo.
// Nunca lança.
export function avisarCobrancaRSSinoAtraso(svc: ServiceClient, o: OpcoesSinoAtrasoCobranca): Promise<ResultadoCanalAviso> {
  return gravarSinoConfiguravel(svc, {
    evento: EVENTO_COBRANCA_RS_ATRASADA,
    deSempre: o.userIdsDeSempre,
    linha: { tipo: TIPO_COBRANCA_ATRASADA, titulo: o.titulo, mensagem: o.mensagem, extra: { cobranca_rs_id: o.cobrancaId } },
    geral: "nunca",
  });
}
