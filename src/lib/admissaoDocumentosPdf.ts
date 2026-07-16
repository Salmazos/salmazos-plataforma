import type { PdfWriter } from "./pdfWriter";
import type { PDFImage } from "pdf-lib";
import { GRAY, DARK, ML } from "./pdfWriter";
import { ESTADO_CIVIL_OPTIONS, GRAU_INSTRUCAO_OPTIONS, TERMOS_VALE_TRANSPORTE_TEXTO } from "./admissaoConstants";

function optLabel(options: { value: string; label: string }[], value: string | null | undefined): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

function simNao(v: boolean | null | undefined): string {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  return "";
}

function moeda(v: number | null | undefined): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
}

// "R$ 1.837,40 + 20% de Insalubridade, R$ 150,00 de Periculosidade" — concatena os
// adicionais salariais ao lado do salário base, cada um no formato do seu formato_valor.
function salarioComAdicionais(salario: number | null | undefined, adicionais: FichaCadastralAdicional[] | undefined): string {
  const base = moeda(salario);
  if (!adicionais || adicionais.length === 0) return base;
  const partes = adicionais.map((ad) =>
    ad.formato_valor === "percentual"
      ? `${ad.valor.toLocaleString("pt-BR")}% de ${ad.tipo}`
      : `${moeda(ad.valor)} de ${ad.tipo}`
  );
  return `${base} + ${partes.join(", ")}`;
}

// "vale_transporte" -> Sim; "transporte_fretado"/"nao_opta" -> Não (nenhum dos dois é
// vale-transporte propriamente); ainda não respondido -> em branco.
function optaValeTransporte(opcao: string | null | undefined): string {
  if (opcao === "vale_transporte") return "Sim";
  if (opcao === "transporte_fretado" || opcao === "nao_opta") return "Não";
  return "";
}

// ── Ficha Cadastral de Funcionário ──────────────────────────────────────────

export interface FichaCadastralAdicional {
  tipo: string;
  formato_valor: "percentual" | "fixo";
  valor: number;
}

export interface FichaCadastralDados {
  funcao?: string | null;
  salario?: number | null;
  horario_trabalho?: string | null;
  data_admissao?: string | null;
  nome_completo?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  estado_civil?: string | null;
  nacionalidade?: string | null;
  naturalidade?: string | null;
  pais_nascimento?: string | null;
  cor_raca?: string | null;
  nome_mae?: string | null;
  nacionalidade_mae?: string | null;
  nome_pai?: string | null;
  nacionalidade_pai?: string | null;
  cpf?: string | null;
  rg_numero?: string | null;
  rg_orgao_emissor?: string | null;
  rg_uf?: string | null;
  rg_data_emissao?: string | null;
  titulo_eleitor?: string | null;
  zona_eleitoral?: string | null;
  secao_eleitoral?: string | null;
  pis_pasep?: string | null;
  pis_data_cadastramento?: string | null;
  carteira_trabalho_numero?: string | null;
  carteira_trabalho_serie?: string | null;
  carteira_trabalho_uf?: string | null;
  ctps_data_emissao?: string | null;
  possui_ctps_digital?: boolean | null;
  cnh_numero?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  cnh_data_emissao?: string | null;
  cnh_uf?: string | null;
  reservista?: string | null;
  grau_instrucao?: string | null;
  endereco_cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_uf?: string | null;
  telefone?: string | null;
  email?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: string | null;
  pix?: string | null;
  data_exame_admissional?: string | null;
  recebendo_seguro_desemprego?: boolean | null;
  primeiro_emprego?: boolean | null;
  trabalhou_empresa_antes?: boolean | null;
  aposentado?: boolean | null;
  dependente_ir?: boolean | null;
  dependente_salario_familia?: boolean | null;
  tera_adiantamento?: boolean | null;
  // Resolvidos pelo chamador (não são colunas de admissao_dados_pessoais):
  empresa_cliente?: string | null; // vagas.cliente_id -> clientes.nome
  opta_vale_transporte?: string | null; // admissao_vale_transporte.opcao (cru — Sim/Não calculado aqui dentro)
  autoriza_sindical?: boolean | null; // admissao_autorizacao_sindical.autoriza_sindical
  possui_dependentes?: boolean | null; // calculado pelo chamador (dependentes.length > 0) — null = ainda não se sabe (formulário em branco)
  adicionais?: FichaCadastralAdicional[]; // admissao_adicionais — preenchidos pelo analista, não pelo candidato
}

