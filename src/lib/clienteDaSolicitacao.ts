import { mascararCnpj, mascararCpf, somenteDigitos, validarCnpj, validarCpf } from "./documentoBr";
import { normalizarCnpj, normalizarCpf, normalizarEmail, normalizarTelefone } from "./clienteDuplicidade";

// Cadastro de cliente a partir de uma solicitação do link público (R&S): o que a solicitação já traz vira valor inicial do cadastro e, num
// cliente que já existe, só completa o que está VAZIO. Módulo puro (sem I/O, sem imports de servidor): roda no navegador, na rota e no script.
// Regra do projeto de nunca decidir "no escuro": o que a solicitação não traz (segmento, contato da pessoa física...) fica vazio para o analista
// preencher; documento ambíguo ou inválido não é copiado, só sinalizado.

export type TipoPessoa = "pj" | "pf";

export interface SolicitacaoParaCliente {
  cliente_nome?: string | null;
  cidade?: string | null;
  unidade_id?: string | null;
  tipo_servico?: string | null;
  dados_empresa?: {
    tipo_pessoa?: string | null;
    nome?: string | null;
    cnpj_cpf?: string | null;
    contato_nome?: string | null;
    telefone?: string | null;
    email?: string | null;
    email_nf?: string | null;
    endereco?: string | null;
  } | null;
}

export interface PrefillCliente {
  tipo_pessoa: TipoPessoa;
  nome: string | null;
  cnpj: string | null;
  cpf: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  email_nota_fiscal: string | null;
  endereco: string | null;
  cidade: string | null;
  segmento: string | null;
  servicos: string[];
  // SUGESTÃO editável no modal (quem gerou o link): nunca é gravada sem o analista ver, e o texto não é normalizado (no banco é texto livre).
  responsavel_comercial: string | null;
  unidade_id: string | null;
}

export type AvisoPrefill = "documento_ausente" | "documento_invalido" | "documento_incompativel_com_tipo" | "tipo_pessoa_inferido" | "cidade_do_local_de_trabalho";

export const MENSAGEM_AVISO_PREFILL: Record<AvisoPrefill, string> = {
  documento_ausente: "A solicitação não trouxe CPF/CNPJ. Preencha com o cliente, se tiver.",
  documento_invalido: "O CPF/CNPJ enviado não passa na validação dos dígitos. Não foi copiado: confira com o cliente.",
  documento_incompativel_com_tipo: "O documento enviado não bate com o tipo de pessoa (CPF para pessoa física, CNPJ para jurídica). Não foi copiado: confira com o cliente.",
  tipo_pessoa_inferido: "A solicitação não informava se é pessoa física ou jurídica; o tipo foi deduzido pelo tamanho do documento. Confira.",
  cidade_do_local_de_trabalho: "A cidade veio do local de trabalho da vaga, não necessariamente da sede da empresa. Confira a cidade do cliente.",
};

// Os únicos campos NOT NULL de clientes (fora os que têm padrão no banco) que o analista precisa ter preenchidos para salvar.
export const CAMPOS_OBRIGATORIOS_CLIENTE = ["nome", "contato_nome", "contato_telefone", "contato_email", "cidade", "segmento"] as const;
export type CampoObrigatorioCliente = (typeof CAMPOS_OBRIGATORIOS_CLIENTE)[number];

export interface ResultadoPrefill {
  valores: PrefillCliente;
  avisos: AvisoPrefill[];
  // Nomes dos campos (nunca valores) que vieram preenchidos da solicitação e dos obrigatórios que ficaram vazios para o analista.
  // `preenchidos` é só o que o cliente informou no link: a unidade (forçada pelo servidor) e o responsável comercial (sugerido por quem gerou o
  // link) NÃO entram aqui, para a tela não dizer que vieram da solicitação.
  preenchidos: string[];
  // Campos que o sistema SUGERE, não vindos da solicitação: o analista confere e pode trocar.
  sugeridos: string[];
  faltando: CampoObrigatorioCliente[];
}

