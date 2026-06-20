import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const users = [
    "consultoria@salmazos.com.br",
    "rh@salmazos.com.br",
    "comercial@salmazos.com.br",
    "gestao@salmazos.com.br",
    "curriculos@salmazos.com.br",
  ];

  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers();

  const results = [];
  for (const email of users) {
    const user = allUsers?.find(u => u.email === email);
    if (!user) {
      results.push({ email, ok: false, error: "User not found" });
      continue;
    }
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: "Salmazos@2026",
      email_confirm: true,
    });
    results.push({ email, ok: !error, id: user.id, error: error?.message });
  }

  return NextResponse.json(results);
}
