import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import { montarListaFerias } from "@/lib/feriasLista";
import { hojeBrasiliaISO } from "@/lib/rescisaoProgramada";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import FeriasPageClient from "@/components/FeriasPageClient";

export const dynamic = "force-dynamic";

// Aba Férias do RH. Mesmo gate de Funcionários (chave rh_funcionarios, sem chave nova) e mesmo recorte por unidade do Vencimento de Contrato:
// supervisor só vê a própria unidade; sócios, todas. Monta a lista direto no servidor (a mesma montagem da rota GET /api/ferias, que a tela usa para
// recarregar depois de cada ação) e garante os períodos que faltam (idempotente).
export default async function FeriasPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFuncionarios(user))) redirect("/painel");
  const ctxRH = await contextoRH(user);
  if (!ctxRH) return <SemAcessoPainel />;

  const hojeISO = hojeBrasiliaISO();
  const resultado = await montarListaFerias(createServiceClient(), ctxRH, {}, hojeISO);

  // Tabelas ainda inexistentes (migração pendente) ou erro de banco: a tela mostra a mensagem em vez de quebrar.
  if ("erroResposta" in resultado) {
    const corpo = await resultado.erroResposta.json().catch(() => ({}));
    const erro = typeof corpo.error === "string" ? corpo.error : "Não foi possível carregar o controle de férias. Tente novamente.";
    return <FeriasPageClient linhasIniciais={[]} clientes={[]} hojeISO={hojeISO} erroCarga={erro} />;
  }

  return <FeriasPageClient linhasIniciais={resultado.lista.linhas} clientes={resultado.lista.clientes} hojeISO={hojeISO} />;
}
