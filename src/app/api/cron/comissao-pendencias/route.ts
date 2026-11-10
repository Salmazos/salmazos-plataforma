import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cobrancasSemComissao, ehCobrancaDoBeneficiario, pendenciasDaDiretoria } from "@/lib/comissaoPendencias";
import { gravarSinoComissao, userIdsDiretoriaComissao } from "@/lib/comissaoAvisosDiretoria";
import { TIPO_SINO_COMISSAO, janelaDeLembrete, textosSino } from "@/lib/comissaoPendenciasRegras";

export const dynamic = "force-dynamic";

// Sino diário de comissão (rede de segurança contra lançamento esquecido). Roda todo dia; cada tipo de aviso sai no máximo UMA vez por dia
// por pessoa (e por unidade, no caso da diretoria), então rodar de novo não duplica:
// - beneficiário: nos últimos 3 dias do mês e nos dias 1 a 3, se tem cobrança SUA sem comissão marcada (prazo e dias que faltam no texto);
// - diretoria (por unidade, só se houver pendência): contestações paradas, fechamento do mês liberado, fechamento sem pagamento e
//   cobrança de beneficiário sem comissão depois do prazo (possível esquecimento).
// O popup ao entrar no painel mostra o mesmo estado; o sino cobre quem não entra no sistema.
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agora = new Date();
  const resumo = { beneficiarios: 0, diretoria: 0 };
  try {
    const svc = createServiceClient();

    // 1) beneficiários
    const janela = janelaDeLembrete(agora);
    if (janela) {
      const sem = await cobrancasSemComissao(svc, { competencias: [janela.competencia] });
      const { data: bens } = await svc.from("comissao_beneficiarios").select("id, analista_perfil_id").eq("ativo", true);
      for (const b of bens ?? []) {
        const { data: perfil } = await svc.from("analistas_perfil").select("user_id, nome_completo").eq("id", b.analista_perfil_id).maybeSingle();
        if (!perfil?.user_id) continue;
        const minhas = sem.filter((c) => ehCobrancaDoBeneficiario(c, perfil.user_id as string, { nome_completo: (perfil.nome_completo as string | null) ?? null }));
        if (minhas.length === 0) continue;
        resumo.beneficiarios += await gravarSinoComissao(svc, {
          userIds: [perfil.user_id as string], tipo: TIPO_SINO_COMISSAO.lembreteLancamento, texto: textosSino.lembreteLancamento({ qtd: minhas.length, janela }), umaVezPorDia: true, agora,
        });
      }
    }

    // 2) diretoria, por unidade
    const { data: unidades } = await svc.from("unidades").select("id");
    for (const u of unidades ?? []) {
      const unidadeId = u.id as string;
      const p = await pendenciasDaDiretoria(svc, { unidadeId, agora });
      const userIds = await userIdsDiretoriaComissao(svc, unidadeId);
      if (userIds.length === 0) continue;
      const enviar = async (tipo: string, texto: { titulo: string; mensagem: string }) => {
        resumo.diretoria += await gravarSinoComissao(svc, { userIds, tipo, texto, unidadeId, umaVezPorDia: true, agora });
      };
      if (p.contestadas.qtd > 0) await enviar(TIPO_SINO_COMISSAO.diretoriaContestadas, textosSino.contestadas({ qtd: p.contestadas.qtd, maisAntigaEm: p.contestadas.mais_antiga_em }));
      if (p.fechamento) {
        const f = p.fechamento.unidades.find((x) => x.unidade_id === unidadeId);
        if (f) await enviar(TIPO_SINO_COMISSAO.diretoriaFechamento, textosSino.fechamentoLiberado({ competencia: p.fechamento.competencia, qtd: f.qtd, total: f.total }));
      }
      for (const pg of p.pagamento.slice(0, 1)) await enviar(TIPO_SINO_COMISSAO.diretoriaPagamento, textosSino.pagamentoPendente({ competencia: pg.competencia, total: pg.total, dias: pg.dias }));
      if (p.esquecidas) await enviar(TIPO_SINO_COMISSAO.diretoriaEsquecidas, textosSino.esquecidas({ competencia: p.esquecidas.competencia, qtd: p.esquecidas.itens.length }));
    }
    return NextResponse.json({ ok: true, ...resumo });
  } catch (e) {
    console.error("[cron/comissao-pendencias]", e);
    return NextResponse.json({ error: "Erro ao processar os avisos de comissão." }, { status: 500 });
  }
}
