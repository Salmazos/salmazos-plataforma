import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import { checarAcessoAniversarios } from "@/lib/aniversariosAuth";
import { resolverUnidadeUsuario } from "@/lib/unidadeAuth";

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
  const acessoNegado = await checarAcessoAniversarios(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const hoje = obterDataHojeBrasil();
  const mesAtual = hoje.getMonth() + 1;
  const diaAtual = hoje.getDate();
  const hojeISO = formatarDataISO(hoje);

  // Popup "aniversariante de hoje" só com os contatos da unidade de quem está logado.
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return NextResponse.json({ data: [], ja_visto: true });

  let contatosQuery = svc
    .from("aniversariantes_contatos")
    .select("id, nome_contato, cargo, data_nascimento, empresa_nome, clientes(id, nome)")
    .eq("ativo", true);
  if (!ctx.todasUnidades) contatosQuery = contatosQuery.eq("unidade_id", ctx.unidadeId);
  const { data: contatosRaw, error: errContatos } = await contatosQuery;

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
