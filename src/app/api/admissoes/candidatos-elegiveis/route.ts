import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { mapTipoServicoPorCandidatura } from "@/lib/tipoServicoVigente";

const MODALIDADES_ELEGIVEIS = ["mao_obra_temporaria", "terceirizacao"];

const ETAPAS_ELEGIVEIS = ["aprovado_cliente", "contratado"];

// Candidatos aprovados pelo cliente ou já contratados, em processos MOT/Terceirização,
// que ainda não têm uma admissão criada para aquela vaga. A modalidade considerada é a
// "vigente" da candidatura (encaminhamento mais recente, com fallback pra vagas.tipo_servico
// — ver src/lib/tipoServicoVigente.ts), não vagas.tipo_servico direto: o tipo_servico
// combinado com o cliente na entrevista pode divergir do fixado na vaga.
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const [{ data: cvRows, error }, { data: existentes }] = await Promise.all([
    svc
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, candidatos(id, nome_completo, cargo_pretendido, telefone), vagas(id, titulo, tipo_servico, cliente_id, clientes(nome, entidade_contratante))")
      .in("etapa", ETAPAS_ELEGIVEIS)
      .order("created_at", { ascending: false }),
    svc.from("admissoes").select("candidato_id, vaga_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const existentesSet = new Set((existentes ?? []).map((a) => `${a.candidato_id}|${a.vaga_id ?? ""}`));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatoIds = Array.from(new Set((cvRows ?? []).map((cv: any) => cv.candidato_id)));
  const tipoServicoPorCandidatura = await mapTipoServicoPorCandidatura(svc, candidatoIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comTipoServicoVigente = (cvRows ?? []).map((cv: any) => ({
    ...cv,
    tipo_servico_vigente: tipoServicoPorCandidatura.get(`${cv.candidato_id}|${cv.vaga_id}`) ?? cv.vagas?.tipo_servico ?? null,
  }));

  const elegiveis = comTipoServicoVigente.filter((cv) => {
    if (!MODALIDADES_ELEGIVEIS.includes(cv.tipo_servico_vigente)) return false;
    const key = `${cv.candidato_id}|${cv.vaga_id ?? ""}`;
    return !existentesSet.has(key);
  });

  return NextResponse.json({ data: elegiveis });
}
