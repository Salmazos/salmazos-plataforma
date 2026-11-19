// Dados fixos (sem aleatoriedade) para comparar a tela da Gestão de Pessoas antes/depois do refactor `modo` e para os testes do portal.
import { montarGestaoPessoas, type GestaoPessoas, type PessoaAtiva } from "../src/lib/gestaoPessoas";

export const HOJE = "2026-11-18";
export const CA = "11111111-1111-4111-8111-111111111111";
export const CB = "22222222-2222-4222-8222-222222222222";

const p = (nome: string, cargo: string | null, dataAdmissao: string | null, sexo: string | null, dataNascimento: string | null, grauInstrucao: string | null): PessoaAtiva =>
  ({ nome, cargo, dataAdmissao, sexo, dataNascimento, grauInstrucao });

export const PESSOAS_CHEIO: PessoaAtiva[] = [
  p("Ana Souza", "Auxiliar de Produção", "2026-05-01", "F", "1990-11-20", "medio_completo"),
  p("Bruno Lima", "Auxiliar de producao", "2026-11-03", "M", "1985-03-10", "fundamental_completo"),
  p("Carla Dias", "Motorista", "2025-01-15", "F", "2000-02-29", "superior_completo"),
  p("Diego Reis", "Motorista", "2024-07-22", "M", "1976-12-05", "medio_incompleto"),
  p("Elisa Prado", "Operadora de Empilhadeira", "2026-02-10", "F", "2008-11-18", "medio_completo"),
  p("Fábio Nunes", "Vigia", "2023-09-01", "M", "1999-06-30", "pos_graduacao"),
  p("Gabi Rocha", null, "2026-10-12", null, null, null),
  p("Bebê Teste", "Vigia", "2026-11-02", "F", "2026-05-01", null),
];
export const PESSOAS_POUCOS: PessoaAtiva[] = [
  p("Ana Souza", "Auxiliar", "2026-05-01", "F", "1990-11-20", "medio_completo"),
  p("Bruno Lima", "Auxiliar", "2026-11-03", "M", "1985-03-10", "fundamental_completo"),
  p("Carla Dias", "Motorista", "2025-01-15", "F", "2000-02-29", "superior_completo"),
];
export const PESSOAS_SEM_DADO: PessoaAtiva[] = [
  p("Ana Souza", "Auxiliar", "2026-05-01", null, null, null),
  p("Bruno Lima", "Auxiliar", "2026-11-03", null, null, null),
  p("Carla Dias", "Motorista", "2025-01-15", null, null, null),
  p("Diego Reis", "Motorista", "2024-07-22", null, null, null),
  p("Elisa Prado", "Vigia", "2026-02-10", null, null, null),
  p("Fábio Nunes", "Vigia", "2023-09-01", null, null, null),
];
// 1 a 4 ativos: no portal os gráficos aparecem normalmente (sem aviso de "poucas pessoas").
export const PESSOAS_UM: PessoaAtiva[] = [p("Ana Souza", "Auxiliar", "2026-05-01", "F", "1990-11-20", "medio_completo")];

export const montar = (pessoas: PessoaAtiva[], id = CA, nome = "Alfa Indústria"): GestaoPessoas => montarGestaoPessoas({ id, nome }, pessoas, HOJE);

type Props = { clientes: { id: string; nome: string }[]; selecionadoId: string | null; dados: GestaoPessoas | null; indiceMesInicial?: number };
const alfa = [{ id: CA, nome: "Alfa Indústria" }];

// Casos que o RH renderiza hoje; o HTML de cada um é congelado em fixtures/gestao-pessoas-rh.golden.json (gerado ANTES do refactor).
export const CASOS_RH: [string, Props][] = [
  ["quadro cheio (8 ativos, 1 inconsistente, sem nascimento, sem sexo)", { clientes: alfa, selecionadoId: CA, dados: montar(PESSOAS_CHEIO) }],
  ["poucos ativos (3): aviso de uso interno", { clientes: alfa, selecionadoId: CA, dados: montar(PESSOAS_POUCOS) }],
  ["um ativo só", { clientes: alfa, selecionadoId: CA, dados: montar(PESSOAS_UM) }],
  ["6 ativos sem nenhum dado pessoal", { clientes: alfa, selecionadoId: CA, dados: montar(PESSOAS_SEM_DADO) }],
  ["zero ativos", { clientes: alfa, selecionadoId: CA, dados: montar([]) }],
  ["nenhuma empresa escolhida (lista com empresas)", { clientes: alfa, selecionadoId: null, dados: null }],
  ["nenhuma empresa com ativos (lista vazia)", { clientes: [], selecionadoId: null, dados: null }],
  ["empresa escolhida fora da lista", { clientes: [{ id: CB, nome: "Beta Logística" }], selecionadoId: CA, dados: montar(PESSOAS_CHEIO) }],
  ["mês inicial = março do ano seguinte (índice 4)", { clientes: alfa, selecionadoId: CA, dados: montar(PESSOAS_CHEIO), indiceMesInicial: 4 }],
];
