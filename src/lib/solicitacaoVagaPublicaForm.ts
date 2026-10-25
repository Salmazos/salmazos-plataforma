// Estado, validação por etapa e corpo de envio do formulário público de solicitação de vaga (src/components/solicitacao-publica).
// Parte PURA (sem alias "@/"): roda no navegador e em scripts/verificar-solicitacao-link.mts. A validação final de verdade é a do
// servidor (publicoSolicitarVagaSchema em schemas.ts); esta serve para o cliente ver o erro no próprio campo antes de avançar.
import { validarCnpj, validarCpf, somenteDigitos } from "./documentoBr";
import { SALARIO_A_COMBINAR, SALARIO_ENVIAR_PRETENSAO, formatarSalarioHora, type SalarioModo } from "./constants";
import {
  ESTADOS,
  HORARIO_VAZIO,
  gerarBeneficiosChips,
  gerarBeneficiosTexto,
  gerarHorarioTexto,
  gerarRequisitosTexto,
  listarBeneficios,
  listarRequisitos,
  type BeneficiosSel,
  type HorarioForm,
  type RequisitosSel,
} from "./solicitacaoVagaCampos";

export type TipoPessoa = "pj" | "pf";
export type SimNao = "sim" | "nao";
export type Sexo = "masc" | "fem" | "indiferente";
export type Etapa = 1 | 2 | 3 | 4;

export const TITULOS_ETAPA: Record<Etapa, string> = {
  1: "Contratante",
  2: "A vaga",
  3: "Perfil e qualificações",
  4: "Condições e envio",
};

export interface FormPublico {
  tipo_pessoa: TipoPessoa;
  nome: string;
  documento: string;
  contato_nome: string;
  telefone: string;
  endereco: string;
  email: string;
  mesmo_email: boolean;
  email_nf: string;
  cargo: string;
  num_posicoes: string;
  cidade: string;
  estado: string;
  local_trabalho: string;
  previsao_inicio: string;
  // Salário como no formulário do portal: modo (valor fixo, à combinar, pretensão) + período (por mês ou por hora, só no valor fixo).
  // `salario` guarda o número puro vindo do CampoMoeda ("2500", "9.5") ou o texto-sentinela do modo.
  salario: string;
  salario_modo: SalarioModo;
  salario_periodo: "mes" | "hora";
  adicionais_salariais: string;
  horario: HorarioForm;
  beneficios: BeneficiosSel;
  sexo: Sexo;
  idade: string;
  pcd: SimNao;
  habilitacao: SimNao;
  habilitacao_categoria: string;
  veiculo_proprio: SimNao;
  requisitos: RequisitosSel;
  principais_atividades: string;
  observacoes: string;
  aceite: boolean;
  website: string; // honeypot: invisível para pessoas
}

export function formularioInicial(nomeEmpresa: string | null | undefined): FormPublico {
  return {
    tipo_pessoa: "pj",
    nome: nomeEmpresa?.trim() ?? "",
    documento: "",
    contato_nome: "",
    telefone: "",
    endereco: "",
    email: "",
    mesmo_email: false,
    email_nf: "",
    cargo: "",
    num_posicoes: "1",
    cidade: "",
    estado: "",
    local_trabalho: "",
    previsao_inicio: "",
    salario: "",
    salario_modo: "fixo",
    salario_periodo: "mes",
    adicionais_salariais: "",
    horario: { ...HORARIO_VAZIO },
    beneficios: { chips: {}, custom: [] },
    sexo: "indiferente",
    idade: "",
    pcd: "nao",
    habilitacao: "nao",
    habilitacao_categoria: "",
    veiculo_proprio: "nao",
    requisitos: { chips: {}, cursos: {}, condicoes: {}, custom: [] },
    principais_atividades: "",
    observacoes: "",
    aceite: false,
    website: "",
  };
}

// Há algo preenchido? (aviso ao sair da página). Ignora o que já vem de fábrica ou do nome do link.
export function formularioPreenchido(form: FormPublico, nomeEmpresaDoLink: string | null | undefined): boolean {
  const inicial = formularioInicial(nomeEmpresaDoLink);
  const textos: (keyof FormPublico)[] = [
    "nome", "documento", "contato_nome", "telefone", "endereco", "email", "email_nf", "cargo", "cidade", "estado", "local_trabalho",
    "previsao_inicio", "salario", "adicionais_salariais", "idade", "habilitacao_categoria", "principais_atividades", "observacoes",
  ];
  if (textos.some((k) => String(form[k]).trim() !== String(inicial[k]).trim())) return true;
  if (form.horario.tipo !== "") return true;
  if (listarBeneficios(form.beneficios).length > 0 || listarRequisitos(form.requisitos).length > 0) return true;
  return form.tipo_pessoa !== "pj" || form.sexo !== "indiferente" || form.pcd !== "nao" || form.habilitacao !== "nao" || form.veiculo_proprio !== "nao";
}

