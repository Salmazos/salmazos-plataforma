import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { ETAPAS_KANBAN } from "@/lib/constants";

interface DuplicadoEncontrado {
  candidato_id: string;
  candidato_nome: string;
  etapa_kanban: string;
  criterio: string;
  vaga_titulo?: string;
  cliente_nome?: string;
}

// Busca de candidatos duplicados por telefone ao revisar uma indicação direta.
// Retorna apenas a correspondência EXATA (normalizada: somente dígitos).
// Rota restrita a usuários internos (analista, supervisor, dp, diretoria, superuser).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const indicacaoId = request.nextUrl.searchParams.get("indicacao_id");
  if (!indicacaoId) {
    return NextResponse.json({ error: "indicacao_id é obrigatório." }, { status: 400 });
  }

  const service = createServiceClient();

  // Buscar a indicação pendente
  const { data: sol, error: solErr } = await service
    .from("solicitacoes_indicacao_candidato")
    .select("candidato_telefone, unidade_id")
    .eq("id", indicacaoId)
    .maybeSingle();

  if (solErr) {
    console.error("[buscar-duplicados] Erro ao buscar indicação:", solErr);
    return NextResponse.json({ error: "Erro ao buscar indicação." }, { status: 500 });
  }

  if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) {
    return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
  }

  const duplicados: DuplicadoEncontrado[] = [];

  // Buscar por telefone normalizado (somente dígitos, ignorar vazio)
  if (sol.candidato_telefone && sol.candidato_telefone.trim()) {
    const telefoneSoDigitos = sol.candidato_telefone.replace(/\D/g, "");
    // Exigir mínimo 10 dígitos (9 é CPF digitado errado)
    if (telefoneSoDigitos && telefoneSoDigitos.length >= 10) {
      // Candidatos.telefone está sempre com máscara — montar variantes de busca
      const variantes: string[] = [];
      if (telefoneSoDigitos.length === 10) {
        // (DD) NNNN-NNNN ou (DD) NNNNN-NNN (ambas possíveis)
        variantes.push(`(${telefoneSoDigitos.slice(0, 2)}) ${telefoneSoDigitos.slice(2, 6)}-${telefoneSoDigitos.slice(6)}`);
        variantes.push(`(${telefoneSoDigitos.slice(0, 2)}) ${telefoneSoDigitos.slice(2, 7)}-${telefoneSoDigitos.slice(7)}`);
      } else if (telefoneSoDigitos.length === 11) {
        // (DD) NNNNN-NNNN
        variantes.push(`(${telefoneSoDigitos.slice(0, 2)}) ${telefoneSoDigitos.slice(2, 7)}-${telefoneSoDigitos.slice(7)}`);
      }
      // Buscar até 10 candidatos com qualquer uma das variantes
      const { data: porTelefone, error: telErr } = await service
        .from("candidatos")
        .select("id, nome_completo, etapa_kanban, telefone")
        .in("telefone", variantes)
        .limit(10);

      if (telErr) {
        console.error("[buscar-duplicados] Erro ao buscar por telefone:", telErr);
        return NextResponse.json({ error: "Erro ao buscar candidatos." }, { status: 500 });
      }

      // Para cada candidato encontrado, buscar vaga/cliente mais recentes
      if (porTelefone && porTelefone.length > 0) {
        for (const cand of porTelefone) {
          const { data: ultimaCandidatura, error: cvErr } = await service
            .from("candidatos_vagas")
            .select("vagas!candidatos_vagas_vaga_id_fkey(titulo, cliente_id)")
            .eq("candidato_id", cand.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (cvErr) {
            console.error("[buscar-duplicados] Erro ao buscar candidatura:", cvErr);
          }

          let clienteNome: string | undefined;
          if ((ultimaCandidatura?.vagas as any)?.cliente_id) {
            const { data: cliente, error: clienteErr } = await service
              .from("clientes")
              .select("nome_fantasia")
              .eq("id", (ultimaCandidatura?.vagas as any)?.cliente_id)
              .maybeSingle();

            if (clienteErr) {
              console.error("[buscar-duplicados] Erro ao buscar cliente:", clienteErr);
            }
            clienteNome = cliente?.nome_fantasia;
          }

          // Mapear etapa_kanban para rótulo legível usando ETAPAS_KANBAN
          const etapaLabel = ETAPAS_KANBAN.find((e) => e.id === cand.etapa_kanban)?.label ?? cand.etapa_kanban;

          duplicados.push({
            candidato_id: cand.id,
            candidato_nome: cand.nome_completo,
            etapa_kanban: etapaLabel,
            criterio: "Telefone",
            vaga_titulo: (ultimaCandidatura?.vagas as any)?.titulo,
            cliente_nome: clienteNome,
          });
        }
      }
    }
  }

  return NextResponse.json({ duplicados });
}