const vazio = (v: unknown): boolean => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// "" e só espaços viram null (o check do banco, cpf is null or cnpj is null, falharia com "" no lugar de null).
export function vazioParaNulo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function texto(v: unknown): string | null {
  return vazioParaNulo(v);
}

interface DocumentoDaSolicitacao {
  cnpj: string | null;
  cpf: string | null;
  tipo: TipoPessoa;
  // false = a solicitação não disse nem permite deduzir o tipo: "pj" é só o padrão do cadastro, não um dado vindo dela.
  tipoInformado: boolean;
  avisos: AvisoPrefill[];
}

function documentoDaSolicitacao(dados: NonNullable<SolicitacaoParaCliente["dados_empresa"]>): DocumentoDaSolicitacao {
  const bruto = texto(dados.cnpj_cpf);
  const declarado: TipoPessoa | null = dados.tipo_pessoa === "pf" || dados.tipo_pessoa === "pj" ? dados.tipo_pessoa : null;
  const digitos = bruto ? somenteDigitos(bruto) : "";
  const avisos: AvisoPrefill[] = [];

  let tipo: TipoPessoa;
  let tipoInformado = true;
  if (declarado) {
    tipo = declarado;
  } else if (digitos.length === 11) {
    tipo = "pf";
    avisos.push("tipo_pessoa_inferido");
  } else if (digitos.length === 14) {
    tipo = "pj";
    avisos.push("tipo_pessoa_inferido");
  } else {
    tipo = "pj";
    tipoInformado = false;
  }

  if (!bruto) {
    avisos.push("documento_ausente");
    return { cnpj: null, cpf: null, tipo, tipoInformado, avisos };
  }
  const tamanhoEsperado = tipo === "pf" ? 11 : 14;
  if (digitos.length !== tamanhoEsperado) {
    avisos.push((digitos.length === 11 || digitos.length === 14) ? "documento_incompativel_com_tipo" : "documento_invalido");
    return { cnpj: null, cpf: null, tipo, tipoInformado, avisos };
  }
  if (tipo === "pf") {
    if (!validarCpf(digitos)) {
      avisos.push("documento_invalido");
      return { cnpj: null, cpf: null, tipo, tipoInformado, avisos };
    }
    return { cnpj: null, cpf: mascararCpf(digitos), tipo, tipoInformado, avisos };
  }
  if (!validarCnpj(digitos)) {
    avisos.push("documento_invalido");
    return { cnpj: null, cpf: null, tipo, tipoInformado, avisos };
  }
  return { cnpj: mascararCnpj(digitos), cpf: null, tipo, tipoInformado, avisos };
}

// Valores iniciais do cadastro. `opcoes.responsavelComercial` é quem gerou o link (vem do link, não da solicitação). Pessoa física: o contato
// fica vazio (usar o próprio nome é decisão do analista no modal). Nada é inventado: segmento sempre vazio; serviços só o que a solicitação pediu.
export function montarPrefillCliente(solicitacao: SolicitacaoParaCliente | null | undefined, opcoes: { responsavelComercial?: string | null } = {}): ResultadoPrefill {
  const dados = solicitacao?.dados_empresa ?? {};
  const doc = documentoDaSolicitacao(dados);
  const tipoServico = texto(solicitacao?.tipo_servico);

  const valores: PrefillCliente = {
    tipo_pessoa: doc.tipo,
    nome: texto(dados.nome) ?? texto(solicitacao?.cliente_nome),
    cnpj: doc.cnpj,
    cpf: doc.cpf,
    contato_nome: doc.tipo === "pf" ? null : texto(dados.contato_nome),
    contato_telefone: texto(dados.telefone),
    contato_email: texto(dados.email),
    email_nota_fiscal: texto(dados.email_nf),
    endereco: texto(dados.endereco),
    cidade: texto(solicitacao?.cidade),
    segmento: null,
    servicos: tipoServico ? [tipoServico] : [],
    responsavel_comercial: texto(opcoes.responsavelComercial),
    unidade_id: texto(solicitacao?.unidade_id),
  };

  const preenchidos = (Object.keys(valores) as (keyof PrefillCliente)[]).filter((campo) => {
    if (campo === "unidade_id" || campo === "responsavel_comercial") return false;
    if (campo === "tipo_pessoa") return doc.tipoInformado;
    const v = valores[campo];
    return Array.isArray(v) ? v.length > 0 : !vazio(v);
  });
  const faltando = CAMPOS_OBRIGATORIOS_CLIENTE.filter((campo) => vazio(valores[campo]));
  // A cidade da solicitação é a do local de trabalho da vaga, que nem sempre é a sede do cliente.
  const avisos: AvisoPrefill[] = valores.cidade ? [...doc.avisos, "cidade_do_local_de_trabalho"] : doc.avisos;
  const sugeridos = valores.responsavel_comercial ? ["responsavel_comercial"] : [];
  return { valores, avisos, preenchidos, sugeridos, faltando };
}

