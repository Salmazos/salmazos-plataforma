// Conversão entre o formato de exibição/edição (string separada por vírgula, mesmo
// padrão usado em todo o resto do módulo de carta de conta salário) e o formato de
// armazenamento (TEXT[] em bancos_parceiros.emails_para/emails_cc).
export function splitEmails(v: string | null | undefined): string[] {
  if (!v) return [];
  return v.split(",").map((e) => e.trim()).filter(Boolean);
}

export function joinEmails(arr: string[] | null | undefined): string {
  return (arr ?? []).join(", ");
}
