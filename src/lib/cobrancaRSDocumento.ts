import { somenteDigitos, mascararCpf, validarCpf } from "./documentoBr";
import { normalizarCnpj, normalizarCpf, type ClienteIdentidade } from "./clienteDuplicidade";

// Documento e e-mail do cliente na Cobrança R&S. Módulo puro (sem I/O): roda na rota, no modal e nos scripts.
// A coluna cobrancas_rs.cliente_cnpj_snapshot é texto livre e guarda tanto CNPJ (cliente PJ) quanto CPF (cliente PF); o nome da coluna ficou o de
// sempre. Quem precisa saber qual é usa tipoDocumentoDaCobranca.

export type TipoDocumento = "cpf" | "cnpj";

export interface ClienteParaCobranca {
  cnpj?: string | null;
  cpf?: string | null;
  contato_email?: string | null;
  email_nota_fiscal?: string | null;
}

// PJ continua igual (cnpj); PF não tem cnpj (nulo, vazio ou só espaços), então cai no cpf.
export function documentoDoCliente(c: ClienteParaCobranca | null | undefined): string | null {
  return c?.cnpj?.trim() ? c.cnpj : c?.cpf ?? null;
}

// E-mail do snapshot da cobrança: o da nota fiscal quando preenchido, senão o de contato (PJ e PF).
export function emailDaCobranca(c: ClienteParaCobranca | null | undefined): string | null {
  const nf = c?.email_nota_fiscal?.trim();
  return nf ? nf : c?.contato_email ?? null;
}

// Cliente PF → CPF; qualquer outro caso (PJ, ou cobrança sem cadastro vinculado) → CNPJ, como sempre foi. O tipo vem do cadastro, nunca é deduzido
// pelo tamanho do documento.
export function tipoDocumentoDaCobranca(tipoPessoa: string | null | undefined): TipoDocumento {
  return tipoPessoa === "pf" ? "cpf" : "cnpj";
}

export const rotuloDocumento = (t: TipoDocumento): "CPF" | "CNPJ" => (t === "cpf" ? "CPF" : "CNPJ");

export type ResultadoDocumentoDaCobranca = { ok: true; valor: string } | { ok: false; erro: string };

// Documento digitado na revisão da cobrança. PF aceita só CPF válido (11 dígitos, dígitos verificadores conferidos) e grava com máscara. PJ segue
// como sempre foi (texto como digitado, sem conferir dígitos) e só recusa o que é claramente um CPF (11 dígitos). Sem cadastro (tipoPessoa
// ausente) nada é conferido: é o comportamento de antes.
export function validarDocumentoDaCobranca(tipoPessoa: string | null | undefined, digitado: string): ResultadoDocumentoDaCobranca {
  const valor = digitado.trim();
  const digitos = somenteDigitos(valor);
  if (tipoPessoa === "pf") {
    if (digitos.length === 14) return { ok: false, erro: "Este cliente é pessoa física: informe o CPF (11 dígitos), não um CNPJ." };
    if (digitos.length !== 11) return { ok: false, erro: "Este cliente é pessoa física: informe o CPF com 11 dígitos." };
    if (!validarCpf(valor)) return { ok: false, erro: "CPF inválido. Confira os números." };
    return { ok: true, valor: mascararCpf(valor) };
  }
  if (tipoPessoa === "pj" && digitos.length === 11) {
    return { ok: false, erro: "Este cliente é pessoa jurídica: informe o CNPJ (14 dígitos), não um CPF." };
  }
  return { ok: true, valor: digitado };
}

export interface DocumentoEmOutroCliente {
  existe: boolean;
  // true = o outro cadastro é de unidade diferente da cobrança: a tela só diz "outra unidade", nunca nome, cidade nem id.
  outraUnidade: boolean;
}

// O documento (CPF de 11 ou CNPJ de 14 dígitos) já está em outro cliente, ativo ou inativo, de qualquer unidade?
export function documentoJaCadastradoEmOutroCliente(
  valor: string,
  tipo: TipoDocumento,
  clientes: readonly ClienteIdentidade[],
  ignorarClienteId: string | null,
  unidadeDaCobranca: string | null
): DocumentoEmOutroCliente {
  const alvo = tipo === "cpf" ? normalizarCpf(valor) : normalizarCnpj(valor);
  if (!alvo) return { existe: false, outraUnidade: false };
  const achados = clientes.filter(
    (c) => c.id !== ignorarClienteId && (tipo === "cpf" ? normalizarCpf(c.cpf) : normalizarCnpj(c.cnpj)) === alvo
  );
  if (achados.length === 0) return { existe: false, outraUnidade: false };
  return { existe: true, outraUnidade: achados.some((c) => !!unidadeDaCobranca && c.unidade_id !== unidadeDaCobranca) };
}