// ── Documento do cadastro que o analista confirmou no modal ──────────────────

export type ResultadoDocumento =
  | { ok: true; cnpj: string | null; cpf: string | null }
  | { ok: false; campo: "cnpj" | "cpf"; erro: string };

// Vazio vira null; pessoa física só tem CPF e jurídica só tem CNPJ (nunca os dois, como o check do banco); dígitos verificadores conferidos.
// Documento é opcional no cadastro (a Cobrança R&S é que exige): ambos vazios é válido.
// `modoLegado` (cadastro de cliente que já existia antes do CPF): o CNPJ segue como foi digitado, sem conferir dígitos nem aplicar máscara,
// porque os cadastros antigos aceitam texto livre; o CPF é novo e sempre é conferido.
export function validarDocumentoDoCliente(
  entrada: { tipo_pessoa: TipoPessoa; cnpj?: string | null; cpf?: string | null },
  opcoes: { modoLegado?: boolean } = {}
): ResultadoDocumento {
  const cnpj = vazioParaNulo(entrada.cnpj);
  const cpf = vazioParaNulo(entrada.cpf);
  if (entrada.tipo_pessoa === "pf") {
    if (cnpj) return { ok: false, campo: "cnpj", erro: "Pessoa física não tem CNPJ. Remova o CNPJ ou troque o tipo para pessoa jurídica." };
    if (cpf && !validarCpf(cpf)) return { ok: false, campo: "cpf", erro: "CPF inválido. Confira os números." };
    return { ok: true, cnpj: null, cpf: cpf ? mascararCpf(cpf) : null };
  }
  if (cpf) return { ok: false, campo: "cpf", erro: "Pessoa jurídica não tem CPF. Remova o CPF ou troque o tipo para pessoa física." };
  if (opcoes.modoLegado) return { ok: true, cnpj, cpf: null };
  if (cnpj && !validarCnpj(cnpj)) return { ok: false, campo: "cnpj", erro: "CNPJ inválido. Confira os números." };
  return { ok: true, cnpj: cnpj ? mascararCnpj(cnpj) : null, cpf: null };
}

// ── Completar um cliente que já existe ───────────────────────────────────────

export interface ClienteExistenteParaCompletar {
  tipo_pessoa?: string | null;
  nome?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  contato_nome?: string | null;
  contato_telefone?: string | null;
  contato_email?: string | null;
  email_nota_fiscal?: string | null;
  endereco?: string | null;
  cidade?: string | null;
}

// responsavel_comercial fica de fora de propósito: é só sugestão no cadastro novo e nunca entra num cliente existente sem o analista escolher.
export const CAMPOS_COMPLETAVEIS = [
  "cnpj", "cpf", "contato_nome", "contato_telefone", "contato_email", "email_nota_fiscal", "endereco", "cidade",
] as const;
export type CampoCompletavel = (typeof CAMPOS_COMPLETAVEIS)[number];

export interface ResultadoCompletar {
  // Só o que será gravado (campos que estavam vazios). Contém valores: nunca vai para log nem para auditoria.
  valores: Partial<Record<CampoCompletavel, string>>;
  // Só NOMES de campos.
  preenchidos: CampoCompletavel[];
  // Nomes de campos em que o cadastro já tem outro valor (ou outro tipo de documento) e a solicitação traz algo diferente: mantidos como estão.
  divergentes: string[];
}

