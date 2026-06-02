import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceClient } from "@/lib/supabase/server";

function mapStatus(s: string): string {
  const v = String(s || "").toLowerCase().trim();
  if (v === "aberto" || v === "aberta") return "aberta";
  if (v === "fechado" || v === "fechada" || v === "encerrado" || v === "encerrada") return "encerrada";
  if (v === "cancelado" || v === "cancelada") return "cancelada";
  if (v === "em andamento") return "em_andamento";
  return "aberta";
}

function parseLocal(local: string): { cidade: string | null; estado: string | null } {
  if (!local) return { cidade: null, estado: null };
  const parts = local.split("/").map((s) => s.trim());
  if (parts.length >= 2) {
    return { cidade: parts[0] || null, estado: parts[1] || null };
  }
  return { cidade: parts[0] || null, estado: null };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    const headerRowIndex = rawRows.findIndex((row) =>
      (row as unknown[]).some((cell) => String(cell).trim().toLowerCase() === "vaga")
    );

    if (headerRowIndex === -1) {
      return NextResponse.json(
        { error: "Coluna 'Vaga' não encontrada. Verifique se o arquivo possui um cabeçalho com essa coluna." },
        { status: 400 }
      );
    }

    const headers = rawRows[headerRowIndex] as unknown[];
    const rows = rawRows.slice(headerRowIndex + 1).map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (h) obj[String(h).trim()] = (row as unknown[])[i] ?? "";
      });
      return obj;
    });

    console.log("Header row index:", headerRowIndex);
    console.log("Headers encontrados:", JSON.stringify(headers));
    console.log("Primeira linha:", JSON.stringify(rows[0]));
    console.log("Segunda linha:", JSON.stringify(rows[1]));

    const vagas: Record<string, unknown>[] = [];
    const erros: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const titulo = String(row["Vaga"] ?? "").trim();
      if (!titulo) continue;

      const localRaw = String(row["Local"] ?? "").trim();
      const { cidade, estado } = parseLocal(localRaw);

      const status = mapStatus(String(row["Status"] ?? ""));

      const responsavel =
        String(row["Responsável"] ?? row["Responsavel"] ?? "").trim() || "Giovanni";

      vagas.push({
        titulo,
        cliente_id: null,
        tipo_servico: "recrutamento_selecao",
        num_posicoes: 1,
        status,
        cidade,
        estado,
        requisitos:  String(row["Requisitos"]  ?? "").trim() || null,
        beneficios:  String(row["Benefícios"]  ?? row["Beneficios"] ?? "").trim() || null,
        horario:     String(row["Horário"]     ?? row["Horario"]    ?? "").trim() || null,
        salario:     String(row["Salário"]     ?? row["Salario"]    ?? "").trim() || null,
        responsavel: responsavel || null,
        habilidades_desejadas: [],
        observacoes: null,
        prazo: null,
        salario_min: null,
        salario_max: null,
      });
    }

    if (vagas.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma vaga encontrada no arquivo. Verifique se a coluna 'Vaga' existe." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vagas")
      .insert(vagas)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ importadas: data?.length ?? vagas.length, erros });
  } catch (err) {
    console.error("[POST /api/vagas/importar]", err);
    return NextResponse.json({ error: "Erro ao processar o arquivo." }, { status: 500 });
  }
}
