import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Candidatura vinda do formulário PÚBLICO só vale para vaga pública: vaga privada (visivel_publicamente=false) não tem página nem listagem, e o
// formulário dela só é alcançável por URL direta. Devolve "privada" se QUALQUER das vagas indicadas for privada, "erro" se não deu para conferir
// (quem chama recusa: na dúvida, não aceita) e "ok" caso contrário. Ids que não são uuid são ignorados (não podem ser vaga alguma).
export async function conferirVagasPublicas(svc: Service, ids: unknown[]): Promise<"ok" | "privada" | "erro"> {
  const validos = [...new Set(ids.filter((i): i is string => typeof i === "string" && UUID.test(i)))];
  if (validos.length === 0) return "ok";
  const { data, error } = await svc.from("vagas").select("id").in("id", validos).eq("visivel_publicamente", false);
  if (error) {
    console.error("[candidatos] Não foi possível conferir a visibilidade das vagas:", error.message);
    return "erro";
  }
  return (data ?? []).length > 0 ? "privada" : "ok";
}