export interface FichaCadastralDependente {
  nome?: string | null;
  parentesco?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  nome_mae?: string | null;
  cpf_mae?: string | null;
  cartorio?: string | null;
  local_nascimento?: string | null;
  declaracao_nascido_vivo?: string | null;
  num_registro?: string | null;
  num_livro?: string | null;
  num_folha?: string | null;
}

export function desenharFichaCadastral(
  w: PdfWriter,
  d: FichaCadastralDados,
  dependentes: FichaCadastralDependente[],
  // emBranco: só o formulário em branco (formularios-em-branco/route.ts) passa true.
  // A pergunta de portabilidade salarial existe apenas como checkbox pra marcar à
  // caneta no papel — o pacote de contabilidade (gerar-pdf/route.ts) já mostra a
  // resposta real na Carta de Abertura de Conta Salário (desenharCartaAberturaContaSalario),
  // então não precisa repeti-la aqui na Ficha Cadastral preenchida.
  opcoes?: { emBranco?: boolean }
) {
  w.newPage();
  w.drawText("FICHA CADASTRAL DE FUNCIONÁRIO", w.bold, 14);
  w.y -= 6;

  w.sectionTitle("Dados da Contratação");
  w.formFieldRow([
    { label: "Empresa/Cliente", value: d.empresa_cliente },
    { label: "Função", value: d.funcao },
  ]);
  w.formFieldRow([
    { label: "Salário", value: salarioComAdicionais(d.salario, d.adicionais) },
    { label: "Horário de trabalho", value: d.horario_trabalho },
    { label: "Data de admissão", value: d.data_admissao },
  ]);

  w.sectionTitle("Dados Pessoais");
  w.formField("Nome completo", d.nome_completo);
  w.formFieldRow([
    { label: "Data de nascimento", value: d.data_nascimento },
    { label: "Sexo", value: d.sexo === "M" ? "Masculino" : d.sexo === "F" ? "Feminino" : "" },
    { label: "Estado civil", value: optLabel(ESTADO_CIVIL_OPTIONS, d.estado_civil) },
  ]);
  w.formFieldRow([
    { label: "Nacionalidade", value: d.nacionalidade },
    { label: "Naturalidade", value: d.naturalidade },
    { label: "País de nascimento", value: d.pais_nascimento },
  ]);
  w.formFieldRow([
    { label: "Cor/Raça", value: d.cor_raca },
    { label: "Grau de instrução", value: optLabel(GRAU_INSTRUCAO_OPTIONS, d.grau_instrucao) },
  ]);

  w.sectionTitle("Filiação");
  w.formFieldRow([
    { label: "Nome da mãe", value: d.nome_mae },
    { label: "Nacionalidade da mãe", value: d.nacionalidade_mae },
  ]);
  w.formFieldRow([
    { label: "Nome do pai", value: d.nome_pai },
    { label: "Nacionalidade do pai", value: d.nacionalidade_pai },
  ]);

  w.sectionTitle("Documentos");
  w.formFieldRow([
    { label: "CPF", value: d.cpf },
    { label: "RG número", value: d.rg_numero },
  ]);
  w.formFieldRow([
    { label: "RG órgão emissor", value: d.rg_orgao_emissor },
    { label: "RG UF", value: d.rg_uf },
    { label: "RG data de emissão", value: d.rg_data_emissao },
  ]);
  w.formFieldRow([
    { label: "Título de eleitor", value: d.titulo_eleitor },
    { label: "Zona eleitoral", value: d.zona_eleitoral },
    { label: "Seção eleitoral", value: d.secao_eleitoral },
  ]);
  w.formFieldRow([
    { label: "PIS/PASEP", value: d.pis_pasep },
    { label: "Data de cadastramento do PIS", value: d.pis_data_cadastramento },
  ]);
  w.formFieldRow([
    { label: "Possui CTPS Digital?", value: simNao(d.possui_ctps_digital) },
  ]);
  w.formFieldRow([
    { label: "CTPS Física - número", value: d.carteira_trabalho_numero },
    { label: "CTPS Física - série", value: d.carteira_trabalho_serie },
    { label: "CTPS Física - UF", value: d.carteira_trabalho_uf },
  ]);
  w.formFieldRow([
    { label: "CTPS Física - data de emissão", value: d.ctps_data_emissao },
    { label: "Reservista", value: d.reservista },
  ]);
  w.formFieldRow([
    { label: "CNH número", value: d.cnh_numero },
    { label: "CNH categoria", value: d.cnh_categoria },
    { label: "CNH validade", value: d.cnh_validade },
  ]);
  w.formFieldRow([
    { label: "CNH data de emissão", value: d.cnh_data_emissao },
    { label: "CNH UF", value: d.cnh_uf },
  ]);

  w.sectionTitle("Endereço e Contato");
  w.formFieldRow([
    { label: "Logradouro", value: d.endereco_logradouro },
    { label: "Número", value: d.endereco_numero },
  ]);
  w.formFieldRow([
    { label: "Complemento", value: d.endereco_complemento },
    { label: "Bairro", value: d.endereco_bairro },
  ]);
  w.formFieldRow([
    { label: "Cidade", value: d.endereco_cidade },
    { label: "UF", value: d.endereco_uf },
    { label: "CEP", value: d.endereco_cep },
  ]);
  w.formFieldRow([
    // País de residência — não existe coluna própria (só "país de nascimento", que é
    // outra coisa); na prática 100% dos candidatos residem no Brasil, então fixo aqui
    // em vez de criar uma migration só pra isso.
    { label: "País", value: "Brasil" },
    { label: "Telefone", value: d.telefone },
    { label: "E-mail", value: d.email },
  ]);

  w.sectionTitle("Dados Bancários");
  w.formFieldRow([
    { label: "Banco", value: d.banco },
    { label: "Agência", value: d.agencia },
    { label: "Conta", value: d.conta },
  ]);
  w.formFieldRow([
    { label: "Tipo de conta", value: d.tipo_conta === "corrente" ? "Conta Corrente" : d.tipo_conta === "poupanca" ? "Conta Poupança" : "" },
    { label: "Chave PIX", value: d.pix },
  ]);
  if (opcoes?.emBranco) {
    w.ensureSpace(24);
    w.drawText("Deseja portar seu salário para esta conta bancária?     (  ) Sim     (  ) Não", w.regular, 10);
    w.y -= 8;
  }

  w.sectionTitle("Situação Trabalhista e Benefícios");
  w.formFieldRow([
    { label: "Recebendo seguro-desemprego?", value: simNao(d.recebendo_seguro_desemprego) },
    { label: "Primeiro emprego?", value: simNao(d.primeiro_emprego) },
  ]);
  w.formFieldRow([
    { label: "Já trabalhou nesta empresa antes?", value: simNao(d.trabalhou_empresa_antes) },
    { label: "Aposentado?", value: simNao(d.aposentado) },
  ]);
  w.formFieldRow([
    { label: "Dependente para Imposto de Renda?", value: simNao(d.dependente_ir) },
    { label: "Dependente para Salário Família?", value: simNao(d.dependente_salario_familia) },
  ]);
  w.formFieldRow([
    { label: "Terá adiantamento salarial?", value: simNao(d.tera_adiantamento) },
    { label: "Data do exame admissional", value: d.data_exame_admissional },
  ]);
  w.formFieldRow([
    { label: "Opta pelo Vale Transporte?", value: optaValeTransporte(d.opta_vale_transporte) },
    { label: "Autoriza desconto da Sindical?", value: simNao(d.autoriza_sindical) },
    { label: "Possui dependentes?", value: simNao(d.possui_dependentes) },
  ]);

  if (dependentes.length > 0) {
    w.sectionTitle("Dependentes");
    for (const dep of dependentes) {
      w.formFieldRow([
        { label: "Nome do dependente", value: dep.nome },
        { label: "Parentesco", value: dep.parentesco },
      ]);
      w.formFieldRow([
        { label: "Data de nascimento", value: dep.data_nascimento },
        { label: "CPF", value: dep.cpf },
      ]);
      w.formFieldRow([
        { label: "Nome da mãe", value: dep.nome_mae },
        { label: "CPF da mãe", value: dep.cpf_mae },
      ]);
      w.formFieldRow([
        { label: "Cartório", value: dep.cartorio },
        { label: "Local de nascimento", value: dep.local_nascimento },
      ]);
      w.formFieldRow([
        { label: "Declaração de nascido vivo", value: dep.declaracao_nascido_vivo },
        { label: "Registro / Livro / Folha", value: [dep.num_registro, dep.num_livro, dep.num_folha].filter(Boolean).join(" / ") },
      ]);
      w.y -= 10;
    }
  }

  w.signatureLine("Assinatura do Funcionário");
}

