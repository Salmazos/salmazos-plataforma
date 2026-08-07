import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CobrancasRSPageClient, { type CobrancaRSRow } from "@/components/CobrancasRSPageClient";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

export default async function CobrancasRSPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) redirect("/painel");

  const svc = createServiceClient();
  const { data } = await svc
    .from("cobrancas_rs")
    .select("*, vagas(titulo)")
    .order("created_at", { ascending: false });

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
  }));

  return <CobrancasRSPageClient rows={rows} />;
}
