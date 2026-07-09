import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface ContatoRow {
  id: string;
  nome_contato: string;
  cargo: string | null;
  data_nascimento: string;
  empresa_nome: string | null;
  clientes: { id: string; nome: string } | null;
}

function parseMesDia(iso: string) {
  const [, mesStr, diaStr] = iso.split("-");
  return { mes: Number(mesStr), dia: Number(diaStr) };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const hoje = obterDataHojeBrasil();
  const mesAtual = hoje.getMonth() + 1;
  const diaAtual = hoje.getDate();
  const hojeISO = formatarDataISO(hoje);

  const { data: contatosRaw, error: errContatos } = await svc
    .from("aniversariantes_contatos")
    .select("id, nome_contato, cargo, data_nascimento, empresa_nome, clientes(id, nome)")
    .eq("ativo", true);

  if (errContatos) return NextResponse.json({ error: errContatos.message }, { status: 500 });

  const contatos = (contatosRaw ?? []) as unknown as ContatoRow[];
  const aniversariantesHoje = contatos.filter((c) => {
    const { mes, dia } = parseMesDia(c.data_nascimento);
    return mes === mesAtual && dia === diaAtual;
  });

  const { data: visto } = await svc
    .from("aniversario_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: aniversariantesHoje, ja_visto: !!visto });
}
