import { createClient, createServiceClient } from "@/lib/supabase/server";
import BancoCandidatosClient from "@/components/BancoCandidatosClient";
import type { CandidatoRow } from "@/components/BancoCandidatosClient";

export const dynamic = "force-dynamic";

export default async function BancoCandidatosPage() {
  const supabase = createServiceClient();
  const authClient = await createClient();

  const [{ data }, { data: { user } }] = await Promise.all([
    supabase
      .from("candidatos")
      .select("id, nome_completo, cpf, idade, cargo_pretendido, cidade, origem, triagem_score, triagem_label, triagem_resumo, melhor_match_score, melhor_match_vaga_titulo, juridico_tem_trabalhista, juridico_total_processos, juridico_consultado_em, escavador_status, bloqueado, created_at, status_alocacao, alocacao_cliente_nome, alocacao_vaga_titulo, alocacao_data_inicio, alocacao_data_fim, alocacao_tipo_servico, resumo_profissional, resumo_candidato, experiencias_profissionais, habilidades, formacao_academica, vagas_interesse, reprovado_internamente")
      .order("created_at", { ascending: false }),
    authClient.auth.getUser(),
  ]);

  const [analistaPerfil, ativosResult] = await Promise.all([
    user
      ? supabase.from("analistas_perfil").select("nome_completo").eq("user_id", user.id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("candidatos_vagas")
      .select("candidato_id")
      .in("etapa", ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"]),
  ]);

  const analistaNome = analistaPerfil.data?.nome_completo ?? "";
  const idsEmProcesso = [...new Set((ativosResult.data ?? []).map((r: { candidato_id: string }) => r.candidato_id))];

  return <BancoCandidatosClient candidatos={(data ?? []) as CandidatoRow[]} analista={analistaNome} idsEmProcesso={idsEmProcesso} />;
}
