import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CandidatoPerfilTabs from "@/components/CandidatoPerfilTabs";
import type { Candidato } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidatoPerfilPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";

  const { data } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();

  const candidato = data as Candidato;

  // Fetch candidatos_vagas with guarantee OR fee data
  const { data: cvRows } = await supabase
    .from("candidatos_vagas")
    .select("id, vaga_id, etapa, garantia_data_fim, garantia_acionada, garantia_acionada_em, admissao_fee_percentual, admissao_fee_valor, admissao_fee_prazo, fee_status, vagas(titulo)")
    .eq("candidato_id", id)
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const garantiaRow = (cvRows ?? []).find((r: any) => r.garantia_data_fim != null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? (cvRows ?? []).find((r: any) => r.admissao_fee_percentual != null)
    ?? null;

  // Best retention score from candidatos_vagas
  const { data: retencaoRow } = await supabase
    .from("candidatos_vagas")
    .select("retencao_score, retencao_label, retencao_resumo")
    .eq("candidato_id", id)
    .not("retencao_score", "is", null)
    .order("retencao_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  const melhorRetencao = retencaoRow
    ? {
        score: retencaoRow.retencao_score as number,
        label: retencaoRow.retencao_label as string,
        resumo: (retencaoRow.retencao_resumo ?? null) as string | null,
      }
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const garantiaInfo = garantiaRow ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = garantiaRow as any;
    return {
      cv_id: r.id as string,
      vaga_id: r.vaga_id as string,
      etapa: r.etapa as string,
      garantia_data_fim: (r.garantia_data_fim ?? "") as string,
      garantia_acionada: (r.garantia_acionada ?? false) as boolean,
      garantia_acionada_em: (r.garantia_acionada_em ?? null) as string | null,
      vaga_titulo: (r.vagas?.titulo ?? null) as string | null,
      admissao_fee_percentual: (r.admissao_fee_percentual ?? null) as number | null,
      admissao_fee_valor: (r.admissao_fee_valor ?? null) as number | null,
      admissao_fee_prazo: (r.admissao_fee_prazo ?? null) as string | null,
      fee_status: (r.fee_status ?? null) as string | null,
    };
  })() : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/painel" className="hover:text-[#FFB800] transition-colors">
          ← Voltar ao painel
        </Link>
      </div>

      <CandidatoPerfilTabs candidato={candidato} garantiaInfo={garantiaInfo} melhorRetencao={melhorRetencao} role={role} />
    </div>
  );
}
