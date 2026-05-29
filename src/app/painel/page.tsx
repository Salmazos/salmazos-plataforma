import { createServiceClient } from "@/lib/supabase/server";
import PainelLayout from "@/components/PainelLayout";
import type { Candidato } from "@/types";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        Erro ao carregar candidatos: {error.message}
      </div>
    );
  }

  const candidatos = (data as Candidato[]) ?? [];

  // ── Métricas ──────────────────────────────────────────────────
  const totalAtivos = candidatos.length;

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const aprovadosNoMes = candidatos.filter(
    (c) =>
      c.etapa_kanban === "aprovado_cliente" &&
      new Date(c.updated_at) >= inicioMes
  ).length;

  const aprovados = candidatos.filter((c) => c.etapa_kanban === "aprovado_cliente");
  const tempoMedioDias =
    aprovados.length > 0
      ? Math.round(
          aprovados.reduce((soma, c) => {
            const diff =
              new Date(c.updated_at).getTime() -
              new Date(c.created_at).getTime();
            return soma + diff / (1000 * 60 * 60 * 24);
          }, 0) / aprovados.length
        )
      : 0;

  // ── Candidaturas agrupadas por origem ─────────────────────────
  const origensMap = new Map<string, number>();
  candidatos.forEach((c) => {
    const key = c.origem ?? "Banco de talentos";
    origensMap.set(key, (origensMap.get(key) ?? 0) + 1);
  });
  const vagas = Array.from(origensMap.entries())
    .map(([cargo, count]) => ({ cargo, count }))
    .sort((a, b) => b.count - a.count);

  // ── Últimos 5 candidatos ───────────────────────────────────────
  const recentes = candidatos.slice(0, 5).map((c) => ({
    id: c.id,
    nome_completo: c.nome_completo,
    cargo_pretendido: c.cargo_pretendido,
    created_at: c.created_at,
  }));

  return (
    <PainelLayout
      candidatos={candidatos}
      totalAtivos={totalAtivos}
      aprovadosNoMes={aprovadosNoMes}
      tempoMedioDias={tempoMedioDias}
      vagas={vagas}
      recentes={recentes}
    />
  );
}
