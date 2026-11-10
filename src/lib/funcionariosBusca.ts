// Ordenação e busca por nome da lista de Funcionários (RH). Funções puras, sem I/O: usadas pela tela e pelo script de verificação.

// Minúsculas e sem acento: "Álvaro" e "alvaro" são o mesmo nome na busca e na ordenação.
export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

// Ordem alfabética do português: sem diferenciar maiúscula/minúscula nem acento ("Álvaro" fica entre os A, "Ícaro" entre os I).
const colador = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
export const compararNomes = (a: string, b: string): number => colador.compare(a, b);

export function ordenarPorNome<T extends { nome_completo: string }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => compararNomes(a.nome_completo, b.nome_completo));
}

// O nome contém o texto digitado (sem acento, sem maiúscula). Texto vazio = todos.
export function nomeContem(nome: string, busca: string): boolean {
  const q = normalizarNome(busca);
  return !q || normalizarNome(nome).includes(q);
}
