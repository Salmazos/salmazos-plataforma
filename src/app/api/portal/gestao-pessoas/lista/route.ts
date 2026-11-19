import { NextResponse } from "next/server";
import { resolverClienteDoPortal } from "@/lib/portalCliente";
import { carregarPessoasAtivas } from "@/lib/gestaoPessoas";
import { filtrarFuncionariosGestao, linhasParaPortal } from "@/lib/gestaoPessoasLista";
import { gestaoPessoasListaPortalSchema, parseBody } from "@/lib/schemas";
import { formatarDataISO, obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

// Lista filtrada do cliente no portal. O corpo traz SÓ os filtros: a empresa vem da sessão (resolverClienteDoPortal), qualquer cliente_id no corpo é
// descartado pelo schema. Linha com nome, cargo, admissão e tempo de casa (e dia/mês + idade que completa no filtro de aniversariantes); sem sexo,
// idade nem escolaridade, sem ids, sem exportação.
export async function POST(request: Request) {
  try {
    const r = await resolverClienteDoPortal();
    if (!r.ok) {
      if (r.motivo === "sem_sessao") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
      return NextResponse.json({ error: r.motivo === "suspenso" ? "Acesso suspenso. Entre em contato com a Salmazos." : "Não é um usuário de cliente." }, { status: 403 });
    }
    const corpo = parseBody(gestaoPessoasListaPortalSchema, await request.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ error: corpo.error }, { status: 400 });

    const base = await carregarPessoasAtivas(r.service, { clienteId: r.clienteId, unidadeRH: null });
    if (!base) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const filtros = corpo.data.filtros;
    const linhas = filtrarFuncionariosGestao(base.pessoas, filtros, formatarDataISO(obterDataHojeBrasil()));
    return NextResponse.json({ total: linhas.length, linhas: linhasParaPortal(linhas, filtros) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[POST /api/portal/gestao-pessoas/lista]", e);
    return NextResponse.json({ error: "Não foi possível carregar a lista." }, { status: 500 });
  }
}
