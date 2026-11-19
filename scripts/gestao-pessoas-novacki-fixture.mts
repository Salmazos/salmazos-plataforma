// Quadro SINTÉTICO com o formato do de uma empresa real de 29 ativos (nenhum dado pessoal real): 19 M, 8 F, 2 sem cadastro de admissão (legados),
// 12 admitidos no mês corrente, 4 aniversariantes em novembro, 1 admissão futura, 29/02, virada de ano e mais de 12 cargos (barra "Demais cargos").
// "Hoje" = 18/11/2026. Usado pelos testes da lista (rotas e componente) com banco em memória.
import { GRAU_INSTRUCAO_OPTIONS } from "../src/lib/admissaoConstants";
import type { PessoaAtiva } from "../src/lib/gestaoPessoas";

export const HOJE = "2026-11-18";
export const AGORA = "2026-11-19T01:30:00Z"; // 18/11/2026 22:30 em Brasília (já é 19/11 em UTC)

const NASC = [
  "1985-03-12", "1992-07-04", "1978-09-21", "1990-11-05", "2006-01-15", "2000-02-29", "1969-12-31", "1995-05-30", "2005-08-08", "1988-11-18",
  "1975-04-02", "1983-10-10", "1999-06-06", "2007-02-02", "1990-01-02", "1981-11-30", "1972-07-07", "2001-03-03", "1994-09-09", "1986-12-24",
  "1979-05-15", "1993-11-11", "2003-10-20", "1968-08-18", "1996-04-25", "1989-06-17", "1977-01-27",
];
const CARGOS = ["Auxiliar de Produção", "Operador de Máquina", "Motorista", "Soldador", "Eletricista", "Almoxarife", "Vigia", "Conferente", "Montador", "Pintor", "Torneiro", "Auxiliar Administrativo", "Cozinheira", "Zelador"];

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
  };
});
