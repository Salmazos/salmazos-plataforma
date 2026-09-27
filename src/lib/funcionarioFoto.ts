import { createServiceClient } from "@/lib/supabase/server";

// Bucket privado já usado por ASO/Contrato de funcionário (ver comentário em
// api/funcionarios/[id]/contrato-upload-url/route.ts) — reaproveitado aqui também, com
// pasta própria "fotos-funcionario/", em vez de criar um bucket novo só pra isso.
const BUCKET = "admissao-docs";

// 2h: a foto fica visível a tela toda enquanto a lista/detalhe está aberta — um TTL curto
// (like os signed URLs de download avulso) faria a foto "quebrar" no meio do uso. Ainda
// assim nunca é pública/permanente: expira e é gerada de novo a cada carregamento da página.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 2;

export interface FuncionarioFotoInput {
  id: string;
  foto_path: string | null;
  admissao_id: string | null;
}

// Resolve em lote a URL assinada da foto de cada funcionário, na seguinte ordem de
// prioridade: 1) foto própria (foto_path, enviada manualmente pelo RH — ver
// api/funcionarios/[id]/foto/route.ts); 2) a Foto 3x4 aprovada da admissão digital,
// reaproveitada sem duplicar arquivo (ver lib/admissaoDocumentos.ts); 3) nenhuma — o front
// mostra um ícone/iniciais no lugar. Retorna um Map<funcionario_id, signedUrl> só com quem
// tem foto resolvida; quem não aparece no Map não tem foto.
export async function resolverFotosFuncionarios(
  funcionarios: FuncionarioFotoInput[]
): Promise<Map<string, string>> {
  const fotoUrlPorId = new Map<string, string>();
  if (funcionarios.length === 0) return fotoUrlPorId;

  const svc = createServiceClient();

  const semFotoPropriaComAdmissao = funcionarios.filter((f) => !f.foto_path && f.admissao_id);
  let foto3x4PorAdmissaoId = new Map<string, string>();
  if (semFotoPropriaComAdmissao.length > 0) {
    const admissaoIds = [...new Set(semFotoPropriaComAdmissao.map((f) => f.admissao_id as string))];
    const { data: docs } = await svc
      .from("admissao_documentos")
      .select("admissao_id, storage_path")
      .in("admissao_id", admissaoIds)
      .eq("tipo_documento", "foto_3x4")
      .eq("status", "aprovado");
    foto3x4PorAdmissaoId = new Map((docs ?? []).map((d) => [d.admissao_id as string, d.storage_path as string]));
  }

  await Promise.all(
    funcionarios.map(async (f) => {
      const path = f.foto_path ?? (f.admissao_id ? foto3x4PorAdmissaoId.get(f.admissao_id) : undefined);
      if (!path) return;
      const { data } = await svc.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (data?.signedUrl) fotoUrlPorId.set(f.id, data.signedUrl);
    })
  );

  return fotoUrlPorId;
}

// Path de destino de uma foto própria nova — mesma convenção de nome com timestamp já usada
// em contrato-upload-url/route.ts, pra nunca colidir com a foto anterior (upload novo sempre
// gera um path novo; o antigo fica órfão no Storage, mesma limitação já aceita pelo projeto
// pra ASO/Contrato — sem rotina de limpeza de órfão).
export function pathFotoFuncionario(funcionarioId: string, extensao: string): string {
  const extensaoSegura = extensao.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  return `fotos-funcionario/${funcionarioId}/foto-${Date.now()}.${extensaoSegura}`;
}

export { BUCKET as BUCKET_FOTOS_FUNCIONARIO };