// ── Autorização de Desconto na Folha de Pagamento (Sindical) ───────────────

export interface AutorizacaoSindicalDados {
  nome_completo?: string | null;
  cpf?: string | null;
  rg_numero?: string | null;
  carteira_trabalho_numero?: string | null;
  carteira_trabalho_serie?: string | null;
  possui_ctps_digital?: boolean | null;
  nome_sindicato?: string | null;
  autoriza_assistencial_confederativa?: boolean | null;
  autoriza_sindical?: boolean | null;
  // Resolvidos pelo chamador a partir de clientes.entidade_contratante (ver ENTIDADES_CONTRATANTES
  // em @/lib/constants) — em branco se o cliente ainda não tiver isso configurado.
  empresa_razao_social?: string | null;
  empresa_cnpj?: string | null;
}

export function desenharAutorizacaoSindical(w: PdfWriter, d: AutorizacaoSindicalDados) {
  w.newPage();
  w.drawText("AUTORIZAÇÃO DE DESCONTO NA FOLHA DE PAGAMENTO", w.bold, 13);
  w.drawText("Contribuições Sindical, Assistencial e Confederativa", w.regular, 10, GRAY);
  w.y -= 10;

  w.formField("Nome do sindicato", d.nome_sindicato);
  w.y -= 6;

  const nome = d.nome_completo?.trim() || "_______________________________________________";
  const cpf = d.cpf?.trim() || "________________";
  const rg = d.rg_numero?.trim() || "________________";
  const ctpsNum = d.carteira_trabalho_numero?.trim() || "__________";
  const ctpsSerie = d.carteira_trabalho_serie?.trim() || "______";
  const empresa = d.empresa_razao_social?.trim() || "_______________________________________________";
  const cnpj = d.empresa_cnpj?.trim() || "__________________";
  // CTPS Digital não tem número/série no formato antigo — se o candidato marcou que
  // usa a digital e não preencheu a física, referencia pelo CPF em vez de imprimir
  // linhas em branco que sugeririam CTPS física não preenchida.
  const usaCtpsDigital = d.possui_ctps_digital === true && !d.carteira_trabalho_numero?.trim();
  // Quebrado em várias linhas curtas de propósito: nome e razão social podem ser longos
  // o bastante pra estourar a largura da página numa linha só (já vimos isso acontecer
  // na validação — o CNPJ sumia, cortado silenciosamente fora da área visível).
  w.drawText(`Eu, ${nome},`, w.regular, 9);
  w.drawText(`portador(a) do CPF ${cpf}, RG nº ${rg},`, w.regular, 9);
  if (usaCtpsDigital) {
    w.drawText(`CTPS Digital (vinculada ao CPF ${cpf}),`, w.regular, 9);
  } else {
    w.drawText(`CTPS nº ${ctpsNum} série ${ctpsSerie},`, w.regular, 9);
  }
  w.drawText(`admitido(a) por ${empresa}`, w.regular, 9);
  w.drawText(`(CNPJ ${cnpj}),`, w.regular, 9);
  w.y -= 4;
  w.drawText("DECLARO o seguinte:", w.bold, 10);
  w.y -= 8;

  w.checkOption("AUTORIZO o desconto das Contribuições Assistencial e Confederativa.", d.autoriza_assistencial_confederativa === true);
  w.checkOption("NÃO AUTORIZO o desconto das Contribuições Assistencial e Confederativa.", d.autoriza_assistencial_confederativa === false);
  w.y -= 10;
  w.checkOption("AUTORIZO o desconto da Contribuição Sindical.", d.autoriza_sindical === true);
  w.checkOption("NÃO AUTORIZO o desconto da Contribuição Sindical.", d.autoriza_sindical === false);

  // Local fixo + data por extenso deixada em branco de propósito — evita fixar uma data
  // errada num documento que pode ser impresso e assinado fisicamente depois.
  w.signatureLine("Assinatura do Funcionário", "Monte Mor, ____ de _______________ de 20____");
}

