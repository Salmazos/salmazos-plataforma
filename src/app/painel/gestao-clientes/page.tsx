import { createClient, createServiceClient } from "@/lib/supabase/server";
import GestaoClientesClient from "@/components/GestaoClientesClient";
import { ETAPAS_KANBAN_VISIVEIS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export interface CandidatoAtivo {
  cv_id: string;
  candidato_id: string;
  nome_completo: string;
  responsavel: string | null;
  etapa: string;
  updated_at: string;
}

export interface ClienteComAtividade {
  id: string;
  nome: string;
  atencao_especial: boolean;
  atencao_especial_nota: string | null;
  atencao_especial_marcado_em: string | null;
  atencao_especial_marcado_por_nome: string | null;
  candidatos: CandidatoAtivo[];
}

export default async function GestaoClientesPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";

  const svc = createServiceClient();

  const [{ data: candidatosVagas }, { data: clientes }, { data: analistas }] = await Promise.all([
    svc
      .from("candidatos_vagas")
      .select("id, etapa, cliente_id, updated_at, candidatos(id, nome_completo, responsavel)")
      .not("cliente_id", "is", null)
      .in("etapa", ETAPAS_KANBAN_VISIVEIS),
    svc
      .from("clientes")
      .select("id, nome, atencao_especial, atencao_especial_nota, atencao_especial_marcado_em, atencao_especial_marcado_por")
      .order("nome"),
    svc.from("analistas_perfil").select("user_id, nome_completo"),
  ]);

  const analistaNomeMap = new Map((analistas ?? []).map((a) => [a.user_id as string, a.nome_completo as string]));

  const candidatosPorCliente = new Map<string, CandidatoAtivo[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const cv of (candidatosVagas ?? []) as any[]) {
    if (!cv.cliente_id || !cv.candidatos) continue;
    const lista = candidatosPorCliente.get(cv.cliente_id) ?? [];
    lista.push({
      cv_id: cv.id,
      candidato_id: cv.candidatos.id,
      nome_completo: cv.candidatos.nome_completo,
      responsavel: cv.candidatos.responsavel ?? null,
      etapa: cv.etapa,
      updated_at: cv.updated_at,
    });
    candidatosPorCliente.set(cv.cliente_id, lista);
  }

  const clientesComAtividade: ClienteComAtividade[] = (clientes ?? [])
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      atencao_especial: c.atencao_especial,
      atencao_especial_nota: c.atencao_especial_nota,
      atencao_especial_marcado_em: c.atencao_especial_marcado_em,
      atencao_especial_marcado_por_nome: c.atencao_especial_marcado_por
        ? analistaNomeMap.get(c.atencao_especial_marcado_por) ?? null
        : null,
      candidatos: candidatosPorCliente.get(c.id) ?? [],
    }))
    .filter((c) => c.atencao_especial || c.candidatos.length > 0);

  return <GestaoClientesClient clientes={clientesComAtividade} role={role} />;
}
