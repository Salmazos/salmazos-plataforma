// Dados pessoais e filhos de funcionários SEM admissão digital (editor do RH). Tabelas funcionario_perfil e funcionario_filhos (supabase/migration_funcionario_perfil.sql).
// Regras (decisões do Ölver):
//  - só funcionário sem admissao_id; com admissão vale a admissão (as duas fontes nunca se misturam);
//  - nascimento nunca futuro nem inexistente (bloqueia); idade de funcionário fora de 14 a 90 AVISA e só salva com confirmado:true (422);
//  - remover o último filho pede confirmação e a pessoa passa a constar como "Sem filhos declarados";
//  - nada aqui depende de a tabela existir: tabela ausente = vazio (ver erroDeTabelaAusente).
import { GRAU_INSTRUCAO_OPTIONS } from "@/lib/admissaoConstants";
import { idadeNaData, IDADE_LIMITE_FILHO, IDADE_MAXIMA_PLAUSIVEL, IDADE_MINIMA_PLAUSIVEL } from "@/lib/gestaoPessoas";

export const SEXOS_PERFIL: { value: "M" | "F"; label: string }[] = [{ value: "M", label: "Masculino" }, { value: "F", label: "Feminino" }];
export const GRAUS_PERFIL = GRAU_INSTRUCAO_OPTIONS;

export interface PerfilFuncionario {
  sexo: "M" | "F" | null;
  data_nascimento: string | null;
  grau_instrucao: string | null;
  filhos_informado_em: string | null;
}
export interface FilhoFuncionario { id: string; nome: string; data_nascimento: string }

export interface Aviso { codigo: "idade_fora_da_faixa" | "ultimo_filho" | "filho_14_ou_mais"; mensagem: string }

// Aviso (não bloqueio) para a idade do FUNCIONÁRIO: fora de 14 a 90 anos. Nascimento vazio ou futuro nem chega aqui (o schema recusa o futuro).
export function avisoIdadeFuncionario(nascimento: string | null | undefined, hojeISO: string): Aviso | null {
  const idade = idadeNaData(nascimento, hojeISO);
  if (idade === null || (idade >= IDADE_MINIMA_PLAUSIVEL && idade <= IDADE_MAXIMA_PLAUSIVEL)) return null;
  return { codigo: "idade_fora_da_faixa", mensagem: `Esta idade parece errada: ${idade} ${idade === 1 ? "ano" : "anos"} (o esperado é de ${IDADE_MINIMA_PLAUSIVEL} a ${IDADE_MAXIMA_PLAUSIVEL}). Confirma a data de nascimento?` };
}

// Informativo para o FILHO: 14 anos ou mais é aceito, mas não aparece na lista de filhos da Gestão de Pessoas (só menores de 14).
export function avisoFilho14OuMais(nascimento: string | null | undefined, hojeISO: string): Aviso | null {
  const idade = idadeNaData(nascimento, hojeISO);
  if (idade === null || idade < IDADE_LIMITE_FILHO) return null;
  return { codigo: "filho_14_ou_mais", mensagem: `Este filho tem ${idade} anos e não aparece na lista de filhos da Gestão de Pessoas (só menores de ${IDADE_LIMITE_FILHO}).` };
}

export const AVISO_ULTIMO_FILHO: Aviso = {
  codigo: "ultimo_filho",
  mensagem: "Este é o último filho cadastrado. Ao remover, o funcionário passa a constar como \"Sem filhos declarados\". Confirma?",
};

// O que falta para o cadastro estar completo (selo "Cadastro incompleto"): só vale para funcionário sem admissão.
export function faltasDoCadastro(admissaoId: string | null, perfil: Partial<PerfilFuncionario> | null | undefined, quantidadeFilhos: number): string[] {
  if (admissaoId) return [];
  const faltas: string[] = [];
  if (!perfil?.sexo) faltas.push("sexo");
  if (!perfil?.data_nascimento) faltas.push("data de nascimento");
  if (!perfil?.grau_instrucao) faltas.push("grau de instrução");
  if (!perfil?.filhos_informado_em && quantidadeFilhos === 0) faltas.push("filhos");
  return faltas;
}

// Erro do PostgREST/Postgres quando a tabela ainda não existe (migração não aplicada): a leitura trata como vazio e a escrita responde 503, sem quebrar nada.
export function erroDeTabelaAusente(erro: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erro) return false;
  const msg = (erro.message ?? "").toLowerCase();
  return erro.code === "42P01" || erro.code === "PGRST205" || erro.code === "PGRST200" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find the table");
}
