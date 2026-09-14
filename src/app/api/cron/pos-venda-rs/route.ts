import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";
import { resolverDestinatariosPosVenda } from "@/lib/posVendaRS";

export const dynamic = "force-dynamic";

// ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O OLVER (14/09): pós-venda só dispara pra contratações
// de R&S, e só enquanto a vaga contratada estiver entre as 3 primeiras vagas de R&S já
// abertas por aquele cliente (histórico de "cliente novo" — a partir da 4ª vaga de R&S do
// mesmo cliente, não dispara mais). Ranking calculado por vagas.created_at, não por data de
// contratação — é "a N-ésima vaga que o cliente abriu", não "a N-ésima contratação".
const RANK_MAXIMO_CLIENTE_NOVO = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString().split("T")[0];

    // candidatos_vagas!vagas: usar sempre o hint de FK explícito
    // (candidatos_vagas_vaga_id_fkey) — a outra FK (reposição de garantia) causa erro de
    // embed ambíguo em runtime (ver CLAUDE.md).
    const { data: rows, error } = await supabase
      .from("candidatos_vagas")
      .select(
        "id, candidato_id, vaga_id, data_inicio, candidatos(nome_completo), " +
          "vagas!candidatos_vagas_vaga_id_fkey(id, titulo, tipo_servico, created_at, cliente_id, clientes(id, nome, responsavel_comercial))"
      )
      .is("pos_venda_notificado_em", null)
      .not("data_inicio", "is", null)
      .in("etapa", ["aprovado_cliente", "contratado"]);

    if (error) {
      console.error("[cron/pos-venda-rs] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let processados = 0;
    let elegiveis = 0;
    let notificacoesEnviadas = 0;

    for (const row of (rows ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const vaga = r.vagas;
      if (!vaga || vaga.tipo_servico !== "recrutamento_selecao") continue;

      // Alvo é exatamente hoje (gatilho de dia exato, não janela rolante) — 7 dias corridos
      // depois do início do candidato, mesmo cálculo já usado pra garantia_data_fim.
      const alvo = new Date(r.data_inicio + "T00:00:00");
      alvo.setDate(alvo.getDate() + 7);
      const alvoISO = alvo.toISOString().split("T")[0];
      if (alvoISO !== hojeISO) continue;

      processados++;

      const cliente = vaga.clientes;
      if (!cliente?.id) {
        console.error(
          `[cron/pos-venda-rs] candidatos_vagas.id=${r.id} sem cliente vinculado à vaga — marcado sem notificar.`
        );
        await supabase.from("candidatos_vagas").update({ pos_venda_notificado_em: new Date().toISOString() }).eq("id", r.id);
        continue;
      }

      // Rank da vaga entre as vagas de R&S já abertas por esse cliente, por ordem de
      // criação — só as 3 primeiras contam como "cliente novo" pra esse aviso.
      const { data: vagasRSCliente } = await supabase
        .from("vagas")
        .select("id, created_at")
        .eq("cliente_id", cliente.id)
        .eq("tipo_servico", "recrutamento_selecao")
        .order("created_at", { ascending: true });

      const rank = (vagasRSCliente ?? []).findIndex((v) => v.id === vaga.id) + 1;
      if (rank < 1 || rank > RANK_MAXIMO_CLIENTE_NOVO) {
        await supabase.from("candidatos_vagas").update({ pos_venda_notificado_em: new Date().toISOString() }).eq("id", r.id);
        continue;
      }

      elegiveis++;

      const candidatoNome = r.candidatos?.nome_completo ?? "Candidato";
      const vagaTitulo = vaga.titulo ?? "Vaga";
      const clienteNome = cliente.nome ?? "Cliente";
      const dataInicioFmt = (r.data_inicio as string).split("-").reverse().join("/");

      const destinatarios = await resolverDestinatariosPosVenda(cliente.responsavel_comercial, supabase);

      if (destinatarios.length === 0) {
        console.error(
          `[cron/pos-venda-rs] Nenhum destinatário resolvido pra candidato_vaga_id=${r.id} (cliente="${clienteNome}") — notificação NÃO enviada a ninguém.`
        );
      } else {
        const titulo = `🤝 Hora do pós-venda: ${candidatoNome} — ${clienteNome}`;
        const mensagem = `${candidatoNome} completou 7 dias na vaga "${vagaTitulo}" (${clienteNome}), início em ${dataInicioFmt}. Hora de fazer o contato de pós-venda com o cliente.`;

        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">🤝 Hora do pós-venda</h1>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0 0 16px;color:#374151;font-size:14px">${candidatoNome} completou <strong>7 dias</strong> de contratação. É um bom momento pra fazer o contato de pós-venda com o cliente.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${clienteNome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga</td><td style="padding:6px 0;color:#111827">${vagaTitulo}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${candidatoNome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Início</td><td style="padding:6px 0;color:#111827">${dataInicioFmt}</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/candidato/${r.candidato_id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil do candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Alerta automático de pós-venda</p>
  </div>
</div>
</body></html>`;

        await Promise.all(
          destinatarios.map(async (d) => {
            await supabase.from("notificacoes_analista").insert({
              tipo: "pos_venda_rs",
              titulo,
              mensagem,
              user_id: d.user_id,
              candidato_id: r.candidato_id,
              vaga_id: r.vaga_id,
            });

            const resultado = await sendEmail({
              to: d.email,
              subject: titulo,
              html,
              tipo: "pos_venda_rs",
              candidato_id: r.candidato_id,
              vaga_id: r.vaga_id,
            });
            if (resultado.success) notificacoesEnviadas++;
          })
        );
      }

      await supabase.from("candidatos_vagas").update({ pos_venda_notificado_em: new Date().toISOString() }).eq("id", r.id);
    }

    return NextResponse.json({ processados, elegiveis, notificacoes_enviadas: notificacoesEnviadas });
  } catch (err) {
    console.error("[GET /api/cron/pos-venda-rs]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
