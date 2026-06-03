import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { TIPOS_SERVICO } from "@/lib/constants";
import FormCandidaturaVagaPublica from "@/components/FormCandidaturaVagaPublica";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

function formatarSalario(valor: string | number | null | undefined): string {
  if (!valor) return "A combinar";
  const num = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (isNaN(num)) return "A combinar";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
        {label}
      </dt>
      <dd style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>{value}</dd>
    </div>
  );
}

export default async function VagaPublicaPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createServiceClient();

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
  const encerrada = vaga.status === "fechada" || vaga.status === "cancelada";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000" }}>
      {/* Header */}
      <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" className="h-12 w-auto object-contain" />
          <Link href="/vagas" style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}
            className="hover:text-white transition-colors">
            ← Todas as vagas
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 pb-16">

        {/* Job info card */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px", marginBottom: "24px" }}>
          <div className="flex flex-wrap items-start justify-between gap-3" style={{ marginBottom: "16px" }}>
            <div className="flex-1">
              {tipo && (
                <span style={{
                  display: "inline-block",
                  backgroundColor: "#1a1a1a",
                  color: "#FFD700",
                  border: "1px solid #333",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  marginBottom: "10px",
                }}>
                  {tipo.label}
                </span>
              )}
              <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>
                {vaga.titulo}
              </h1>
            </div>
            {encerrada && (
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "9999px", backgroundColor: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>
                Vaga encerrada
              </span>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
            {(vaga.cidade || vaga.estado) && (
              <InfoItem label="Local" value={[vaga.cidade, vaga.estado].filter(Boolean).join(" / ")} />
            )}
            <InfoItem label="Salário" value={formatarSalario(vaga.salario)} />
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

        {encerrada ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#6b7280", fontWeight: 500 }}>Esta vaga não está mais recebendo candidaturas.</p>
            <Link href="/vagas" style={{ display: "inline-block", marginTop: "12px", fontSize: "14px", fontWeight: 600, color: "#FFD700" }}>
              Ver outras vagas →
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>Formulário de Candidatura</h2>
              <p style={{ fontSize: "14px", color: "#9ca3af", marginTop: "4px" }}>
                Preencha os campos abaixo para concluir sua candidatura à vaga de{" "}
                <strong style={{ color: "#FFD700" }}>{vaga.titulo}</strong>.{" "}
                Os campos marcados com <span style={{ color: "#ef4444" }}>*</span> são obrigatórios.
              </p>
            </div>
            <FormCandidaturaVagaPublica vagaId={vaga.id} vagaTitulo={vaga.titulo} />
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "32px 0", fontSize: "12px", color: "#4b5563" }}>
        © {new Date().getFullYear()} Salmazos RH & Serviços
      </footer>
    </div>
  );
}
