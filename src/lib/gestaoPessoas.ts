// Gestão de Pessoas (painel de RH): tudo o que a página mostra sobre os funcionários ATIVOS de UMA empresa, calculado na hora a partir do banco
// (sem cache nem tabela de resumo): completar sexo/nascimento/instrução de alguém passa a valer na próxima abertura da página.
//
// Regras de negócio (decisões do Ölver):
//  - só status = 'ativo'; o filtro é SEMPRE funcionarios.cliente_id, nunca o texto "empresa";
//  - "departamento" = cargo (funcionarios.cargo), agrupado por normalização (minúscula, acento, espaços), rótulo pela grafia mais frequente;
//  - sexo, nascimento e instrução vêm de admissao_dados_pessoais (via funcionarios.admissao_id); quem não tem entra como "Não informado";
//  - idade fora de 14 a 90 anos (ex.: 0) é dado inconsistente: conta em "Idade não informada" e a tela só mostra a QUANTIDADE, nunca quem;
//  - idade é calculada por TEXTO (AAAA-MM-DD) contra o "hoje" de America/Sao_Paulo, sem new Date em data pura; quem nasceu em 29/02 completa
//    a idade em 01/03 nos anos comuns, e aparece na lista de aniversariantes no dia 28 (exibindo "29/02");
//  - admissão futura não conta em tempo de casa nem em "admitidos no mês";
//  - cada gráfico fecha com totalAtivos (balde "Não informado" explícito).
// Nada de cor/raça, CPF, endereço nem salário: o carregador só seleciona as colunas listadas abaixo.
import { GRAU_INSTRUCAO_OPTIONS } from "@/lib/admissaoConstants";
import { dataBR } from "@/lib/dataBR";

// ── Tipos ────────────────────────────────────────────────────────────────────
export type FaixaEtaria = "abaixo_18" | "18_20" | "21_30" | "31_40" | "acima_40" | "nao_informada";
export const FAIXAS_ETARIAS: { id: FaixaEtaria; rotulo: string }[] = [
  { id: "abaixo_18", rotulo: "Abaixo de 18" },
  { id: "18_20", rotulo: "18 a 20" },
  { id: "21_30", rotulo: "21 a 30" },
  { id: "31_40", rotulo: "31 a 40" },
  { id: "acima_40", rotulo: "Acima de 40" },
  { id: "nao_informada", rotulo: "Idade não informada" },
];
export const IDADE_MINIMA_PLAUSIVEL = 14;
export const IDADE_MAXIMA_PLAUSIVEL = 90;
export const LIMITE_POUCOS_ATIVOS = 5;
export const ROTULO_CARGO_NAO_INFORMADO = "Cargo não informado";

export interface ContagemPorSexo { masculino: number; feminino: number; naoInformado: number }
export interface LinhaFaixa extends ContagemPorSexo { faixa: FaixaEtaria; rotulo: string; total: number }
export interface LinhaEscolaridade { grau: string; rotulo: string; total: number; naoInformado: boolean }
export interface LinhaCargo { cargo: string; total: number }
export interface Aniversariante { diaMes: string; ordem: number; nome: string; cargo: string | null; completaAnos: number }
// Um dos 12 meses a partir do mês corrente: `ano` é o da PRÓXIMA ocorrência (mês já passado neste ano = ano seguinte) e `rotulo` já traz o ano quando é o seguinte.
export interface MesAniversariantes { mes: number; ano: number; rotulo: string; aniversariantes: Aniversariante[] }

export interface GestaoPessoas {
  cliente: { id: string; nome: string };
  totalAtivos: number;
  porSexo: ContagemPorSexo;
  faixaPorSexo: LinhaFaixa[];
  escolaridade: LinhaEscolaridade[];
  cargos: LinhaCargo[];
  // 12 itens: o mês corrente (America/Sao_Paulo) primeiro, até o mesmo mês do ano seguinte menos um; cada pessoa aparece em exatamente um mês.
  aniversariantesPorMes: MesAniversariantes[];
  mesDeReferencia: number; // 1 a 12 (America/Sao_Paulo)
  tempoMedioDeCasaMeses: number | null;
  admitidosNoMes: number;
  dadosInconsistentes: number; // nascimento preenchido mas inválido, futuro ou com idade fora de 14 a 90
  poucosAtivos: boolean;
}

