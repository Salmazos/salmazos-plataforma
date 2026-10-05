import { createServiceClient } from "@/lib/supabase/server";
import { canaisClienteLigados, criarAvisoCliente } from "@/lib/avisoCliente";
import { chaveDedupAviso, textoAvisoEntrevista } from "@/lib/avisoClienteRegras";
import { decidirAvisoEntrevista } from "@/lib/horaEntrevista";
import type { LeituraEncaminhamentoAnterior } from "@/lib/avisoClienteCandidato";

type ServiceClient = ReturnType<typeof createServiceClient>;

export const EVENTO_ENTREVISTA_AGENDADA = "entrevista_agendada_cliente";
export const EVENTO_ENTREVISTA_REMARCADA = "entrevista_remarcada_cliente";

// Estado do encaminhamento ANTES de PATCH /api/encaminhamentos/[id] gravar. Nunca lança; ok:false = não
// deu para ler (na dúvida, não avisa).
export async function lerEncaminhamentoPorId(svc: ServiceClient, id: string): Promise<LeituraEncaminhamentoAnterior> {
  try {
    const { data, error } = await svc
      .from("encaminhamentos")
      .select("status, avaliado_em, updated_at, data_entrevista")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[avisoClienteEntrevista] Erro ao ler o encaminhamento anterior:", error.message);
      return { ok: false, anterior: null };
    }
    return { ok: true, anterior: (data as LeituraEncaminhamentoAnterior["anterior"]) ?? null };
  } catch (err) {
    console.error("[avisoClienteEntrevista] Erro inesperado ao ler o encaminhamento anterior:", err);
    return { ok: false, anterior: null };
  }
}

// Aviso "Entrevista agendada" / "Entrevista remarcada" no portal (sino e popup, conforme Configurações >
// Avisos). Chamada extra, só depois de a data já estar gravada. NUNCA lança: as consultas de nome e vaga
// também ficam dentro do try/catch. Texto só com nome do candidato, título da vaga e datas. Quem define a
// data é a Salmazos; quando o próprio cliente agenda pelo portal (api/portal/agendar) não há aviso.
// Link: a Agenda do portal, onde o cliente vê a data (ela só lista encaminhamento "aguardando"); no caso
// raro de a data ser definida com o encaminhamento ainda "aguardando_agendamento_cliente", o perfil do
// candidato, para o clique nunca cair numa tela sem o item.
export async function avisarEntrevistaAoCliente(
  svc: ServiceClient,
  encaminhamento: {
    id: string;
    cliente_id: string | null;
    candidato_id: string | null;
    vaga_id: string | null;
    status: string | null;
    data_entrevista: string | null;
  },
  leitura: LeituraEncaminhamentoAnterior
): Promise<boolean> {
  try {
    if (!leitura.ok || !encaminhamento.cliente_id) return false;

    const decisao = decidirAvisoEntrevista(leitura.anterior, encaminhamento);
    if (!decisao.tipo) return false;

    const evento = decisao.tipo === "agendada" ? EVENTO_ENTREVISTA_AGENDADA : EVENTO_ENTREVISTA_REMARCADA;
    // Canais desligados: nem busca nome e vaga.
    const canais = await canaisClienteLigados(evento, svc);
    if (!canais.sino && !canais.popup) return false;

    const [candidato, vaga] = await Promise.all([
      encaminhamento.candidato_id
        ? svc.from("candidatos").select("nome_completo").eq("id", encaminhamento.candidato_id).maybeSingle()
        : Promise.resolve({ data: null }),
      encaminhamento.vaga_id
        ? svc.from("vagas").select("titulo").eq("id", encaminhamento.vaga_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return await criarAvisoCliente(
      evento,
      encaminhamento.cliente_id,
      () => ({
        ...textoAvisoEntrevista({
          tipo: decisao.tipo as "agendada" | "remarcada",
          candidato: (candidato.data as { nome_completo?: string | null } | null)?.nome_completo,
          vagaTitulo: (vaga.data as { titulo?: string | null } | null)?.titulo,
          antes: decisao.antes,
          depois: decisao.depois,
        }),
        link: encaminhamento.status === "aguardando" ? "/portal/agenda" : `/portal/candidato/${encaminhamento.id}`,
        referencia_tipo: "encaminhamento",
        referencia_id: encaminhamento.id,
        chaveDedup: chaveDedupAviso(evento, encaminhamento.id, decisao.versao),
      }),
      svc
    );
  } catch (err) {
    console.error("[avisoClienteEntrevista] Erro inesperado ao avisar o cliente:", err);
    return false;
  }
}
