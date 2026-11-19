import { NextResponse } from "next/server";
import { prepararGestaoRH } from "@/lib/gestaoPessoasRH";
import { descricaoDosFiltros, filtrarFuncionariosGestao, linhasParaRH, montarCsvRH, nomeArquivoCsv } from "@/lib/gestaoPessoasLista";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

// Exportação da lista filtrada (SÓ no RH; o portal não tem rota equivalente). Exatamente o que a tela mostra, com as colunas do RH, gerado aqui no
// servidor com o mesmo gate e a mesma checagem de unidade da lista. Dado pessoal sai do sistema, então fica registrado quem, empresa, quantidade e filtros.
export async function POST(request: Request) {
  try {
    const p = await prepararGestaoRH(request);
    if (p instanceof Response) return p;
    const linhas = filtrarFuncionariosGestao(p.pessoas, p.filtros, p.hojeISO);
    const csv = montarCsvRH(linhasParaRH(linhas, p.filtros), p.filtros.aniversario !== undefined);
    registrarAuditoria({
      usuario_id: p.user.id,
      usuario_nome: await resolverNomeUsuario(p.user.id, p.user.email ?? null),
      acao: "exportar",
      entidade: "gestao_pessoas",
      entidade_id: p.cliente.id,
      detalhes: { empresa: p.cliente.nome, linhas: linhas.length, filtros: descricaoDosFiltros(p.filtros) },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null,
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomeArquivoCsv(p.cliente.nome, p.hojeISO)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[POST /api/gestao-pessoas/exportar]", e);
    return NextResponse.json({ error: "Não foi possível gerar o arquivo." }, { status: 500 });
  }
}
