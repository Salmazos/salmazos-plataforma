// Aviso (NUNCA bloqueio) ao analista: vaga CONFIDENCIAL cujo texto público cita o nome do cliente. O site público (/vagas e /vagas/[slug]) nunca mostra
// nome, logo nem CNPJ do cliente, mas mostra o texto livre da vaga; se o analista digitou o nome do cliente ali, a confidencialidade vaza. Módulo puro,
// usado igual pela tela (ModalNovaVaga/ModalEditarVaga) e pelo servidor (aprovação de solicitação).

// Só os campos que aparecem na página pública (app/vagas/page.tsx e app/vagas/[slug]/page.tsx). `observacoes` e `descricao` NÃO entram: não são exibidos.
export const CAMPOS_TEXTO_PUBLICO = {
  titulo: "Título",
  cidade: "Cidade",
  estado: "Estado",
  salario: "Salário",
  adicionais_salariais: "Adicionais salariais",
  horario: "Horário",
  requisitos: "Requisitos",
  beneficios: "Benefícios",
  principais_atividades: "Principais atividades",
} as const;

export type CampoTextoPublico = keyof typeof CAMPOS_TEXTO_PUBLICO;
export type CamposTextoPublico = Partial<Record<CampoTextoPublico, string | number | null | undefined>>;

export interface ClienteNoTexto {
  campo: CampoTextoPublico;
  rotulo: string;
  // Trecho como o analista digitou (com a grafia e o acento originais).
  trecho: string;
}

const SUFIXOS_SOCIETARIOS = new Set(["ltda", "sa", "me", "epp", "eireli", "cia"]);

// Palavras de ligação: nunca contam como "distintivas".
const LIGACAO = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "com", "para", "por", "no", "na", "nos", "nas", "um", "uma"]);

// Palavras genéricas (ramo de atividade, lugar, palavra comum do português, o próprio nome da Salmazos): sozinhas não identificam um cliente, então não
// viram variante de uma palavra nem a "primeira palavra distintiva". Lista fechada contra os nomes reais de clientes (ver
// scripts/verificar-cliente-no-texto-publico.mts, que roda o módulo contra todos eles).
const GENERICAS = new Set([
  "comercio", "comercial", "industria", "industrial", "servicos", "servico", "brasil", "brasileira", "grupo", "empresa", "cliente", "teste",
  "papel", "embalagens", "saude", "estetica", "odontologia", "novos", "tempos", "espaco", "terapeutico", "natural", "campos",
  "produtos", "alimenticios", "alimentos", "argentinos", "empilhadeiras", "manutencao", "pecas", "madeiras", "ferragens", "carnes",
  "gestao", "contabeis", "confeitaria", "padaria", "mecanica", "resinas", "plasticas", "quimica", "ambiental", "equipamentos",
  "solucoes", "automacao", "imoveis", "nutricao", "animal", "rotulos", "studio", "marmoraria", "fazendinha", "resort",
  "recrutamento", "selecao", "terceirizacao", "terceirizados", "terceirizada", "rh", "salmazos",
  "distribuidora", "transportes", "tecnologia", "engenharia", "construcoes", "consultoria", "assessoria", "metalurgica", "logistica",
  "agricola", "laboratorio", "clinica", "hospital", "escola", "restaurante", "supermercado", "mercado", "hotel", "limpeza", "seguranca",
  "producao", "administrativo", "financeiro",
]);

// Palavras comuns do português que, mesmo sendo a primeira palavra distintiva de um cliente, NÃO viram variante sozinhas (regra (c)); o nome em frase
// inteira continua valendo. Diferente de GENERICAS, que também tira a palavra da frase ("Studio Capricho" segue detectado como frase).
const NAO_VIRA_PRIMEIRA_DISTINTIVA = new Set(["capricho"]);

const MIN_LETRAS_UMA_PALAVRA = 5;
const MIN_LETRAS_PRIMEIRA_DISTINTIVA = 6;
const MIN_LETRAS_FRASE = 5;
const MIN_PALAVRAS_FRASE_GENERICA = 3;

// Minúsculas, sem acento, tudo que não é letra/número vira espaço. Troca caractere a caractere (1 para 1), então a posição no texto normalizado é a
// mesma do original e dá para devolver o trecho com a grafia que o analista digitou.
function normalizarPreservandoPosicao(texto: string): string {
  let saida = "";
  for (let i = 0; i < texto.length; i++) {
    const base = texto[i].normalize("NFD")[0].toLowerCase();
    saida += /[a-z0-9]/.test(base) ? base : " ";
  }
  return saida;
}

function tokens(texto: string): string[] {
  return normalizarPreservandoPosicao(texto).split(" ").filter(Boolean);
}

// Tira só os sufixos societários do FIM do nome (ltda, s/a, sa, me, epp, eireli, cia; "N. EIRELI" leva o "n" junto).
function semSufixoSocietario(toks: string[]): string[] {
  const t = [...toks];
  for (;;) {
    const ultimo = t[t.length - 1];
    if (t.length >= 2 && ultimo === "a" && t[t.length - 2] === "s") {
      t.length -= 2;
    } else if (t.length >= 1 && SUFIXOS_SOCIETARIOS.has(ultimo)) {
      t.pop();
      if (ultimo === "eireli" && t[t.length - 1] === "n") t.pop();
    } else {
      return t;
    }
  }
}

const distintiva = (t: string) => !LIGACAO.has(t) && !GENERICAS.has(t);

