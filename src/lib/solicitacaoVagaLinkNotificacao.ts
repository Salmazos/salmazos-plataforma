import { SITE_URL } from "@/lib/siteUrl";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { sendEmail } from "@/lib/sendEmail";
import { resolverAvisoVaga, gravarSinoAvisoVaga } from "@/lib/avisosVagas";
import { escaparHtml } from "@/lib/escaparHtml";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface DadosNotificacaoSolicitacaoPublica {
  solicitacaoId: string;
  unidadeId: string;
  nome: string;
  cargo: string;
  numPosicoes: number;
  cidade: string;
  estado: string;
  previsaoInicio: string | null;
  salario: string | null;
  adicionaisSalariais: string | null;
  horario: string | null;
  requisitos: string | null;
  beneficios: string | null;
  principaisAtividades: string | null;
  observacoes: string | null;
}

// Cabeçalho de e-mail não pode ter quebra de linha vinda de texto do cliente.
function semQuebras(texto: string): string {
  return texto.replace(/[\r\n]+/g, " ").trim();
}

// ESCAPA tudo que o cliente digitou. Sem CPF/CNPJ, telefone nem e-mail do cliente no corpo: esses dados ficam só no painel.
export function montarHtmlSolicitacaoPublica(d: DadosNotificacaoSolicitacaoPublica): string {
  const linha = (rotulo: string, valor: string | null | undefined) =>
    valor
      ? `<tr><td style="padding:8px 14px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top">${escaparHtml(rotulo)}</td><td style="padding:8px 14px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:pre-wrap">${escaparHtml(valor)}</td></tr>`
      : "";
  const bloco = (titulo: string, valor: string | null | undefined) =>
    valor
      ? `<div style="margin:20px 0"><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">${escaparHtml(titulo)}</p><div style="background:#f9fafb;border-radius:8px;padding:12px 16px;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${escaparHtml(valor)}</div></div>`
      : "";
  const previsao = d.previsaoInicio ? d.previsaoInicio.split("-").reverse().join("/") : null;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.15em">SALMAZOS RH &amp; SERVIÇOS</p>
    <h1 style="color:#FFD700;margin:0;font-size:20px">🔔 Nova Solicitação de Vaga</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 16px;margin:0 0 20px">
      <p style="margin:0;color:#1d4ed8;font-weight:700;font-size:13px">Recebida pelo link público — cliente sem cadastro. Os dados do contratante e o aceite das condições estão no painel.</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Nova solicitação recebida de <strong style="color:#111827">${escaparHtml(d.nome)}</strong>:</p>
    <div style="margin-bottom:20px;padding:14px 16px;background:#DBEAFE;border-radius:10px;border:1px solid #93C5FD">
      <p style="margin:0;font-size:16px;font-weight:700;color:#1D4ED8">${escaparHtml(d.cargo)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#1E40AF">${escaparHtml(d.numPosicoes)} posição${d.numPosicoes !== 1 ? "ões" : ""} · Recrutamento e Seleção</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${linha("Cargo", d.cargo)}
      ${linha("Nº de Posições", String(d.numPosicoes))}
      ${linha("Cidade/Estado", [d.cidade, d.estado].filter(Boolean).join(" / "))}
      ${linha("Previsão de Início", previsao)}
      ${linha("Salário", d.salario)}
      ${linha("Adicionais Salariais", d.adicionaisSalariais)}
      ${linha("Horário", d.horario)}
    </table>
    ${bloco("Requisitos", d.requisitos)}
    ${bloco("Benefícios", d.beneficios)}
    ${bloco("Principais Atividades", d.principaisAtividades)}
    ${bloco("Observações", d.observacoes)}
    <div style="text-align:center;padding-top:24px;border-top:1px solid #f3f4f6;margin-top:20px">
      <a href="${SITE_URL}/painel/vagas" style="display:inline-block;padding:12px 28px;background:#000;color:#FFD700;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">Ver Solicitação</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© 2026 Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;
}

// Mesmo mecanismo do portal (sino pelo canal "solicitacao_vaga" da unidade + e-mail aos analistas), indicando "via link". Extra e
// isolado: NUNCA lança, a solicitação já está gravada. Sem dados pessoais do cliente nos logs.
export async function notificarSolicitacaoPublica(service: ServiceClient, d: DadosNotificacaoSolicitacaoPublica): Promise<void> {
  const tag = "[solicitacao-vaga-publica]";
  try {
    const { data: analistas } = await service
      .from("analistas_perfil")
      .select("user_id")
      .in("nivel_acesso", ["superuser", "diretoria"])
      .eq("ativo", true);

    const html = montarHtmlSolicitacaoPublica(d);
    const assunto = `🔔 Nova Solicitação de Vaga (via link) — ${semQuebras(d.nome).slice(0, 120)}`;
    const resolvido = await resolverAvisoVaga("solicitacao_vaga", d.unidadeId);

    try {
      if (resolvido.plataforma.modo !== "legado" || (analistas && analistas.length > 0)) {
        await gravarSinoAvisoVaga({
          evento: "solicitacao_vaga",
          unidadeId: d.unidadeId,
          tipo: "nova_solicitacao_vaga",
          titulo: "Nova solicitação de vaga (via link — cliente sem cadastro)",
          mensagem: `${semQuebras(d.nome)} solicitou ${d.numPosicoes}x ${semQuebras(d.cargo)} pelo link público`,
          solicitacaoVagaId: d.solicitacaoId,
          resolvido,
        });
      }
    } catch (err) {
      console.error(`${tag} Erro ao gravar sino:`, err instanceof Error ? err.message : err);
    }

    let resultado = { attempted: 0, succeeded: 0, failed: 0 };
    if (resolvido.email.modo === "desligado") {
      console.log(`${tag} E-mail de solicitacao_vaga está desligado`);
    } else if (resolvido.email.modo === "configurado" && resolvido.email.destinatarios) {
      const destinatarios = resolvido.email.destinatarios.filter((x) => x.email);
      const envios = await Promise.all(
        destinatarios.map((x) => sendEmail({ to: x.email, subject: assunto, html, tipo: "solicitacao_vaga" }))
      ).catch((err) => {
        console.error(`${tag} Erro ao enviar e-mails:`, err instanceof Error ? err.message : err);
        return [];
      });
      resultado = {
        attempted: envios.length,
        succeeded: envios.filter((r) => r.success).length,
        failed: envios.length - envios.filter((r) => r.success).length,
      };
    } else {
      resultado = await notifyAllAnalysts({ subject: assunto, html, tipo: "solicitacao_vaga", unidadeId: d.unidadeId });
    }

    if (resolvido.email.modo !== "desligado" && resultado.succeeded === 0) {
      const motivo =
        resultado.attempted === 0
          ? "nenhum analista com e-mail cadastrado para notificar"
          : `${resultado.failed}/${resultado.attempted} envio(s) de e-mail falharam`;
      console.error(`${tag} E-mail NÃO entregue a ninguém para solicitacao_id=${d.solicitacaoId} (${motivo}).`);
      const { data: superusers } = await service
        .from("analistas_perfil")
        .select("user_id")
        .eq("nivel_acesso", "superuser")
        .eq("ativo", true);
      const alertas = (superusers ?? [])
        .filter((a) => a.user_id)
        .map((a) => ({
          tipo: "email_falhou",
          titulo: "⚠️ Falha ao notificar por e-mail",
          mensagem: `O e-mail da solicitação de vaga pelo link (${semQuebras(d.cargo)}) não foi entregue (${motivo}). A solicitação já está no painel de Vagas.`,
          user_id: a.user_id,
          candidato_id: null,
          solicitacao_vaga_id: d.solicitacaoId,
        }));
      if (alertas.length > 0) await service.from("notificacoes_analista").insert(alertas);
    }
  } catch (err) {
    console.error(`${tag} Erro ao notificar:`, err instanceof Error ? err.message : err);
  }
}
