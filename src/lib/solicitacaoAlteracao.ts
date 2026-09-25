import { createServiceClient } from "@/lib/supabase/server";
import { propagarAlteracoesSolicitacaoNaVaga } from "@/lib/propagarSolicitacaoNaVaga";
import { ROTULO_CAMPO_SOLICITACAO, valorLegivelCampo, type Alteracoes } from "@/lib/solicitacaoAlteracaoRotulos";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Campos de uma solicitação de vaga que podem ser alterados depois de enviada — pela equipe
// (PATCH /api/solicitacoes-vagas/[id]) ou pelo cliente via pedido de alteração aprovado
// (solicitacao_vaga_alteracoes). Mesmos campos que o card mostra e que viram a vaga; os
// rótulos ficam em solicitacaoAlteracaoRotulos.ts (sem dependência de servidor, pra tela usar).
export { ROTULO_CAMPO_SOLICITACAO, type Alteracoes } from "@/lib/solicitacaoAlteracaoRotulos";

// Só os campos que realmente mudaram, já normalizados (texto vazio vira null).
export function calcularAlteracoes(atual: Record<string, unknown>, novos: Record<string, unknown>): Alteracoes {
  const alteracoes: Alteracoes = {};
  for (const [campo, valor] of Object.entries(novos)) {
    if (valor === undefined || !(campo in ROTULO_CAMPO_SOLICITACAO)) continue;
    const depois = typeof valor === "string" ? valor.trim() || null : valor;
    const antes = atual[campo] ?? null;
    if (depois !== antes) alteracoes[campo] = { antes, depois };
  }
  return alteracoes;
}

// Linhas "• Item" do texto de benefícios viram os chips que o card mostra — mesmo formato que
// o portal grava (texto em tópicos + chips), pra os dois não ficarem divergentes depois da edição.
function chipsDeBeneficios(texto: string | null): Record<string, boolean> | null {
  if (!texto) return null;
  const itens = texto
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
  if (itens.length === 0) return null;
  return Object.fromEntries(itens.map((i) => [i, true]));
}

// Grava as alterações na solicitação (só se ela ainda estiver no status esperado) e, se ela já
// virou vaga, propaga pra vaga. Devolve a solicitação atualizada, ou null quando o status mudou
// no meio do caminho (alguém aprovou/recusou em paralelo).
export async function aplicarAlteracoesSolicitacao(
  solicitacao: { id: string; status: string; vaga_id: string | null },
  alteracoes: Alteracoes,
  alteradoPor: string,
  supabase?: ServiceClient
): Promise<{ data: Record<string, unknown> | null; vagaAtualizada: boolean; erroVaga: boolean }> {
  const svc = supabase ?? createServiceClient();

  const campos: Record<string, unknown> = Object.fromEntries(
    Object.entries(alteracoes).map(([campo, { depois }]) => [campo, depois])
  );
  if ("beneficios" in campos) campos.beneficios_chips = chipsDeBeneficios(campos.beneficios as string | null);

  const { data, error } = await svc
    .from("solicitacoes_vagas")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", solicitacao.id)
    .eq("status", solicitacao.status)
    .select("*")
    .single();
  if (error || !data) return { data: null, vagaAtualizada: false, erroVaga: false };

  // A solicitação já foi salva a esta altura — falha na vaga vira aviso pro chamador (erroVaga),
  // não exceção, pra não parecer que nada foi gravado.
  let vagaAtualizada = false;
  if (data.status === "aprovada" && data.vaga_id) {
    try {
      const { camposVaga } = await propagarAlteracoesSolicitacaoNaVaga(data.vaga_id, campos, alteradoPor, svc);
      vagaAtualizada = camposVaga.length > 0;
    } catch (err) {
      console.error(`[aplicarAlteracoesSolicitacao] Solicitação ${solicitacao.id} salva, mas a vaga não foi atualizada:`, err);
      return { data, vagaAtualizada: false, erroVaga: true };
    }
  }
  return { data, vagaAtualizada, erroVaga: false };
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Tabela "Campo | Antes | Depois" pros e-mails (valores escapados — vêm do que o cliente digitou).
export function resumoAlteracoesHtml(alteracoes: Alteracoes): string {
  const linhas = Object.entries(alteracoes)
    .map(([campo, { antes, depois }]) => {
      const celula = (v: unknown) =>
        escapeHtml(valorLegivelCampo(campo, v)).replace(/\n/g, "<br>");
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;color:#374151;vertical-align:top">${escapeHtml(ROTULO_CAMPO_SOLICITACAO[campo] ?? campo)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#9CA3AF;vertical-align:top">${celula(antes)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;vertical-align:top">${celula(depois)}</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 20px">
    <tr>
      <th style="text-align:left;padding:6px 10px;color:#6B7280;font-size:11px;text-transform:uppercase">Campo</th>
      <th style="text-align:left;padding:6px 10px;color:#6B7280;font-size:11px;text-transform:uppercase">Antes</th>
      <th style="text-align:left;padding:6px 10px;color:#6B7280;font-size:11px;text-transform:uppercase">Depois</th>
    </tr>
    ${linhas}
  </table>`;
}

// Cliente só pode pedir alteração enquanto a vaga está ativa (decisão do Olver, 25/09):
// solicitação pendente, ou aprovada com a vaga aberta/pausada.
export function clientePodePedirAlteracao(status: string, vagaStatus: string | null): boolean {
  if (status === "pendente") return true;
  return status === "aprovada" && (vagaStatus === "aberta" || vagaStatus === "pausada");
}
