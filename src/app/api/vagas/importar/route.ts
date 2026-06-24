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
  if (v === "fechado" || v === "fechada" || v === "encerrado" || v === "encerrada") return "fechada";
  if (v === "cancelado" || v === "cancelada") return "cancelada";
  if (v === "pausado" || v === "pausada" || v === "em andamento") return "pausada";
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

function formatSalario(val: unknown): string {
  if (val === null || val === undefined || val === "") return "A combinar";
  if (typeof val === "number") {
    return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const str = String(val).trim();
  if (!str) return "A combinar";
  const num = parseFloat(str.replace(",", "."));
  if (!isNaN(num) && /^[\d.,]+$/.test(str)) {
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return str;
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
    const lastSheetName = workbook.SheetNames[workbook.SheetNames.length - 1];
    const sheet = workbook.Sheets[lastSheetName];
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
    const colIndex: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (h) colIndex[String(h).trim()] = i;
    });

    const dataRows = rawRows.slice(headerRowIndex + 1);

    console.log("Sheet:", lastSheetName);
    console.log("Header row index:", headerRowIndex);
    console.log("Headers encontrados:", JSON.stringify(headers));
    console.log("Column index map:", JSON.stringify(colIndex));

    const cell = (row: unknown[], col: string): string => {
      const idx = colIndex[col];
      if (idx === undefined) return "";
      return String(row[idx] ?? "").trim();
    };

    const cellRaw = (row: unknown[], col: string): unknown => {
      const idx = colIndex[col];
      if (idx === undefined) return null;
      return row[idx] ?? null;
    };

    const vagas: VagaRow[] = [];

    for (const row of dataRows) {
      const r = row as unknown[];
      const titulo = cell(r, "Vaga");
      if (!titulo) continue;

      const empresa = cell(r, "Empresa") || null;
      const localRaw = cell(r, "Local");
      const { cidade, estado } = parseLocal(localRaw);
      const status = mapStatus(cell(r, "Status"));
      const responsavel = cell(r, "Responsável") || cell(r, "Responsavel") || "Giovanni";
      const salarioRaw = cellRaw(r, "Salário") ?? cellRaw(r, "Salario");

      vagas.push({
        titulo,
        cliente_nome: empresa,
        cliente_id: null,
        tipo_servico: "recrutamento_selecao",
        num_posicoes: 1,
        status,
        cidade,
        estado,
        requisitos: cell(r, "Requisitos") || null,
        beneficios: cell(r, "Benefícios") || cell(r, "Beneficios") || null,
        horario: cell(r, "Horário") || cell(r, "Horario") || null,
        salario: formatSalario(salarioRaw),
        responsavel,
        habilidades_desejadas: [],
        observacoes: cell(r, "Observação") || cell(r, "Observacao") || null,
        prazo: null,
        salario_min: null,
        salario_max: null,
      });
    }

    if (vagas.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma vaga encontrada no arquivo. Verifique se a coluna 'Vaga' existe." },
        { status: 400 },
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

    const seen = new Map<string, typeof padronizadas[0]>();
    for (const vaga of padronizadas) {
      const key = `${vaga.titulo}||${vaga.cliente_nome}`;
      seen.set(key, vaga);
    }
    const deduplicadas = Array.from(seen.values());

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vagas")
      .upsert(deduplicadas, { onConflict: "titulo,cliente_nome" })
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ importadas: data?.length ?? deduplicadas.length, erros: [] });
  } catch (err) {
    console.error("[POST /api/vagas/importar]", err);
    return NextResponse.json({ error: "Erro ao processar o arquivo." }, { status: 500 });
  }
}
