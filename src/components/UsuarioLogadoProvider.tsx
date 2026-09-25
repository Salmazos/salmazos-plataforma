"use client";

import { createContext, useContext } from "react";
import type { Analista } from "@/lib/constants";

// Quem está logado no painel e de qual unidade — pra as listas de Responsável mostrarem o
// time certo e já virem com o próprio usuário selecionado (ver lib/responsaveis.ts).
export interface UsuarioLogado {
  nomeCompleto: string | null;
  apelido: Analista | null;
  unidadeSlug: string | null;
  todasUnidades: boolean;
  unidadeSlugPorId: Record<string, string>;
}

const VAZIO: UsuarioLogado = { nomeCompleto: null, apelido: null, unidadeSlug: null, todasUnidades: false, unidadeSlugPorId: {} };

const Contexto = createContext<UsuarioLogado>(VAZIO);

export default function UsuarioLogadoProvider({ valor, children }: { valor: UsuarioLogado; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useUsuarioLogado(): UsuarioLogado {
  return useContext(Contexto);
}

// Unidade (slug) a usar numa tela sem vaga/cliente definido: a do usuário; sócio vê todas (null).
export function unidadeDaTela(u: UsuarioLogado): string | null {
  return u.todasUnidades ? null : u.unidadeSlug;
}
