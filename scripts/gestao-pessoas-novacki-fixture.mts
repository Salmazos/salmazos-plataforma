// Quadro SINTÉTICO com o formato do de uma empresa real de 29 ativos (nenhum dado pessoal real): 19 M, 8 F, 2 sem cadastro de admissão (legados),
// 12 admitidos no mês corrente, 4 aniversariantes em novembro, 1 admissão futura, 29/02, virada de ano e mais de 12 cargos (barra "Demais cargos").
// "Hoje" = 18/11/2026. Usado pelos testes da lista (rotas e componente) com banco em memória.
import { GRAU_INSTRUCAO_OPTIONS } from "../src/lib/admissaoConstants";
import type { FilhoCadastrado, PessoaAtiva } from "../src/lib/gestaoPessoas";

export const HOJE = "2026-11-18";
export const AGORA = "2026-11-19T01:30:00Z"; // 18/11/2026 22:30 em Brasília (já é 19/11 em UTC)

const NASC = [
  "1985-03-12", "1992-07-04", "1978-09-21", "1990-11-05", "2006-01-15", "2000-02-29", "1969-12-31", "1995-05-30", "2005-08-08", "1988-11-18",
  "1975-04-02", "1983-10-10", "1999-06-06", "2007-02-02", "1990-01-02", "1981-11-30", "1972-07-07", "2001-03-03", "1994-09-09", "1986-12-24",
  "1979-05-15", "1993-11-11", "2003-10-20", "1968-08-18", "1996-04-25", "1989-06-17", "1977-01-27",
];
const CARGOS = ["Auxiliar de Produção", "Operador de Máquina", "Motorista", "Soldador", "Eletricista", "Almoxarife", "Vigia", "Conferente", "Montador", "Pintor", "Torneiro", "Auxiliar Administrativo", "Cozinheira", "Zelador"];

// Filhos cadastrados na admissão (só filho/filha), com "hoje" = 18/11/2026. 12 pessoas com filho MENOR de 14 (8 M + 4 F); a pessoa 2 só tem filho de 14 anos exatos
// (fica em "sem"); a 6 mistura filho de 12 e de 18; a 9 tem nascimento futuro (conta como filho, "idade não informada"); as 2 legadas (28 e 29) não têm admissão (null).
const k = (nome: string, dataNascimento: string | null): FilhoCadastrado => ({ nome, dataNascimento });
export const FILHOS_NOVACKI: Record<number, FilhoCadastrado[]> = {
  0: [k("Maria", "2018-03-10"), k("João", "2023-05-20")],
  1: [k("Teen Exato", "2012-11-18"), k("Adulto", "2000-01-01")],
  2: [k("Bissexta", "2016-02-29")],
  3: [k("Quase Catorze", "2012-11-19")],
  4: [k("Um Ano", "2025-11-18"), k("Recém", "2026-11-01")],
  5: [k("Doze", "2014-06-01"), k("Dezoito", "2008-01-01")],
  6: [k("Sete", "2019-09-09")],
  7: [k("Seis", "2020-12-12")],
  8: [k("Futuro", "2027-01-01")],
  19: [k("Quatro", "2017-04-04")],
  20: [k("Onze", "2015-10-10")],
  21: [k("Cinco", "2021-01-01")],
  22: [k("Quatro B", "2022-02-02")],
};

export const PESSOAS_NOVACKI: PessoaAtiva[] = Array.from({ length: 29 }, (_, i) => {
  const legado = i >= 27; // sem admissão preenchida: sem sexo, nascimento nem instrução
  const admissao = i <= 11 ? `2026-11-${String(i + 1).padStart(2, "0")}` : i === 12 ? "2026-11-25" : `202${4 + (i % 2)}-${String(1 + (i % 12)).padStart(2, "0")}-10`;
  return {
    nome: `Pessoa ${String(i + 1).padStart(2, "0")}`,
    cargo: i === 28 ? null : CARGOS[i % CARGOS.length],
    dataAdmissao: admissao,
    sexo: legado ? null : i < 19 ? "M" : "F",
    dataNascimento: legado ? null : NASC[i],
    grauInstrucao: legado ? null : GRAU_INSTRUCAO_OPTIONS[i % GRAU_INSTRUCAO_OPTIONS.length].value,
    filhos: legado ? null : (FILHOS_NOVACKI[i] ?? []),
  };
});
