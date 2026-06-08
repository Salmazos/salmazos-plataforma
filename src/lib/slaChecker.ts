import { createServiceClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlaConfig {
  etapa: string;
  prazo_dias_uteis: number;
  ativo: boolean;
}

interface CandidatoVaga {
  id: string;
  candidato_id: string;
  vaga_id: string;
  etapa: string;
  updated_at: string;
  candidatos: { nome_completo: string } | null;
  vagas: { id: string; titulo: string; status: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ETAPAS_EXCLUIDAS = ["contratado", "reprovado", "reprovado_cliente", "blacklist"];

function diasUteis(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function inicioDiaUTC(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function fimDiaUTC(): string {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function verificarSLA(): Promise<void> {
  const supabase = createServiceClient();
  const agora = new Date();

  // 1. Fetch active SLA configs
  const { data: configs, error: cfgErr } = await supabase
    .from("sla_config")
    .select("etapa, prazo_dias_uteis, ativo")
    .eq("ativo", true);

  if (cfgErr) {
    console.error("[verificarSLA] Erro ao buscar sla_config:", cfgErr.message);
    return;
  }

  const configMap = new Map<string, number>(
    (configs ?? []).map((c: SlaConfig) => [c.etapa, c.prazo_dias_uteis])
  );
  const prazoPadrao = configMap.get("sem_movimentacao") ?? 5;

  // 2. Fetch active candidatos_vagas with joins
  const { data: rows, error: cvErr } = await supabase
    .from("candidatos_vagas")
    .select("id, candidato_id, vaga_id, etapa, updated_at, candidatos(nome_completo), vagas(id, titulo, status)")
    .not("etapa", "in", `(${ETAPAS_EXCLUIDAS.join(",")})`);

  if (cvErr) {
    console.error("[verificarSLA] Erro ao buscar candidatos_vagas:", cvErr.message);
    return;
  }

  // Keep only rows where the linked vaga is 'aberta'
  const typed = (rows ?? []) as unknown as CandidatoVaga[];
  const ativos = typed.filter((cv) => cv.vagas?.status === "aberta");

  if (ativos.length === 0) return;

  // 3. Fetch all alerts already sent today (bulk, avoids N+1)
  const ids = ativos.map((cv) => cv.id);
  const { data: alertasHoje } = await supabase
    .from("sla_alertas_enviados")
    .select("candidato_vaga_id, etapa")
    .in("candidato_vaga_id", ids)
    .gte("sent_at", inicioDiaUTC())
    .lte("sent_at", fimDiaUTC());

  const alertasSet = new Set<string>(
    (alertasHoje ?? []).map(
      (a: { candidato_vaga_id: string; etapa: string }) => `${a.candidato_vaga_id}::${a.etapa}`
    )
  );

  // 4. Evaluate each candidato_vaga
  for (const cv of ativos) {
    const prazo = configMap.get(cv.etapa) ?? prazoPadrao;
    const dias = diasUteis(new Date(cv.updated_at), agora);

    if (dias <= prazo) continue;

    const key = `${cv.id}::${cv.etapa}`;
    if (alertasSet.has(key)) continue;

    const nomeCandidato = cv.candidatos?.nome_completo ?? "Candidato";
    const tituloVaga    = cv.vagas?.titulo ?? "Vaga";

    // a) Register the alert
    const { error: insertErr } = await supabase.from("sla_alertas_enviados").insert({
      candidato_vaga_id: cv.id,
      etapa: cv.etapa,
    });

    if (insertErr) {
      console.error("[verificarSLA] Erro ao inserir sla_alertas_enviados:", insertErr.message);
      continue;
    }

    // b) Create notification for analysts
    const { error: notifErr } = await supabase.from("notificacoes_analista").insert({
      tipo: "alerta_sla",
      titulo: `⚠️ SLA excedido: ${nomeCandidato}`,
      mensagem: `${nomeCandidato} está na etapa "${cv.etapa}" da vaga "${tituloVaga}" há ${dias} dia(s) útil(eis) (limite: ${prazo}).`,
      candidato_id: cv.candidato_id,
    });

    if (notifErr) {
      console.error("[verificarSLA] Erro ao inserir notificação:", notifErr.message);
    }

    // Mark as sent in local set to avoid double-insert within the same run
    alertasSet.add(key);
  }
}
