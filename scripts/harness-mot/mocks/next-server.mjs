export class NextResponse extends Response {
  static json(corpo, init = {}) {
    return new Response(JSON.stringify(corpo), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
  }
}
export class NextRequest extends Request {}