// O que o navegador do CLIENTE (portal) recebe: o mesmo quadro, mas só com o nome da empresa (sem o id) e sem os dois sinais internos do RH
// (cadastro inconsistente e "poucos ativos"), que lá não viram aviso. Os inconsistentes continuam contados em "Idade não informada".
export type GestaoPessoasPortal = Omit<GestaoPessoas, "cliente"> & { cliente: { nome: string } };

export function paraPortal(g: GestaoPessoas): GestaoPessoasPortal {
  const { cliente, ...resto } = g;
  return { ...resto, cliente: { nome: cliente.nome }, dadosInconsistentes: 0, poucosAtivos: false };
}

// Linha já "achatada" (funcionário + dados pessoais), o que as funções puras recebem.
export interface PessoaAtiva {
  nome: string;
  cargo: string | null;
  dataAdmissao: string | null;
  sexo: string | null;
  dataNascimento: string | null;
  grauInstrucao: string | null;
}

// ── Datas por texto (nunca new Date em data pura) ───────────────────────────
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
function partes(iso: string | null | undefined): { a: number; m: number; d: number } | null {
  const r = ISO.exec((iso ?? "").trim());
  if (!r) return null;
  const a = Number(r[1]), m = Number(r[2]), d = Number(r[3]);
  if (m < 1 || m > 12 || d < 1 || d > diasNoMes(a, m)) return null;
  return { a, m, d };
}
const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
function diasNoMes(a: number, m: number): number {
  return m === 2 ? (bissexto(a) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}
// Dias corridos desde uma época fixa, só com aritmética (algoritmo de dias civis): serve para diferença entre duas datas puras.
function numeroDoDia(a: number, m: number, d: number): number {
  const y = m <= 2 ? a - 1 : a;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

// Idade completa em anos na data `hojeISO`; null se o nascimento for vazio, inválido ou posterior a hoje.
export function idadeNaData(nascimentoISO: string | null | undefined, hojeISO: string): number | null {
  const n = partes(nascimentoISO), h = partes(hojeISO);
  if (!n || !h) return null;
  if (n.a > h.a || (n.a === h.a && (n.m > h.m || (n.m === h.m && n.d > h.d)))) return null;
  // comparar (mês, dia): quem nasceu em 29/02 em ano comum só completa em 01/03
  return h.a - n.a - (h.m < n.m || (h.m === n.m && h.d < n.d) ? 1 : 0);
}

export function faixaEtaria(idade: number | null): FaixaEtaria {
  if (idade === null) return "nao_informada";
  if (idade < 18) return "abaixo_18";
  if (idade <= 20) return "18_20";
  if (idade <= 30) return "21_30";
  if (idade <= 40) return "31_40";
  return "acima_40";
}

// Faixa + se o nascimento preenchido é inconsistente (inválido, futuro ou idade fora de 14 a 90): esses casos ficam em "Idade não informada".
export function classificarIdade(nascimentoISO: string | null | undefined, hojeISO: string): { idade: number | null; faixa: FaixaEtaria; inconsistente: boolean } {
  const preenchido = (nascimentoISO ?? "").trim() !== "";
  const idade = idadeNaData(nascimentoISO, hojeISO);
  if (idade === null || idade < IDADE_MINIMA_PLAUSIVEL || idade > IDADE_MAXIMA_PLAUSIVEL) return { idade: null, faixa: "nao_informada", inconsistente: preenchido };
  return { idade, faixa: faixaEtaria(idade), inconsistente: false };
}

// Tempo de casa em meses (1 casa); null quando a admissão é vazia, inválida ou FUTURA (não conta).
export function mesesDeCasa(dataAdmissaoISO: string | null | undefined, hojeISO: string): number | null {
  const a = partes(dataAdmissaoISO), h = partes(hojeISO);
  if (!a || !h) return null;
  const dias = numeroDoDia(h.a, h.m, h.d) - numeroDoDia(a.a, a.m, a.d);
  return dias < 0 ? null : Math.round((dias / 30.4375) * 10) / 10;
}

export function admitidoNoMes(dataAdmissaoISO: string | null | undefined, hojeISO: string): boolean {
  const a = partes(dataAdmissaoISO), h = partes(hojeISO);
  if (!a || !h) return false;
  return a.a === h.a && a.m === h.m && a.d <= h.d;
}

// ── Cargos ───────────────────────────────────────────────────────────────────
const MARCAS_DE_ACENTO = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizarCargo(cargo: string | null | undefined): string {
  return (cargo ?? "").normalize("NFD").replace(MARCAS_DE_ACENTO, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Agrupa por cargo normalizado; o rótulo é a grafia mais frequente (empate: a primeira em ordem alfabética). Cargo vazio vira "Cargo não informado".
export function agruparCargos(cargos: (string | null | undefined)[]): LinhaCargo[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const c of cargos) {
    const chave = normalizarCargo(c);
    const grafia = (c ?? "").replace(/\s+/g, " ").trim();
    const g = grupos.get(chave) ?? new Map<string, number>();
    g.set(grafia, (g.get(grafia) ?? 0) + 1);
    grupos.set(chave, g);
  }
  const linhas: LinhaCargo[] = [];
  for (const [chave, grafias] of grupos) {
    const total = [...grafias.values()].reduce((x, y) => x + y, 0);
    const melhor = [...grafias.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "pt-BR"))[0][0];
    linhas.push({ cargo: chave === "" ? ROTULO_CARGO_NAO_INFORMADO : melhor, total });
  }
  return linhas.sort((x, y) => y.total - x.total || x.cargo.localeCompare(y.cargo, "pt-BR"));
}

// Para o gráfico: no máximo `max` barras; o que passar vira uma barra "Demais cargos (N)", então a soma continua fechando com os ativos.
export function limitarCargos(cargos: LinhaCargo[], max: number): LinhaCargo[] {
  if (cargos.length <= max) return cargos;
  const resto = cargos.slice(max - 1);
  return [...cargos.slice(0, max - 1), { cargo: `Demais cargos (${resto.length})`, total: resto.reduce((soma, c) => soma + c.total, 0) }];
}

// ── Sexo e escolaridade ──────────────────────────────────────────────────────
export function bucketSexo(sexo: string | null | undefined): keyof ContagemPorSexo {
  return sexo === "M" ? "masculino" : sexo === "F" ? "feminino" : "naoInformado";
}

// Os 7 graus da constraint (rótulos de admissaoConstants) na ordem natural + "Não informado" (valor nulo ou fora da lista).
export function agruparEscolaridade(graus: (string | null | undefined)[]): LinhaEscolaridade[] {
  const conhecidos = new Set(GRAU_INSTRUCAO_OPTIONS.map((o) => o.value));
  const linhas: LinhaEscolaridade[] = GRAU_INSTRUCAO_OPTIONS.map((o) => ({ grau: o.value, rotulo: o.label, total: 0, naoInformado: false }));
  const ni: LinhaEscolaridade = { grau: "nao_informado", rotulo: "Não informado", total: 0, naoInformado: true };
  for (const g of graus) {
    const linha = g && conhecidos.has(g) ? linhas.find((l) => l.grau === g)! : ni;
    linha.total++;
  }
  return [...linhas, ni];
}

// ── Aniversariantes (12 meses a partir do mês corrente) ──────────────────────
// Ordem dos meses: começa no mês corrente e segue até o mesmo mês do ano seguinte MENOS UM (ex.: hoje em novembro/2026 = novembro/2026, dezembro/2026,
// janeiro/2027 ... outubro/2027). O "completa N anos" é o da PRÓXIMA ocorrência: ano dessa ocorrência − ano de nascimento; no mês corrente quem já fez
// aniversário continua listado, com a idade que completou. Quem nasceu em 29/02 aparece no dia 28 (ordem) quando o ano da ocorrência é comum,
// exibindo "29/02". Entra só quem tem idade ATUAL plausível (14 a 90, a mesma regra das faixas): cadastro inconsistente fica de fora, então as 12 listas
// somam exatamente o número de ativos com nascimento plausível.
export const NOMES_DOS_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function rotuloDoMes(mes: number, ano: number, anoAtual: number): string {
  const nome = NOMES_DOS_MESES[mes - 1] ?? "";
  return ano > anoAtual ? `${nome} de ${ano}` : nome;
}

export function aniversariantesPorMes(pessoas: PessoaAtiva[], hojeISO: string): MesAniversariantes[] {
  const h = partes(hojeISO);
  if (!h) return [];
  const meses: MesAniversariantes[] = Array.from({ length: 12 }, (_, k) => {
    const mes = ((h.m - 1 + k) % 12) + 1;
    const ano = h.m - 1 + k >= 12 ? h.a + 1 : h.a;
    return { mes, ano, rotulo: rotuloDoMes(mes, ano, h.a), aniversariantes: [] };
  });
  for (const p of pessoas) {
    const n = partes(p.dataNascimento);
    if (!n || classificarIdade(p.dataNascimento, hojeISO).idade === null) continue; // sem data ou inconsistente: fora da lista
    const destino = meses[(n.m - h.m + 12) % 12];
    const ordem = n.m === 2 && n.d === 29 && !bissexto(destino.ano) ? 28 : n.d;
    destino.aniversariantes.push({ diaMes: dataBR(p.dataNascimento).slice(0, 5), ordem, nome: p.nome, cargo: (p.cargo ?? "").trim() || null, completaAnos: destino.ano - n.a });
  }
  for (const m of meses) m.aniversariantes.sort((x, y) => x.ordem - y.ordem || x.nome.localeCompare(y.nome, "pt-BR"));
  return meses;
}

// Só o mês corrente (o primeiro dos 12).
export function aniversariantesDoMes(pessoas: PessoaAtiva[], hojeISO: string): Aniversariante[] {
  return aniversariantesPorMes(pessoas, hojeISO)[0]?.aniversariantes ?? [];
}

// ── Montagem dos agregados ───────────────────────────────────────────────────
export function montarGestaoPessoas(cliente: { id: string; nome: string }, pessoas: PessoaAtiva[], hojeISO: string): GestaoPessoas {
  const h = partes(hojeISO);
  const porSexo: ContagemPorSexo = { masculino: 0, feminino: 0, naoInformado: 0 };
  const faixas: LinhaFaixa[] = FAIXAS_ETARIAS.map((f) => ({ faixa: f.id, rotulo: f.rotulo, masculino: 0, feminino: 0, naoInformado: 0, total: 0 }));
  let inconsistentes = 0, admitidos = 0, somaMeses = 0, comTempo = 0;
  for (const p of pessoas) {
    const sx = bucketSexo(p.sexo);
    porSexo[sx]++;
    const c = classificarIdade(p.dataNascimento, hojeISO);
    if (c.inconsistente) inconsistentes++;
    const linha = faixas.find((f) => f.faixa === c.faixa)!;
    linha[sx]++;
    linha.total++;
    if (admitidoNoMes(p.dataAdmissao, hojeISO)) admitidos++;
    const meses = mesesDeCasa(p.dataAdmissao, hojeISO);
    if (meses !== null) { somaMeses += meses; comTempo++; }
  }
  return {
    cliente,
    totalAtivos: pessoas.length,
    porSexo,
    faixaPorSexo: faixas,
    escolaridade: agruparEscolaridade(pessoas.map((p) => p.grauInstrucao)),
    cargos: agruparCargos(pessoas.map((p) => p.cargo)),
    aniversariantesPorMes: aniversariantesPorMes(pessoas, hojeISO),
    mesDeReferencia: h?.m ?? 0,
    tempoMedioDeCasaMeses: comTempo > 0 ? Math.round((somaMeses / comTempo) * 10) / 10 : null,
    admitidosNoMes: admitidos,
    dadosInconsistentes: inconsistentes,
    poucosAtivos: pessoas.length > 0 && pessoas.length < LIMITE_POUCOS_ATIVOS,
  };
}

// ── Carregamento (servidor) ──────────────────────────────────────────────────
// O cliente Supabase é de SERVIÇO e vem de quem chama (a página, depois do gate podeAcessarFuncionarios + contextoRH). A unidade é filtrada AQUI,
// no servidor: `unidadeRH` null = sócio (todas as unidades). Só colunas necessárias: nunca cor/raça, CPF, endereço nem salário.
type Svc = { from: (tabela: string) => any };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClienteOpcao { id: string; nome: string }

// Seletor: clientes ativos da unidade permitida que têm funcionário ATIVO.
export async function listarClientesComAtivos(svc: Svc, o: { unidadeRH: string | null }): Promise<ClienteOpcao[]> {
  let fq = svc.from("funcionarios").select("cliente_id").eq("status", "ativo").not("cliente_id", "is", null);
  let cq = svc.from("clientes").select("id, nome").eq("ativo", true).order("nome");
  if (o.unidadeRH) { fq = fq.eq("unidade_id", o.unidadeRH); cq = cq.eq("unidade_id", o.unidadeRH); }
  const [{ data: funcs }, { data: clientes }] = await Promise.all([fq, cq]);
  const comAtivos = new Set(((funcs ?? []) as { cliente_id: string }[]).map((f) => f.cliente_id));
  return ((clientes ?? []) as ClienteOpcao[]).filter((c) => comAtivos.has(c.id));
}

// null = cliente_id inválido, inexistente ou de outra unidade (a página responde 404, sem confirmar que o id existe).
export async function carregarGestaoPessoas(svc: Svc, o: { clienteId: string; unidadeRH: string | null; hojeISO: string }): Promise<GestaoPessoas | null> {
  if (!UUID.test(o.clienteId)) return null;
  const { data: cliente } = await svc.from("clientes").select("id, nome, unidade_id").eq("id", o.clienteId).maybeSingle();
  if (!cliente || (o.unidadeRH && cliente.unidade_id !== o.unidadeRH)) return null;

  let fq = svc.from("funcionarios").select("id, nome_completo, cargo, data_admissao, admissao_id").eq("cliente_id", o.clienteId).eq("status", "ativo");
  if (o.unidadeRH) fq = fq.eq("unidade_id", o.unidadeRH);
  const { data: funcs } = await fq;
  const funcionarios = (funcs ?? []) as { id: string; nome_completo: string; cargo: string | null; data_admissao: string | null; admissao_id: string | null }[];

  const admissaoIds = funcionarios.map((f) => f.admissao_id).filter((x): x is string => !!x);
  const dados = new Map<string, { sexo: string | null; data_nascimento: string | null; grau_instrucao: string | null }>();
  if (admissaoIds.length > 0) {
    const { data: dp } = await svc.from("admissao_dados_pessoais").select("admissao_id, sexo, data_nascimento, grau_instrucao").in("admissao_id", admissaoIds);
    for (const d of (dp ?? []) as { admissao_id: string; sexo: string | null; data_nascimento: string | null; grau_instrucao: string | null }[]) dados.set(d.admissao_id, d);
  }

  const pessoas: PessoaAtiva[] = funcionarios.map((f) => {
    const d = f.admissao_id ? dados.get(f.admissao_id) : undefined;
    return { nome: f.nome_completo, cargo: f.cargo, dataAdmissao: f.data_admissao, sexo: d?.sexo ?? null, dataNascimento: d?.data_nascimento ?? null, grauInstrucao: d?.grau_instrucao ?? null };
  });
  return montarGestaoPessoas({ id: cliente.id, nome: cliente.nome }, pessoas, o.hojeISO);
}
