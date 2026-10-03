// Núcleo PURO do resolvedor de destinatários de avisos (sem imports de servidor): recebe uma
// "fonte" de dados injetada, por isso roda igual no app e no script de verificação
// (scripts/verificar-avisos-resolvedor.mts). O acesso real ao Supabase fica em src/lib/avisos.ts.

export type CanalAviso = "email" | "sino" | "popup";
export type ModoAviso = "legado" | "desligado" | "configurado";

export interface LinhaDestinatario {
  tipo_destinatario: "usuario" | "email";
  usuario_id: string | null;
  email: string | null;
  nome: string | null;
  ativo: boolean;
}

// canalAtivo === null significa "não há linha de liga/desliga" (= ligado, como sempre foi).
export interface DadosAviso {
  canalAtivo: boolean | null;
  linhas: LinhaDestinatario[];
}

export interface PerfilAnalista {
  user_id: string;
  ativo: boolean | null;
  unidade_id: string | null;
  acesso_todas_unidades: boolean | null;
  email: string | null;
}

export interface FonteAvisos {
  // null = erro ao ler (ex.: tabelas novas ainda não migradas) → cai no antigo.
  carregarNovo(evento: string, canal: CanalAviso): Promise<DadosAviso | null>;
  // null = erro ao ler a configuração antiga.
  carregarAntigo(evento: string, canal: CanalAviso): Promise<DadosAviso | null>;
  carregarPerfis(userIds: string[]): Promise<PerfilAnalista[] | null>;
}

export interface ResolucaoAviso {
  modo: ModoAviso;
  // De onde saiu a decisão: tabelas novas ou (fallback) tabelas antigas.
  fonte: "novo" | "antigo";
  emails: { nome: string; email: string }[];
  userIds: string[];
  // true quando não deu para ler a configuração. O chamador decide o que fazer (vagas: legado;
  // rescisão/ASO: o disparo conta como não-sucesso, como antes).
  falhou: boolean;
}

export function analistaAtendeUnidade(
  a: { unidade_id: string | null; acesso_todas_unidades: boolean | null },
  unidadeId: string | null | undefined
): boolean {
  if (!unidadeId) return true;
  return a.acesso_todas_unidades === true || a.unidade_id === unidadeId;
}

function temDados(d: DadosAviso | null): d is DadosAviso {
  return !!d && (d.canalAtivo !== null || d.linhas.length > 0);
}

// unidadeId: `undefined` = sem filtro algum de analista (comportamento de rescisão/ASO);
// qualquer outro valor (inclusive null) = só analistas ativos que atendem a unidade (vagas).
export async function resolverComFonte(
  fonte: FonteAvisos,
  evento: string,
  canal: CanalAviso,
  unidadeId?: string | null
): Promise<ResolucaoAviso> {
  const vazio = (modo: ModoAviso, origem: "novo" | "antigo", falhou = false): ResolucaoAviso => ({
    modo,
    fonte: origem,
    emails: [],
    userIds: [],
    falhou,
  });

  let origem: "novo" | "antigo" = "novo";
  let dados: DadosAviso | null = null;
  try {
    dados = await fonte.carregarNovo(evento, canal);
  } catch {
    dados = null;
  }
  if (!temDados(dados)) {
    origem = "antigo";
    try {
      dados = await fonte.carregarAntigo(evento, canal);
    } catch {
      dados = null;
    }
    if (!dados) return vazio("legado", "antigo", true);
  }

  if (dados.canalAtivo === false) return vazio("desligado", origem);

  const ativos = dados.linhas.filter((l) => l.ativo);
  if (ativos.length === 0) return vazio("legado", origem);

  const usuarioIds = [...new Set(ativos.filter((l) => l.tipo_destinatario === "usuario" && l.usuario_id).map((l) => l.usuario_id as string))];
  const filtrar = unidadeId !== undefined;
  const precisaPerfis = usuarioIds.length > 0 && (filtrar || canal === "email");

  let perfis = new Map<string, PerfilAnalista>();
  if (precisaPerfis) {
    const lista = await fonte.carregarPerfis(usuarioIds);
    if (!lista) return vazio("legado", origem, true);
    perfis = new Map(lista.map((p) => [p.user_id, p]));
  }

  const passa = (userId: string): PerfilAnalista | null => {
    const p = perfis.get(userId);
    if (!p || p.ativo !== true) return null;
    if (filtrar && !analistaAtendeUnidade(p, unidadeId)) return null;
    return p;
  };

  if (canal === "sino") {
    const userIds = filtrar ? usuarioIds.filter((id) => passa(id) !== null) : usuarioIds;
    return { modo: "configurado", fonte: origem, emails: [], userIds, falhou: false };
  }

  // E-mail (e popup, que hoje não tem lista própria): endereços livres + usuários com e-mail.
  const vistos = new Set<string>();
  const emails: { nome: string; email: string }[] = [];
  const adicionar = (nome: string | null, email: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e || vistos.has(e)) return;
    vistos.add(e);
    emails.push({ nome: nome?.trim() || e, email: e });
  };
  for (const l of ativos) {
    if (l.tipo_destinatario === "email") adicionar(l.nome, l.email);
  }
  for (const id of usuarioIds) {
    const p = passa(id);
    if (p) adicionar(null, p.email);
  }
  return { modo: "configurado", fonte: origem, emails, userIds: [], falhou: false };
}
