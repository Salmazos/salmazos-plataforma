// HTML dos e-mails internos (equipe Salmazos) que carregam TEXTO DE TERCEIROS (candidato, cliente, formulário público): todo texto livre passa por
// escaparHtml; ids, números, cores e rótulos fixos entram como estão. Os templates foram movidos das rotas sem mudar o HTML (só o escape é novo).
// Funções puras, para scripts/verificar-reserva-e-escape.mts conferir o escape sem rota nem banco.
import { escaparHtml } from "@/lib/escaparHtml";
import { SITE_URL } from "@/lib/siteUrl";

// Linha da tabela "Dados para Admissão": o rótulo é fixo (ADM_LABELS), o valor é texto do cliente.
export const linhaTabelaAdmissao = (label: string, valor: string): string =>
  `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${label}</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${escaparHtml(valor)}</td></tr>`;

export interface DadosCandidatoAprovado {
  candidatoNome: string;
  cargoPretendido?: string | null;
  cidade?: string | null;
  estado?: string | null;
  vagaTitulo?: string | null;
  clienteNome: string;
  tipoServicoRotulo: string;
  // Fragmentos montados pelo código (linhas já escapadas por linhaTabelaAdmissao e bloco financeiro): entram sem novo escape.
  admRows: string;
  feeSection: string;
  feedbackCliente?: string | null;
  candidatoId: string;
}

export function montarHtmlCandidatoAprovado(d: DadosCandidatoAprovado): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">✅ Candidato Aprovado pelo Cliente</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Candidato</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${escaparHtml(d.candidatoNome)}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${escaparHtml(d.cargoPretendido ?? "—")} · ${escaparHtml(d.cidade ?? "")}${d.estado ? ` – ${escaparHtml(d.estado)}` : ""}</p>
    </div>
    <div style="margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:8px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Vaga</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${escaparHtml(d.vagaTitulo ?? "—")}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${escaparHtml(d.clienteNome)} · ${escaparHtml(d.tipoServicoRotulo)}</p>
    </div>
    ${d.admRows ? `
    <div style="margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">📋 Dados para Admissão</p>
      <table style="width:100%;border-collapse:collapse">${d.admRows}</table>
    </div>` : ""}
    ${d.feeSection}
    <div style="margin-bottom:20px;padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.07em">💬 Feedback do Cliente</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">${escaparHtml(d.feedbackCliente)}</p>
    </div>
    <div style="text-align:center;padding-top:16px;border-top:1px solid #f3f4f6">
      <a href="${SITE_URL}/painel/candidato/${d.candidatoId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil completo</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;
}

export interface DadosIndicacaoAprovada {
  candidatoNome: string;
  candidatoTelefone: string;
  vagaTitulo: string;
  clienteNome?: string | null;
  admRows: string;
  temCurriculo: boolean;
  candidatoId: string;
}

export function montarHtmlIndicacaoAprovada(d: DadosIndicacaoAprovada): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">🧑‍💼 Indicação Direta Aprovada</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Candidato</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${escaparHtml(d.candidatoNome)}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${escaparHtml(d.candidatoTelefone)} · CPF/e-mail a completar pelo RH</p>
    </div>
    <div style="margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:8px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Vaga</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${escaparHtml(d.vagaTitulo)}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${escaparHtml(d.clienteNome ?? "")}</p>
    </div>
    ${d.admRows ? `<div style="margin-bottom:20px"><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">📋 Dados para Admissão</p><table style="width:100%;border-collapse:collapse">${d.admRows}</table></div>` : ""}
    ${d.temCurriculo ? `<p style="margin:0 0 20px;font-size:13px;color:#374151">📎 Currículo anexado no perfil do candidato.</p>` : ""}
    <div style="text-align:center;padding-top:16px;border-top:1px solid #f3f4f6">
      <a href="${SITE_URL}/painel/candidato/${d.candidatoId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil completo</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;
}

export interface DadosAlertaSla {
  nomeCandidato: string;
  tituloVaga: string;
  etapa: string;
  dias: number;
  prazo: number;
  diasExcedidos: number;
  candidatoId: string;
}

export function montarHtmlAlertaSla(d: DadosAlertaSla): string {
  const { dias, prazo, diasExcedidos } = d;
  const urgencyColor = diasExcedidos >= 3 ? "#DC2626" : "#D97706";
  const urgencyBg = diasExcedidos >= 3 ? "#FEE2E2" : "#FFFBEB";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
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
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato</td><td style="padding:6px 0;color:#111827">${escaparHtml(d.nomeCandidato)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga</td><td style="padding:6px 0;color:#111827">${escaparHtml(d.tituloVaga)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Etapa atual</td><td style="padding:6px 0;color:#111827">${escaparHtml(d.etapa)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Dias na etapa</td><td style="padding:6px 0;color:#111827">${dias} dia(s) útil(eis)</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Prazo limite</td><td style="padding:6px 0;color:#111827">${prazo} dia(s) útil(eis)</td></tr>
    </table>
    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/painel/candidato/${d.candidatoId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver candidato</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Alerta automático de SLA</p>
  </div>
</div>
</body></html>`;
}
