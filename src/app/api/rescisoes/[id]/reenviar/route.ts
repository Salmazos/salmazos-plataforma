import { NextRequest, NextResponse, after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { enviarEmailRescisao } from "@/lib/dispararAvisosRescisao";

interface Params {
  params: Promise<{ id: string }>;
}

// Reenvio manual do e-mail "Rescisão lançada" — restrito a PAPEIS_FULL_ACCESS
// (checarPapelFullAccess), mesmo padrão de /api/cobrancas-rs/[id]/reenviar. Chama SÓ
// enviarEmailRescisao (canal de e-mail isolado) — nunca dispararAvisosRescisao inteiro, que
// também insere em notificacoes_analista e duplicaria sino/popup pra quem já recebeu no
// lançamento original. Rescisão não tem "status pendente" como cobrancas_rs — qualquer
// rescisão já lançada é elegível pro reenvio, sem checagem de status.
export async function POST(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const gate = checarPapelFullAccess(user);
  if (gate) return gate;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: rescisao, error } = await svc.from("rescisoes").select("id").eq("id", id).maybeSingle();
  if (error || !rescisao) return NextResponse.json({ error: "Rescisão não encontrada." }, { status: 404 });

  after(async () => {
    try {
      const nomeUsuario = await resolverNomeUsuario(user.id, user.email ?? null, svc);
      const resultado = await enviarEmailRescisao(id, "lancamento", svc);

      registrarAuditoria({
        usuario_id: user.id,
        usuario_nome: nomeUsuario,
        acao: "rescisao_reenviada",
        entidade: "rescisoes",
        entidade_id: id,
        detalhes: {
          funcionario: resultado?.funcionario ?? null,
          empresa: resultado?.empresa ?? null,
          destinatarios: resultado?.destinatariosCount ?? 0,
          email_falhou: resultado ? !resultado.sucesso : null,
        },
      });
    } catch (err) {
      console.error(`[reenviar] Erro ao reenviar e-mail de rescisão (rescisao_id=${id}):`, err);
    }
  });

  return NextResponse.json({ success: true });
}
