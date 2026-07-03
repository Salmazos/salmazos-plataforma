import type { PdfWriter } from "./pdfWriter";
import { GRAY } from "./pdfWriter";
import { ESTADO_CIVIL_OPTIONS, GRAU_INSTRUCAO_OPTIONS } from "./admissaoConstants";

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

// ── Ficha Cadastral de Funcionário ──────────────────────────────────────────

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

export function desenharFichaCadastral(w: PdfWriter, d: FichaCadastralDados, dependentes: FichaCadastralDependente[]) {
  w.newPage();
  w.drawText("FICHA CADASTRAL DE FUNCIONÁRIO", w.bold, 14);
  w.y -= 6;

  w.sectionTitle("Dados da Contratação");
  w.formFieldRow([
    { label: "Função", value: d.funcao },
    { label: "Salário", value: moeda(d.salario) },
  ]);
  w.formFieldRow([
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
    { label: "CTPS número", value: d.carteira_trabalho_numero },
    { label: "CTPS série", value: d.carteira_trabalho_serie },
    { label: "CTPS UF", value: d.carteira_trabalho_uf },
  ]);
  w.formFieldRow([
    { label: "CTPS data de emissão", value: d.ctps_data_emissao },
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
  nome_sindicato?: string | null;
  autoriza_assistencial_confederativa?: boolean | null;
  autoriza_sindical?: boolean | null;
}

export function desenharAutorizacaoSindical(w: PdfWriter, d: AutorizacaoSindicalDados) {
  w.newPage();
  w.drawText("AUTORIZAÇÃO DE DESCONTO NA FOLHA DE PAGAMENTO", w.bold, 13);
  w.drawText("Contribuições Sindical, Assistencial e Confederativa", w.regular, 10, GRAY);
  w.y -= 10;

  w.formField("Nome do sindicato", d.nome_sindicato);
  w.y -= 6;

  const nome = d.nome_completo?.trim() || "_______________________________________________";
  const cpf = d.cpf?.trim() || "________________________";
  w.drawText(`Eu, ${nome}, portador(a) do CPF ${cpf}, admitido(a) pela Salmazos RH,`, w.regular, 10);
  w.drawText("DECLARO o seguinte:", w.bold, 10);
  w.y -= 8;

  w.checkOption("AUTORIZO o desconto das Contribuições Assistencial e Confederativa.", d.autoriza_assistencial_confederativa === true);
  w.checkOption("NÃO AUTORIZO o desconto das Contribuições Assistencial e Confederativa.", d.autoriza_assistencial_confederativa === false);
  w.y -= 10;
  w.checkOption("AUTORIZO o desconto da Contribuição Sindical.", d.autoriza_sindical === true);
  w.checkOption("NÃO AUTORIZO o desconto da Contribuição Sindical.", d.autoriza_sindical === false);

  w.signatureLine("Assinatura do Funcionário");
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
  opcao?: string | null;
  dias_semana?: string | null;
  bairro_cidade_trabalho?: string | null;
  linhas?: ValeTransporteLinhaDados[];
}

export function desenharSolicitacaoValeTransporte(w: PdfWriter, d: ValeTransporteDados) {
  w.newPage();
  w.drawText("SOLICITAÇÃO DE VALE TRANSPORTE", w.bold, 14);
  w.y -= 6;

  w.formField("Nome do funcionário", d.nome_completo);
  w.y -= 4;

  w.drawText("Opção de deslocamento:", w.bold, 9, GRAY);
  w.checkOption("Vale Transporte", d.opcao === "vale_transporte");
  w.checkOption("Transporte Fretado pela Empresa", d.opcao === "transporte_fretado");
  w.checkOption("Não opta", d.opcao === "nao_opta");
  w.y -= 4;

  w.formFieldRow([
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
