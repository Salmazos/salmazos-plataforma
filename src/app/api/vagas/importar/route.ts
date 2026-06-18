import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

const SYSTEM_PROMPT =
  "Você é um especialista em RH e redação profissional. Padronize os campos da vaga de emprego com linguagem profissional, clara e correta. Retorne APENAS um JSON válido com os campos padronizados, sem explicações, sem markdown.";

type VagaRow = Record<string, unknown>;

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

async function padronizarVaga(vaga: VagaRow): Promise<VagaRow> {
  try {
    const userMsg = `Padronize este anúncio de vaga:
Título: ${vaga.titulo}
Requisitos: ${vaga.requisitos ?? "Não informado"}
Benefícios: ${vaga.beneficios ?? "Não informado"}
Horário: ${vaga.horario ?? "Não informado"}
Salário: ${vaga.salario ?? "Não informado"}

Regras:
- titulo: capitalize corretamente (ex: 'auxiliar de produção' → 'Auxiliar de Produção')
- requisitos: reescreva de forma profissional, use bullet points com '•', corrija ortografia, mantenha todas as informações
- beneficios: reescreva de forma profissional, use bullet points com '•', corrija ortografia, mantenha todos os benefícios
- horario: padronize o formato (ex: '2a a 6a 07h00 as 17h00' → 'Segunda a Sexta, 07h00 às 17h00')
- salario: formate como 'R$ X.XXX,00' se for número, ou mantenha 'A combinar' se não informado

Retorne APENAS este JSON:
{"titulo": "...", "requisitos": "...", "beneficios": "...", "horario": "...", "salario": "..."}`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });

    const block = message.content[0];
    const text = block?.type === "text" ? block.text.trim() : "";
    const limpo = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(limpo);

    return {
      ...vaga,
      titulo: parsed.titulo || vaga.titulo,
      requisitos: parsed.requisitos || vaga.requisitos,
      beneficios: parsed.beneficios || vaga.beneficios,
      horario: parsed.horario || vaga.horario,
      salario: parsed.salario || vaga.salario,
    };
  } catch (err) {
    console.error("[padronizarVaga] AI fallback for:", vaga.titulo, err);
    return vaga;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    const vagas: VagaRow[] = [];

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

    // AI standardization in batches of 5
    const BATCH_SIZE = 5;
    const padronizadas: VagaRow[] = [];

    for (let i = 0; i < vagas.length; i += BATCH_SIZE) {
      const batch = vagas.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(padronizarVaga));
      padronizadas.push(...results);
      if (i + BATCH_SIZE < vagas.length) {
        await sleep(500);
      }
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vagas")
      .upsert(padronizadas, { onConflict: "titulo" })
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ importadas: data?.length ?? padronizadas.length, erros: [] });
  } catch (err) {
    console.error("[POST /api/vagas/importar]", err);
    return NextResponse.json({ error: "Erro ao processar o arquivo." }, { status: 500 });
  }
}
