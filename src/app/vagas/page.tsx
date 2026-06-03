import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { TIPOS_SERVICO } from "@/lib/constants";

export const dynamic = "force-dynamic";

function formatarSalario(valor: string | number | null | undefined): string {
  if (!valor) return "A combinar";
  const num = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (isNaN(num)) return "A combinar";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// All chips use black background with #FFD700 text for contrast on dark page
const TIPO_CORES: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1a1a1a", color: "#FFD700" },
  mao_obra_temporaria:   { bg: "#1a1a1a", color: "#FFD700" },
  terceirizacao:         { bg: "#1a1a1a", color: "#FFD700" },
  avaliacao_psicologica: { bg: "#1a1a1a", color: "#FFD700" },
};

export default async function VagasPublicaPage() {
  const supabase = createServiceClient();
  const { data: vagas } = await supabase
    .from("vagas")
    .select("id, titulo, cidade, estado, salario, tipo_servico, slug")
    .eq("status", "aberta")
    .order("titulo", { ascending: true });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#000" }}>
      {/* Header */}
      <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" className="h-12 w-auto object-contain" />
          <span className="text-white/60 text-sm hidden sm:block">Vagas disponíveis</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#fff" }}>Vagas Abertas</h1>
          <p className="mt-1 text-sm" style={{ color: "#9ca3af" }}>
            {vagas?.length ?? 0} {(vagas?.length ?? 0) === 1 ? "vaga disponível" : "vagas disponíveis"} no momento
          </p>
        </div>

        {(!vagas || vagas.length === 0) ? (
          <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}>
            <p className="text-sm" style={{ color: "#9ca3af" }}>Nenhuma vaga aberta no momento. Volte em breve!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {vagas.map((v: any) => {
              const tipo = TIPOS_SERVICO.find((t) => t.id === v.tipo_servico);
              const cor = v.tipo_servico ? TIPO_CORES[v.tipo_servico] : null;
              const slug = v.slug ?? v.id;
              return (
                <Link
                  key={v.id}
                  href={`/vagas/${slug}`}
                  className="flex flex-col gap-3 rounded-2xl p-5 transition-all group"
                  style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#FFD700")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                >
                  {cor && tipo && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full self-start"
                      style={{ backgroundColor: cor.bg, color: cor.color, border: "1px solid #333" }}
                    >
                      {tipo.label}
                    </span>
                  )}
                  <h2
                    className="font-bold text-base leading-snug transition-colors"
                    style={{ color: "#fff" }}
                  >
                    {v.titulo}
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-auto" style={{ color: "#9ca3af" }}>
                    {(v.cidade || v.estado) && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {[v.cidade, v.estado].filter(Boolean).join(" / ")}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatarSalario(v.salario)}
                    </span>
                  </div>
                  <span
                    className="text-xs font-semibold self-start mt-1"
                    style={{ color: "#FFD700" }}
                  >
                    Ver vaga →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer className="text-center py-8 text-xs" style={{ color: "#4b5563" }}>
        © {new Date().getFullYear()} Salmazos RH & Serviços
      </footer>
    </div>
  );
}
