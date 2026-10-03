import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { checarAcessoAdmissaoRH } from "@/lib/rhUnidadeAuth";
import { parseBody, admissaoEnviarEmailContabilidadeSchema } from "@/lib/schemas";
import { ENTIDADES_CONTRATANTES, EMAIL_CONTABILIDADE_CC_FIXO, TEMPO_CONTRATO_PADRAO } from "@/lib/constants";
import { exibirTelefone } from "@/lib/utils";
import { sendEmail, obterRemetente } from "@/lib/sendEmail";
import { registrarAuditoria } from "@/lib/audit";
import {
  LIMITE_ANEXO_EMAIL_BYTES, formatarMB, formatarSalario, montarAssunto, montarHtmlEmail, montarLinhaEmpresa,
  montarLinhasDados, montarTextoEmail, nomeArquivoAnexo, podeEnviarAgora, resolverTempoContrato, saudacaoSaoPaulo,
  type DadosEmailPacote,
} from "@/lib/emailPacoteContabilidade";

export const maxDuration = 30;

interface Params {
  params: Promise<{ id: string }>;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

const semQuebraDeLinha = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

// Monta tudo que o e-mail precisa a partir do banco. NUNCA gera o PDF (gerar-pdf muda status e cria
// funcionário): só lê o que já foi gerado. O service client ignora RLS — o acesso já foi checado
// (papel + unidade) pelas rotas antes de chamar isto.
async function carregarContexto(svc: ServiceClient, id: string) {
  const { data: admissao } = await svc
    .from("admissoes")
    .select(
      "id, candidato_id, vaga_id, pdf_pacote_path, data_admissao, funcao, salario, tipo_salario, horario_trabalho, entidade_contratante, " +
        "pacote_enviado_email_em, pacote_enviado_email_por, pacote_enviado_email_para, " +
        "candidatos(nome_completo, telefone), vagas(cliente_id, clientes(nome, entidade_contratante))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!admissao) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adm = admissao as any;

  const [{ data: dp }, { data: cv }, { data: destinatarios }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("nome_completo, telefone").eq("admissao_id", id).maybeSingle(),
    adm.candidato_id && adm.vaga_id
      ? svc.from("candidatos_vagas").select("admissao_data_inicio, admissao_tempo_contrato").eq("candidato_id", adm.candidato_id).eq("vaga_id", adm.vaga_id).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    svc.from("admissao_contabilidade_email_destinatarios").select("nome, email").eq("ativo", true).order("nome"),
  ]);

  const candidato = adm.candidatos as { nome_completo: string | null; telefone: string | null } | null;
  const cliente = adm.vagas?.clientes as { nome: string; entidade_contratante: string | null } | null;
  const nome = (dp?.nome_completo || candidato?.nome_completo || "").trim();
  const dataInicio: string | null = adm.data_admissao || cv?.admissao_data_inicio || null;
  const telefone = exibirTelefone(dp?.telefone || candidato?.telefone || "");
  const entidadeValue: string | null = adm.entidade_contratante ?? cliente?.entidade_contratante ?? null;
  const entidade = ENTIDADES_CONTRATANTES.find((e) => e.value === entidadeValue);
  const tempoContratoSugerido = resolverTempoContrato(cv?.admissao_tempo_contrato, TEMPO_CONTRATO_PADRAO);

  const dados = (tempoContrato: string): DadosEmailPacote => ({
    empresa: entidade ? montarLinhaEmpresa(entidade.codigoContabilidade, entidade.razaoSocialContabilidade) : "",
    cliente: cliente?.nome ?? "",
    dataInicio,
    nome,
    funcao: adm.funcao ?? null,
    salario: formatarSalario(adm.salario, adm.tipo_salario),
    horario: adm.horario_trabalho ?? null,
    telefone,
    tempoContrato,
  });

  // Campos que o e-mail omitiria — só aviso, não bloqueia o envio.
  const avisos: string[] = [];
  const base = dados(tempoContratoSugerido);
  if (!base.nome) avisos.push("Nome do candidato não encontrado.");
  if (!base.dataInicio) avisos.push("Data de início não definida.");
  if (!base.empresa) avisos.push("Empresa (entidade contratante) não definida.");
  if (!base.cliente) avisos.push("Cliente não encontrado.");
  if (!base.funcao) avisos.push("Função não preenchida.");
  if (!base.salario) avisos.push("Salário não preenchido.");
  if (!base.horario) avisos.push("Horário não preenchido.");
  if (!base.telefone) avisos.push("Telefone não encontrado.");

  return {
    adm,
    nome,
    dados,
    tempoContratoSugerido,
    avisos,
    para: ((destinatarios ?? []) as { nome: string; email: string }[]).map((d) => d.email),
  };
}

// Tamanho do PDF sem baixar o arquivo (metadado da listagem do Storage). null = não deu para saber.
async function tamanhoDoPdf(svc: ServiceClient, path: string): Promise<number | null> {
  const barra = path.lastIndexOf("/");
  const pasta = barra >= 0 ? path.slice(0, barra) : "";
  const arquivo = barra >= 0 ? path.slice(barra + 1) : path;
  const { data } = await svc.storage.from("admissao-docs").list(pasta, { search: arquivo, limit: 20 });
  const item = (data ?? []).find((f) => f.name === arquivo);
  const size = (item?.metadata as { size?: number } | undefined)?.size;
  return typeof size === "number" ? size : null;
}

async function autenticar(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return { user: null, erro: acessoNegado };
  const bloqueioUnidade = await checarAcessoAdmissaoRH(user, id);
  if (bloqueioUnidade) return { user: null, erro: bloqueioUnidade };
  return { user, erro: null };
}

// Pré-visualização: nada é enviado nem gravado.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { user, erro } = await autenticar(id);
  if (!user) return erro;

