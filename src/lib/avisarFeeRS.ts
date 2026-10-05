import { createServiceClient } from "@/lib/supabase/server";
import { gravarSinoConfiguravel, jaExisteAvisoRecente } from "@/lib/avisoConfiguravel";
import {
  EVENTO_FEE_RS_NAO_CONFIGURADO,
  TIPO_FEE_RS_NAO_CONFIGURADO,
  inicioJanelaSemRepetir,
  type ResultadoCanalAviso,
} from "@/lib/avisosRestantesRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Aviso interno "taxa de R&S não configurada" (vaga de R&S sem fee/taxa, na aprovação do cliente, na geração da cobrança de
// contratação e na de cancelamento). É só o AVISO: o cálculo do fee, a cobrança e a decisão do cliente não passam por aqui.
// Sino (Configurações > Avisos > fee_rs_nao_configurado): a linha geral de sempre (user_id nulo, da unidade) MAIS a lista do
// canal; sem linha de canal ou erro de leitura = ligado; ativo = false desliga tudo. `semRepetirHoras` evita repetir o
// mesmo aviso (mesmo tipo, vaga, candidato e título) por consulta, sem coluna nova. NUNCA lança.
export async function avisarFeeRSNaoConfigurado(
  svc: ServiceClient,
  o: {
    titulo: string;
    mensagem: string;
    candidatoId?: string | null;
    vagaId?: string | null;
    unidadeId?: string | null;
    semRepetirHoras?: number;
  }
): Promise<ResultadoCanalAviso> {
  try {
    if (o.semRepetirHoras) {
      const repetido = await jaExisteAvisoRecente(svc, {
        tipo: TIPO_FEE_RS_NAO_CONFIGURADO,
        candidatoId: o.candidatoId ?? null,
        vagaId: o.vagaId ?? null,
        titulo: o.titulo,
        desde: inicioJanelaSemRepetir(new Date(), o.semRepetirHoras),
      });
      if (repetido) return "enviado";
    }
    return await gravarSinoConfiguravel(svc, {
      evento: EVENTO_FEE_RS_NAO_CONFIGURADO,
      deSempre: [],
      linha: {
        tipo: TIPO_FEE_RS_NAO_CONFIGURADO,
        titulo: o.titulo,
        mensagem: o.mensagem,
        candidato_id: o.candidatoId ?? null,
        vaga_id: o.vagaId ?? null,
        unidade_id: o.unidadeId ?? null,
      },
      geral: "sempre",
    });
  } catch (err) {
    console.error("[avisarFeeRSNaoConfigurado] Falha:", err);
    return "falhou";
  }
}
