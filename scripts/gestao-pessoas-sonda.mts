// Sonda de verificar-gestao-pessoas.mts: roda sob um TZ escolhido (TZ=America/Sao_Paulo ou TZ=UTC) com o relógio congelado em AGORA e imprime, em
// JSON, o "hoje" de Brasília e o que a Gestão de Pessoas calcula a partir dele. O verificador exige a MESMA saída nos dois fusos.
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData } from "./harness-mot/ambiente.mjs";
import { formatarDataISO, obterDataHojeBrasil } from "../src/lib/dataHojeBrasil";
import { aniversariantesDoMes, idadeNaData, mesesDeCasa, admitidoNoMes, type PessoaAtiva } from "../src/lib/gestaoPessoas";

congelarData(process.env.AGORA);
const hoje = formatarDataISO(obterDataHojeBrasil());
const p = (nome: string, nasc: string, adm: string | null = null): PessoaAtiva => ({ nome, cargo: "Auxiliar", dataAdmissao: adm, sexo: "F", dataNascimento: nasc, grauInstrucao: null });
const pessoas = [p("Bia", "2000-02-29"), p("Cris", "1995-02-28"), p("Dani", "1990-03-01"), p("Edu", "1991-11-30"), p("Flavia", "1992-12-01"), p("Gil", "1980-12-31")];
console.log(JSON.stringify({
  hoje,
  idadeBia: idadeNaData("2000-02-29", hoje),
  aniversariantes: aniversariantesDoMes(pessoas, hoje).map((a) => `${a.diaMes}|${a.ordem}|${a.nome}|${a.completaAnos}`),
  tempoDeCasa: mesesDeCasa("2026-06-15", hoje),
  admitidoNoMes: admitidoNoMes("2026-11-30", hoje),
}));
