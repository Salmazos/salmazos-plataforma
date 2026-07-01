import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const MODALIDADES_ELEGIVEIS = ["mao_obra_temporaria", "terceirizacao"];

// Candidatos aprovados pelo cliente (aprovado_cliente), em vagas MOT/Terceirização,
// que ainda não têm uma admissão criada para aquela vaga.
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const [{ data: cvRows, error }, { data: existentes }] = await Promise.all([
    svc
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, candidatos(id, nome_completo, cargo_pretendido, telefone), vagas(id, titulo, tipo_servico)")
      .eq("etapa", "aprovado_cliente")
      .order("created_at", { ascending: false }),
    svc.from("admissoes").select("candidato_id, vaga_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const existentesSet = new Set((existentes ?? []).map((a) => `${a.candidato_id}|${a.vaga_id ?? ""}`));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elegiveis = (cvRows ?? []).filter((cv: any) => {
    const tipoServico = cv.vagas?.tipo_servico;
    if (!MODALIDADES_ELEGIVEIS.includes(tipoServico)) return false;
    const key = `${cv.candidato_id}|${cv.vaga_id ?? ""}`;
    return !existentesSet.has(key);
  });

  return NextResponse.json({ data: elegiveis });
}
