// Pré-preenchimento da tela "Nova proposta" a partir do cadastro (contato principal, CNPJ e endereço da empresa escolhida). Regras puras (sem imports de
// servidor): usadas pela tela e pelos testes.
// REGRAS: A/C, CNPJ e endereço PERTENCEM À EMPRESA: ao escolher outra empresa a tela reinicia os três para os dados da nova (ou vazios), mesmo que tenham sido
// digitados; nada de uma empresa atravessa a troca. DENTRO da mesma empresa, o pré-preenchimento só preenche campos VAZIOS (nunca sobrescreve o digitado) e
// todos continuam editáveis. O snapshot da proposta continua guardando o que foi enviado no formulário.
import { mascararCnpj, somenteDigitos } from "@/lib/documentoBr";

export const MAX_AC = 200;
export const MAX_CNPJ = 30;
export const MAX_ENDERECO = 300;

// O que a rota de pré-preenchimento devolve (só isto): nome e cargo do contato, CNPJ, endereço (texto) e cidade.
export interface DadosPrefill {
  contato: { nome: string; cargo: string | null } | null;
  cnpj: string | null;
  cidade: string | null;
  endereco: string | null;
}
export interface CamposPrefill {
  aos_cuidados: string;
  cliente_cnpj: string;
  cliente_endereco: string;
}

// CNPJ do cadastro como TEXTO: com 14 dígitos recebe a máscara do sistema (00.000.000/0000-00); fora desse padrão vai como está (nunca se bloqueia nem se altera
// o que o cadastro tem), limitado ao tamanho do campo.
export function cnpjParaCampo(cnpj: string | null | undefined): string {
  const t = (cnpj ?? "").trim();
  if (!t) return "";
  if (somenteDigitos(t).length === 14 && /^[\d.\-/\s]+$/.test(t)) return mascararCnpj(t);
  return t.slice(0, MAX_CNPJ);
}

// Endereço: o endereço do cadastro do cliente, quando existir; senão a cidade (da empresa ou do cliente); senão vazio. Nada é inventado nem montado.
export function enderecoParaCampo(endereco: string | null | undefined, cidade: string | null | undefined): string {
  return ((endereco ?? "").trim() || (cidade ?? "").trim()).slice(0, MAX_ENDERECO);
}

export function valoresDoCadastro(dados: DadosPrefill): CamposPrefill {
  return {
    aos_cuidados: (dados.contato?.nome ?? "").trim().slice(0, MAX_AC),
    cliente_cnpj: cnpjParaCampo(dados.cnpj),
    cliente_endereco: enderecoParaCampo(dados.endereco, dados.cidade),
  };
}

// Preenche só os campos VAZIOS (em branco conta como vazio); o que já está nos campos nunca é sobrescrito.
export function aplicarPrefill<T extends CamposPrefill>(atual: T, dados: DadosPrefill): T {
  const novos = valoresDoCadastro(dados);
  const campos = { ...atual };
  for (const k of ["aos_cuidados", "cliente_cnpj", "cliente_endereco"] as const) {
    if (atual[k].trim() === "" && novos[k] !== "") campos[k] = novos[k] as T[typeof k];
  }
  return campos;
}

// Resposta da rota: qualquer coisa fora do formato esperado é ignorada (nunca quebra a tela nem preenche às cegas).
export function lerDadosPrefill(json: unknown): DadosPrefill | null {
  const d = (json as { data?: unknown } | null)?.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const o = d as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  const c = o.contato && typeof o.contato === "object" && !Array.isArray(o.contato) ? (o.contato as Record<string, unknown>) : null;
  const nome = c ? texto(c.nome) : null;
  return { contato: nome ? { nome, cargo: texto(c?.cargo) } : null, cnpj: texto(o.cnpj), cidade: texto(o.cidade), endereco: texto(o.endereco) };
}
