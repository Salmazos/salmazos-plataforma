// Verificação da regra de senha do Portal do Cliente (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-senha-portal.mts
import assert from "node:assert/strict";
import {
  SENHA_PORTAL_MIN, SENHA_PORTAL_MAX, validarSenhaPortal, mensagemSenhaPortalInvalida,
  traduzirErroSenhaSupabase, TEXTO_AJUDA_SENHA_PORTAL,
} from "../src/lib/senhaPortal.ts";

let total = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message}`); process.exitCode = 1; }
}

caso("constantes", () => { assert.equal(SENHA_PORTAL_MIN, 8); assert.equal(SENHA_PORTAL_MAX, 72); });
caso("texto de ajuda", () => assert.equal(
  TEXTO_AJUDA_SENHA_PORTAL,
  "Mínimo de 8 caracteres, com 1 letra, 1 número e 1 caractere especial (ex.: @ # ! - _)",
));

const aceitas = ["abc12345!", "Senha@2026", "a1#aaaaa", "frase longa 1 sim!", "Çedilha1ção!", "a1!" + "x".repeat(69)];
for (const s of aceitas) caso(`aceita ${JSON.stringify(s.length > 30 ? s.slice(0, 10) + "…(" + s.length + ")" : s)}`, () => assert.equal(validarSenhaPortal(s).ok, true));

const MSG_LONGA = "A senha pode ter no máximo 72 caracteres.";
const ASCII_72 = "a1!" + "x".repeat(69);
const ASCII_73 = ASCII_72 + "x";
const ACENTOS_ACIMA_72_BYTES = "ç1!" + "ã".repeat(35); // 38 caracteres, 74 bytes (ç e ã ocupam 2 bytes cada)
const recusadas: [string, string][] = [
  ["abc12345", "sem especial"],
  ["abcdefg!", "sem número"],
  ["12345678!", "sem letra"],
  ["ab1!", "curta"],
  ["abc 1234", "espaço não conta como especial"],
  ["", "vazia"],
  ["       1a", "espaços não contam como especial"],
  ["a1!" + "x".repeat(499), "502 caracteres (acima do teto)"],
  [ASCII_73, "73 bytes ASCII"],
  [ACENTOS_ACIMA_72_BYTES, "acentos: poucos caracteres mas >72 bytes"],
];
for (const [s, motivo] of recusadas) caso(`recusa ${JSON.stringify(s.length > 30 ? s.slice(0, 10) + "…(" + s.length + ")" : s)} (${motivo})`, () => assert.equal(validarSenhaPortal(s).ok, false));

caso("72 bytes ASCII aceita, 73 recusa", () => {
  assert.equal(new TextEncoder().encode(ASCII_72).length, 72);
  assert.equal(validarSenhaPortal(ASCII_72).ok, true);
  assert.equal(validarSenhaPortal(ASCII_73).ok, false);
  assert.equal(validarSenhaPortal(ASCII_73).tamanhoLongo, true);
});
caso("acentos: >72 bytes com <72 caracteres recusa", () => {
  const bytes = new TextEncoder().encode(ACENTOS_ACIMA_72_BYTES).length;
  assert.ok(bytes > 72 && ACENTOS_ACIMA_72_BYTES.length < 72, `bytes=${bytes} chars=${ACENTOS_ACIMA_72_BYTES.length}`);
  const r = validarSenhaPortal(ACENTOS_ACIMA_72_BYTES);
  assert.equal(r.tamanhoLongo, true);
  assert.equal(r.tamanhoCurto, false);
  assert.equal(r.tamanhoOk, false);
});
caso("detalhe dos critérios", () => {
  assert.deepEqual(validarSenhaPortal("abc12345"), { ok: false, tamanhoOk: true, tamanhoCurto: false, tamanhoLongo: false, temLetra: true, temNumero: true, temEspecial: false });
  assert.deepEqual(validarSenhaPortal("ab1!"), { ok: false, tamanhoOk: false, tamanhoCurto: true, tamanhoLongo: false, temLetra: true, temNumero: true, temEspecial: true });
});
caso("sem trim: espaços nas pontas contam no comprimento", () => assert.equal(validarSenhaPortal(" a1!    ").tamanhoOk, true));

caso("mensagem: falta número e especial", () => assert.equal(
  mensagemSenhaPortalInvalida(validarSenhaPortal("abcdefgh")),
  "A senha precisa de pelo menos 1 número e 1 caractere especial.",
));
caso("mensagem: falta só especial", () => assert.equal(
  mensagemSenhaPortalInvalida(validarSenhaPortal("abc12345")),
  "A senha precisa de pelo menos 1 caractere especial.",
));
caso("mensagem: vazia lista tudo", () => assert.equal(
  mensagemSenhaPortalInvalida(validarSenhaPortal("")),
  "A senha precisa de pelo menos 8 caracteres, 1 letra, 1 número e 1 caractere especial.",
));
caso("mensagem: curta com tudo mais", () => assert.equal(
  mensagemSenhaPortalInvalida(validarSenhaPortal("ab1!")),
  "A senha precisa de pelo menos 8 caracteres.",
));
caso("mensagem: longa (frase própria, sem 'entre')", () => {
  const m = mensagemSenhaPortalInvalida(validarSenhaPortal(ASCII_73));
  assert.equal(m, MSG_LONGA);
  assert.ok(!/entre|pelo menos/.test(m));
});
caso("mensagem: curta e sem número", () => assert.equal(
  mensagemSenhaPortalInvalida(validarSenhaPortal("abc!")),
  "A senha precisa de pelo menos 8 caracteres e 1 número.",
));
caso("mensagem: longa e sem especial", () => assert.equal(
  mensagemSenhaPortalInvalida(validarSenhaPortal("a1" + "x".repeat(80))),
  "A senha precisa de pelo menos 1 caractere especial. " + MSG_LONGA,
));
caso("mensagem: senha válida = vazio", () => assert.equal(mensagemSenhaPortalInvalida(validarSenhaPortal("abc12345!")), ""));

const MSG_PRINT =
  "Password should be at least 12 characters. Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~. Password is known to be weak and easy to guess, please choose a different one.";
caso("Supabase: weak/easy to guess", () => assert.equal(
  traduzirErroSenhaSupabase("Password is known to be weak and easy to guess, please choose a different one."),
  "Esta senha é muito comum ou já apareceu em vazamentos de dados. Escolha outra.",
));
caso("Supabase: at least N characters", () => assert.equal(
  traduzirErroSenhaSupabase("Password should be at least 12 characters."),
  "O sistema exige pelo menos 12 caracteres para a senha.",
));
caso("Supabase: character of each", () => assert.equal(
  traduzirErroSenhaSupabase("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789."),
  "A senha precisa misturar letras maiúsculas, minúsculas, números e símbolos (exigência do sistema).",
));
caso("Supabase: mais de 72 caracteres", () => assert.equal(
  traduzirErroSenhaSupabase("Password cannot be longer than 72 characters"), MSG_LONGA,
));
caso("Supabase: diferente da antiga", () => assert.equal(
  traduzirErroSenhaSupabase("New password should be different from the old password."),
  "A nova senha precisa ser diferente da atual.",
));
caso("Supabase: mensagem do print (3 exigências juntas)", () => assert.equal(
  traduzirErroSenhaSupabase(MSG_PRINT),
  "O sistema exige pelo menos 12 caracteres para a senha. " +
  "A senha precisa misturar letras maiúsculas, minúsculas, números e símbolos (exigência do sistema). " +
  "Esta senha é muito comum ou já apareceu em vazamentos de dados. Escolha outra.",
));
caso("Supabase: resposta traduzida não contém inglês", () => {
  const t = traduzirErroSenhaSupabase(MSG_PRINT)!;
  assert.ok(!/password|should|characters of|weak|guess/i.test(t));
});
caso("Supabase: mensagem não relacionada = null", () => assert.equal(traduzirErroSenhaSupabase("User not found"), null));
caso("Supabase: undefined/vazio = null", () => {
  assert.equal(traduzirErroSenhaSupabase(undefined), null);
  assert.equal(traduzirErroSenhaSupabase(""), null);
});

console.log(`\n${total} casos OK${process.exitCode ? " — HÁ FALHAS" : ""}`);
