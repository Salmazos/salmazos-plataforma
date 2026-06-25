import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { parseBody, candidatoResponsavelSchema } from "@/lib/schemas";

const ETAPAS_ATIVAS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(candidatoResponsavelSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { responsavel } = parsed.data;

  const svc = createServiceClient();

  if (responsavel !== "") {
    const { data: analista } = await svc
      .from("analistas_perfil")
      .select("id")
      .eq("nome_completo", responsavel)
      .eq("ativo", true)
      .maybeSingle();

    if (!analista) {
      return NextResponse.json({ error: "Responsável inválido." }, { status: 400 });
    }
  }

  const { data: candidatoAtual } = await svc
    .from("candidatos")
    .select("responsavel, nome_completo")
    .eq("id", id)
    .single();

  const oldResponsavel = candidatoAtual?.responsavel ?? null;
  const candidatoNome = candidatoAtual?.nome_completo ?? "";
  const newResponsavel = responsavel || null;

  const { data, error } = await svc
    .from("candidatos")
    .update({ responsavel: newResponsavel, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await svc
    .from("candidatos_vagas")
    .update({ responsavel: newResponsavel })
    .eq("candidato_id", id)
    .in("etapa", ETAPAS_ATIVAS);

  if (oldResponsavel !== newResponsavel) {
    const oldLabel = oldResponsavel ?? "Sem responsável";
    const newLabel = newResponsavel ?? "Sem responsável";

    void registrarHistorico({
      candidato_id: id,
      tipo: "comentario_interno",
      descricao: `Responsabilidade transferida de ${oldLabel} para ${newLabel}`,
      criado_por: user.email ?? null,
    });

    if (oldResponsavel) {
      const { data: oldAnalista } = await svc
        .from("analistas_perfil")
        .select("user_id")
        .eq("nome_completo", oldResponsavel)
        .eq("ativo", true)
        .maybeSingle();

      if (oldAnalista?.user_id) {
        await svc.from("notificacoes_analista").insert({
          tipo: "transferencia_responsavel",
          titulo: "Candidato transferido",
          mensagem: `${candidatoNome} foi transferido para ${newLabel}`,
          candidato_id: id,
          user_id: oldAnalista.user_id,
        });
      }
    }
  }

  return NextResponse.json({ success: true, responsavel: newResponsavel });
}
