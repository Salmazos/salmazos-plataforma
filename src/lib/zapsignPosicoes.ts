import type { TipoDocumentoContabilidade } from "./contabilidadeDocumentosMatch";

// Tabela de posições FIXA, calibrada uma única vez contra um caso real assinado (admissão
// da candidata ELIANE CRISTINA PEREIRA, sandbox ZapSign, 2026-08). Substitui a detecção de
// âncora por texto em tempo de execução (ver lib/pdfAnchors.ts) — aquela abordagem se
// mostrou fundamentalmente frágil contra documentos reais: o nome do candidato e da empresa
// aparecem várias vezes no mesmo documento (cabeçalho, corpo de cláusula, campo de dado),
// não só na linha de assinatura, e não existe um sinal de texto confiável o bastante pra
// distinguir "isto é uma linha de assinatura" de "isto é só uma menção" em todos os casos
// (ver investigação na conversa que introduziu este arquivo — 3 padrões diferentes de falso
// positivo encontrados, cada um exigindo uma regra própria, sem convergir).
//
// ASSUNÇÃO DE NEGÓCIO: os 4 documentos obrigatórios da contabilidade (Ficha de Registro,
// Modelo Contrato Temporário, Acordo de HS/Decl. VT, Termo de Consentimento LGPD) têm
// SEMPRE a mesma estrutura de página — mesmo texto, mesmo layout, mesma quantidade de
// páginas — independente do candidato. Isso é plausível porque são gerados por um sistema
// da contabilidade a partir de um template fixo, mas NUNCA foi confirmado com mais de um
// caso real. Se a contabilidade trocar de gerador/modelo de PDF, ou se algum desses tipos
// tiver variações (ex: com/sem dependente), as coordenadas abaixo ficam desatualizadas
// silenciosamente — não há checagem automática de "o texto que eu esperava está mesmo
// aqui". Reversível: se um caso real futuro não bater com essas posições, remedir contra o
// novo caso e atualizar esta tabela — não há fallback automático de recalibração.
//
// Ficha de IR, Salário Família e Termo de Responsabilidade — calibrados contra um segundo
// caso real (candidata POLIANA PATRICIA GONCALVES DOS SANTOS, sandbox ZapSign, 2026-08),
// já que o caso da Eliane não tinha nenhum dos 3 (opcionais, dependem do que a
// contabilidade efetivamente manda). Estrutura mais simples que os 4 obrigatórios: 1
// página cada, só o candidato assina (a empresa não tem nada a assinar nesses 3).

export type TipoMarcaPagina = "assinatura" | "rubrica";

export interface CoordenadaRelativa {
  relative_position_left: number;
  relative_position_bottom: number;
}

export interface PosicaoPagina {
  tipo: TipoMarcaPagina;
  // Quando tipo === "assinatura": ausente = essa parte não assina esta página específica
  // (ex: Ficha de Registro, só o candidato assina). Quando tipo === "rubrica": ausente
  // (o normal) = usa RUBRICA_POSICAO_PADRAO (canto superior direito, ver lib/pdfAnchors.ts)
  // pras duas partes, igual antes. Preenchido = override de posição só pra essa página
  // específica (ver lib/zapsign.ts, rubricasExtras) — usado quando o padrão global colide
  // com o layout de um documento em particular (ex: termo_lgpd_novacki abaixo, um termo
  // denso sem margem livre no canto superior).
  contratante?: CoordenadaRelativa;
  contratado?: CoordenadaRelativa;
}

