import { createServiceClient } from "@/lib/supabase/server";
import { TIPOS_SERVICO } from "@/lib/constants";
import BotaoVoltarSite from "@/components/BotaoVoltarSite";
import VagasListaClient from "@/components/VagasListaClient";

export const dynamic = "force-dynamic";

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

export default async function VagasPublicaPage() {
  const supabase = createServiceClient();
  const { data: vagas } = await supabase
    .from("vagas")
    .select("id, titulo, cidade, estado, salario, tipo_servico, slug")
    .eq("status", "aberta")
    .order("titulo", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagasFormatadas = (vagas ?? []).map((v: any) => {
    const tipo = TIPOS_SERVICO.find((t) => t.id === v.tipo_servico);
    return {
      id: v.id,
      slug: v.slug ?? v.id,
      titulo: v.titulo,
      cidade: v.cidade,
      estado: v.estado,
      salario: v.salario,
      tipoServico: v.tipo_servico ?? null,
      tipoLabel: tipo?.label ?? null,
      salarioFormatado: formatarSalario(v.salario),
    };
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#000" }}>
      <BotaoVoltarSite />
      <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" className="h-[75px] w-auto object-contain" />
          <span className="text-white/60 text-sm hidden sm:block">Vagas disponíveis</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <VagasListaClient vagas={vagasFormatadas} />
      </main>

      <footer className="text-center py-8 text-xs" style={{ color: "#4b5563" }}>
        © {new Date().getFullYear()} Salmazos RH & Serviços
      </footer>
    </div>
  );
}
