import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const users = [
    { email: "consultoria@salmazos.com.br", nome: "Elizabete Salmazos Santos", role: "diretoria" },
    { email: "rh@salmazos.com.br", nome: "Andreza Thaisla Salmazo Santos", role: "diretoria" },
    { email: "comercial@salmazos.com.br", nome: "Lucas Miguel", role: "diretoria" },
    { email: "gestao@salmazos.com.br", nome: "Edivan", role: "supervisor" },
    { email: "curriculos@salmazos.com.br", nome: "Rebecca Zambonini", role: "analista" },
  ];

  const results = [];
  for (const u of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: "Salmazos@2026",
      email_confirm: true,
      app_metadata: { role: u.role },
      user_metadata: { nome_completo: u.nome },
    });

    // If user already exists, try to update instead
    if (error?.message?.includes("already been registered")) {
      const { data: { users: allUsers } } = await supabase.auth.admin.listUsers();
      const existing = allUsers?.find(au => au.email === u.email);
      if (existing) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          existing.id,
          { password: "Salmazos@2026", app_metadata: { role: u.role } }
        );
        results.push({ email: u.email, action: "updated", ok: !updateError, error: updateError?.message });
        continue;
      }
    }

    // Update analistas_perfil with new user_id if created
    if (data?.user) {
      await supabase
        .from("analistas_perfil")
        .update({ user_id: data.user.id })
        .eq("email", u.email);
    }

    results.push({
      email: u.email,
      action: "created",
      ok: !error,
      id: data?.user?.id,
      error: error?.message,
    });
  }

  return NextResponse.json(results);
}
