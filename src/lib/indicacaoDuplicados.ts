import { ETAPAS_KANBAN } from "@/lib/constants";
import type { createServiceClient } from "@/lib/supabase/server";

export interface DuplicadoEncontrado {
  candidato_id: string;
  candidato_nome: string;
  etapa_kanban: string;
  criterio: string;
  vaga_titulo?: string;
  cliente_nome?: string;
}

type Service = ReturnType<typeof createServiceClient>;

// candidatos.telefone é sempre gravado com máscara; a indicação do cliente pode vir sem. Exige 10+ dígitos
// (menos que isso é número digitado errado e geraria falso positivo).
export function variantesTelefone(telefone: string | null | undefined): string[] {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10) {
    return [`(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`, `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`];
  }
  if (d.length === 11) return [`(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`];
  return [];
}

// A indicação do cliente só carrega nome e telefone (sem CPF nem e-mail), então telefone é o único critério
// possível aqui. Devolve `erro: true` em falha de consulta para o chamador falhar fechado em vez de assumir "sem duplicado".
export async function buscarDuplicadosPorTelefone(
  service: Service,
  telefone: string | null | undefined
): Promise<{ duplicados: DuplicadoEncontrado[]; erro: boolean }> {
  const variantes = variantesTelefone(telefone);
  if (variantes.length === 0) return { duplicados: [], erro: false };

  const { data: porTelefone, error } = await service
    .from("candidatos")
    .select("id, nome_completo, etapa_kanban, telefone")
    .in("telefone", variantes)
    .limit(10);
  if (error) {
    console.error("[indicacaoDuplicados] Erro ao buscar por telefone:", error);
    return { duplicados: [], erro: true };
  }

  const duplicados: DuplicadoEncontrado[] = [];
  for (const cand of porTelefone ?? []) {
    const { data: ultima, error: cvErr } = await service
      .from("candidatos_vagas")
      .select("vagas!candidatos_vagas_vaga_id_fkey(titulo, cliente_id)")
      .eq("candidato_id", cand.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cvErr) console.error("[indicacaoDuplicados] Erro ao buscar candidatura:", cvErr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaga = (ultima as any)?.vagas as { titulo?: string; cliente_id?: string } | null | undefined;
    let clienteNome: string | undefined;
    if (vaga?.cliente_id) {
      const { data: cliente, error: clienteErr } = await service
        .from("clientes")
        .select("nome_fantasia")
        .eq("id", vaga.cliente_id)
        .maybeSingle();
      if (clienteErr) console.error("[indicacaoDuplicados] Erro ao buscar cliente:", clienteErr);
      clienteNome = cliente?.nome_fantasia;
    }

    duplicados.push({
      candidato_id: cand.id,
      candidato_nome: cand.nome_completo,
      etapa_kanban: ETAPAS_KANBAN.find((e) => e.id === cand.etapa_kanban)?.label ?? cand.etapa_kanban,
      criterio: "Telefone",
      vaga_titulo: vaga?.titulo,
      cliente_nome: clienteNome,
    });
  }
  return { duplicados, erro: false };
}

export type ResultadoDuplicidade = { ok: true } | { ok: false; status: number; error: string; codigo: string };

// Regra de negócio: nunca decidir no escuro. Match só por telefone não vincula sozinho — a analista precisa
// escolher explicitamente "vincular a este" (candidato_existente_id) ou "criar novo" com confirmação de risco.
export function avaliarDuplicidade(o: {
  duplicados: DuplicadoEncontrado[];
  candidatoExistenteId?: string;
  confirmarCriarNovo?: boolean;
}): ResultadoDuplicidade {
  if (o.candidatoExistenteId && o.confirmarCriarNovo) {
    return { ok: false, status: 400, codigo: "escolha_conflitante", error: "Escolha vincular a um candidato existente OU criar novo, não os dois." };
  }
  if (o.candidatoExistenteId || o.duplicados.length === 0 || o.confirmarCriarNovo) return { ok: true };
  return {
    ok: false,
    status: 409,
    codigo: "duplicado_exige_decisao",
    error: "Já existe candidato com este telefone. Escolha vincular a um candidato existente ou confirme explicitamente a criação de um novo.",
  };
}
