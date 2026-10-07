import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ClienteIdentidade, type ResultadoDuplicidade } from "@/lib/clienteDuplicidade";

// Cola entre a lib pura (clienteDuplicidade.ts) e as rotas que gravam cliente.

// UMA consulta de clientes por requisição (todas as unidades, ativos e inativos — a comparação é global e
// roda em memória, são dezenas de linhas). null = a leitura falhou: quem chama decide (cadastro/edição
// recusam com frase genérica; a cobrança R&S só deixa de copiar o CNPJ pro cadastro).
export async function carregarIdentidadesClientes(svc: SupabaseClient): Promise<ClienteIdentidade[] | null> {
  const { data, error } = await svc
    .from("clientes")
    .select("id, nome, cidade, ativo, cnpj, contato_telefone, contato_email, endereco, unidade_id");
  if (error) {
    console.error("[clienteDuplicidade] Erro ao carregar clientes para a checagem:", error.message);
    return null;
  }
  return (data ?? []) as ClienteIdentidade[];
}

export const MSG_FALHA_CHECAGEM = "Não foi possível verificar se este cliente já está cadastrado. Tente novamente.";
export const MSG_FALHA_SALVAR = "Não foi possível salvar o cliente. Tente novamente.";
export const MSG_CNPJ_JA_ATIVO = "Já existe um cliente ativo com este CNPJ.";

function mensagem(r: ResultadoDuplicidade, reativacao: boolean): string {
  if (reativacao && !r.outraUnidade) {
    // Reativar o cadastro X esbarrou em OUTRO cliente: "reative o antigo" não faz sentido aqui.
    return r.bloqueio === "cnpj"
      ? "Não é possível reativar: já existe outro cliente com este CNPJ."
      : `Não é possível reativar: já existe outro cliente com o mesmo telefone e e-mail.${r.podeLiberar ? " A liberação cabe à diretoria." : ""}`;
  }
  if (r.outraUnidade) {
    return r.bloqueio === "cnpj"
      ? "Este CNPJ já está cadastrado em outra unidade. Fale com a diretoria."
      : "Já existe um cadastro parecido em outra unidade. Fale com a diretoria.";
  }
  const inativo = r.existente && !r.existente.ativo;
  if (r.bloqueio === "cnpj") {
    return inativo
      ? "Já existe um cliente com este CNPJ, mas ele está inativo. Reative o cadastro antigo em vez de criar outro."
      : "Já existe um cliente cadastrado com este CNPJ.";
  }
  if (r.bloqueio === "contato") {
    return inativo
      ? "Já existe um cliente inativo com o mesmo telefone e e-mail. Reative o cadastro antigo em vez de criar outro."
      : "Já existe um cliente com o mesmo telefone e e-mail.";
  }
  return inativo
    ? "Encontramos um cadastro parecido, que está inativo. Reative o cadastro antigo ou confirme que é outro cliente."
    : "Encontramos um cadastro parecido. Confira antes de cadastrar outro.";
}

// Mesmo formato da Admissão Rápida (409 + jaExiste). Lista branca: nunca telefone, e-mail, CNPJ ou id
// interno do existente além do que a tela precisa (id/nome/cidade/ativo, e só se a pessoa enxerga a unidade).
export function respostaDuplicidade(r: ResultadoDuplicidade, reativacao = false): NextResponse {
  return NextResponse.json(
    {
      error: mensagem(r, reativacao),
      jaExiste: true,
      duplicidade: {
        nivel: r.nivel,
        bloqueio: r.bloqueio,
        motivos: r.motivos,
        existente: r.existente,
        outros: r.outros,
        podeConfirmar: r.podeConfirmar,
        podeLiberar: r.podeLiberar,
        podeReativar: reativacao ? false : r.podeReativar,
        outraUnidade: r.outraUnidade,
      },
    },
    { status: 409 }
  );
}

export type DecisaoDuplicidade =
  | { tipo: "livre" }
  | { tipo: "confirmada" | "liberada"; resultado: ResultadoDuplicidade }
  | { tipo: "responder"; resposta: NextResponse };

// Aviso: segue com confirmar_duplicidade. Bloqueio por CNPJ: nunca segue. Bloqueio por telefone+e-mail:
// segue com liberar_bloqueio, mas só PAPEIS_FULL_ACCESS (os demais levam 403).
// reativacao: reativar um cadastro (ativo false→true) só esbarra em BLOQUEIO; sinal único / nome parecido
// (aviso) não se aplica — decisão do Olver.
export function decidirDuplicidade(
  resultado: ResultadoDuplicidade | null,
  flags: { confirmar: boolean; liberar: boolean },
  papelFull: boolean,
  reativacao = false
): DecisaoDuplicidade {
  if (!resultado) return { tipo: "livre" };
  if (reativacao && resultado.nivel === "aviso") return { tipo: "livre" };
  if (resultado.nivel === "aviso") {
    return flags.confirmar ? { tipo: "confirmada", resultado } : { tipo: "responder", resposta: respostaDuplicidade(resultado) };
  }
  if (resultado.bloqueio === "contato" && flags.liberar) {
    if (!papelFull) {
      return { tipo: "responder", resposta: NextResponse.json({ error: "Só a diretoria pode liberar este cadastro." }, { status: 403 }) };
    }
    return { tipo: "liberada", resultado };
  }
  return { tipo: "responder", resposta: respostaDuplicidade(resultado, reativacao) };
}
