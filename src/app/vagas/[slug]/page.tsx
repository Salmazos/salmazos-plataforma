import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import BotaoVoltarSite from "@/components/BotaoVoltarSite";
import CurriculoMotivacional from "@/components/CurriculoMotivacional";
import FormCandidaturaVagaPublica from "@/components/FormCandidaturaVagaPublica";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

function formatarSalario(valor: string | number | null | undefined): string {
  if (!valor) return "A combinar";
  if (typeof valor === "string") {
    const trimmed = valor.trim();
    if (trimmed.startsWith("R$")) return trimmed;
    if (trimmed.toLowerCase() === "a combinar") return "A combinar";
    const num = parseFloat(trimmed.replace(",", "."));
    if (isNaN(num)) return trimmed;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function InfoItem({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div>
      <dt style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
        {label}
      </dt>
      <dd style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>{value}</dd>
      {sub && (
        <dd style={{ fontSize: "12px", fontWeight: 400, color: "#6b7280", marginTop: "2px" }}>{sub}</dd>
      )}
    </div>
  );
}

export default async function VagaPublicaPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createServiceClient();

  let { data: vaga } = await supabase
    .from("vagas")
    .select("id, titulo, cidade, estado, salario, adicionais_salariais, requisitos, beneficios, horario, observacoes, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!vaga) {
    const { data: vagaById } = await supabase
      .from("vagas")
      .select("id, titulo, cidade, estado, salario, adicionais_salariais, requisitos, beneficios, horario, observacoes, status, slug")
      .eq("id", slug)
      .maybeSingle();
    if (vagaById?.slug) {
      redirect(`/vagas/${vagaById.slug}`);
    }
    vaga = vagaById;
  }

  if (!vaga) notFound();

  const encerrada = vaga.status === "fechada" || vaga.status === "cancelada";
  const pausada = vaga.status === "pausada";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000" }}>
      {/* Header */}
      <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" className="h-12 w-auto object-contain" />
          <div className="flex items-center gap-4">
            <Link href="/vagas" style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}
              className="hover:text-white transition-colors">
              ← Todas as vagas
            </Link>
            <BotaoVoltarSite />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 pb-16">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_420px] gap-8 items-start">
      <div className="max-w-3xl">

        {/* Job info card */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", overflow: "hidden", marginBottom: "24px" }}>
          {/* Cabeçalho padronizado — modalidade de contratação (R&S/MOT/Terceirização) não
              aparece pro candidato aqui de propósito: essa informação fica reservada pro
              contato posterior da Salmazos com ele, não pra esta tela pública. */}
          <div style={{ backgroundColor: "#000", padding: "22px 24px", textAlign: "center" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#FFD700", margin: 0 }}>
              {vaga.titulo}
            </h1>
          </div>

          <div style={{ padding: "24px" }}>
            {encerrada && (
              <div style={{ textAlign: "right", marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "9999px", backgroundColor: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                  Vaga encerrada
                </span>
              </div>
            )}
            {pausada && (
              <div style={{ textAlign: "right", marginBottom: "16px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "9999px", backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>
                  Vaga pausada
                </span>
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(vaga.cidade || vaga.estado) && (
                <InfoItem label="Local" value={[vaga.cidade, vaga.estado].filter(Boolean).join(" / ")} />
              )}
              <InfoItem label="Salário" value={formatarSalario(vaga.salario)} sub={vaga.adicionais_salariais} />
              {vaga.horario && <InfoItem label="Horário" value={vaga.horario} />}
            </div>

            {vaga.requisitos && (
              <div style={{ marginTop: "16px", borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                  Requisitos
                </p>
                <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                  {vaga.requisitos}
                </p>
              </div>
            )}

            {vaga.beneficios && (
              <div style={{ marginTop: "16px", borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                  Benefícios
                </p>
                <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                  {vaga.beneficios}
                </p>
              </div>
            )}
          </div>
        </div>

        {pausada ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#6b7280", fontWeight: 500 }}>Esta vaga está temporariamente pausada.</p>
            <Link href="/vagas" style={{ display: "inline-block", marginTop: "12px", fontSize: "14px", fontWeight: 600, color: "#FFD700" }}>
              Ver outras vagas →
            </Link>
          </div>
        ) : encerrada ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#6b7280", fontWeight: 500 }}>Esta vaga não está mais recebendo candidaturas.</p>
            <Link href="/vagas" style={{ display: "inline-block", marginTop: "12px", fontSize: "14px", fontWeight: 600, color: "#FFD700" }}>
              Ver outras vagas →
            </Link>
          </div>
        ) : (
          <div>
            <FormCandidaturaVagaPublica vagaId={vaga.id} vagaTitulo={vaga.titulo} />
            <p style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "#9ca3af" }}>
              Prefere se cadastrar no banco de talentos?{" "}
              <Link href="/candidatura" style={{ color: "#9ca3af", textDecoration: "underline" }}>
                Clique aqui
              </Link>
            </p>
          </div>
        )}
      </div>
      <CurriculoMotivacional />
      </div>
      </main>

      <footer style={{ textAlign: "center", padding: "32px 0", fontSize: "12px", color: "#4b5563" }}>
        © {new Date().getFullYear()} Salmazos RH & Serviços
      </footer>
    </div>
  );
}
