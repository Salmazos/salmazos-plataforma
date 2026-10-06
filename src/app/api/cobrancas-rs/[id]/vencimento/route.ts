import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsVencimentoSchema } from "@/lib/schemas";
import { podeRevisarCobranca } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { avisarCobrancaRSEmail } from "@/lib/avisarCobrancaRS";
import { EVENTO_COBRANCA_RS_VALIDADA, TIPO_EMAIL_COBRANCA_VALIDADA } from "@/lib/cobrancaRSRegras";

interface Params {
  params: Promise<{ id: string }>;
}

// Rota dedicada (não o PATCH genérico de /api/cobrancas-rs/[id]) porque aquele bloqueia
// qualquer edição fora de status='pendente_revisao' — trava proposital pra congelar
// cargo/salário/CNPJ/endereço depois da aprovação. Vencimento é um campo operacional à
// parte, editável a qualquer momento até a cobrança ser marcada como paga.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(cobrancaRsVencimentoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data_vencimento } = parsed.data;

  const svc = createServiceClient();

  const { data: atual, error: atualErr } = await svc
    .from("cobrancas_rs")
    .select("id, status, gerado_por_user_id, revisado_por, data_vencimento")
    .eq("id", id)
    .single();

  if (atualErr || !atual) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });

  const pode = await podeRevisarCobranca(user, atual);
  if (!pode) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  if (atual.status === "paga") {
    return NextResponse.json({ error: "Esta cobrança já foi paga — o vencimento não pode mais ser alterado." }, { status: 400 });
  }

  // Definir a data de vencimento É o ato de "validação da diretoria" neste fluxo — por isso
  // essa é a única rota que faz a transição aprovada_enviada -> validada (adicionado em
  // set/2026, ver histórico da migração cobranca_rs_status_validada). Simétrico: se a data for
  // apagada (voltando a null) enquanto ainda está 'validada', volta pra 'aprovada_enviada' —
  // não deveria existir cobrança "validada" sem data de vencimento preenchida.
  const novaData = data_vencimento || null;
  let novoStatus: "validada" | "aprovada_enviada" | undefined;
  if (novaData && atual.status === "aprovada_enviada") novoStatus = "validada";
  else if (!novaData && atual.status === "validada") novoStatus = "aprovada_enviada";

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({ data_vencimento: novaData, ...(novoStatus ? { status: novoStatus } : {}) })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Invalida o Router Cache do lado do cliente pra /painel/cobrancas-rs — data de
  // vencimento aparece na listagem, mesma lógica de aprovar/route.ts (ver comentário lá).
  revalidatePath("/painel/cobrancas-rs");

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "cobranca_rs_vencimento_definido",
    entidade: "cobrancas_rs",
    entidade_id: id,
    detalhes: { data_vencimento: data_vencimento || null },
  });

  // E-mail de confirmação pro analista que revisou a cobrança original (revisado_por —
  // quem clicou "Enviar para validação da diretoria", ver podeRevisarCobranca), avisando
  // que a diretoria concluiu a validação. Dispara só na PRIMEIRA vez que o vencimento é
  // definido (atual.data_vencimento era null): correções posteriores da data (typo, cliente
  // pediu prazo diferente) não devem reenviar "sua revisão foi aprovada" de novo — o evento
  // que importa aqui é a validação inicial da diretoria, não cada edição do campo.
  if (!atual.data_vencimento && data.data_vencimento && data.status === "validada" && data.revisado_por) {
    after(async () => {
      try {
        // Aviso interno (Configurações > Avisos > cobranca_rs_validada): sem lista no canal e-mail, só o revisor da cobrança
        // (analista ativo com e-mail); com lista, só a lista; desligado, ninguém.
        await avisarCobrancaRSEmail(svc, {
          evento: EVENTO_COBRANCA_RS_VALIDADA,
          tipo: TIPO_EMAIL_COBRANCA_VALIDADA,
          cobrancaId: id,
          contexto: "vencimento",
          legado: async () => {
            const { data: analista } = await svc
              .from("analistas_perfil")
              .select("email, nome_completo")
              .eq("user_id", data.revisado_por)
              .eq("ativo", true)
              .maybeSingle();
            return analista?.email ? [{ email: analista.email, nome_completo: analista.nome_completo }] : [];
          },
          montar: (nome) =>
            getEmailTemplate("cobranca_rs_validada_diretoria", {
              nome,
              cargo: data.cargo ?? "—",
              nomeCliente: data.cliente_nome_snapshot,
              nomeCandidato: data.candidato_nome_snapshot ?? undefined,
              feeRsPercentual: data.fee_percentual,
              feeValor: data.fee_valor,
              tipoCobrancaRS: data.tipo,
            }),
        });
      } catch (err) {
        console.error(`[vencimento] Erro ao montar/enviar e-mail de validação pro analista (cobranca_id=${id}):`, err);
      }
    });
  }

  return NextResponse.json({ data });
}
