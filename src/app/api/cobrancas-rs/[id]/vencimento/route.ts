import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, cobrancaRsVencimentoSchema } from "@/lib/schemas";
import { podeRevisarCobranca } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";

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

  const { data, error } = await svc
    .from("cobrancas_rs")
    .update({ data_vencimento: data_vencimento || null })
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
  if (!atual.data_vencimento && data.data_vencimento && data.status === "aprovada_enviada" && data.revisado_por) {
    after(async () => {
      try {
        const { data: analista } = await svc
          .from("analistas_perfil")
          .select("email, nome_completo")
          .eq("user_id", data.revisado_por)
          .eq("ativo", true)
          .maybeSingle();

        if (!analista?.email) {
          console.error(`[vencimento] Analista revisor sem e-mail ativo resolvido (cobranca_id=${id}, revisado_por=${data.revisado_por}).`);
          return;
        }

        const template = getEmailTemplate("cobranca_rs_validada_diretoria", {
          nome: analista.nome_completo ?? "",
          cargo: data.cargo ?? "—",
          nomeCliente: data.cliente_nome_snapshot,
          nomeCandidato: data.candidato_nome_snapshot ?? undefined,
          feeRsPercentual: data.fee_percentual,
          feeValor: data.fee_valor,
          tipoCobrancaRS: data.tipo,
        });

        const resultado = await sendEmail({ to: analista.email, subject: template.subject, html: template.html, tipo: "cobranca_rs_validada_diretoria" });
        if (!resultado.success) console.error(`[vencimento] Falha ao enviar e-mail de validação pro analista (cobranca_id=${id}):`, resultado.error);
      } catch (err) {
        console.error(`[vencimento] Erro ao montar/enviar e-mail de validação pro analista (cobranca_id=${id}):`, err);
      }
    });
  }

  return NextResponse.json({ data });
}
