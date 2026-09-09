import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, admissaoContabilidadeCancelarEnvelopeSchema } from "@/lib/schemas";
import { cancelarDocumento } from "@/lib/zapsign";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

const TIPO_PACOTE = "contabilidade" as const;

// Cancela um envelope de assinatura PENDENTE do pacote da contabilidade, destravando a
// substituição de todos os documentos já enviados (ver fix do filtro em
// documentos-contabilidade/[tipo]/route.ts). Nunca cancela um envelope já 'assinado' —
// documento com validade jurídica firmada exige cancelamento manual no painel da ZapSign
// + suporte técnico (ver ModalUploadDocumentosContabilidade / AdmissaoDetalheClient).
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(admissaoContabilidadeCancelarEnvelopeSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { motivo, confirmarCancelamentoManual } = parsed.data;

  const svc = createServiceClient();

  const { data: envelope, error: envelopeErr } = await svc
    .from("admissao_envelopes_assinatura")
    .select("id, status, documento_externo_id")
    .eq("admissao_id", id)
    .eq("tipo_pacote", TIPO_PACOTE)
    .maybeSingle();
  if (envelopeErr || !envelope) return NextResponse.json({ error: "Nenhum envelope encontrado para este pacote." }, { status: 404 });

  if (envelope.status === "assinado") {
    return NextResponse.json(
      {
        error:
          "Este pacote já foi assinado. Para corrigir, cancele o contrato no painel do ZapSign e contate o suporte técnico para reabrir o pacote manualmente.",
      },
      { status: 409 }
    );
  }
  if (envelope.status === "cancelado") {
    return NextResponse.json({ error: "Este envelope já está cancelado." }, { status: 409 });
  }

  let viaFallbackManual = false;

  if (envelope.documento_externo_id) {
    const resultado = await cancelarDocumento(envelope.documento_externo_id, motivo);
    if (!resultado.ok) {
      if (resultado.jaAssinado) {
        // Corrida rara: assinado entre a leitura acima e a chamada à ZapSign agora mesmo.
        return NextResponse.json(
          {
            error:
              "Este pacote já foi assinado. Para corrigir, cancele o contrato no painel do ZapSign e contate o suporte técnico para reabrir o pacote manualmente.",
          },
          { status: 409 }
        );
      }
      if (!confirmarCancelamentoManual) {
        return NextResponse.json(
          {
            error: `Não foi possível cancelar automaticamente na ZapSign (${resultado.erro}). Se você já cancelou manualmente pelo painel da ZapSign, marque a confirmação e tente novamente.`,
            falhaApiZapSign: true,
          },
          { status: 409 }
        );
      }
      viaFallbackManual = true;
    }
  } else {
    // Sem documento_externo_id registrado — nada a cancelar do lado da ZapSign.
    viaFallbackManual = true;
  }

  const { error: updateError } = await svc
    .from("admissao_envelopes_assinatura")
    .update({ status: "cancelado" })
    .eq("id", envelope.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_envelope_contabilidade_cancelado",
    entidade: "admissao_envelopes_assinatura",
    entidade_id: envelope.id,
    detalhes: {
      admissao_id: id,
      documento_externo_id: envelope.documento_externo_id,
      motivo,
      via_fallback_manual: viaFallbackManual,
    },
  });

  return NextResponse.json({ ok: true });
}
