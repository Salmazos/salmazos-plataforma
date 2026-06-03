import { createServiceClient } from "@/lib/supabase/server";
import { TIPOS_SERVICO } from "@/lib/constants";
import VagaCard from "@/components/VagaCard";

export const dynamic = "force-dynamic";

function formatarSalario(valor: string | number | null | undefined): string {
  if (!valor) return "A combinar";
  const num = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (isNaN(num)) return "A combinar";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


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
              const slug = v.slug ?? v.id;
              return (
                <VagaCard
                  key={v.id}
                  id={v.id}
                  slug={slug}
                  titulo={v.titulo}
                  cidade={v.cidade}
                  estado={v.estado}
                  salario={v.salario}
                  tipoServico={v.tipo_servico ?? null}
                  tipoLabel={tipo?.label ?? null}
                  salarioFormatado={formatarSalario(v.salario)}
                />
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
