import { createServiceClient } from "@/lib/supabase/server";
import { generateUniqueSlug } from "@/lib/slug";
import { sincronizarPosicoesAbertas } from "@/lib/vagaPosicoes";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Campo da solicitação → campo da vaga criada a partir dela (mesmo mapeamento de
// vagas/from-solicitacao). previsao_inicio não existe na vaga, então não propaga.
const CAMPO_NA_VAGA: Record<string, string> = {
  cargo: "titulo",
  tipo_servico: "tipo_servico",
  num_posicoes: "num_posicoes",
  cidade: "cidade",
  estado: "estado",
  salario: "salario",
  adicionais_salariais: "adicionais_salariais",
  horario_texto: "horario",
  requisitos: "requisitos",
  beneficios: "beneficios",
  observacoes: "observacoes",
  confidencial: "confidencial",
};

// Aplica na vaga só os campos que mudaram na solicitação (não sobrescreve o resto — a vaga
// pode ter sido ajustada direto na tela de Vagas depois de criada). Repete as regras do PATCH
// /api/vagas/[id]: título novo gera slug novo (link público), troca de modalidade grava o
// histórico, e mudança no nº de posições recalcula as posições abertas. Usado quando a
// Salmazos edita uma solicitação já aprovada e quando aprova um pedido de alteração do cliente.
export async function propagarAlteracoesSolicitacaoNaVaga(
  vagaId: string,
  alteracoesSolicitacao: Record<string, unknown>,
  alteradoPor: string,
  supabase?: ServiceClient
): Promise<{ camposVaga: string[] }> {
  const svc = supabase ?? createServiceClient();

  const campos: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(alteracoesSolicitacao)) {
    const campoVaga = CAMPO_NA_VAGA[campo];
    if (campoVaga) campos[campoVaga] = valor;
  }
  if (Object.keys(campos).length === 0) return { camposVaga: [] };

  if (typeof campos.titulo === "string") {
    campos.slug = await generateUniqueSlug(campos.titulo, svc, vagaId);
  }

  if (campos.tipo_servico !== undefined) {
    const { data: atual } = await svc
      .from("vagas")
      .select("tipo_servico, tipo_servico_original")
      .eq("id", vagaId)
      .single();
    if (atual && atual.tipo_servico !== campos.tipo_servico) {
      if (!atual.tipo_servico_original) campos.tipo_servico_original = atual.tipo_servico;
      campos.tipo_servico_alterado_em = new Date().toISOString();
      campos.tipo_servico_alterado_por = alteradoPor;
      campos.tipo_servico_motivo = "Alteração da solicitação de vaga do portal";
      await svc.from("vagas_historico_modalidade").insert({
        vaga_id: vagaId,
        tipo_anterior: atual.tipo_servico,
        tipo_novo: campos.tipo_servico,
        alterado_por: alteradoPor,
        motivo: "Alteração da solicitação de vaga do portal",
      });
    } else {
      delete campos.tipo_servico;
    }
  }

  const { error } = await svc.from("vagas").update(campos).eq("id", vagaId);
  if (error) throw new Error(`Erro ao atualizar a vaga ${vagaId}: ${error.message}`);

  if (campos.num_posicoes !== undefined) await sincronizarPosicoesAbertas(vagaId, svc);

  return { camposVaga: Object.keys(campos) };
}
