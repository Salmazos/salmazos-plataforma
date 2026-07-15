import imageCompression from "browser-image-compression";

const TIPOS_COMPRIMIVEIS = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

export function precisaComprimir(file: File): boolean {
  return TIPOS_COMPRIMIVEIS.has(file.type) || /\.(heic|heif)$/i.test(file.name);
}

// Redimensiona/recomprime no browser antes do upload. PDFs não passam por aqui
// (a compressão deles não é necessária/possível nesta etapa).
export async function comprimirImagem(file: File): Promise<File> {
  if (!precisaComprimir(file)) return file;
  try {
    const comprimido = await imageCompression(file, {
      maxWidthOrHeight: 1600,
      initialQuality: 0.75,
      fileType: "image/jpeg",
      useWebWorker: true,
    });
    const novoNome = file.name.replace(/\.[^./\\]+$/, "") + ".jpg";
    return new File([comprimido], novoNome, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    console.error("Falha ao otimizar imagem, enviando arquivo original:", err);
    return file;
  }
}