const semAcento = (v: string): string => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function iguais(campo: string, a: string, b: string): boolean {
  switch (campo) {
    case "cnpj": return normalizarCnpj(a) !== null && normalizarCnpj(a) === normalizarCnpj(b);
    case "cpf": return normalizarCpf(a) !== null && normalizarCpf(a) === normalizarCpf(b);
    case "contato_telefone": return normalizarTelefone(a) !== null && normalizarTelefone(a) === normalizarTelefone(b);
    case "contato_email":
    case "email_nota_fiscal": return normalizarEmail(a) !== null && normalizarEmail(a) === normalizarEmail(b);
    default: return semAcento(a) === semAcento(b);
  }
}

// Completa SÓ o que está vazio no cliente existente (vazio = nulo, "" ou só espaços). Nunca sobrescreve: campo preenchido segue como está e, se a
// solicitação traz outro valor, o nome do campo vai para `divergentes`. Documento respeita o tipo do cadastro (CPF só em pessoa física, CNPJ só em
// jurídica) e nunca coloca CPF e CNPJ juntos.
export function completarSomenteVazios(existente: ClienteExistenteParaCompletar, prefill: PrefillCliente): ResultadoCompletar {
  const valores: Partial<Record<CampoCompletavel, string>> = {};
  const preenchidos: CampoCompletavel[] = [];
  const divergentes: string[] = [];
  const tipoDoCadastro: TipoPessoa = existente.tipo_pessoa === "pf" ? "pf" : "pj";

  for (const campo of CAMPOS_COMPLETAVEIS) {
    const novo = prefill[campo];
    if (vazio(novo)) continue;
    const atual = existente[campo];

    if (campo === "cnpj" || campo === "cpf") {
      const documentoDoTipo = campo === "cpf" ? tipoDoCadastro === "pf" : tipoDoCadastro === "pj";
      const outroDocumento = campo === "cpf" ? existente.cnpj : existente.cpf;
      if (!documentoDoTipo || !vazio(outroDocumento)) {
        divergentes.push(campo);
        continue;
      }
    }

    if (vazio(atual)) {
      valores[campo] = String(novo).trim();
      preenchidos.push(campo);
    } else if (!iguais(campo, String(atual), String(novo))) {
      divergentes.push(campo);
    }
  }

  if (!vazio(prefill.nome) && !vazio(existente.nome) && !iguais("nome", String(existente.nome), String(prefill.nome))) divergentes.push("nome");
  return { valores, preenchidos, divergentes };
}

// Documento que a solicitação traria para um cliente existente, mas que já pertence a OUTRO cadastro (qualquer unidade, ativo ou inativo): não é
// gravado, o campo vai para `divergentes`. `outros` são as identidades já carregadas da checagem de duplicidade; nada delas sai daqui.
export function retirarDocumentosJaCadastrados(
  completar: ResultadoCompletar,
  existenteId: string,
  outros: { id: string; cnpj?: string | null; cpf?: string | null }[]
): ResultadoCompletar {
  const valores = { ...completar.valores };
  const divergentes = [...completar.divergentes];
  const preenchidos = completar.preenchidos.filter((campo) => {
    if (campo !== "cnpj" && campo !== "cpf") return true;
    const chave = campo === "cnpj" ? normalizarCnpj(valores[campo]) : normalizarCpf(valores[campo]);
    const jaExiste = !!chave && outros.some((o) => o.id !== existenteId && (campo === "cnpj" ? normalizarCnpj(o.cnpj) : normalizarCpf(o.cpf)) === chave);
    if (!jaExiste) return true;
    delete valores[campo];
    divergentes.push(campo);
    return false;
  });
  return { valores, preenchidos, divergentes };
}