// ── Salário (mesmas regras e mesmo formato gravado do formulário do portal) ──────────────────────────────────────────────

export type OpcaoSalario = "mes" | "hora" | "a_combinar" | "pretensao";

export const OPCOES_SALARIO: readonly { id: OpcaoSalario; label: string }[] = [
  { id: "mes", label: "Valor por mês" },
  { id: "hora", label: "Valor por hora" },
  { id: "a_combinar", label: "À combinar" },
  { id: "pretensao", label: "Enviar Pretensão Salarial" },
];

export function opcaoSalarioAtual(form: Pick<FormPublico, "salario_modo" | "salario_periodo">): OpcaoSalario {
  return form.salario_modo === "fixo" ? form.salario_periodo : form.salario_modo;
}

// Equivalente ao handleSalarioModoChange do portal: trocar de opção zera o valor, e À combinar/Pretensão gravam o texto-sentinela.
// (Clicar de novo na opção que já está escolhida não apaga o que a pessoa digitou.)
export function escolherOpcaoSalario(form: FormPublico, opcao: OpcaoSalario): FormPublico {
  if (opcao === opcaoSalarioAtual(form)) return form;
  if (opcao === "a_combinar") return { ...form, salario_modo: "a_combinar", salario_periodo: "mes", salario: SALARIO_A_COMBINAR };
  if (opcao === "pretensao") return { ...form, salario_modo: "pretensao", salario_periodo: "mes", salario: SALARIO_ENVIAR_PRETENSAO };
  return { ...form, salario_modo: "fixo", salario_periodo: opcao, salario: "" };
}

// Equivalente ao salarioParaEnvio do portal: por hora vira "R$ 9,50/hora"; por mês (e À combinar/Pretensão) seguem como sempre
// foram (número puro como texto, ou a sentinela). Vazio, ou valor por hora zerado, vira null.
export function salarioParaEnvio(form: Pick<FormPublico, "salario" | "salario_modo" | "salario_periodo">): string | null {
  const valor = form.salario.trim();
  if (!valor) return null;
  if (form.salario_modo === "fixo" && form.salario_periodo === "hora") {
    const num = Number(valor);
    return num > 0 ? formatarSalarioHora(num) : null;
  }
  return valor;
}

