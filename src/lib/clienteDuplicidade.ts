// Trava contra cadastro duplicado de CLIENTES. Módulo puro (sem imports): usado nas rotas
// POST /api/clientes, PATCH /api/clientes/[id], PATCH /api/cobrancas-rs/[id] e no script de verificação.
//
// REGRAS (decisão do Olver):
//  1) CNPJ igual (só dígitos) a QUALQUER cliente, ativo ou inativo = bloqueio, sem liberação.
//  2) Telefone E e-mail iguais ao MESMO cliente = bloqueio; só PAPEIS_FULL_ACCESS libera (liberar_bloqueio).
//  3) Qualquer outra coincidência (só um sinal, ou dois que não sejam telefone+e-mail) = aviso, com
//     "cadastrar mesmo assim" (confirmar_duplicidade). Nome parecido e endereço só contam como aviso.
//  4) Coincidência com cliente INATIVO: oferece reativar o cadastro antigo (podeReativar).
// A comparação é sempre GLOBAL (todas as unidades, ativos e inativos). Quem não enxerga a unidade do
// cliente que coincidiu recebe existente:null e outraUnidade:true — nunca nome, telefone, e-mail nem CNPJ.

export type CampoIdentidade = "nome" | "cnpj" | "telefone" | "email" | "endereco";

export interface ClienteIdentidade {
  id: string;
  nome: string;
  cidade?: string | null;
  ativo: boolean;
  cnpj?: string | null;
  contato_telefone?: string | null;
  contato_email?: string | null;
  endereco?: string | null;
  unidade_id?: string | null;
}

export interface CandidatoCliente {
  nome?: string | null;
  cnpj?: string | null;
  contato_telefone?: string | null;
  contato_email?: string | null;
  endereco?: string | null;
}

export interface OpcoesAvaliacao {
  papelFull: boolean;
  // "todas" = sócio (vê todas as unidades); senão, as unidades que a pessoa enxerga.
  unidadesPermitidas: "todas" | readonly string[];
  // Edição: o próprio cliente nunca conta como duplicado de si mesmo.
  ignorarId?: string | null;
  // Edição: só os campos que MUDARAM entram na avaliação (reativação considera todos). Sem isto, todos.
  camposConsiderados?: ReadonlySet<CampoIdentidade> | null;
}

export interface ExistenteResumo {
  id: string;
  nome: string;
  cidade: string | null;
  ativo: boolean;
}

export interface ResultadoDuplicidade {
  nivel: "bloqueio" | "aviso";
  // "cnpj" = bloqueio sem liberação; "contato" = telefone+e-mail (liberável); null = só aviso.
  bloqueio: "cnpj" | "contato" | null;
  motivos: CampoIdentidade[];
  existente: ExistenteResumo | null;
  outros: (ExistenteResumo & { motivos: CampoIdentidade[] })[];
  podeConfirmar: boolean;
  podeLiberar: boolean;
  podeReativar: boolean;
  outraUnidade: boolean;
  // SÓ para auditoria no servidor — nunca vai na resposta da API (ver respostaDuplicidade).
  existenteId: string;
}

// Forma jurídica que NÃO distingue empresas. industria/comercio/servicos/brasil NÃO entram aqui de
// propósito: "WGK Industria" × "WGK Indústria Mecânica Ltda" já é pego pelo prefixo sem removê-los.
const SUFIXOS_JURIDICOS = new Set(["ltda", "me", "epp", "eireli", "sa", "cia"]);

const soDigitos = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "");

// CNPJ: 14 dígitos. Qualquer outra coisa (vazio, incompleto) não participa da comparação.
export function normalizarCnpj(v: string | null | undefined): string | null {
  const d = soDigitos(v);
  return d.length === 14 ? d : null;
}

// Telefone: 10 ou 11 dígitos, sem o 55 do país e sem o 0 do DDD. "1999" e afins não participam.
export function normalizarTelefone(v: string | null | undefined): string | null {
  let d = soDigitos(v);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 || d.length === 11 ? d : null;
}

