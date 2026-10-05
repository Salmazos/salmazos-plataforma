import { createServiceClient } from "@/lib/supabase/server";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { enviarEmailParaLista, gravarSinoConfiguravel, resolverEmailConfiguravel } from "@/lib/avisoConfiguravel";
import type { ResultadoCanalAviso } from "@/lib/avisosRestantesRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

// E-mail de aniversário (Configurações > Avisos): desligado = ninguém; com lista no canal = só a lista; sem lista (ou sem
// conseguir ler) = o de sempre (todos os analistas da unidade e os sócios, via notifyAllAnalysts). NUNCA lança.
export async function enviarEmailAniversario(
  svc: ServiceClient,
  o: { evento: string; tipo: string; subject: string; html: string; unidadeId: string; contexto: string }
): Promise<ResultadoCanalAviso> {
  try {
    const destino = await resolverEmailConfiguravel(svc, o.evento, o.unidadeId);
    if (destino.modo === "desligado") return "desligado";
    if (destino.modo === "lista") return await enviarEmailParaLista(destino.emails, { subject: o.subject, html: o.html, tipo: o.tipo }, o.contexto);
    const r = await notifyAllAnalysts({ subject: o.subject, html: o.html, tipo: o.tipo, unidadeId: o.unidadeId });
    return r.succeeded > 0 ? "enviado" : r.attempted === 0 ? "sem_destinatario" : "falhou";
  } catch (err) {
    console.error(`[${o.contexto}] Falha no e-mail de aniversário:`, err);
    return "falhou";
  }
}

// Aniversário individual (faltam 3 dias / no dia): sino e e-mail, cada um isolado. O sino é a linha geral da unidade do
// contato (como sempre, user_id nulo) MAIS a lista do canal. Nunca lança; quem chama decide o carimbo pelo resultado.
export async function avisarAniversarioIndividual(
  svc: ServiceClient,
  o: {
    evento: string;
    tipo: string;
    unidadeId: string;
    titulo: string;
    mensagem: string;
    assunto: string;
    html: string;
    contexto: string;
  }
): Promise<{ sino: ResultadoCanalAviso; email: ResultadoCanalAviso }> {
  const [sino, email] = await Promise.all([
    gravarSinoConfiguravel(svc, {
      evento: o.evento,
      deSempre: [],
      linha: { tipo: o.tipo, titulo: o.titulo, mensagem: o.mensagem, unidade_id: o.unidadeId },
      geral: "sempre",
      unidadeFiltro: o.unidadeId,
    }),
    enviarEmailAniversario(svc, { evento: o.evento, tipo: o.tipo, subject: o.assunto, html: o.html, unidadeId: o.unidadeId, contexto: o.contexto }),
  ]);
  return { sino, email };
}
