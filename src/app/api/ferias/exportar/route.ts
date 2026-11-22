import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, feriasFiltrosSchema } from "@/lib/schemas";
import { autorizarFerias } from "@/lib/feriasPeriodos";
import { descricaoFiltrosFerias, montarCsvFerias, montarListaFerias, nomeArquivoCsvFerias } from "@/lib/feriasLista";
import { hojeBrasiliaISO } from "@/lib/rescisaoProgramada";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Exportação da lista filtrada, para enviar à contabilidade (mesmo padrão de api/gestao-pessoas/exportar): exatamente o que a tela mostra, gerado no
// servidor com o mesmo gate e o mesmo recorte de unidade da lista. Dado de funcionário sai do sistema, então fica registrado quem, quantidade e filtros.
// Corpo: os mesmos filtros da lista (todos opcionais). `a_vencer: true` = só amarelo e vermelho (90 dias ou menos, ou vencido).
export async function POST(request: Request) {
  try {
    const auth = await autorizarFerias();
    if ("erro" in auth) return auth.erro;

    const corpo = await request.json().catch(() => ({}));
    const parsed = parseBody(feriasFiltrosSchema, corpo ?? {});
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const filtros = parsed.data;

    const hoje = hojeBrasiliaISO();
    const resultado = await montarListaFerias(createServiceClient(), auth.ctx, filtros, hoje);
    if ("erroResposta" in resultado) return resultado.erroResposta;
    const { linhas } = resultado.lista;

    const csv = montarCsvFerias(linhas);
    registrarAuditoria({
      usuario_id: auth.user.id,
      usuario_nome: await resolverNomeUsuario(auth.user.id, auth.user.email ?? null),
      acao: "exportar",
      entidade: "ferias",
      entidade_id: null,
      detalhes: { linhas: linhas.length, filtros: descricaoFiltrosFerias(filtros) },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null,
      unidade_id: auth.ctx.unidadeId,
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomeArquivoCsvFerias(hoje, filtros.a_vencer === true)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[POST /api/ferias/exportar]", e);
    return NextResponse.json({ error: "Não foi possível gerar o arquivo." }, { status: 500 });
  }
}