// ── Solicitação de Vale Transporte ──────────────────────────────────────────

export interface ValeTransporteLinhaDados {
  onibus_viacao?: string | null;
  percurso?: string | null;
  valor_unitario?: number | null;
  valor_total_diario?: number | null;
}

export interface ValeTransporteDados {
  nome_completo?: string | null;
  cpf?: string | null;
  funcao?: string | null;
  carteira_trabalho_numero?: string | null;
  carteira_trabalho_serie?: string | null;
  data_admissao?: string | null;
  empresa_cliente?: string | null; // vagas.cliente_id -> clientes.nome (mesma fonte da Ficha Cadastral)
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  pix?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_uf?: string | null;
  endereco_cep?: string | null;
  horario_trabalho?: string | null;
  opcao?: string | null;
  dias_semana?: string | null;
  bairro_cidade_trabalho?: string | null;
  linhas?: ValeTransporteLinhaDados[];
  // Timestamp do aceite digital da cláusula legal do decreto (ver TERMOS_VALE_TRANSPORTE_TEXTO)
  // — null quando ainda não foi aceito digitalmente (documento em branco ou aceite pendente).
  termos_aceitos_em?: string | null;
}

// Documento pensado pra ficar autônomo/assinável separadamente dos outros dois — por
// isso repete alguns dados (CPF, função, dados bancários) já presentes na Ficha Cadastral.
export function desenharSolicitacaoValeTransporte(w: PdfWriter, d: ValeTransporteDados) {
  w.newPage();
  w.drawText("SOLICITAÇÃO DE VALE TRANSPORTE", w.bold, 14);
  w.y -= 6;

  // Não existe conceito de "número de registro/matrícula de funcionário" no sistema
  // hoje — fica só o rótulo com linha em branco pra preencher à mão.
  w.formField("Nº do Registro", null);
  w.formFieldRow([
    { label: "Nome do funcionário", value: d.nome_completo },
    { label: "CPF", value: d.cpf },
  ]);
  w.formFieldRow([
    { label: "Função", value: d.funcao },
    { label: "CTPS número", value: d.carteira_trabalho_numero },
    { label: "CTPS série", value: d.carteira_trabalho_serie },
  ]);
  w.formFieldRow([
    { label: "Data do início", value: d.data_admissao },
    { label: "Empresa/Cliente", value: d.empresa_cliente },
  ]);
  w.formFieldRow([
    { label: "Banco", value: d.banco },
    { label: "Agência", value: d.agencia },
    { label: "Conta", value: d.conta },
  ]);
  w.formField("Chave PIX", d.pix);

  w.sectionTitle("Minha Residência Atual");
  w.formFieldRow([
    { label: "Logradouro", value: d.endereco_logradouro },
    { label: "Número", value: d.endereco_numero },
    { label: "Bairro", value: d.endereco_bairro },
  ]);
  w.formFieldRow([
    { label: "Cidade", value: d.endereco_cidade },
    { label: "UF", value: d.endereco_uf },
    { label: "CEP", value: d.endereco_cep },
  ]);
  w.y -= 4;

  w.checkOption("Opto pela utilização do Vale Transporte", d.opcao === "vale_transporte");
  w.checkOption("Não opto pela utilização do Vale Transporte", d.opcao === "nao_opta");
  w.checkOption("Opto pela utilização do Transporte Fretado pela Empresa", d.opcao === "transporte_fretado");
  w.y -= 4;

  // Sempre visível (é o texto do documento físico) — mesmo no formulário em branco
  // pra impressão, onde termos_aceitos_em nunca está preenchido.
  TERMOS_VALE_TRANSPORTE_TEXTO.forEach((linha) => w.paragraph(linha, w.regular, 9));
  w.y -= 4;
  if (d.termos_aceitos_em) {
    w.drawText(`Termos aceitos digitalmente em: ${new Date(d.termos_aceitos_em).toLocaleString("pt-BR")}`, w.bold, 9, GRAY);
  } else {
    w.drawText("Termos a serem aceitos com a assinatura abaixo.", w.regular, 9, GRAY);
  }
  w.y -= 6;

  w.formFieldRow([
    { label: "Horário de trabalho", value: d.horario_trabalho },
    { label: "Dias que irá trabalhar na semana", value: d.dias_semana },
    { label: "Bairro e cidade do local de trabalho", value: d.bairro_cidade_trabalho },
  ]);
  w.y -= 6;

  if (d.linhas && d.linhas.length > 0) {
    w.sectionTitle("Linhas de ônibus");
    d.linhas.forEach((linha, i) => {
      w.drawText(`Linha ${i + 1}`, w.bold, 9, GRAY);
      w.formFieldRow([
        { label: "Ônibus/Viação", value: linha.onibus_viacao },
        { label: "Percurso", value: linha.percurso },
      ]);
      w.formFieldRow([
        { label: "Valor unitário (R$)", value: moeda(linha.valor_unitario) },
        { label: "Valor total diário (R$)", value: moeda(linha.valor_total_diario) },
      ]);
      w.y -= 6;
    });
  }

  w.signatureLine("Assinatura do Funcionário");
}