// E-mail: extrai o endereço (cobre "Email: fulano@x.com") em minúsculas.
export function normalizarEmail(v: string | null | undefined): string | null {
  const m = (v ?? "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/);
  return m ? m[0] : null;
}

// Nome: minúsculas, sem acento, sem texto entre parênteses, sem pontuação e sem sufixo jurídico no FIM.
export function tokensNome(nome: string | null | undefined): string[] {
  let s = (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\bs\s*\/\s*a\b/g, " sa ").replace(/\bs\.\s*a\b\.?/g, " sa ");
  const tokens = s.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  while (tokens.length > 1 && SUFIXOS_JURIDICOS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

// Nome parecido = chave igual, OU uma é prefixo da outra POR PALAVRA INTEIRA. O prefixo só vale quando a
// parte comum é mais que um acrônimo solto: a primeira palavra tem >= 4 letras OU o prefixo tem >= 2 palavras
// ("wgk industria" vale; "br" sozinho, não).
export function nomeParecido(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokensNome(a);
  const tb = tokensNome(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!curto.every((palavra, i) => longo[i] === palavra)) return false;
  return curto[0].length >= 4 || curto.length >= 2;
}

// Endereço: rua + primeiro número ("alameda itajuba 3542"). Sem número, não participa.
export function chaveEndereco(v: string | null | undefined): string | null {
  const tokens = (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const chave: string[] = [];
  for (const t of tokens) {
    chave.push(t);
    if (/^\d+$/.test(t) && chave.length >= 2) return chave.join(" ");
  }
  return null;
}

// Quais campos de identidade MUDARAM numa edição (comparando com o valor atual no banco). Reativar
// (ativo false→true) devolve todos: o cadastro volta a valer e precisa passar pela checagem inteira.
export function camposIdentidadeAlterados(
  atual: ClienteIdentidade,
  mudancas: { nome?: string | null; cnpj?: string | null; contato_telefone?: string | null; contato_email?: string | null; ativo?: boolean },
  reativando: boolean
): Set<CampoIdentidade> {
  if (reativando) return new Set<CampoIdentidade>(["nome", "cnpj", "telefone", "email", "endereco"]);
  const campos = new Set<CampoIdentidade>();
  if (mudancas.nome !== undefined && tokensNome(mudancas.nome).join(" ") !== tokensNome(atual.nome).join(" ")) campos.add("nome");
  if (mudancas.cnpj !== undefined && normalizarCnpj(mudancas.cnpj) !== normalizarCnpj(atual.cnpj)) campos.add("cnpj");
  if (mudancas.contato_telefone !== undefined && normalizarTelefone(mudancas.contato_telefone) !== normalizarTelefone(atual.contato_telefone)) campos.add("telefone");
  if (mudancas.contato_email !== undefined && normalizarEmail(mudancas.contato_email) !== normalizarEmail(atual.contato_email)) campos.add("email");
  return campos;
}

// Usado pela cobrança R&S: o CNPJ do snapshot já pertence a OUTRO cliente (qualquer status)?
export function existeCnpjEmOutroCliente(cnpj: string | null | undefined, clientes: readonly ClienteIdentidade[], ignorarId: string | null): boolean {
  const alvo = normalizarCnpj(cnpj);
  if (!alvo) return false;
  return clientes.some((c) => c.id !== ignorarId && normalizarCnpj(c.cnpj) === alvo);
}

interface Coincidencia {
  cliente: ClienteIdentidade;
  motivos: CampoIdentidade[];
  rank: number; // 3 = CNPJ, 2 = telefone+e-mail, 1 = aviso
}

export function avaliarDuplicidade(
  candidato: CandidatoCliente,
  clientes: readonly ClienteIdentidade[],
  opcoes: OpcoesAvaliacao
): ResultadoDuplicidade | null {
  const considerados = opcoes.camposConsiderados ?? null;
  const conta = (campo: CampoIdentidade) => !considerados || considerados.has(campo);

  const cnpj = normalizarCnpj(candidato.cnpj);
  const telefone = normalizarTelefone(candidato.contato_telefone);
  const email = normalizarEmail(candidato.contato_email);
  const endereco = chaveEndereco(candidato.endereco);

  const coincidencias: Coincidencia[] = [];
  for (const c of clientes) {
    if (opcoes.ignorarId && c.id === opcoes.ignorarId) continue;
    const cnpjIgual = !!cnpj && cnpj === normalizarCnpj(c.cnpj);
    const telefoneIgual = !!telefone && telefone === normalizarTelefone(c.contato_telefone);
    const emailIgual = !!email && email === normalizarEmail(c.contato_email);
    // Telefone+e-mail só bloqueia se um dos dois foi alterado (editar outro campo de um cadastro que já
    // convive com um "gêmeo" legítimo, como Hewitt × Rogon, não pode travar).
    const contatoBloqueia = telefoneIgual && emailIgual && (!considerados || considerados.has("telefone") || considerados.has("email"));

    const motivos: CampoIdentidade[] = [];
    if (cnpjIgual && conta("cnpj")) motivos.push("cnpj");
    if (telefoneIgual && (contatoBloqueia || conta("telefone"))) motivos.push("telefone");
    if (emailIgual && (contatoBloqueia || conta("email"))) motivos.push("email");
    if (conta("nome") && nomeParecido(candidato.nome, c.nome)) motivos.push("nome");
    if (conta("endereco") && !!endereco && endereco === chaveEndereco(c.endereco)) motivos.push("endereco");
    if (motivos.length === 0) continue;

    coincidencias.push({ cliente: c, motivos, rank: motivos.includes("cnpj") ? 3 : contatoBloqueia ? 2 : 1 });
  }
  if (coincidencias.length === 0) return null;

  // Melhor coincidência: bloqueio por CNPJ > por telefone+e-mail > aviso; depois mais sinais; depois ativo.
  coincidencias.sort(
    (a, b) => b.rank - a.rank || b.motivos.length - a.motivos.length || Number(b.cliente.ativo) - Number(a.cliente.ativo)
  );
  const melhor = coincidencias[0];

  const visivel = (c: ClienteIdentidade) =>
    opcoes.unidadesPermitidas === "todas" || (!!c.unidade_id && opcoes.unidadesPermitidas.includes(c.unidade_id));
  const resumo = (c: ClienteIdentidade): ExistenteResumo => ({ id: c.id, nome: c.nome, cidade: c.cidade ?? null, ativo: c.ativo });

  const bloqueio: ResultadoDuplicidade["bloqueio"] = melhor.rank === 3 ? "cnpj" : melhor.rank === 2 ? "contato" : null;
  const existenteVisivel = visivel(melhor.cliente);
  // Reativar só faz sentido se NÃO houver cadastro ativo coincidindo (senão seria reativar um duplicado).
  const haAtivoCoincidindo = coincidencias.some((c) => c.cliente.ativo);

  return {
    nivel: bloqueio ? "bloqueio" : "aviso",
    bloqueio,
    motivos: melhor.motivos,
    existente: existenteVisivel ? resumo(melhor.cliente) : null,
    outros: coincidencias
      .slice(1)
      .filter((c) => visivel(c.cliente))
      .slice(0, 3)
      .map((c) => ({ ...resumo(c.cliente), motivos: c.motivos })),
    podeConfirmar: bloqueio === null,
    podeLiberar: bloqueio === "contato" && opcoes.papelFull,
    podeReativar: existenteVisivel && !melhor.cliente.ativo && !haAtivoCoincidindo,
    outraUnidade: !existenteVisivel,
    existenteId: melhor.cliente.id,
  };
}