// Textos da tela (só nomes de campos, nunca valores).
export const ROTULO_CAMPO_CLIENTE: Record<string, string> = {
  nome: "Nome",
  cnpj: "CNPJ",
  cpf: "CPF",
  contato_nome: "Nome do contato",
  contato_telefone: "Telefone",
  contato_email: "E-mail de comunicação",
  email_nota_fiscal: "E-mail da nota fiscal",
  endereco: "Endereço",
  cidade: "Cidade",
  segmento: "Segmento",
  tipo_pessoa: "Tipo de pessoa",
  servicos: "Tipos de serviço",
  responsavel_comercial: "Responsável comercial",
  unidade_id: "Unidade",
};

export function rotularCampos(nomes: readonly string[]): string {
  return nomes.map((n) => ROTULO_CAMPO_CLIENTE[n] ?? n).join(", ");
}

export type SituacaoDaVaga = "vinculada" | "vaga_nao_alterada" | "sem_vaga";

export function explicarSituacaoDaVaga(vaga: SituacaoDaVaga): string {
  switch (vaga) {
    case "vinculada":
      return "A vaga criada a partir desta solicitação também foi vinculada ao cliente: a cobrança de R&S poderá ser gerada.";
    case "vaga_nao_alterada":
      return "A vaga desta solicitação não foi alterada: ela já tinha outro cliente ou é de outra unidade. Confira o cliente da vaga em Vagas.";
    default:
      return "A vaga ainda não foi criada. Ao aprovar a solicitação, ela já nasce com este cliente.";
  }
}

// Faixa "Cliente X vinculado à solicitação" no topo do modal. `vagaPendente` marca a que diz "a vaga ainda não foi criada": esse texto só vale até o
// analista decidir a solicitação (criar a vaga ou recusar). `solicitacaoId` diz de qual solicitação a faixa fala.
export interface AvisoDoCliente {
  tipo: "ok" | "atencao";
  titulo: string;
  linhas: string[];
  solicitacaoId?: string;
  vagaPendente?: boolean;
}

export const TEXTO_VAGA_CRIADA_COM_O_CLIENTE = "A vaga desta solicitação foi criada já com este cliente: a cobrança de R&S poderá ser gerada.";
export const TEXTO_SOLICITACAO_RECUSADA_SEM_VAGA = "A solicitação foi recusada: nenhuma vaga será criada a partir dela.";

// Depois de criar a vaga ou recusar a solicitação, a linha "A vaga ainda não foi criada. Ao aprovar…" deixou de ser verdade: troca só ela pelo que
// aconteceu de fato. Faixa de outra solicitação, ou que nunca disse isso, fica como está (mesma referência).
export function avisoAposDecisaoDaSolicitacao(aviso: AvisoDoCliente | null, solicitacaoId: string, decisao: "vaga_criada" | "recusada"): AvisoDoCliente | null {
  if (!aviso || !aviso.vagaPendente || aviso.solicitacaoId !== solicitacaoId) return aviso;
  const antes = explicarSituacaoDaVaga("sem_vaga");
  const depois = decisao === "vaga_criada" ? TEXTO_VAGA_CRIADA_COM_O_CLIENTE : TEXTO_SOLICITACAO_RECUSADA_SEM_VAGA;
  return { ...aviso, vagaPendente: false, linhas: aviso.linhas.map((l) => (l === antes ? depois : l)) };
}

// "Reativar e vincular" são dois passos: o cadastro é reativado e só depois a solicitação é vinculada. Se o vínculo falha com o cadastro já reativado, a mensagem
// tem de dizer isso (senão parece que nada aconteceu, e a reativação não se desfaz sozinha). `tentarDeNovo` é false quando repetir não resolve (solicitação já decidida).
export function mensagemVinculoAposReativacao(clienteNome: string, motivo?: string | null, opcoes: { tentarDeNovo?: boolean } = {}): string {
  const m = (motivo ?? "").trim();
  const detalhe = m ? ` ${/[.!?]$/.test(m) ? m : `${m}.`}` : "";
  const retomada = opcoes.tentarDeNovo === false ? "" : " Tente vincular de novo.";
  return `O cliente "${clienteNome}" foi reativado, mas o vínculo com a solicitação não foi concluído.${detalhe}${retomada}`;
}