// Index do array = página local dentro do ARQUIVO INDIVIDUAL daquele tipo (0-indexed) — não
// a página absoluta no PDF final combinado. Quem soma o offset acumulado pra chegar na
// página absoluta é o chamador (ver montar-enviar/route.ts).
export const POSICOES_POR_TIPO_DOCUMENTO: Partial<Record<TipoDocumentoContabilidade, PosicaoPagina[]>> = {
  ficha_registro: [
    { tipo: "assinatura", contratado: { relative_position_left: 39.0, relative_position_bottom: 21.9 } },
  ],
  modelo_contrato: [
    { tipo: "rubrica" },
    { tipo: "rubrica" },
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 39.94, relative_position_bottom: 64.38 },
      contratado: { relative_position_left: 44.96, relative_position_bottom: 54.63 },
    },
  ],
  acordo_hs_vt: [
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 5.06, relative_position_bottom: 31.3 },
      contratado: { relative_position_left: 5.06, relative_position_bottom: 42.6 },
    },
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 5.1, relative_position_bottom: 19.3 },
      contratado: { relative_position_left: 5.1, relative_position_bottom: 29.0 },
    },
  ],
  termo_lgpd: [
    { tipo: "rubrica" },
    {
      tipo: "assinatura",
      contratante: { relative_position_left: 5.0, relative_position_bottom: 27.54 },
      contratado: { relative_position_left: 50.24, relative_position_bottom: 34.28 },
    },
  ],
  ficha_ir: [
    { tipo: "assinatura", contratado: { relative_position_left: 25.0, relative_position_bottom: 56.0 } },
  ],
  salario_familia: [
    { tipo: "assinatura", contratado: { relative_position_left: 40.0, relative_position_bottom: 73.5 } },
  ],
  termo_responsabilidade: [
    { tipo: "assinatura", contratado: { relative_position_left: 27.0, relative_position_bottom: 24.0 } },
  ],

  // Calibrado contra os PDFs de referência reais da Novacki (Termo LGPD Novacki e Termo de
  // Confidencialidade e Sigilo Novacki, fornecidos em doc_test/) — não contra um caso já
  // assinado, já que ambos são documentos novos sem histórico. Medição por extração de texto
  // (unpdf, mesma lib de lib/pdfAnchors.ts) da linha "_______" de assinatura na página final
  // de cada um: span horizontal left 62.24→94.13 (centro ~78.2) em ambos; baseline vertical
  // bottom 10.86 (LGPD, pág. 4) e 14.11 (Confidencialidade, pág. única) — motivo da diferença
  // de bottom entre os dois: o bloco de assinatura da Confidencialidade cai um pouco mais alto
  // na página por ter menos texto de corpo acima dele. Posição final: caixa de 22% de largura
  // (TAMANHO_CAIXA) centralizada nesse span (left 78.2 - 11 ≈ 67), bottom na baseline da linha
  // para o traço da assinatura ficar apoiado sobre/acima dela. Verificado assinando os 2
  // documentos de ponta a ponta no sandbox ZapSign e inspecionando a matriz de
  // posicionamento (operador "cm") da imagem da assinatura no content stream do PDF final
  // assinado — não só visualmente: left/bottom extraídos do PDF batem exatos
  // (67.00%/11.00% e 67.00%/14.00%) com os valores configurados abaixo, confirmando que a
  // API aplica essas coordenadas sem distorção (ver conversa que introduziu este bloco).
  //
  // Rubrica nas páginas 1-3 do LGPD: NÃO usa RUBRICA_POSICAO_PADRAO (o padrão global, canto
  // superior direito) — 1ª rodada de calibração usou o padrão e o teste em sandbox mostrou
  // rubrica sobreposta a conteúdo real: o padrão (contratante bottom:90) cai dentro do
  // banner da Novacki (imagem, não texto — por isso a checagem inicial contra texto não
  // pegou; banner mede left:0.88-99.25% bottom:89.93-99.91% nas 3 páginas, medido via
  // XObject/Image9 do PDF), e o padrão do contratado (bottom:78) cai sobre um parágrafo na
  // pág. 2. Este é um termo denso — texto de corpo ocupa quase toda a página, do fim do
  // banner (~90%) até perto do rodapé (a pág. 2 tem texto até bottom:8.13%). Uma varredura
  // exaustiva (grade de 0.5% em left/bottom, margem de segurança 0.6%, contra texto real +
  // banner das 3 páginas) achou UMA única faixa livre nas 3 simultaneamente: bottom
  // 2-2.5%, left até ~70.5% (larguras de caixa 22%). Posição final: duas caixas lado a lado
  // nessa faixa seguindo o pedido de canto inferior direito, sem se sobrepor — contratante
  // left:46 (caixa 46-68%), contratado left:70 (caixa 70-92%), ambas bottom:2.5%. Isso exige
  // um override por página (rubricasExtras em lib/zapsign.ts) já que RUBRICA_POSICAO_PADRAO
  // é compartilhado com modelo_contrato e termo_lgpd (genérico) — não pode ser alterado
  // globalmente só por causa deste documento.
  termo_lgpd_novacki: [
    {
      tipo: "rubrica",
      contratante: { relative_position_left: 46, relative_position_bottom: 2.5 },
      contratado: { relative_position_left: 70, relative_position_bottom: 2.5 },
    },
    {
      tipo: "rubrica",
      contratante: { relative_position_left: 46, relative_position_bottom: 2.5 },
      contratado: { relative_position_left: 70, relative_position_bottom: 2.5 },
    },
    {
      tipo: "rubrica",
      contratante: { relative_position_left: 46, relative_position_bottom: 2.5 },
      contratado: { relative_position_left: 70, relative_position_bottom: 2.5 },
    },
    { tipo: "assinatura", contratado: { relative_position_left: 67, relative_position_bottom: 11 } },
  ],
  termo_confidencialidade_novacki: [
    { tipo: "assinatura", contratado: { relative_position_left: 67, relative_position_bottom: 14 } },
  ],
};
