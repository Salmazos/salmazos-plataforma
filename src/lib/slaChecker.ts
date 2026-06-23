import { createServiceClient } from "@/lib/supabase/server";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";

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

    const diasExcedidos = dias - prazo;
    const urgencyColor = diasExcedidos >= 3 ? "#DC2626" : "#D97706";
    const urgencyBg = diasExcedidos >= 3 ? "#FEE2E2" : "#FFFBEB";

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">⚠️ Alerta de SLA Excedido</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:${urgencyBg};border:1px solid ${urgencyColor}40;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0;color:${urgencyColor};font-size:14px;font-weight:700">${diasExcedidos >= 3 ? "🚨 SLA crítico — ação imediata necessária" : "⏰ SLA excedido — atenção necessária"}</p>
      <p style="margin:4px 0 0;color:${urgencyColor};font-size:13px">Prazo de <strong>${prazo} dia(s) útil(eis)</strong> excedido em <strong>${diasExcedidos} dia(s)</strong></p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${nomeCandidato}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga</td><td style="padding:6px 0;color:#111827">${tituloVaga}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Etapa atual</td><td style="padding:6px 0;color:#111827">${cv.etapa}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Dias na etapa</td><td style="padding:6px 0;color:#111827">${dias} dia(s) útil(eis)</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Prazo limite</td><td style="padding:6px 0;color:#111827">${prazo} dia(s) útil(eis)</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/candidato/${cv.candidato_id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Alerta automático de SLA</p>
  </div>
</div>
</body></html>`;

    void notifyAllAnalysts({
      subject: `⚠️ Salmazos RH - Alerta de SLA — ${nomeCandidato} — ${tituloVaga}`,
      html,
      tipo: "alerta_sla",
      candidato_id: cv.candidato_id,
      vaga_id: cv.vagas?.id,
    });

    // Mark as sent in local set to avoid double-insert within the same run
    alertasSet.add(key);
  }
}
