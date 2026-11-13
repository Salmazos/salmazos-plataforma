import { createServiceClient } from "@/lib/supabase/server";
import { criarAvisoCliente } from "@/lib/avisoCliente";
import { chaveDedupAviso } from "@/lib/avisoClienteRegras";
import { formatarDataBR } from "@/lib/rescisaoProgramada";
import { ASO_DEMISSIONAL_PRAZO_DIAS, EVENTO_ASO_DEMISSIONAL_CLIENTE, diasDesdeDesligamento } from "@/lib/asoDemissionalRegras";

export * from "@/lib/asoDemissionalRegras";

// ASO DEMISSIONAL (rescisoes.aso_documento_path). Nada aqui toca em funcionario_asos / ASO periódico.
// ASO é dado de saúde: este módulo só lida com caminho, datas e ids — nunca com o conteúdo do arquivo.

type ServiceClient = ReturnType<typeof createServiceClient>;

// Chamado DEPOIS que o aso_documento_path foi gravado. Na 1ª anexação (aso_demissional_anexado_em ainda nulo)
// carimba quem/quando e avisa o cliente; troca de arquivo nunca avisa de novo. Nunca lança: a anexação já foi
// salva e falha aqui só vira log.
export async function registrarAnexoAsoDemissional(
  svc: ServiceClient,
  params: { rescisaoId: string; userId: string; dataExame?: string | null }
): Promise<{ primeiraVez: boolean }> {
  try {
    const agora = new Date().toISOString();
    // Carimbo condicional (is null): só uma requisição "ganha" a 1ª anexação, mesmo com duas juntas.
    const { data: carimbada } = await svc
      .from("rescisoes")
      .update({ aso_demissional_anexado_em: agora, aso_demissional_anexado_por: params.userId })
      .eq("id", params.rescisaoId)
      .is("aso_demissional_anexado_em", null)
      .select("id")
      .maybeSingle();

    if (!carimbada) return { primeiraVez: false };

    const { data: rescisao } = await svc
      .from("rescisoes")
      .select("id, funcionarios(nome_completo, cliente_id)")
      .eq("id", params.rescisaoId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const func = rescisao?.funcionarios as any;
    const avisou = await criarAvisoCliente(
      EVENTO_ASO_DEMISSIONAL_CLIENTE,
      func?.cliente_id,
      () => ({
        titulo: "ASO demissional anexado",
        mensagem: `O ASO demissional de ${func?.nome_completo?.trim() || "funcionário"} já está disponível na aba Rescindidos.`,
        link: "/portal/funcionarios",
        referencia_tipo: "rescisao",
        referencia_id: params.rescisaoId,
        chaveDedup: chaveDedupAviso(EVENTO_ASO_DEMISSIONAL_CLIENTE, params.rescisaoId, "1"),
      }),
      svc
    );
    // aviso_cliente_em marca só quando o aviso foi de fato gravado (canal desligado = não marca).
    if (avisou) {
      await svc.from("rescisoes").update({ aso_demissional_aviso_cliente_em: agora }).eq("id", params.rescisaoId);
    }
    return { primeiraVez: true };
  } catch (err) {
    console.error(`[asoDemissional] Falha ao registrar a 1ª anexação (rescisao_id=${params.rescisaoId}):`, err);
    return { primeiraVez: false };
  }
}

export interface RescisaoSemAso {
  id: string;
  data_desligamento: string;
  empresa: string;
  nome: string;
}

// Texto do aviso interno consolidado (1 por destinatário por dia — evita uma enxurrada quando várias rescisões
// ficam pendentes ao mesmo tempo). Só nomes e empresa; nada de saúde.
export function mensagemAsoPendente(lista: RescisaoSemAso[], hojeISO: string): { titulo: string; mensagem: string } {
  const ordenada = [...lista].sort((a, b) => a.data_desligamento.localeCompare(b.data_desligamento));
  const n = ordenada.length;
  const exemplos = ordenada
    .slice(0, 3)
    .map((r) => `${r.nome} (${r.empresa}, ${diasDesdeDesligamento(r.data_desligamento, hojeISO)} dias)`)
    .join("; ");
  const resto = n > 3 ? ` e mais ${n - 3}` : "";
  return {
    titulo: n === 1 ? "ASO demissional pendente" : `${n} ASOs demissionais pendentes`,
    mensagem: `${n === 1 ? "1 rescisão está" : `${n} rescisões estão`} sem ASO demissional há ${ASO_DEMISSIONAL_PRAZO_DIAS} dias ou mais, desde ${formatarDataBR(ordenada[0].data_desligamento)}: ${exemplos}${resto}.`,
  };
}
