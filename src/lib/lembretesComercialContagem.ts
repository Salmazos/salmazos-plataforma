// Contagem do aviso diário (sino) do Comercial: sem imports de propósito, para poder ser verificada com
// node --experimental-strip-types (ver scripts/verificar-lembretes-comercial.mts).
//
// Conta por vendedor as EMPRESAS distintas com algo a retomar: lembrete pendente vencido ou de hoje, e oportunidade
// aberta do funil com a próxima ação vencida ou de hoje (mesma regra do "Meu dia"). Lembrete e oportunidade da
// mesma empresa contam uma vez só; registro sem empresa vinculada conta por conta própria (não dá para saber se
// é a mesma empresa de outro).

export interface ItemParaContar {
  id: string;
  vendedor_id: string;
  empresa_visitada_id: string | null;
}

export function agruparEmpresasPorVendedor(lembretes: ItemParaContar[], oportunidades: ItemParaContar[]): Map<string, Set<string>> {
  const porVendedor = new Map<string, Set<string>>();
  const incluir = (vendedorId: string, chave: string) => {
    const set = porVendedor.get(vendedorId) ?? new Set<string>();
    set.add(chave);
    porVendedor.set(vendedorId, set);
  };
  for (const l of lembretes) incluir(l.vendedor_id, l.empresa_visitada_id ?? `lembrete-${l.id}`);
  for (const o of oportunidades) incluir(o.vendedor_id, o.empresa_visitada_id ?? `oportunidade-${o.id}`);
  return porVendedor;
}
