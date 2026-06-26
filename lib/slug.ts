import { SupabaseClient } from '@supabase/supabase-js';

export function generateSlug(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export async function generateUniqueSlug(
  titulo: string,
  supabase: SupabaseClient,
  excludeId?: string
): Promise<string> {
  const base = generateSlug(titulo);
  let slug = base;
  let counter = 2;

  while (true) {
    let query = supabase
      .from('vagas')
      .select('id')
      .eq('slug', slug);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data } = await query.maybeSingle();

    if (!data) break;
    slug = `${base}-${counter}`;
    counter++;
  }

  return slug;
}
