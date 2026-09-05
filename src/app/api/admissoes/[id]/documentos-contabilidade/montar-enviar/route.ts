import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes, ehCargoDiretoria } from "@/lib/admissaoAuth";
import { parseBody, admissaoContabilidadeMontarEnviarSchema } from "@/lib/schemas";
import { documentosParaCliente, documentosObrigatorios } from "@/lib/contabilidadeDocumentosMatch";
import { criarDocumentoComPosicionamento, type RubricaExtra } from "@/lib/zapsign";
import { POSICOES_POR_TIPO_DOCUMENTO } from "@/lib/zapsignPosicoes";
import type { AncoraDetectada } from "@/lib/pdfAnchors";
import { registrarAuditoria } from "@/lib/audit";
import type { AdmissaoDocumentoContabilidade } from "@/types";

interface Params { params: Promise<{ id: string }> }

const BUCKET = "admissao-docs";
const TIPO_PACOTE = "contabilidade" as const;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(admissaoContabilidadeMontarEnviarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { nomeCandidato, emailCandidato, contratanteSelecionadoId } = parsed.data;

  const svc = createServiceClient();

  const { data: admissao, error: admError } = await svc
    .from("admissoes")
    .select("id, vaga_id, data_admissao, vagas(cliente_id)")
    .eq("id", id)
    .single();
  if (admError || !admissao) return NextResponse.json({ error: "Admissão não encontrada." }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clienteId: string | null = (admissao as any).vagas?.cliente_id ?? null;
  const documentosDoCliente = documentosParaCliente(clienteId);

  const { data: envelopeExistente } = await svc
    .from("admissao_envelopes_assinatura")
    .select("id, status")
    .eq("admissao_id", id)
    .eq("tipo_pacote", TIPO_PACOTE)
    .maybeSingle();
  if (envelopeExistente?.status === "pendente") {
    return NextResponse.json(
      { error: "Já existe uma solicitação de assinatura eletrônica em andamento para o pacote da contabilidade desta admissão." },
      { status: 409 }
    );
  }

  const { data: documentos } = await svc.from("admissao_documentos_contabilidade").select("*").eq("admissao_id", id);

  const docs = (documentos ?? []) as AdmissaoDocumentoContabilidade[];
  const docsPorTipo = new Map(docs.map((d) => [d.tipo_documento, d]));

  // Mesma regra usada na tela de conferência (ver contabilidadeDocumentosMatch.ts) —
  // revalidada aqui pra nunca montar/enviar um pacote incompleto, mesmo que a UI tenha
  // deixado passar ou a chamada tenha vindo direto da API. Só os 4 fixos são obrigatórios
  // — Ficha de IR, Salário Família e Termo de Responsabilidade nunca bloqueiam o envio.
  const faltando = documentosObrigatorios(clienteId).filter((d) => d.obrigatorio && !docsPorTipo.has(d.tipo_documento));
  if (faltando.length > 0) {
    const labelsFaltando = faltando.map((d) => d.label);
    return NextResponse.json(
      { error: `Documentos obrigatórios faltando: ${labelsFaltando.join(", ")}.`, faltando: labelsFaltando },
      { status: 400 }
    );
  }

  // ── Contratante: analista logado (se diretor) ou diretor delegado ───────────────────
  // ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O NEGÓCIO: só quem tem cargo de diretoria
  // (analistas_perfil.cargo em CARGOS_DIRETORIA, ver lib/admissaoAuth.ts) pode assinar
  // pela empresa como "Contratante" — não é mais "qualquer analista que processa a
  // admissão". Quem processa mas não é diretor precisa delegar pra um diretor ativo (ver
  // GET /api/admissoes/documentos-contabilidade/diretores-disponiveis, consumido pelo
  // seletor em ModalUploadDocumentosContabilidade.tsx).
  let operadorEhContratante = false;
  let perfilOperadorNome: string | null = null;

  const { data: perfilOperador, error: perfilError } = await svc
    .from("analistas_perfil")
    .select("nome_completo, cpf, email, cargo")
    .eq("user_id", user.id)
    .single();
  if (perfilError || !perfilOperador) {
    return NextResponse.json({ error: "Perfil de analista não encontrado para o usuário autenticado." }, { status: 404 });
  }
  perfilOperadorNome = perfilOperador.nome_completo;

  let perfilContratante: { nome_completo: string; cpf: string | null; email: string };

  if (ehCargoDiretoria(perfilOperador.cargo)) {
    operadorEhContratante = true;
    perfilContratante = perfilOperador;
  } else {
    if (!contratanteSelecionadoId) {
      return NextResponse.json(
        { error: "Selecione quem vai assinar pela empresa antes de enviar.", requerSelecaoContratante: true },
        { status: 400 }
      );
    }
    const { data: diretorEscolhido, error: diretorError } = await svc
      .from("analistas_perfil")
      .select("nome_completo, cpf, email, cargo, ativo")
      .eq("id", contratanteSelecionadoId)
      .single();
    // Revalida cargo + ativo no servidor mesmo que a lista já tenha vindo filtrada da
    // GET diretores-disponiveis — o id pode estar desatualizado (diretor desativado ou
    // com cargo alterado entre a busca da lista e o envio do formulário).
    if (diretorError || !diretorEscolhido || !diretorEscolhido.ativo || !ehCargoDiretoria(diretorEscolhido.cargo)) {
      return NextResponse.json({ error: "Signatário selecionado não é um diretor ativo válido." }, { status: 400 });
    }
    perfilContratante = diretorEscolhido;
  }

  // cpf é nullable em analistas_perfil (nem todo mundo preencheu) — nunca manda CPF
  // vazio pra API da ZapSign, bloqueia com mensagem acionável em vez disso.
  if (!perfilContratante.cpf || !perfilContratante.cpf.trim()) {
    return NextResponse.json(
      {
        error: `Complete o CPF de ${perfilContratante.nome_completo} no perfil antes de assinar documentos pela empresa.`,
        cpfAusente: true,
      },
      { status: 409 }
    );
  }
  const contratanteDinamico = {
    nome: perfilContratante.nome_completo,
    cpf: perfilContratante.cpf,
    email: perfilContratante.email,
  };

  // ── Monta o PDF final na ordem fixa dos 7 tipos, pulando os condicionais ausentes ──
  // Mesmo mecanismo de merge já usado em gerar-pdf/route.ts e carta-conta-salario/route.ts:
  // PDFDocument.load + copyPages sobre cada PDF individual já existente. Aproveitamos o
  // mesmo loop pra montar a lista de âncoras ZapSign (ver lib/zapsignPosicoes.ts): cada
  // tipo de documento tem uma posição fixa por página LOCAL (dentro do próprio arquivo);
  // somamos um offset acumulado pra converter em página ABSOLUTA no PDF final combinado.
  const pdfFinal = await PDFDocument.create();
  const naoAnexados: string[] = [];
  const ancorasZapSign: AncoraDetectada[] = [];
  const rubricasExtras: RubricaExtra[] = [];
  const avisosPosicionamento: string[] = [];
  let offsetPaginas = 0;

  for (const def of documentosDoCliente) {
    const doc = docsPorTipo.get(def.tipo_documento);
    if (!doc) continue;

    const { data: fileBlob, error: dlError } = await svc.storage.from(BUCKET).download(doc.storage_path);
    if (dlError || !fileBlob) {
      naoAnexados.push(def.label);
      continue;
    }

    try {
      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      const subDoc = await PDFDocument.load(bytes);
      const paginasDoArquivo = subDoc.getPageIndices();
      const copiedPages = await pdfFinal.copyPages(subDoc, paginasDoArquivo);
      copiedPages.forEach((p) => pdfFinal.addPage(p));

      // Só usa a tabela fixa se o número de páginas do arquivo enviado bater exatamente
      // com o caso real calibrado (ver lib/zapsignPosicoes.ts) — nunca decide "no escuro"
      // se o arquivo desta vez tem uma página a mais/menos (ex: variação do modelo que a
      // contabilidade não avisou). Nesse caso, TODAS as páginas desse tipo caem no
      // fallback de rubrica genérica em lib/zapsign.ts (mais seguro que aplicar
      // coordenadas calibradas pra outro layout).
      const posicoesDoTipo = POSICOES_POR_TIPO_DOCUMENTO[def.tipo_documento];
      if (posicoesDoTipo && posicoesDoTipo.length === paginasDoArquivo.length) {
        posicoesDoTipo.forEach((posicao, indiceLocal) => {
          const paginaAbsoluta = offsetPaginas + indiceLocal;
          if (posicao.tipo === "assinatura") {
            if (posicao.contratante) {
              ancorasZapSign.push({ pagina: paginaAbsoluta, papel: "contratante", ...posicao.contratante });
            }
            if (posicao.contratado) {
              ancorasZapSign.push({ pagina: paginaAbsoluta, papel: "contratado", ...posicao.contratado });
            }
            return;
          }
          // tipo === "rubrica": só gera override quando a definição traz coordenada
          // própria (ver lib/zapsignPosicoes.ts) — sem isso, cai no fallback padrão
          // (RUBRICA_POSICAO_PADRAO) em lib/zapsign.ts, como sempre foi.
          if (posicao.contratante) {
            rubricasExtras.push({ pagina: paginaAbsoluta, papel: "contratante", ...posicao.contratante });
          }
          if (posicao.contratado) {
            rubricasExtras.push({ pagina: paginaAbsoluta, papel: "contratado", ...posicao.contratado });
          }
        });
      } else if (posicoesDoTipo) {
        avisosPosicionamento.push(
          `${def.label}: esperava ${posicoesDoTipo.length} página(s), arquivo enviado tem ${paginasDoArquivo.length} — posições fixas ignoradas, caiu no fallback de rubrica genérica para todas as páginas deste documento.`
        );
      }

      offsetPaginas += paginasDoArquivo.length;
    } catch {
      naoAnexados.push(def.label);
    }
  }

  if (naoAnexados.length > 0) {
    return NextResponse.json(
      { error: `Não foi possível abrir os seguintes arquivos como PDF: ${naoAnexados.join(", ")}. Reenvie-os antes de montar o pacote.` },
      { status: 400 }
    );
  }

  if (avisosPosicionamento.length > 0) {
    console.warn("[POST /api/admissoes/[id]/documentos-contabilidade/montar-enviar] Divergência de páginas vs. tabela fixa de posições", avisosPosicionamento);
  }

  const pdfBytes = await pdfFinal.save();
  const uploadPath = `docs-contabilidade/${id}/pacote-final-${Date.now()}.pdf`;
  const { error: uploadError } = await svc.storage
    .from(BUCKET)
    .upload(uploadPath, Buffer.from(pdfBytes), { contentType: "application/pdf" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // ── Envia pra assinatura eletrônica via ZapSign ─────────────────────────────────────
  // 2 signatários (o analista logado pela empresa, ver bloco de contratante dinâmico
  // acima + o candidato) e posicionamento por tabela fixa de coordenadas em vez de
  // rubrica genérica em todas as páginas (ver lib/zapsignPosicoes.ts). Este pacote não
  // usa mais Clicksign de forma alguma (removida deste fluxo) — o outro fluxo de
  // assinatura da plataforma (card "Assinatura Admissão", ver ModalAssinaturaEletronica.tsx)
  // continua em Clicksign, sem relação com este.
  const provedor = "zapsign" as const;
  let documentoExternoId: string;
  let detalhesAuditoria: Record<string, unknown>;

  try {
    const resultado = await criarDocumentoComPosicionamento({
      nomeDocumento: `Admissão — Contabilidade — ${nomeCandidato}`,
      pdfBytes,
      contratante: contratanteDinamico,
      contratado: { nome: nomeCandidato, email: emailCandidato },
      ancoras: ancorasZapSign,
      totalPaginas: offsetPaginas,
      rubricasExtras,
    });
    documentoExternoId = resultado.documentToken;
    detalhesAuditoria = {
      document_token: resultado.documentToken,
      signer_token_contratante: resultado.signerTokenContratante,
      signer_token_contratado: resultado.signerTokenContratado,
      paginas_com_ancora: resultado.paginasComAncora,
      paginas_com_rubrica: resultado.paginasComRubrica,
      // Operador (quem processou/montou o pacote) vs. Contratante (quem assinou pela
      // empresa) — sempre a mesma pessoa quando o operador já é diretor, registrados
      // separadamente quando não são, pra rastreabilidade clara de delegação.
      operador_user_id: user.id,
      operador_nome: perfilOperadorNome,
      contratante_nome: contratanteDinamico.nome,
      contratante_delegado: !operadorEhContratante,
      ...(operadorEhContratante ? {} : { contratante_analista_id: contratanteSelecionadoId }),
      // Nome/e-mail exatos submetidos como "contratado" à ZapSign — sem isso não dava pra
      // confirmar depois qual e-mail foi de fato enviado (caso real: divergência entre
      // candidatos.email e admissao_dados_pessoais.email só foi possível reconstituir
      // comparando com o estado atual do banco, não com o que foi realmente submetido).
      contratado_nome: nomeCandidato,
      contratado_email: emailCandidato,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar documento na ZapSign.";
    console.error("[POST /api/admissoes/[id]/documentos-contabilidade/montar-enviar]", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: upsertError } = await svc
    .from("admissao_envelopes_assinatura")
    .upsert(
      {
        admissao_id: id,
        tipo_pacote: TIPO_PACOTE,
        documento_externo_id: documentoExternoId,
        status: "pendente",
        assinado_em: null,
        path: null,
        provedor,
      },
      { onConflict: "admissao_id,tipo_pacote" }
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  // Snapshot da data usada neste envio — permite a tela de detalhe avisar se
  // admissoes.data_admissao for editada depois (ver PATCH /dados-admissao) sem essa
  // reenvio ter acontecido de novo. Reenviar o pacote (chamando esta rota outra vez)
  // atualiza o snapshot e o aviso desaparece sozinho, sem precisar de ação manual extra.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await svc.from("admissoes").update({ data_admissao_documentos_gerados: (admissao as any).data_admissao ?? null }).eq("id", id);

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_documentos_contabilidade_montado_e_enviado",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: {
      storage_path: uploadPath,
      provedor,
      ...detalhesAuditoria,
      documentos_incluidos: documentosDoCliente.filter((d) => docsPorTipo.has(d.tipo_documento)).map((d) => d.label),
    },
  });

  return NextResponse.json({ documentoExternoId, provedor });
}