  const svc = createServiceClient();
  const ctx = await carregarContexto(svc, id);
  if (!ctx) return NextResponse.json({ error: "Admissão não encontrada." }, { status: 404 });

  const dados = ctx.dados(ctx.tempoContratoSugerido);
  const linhas = montarLinhasDados(dados);
  const saudacao = saudacaoSaoPaulo();
  const pdfExiste = !!ctx.adm.pdf_pacote_path;
  const tamanho = pdfExiste ? await tamanhoDoPdf(svc, ctx.adm.pdf_pacote_path) : null;

  let ultimoEnvio: { em: string; por_nome: string | null; para: string | null } | null = null;
  if (ctx.adm.pacote_enviado_email_em) {
    const { data: perfil } = ctx.adm.pacote_enviado_email_por
      ? await svc.from("analistas_perfil").select("nome_completo").eq("user_id", ctx.adm.pacote_enviado_email_por).maybeSingle()
      : { data: null };
    ultimoEnvio = { em: ctx.adm.pacote_enviado_email_em, por_nome: perfil?.nome_completo ?? null, para: ctx.adm.pacote_enviado_email_para ?? null };
  }

  return NextResponse.json({
    assunto: semQuebraDeLinha(montarAssunto(dados.dataInicio, dados.nome)),
    saudacao,
    linhas,
    corpoHtml: montarHtmlEmail(saudacao, linhas),
    corpoTexto: montarTextoEmail(saudacao, linhas),
    para: ctx.para,
    cc: EMAIL_CONTABILIDADE_CC_FIXO,
    remetente: obterRemetente("contabilidade"),
    pdfExiste,
    nomeAnexo: nomeArquivoAnexo(ctx.nome),
    tamanhoPdfBytes: tamanho,
    limiteAnexoBytes: LIMITE_ANEXO_EMAIL_BYTES,
    tempoContratoSugerido: ctx.tempoContratoSugerido,
    avisos: ctx.avisos,
    ultimoEnvio,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { user, erro } = await autenticar(id);
  if (!user) return erro;

  const parsed = parseBody(admissaoEnviarEmailContabilidadeSchema, await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const reenviar = parsed.data.reenviar === true;

  const svc = createServiceClient();
  const ctx = await carregarContexto(svc, id);
  if (!ctx) return NextResponse.json({ error: "Admissão não encontrada." }, { status: 404 });

  if (!ctx.adm.pdf_pacote_path) {
    return NextResponse.json({ error: "O pacote para a contabilidade ainda não foi gerado. Gere o pacote antes de enviar por e-mail." }, { status: 400 });
  }
  if (ctx.para.length === 0) {
    return NextResponse.json({ error: "Nenhum destinatário ativo cadastrado. Configure em Configurações > Avisos > E-mail da contabilidade (Admissões)." }, { status: 400 });
  }
  if (!podeEnviarAgora(ctx.adm.pacote_enviado_email_em, reenviar)) {
    return NextResponse.json({ error: "Este pacote foi enviado há menos de 10 minutos. Para enviar de novo, marque \"Reenviar mesmo assim\"." }, { status: 409 });
  }

  // Baixa o PDF já gerado (nunca gera de novo).
  const { data: arquivo, error: dlErr } = await svc.storage.from("admissao-docs").download(ctx.adm.pdf_pacote_path);
  if (dlErr || !arquivo) {
    return NextResponse.json({ error: "Não foi possível ler o PDF do pacote no armazenamento." }, { status: 500 });
  }
  const pdf = Buffer.from(await arquivo.arrayBuffer());
  if (pdf.length > LIMITE_ANEXO_EMAIL_BYTES) {
    return NextResponse.json(
      { error: `O pacote tem ${formatarMB(pdf.length)} MB e passa do limite de ${formatarMB(LIMITE_ANEXO_EMAIL_BYTES).replace(",0", "")} MB para e-mail. Baixe o PDF e envie manualmente.` },
      { status: 413 }
    );
  }

  // O tempo de contrato editado no modal vale só para este e-mail (não grava em candidatos_vagas).
  const tempoContrato = resolverTempoContrato(parsed.data.tempoContrato, ctx.tempoContratoSugerido);
  const dados = ctx.dados(tempoContrato);
  const assunto = semQuebraDeLinha(montarAssunto(dados.dataInicio, dados.nome));
  const html = montarHtmlEmail(saudacaoSaoPaulo(), montarLinhasDados(dados));
  const para = ctx.para.join(", ");

  const resultado = await sendEmail({
    to: para,
    cc: EMAIL_CONTABILIDADE_CC_FIXO.join(", "),
    subject: assunto,
    html,
    tipo: "pacote_contabilidade",
    transporte: "contabilidade",
    attachments: [{ filename: nomeArquivoAnexo(ctx.nome), content: pdf, contentType: "application/pdf" }],
  });
  // Falhou: nada é gravado na admissão (sendEmail já registrou o erro em email_logs).
  if (!resultado.success) {
    return NextResponse.json({ error: "Não foi possível enviar o e-mail. Tente novamente em instantes ou envie manualmente." }, { status: 502 });
  }

  // Só depois do envio aceito pelo SMTP. Não altera admissoes.status.
  const { error: updErr } = await svc
    .from("admissoes")
    .update({ pacote_enviado_email_em: new Date().toISOString(), pacote_enviado_email_por: user.id, pacote_enviado_email_para: para })
    .eq("id", id);
  if (updErr) console.error("[POST /api/admissoes/[id]/pacote/enviar-email] E-mail enviado, mas o registro do envio falhou:", updErr.message);

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_pacote_enviado_email",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { para: ctx.para, cc: EMAIL_CONTABILIDADE_CC_FIXO, reenvio: reenviar },
  });

  return NextResponse.json({
    success: true,
    para: ctx.para,
    cc: EMAIL_CONTABILIDADE_CC_FIXO,
    ...(updErr ? { aviso: "E-mail enviado, mas não foi possível registrar o envio na admissão." } : {}),
  });
}
