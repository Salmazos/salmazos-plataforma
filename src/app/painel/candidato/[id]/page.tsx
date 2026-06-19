import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import CandidatoPerfilTabs from "@/components/CandidatoPerfilTabs";
import type { Candidato } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidatoPerfilPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();

  const candidato = data as Candidato;

  const { data: garantiaRow } = await supabase
    .from("candidatos_vagas")
    .select("id, vaga_id, etapa, garantia_data_fim, garantia_acionada, garantia_acionada_em, admissao_fee_percentual, admissao_fee_valor, admissao_fee_prazo, fee_status, vagas(titulo)")
    .eq("candidato_id", id)
    .not("garantia_data_fim", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const garantiaInfo = garantiaRow ? {
    cv_id: garantiaRow.id as string,
    vaga_id: garantiaRow.vaga_id as string,
    etapa: garantiaRow.etapa as string,
    garantia_data_fim: garantiaRow.garantia_data_fim as string,
    garantia_acionada: (garantiaRow.garantia_acionada ?? false) as boolean,
    garantia_acionada_em: (garantiaRow.garantia_acionada_em ?? null) as string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vaga_titulo: ((garantiaRow as any).vagas?.titulo ?? null) as string | null,
  } : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/painel" className="hover:text-[#FFB800] transition-colors">
          ← Voltar ao painel
        </Link>
      </div>

      <CandidatoPerfilTabs candidato={candidato} garantiaInfo={garantiaInfo} />
    </div>
  );
}