// ── Carta de Abertura de Conta Salário ──────────────────────────────────────

const MESES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dataExtenso(data: Date): string {
  return `${data.getDate()} de ${MESES_EXTENSO[data.getMonth()]} de ${data.getFullYear()}`;
}

// data_admissao vem como "YYYY-MM-DD" (coluna date) — parse por string pra não sofrer o
// shift de timezone que `new Date(iso)` causaria.
function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export interface CartaContaSalarioDados {
  nome_completo: string;
  telefone?: string | null;
  data_admissao?: string | null;
  funcao: string;
  // Resolvidos pelo chamador a partir de admissoes.entidade_contratante (ver
  // ENTIDADES_CONTRATANTES em @/lib/constants) — mesma fonte usada na Autorização Sindical.
  entidade_razao_social?: string | null;
  entidade_cnpj?: string | null;
  // Endereço de registro/fiscal da Salmazos — ver ENDERECO_FISCAL_SALMAZOS em
  // @/lib/admissaoConstants (mesma fonte do rodapé de todo PDF gerado pelo PdfWriter).
  endereco_fiscal: string;
  salario: number;
  // Dados de PORTABILIDADE de salário (admissao_dados_pessoais.banco_portabilidade/etc,
  // resolvidos pelo chamador só quando deseja_portabilidade_salario é true) — não o
  // cadastro bancário geral do candidato (banco/agencia/conta), que é um conceito
  // diferente e nunca aparece nesta carta.
  banco_portabilidade?: string | null;
  agencia_portabilidade?: string | null;
  conta_portabilidade?: string | null;
  tipo_conta_portabilidade?: "corrente" | "poupanca" | null;
  // Assinatura do responsável pelo RH (designado em Configurações), já embutida no
  // PDFDocument pelo chamador — desenhada acima da linha de assinatura. Opcional: se
  // ninguém tiver assinatura cadastrada, a carta sai igual, só sem a imagem.
  assinaturaImg?: PDFImage | null;
}

