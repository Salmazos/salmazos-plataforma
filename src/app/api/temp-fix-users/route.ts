import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = [];

  const { data: u1, error: e1 } = await supabase.auth.admin.updateUserById(
    "a1131df1-94bf-4c82-930e-0f80742d8ebf",
    { password: "Salmazos@2026", app_metadata: { role: "superuser" } }
  );
  results.push({ email: "olver@salmazos.com.br", ok: !e1, error: e1?.message });

  const { data: u2, error: e2 } = await supabase.auth.admin.updateUserById(
    "a3d48389-9856-482b-a1c9-65670871a6a4",
    { password: "Salmazos@2026", app_metadata: { role: "analyst" } }
  );
  results.push({ email: "vagas@salmazos.com.br", ok: !e2, error: e2?.message });

  return NextResponse.json(results);
}
