import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString().split("T")[0];

    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + 7);
    const limiteISO = limite.toISOString().split("T")[0];

    const { data: rows, error } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, garantia_data_fim, admissao_fee_valor, candidatos(nome_completo), vagas(titulo, clientes(nome))")
      .eq("garantia_acionada", false)
      .not("garantia_data_fim", "is", null)
      .in("etapa", ["aprovado_cliente", "contratado"])
      .gte("garantia_data_fim", hojeISO)
      .lte("garantia_data_fim", limiteISO);

    if (error) {
      console.error("[garantia-rs] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let alertasEnviados = 0;

    for (const row of (rows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const candidatoNome = r.candidatos?.nome_completo ?? "Candidato";
      const vagaTitulo = r.vagas?.titulo ?? "Vaga";
      const clienteNome = r.vagas?.clientes?.nome ?? "Cliente";
      const garantiaFim = r.garantia_data_fim as string;
      const garantiaDate = new Date(garantiaFim + "T00:00:00");
      const diasRestantes = Math.ceil((garantiaDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      const garantiaFmt = garantiaFim.split("-").reverse().join("/");

      // Create bell notification
      await supabase.from("notificacoes_analista").insert({
        tipo: "alerta_garantia_rs",
        titulo: `⚠️ Garantia R&S vence em ${diasRestantes} dia${diasRestantes !== 1 ? "s" : ""}: ${candidatoNome}`,
        mensagem: `A garantia de reposição de ${candidatoNome} na vaga "${vagaTitulo}" (${clienteNome}) vence em ${garantiaFmt}. ${diasRestantes === 0 ? "VENCE HOJE!" : `Restam ${diasRestantes} dia(s).`}`,
        candidato_id: r.candidato_id,
      });

      // Send email alert
      const urgencyColor = diasRestantes <= 2 ? "#DC2626" : "#D97706";
      const urgencyBg = diasRestantes <= 2 ? "#FEE2E2" : "#FFFBEB";
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">⚠️ Garantia R&S — Vence em ${diasRestantes} dia${diasRestantes !== 1 ? "s" : ""}</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:${urgencyBg};border:1px solid ${urgencyColor}40;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0;color:${urgencyColor};font-size:14px;font-weight:700">${diasRestantes === 0 ? "🚨 A garantia vence HOJE!" : `⏰ Restam ${diasRestantes} dia(s) de garantia`}</p>
      <p style="margin:4px 0 0;color:${urgencyColor};font-size:13px">Vencimento: <strong>${garantiaFmt}</strong></p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${candidatoNome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga</td><td style="padding:6px 0;color:#111827">${vagaTitulo}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${clienteNome}</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/candidato/${r.candidato_id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil do candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Alerta automático de garantia</p>
  </div>
</div>
</body></html>`;

      void notifyAllAnalysts({
        subject: `⚠️ Garantia R&S vence em ${diasRestantes} dia${diasRestantes !== 1 ? "s" : ""} — ${candidatoNome} — ${clienteNome}`,
        html,
        tipo: "alerta_garantia_rs",
        candidato_id: r.candidato_id,
        vaga_id: r.vaga_id,
      });

      alertasEnviados++;
    }

    return NextResponse.json({
      processados: (rows ?? []).length,
      alertas_enviados: alertasEnviados,
    });
  } catch (err) {
    console.error("[GET /api/cron/garantia-rs]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