// Resposta de vincular-cliente em que a SOLICITAÇÃO mudou (já vinculada, decidida, recusada): a tela fecha o formulário e recarrega a lista.
// Qualquer outro 409 (duplicidade, reativação, índice único sem cadastro visível) fica no formulário, sem perder o que foi digitado.
export function solicitacaoFicouIndisponivel(status: number, corpo: unknown): boolean {
  return status === 409 && typeof corpo === "object" && corpo !== null && (corpo as { solicitacao_indisponivel?: unknown }).solicitacao_indisponivel === true;
}

interface SolicitacaoParaAvisoDeCliente {
  origem?: string | null;
  cliente_id?: string | null;
}

// Solicitação do link ainda sem cliente vinculado: criar a vaga a partir dela gera uma vaga sem cobrança de R&S, então a tela pede confirmação.
export function semClienteVinculado(s: SolicitacaoParaAvisoDeCliente): boolean {
  return s.origem === "link_publico" && !s.cliente_id;
}

// Aba "Aprovadas sem cliente": das solicitações aprovadas, só as do link que ainda não têm cliente.
export function aprovadasSemCliente<T extends SolicitacaoParaAvisoDeCliente & { status?: string | null }>(lista: T[]): T[] {
  return lista.filter((s) => s.status === "aprovada" && semClienteVinculado(s));
}

// ── Foco dos modais ──────────────────────────────────────────────────────────
// Por que o diálogo/modal fechou. Só "cancelar" e "confirmar" (criar a vaga mesmo assim) devolvem o foco ao botão de origem; "abrir_outro_modal" não,
// porque o foco vai para dentro do modal que abre (devolvê-lo ao botão de trás deixaria Enter/Espaço acionando um botão escondido atrás do formulário).
export type MotivoDeFechamento = "cancelar" | "confirmar" | "abrir_outro_modal" | "desconhecido";

export function devolverFocoAoFechar(motivo: MotivoDeFechamento, origemAindaNoDom: boolean): boolean {
  if (!origemAindaNoDom) return false;
  return motivo === "cancelar" || motivo === "confirmar";
}

export type CampoDoFocoInicial = "nome" | "cidade" | "segmento" | "contato_nome" | "contato_telefone" | "contato_email";

// Na ordem em que os campos aparecem no formulário.
const ORDEM_VISUAL_OBRIGATORIOS: CampoDoFocoInicial[] = ["nome", "cidade", "segmento", "contato_nome", "contato_telefone", "contato_email"];

// Primeiro campo a receber o foco ao abrir o cadastro: a partir da solicitação, o primeiro obrigatório ainda vazio; senão (ou fora da solicitação) o
// primeiro campo de texto, o nome. Recebe os valores iniciais (e não o estado do formulário, que ainda é preenchido no mesmo ciclo da abertura).
export function campoParaFocoInicial(
  valoresIniciais: Partial<Record<CampoDoFocoInicial, string | null>> | undefined,
  aPartirDaSolicitacao: boolean
): CampoDoFocoInicial {
  if (aPartirDaSolicitacao) {
    const vazioAinda = ORDEM_VISUAL_OBRIGATORIOS.find((c) => vazio(valoresIniciais?.[c]));
    if (vazioAinda) return vazioAinda;
  }
  return "nome";
}

// Esc dentro de um modal de cadastro: um <select> (ou qualquer elemento com popup aberto, aria-expanded="true") usa o Esc para fechar a própria lista,
// então o Esc dele nunca fecha o modal. Recebe só o necessário do evento para rodar fora do navegador (nos testes).
export function escapeDeveFecharModal(evento: { key: string; alvo: { tagName?: string; closest?: (seletor: string) => unknown } | null }): boolean {
  if (evento.key !== "Escape") return false;
  const alvo = evento.alvo;
  if (!alvo) return true;
  if (typeof alvo.tagName === "string" && alvo.tagName.toUpperCase() === "SELECT") return false;
  if (typeof alvo.closest === "function" && alvo.closest('[aria-expanded="true"]')) return false;
  return true;
}
