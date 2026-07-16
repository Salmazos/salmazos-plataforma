import { NextRequest, NextResponse } from "next/server";

// TEMPORÁRIO — teste de isolamento do 503 recorrente em POST /envelopes (investigação de
// 2026-07-15/16). Faz um GET /envelopes (leitura, não consome documento do plano) na
// mesma URL base de produção com o CLICKSIGN_API_TOKEN real, pra saber se o 503 é
// específico do endpoint POST /envelopes ou afeta a conta/token inteiro. Gate com chave
// de uso único (não é um secret reaproveitável) só pra não deixar a rota totalmente
// aberta enquanto existir. REMOVER esta rota depois da investigação.
const DEBUG_KEY = "db7e9a3cfc98c44b47a62ba47402532e";

export async function GET(request: NextRequest) {
  const key = request.headers.get("x-debug-key");
  if (key !== DEBUG_KEY) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const token = process.env.CLICKSIGN_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "CLICKSIGN_API_TOKEN não configurado." }, { status: 500 });
  }

  const baseUrl = "https://api.clicksign.com/api/v3"; // mesma URL de produção usada em lib/clicksign.ts

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/envelopes`, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
        Authorization: token,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Falha de rede ao chamar a Clicksign: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  const rawBody = await res.text();

  return NextResponse.json({
    baseUrl,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    bodyLength: rawBody.length,
    body: rawBody,
  });
}
