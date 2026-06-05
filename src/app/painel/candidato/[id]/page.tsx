import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import PerfilEdicao from "@/components/PerfilEdicao";
import EncaminhamentosSection from "@/components/EncaminhamentosSection";
import HistoricoCandidato from "@/components/HistoricoCandidato";
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/painel" className="hover:text-[#FFB800] transition-colors">
          ← Voltar ao painel
        </Link>
      </div>

      <PerfilEdicao candidato={candidato} />

      <div className="mt-6">
        <EncaminhamentosSection candidatoId={candidato.id} />
      </div>

      <div className="mt-6">
        <HistoricoCandidato candidatoId={candidato.id} />
      </div>
    </div>
  );
}