function moeda(num: number): string {
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Salário legível para o resumo da etapa 4: "R$ 2.500,00 por mês", "R$ 9,50 por hora", "À combinar".
export function salarioLegivel(form: Pick<FormPublico, "salario" | "salario_modo" | "salario_periodo">): string | null {
  const valor = form.salario.trim();
  if (!valor) return null;
  if (form.salario_modo !== "fixo") return valor;
  const num = Number(valor);
  if (!(num > 0)) return null;
  return `${moeda(num)} por ${form.salario_periodo === "hora" ? "hora" : "mês"}`;
}

// O servidor só aceita o que o formulário sabe gerar: (a) número positivo puro ("2500", "2500.5"), (b) "R$ x,xx/hora",
// (c) À combinar, (d) Enviar Pretensão Salarial, ou vazio. Texto livre não passa.
export function salarioPublicoValido(texto: string | null | undefined): boolean {
  if (texto === null || texto === undefined) return true;
  const t = texto.trim();
  if (t === "") return true;
  if (t === SALARIO_A_COMBINAR || t === SALARIO_ENVIAR_PRETENSAO) return true;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) > 0;
  const hora = t.match(/^R\$ (\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\/hora$/);
  if (hora) return Number(`${hora[1].replace(/\./g, "")}.${hora[2]}`) > 0;
  return false;
}

export type ErrosForm = Partial<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function emailNfEfetivo(form: FormPublico): string {
  return form.mesmo_email ? form.email.trim() : form.email_nf.trim();
}

function excede(valor: string, max: number): boolean {
  return valor.trim().length > max;
}

// Devolve campo -> mensagem. A ORDEM das chaves é a ordem da tela (o primeiro erro recebe o foco).
export function validarEtapa(etapa: Etapa, form: FormPublico): ErrosForm {
  const erros: ErrosForm = {};
  if (etapa === 1) {
    const pj = form.tipo_pessoa === "pj";
    const nome = form.nome.trim();
    if (!nome) erros.nome = pj ? "Informe o nome da empresa contratante." : "Informe o seu nome completo.";
    else if (nome.length < 2) erros.nome = "Digite o nome completo, sem abreviar.";
    else if (excede(nome, 150)) erros.nome = "Use no máximo 150 caracteres.";

    const digitos = somenteDigitos(form.documento);
    if (!digitos) erros.documento = pj ? "Informe o CNPJ da empresa." : "Informe o seu CPF.";
    else if (pj ? !validarCnpj(digitos) : !validarCpf(digitos)) {
      erros.documento = pj ? "Este CNPJ não parece válido. Confira os 14 números." : "Este CPF não parece válido. Confira os 11 números.";
    }

    if (pj) {
      if (!form.contato_nome.trim()) erros.contato_nome = "Informe o nome da pessoa responsável pelo contato.";
      else if (excede(form.contato_nome, 120)) erros.contato_nome = "Use no máximo 120 caracteres.";
    }

    const tel = somenteDigitos(form.telefone);
    if (!tel) erros.telefone = "Informe um telefone com DDD.";
    else if (tel.length < 10 || tel.length > 11) erros.telefone = "Digite o telefone com DDD, por exemplo (19) 99999-9999.";

    if (excede(form.endereco, 300)) erros.endereco = "Use no máximo 300 caracteres.";

    const email = form.email.trim();
    if (!email) erros.email = "Informe o seu e-mail.";
    else if (!EMAIL.test(email) || email.length > 150) erros.email = "Este e-mail não parece válido. Confira se digitou o @ e o domínio.";

    if (!form.mesmo_email) {
      const nf = form.email_nf.trim();
      if (!nf) erros.email_nf = "Informe o e-mail para envio da nota fiscal.";
      else if (!EMAIL.test(nf) || nf.length > 150) erros.email_nf = "Este e-mail não parece válido.";
    }
  }

  if (etapa === 2) {
    if (!form.cargo.trim()) erros.cargo = "Informe o cargo ou a função.";
    else if (excede(form.cargo, 120)) erros.cargo = "Use no máximo 120 caracteres.";

    const n = Number(form.num_posicoes);
    if (!form.num_posicoes.trim() || !Number.isInteger(n) || n < 1 || n > 99) erros.num_posicoes = "Informe quantas vagas (de 1 a 99).";

    if (!form.cidade.trim()) erros.cidade = "Informe a cidade.";
    else if (excede(form.cidade, 100)) erros.cidade = "Use no máximo 100 caracteres.";

    if (!form.estado) erros.estado = "Escolha o estado.";
    else if (!(ESTADOS as readonly string[]).includes(form.estado)) erros.estado = "Escolha um estado da lista.";

    if (excede(form.local_trabalho, 300)) erros.local_trabalho = "Use no máximo 300 caracteres.";
    if (form.previsao_inicio && !DATA_ISO.test(form.previsao_inicio)) erros.previsao_inicio = "Data inválida.";
    if (excede(form.salario, 100)) erros.salario = "Use no máximo 100 caracteres.";
    if (excede(form.adicionais_salariais, 300)) erros.adicionais_salariais = "Use no máximo 300 caracteres.";

    if (form.horario.tipo === "personalizado" && !form.horario.custom.trim()) erros.horario = "Descreva o horário ou a jornada.";
    else if (gerarHorarioTexto(form.horario).length > 300) erros.horario = "Use no máximo 300 caracteres.";
  }

  if (etapa === 3) {
    if (excede(form.idade, 60)) erros.idade = "Use no máximo 60 caracteres.";
    if (form.habilitacao === "sim" && !form.habilitacao_categoria) erros.habilitacao_categoria = "Escolha a categoria da habilitação.";
    if (excede(form.principais_atividades, 3000)) erros.principais_atividades = "Use no máximo 3000 caracteres.";
    if (excede(form.observacoes, 2000)) erros.observacoes = "Use no máximo 2000 caracteres.";
  }

  if (etapa === 4) {
    if (!form.aceite) erros.aceite = "Para enviar, confirme que leu e está de acordo com as condições comerciais.";
  }
  return erros;
}

export function validarTudo(form: FormPublico): { etapa: Etapa; erros: ErrosForm } | null {
  for (const etapa of [1, 2, 3, 4] as Etapa[]) {
    const erros = validarEtapa(etapa, form);
    if (Object.keys(erros).length > 0) return { etapa, erros };
  }
  return null;
}

// Corpo do POST. Não leva tipo de serviço nem condições: o servidor fixa R&S e lê as condições do próprio link.
export function montarCorpoEnvio(form: FormPublico) {
  const horarioTexto = gerarHorarioTexto(form.horario);
  const requisitosTexto = gerarRequisitosTexto(form.requisitos);
  const requisitosLista = listarRequisitos(form.requisitos);
  const beneficiosTexto = gerarBeneficiosTexto(form.beneficios);
  const vazioParaNulo = (v: string) => v.trim() || null;
  return {
    website: form.website,
    tipo_pessoa: form.tipo_pessoa,
    nome: form.nome.trim(),
    documento: somenteDigitos(form.documento),
    contato_nome: form.tipo_pessoa === "pj" ? vazioParaNulo(form.contato_nome) : null,
    telefone: form.telefone.trim(),
    endereco: vazioParaNulo(form.endereco),
    email: form.email.trim(),
    email_nf: emailNfEfetivo(form),
    cargo: form.cargo.trim(),
    num_posicoes: Number(form.num_posicoes) || 1,
    cidade: form.cidade.trim(),
    estado: form.estado,
    local_trabalho: vazioParaNulo(form.local_trabalho),
    previsao_inicio: form.previsao_inicio || null,
    salario: salarioParaEnvio(form),
    adicionais_salariais: form.salario_modo === "fixo" ? vazioParaNulo(form.adicionais_salariais) : null,
    horario_tipo: form.horario.tipo || null,
    horario_texto: horarioTexto || null,
    requisitos: requisitosTexto || null,
    requisitos_chips: requisitosLista.length > 0 ? requisitosLista : null,
    beneficios: beneficiosTexto || null,
    beneficios_chips: gerarBeneficiosChips(form.beneficios),
    principais_atividades: vazioParaNulo(form.principais_atividades),
    observacoes: vazioParaNulo(form.observacoes),
    sexo: form.sexo,
    idade: vazioParaNulo(form.idade),
    pcd: form.pcd,
    habilitacao_categoria: form.habilitacao === "sim" ? form.habilitacao_categoria || null : null,
    veiculo_proprio: form.veiculo_proprio,
    aceite_condicoes: form.aceite,
  };
}

const ROTULO_SEXO: Record<Sexo, string> = { masc: "Masculino", fem: "Feminino", indiferente: "Indiferente" };

// Linhas do cartão "Confira a sua solicitação" (só texto; o React escapa na hora de exibir).
export interface SecaoResumo {
  titulo: string;
  linhas: { rotulo: string; valor: string }[];
}

export function resumoDaSolicitacao(form: FormPublico): SecaoResumo[] {
  const pj = form.tipo_pessoa === "pj";
  const preenchidas = (linhas: { rotulo: string; valor: string | null | undefined }[]) =>
    linhas.filter((l) => l.valor && l.valor.trim()).map((l) => ({ rotulo: l.rotulo, valor: l.valor!.trim() }));
  return [
    {
      titulo: "Contratante",
      linhas: preenchidas([
        { rotulo: pj ? "Empresa" : "Nome", valor: form.nome },
        { rotulo: pj ? "CNPJ" : "CPF", valor: form.documento },
        { rotulo: "Contato", valor: pj ? form.contato_nome : null },
        { rotulo: "Telefone", valor: form.telefone },
        { rotulo: "E-mail", valor: form.email },
        { rotulo: "E-mail para nota fiscal", valor: emailNfEfetivo(form) },
        { rotulo: "Endereço", valor: form.endereco },
      ]),
    },
    {
      titulo: "A vaga",
      linhas: preenchidas([
        { rotulo: "Cargo", valor: form.cargo },
        { rotulo: "Vagas", valor: form.num_posicoes },
        { rotulo: "Local", valor: [form.cidade.trim(), form.estado].filter(Boolean).join(" / ") },
        { rotulo: "Local de trabalho", valor: form.local_trabalho },
        { rotulo: "Previsão de início", valor: form.previsao_inicio ? form.previsao_inicio.split("-").reverse().join("/") : null },
        { rotulo: "Salário", valor: salarioLegivel(form) },
        { rotulo: "Adicionais", valor: form.salario_modo === "fixo" ? form.adicionais_salariais : null },
        { rotulo: "Horário", valor: gerarHorarioTexto(form.horario) },
        { rotulo: "Benefícios", valor: listarBeneficios(form.beneficios).join(", ") },
      ]),
    },
    {
      titulo: "Perfil e qualificações",
      linhas: preenchidas([
        { rotulo: "Sexo", valor: ROTULO_SEXO[form.sexo] },
        { rotulo: "Idade", valor: form.idade },
        { rotulo: "PCD", valor: form.pcd === "sim" ? "Sim" : "Não" },
        { rotulo: "Habilitação", valor: form.habilitacao === "sim" ? `Categoria ${form.habilitacao_categoria}` : "Não" },
        { rotulo: "Veículo próprio", valor: form.veiculo_proprio === "sim" ? "Sim" : "Não" },
        { rotulo: "Qualificações", valor: listarRequisitos(form.requisitos).join(", ") },
        { rotulo: "Principais atividades", valor: form.principais_atividades },
        { rotulo: "Outras informações", valor: form.observacoes },
      ]),
    },
  ];
}

