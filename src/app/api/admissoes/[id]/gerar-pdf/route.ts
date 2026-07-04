import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PDFDocument, PageSizes } from "pdf-lib";
import { registrarAuditoria } from "@/lib/audit";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { PdfWriter, PW, PH, ML, safe, BLACK, YELLOW, DARK, GRAY } from "@/lib/pdfWriter";
import { desenharFichaCadastral, desenharAutorizacaoSindical, desenharSolicitacaoValeTransporte } from "@/lib/admissaoDocumentosPdf";
import { ENTIDADES_CONTRATANTES } from "@/lib/constants";
import type { AdmissaoDadosPessoais, AdmissaoDependente, AdmissaoDocumento } from "@/types";

interface Params { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: admissao, error: admError } = await svc
    .from("admissoes")
    .select("*, candidatos(nome_completo, cargo_pretendido), vagas(titulo, cliente_id, clientes(nome, entidade_contratante))")
    .eq("id", id)
    .single();
  if (admError) return NextResponse.json({ error: admError.message }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaCliente = (admissao.vagas as any)?.clientes as { nome: string; entidade_contratante: string | null } | null;
  const entidadeContratanteValue = (admissao as any).entidade_contratante ?? vagaCliente?.entidade_contratante ?? null;

  if (!vagaCliente) {
    return NextResponse.json(
      { error: "Não é possível gerar o pacote: esta admissão não tem uma vaga com cliente vinculado. Verifique o cadastro da vaga antes de continuar." },
      { status: 400 }
    );
  } else if (!entidadeContratanteValue) {
    return NextResponse.json(
      { error: "Não é possível gerar o pacote: esta admissão não tem entidade contratante (CNPJ) definida. Isso deveria ter sido preenchido ao iniciar a admissão." },
      { status: 400 }
    );
  }
  const entidade = ENTIDADES_CONTRATANTES.find((e) => e.value === entidadeContratanteValue);

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }, { data: valeTransporte }, { data: autorizacaoSindical }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_vale_transporte").select("*, admissao_vt_linhas(*)").eq("admissao_id", id).order("ordem", { referencedTable: "admissao_vt_linhas", ascending: true }).maybeSingle(),
    svc.from("admissao_autorizacao_sindical").select("*").eq("admissao_id", id).maybeSingle(),
  ]);

  const dp = (dadosPessoais ?? {}) as Partial<AdmissaoDadosPessoais>;
  const deps = (dependentes ?? []) as AdmissaoDependente[];
  const docs = (documentos ?? []) as AdmissaoDocumento[];

  const obrigatoriosPendentes = docs.filter((d) => d.obrigatorio && d.status !== "aprovado");
  if (obrigatoriosPendentes.length > 0) {
    const labels = obrigatoriosPendentes.map(
      (d) => DOCUMENTOS_ADMISSAO.find((def) => def.tipo_documento === d.tipo_documento)?.label ?? d.tipo_documento
    );
    return NextResponse.json(
      {
        error: `Não é possível gerar o pacote: ${obrigatoriosPendentes.length} documento(s) obrigatório(s) ainda não foram aprovados: ${labels.join(", ")}`,
        pendentes: labels,
      },
      { status: 400 }
    );
  }

  const pdfDoc = await PDFDocument.create();
  const w = await PdfWriter.create(pdfDoc);

  // ── Cover ──────────────────────────────────────────────────
  w.page.drawRectangle({ x: 0, y: PH - 110, width: PW, height: 110, color: BLACK });
  w.page.drawText("SALMAZOS RH", { x: ML, y: PH - 52, size: 30, font: w.bold, color: YELLOW });
  w.page.drawText("Pacote de Admissão", { x: ML, y: PH - 75, size: 11, font: w.regular, color: YELLOW });
  w.y = PH - 140;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatoNome = (admissao.candidatos as any)?.nome_completo ?? dp.nome_completo ?? "—";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaTitulo = (admissao.vagas as any)?.titulo ?? "—";
  w.drawText(candidatoNome, w.bold, 20, DARK);
  w.drawField("Vaga", vagaTitulo);
  w.drawField("Modalidade", admissao.modalidade === "MOT" ? "Mão de Obra Temporária" : "Terceirização");
  w.drawField("Data de geração", new Date().toLocaleDateString("pt-BR"));

  // ── Dados pessoais ─────────────────────────────────────────
  w.sectionTitle("Dados Pessoais");
  w.drawField("Nome completo", dp.nome_completo);
  w.drawField("Data de nascimento", dp.data_nascimento);
  w.drawField("Sexo", dp.sexo === "M" ? "Masculino" : dp.sexo === "F" ? "Feminino" : "");
  w.drawField("Estado civil", dp.estado_civil);
  w.drawField("Nacionalidade", dp.nacionalidade);
  w.drawField("Naturalidade", dp.naturalidade);
  w.drawField("CPF", dp.cpf);
  w.drawField("RG", [dp.rg_numero, dp.rg_orgao_emissor, dp.rg_uf].filter(Boolean).join(" / "));
  w.drawField("RG - Data emissão", dp.rg_data_emissao);
  w.drawField("Nome da mãe", dp.nome_mae);
  w.drawField("Nome do pai", dp.nome_pai);
  w.drawField("Grau de instrução", dp.grau_instrucao);

  // ── Documentos profissionais ───────────────────────────────
  w.sectionTitle("Documentos Profissionais");
  w.drawField("PIS/PASEP", dp.pis_pasep);
  w.drawField("CTPS", [dp.carteira_trabalho_numero, dp.carteira_trabalho_serie, dp.carteira_trabalho_uf].filter(Boolean).join(" / "));
  w.drawField("Título de eleitor", dp.titulo_eleitor);
  w.drawField("Zona / Seção eleitoral", [dp.zona_eleitoral, dp.secao_eleitoral].filter(Boolean).join(" / "));
  w.drawField("Reservista", dp.reservista);
  w.drawField("CNH", dp.cnh_numero ? `${dp.cnh_numero} — Cat. ${dp.cnh_categoria ?? "—"} — Val. ${dp.cnh_validade ?? "—"}` : "");

  // ── Endereço e contato ─────────────────────────────────────
  w.sectionTitle("Endereço e Contato");
  w.drawField("CEP", dp.endereco_cep);
  w.drawField("Logradouro", [dp.endereco_logradouro, dp.endereco_numero, dp.endereco_complemento].filter(Boolean).join(", "));
  w.drawField("Bairro / Cidade / UF", [dp.endereco_bairro, dp.endereco_cidade, dp.endereco_uf].filter(Boolean).join(" / "));
  w.drawField("Telefone", dp.telefone);
  w.drawField("E-mail", dp.email);

  // ── Dados bancários ────────────────────────────────────────
  w.sectionTitle("Dados Bancários");
  w.drawField("Banco", dp.banco);
  w.drawField("Agência", dp.agencia);
  w.drawField("Conta", dp.conta);
  w.drawField("Tipo de conta", dp.tipo_conta === "corrente" ? "Conta Corrente" : dp.tipo_conta === "poupanca" ? "Conta Poupança" : "");

  // ── Dependentes ────────────────────────────────────────────
  if (deps.length > 0) {
    w.sectionTitle("Dependentes");
    for (const dep of deps) {
      w.drawText(`${dep.nome} (${dep.parentesco ?? "—"})`, w.bold, 10, DARK);
      w.drawField("Data de nascimento", dep.data_nascimento);
      w.drawField("CPF", dep.cpf);
      if (dep.nome_mae) w.drawField("Nome da mãe", dep.nome_mae);
      w.y -= 6;
    }
  }

  // ── Documentos formais para assinatura ──────────────────────
  // Anexados ao mesmo pacote (não geramos um PDF separado): esses 3 documentos só
  // fazem sentido depois que a documentação toda já foi aprovada — que é exatamente
  // o momento em que este pacote é gerado — então reusar o mesmo botão/link "Ver
  // pacote gerado" já existente é o comportamento certo, sem precisar de UI nova.
  desenharFichaCadastral(
    w,
    {
      funcao: admissao.funcao,
      salario: admissao.salario,
      horario_trabalho: admissao.horario_trabalho,
      data_admissao: admissao.data_admissao,
      ...dp,
      empresa_cliente: vagaCliente?.nome ?? null,
      opta_vale_transporte: valeTransporte?.opcao ?? null,
      autoriza_sindical: autorizacaoSindical?.autoriza_sindical ?? null,
      possui_dependentes: deps.length > 0,
    },
    deps
  );

  desenharAutorizacaoSindical(w, {
    nome_completo: dp.nome_completo,
    cpf: dp.cpf,
    rg_numero: dp.rg_numero,
    carteira_trabalho_numero: dp.carteira_trabalho_numero,
    carteira_trabalho_serie: dp.carteira_trabalho_serie,
    nome_sindicato: autorizacaoSindical?.nome_sindicato ?? null,
    autoriza_assistencial_confederativa: autorizacaoSindical?.autoriza_assistencial_confederativa ?? null,
    autoriza_sindical: autorizacaoSindical?.autoriza_sindical ?? null,
    empresa_razao_social: entidade?.razaoSocial ?? null,
    empresa_cnpj: entidade?.cnpj ?? null,
  });

  desenharSolicitacaoValeTransporte(w, {
    nome_completo: dp.nome_completo,
    cpf: dp.cpf,
    funcao: admissao.funcao,
    carteira_trabalho_numero: dp.carteira_trabalho_numero,
    carteira_trabalho_serie: dp.carteira_trabalho_serie,
    data_admissao: admissao.data_admissao,
    empresa_cliente: vagaCliente?.nome ?? null,
    banco: dp.banco,
    agencia: dp.agencia,
    conta: dp.conta,
    pix: dp.pix,
    endereco_logradouro: dp.endereco_logradouro,
    endereco_numero: dp.endereco_numero,
    endereco_bairro: dp.endereco_bairro,
    endereco_cidade: dp.endereco_cidade,
    endereco_uf: dp.endereco_uf,
    endereco_cep: dp.endereco_cep,
    horario_trabalho: admissao.horario_trabalho,
    opcao: valeTransporte?.opcao ?? null,
    dias_semana: valeTransporte?.dias_semana ?? null,
    bairro_cidade_trabalho: valeTransporte?.bairro_cidade_trabalho ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linhas: ((valeTransporte as any)?.admissao_vt_linhas ?? []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    termos_aceitos_em: (valeTransporte as any)?.termos_aceitos_em ?? null,
  });

  // ── Documentos anexados (imagens/PDFs incorporados) ─────────
  const naoEmbutidos: string[] = [];
  for (const doc of docs) {
    if (!doc.storage_path) continue;
    const label = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento)?.label ?? doc.tipo_documento;

    const { data: fileBlob, error: dlError } = await svc.storage.from("admissao-docs").download(doc.storage_path);
    if (dlError || !fileBlob) { naoEmbutidos.push(label); continue; }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const ext = doc.storage_path.split(".").pop()?.toLowerCase() ?? "";

    try {
      if (ext === "jpg" || ext === "jpeg") {
        const img = await pdfDoc.embedJpg(bytes);
        const docPage = pdfDoc.addPage(PageSizes.A4);
        docPage.drawText(label, { x: ML, y: PH - ML, size: 12, font: w.bold, color: DARK });
        const scale = Math.min((PW - ML * 2) / img.width, (PH - ML * 2 - 30) / img.height, 1);
        docPage.drawImage(img, { x: ML, y: ML, width: img.width * scale, height: img.height * scale });
      } else if (ext === "png") {
        const img = await pdfDoc.embedPng(bytes);
        const docPage = pdfDoc.addPage(PageSizes.A4);
        docPage.drawText(label, { x: ML, y: PH - ML, size: 12, font: w.bold, color: DARK });
        const scale = Math.min((PW - ML * 2) / img.width, (PH - ML * 2 - 30) / img.height, 1);
        docPage.drawImage(img, { x: ML, y: ML, width: img.width * scale, height: img.height * scale });
      } else if (ext === "pdf") {
        const subDoc = await PDFDocument.load(bytes);
        const copiedPages = await pdfDoc.copyPages(subDoc, subDoc.getPageIndices());
        copiedPages.forEach((p) => pdfDoc.addPage(p));
      } else {
        // HEIC e outros formatos não suportados nativamente pelo pdf-lib
        naoEmbutidos.push(label);
      }
    } catch {
      naoEmbutidos.push(label);
    }
  }

  if (naoEmbutidos.length > 0) {
    w.newPage();
    w.drawText("Documentos não incorporados automaticamente", w.bold, 12, DARK);
    w.drawText("(formato não suportado — baixe o arquivo original no painel)", w.regular, 9, GRAY);
    w.y -= 6;
    for (const label of naoEmbutidos) w.drawText(`• ${label}`, w.regular, 10, DARK);
  }

  const pdfBytes = await pdfDoc.save();

  const uploadPath = `pacotes-contabilidade/${id}/pacote-${Date.now()}.pdf`;
  const { error: uploadError } = await svc.storage
    .from("admissao-docs")
    .upload(uploadPath, Buffer.from(pdfBytes), { contentType: "application/pdf" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const geradoEm = new Date().toISOString();
  await svc
    .from("admissoes")
    .update({
      status: "enviado_contabilidade",
      pdf_pacote_path: uploadPath,
      pdf_pacote_gerado_em: geradoEm,
      pdf_pacote_gerado_por: user.id,
    })
    .eq("id", id);

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_pacote_gerado",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { storage_path: uploadPath, documentos_nao_incorporados: naoEmbutidos },
  });

  const slug = safe(candidatoNome).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="admissao-${slug}.pdf"`,
      "Content-Length": String(pdfBytes.length),
    },
  });
}
