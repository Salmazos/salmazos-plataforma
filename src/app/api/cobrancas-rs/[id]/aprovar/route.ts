import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";
import { registrarAuditoria } from "@/lib/audit";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";
import { obterDestinatariosCobrancaRS } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return iso.split("-").reverse().join("/");
}

export async function POST(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const temAcesso = await checarAcessoCobrancaRS(user);
  if (!temAcesso) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const { id } = await params;
  const svc = createServiceClient();

  const { data: cobranca, error: cobrancaErr } = await svc
    .from("cobrancas_rs")
    .select("*, vagas(titulo)")
    .eq("id", id)
    .single();

  if (cobrancaErr || !cobranca) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  if (cobranca.status !== "pendente_revisao") {
    return NextResponse.json({ error: "Esta cobrança já foi revisada." }, { status: 400 });
  }

  const ehCancelamento = cobranca.tipo === "cancelamento";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaTitulo = (cobranca.vagas as any)?.titulo ?? "—";

  const faltando: string[] = [];
  if (!ehCancelamento) {
    if (!cobranca.cargo?.trim()) faltando.push("Cargo");
    if (!cobranca.data_inicio) faltando.push("Data de início");
  }
  if (cobranca.salario == null || cobranca.salario <= 0) faltando.push(ehCancelamento ? "Salário-base" : "Salário");
  if (!cobranca.cliente_cnpj_snapshot?.trim()) faltando.push("CNPJ do cliente");
  if (!cobranca.cliente_endereco_snapshot?.trim()) faltando.push("Endereço do cliente");

  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `Preencha antes de aprovar: ${faltando.join(", ")}.` },
      { status: 400 }
    );
  }

  const feePercentual = Number(cobranca.fee_percentual);
  const salario = Number(cobranca.salario);
  const feeValor = Math.round(((salario * feePercentual) / 100) * 100) / 100;

  // Mesma base de destinatários do aviso de atraso e do "cobrança paga" (obterDestinatariosCobrancaRS):
  // PAPEIS_FULL_ACCESS + acesso configurável à tela, mas o analista com acesso configurável só
  // entra se for o revisor desta cobrança — que é o próprio usuário aprovando agora (user.id vira
  // revisado_por no UPDATE logo abaixo, então já dá pra passar direto, sem esperar o UPDATE
  // terminar). Antes desta correção, o envio dependia só de cobranca_rs_avisos_destinatarios —
  // tabela que na prática só tinha 1 e-mail ativo (olver@salmazos.com.br), deixando o resto da
  // base sem o aviso de cobrança gerada.
  const destinatarios = await obterDestinatariosCobrancaRS(user.id, svc);

  let emailFalhou = false;
  if (destinatarios.length > 0) {
    const template = getEmailTemplate("cobranca_rs_gerada", {
      nome: "",
      cargo: ehCancelamento ? vagaTitulo : cobranca.cargo,
      nomeCliente: cobranca.cliente_nome_snapshot,
      nomeCandidato: ehCancelamento ? undefined : cobranca.candidato_nome_snapshot,
      clienteCnpj: cobranca.cliente_cnpj_snapshot,
      clienteEndereco: cobranca.cliente_endereco_snapshot,
      clienteTelefone: cobranca.cliente_telefone_snapshot,
      clienteEmail: cobranca.cliente_email_snapshot,
      salario: formatarMoeda(salario),
      dataInicio: ehCancelamento ? undefined : formatarData(cobranca.data_inicio),
      feeRsPercentual: feePercentual,
      feeValor,
      tipoCobrancaRS: ehCancelamento ? "cancelamento" : "contratacao",
    });

    const resultados = await Promise.all(
      destinatarios.map((d) =>
        sendEmail({ to: d.email, subject: template.subject, html: template.html, tipo: "cobranca_rs_gerada" })
      )
    );
    emailFalhou = resultados.some((r) => !r.success);
    if (emailFalhou) console.error(`[cobrancas-rs/aprovar] Falha ao enviar para 1+ destinatário(s) (cobranca_id=${id})`);
  } else {
    console.error(`[cobrancas-rs/aprovar] Nenhum destinatário de e-mail ativo configurado (cobranca_id=${id}) — cobrança aprovada sem envio.`);
  }

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({
      fee_valor: feeValor,
      status: "aprovada_enviada",
      enviado_em: new Date().toISOString(),
      revisado_por: user.id,
      revisado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "cobranca_rs_aprovada_enviada",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: {
      cliente: cobranca.cliente_nome_snapshot,
      candidato: cobranca.candidato_nome_snapshot,
      fee_valor: feeValor,
      email_falhou: emailFalhou,
      destinatarios: destinatarios.length,
    },
  });

  return NextResponse.json({ data, emailFalhou, destinatariosCount: destinatarios.length });
}