// Carta formal solicitando ao banco parceiro a abertura de conta salário — página 1 do
// PDF de 3 páginas (carta + RG + comprovante de endereço, anexados em página cheia por
// quem chama esta função). Timbrado (logo + rodapé) vem automaticamente de w.newPage(),
// igual a todo outro documento gerado pelo PdfWriter — nenhuma lógica de logo por
// entidade aqui, só o texto (razão social/CNPJ) resolvido pelo chamador.
export function desenharCartaAberturaContaSalario(w: PdfWriter, d: CartaContaSalarioDados) {
  w.newPage();
  w.drawText(`Monte Mor, ${dataExtenso(new Date())}.`, w.regular, 10, DARK);
  w.y -= 10;
  w.drawText("Solicitação", w.bold, 13, DARK);
  w.y -= 10;

  w.richParagraph(
    [
      { text: "Venho, por meio desta, solicitar a abertura de " },
      { text: "Conta Salário", bold: true },
      { text: " para o(a) Sr.(a) " },
      { text: d.nome_completo, bold: true },
      { text: ", " },
      { text: `celular ${d.telefone?.trim() || "—"}`, bold: true },
      { text: ", admitido em " },
      { text: dataBR(d.data_admissao), bold: true },
      { text: ` para exercer a função de ${d.funcao}.` },
    ],
    10,
    DARK
  );

  w.y -= 10;

  w.richParagraph(
    [
      {
        text: `O(a) colaborador(a) foi contratado(a) pela empresa ${d.entidade_razao_social ?? "—"}, inscrita no CNPJ nº ${d.entidade_cnpj ?? "—"}, sediada à ${d.endereco_fiscal}, com salário de ${moeda(d.salario)} por mês.`,
      },
    ],
    10,
    DARK
  );

  if (d.banco_portabilidade || d.agencia_portabilidade || d.conta_portabilidade) {
    const tipoContaLabel =
      d.tipo_conta_portabilidade === "corrente" ? "Conta Corrente" : d.tipo_conta_portabilidade === "poupanca" ? "Conta Poupança" : "—";
    w.y -= 10;
    w.drawText("Dados para portabilidade:", w.bold, 10, DARK);
    w.y -= 4;
    w.drawText(d.banco_portabilidade || "—", w.regular, 10, DARK);
    w.drawText(`Ag: ${d.agencia_portabilidade || "—"}`, w.regular, 10, DARK);
    w.drawText(`Cc: ${d.conta_portabilidade || "—"}`, w.regular, 10, DARK);
    w.drawText(tipoContaLabel, w.regular, 10, DARK);
  }

  w.y -= 20;
  w.drawText("Sem mais,", w.regular, 10, DARK);

  if (d.assinaturaImg) {
    w.ensureSpace(90);
    const maxW = 160;
    const maxH = 50;
    const scale = Math.min(maxW / d.assinaturaImg.width, maxH / d.assinaturaImg.height, 1);
    const imgW = d.assinaturaImg.width * scale;
    const imgH = d.assinaturaImg.height * scale;
    const topGap = 10;
    const bottomGap = 8;
    w.page.drawImage(d.assinaturaImg, { x: ML, y: w.y - topGap - imgH, width: imgW, height: imgH });
    w.y -= topGap + imgH + bottomGap;
  } else {
    w.y -= 50;
  }

  w.page.drawLine({ start: { x: ML, y: w.y }, end: { x: ML + 260, y: w.y }, thickness: 0.8, color: DARK });
  w.y -= 14;
  w.drawText(d.entidade_razao_social ?? "—", w.bold, 10, DARK);
  w.y -= 2;
  w.drawText(`CNPJ.: ${d.entidade_cnpj ?? "—"}`, w.regular, 9, GRAY);
}
