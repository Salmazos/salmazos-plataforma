import { NextResponse } from "next/server";
import { prepararGestaoRH } from "@/lib/gestaoPessoasRH";
import { filtrarFuncionariosGestao, linhasParaRH } from "@/lib/gestaoPessoasLista";

// Lista de funcionários ativos de UMA empresa, filtrada (RH). O navegador manda a empresa escolhida na tela e os filtros; a unidade é validada aqui.
// Linhas sem id de funcionário/admissão/cliente e sem CPF/RG/PIS/cor/endereço/salário.
export async function POST(request: Request) {
  try {
    const p = await prepararGestaoRH(request);
    if (p instanceof Response) return p;
    const linhas = filtrarFuncionariosGestao(p.pessoas, p.filtros, p.hojeISO);
    return NextResponse.json({ total: linhas.length, linhas: linhasParaRH(linhas, p.filtros) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[POST /api/gestao-pessoas/lista]", e);
    return NextResponse.json({ error: "Não foi possível carregar a lista." }, { status: 500 });
  }
}
