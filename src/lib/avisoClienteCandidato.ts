import { createServiceClient } from "@/lib/supabase/server";
import { canaisClienteLigados, criarAvisoCliente } from "@/lib/avisoCliente";
import { chaveDedupAviso, decidirAvisoCandidatoEnviado, textoAvisoCandidatoEnviado } from "@/lib/avisoClienteRegras";
import { dataEntrevistaParaCliente } from "@/lib/horaEntrevista";

type ServiceClient = ReturnType<typeof createServiceClient>;

export const EVENTO_CANDIDATO_ENVIADO_CLIENTE = "candidato_enviado_cliente";

export interface EncaminhamentoAnterior {
  status: string | null;
  avaliado_em: string | null;
  updated_at: string | null;
}

export interface LeituraEncaminhamentoAnterior {
  // false = não deu para ler o estado anterior: na dúvida, não avisa.
  ok: boolean;
  anterior: EncaminhamentoAnterior | null;
}

// Estado do encaminhamento (mesmo candidato, cliente e vaga) ANTES de POST /api/encaminhamentos gravar.
// Sem vaga a rota sempre insere uma linha nova, então não há "anterior". Nunca lança.
export async function lerEncaminhamentoAnterior(
  svc: ServiceClient,
  o: { candidatoId: string; clienteId: string; vagaId: string | null | undefined }
): Promise<LeituraEncaminhamentoAnterior> {
  try {
    if (!o.vagaId) return { ok: true, anterior: null };
    const { data, error } = await svc
      .from("encaminhamentos")
      .select("status, avaliado_em, updated_at")
      .eq("candidato_id", o.candidatoId)
      .eq("cliente_id", o.clienteId)
      .eq("vaga_id", o.vagaId)
      .maybeSingle();
    if (error) {
      console.error("[avisoClienteCandidato] Erro ao ler o encaminhamento anterior:", error.message);
      return { ok: false, anterior: null };
    }
    return { ok: true, anterior: (data as EncaminhamentoAnterior | null) ?? null };
  } catch (err) {
    console.error("[avisoClienteCandidato] Erro inesperado ao ler o encaminhamento anterior:", err);
    return { ok: false, anterior: null };
  }
}

// Aviso "Candidato enviado ao cliente" no portal (sino e popup, conforme Configurações > Avisos). Chamada
// extra, no fim de POST /api/encaminhamentos, depois do sucesso. NUNCA lança: as consultas de nome e vaga
// também ficam dentro do try/catch. O texto leva só nome do candidato, título da vaga e data/hora da
// entrevista (o que o cliente já vê no portal). O link é o perfil do candidato no portal, que usa o id
// do encaminhamento (o mesmo do botão "Ver perfil" da página inicial do portal).
export async function avisarCandidatoEnviadoAoCliente(
  svc: ServiceClient,
  encaminhamento: {
    id: string;
    cliente_id: string | null;
    candidato_id: string | null;
    vaga_id: string | null;
    data_entrevista: string | null;
  },
  leitura: LeituraEncaminhamentoAnterior
): Promise<boolean> {
  try {
    if (!leitura.ok || !encaminhamento.cliente_id) return false;

    const decisao = decidirAvisoCandidatoEnviado(leitura.anterior);
    if (!decisao.avisar) return false;

    // Canais desligados: nem busca nome e vaga.
    const canais = await canaisClienteLigados(EVENTO_CANDIDATO_ENVIADO_CLIENTE, svc);
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
      EVENTO_CANDIDATO_ENVIADO_CLIENTE,
      encaminhamento.cliente_id,
      () => ({
        ...textoAvisoCandidatoEnviado({
          candidato: (candidato.data as { nome_completo?: string | null } | null)?.nome_completo,
          vagaTitulo: (vaga.data as { titulo?: string | null } | null)?.titulo,
          entrevista: dataEntrevistaParaCliente(encaminhamento.data_entrevista),
        }),
        link: `/portal/candidato/${encaminhamento.id}`,
        referencia_tipo: "encaminhamento",
        referencia_id: encaminhamento.id,
        chaveDedup: chaveDedupAviso(EVENTO_CANDIDATO_ENVIADO_CLIENTE, encaminhamento.id, decisao.versao),
      }),
      svc
    );
  } catch (err) {
    console.error("[avisoClienteCandidato] Erro inesperado ao avisar o cliente:", err);
    return false;
  }
}