// Pedaços do nome: o nome sem o que vem entre parênteses nem depois de " - " / " | ", e cada um desses trechos à parte.
function pedacosDoNome(nome: string): { principal: string; extras: string[] } {
  const extras: string[] = [];
  let resto = nome.replace(/\(([^)]*)\)/g, (_, dentro: string) => {
    extras.push(dentro);
    return " ";
  });
  const partes = resto.split(/\s[-–—|]\s/);
  resto = partes[0];
  extras.push(...partes.slice(1));
  return { principal: resto, extras };
}

// Variantes do nome do cliente que, achadas como PALAVRA INTEIRA no texto público, indicam que o cliente foi citado. Cada variante é uma lista de
// palavras já normalizadas. Regras: (a) nome sem sufixo societário; (b) cada trecho entre parênteses ou depois de hífen; (c) primeira palavra
// distintiva do nome principal, só com 6 letras ou mais e fora da lista de genéricas. Variante de uma palavra só vale com 5 letras ou mais e não genérica;
// frase com mais de uma palavra precisa de pelo menos uma palavra distintiva (ou de 3 palavras de conteúdo, caso do nome completo todo genérico).
export function variantesDoCliente(nome: string | null | undefined): string[][] {
  if (!nome || !nome.trim()) return [];
  const { principal, extras } = pedacosDoNome(nome);
  const vistos = new Set<string>();
  const variantes: string[][] = [];
  const adicionar = (toks: string[]) => {
    if (toks.length === 0) return;
    const chave = toks.join(" ");
    if (vistos.has(chave)) return;
    if (toks.length === 1) {
      if (toks[0].length < MIN_LETRAS_UMA_PALAVRA || !distintiva(toks[0])) return;
    } else if (chave.length < MIN_LETRAS_FRASE) {
      return;
    } else if (!toks.some(distintiva) && toks.filter((t) => !LIGACAO.has(t)).length < MIN_PALAVRAS_FRASE_GENERICA) {
      // Frase só de palavras genéricas ("novos tempos") não identifica ninguém; com 3 ou mais palavras de conteúdo já é o nome completo digitado.
      return;
    }
    vistos.add(chave);
    variantes.push(toks);
  };

  const toksPrincipal = semSufixoSocietario(tokens(principal));
  adicionar(toksPrincipal);
  for (const extra of extras) adicionar(semSufixoSocietario(tokens(extra)));
  const primeiraDistintiva = toksPrincipal.find(distintiva);
  if (primeiraDistintiva && primeiraDistintiva.length >= MIN_LETRAS_PRIMEIRA_DISTINTIVA && !NAO_VIRA_PRIMEIRA_DISTINTIVA.has(primeiraDistintiva)) {
    adicionar([primeiraDistintiva]);
  }
  return variantes;
}

function procurar(textoNormalizado: string, variante: string[]): { inicio: number; fim: number } | null {
  const padrao = new RegExp(`(?<![a-z0-9])${variante.join(" +")}(?![a-z0-9])`);
  const m = padrao.exec(textoNormalizado);
  return m ? { inicio: m.index, fim: m.index + m[0].length } : null;
}

// Devolve os campos públicos que citam o cliente (um achado por campo, com o trecho). Lista vazia = nada a avisar. Só vale para vaga confidencial e
// pública (vaga privada não tem página: 404). `nomesDoCliente`: clientes.nome e, na falta, cliente_nome_temp / cliente_nome.
export function detectarClienteNoTextoPublico(o: {
  confidencial: boolean | null | undefined;
  visivelPublicamente?: boolean | null;
  campos: CamposTextoPublico;
  nomesDoCliente: Array<string | null | undefined>;
}): ClienteNoTexto[] {
  if (o.confidencial !== true || o.visivelPublicamente === false) return [];
  const variantes = o.nomesDoCliente
    .flatMap((n) => variantesDoCliente(n))
    // Mais longa primeiro: o trecho devolvido é o mais completo.
    .sort((a, b) => b.join(" ").length - a.join(" ").length);
  if (variantes.length === 0) return [];

  const achados: ClienteNoTexto[] = [];
  for (const campo of Object.keys(CAMPOS_TEXTO_PUBLICO) as CampoTextoPublico[]) {
    const valor = o.campos[campo];
    const texto = valor == null ? "" : String(valor);
    if (!texto.trim()) continue;
    const normalizado = normalizarPreservandoPosicao(texto);
    for (const v of variantes) {
      const pos = procurar(normalizado, v);
      if (pos) {
        achados.push({ campo, rotulo: CAMPOS_TEXTO_PUBLICO[campo], trecho: texto.slice(pos.inicio, pos.fim) });
        break;
      }
    }
  }
  return achados;
}

const lista = (achados: ClienteNoTexto[]) => achados.map((a) => `${a.rotulo} ("${a.trecho}")`).join(", ");

// Texto do aviso ANTES de salvar (tela): explica qual campo cita o cliente e por que importa.
export function mensagemAntesDeSalvar(achados: ClienteNoTexto[]): string {
  const plural = achados.length > 1;
  return `Esta vaga é confidencial e aparece no site público, mas ${plural ? "os campos" : "o campo"} ${lista(achados)} ${plural ? "citam" : "cita"} o nome do cliente. Quem abrir a vaga no site vai ler esse nome.`;
}

// Texto do aviso DEPOIS de salvar (servidor): a vaga já foi criada, o aviso só informa e diz onde editar.
export function mensagemDepoisDeSalvar(achados: ClienteNoTexto[]): string {
  const plural = achados.length > 1;
  return `A vaga foi criada, mas ela é confidencial e aparece no site público, e ${plural ? "os campos" : "o campo"} ${lista(achados)} ${plural ? "citam" : "cita"} o nome do cliente. Abra a vaga em Vagas e use "Editar" para tirar o nome antes de divulgar.`;
}
