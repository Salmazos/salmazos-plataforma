import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoTokenUpdateSchema } from "@/lib/schemas";
import { resolveAdmissaoByToken } from "@/lib/admissaoToken";

interface Params {
  params: Promise<{ token: string }>;
}

// Rota pública — acessada pelo candidato sem sessão autenticada.
export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  const svc = createServiceClient();

  const { data: admissao, error } = await svc
    .from("admissoes")
    .select("id, candidato_id, vaga_id, modalidade, status, token_expira_em, token_usado_em, criado_em, candidatos(nome_completo, cargo_pretendido), vagas(titulo)")
    .eq("token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!admissao) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  if (new Date(admissao.token_expira_em) < new Date()) {
    return NextResponse.json({ error: "Este link expirou." }, { status: 410 });
  }

  if (!admissao.token_usado_em) {
    await svc
      .from("admissoes")
      .update({ token_usado_em: new Date().toISOString() })
      .eq("id", admissao.id);
  }

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }, { data: valeTransporte }, { data: autorizacaoSindical }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", admissao.id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", admissao.id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("id, tipo_documento, status, obrigatorio, condicional, motivo_rejeicao").eq("admissao_id", admissao.id).order("created_at", { ascending: true }),
    svc.from("admissao_vale_transporte").select("*, admissao_vt_linhas(*)").eq("admissao_id", admissao.id).order("ordem", { referencedTable: "admissao_vt_linhas", ascending: true }).maybeSingle(),
    svc.from("admissao_autorizacao_sindical").select("*").eq("admissao_id", admissao.id).maybeSingle(),
  ]);

  return NextResponse.json({
    data: {
      admissao,
      dados_pessoais: dadosPessoais ?? null,
      dependentes: dependentes ?? [],
      documentos: documentos ?? [],
      vale_transporte: valeTransporte ?? null,
      autorizacao_sindical: autorizacaoSindical ?? null,
    },
  });
}

// Autosave de passo (dados_pessoais parcial) e/ou envio final (submit) — rota pública via token.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { token } = await params;

  const resolved = await resolveAdmissaoByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  const { admissaoId, status: statusAtual, svc } = resolved;

  const body = await request.json();
  const parsed = parseBody(admissaoTokenUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { dados_pessoais, vale_transporte, autorizacao_sindical, submit, lgpd_aceite } = parsed.data;

  // Defesa redundante ao .refine() do schema — se o envio final não vier com o
  // consentimento LGPD marcado, bloqueia aqui também.
  if (submit && lgpd_aceite !== true) {
    return NextResponse.json({ error: "Consentimento LGPD é obrigatório para enviar a admissão." }, { status: 400 });
  }

  if (dados_pessoais && Object.keys(dados_pessoais).length > 0) {
    const { error: upsertError } = await svc
      .from("admissao_dados_pessoais")
      .upsert({ admissao_id: admissaoId, ...dados_pessoais }, { onConflict: "admissao_id" });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  if (vale_transporte && Object.keys(vale_transporte).length > 0) {
    const { linhas, ...vtFields } = vale_transporte;
    const { data: vtRow, error: vtError } = await svc
      .from("admissao_vale_transporte")
      .upsert({ admissao_id: admissaoId, ...vtFields }, { onConflict: "admissao_id" })
      .select("id")
      .single();
    if (vtError) return NextResponse.json({ error: vtError.message }, { status: 400 });

    if (linhas) {
      // Até 2 linhas, sem persistência individual — substitui tudo a cada save
      // (mesmo raciocínio do delete+insert já usado em km_visitas).
      const { error: delError } = await svc.from("admissao_vt_linhas").delete().eq("vale_transporte_id", vtRow.id);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 400 });
      if (linhas.length > 0) {
        const { error: linhasError } = await svc.from("admissao_vt_linhas").insert(
          linhas.map((l, idx) => ({ vale_transporte_id: vtRow.id, ...l, ordem: idx + 1 }))
        );
        if (linhasError) return NextResponse.json({ error: linhasError.message }, { status: 400 });
      }
    }
  }

  if (autorizacao_sindical && Object.keys(autorizacao_sindical).length > 0) {
    const { error: asError } = await svc
      .from("admissao_autorizacao_sindical")
      .upsert({ admissao_id: admissaoId, ...autorizacao_sindical }, { onConflict: "admissao_id" });
    if (asError) return NextResponse.json({ error: asError.message }, { status: 400 });
  }

  const statusUpdates: Record<string, unknown> = {};
  if (submit) {
    // A schema já garante lgpd_aceite === true quando submit === true (ver admissaoTokenUpdateSchema).
    statusUpdates.status = "aguardando_analise";
    statusUpdates.lgpd_aceite_em = new Date().toISOString();
    statusUpdates.lgpd_aceite_ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? null;
  } else if (statusAtual === "aguardando_candidato") {
    statusUpdates.status = "em_preenchimento";
  }

  if (Object.keys(statusUpdates).length > 0) {
    await svc.from("admissoes").update(statusUpdates).eq("id", admissaoId);
  }

  return NextResponse.json({ success: true, status: statusUpdates.status ?? statusAtual });
}
