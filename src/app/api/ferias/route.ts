import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, feriasFiltrosSchema } from "@/lib/schemas";
import { autorizarFerias } from "@/lib/feriasPeriodos";
import { montarListaFerias } from "@/lib/feriasLista";
import { hojeBrasiliaISO } from "@/lib/rescisaoProgramada";

export const dynamic = "force-dynamic";

// Lista do controle de férias (a tela da 2C consome esta rota): quem entra, período atual, data-limite, dias restantes e semáforo.
// Mesmo gate de Funcionários (sem chave nova) e recorte por unidade do RH. Garante os períodos que faltam (idempotente).
// Filtros na query: cliente_id, unidade_id, situacao, semaforo, faixa (vencidos, ate30, ate90, pendente), a_vencer=1, busca.
export async function GET(request: NextRequest) {
  const auth = await autorizarFerias();
  if ("erro" in auth) return auth.erro;

  const q = request.nextUrl.searchParams;
  const bruto: Record<string, unknown> = {};
  for (const chave of ["cliente_id", "unidade_id", "situacao", "semaforo", "faixa", "busca"]) {
    const valor = q.get(chave);
    if (valor) bruto[chave] = valor;
  }
  if (q.get("a_vencer") === "1" || q.get("a_vencer") === "true") bruto.a_vencer = true;
  const parsed = parseBody(feriasFiltrosSchema, bruto);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const resultado = await montarListaFerias(createServiceClient(), auth.ctx, parsed.data, hojeBrasiliaISO());
  if ("erroResposta" in resultado) return resultado.erroResposta;
  return NextResponse.json({ data: resultado.lista.linhas, clientes: resultado.lista.clientes, unidades: resultado.lista.unidades, resumo: resultado.lista.resumo });
}
