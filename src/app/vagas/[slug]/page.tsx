import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { TIPOS_SERVICO } from "@/lib/constants";
import FormCandidaturaVagaPublica from "@/components/FormCandidaturaVagaPublica";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

const TIPO_CORES: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000" },
  terceirizacao:         { bg: "#1D9E75", color: "#fff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#fff" },
};

function formatarSalario(valor: string | number | null | undefined): string {
  if (!valor) return "A combinar";
  const num = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (isNaN(num)) return "A combinar";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">{value}</dd>
    </div>
  );
}

export default async function VagaPublicaPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createServiceClient();

  // Try by slug first, then fall back to id
  let { data: vaga } = await supabase
    .from("vagas")
    .select("id, titulo, cidade, estado, salario, tipo_servico, requisitos, beneficios, horario, observacoes, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!vaga) {
    const { data: vagaById } = await supabase
      .from("vagas")
      .select("id, titulo, cidade, estado, salario, tipo_servico, requisitos, beneficios, horario, observacoes, status")
      .eq("id", slug)
      .maybeSingle();
    vaga = vagaById;
  }

  if (!vaga) notFound();

  const tipo = TIPOS_SERVICO.find((t) => t.id === vaga!.tipo_servico);
  const cor = vaga.tipo_servico ? TIPO_CORES[vaga.tipo_servico] : null;
  const encerrada = vaga.status === "fechada" || vaga.status === "cancelada";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" className="h-12 w-auto object-contain" />
          <Link href="/vagas" className="text-white/60 hover:text-white text-sm transition-colors">
            ← Todas as vagas
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 pb-16">

        {/* Job info card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex-1">
              {cor && tipo && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full mb-3 inline-block"
                  style={{ backgroundColor: cor.bg, color: cor.color }}
                >
                  {tipo.label}
                </span>
              )}
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{vaga.titulo}</h1>
            </div>
            {encerrada && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                Vaga encerrada
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-t pt-4">
            {(vaga.cidade || vaga.estado) && (
              <InfoItem label="Local" value={[vaga.cidade, vaga.estado].filter(Boolean).join(" / ")} />
            )}
            <InfoItem label="Salário" value={formatarSalario(vaga.salario)} />
            {vaga.horario && <InfoItem label="Horário" value={vaga.horario} />}
          </dl>

          {vaga.requisitos && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Requisitos</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{vaga.requisitos}</p>
            </div>
          )}

          {vaga.beneficios && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Benefícios</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{vaga.beneficios}</p>
            </div>
          )}
        </div>

        {encerrada ? (
          <div className="bg-gray-100 rounded-2xl p-8 text-center">
            <p className="text-gray-500 font-medium">Esta vaga não está mais recebendo candidaturas.</p>
            <Link href="/vagas" className="mt-3 inline-block text-sm font-semibold" style={{ color: "#FFD700" }}>
              Ver outras vagas →
            </Link>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">Formulário de Candidatura</h2>
              <p className="text-gray-500 text-sm mt-1">
                Preencha os campos abaixo para concluir sua candidatura à vaga de{" "}
                <strong>{vaga.titulo}</strong>.
                Os campos marcados com <span className="text-red-500">*</span> são obrigatórios.
              </p>
            </div>
            <FormCandidaturaVagaPublica vagaId={vaga.id} vagaTitulo={vaga.titulo} />
          </div>
        )}
      </main>

      <footer className="text-center py-8 text-gray-400 text-xs">
        © {new Date().getFullYear()} Salmazos RH & Serviços
      </footer>
    </div>
  );
}
