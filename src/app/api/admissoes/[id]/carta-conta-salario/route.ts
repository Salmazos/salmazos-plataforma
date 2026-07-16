import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, admissaoCartaBancoSchema } from "@/lib/schemas";
import { PdfWriter, embutirImagemComprimida } from "@/lib/pdfWriter";
import { desenharCartaAberturaContaSalario } from "@/lib/admissaoDocumentosPdf";
import { ENDERECO_FISCAL_SALMAZOS } from "@/lib/admissaoConstants";
import { ENTIDADES_CONTRATANTES } from "@/lib/constants";
import { sendEmail } from "@/lib/sendEmail";
import { escapeHtml } from "@/lib/emailAniversarioTemplate";
import { getConfiguracoesGerais } from "@/lib/configuracoesGerais";
import type { AdmissaoDadosPessoais, AdmissaoDocumento } from "@/types";

interface Params { params: Promise<{ id: string }> }

const BUCKET = "admissao-docs";
const CHAVE_RESPONSAVEL_RH = "carta_conta_salario_responsavel_rh_user_id";

// Busca o responsável pelo RH designado em Configurações e embute a assinatura dele
// (PNG enviado em Meu Perfil) no PDFDocument — retorna null (sem quebrar a carta) se
// não houver responsável designado, se ele não tiver assinatura cadastrada, ou se o
// download/embed falhar por qualquer motivo.
async function resolverAssinaturaResponsavel(
  svc: ReturnType<typeof createServiceClient>,
  pdfDoc: PDFDocument
) {
  try {
    const config = await getConfiguracoesGerais([CHAVE_RESPONSAVEL_RH]);
    const responsavelUserId = config[CHAVE_RESPONSAVEL_RH];
    if (!responsavelUserId) return null;

    const { data: perfil } = await svc
      .from("analistas_perfil")
      .select("assinatura_url")
      .eq("user_id", responsavelUserId)
      .maybeSingle();
    if (!perfil?.assinatura_url) return null;

    const res = await fetch(perfil.assinatura_url);
    if (!res.ok) {
      console.error(`[carta-conta-salario] Falha ao baixar assinatura do responsável RH: HTTP ${res.status}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return await pdfDoc.embedPng(bytes);
  } catch (err) {
    console.error("[carta-conta-salario] Falha ao carregar assinatura do responsável RH:", err);
    return null;
  }
}

// Baixa um documento da admissão e o anexa como página cheia — imagem comprimida
// (reaproveitando embutirImagemComprimida) ou páginas de PDF copiadas diretamente.
async function anexarDocumentoPaginaCheia(
  svc: ReturnType<typeof createServiceClient>,
  pdfDoc: PDFDocument,
  w: PdfWriter,
  storagePath: string,
  label: string
): Promise<boolean> {
  const { data: fileBlob, error: dlError } = await svc.storage.from(BUCKET).download(storagePath);
  if (dlError || !fileBlob) {
    console.error(`[carta-conta-salario] Falha ao baixar ${label}:`, dlError?.message);
    return false;
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";

  try {
    if (ext === "jpg" || ext === "jpeg" || ext === "png") {
      const img = await embutirImagemComprimida(pdfDoc, bytes, ext);
      w.drawImagemPagina(img);
      return true;
    } else if (ext === "pdf") {
      const subDoc = await PDFDocument.load(bytes);
      const copiedPages = await pdfDoc.copyPages(subDoc, subDoc.getPageIndices());
      copiedPages.forEach((p) => pdfDoc.addPage(p));
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[carta-conta-salario] Falha ao anexar ${label}:`, err);
    return false;
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(admissaoCartaBancoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const preview = parsed.data.preview === true;
  const forcar = parsed.data.forcar === true;
  const justificativa = parsed.data.justificativa?.trim() || null;
  const para = parsed.data.para?.trim() ?? "";
  const cc = parsed.data.cc?.trim() ?? "";
  const bancoParceiroId = parsed.data.banco_parceiro_id ?? null;

  const svc = createServiceClient();

  const { data: admissao, error: admError } = await svc
    .from("admissoes")
    .select("*, vagas(cliente_id, clientes(entidade_contratante))")
    .eq("id", id)
    .single();
  if (admError) return NextResponse.json({ error: admError.message }, { status: 404 });

  if (admissao.modalidade !== "MOT" && admissao.modalidade !== "terceirizacao") {
    return NextResponse.json(
      { error: "Esta funcionalidade só está disponível para admissões de MOT ou terceirização." },
      { status: 400 }
    );
  }

  if (!admissao.funcao || admissao.salario == null) {
    return NextResponse.json(
      { error: "Preencha função e salário desta admissão antes de gerar a carta." },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaCliente = (admissao.vagas as any)?.clientes as { entidade_contratante: string | null } | null;
  const entidadeContratanteValue = (admissao as any).entidade_contratante ?? vagaCliente?.entidade_contratante ?? null;
  if (!entidadeContratanteValue) {
    return NextResponse.json(
      { error: "Esta admissão não tem entidade contratante (CNPJ) definida." },
      { status: 400 }
    );
  }
  const entidade = ENTIDADES_CONTRATANTES.find((e) => e.value === entidadeContratanteValue);

  const [{ data: dadosPessoais }, { data: documentos }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).in("tipo_documento", ["rg", "comprovante_endereco"]),
  ]);

  const dp = (dadosPessoais ?? {}) as Partial<AdmissaoDadosPessoais>;
  const docs = (documentos ?? []) as AdmissaoDocumento[];
  const docRg = docs.find((d) => d.tipo_documento === "rg");
  const docComprovante = docs.find((d) => d.tipo_documento === "comprovante_endereco");

  if (!docRg || docRg.status !== "aprovado" || !docRg.storage_path) {
    return NextResponse.json({ error: "O RG desta admissão ainda não foi aprovado." }, { status: 400 });
  }
  if (!docComprovante || docComprovante.status !== "aprovado" || !docComprovante.storage_path) {
    return NextResponse.json({ error: "O comprovante de endereço desta admissão ainda não foi aprovado." }, { status: 400 });
  }

  // Nome e telefone SEMPRE de admissao_dados_pessoais — é o dado oficial confirmado
  // pelo candidato no formulário de admissão. candidatos.nome_completo/telefone podem
  // vir de extração automática de currículo (não confiável para um documento formal
  // enviado a terceiros) e por isso nunca são usados aqui, mesmo como fallback.
  const nomeCompleto = dp.nome_completo || "—";
  const telefone = dp.telefone || null;

  if (!preview && admissao.carta_banco_enviada_em && !forcar) {
    return NextResponse.json(
      {
        error: `Esta carta já foi enviada em ${new Date(admissao.carta_banco_enviada_em).toLocaleString("pt-BR")}. Use "Forçar reenvio" com justificativa se precisar enviar novamente.`,
        ja_enviada_em: admissao.carta_banco_enviada_em,
      },
      { status: 400 }
    );
  }

  // Snapshot do nome do banco no momento do envio — resiliente a uma renomeação futura
  // do cadastro, sem precisar de join pra exibir o histórico depois.
  let bancoParceiroNome: string | null = null;
  if (!preview && bancoParceiroId) {
    const { data: banco } = await svc
      .from("bancos_parceiros")
      .select("nome")
      .eq("id", bancoParceiroId)
      .maybeSingle();
    if (!banco) {
      return NextResponse.json({ error: "Banco parceiro não encontrado. Selecione novamente." }, { status: 400 });
    }
    bancoParceiroNome = banco.nome;
  }

  // ── Gera o PDF de 3 páginas: carta + RG + comprovante de endereço ─────────
  const pdfDoc = await PDFDocument.create();
  // criarPaginaInicial=false: desenharCartaAberturaContaSalario já chama w.newPage()
  // sozinha (mesmo padrão de desenharFichaCadastral/etc.) — evitaria uma página 1 em branco.
  const w = await PdfWriter.create(pdfDoc, false);
  const assinaturaImg = await resolverAssinaturaResponsavel(svc, pdfDoc);

  desenharCartaAberturaContaSalario(w, {
    nome_completo: nomeCompleto,
    telefone,
    data_admissao: admissao.data_admissao,
    funcao: admissao.funcao,
    entidade_razao_social: entidade?.razaoSocial ?? null,
    entidade_cnpj: entidade?.cnpj ?? null,
    endereco_fiscal: ENDERECO_FISCAL_SALMAZOS,
    salario: admissao.salario,
    // Dados de PORTABILIDADE (não o cadastro bancário geral banco/agencia/conta) — só
    // entram na carta se o candidato explicitamente optou por portar o salário; senão o
    // bloco "Dados para portabilidade:" simplesmente não aparece.
    banco_portabilidade: dp.deseja_portabilidade_salario ? dp.banco_portabilidade : null,
    agencia_portabilidade: dp.deseja_portabilidade_salario ? dp.agencia_portabilidade : null,
    conta_portabilidade: dp.deseja_portabilidade_salario ? dp.conta_portabilidade : null,
    tipo_conta_portabilidade: dp.deseja_portabilidade_salario ? dp.tipo_conta_portabilidade : null,
    assinaturaImg,
  });

  const rgAnexado = await anexarDocumentoPaginaCheia(svc, pdfDoc, w, docRg.storage_path, "RG");
  if (!rgAnexado) {
    return NextResponse.json(
      { error: "Não foi possível anexar o RG ao PDF. Verifique o arquivo no painel e tente novamente." },
      { status: 500 }
    );
  }

  const comprovanteAnexado = await anexarDocumentoPaginaCheia(svc, pdfDoc, w, docComprovante.storage_path, "comprovante de endereço");
  if (!comprovanteAnexado) {
    return NextResponse.json(
      { error: "Não foi possível anexar o comprovante de endereço ao PDF. Verifique o arquivo no painel e tente novamente." },
      { status: 500 }
    );
  }

  const pdfBytes = await pdfDoc.save();
  const slug = nomeCompleto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);

  if (preview) {
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBytes.length),
      },
    });
  }

  // ── Envio real: upload de auditoria + e-mail com anexo ────────────────────
  const uploadPath = `cartas-conta-salario/${id}/carta-${Date.now()}.pdf`;
  const { error: uploadError } = await svc.storage
    .from(BUCKET)
    .upload(uploadPath, Buffer.from(pdfBytes), { contentType: "application/pdf" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const subject = `Abertura de conta salário - Salmazos RH - ${nomeCompleto}`;
  const html = `<p style="font-size:14px;color:#111827;font-family:Arial,sans-serif">Segue em anexo a solicitação de abertura de conta salário para ${escapeHtml(nomeCompleto)}.</p>`;

  const resultadoEnvio = await sendEmail({
    to: para,
    cc: cc || undefined,
    subject,
    html,
    tipo: "carta_abertura_conta",
    attachments: [
      { filename: `carta-conta-salario-${slug}.pdf`, content: Buffer.from(pdfBytes), contentType: "application/pdf" },
    ],
  });

  if (!resultadoEnvio.success) {
    return NextResponse.json({ error: resultadoEnvio.error || "Falha ao enviar o e-mail." }, { status: 500 });
  }

  const jaEnviadaAntes = Boolean(admissao.carta_banco_enviada_em);
  const enviadaEm = new Date().toISOString();

  await svc
    .from("admissoes")
    .update({
      carta_banco_path: uploadPath,
      carta_banco_enviada_em: enviadaEm,
      carta_banco_enviada_por: user.id,
      carta_banco_id: bancoParceiroId,
      carta_banco_nome: bancoParceiroNome,
    })
    .eq("id", id);

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: jaEnviadaAntes ? "admissao_carta_conta_salario_reenviada_forcada" : "admissao_carta_conta_salario_enviada",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: {
      storage_path: uploadPath,
      para,
      cc: cc || null,
      banco_parceiro_id: bancoParceiroId,
      banco_parceiro_nome: bancoParceiroNome,
      ...(jaEnviadaAntes ? { forcado: true, justificativa, enviada_anteriormente_em: admissao.carta_banco_enviada_em } : {}),
    },
  });

  return NextResponse.json({ ok: true, enviada_em: enviadaEm });
}
