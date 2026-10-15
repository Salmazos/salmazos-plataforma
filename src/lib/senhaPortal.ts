// Regra de senha do Portal do Cliente. Módulo puro (sem React nem servidor): o mesmo arquivo
// valida no front (checklist ao digitar) e no servidor (schema Zod da rota portal-acesso).
// Para mudar o comprimento, mexa só em SENHA_PORTAL_MIN / SENHA_PORTAL_MAX.

export const SENHA_PORTAL_MIN = 8;
// Contado em BYTES UTF-8 (letra acentuada ocupa 2). Limite do bcrypt no Supabase Auth; não é regra de negócio.
export const SENHA_PORTAL_MAX = 72;

export interface ResultadoSenhaPortal {
  ok: boolean;
  tamanhoOk: boolean;
  tamanhoCurto: boolean;
  tamanhoLongo: boolean;
  temLetra: boolean;
  temNumero: boolean;
  temEspecial: boolean;
}

// Sem trim de propósito: espaço é caractere da senha, mas não conta como "especial".
export function validarSenhaPortal(senha: string): ResultadoSenhaPortal {
  const tamanhoCurto = senha.length < SENHA_PORTAL_MIN;
  const tamanhoLongo = new TextEncoder().encode(senha).length > SENHA_PORTAL_MAX;
  const tamanhoOk = !tamanhoCurto && !tamanhoLongo;
  const temLetra = /\p{L}/u.test(senha);
  const temNumero = /\p{N}/u.test(senha);
  const temEspecial = /[^\p{L}\p{N}\s]/u.test(senha);
  return {
    ok: tamanhoOk && temLetra && temNumero && temEspecial,
    tamanhoOk, tamanhoCurto, tamanhoLongo, temLetra, temNumero, temEspecial,
  };
}

const MENSAGEM_SENHA_LONGA = `A senha pode ter no máximo ${SENHA_PORTAL_MAX} caracteres.`;

export const TEXTO_AJUDA_SENHA_PORTAL =
  `Mínimo de ${SENHA_PORTAL_MIN} caracteres, com 1 letra, 1 número e 1 caractere especial (ex.: @ # ! - _)`;

export const PLACEHOLDER_SENHA_PORTAL = `Mín. ${SENHA_PORTAL_MIN} caracteres, com letra, número e especial`;

export const ITENS_CHECKLIST_SENHA_PORTAL: { chave: "tamanhoOk" | "temLetra" | "temNumero" | "temEspecial"; rotulo: string }[] = [
  { chave: "tamanhoOk", rotulo: `${SENHA_PORTAL_MIN} a ${SENHA_PORTAL_MAX} caracteres` },
  { chave: "temLetra", rotulo: "1 letra" },
  { chave: "temNumero", rotulo: "1 número" },
  { chave: "temEspecial", rotulo: "1 caractere especial" },
];

function juntarLista(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function mensagemSenhaPortalInvalida(r: ResultadoSenhaPortal): string {
  if (r.ok) return "";
  const faltas: string[] = [];
  if (r.tamanhoCurto) faltas.push(`${SENHA_PORTAL_MIN} caracteres`);
  if (!r.temLetra) faltas.push("1 letra");
  if (!r.temNumero) faltas.push("1 número");
  if (!r.temEspecial) faltas.push("1 caractere especial");
  const frases: string[] = [];
  if (faltas.length > 0) frases.push(`A senha precisa de pelo menos ${juntarLista(faltas)}.`);
  if (r.tamanhoLongo) frases.push(MENSAGEM_SENHA_LONGA);
  return frases.join(" ");
}

// Traduz as mensagens de senha do Supabase Auth (política configurada no projeto hospedado, fora
// do repo). Uma resposta pode trazer várias exigências juntas, então cada uma vira uma frase.
// Retorna null se a mensagem não for sobre senha — nunca devolve o texto original em inglês.
export function traduzirErroSenhaSupabase(msg: string | undefined): string | null {
  if (!msg) return null;
  const frases: string[] = [];

  const minimo = /should be at least (\d+) characters?/i.exec(msg);
  if (minimo) frases.push(`O sistema exige pelo menos ${minimo[1]} caracteres para a senha.`);

  if (/should contain at least one character of each/i.test(msg)) {
    frases.push("A senha precisa misturar letras maiúsculas, minúsculas, números e símbolos (exigência do sistema).");
  }
  if (/known to be weak|easy to guess/i.test(msg)) {
    frases.push("Esta senha é muito comum ou já apareceu em vazamentos de dados. Escolha outra.");
  }
  if (/longer than 72|too long/i.test(msg)) frases.push(MENSAGEM_SENHA_LONGA);
  if (/same as the old|different from the old/i.test(msg)) {
    frases.push("A nova senha precisa ser diferente da atual.");
  }

  return frases.length > 0 ? frases.join(" ") : null;
}
