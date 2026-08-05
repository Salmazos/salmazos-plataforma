import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AdmissoesClient from "@/components/AdmissoesClient";

export const dynamic = "force-dynamic";

// Mesmo conjunto de modalidades elegíveis pra admissão do restante do módulo (ver
// api/admissoes/candidatos-elegiveis/route.ts) — R&S nunca gera admissão, o cliente
// contrata direto.
const MODALIDADES_ELEGIVEIS = ["mao_obra_temporaria", "terceirizacao"];

export default async function AdmissoesPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria", "supervisor", "dp"].includes(role)) redirect("/painel");

  const svc = createServiceClient();

  const { data: admissoes } = await svc
    .from("admissoes")
    .select("*, candidatos(id, nome_completo, cargo_pretendido, telefone), vagas(id, titulo)")
    .order("criado_em", { ascending: false });

  const ids = (admissoes ?? []).map((a) => a.id);
  const { data: docs } = ids.length
    ? await svc.from("admissao_documentos").select("admissao_id, status").in("admissao_id", ids)
    : { data: [] as { admissao_id: string; status: string }[] };

  const progressoPorAdmissao = new Map<string, number>();
  for (const d of docs ?? []) {
    if (d.status === "enviado" || d.status === "aprovado") {
      progressoPorAdmissao.set(d.admissao_id, (progressoPorAdmissao.get(d.admissao_id) ?? 0) + 1);
    }
  }

  const admissoesComProgresso = (admissoes ?? []).map((a) => ({
    ...a,
    docsEnviados: progressoPorAdmissao.get(a.id) ?? 0,
    docsTotal: 16,
  }));

  // "Disponíveis para admissão" — candidatos já contratados (candidatos_vagas.etapa =
  // 'contratado') numa vaga MOT/Terceirização, mas sem admissão iniciada ainda. Diferente
  // de candidatos-elegiveis/route.ts (usado dentro do modal "+ Iniciar admissão"): aqui
  // usamos vagas.tipo_servico direto, não o "vigente" do encaminhamento, e só etapa
  // 'contratado' — é uma lista de "ação pendente", não de elegibilidade ampla.
  const { data: contratadosSemAdmissao } = await svc
    .from("candidatos_vagas")
    .select("id, candidato_id, vaga_id, updated_at, candidatos(id, nome_completo, cargo_pretendido, telefone), vagas(id, titulo, tipo_servico, cliente_id, clientes(nome, entidade_contratante))")
    .eq("etapa", "contratado")
    .order("updated_at", { ascending: false });

  const { data: admissoesExistentes } = await svc.from("admissoes").select("candidato_id, vaga_id");
  const admissaoExistenteSet = new Set((admissoesExistentes ?? []).map((a) => `${a.candidato_id}|${a.vaga_id ?? ""}`));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disponiveisBrutos = (contratadosSemAdmissao ?? []).filter((cv: any) => {
    const tipoServico = cv.vagas?.tipo_servico;
    if (!tipoServico || !MODALIDADES_ELEGIVEIS.includes(tipoServico)) return false;
    return !admissaoExistenteSet.has(`${cv.candidato_id}|${cv.vaga_id ?? ""}`);
  });

  // candidatos_vagas.updated_at não é confiável pra "quando entrou em contratado" (nenhum
  // trigger mantém essa coluna — na prática ela nunca muda desde a criação da linha).
  // historico_candidato tem o registro real, gravado no exato momento da finalização (ver
  // api/candidatos-vagas/[id]/finalizar/route.ts) — usamos ele como fonte, com updated_at
  // só como fallback se por algum motivo o histórico não existir.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatoIdsDisponiveis = Array.from(new Set(disponiveisBrutos.map((cv: any) => cv.candidato_id)));
  const { data: historicoContratado } = candidatoIdsDisponiveis.length
    ? await svc
        .from("historico_candidato")
        .select("candidato_id, created_at, metadata")
        .eq("tipo", "contratado")
        .in("candidato_id", candidatoIdsDisponiveis)
        .order("created_at", { ascending: false })
    : { data: [] as { candidato_id: string; created_at: string; metadata: Record<string, unknown> | null }[] };

  const dataContratadoPorCandidatura = new Map<string, string>();
  for (const h of historicoContratado ?? []) {
    const vagaIdMeta = (h.metadata as { vaga_id?: string } | null)?.vaga_id;
    const key = `${h.candidato_id}|${vagaIdMeta ?? ""}`;
    // Já ordenado por created_at desc — a primeira ocorrência de cada chave é a mais recente.
    if (!dataContratadoPorCandidatura.has(key)) dataContratadoPorCandidatura.set(key, h.created_at);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disponiveisParaAdmissao = disponiveisBrutos.map((cv: any) => ({
    id: cv.id,
    candidato_id: cv.candidato_id,
    vaga_id: cv.vaga_id,
    candidatos: cv.candidatos,
    vagas: cv.vagas,
    // Não há "vigente" separado aqui — a regra dessa lista já usa vagas.tipo_servico
    // como fonte única, então o mesmo valor serve pro default de modalidade do modal.
    tipo_servico_vigente: cv.vagas?.tipo_servico ?? null,
    data_contratado: dataContratadoPorCandidatura.get(`${cv.candidato_id}|${cv.vaga_id}`) ?? cv.updated_at,
  }));

  return (
    <AdmissoesClient
      admissoesIniciais={admissoesComProgresso}
      disponiveisIniciais={disponiveisParaAdmissao}
    />
  );
}
