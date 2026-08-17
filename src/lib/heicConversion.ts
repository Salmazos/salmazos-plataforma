import convert from "heic-convert";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

const BUCKET = "admissao-docs";

export function ehHeic(storagePath: string): boolean {
  return /\.heic$/i.test(storagePath);
}

/**
 * Converte um arquivo HEIC já salvo no Storage para JPEG, substituindo o original —
 * nenhum navegador exibe HEIC inline, só sabe baixar. A build de sharp/libvips instalada
 * aqui não decodifica HEIC (binários públicos excluem o decoder HEVC por licenciamento de
 * patente, só suportam AVIF), por isso a decodificação em si usa heic-convert (WASM puro,
 * sem essa restrição); sharp entra só depois, sobre o JPEG já decodificado, pra normalizar
 * orientação EXIF e recomprimir de forma consistente com o resto do sistema (ver
 * embutirImagemComprimida em pdfWriter.ts).
 *
 * Retorna o storage_path final a persistir no banco — o novo (.jpg) se a conversão deu
 * certo, ou o original (.heic) se falhou por qualquer motivo. Nunca lança: uma falha de
 * conversão não pode derrubar a confirmação do upload nem perder o documento do candidato,
 * só fica registrada no log pra investigação.
 */
export async function converterHeicSeNecessario(
  svc: ServiceClient,
  storagePath: string
): Promise<string> {
  if (!ehHeic(storagePath)) return storagePath;

  try {
    const { data: blob, error: downloadError } = await svc.storage.from(BUCKET).download(storagePath);
    if (downloadError || !blob) throw downloadError ?? new Error("Download do Storage retornou vazio.");

    const heicBuffer = new Uint8Array(await blob.arrayBuffer());
    const jpegBruto = await convert({ buffer: heicBuffer, format: "JPEG", quality: 0.9 });
    const jpegBuffer = await sharp(Buffer.from(jpegBruto)).rotate().jpeg({ quality: 85 }).toBuffer();

    const novoPath = storagePath.replace(/\.heic$/i, ".jpg");
    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(novoPath, jpegBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw uploadError;

    const { error: removeError } = await svc.storage.from(BUCKET).remove([storagePath]);
    if (removeError) {
      // Não desfaz a conversão por causa disso — o JPEG já está salvo e será o que o
      // banco passa a referenciar; o .heic original só fica órfão no bucket (storage
      // não é o dado de negócio, dá pra limpar depois sem risco).
      console.error(
        `[converterHeicSeNecessario] JPEG salvo (${novoPath}) mas falhou ao remover .heic original (${storagePath}):`,
        removeError.message
      );
    }

    return novoPath;
  } catch (err) {
    console.error(
      `[converterHeicSeNecessario] Falha ao converter HEIC->JPEG (${storagePath}) — mantendo arquivo original:`,
      err
    );
    return storagePath;
  }
}
