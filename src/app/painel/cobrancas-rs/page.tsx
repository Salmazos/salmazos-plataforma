import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CobrancasRSPageClient, { type CobrancaRSRow } from "@/components/CobrancasRSPageClient";
import { checarAcessoCobrancaRS, PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

export default async function CobrancasRSPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // Acesso amplo (PAPEIS_FULL_ACCESS + configurado em cobranca_rs_analistas_acesso) vê a
  // lista completa, como sempre. Quem não tem acesso amplo só entra se tiver pelo menos
  // uma cobrança que ele mesmo gerou (gerado_por_user_id) — nesse caso a lista já vem
  // filtrada só pras dele (ver podeRevisarCobranca, mesma regra usada nas rotas de
  // detalhe/edição/aprovação de uma cobrança específica).
  const acessoAmplo = await checarAcessoCobrancaRS(user);
  if (!acessoAmplo) {
    const { data: minhas } = await svc
      .from("cobrancas_rs")
      .select("id")
      .eq("gerado_por_user_id", user.id)
      .limit(1);
    if (!minhas || minhas.length === 0) redirect("/painel");
  }

  const role = user.app_metadata?.role ?? "analista";
  const isFullAccess = PAPEIS_FULL_ACCESS.includes(role);

  let query = svc.from("cobrancas_rs").select("*, vagas(titulo)").order("created_at", { ascending: false });
  if (!acessoAmplo) query = query.eq("gerado_por_user_id", user.id);
  const { data } = await query;

  const rows: CobrancaRSRow[] = (data ?? []).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    clienteNomeSnapshot: c.cliente_nome_snapshot,
    clienteCnpjSnapshot: c.cliente_cnpj_snapshot,
    clienteEnderecoSnapshot: c.cliente_endereco_snapshot,
    clienteTelefoneSnapshot: c.cliente_telefone_snapshot,
    clienteEmailSnapshot: c.cliente_email_snapshot,
    candidatoNomeSnapshot: c.candidato_nome_snapshot,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vagaTitulo: (c.vagas as any)?.titulo ?? "—",
    cargo: c.cargo,
    salario: c.salario,
    dataInicio: c.data_inicio,
    feePercentual: c.fee_percentual,
    feeValor: c.fee_valor,
    status: c.status,
    createdAt: c.created_at,
    enviadoEm: c.enviado_em,
    pagoEm: c.pago_em,
    dataVencimento: c.data_vencimento,
  }));

  return <CobrancasRSPageClient rows={rows} isFullAccess={isFullAccess} acessoAmplo={acessoAmplo} />;
}
