// Contagens dos quadros do topo da lista de Funcionários (RH) e do seletor de empresas. Funções puras, sem I/O: usadas pela tela e pelo script de verificação.
// Regra (já era a da tela antes do recorte por empresa): os quadros contam só ATIVOS, independente do filtro de status, da busca e da modalidade.
import { compararNomes } from "@/lib/funcionariosBusca";

export interface FuncionarioParaResumo {
  status: string;
  cliente_id: string | null;
  tipo_servico: string | null;
  faltas_cadastro: string[];
}

export interface ResumoFuncionarios {
  total: number;
  mot: number;
  terceirizacao: number;
  semModalidade: number;
  incompletos: number;
}

// `clienteId` vazio/null = todas as empresas (mesmos números de antes). Com empresa, só os ativos dela.
export function resumirFuncionarios(lista: readonly FuncionarioParaResumo[], clienteId: string | null = null): ResumoFuncionarios {
  const r: ResumoFuncionarios = { total: 0, mot: 0, terceirizacao: 0, semModalidade: 0, incompletos: 0 };
  for (const f of lista) {
    if (f.status !== "ativo") continue;
    if (clienteId && f.cliente_id !== clienteId) continue;
    r.total++;
    if (f.tipo_servico === "mao_obra_temporaria") r.mot++;
    else if (f.tipo_servico === "terceirizacao") r.terceirizacao++;
    if (!f.tipo_servico) r.semModalidade++;
    if (f.faltas_cadastro.length > 0) r.incompletos++;
  }
  return r;
}

export interface OpcaoEmpresa {
  id: string;
  nome: string;
  total: number;
}

// Opções do seletor: cada empresa com o total de ativos dela (0 continua aparecendo), em ordem alfabética sem diferenciar maiúscula nem acento.
export function opcoesEmpresasComContagem(empresas: readonly { id: string; nome: string }[], lista: readonly FuncionarioParaResumo[]): OpcaoEmpresa[] {
  const porEmpresa = new Map<string, number>();
  for (const f of lista) {
    if (f.status !== "ativo" || !f.cliente_id) continue;
    porEmpresa.set(f.cliente_id, (porEmpresa.get(f.cliente_id) ?? 0) + 1);
  }
  return empresas.map((e) => ({ id: e.id, nome: e.nome, total: porEmpresa.get(e.id) ?? 0 })).sort((a, b) => compararNomes(a.nome, b.nome));
}
