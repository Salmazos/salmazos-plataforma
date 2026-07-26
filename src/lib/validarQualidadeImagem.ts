// Validação mínima de qualidade — roda no mesmo momento pros dois caminhos de upload
// (câmera com moldura e "escolher da galeria"), antes de comprimirImagem(). Só pega casos
// extremos de propósito (muito escuro, muito borrado) — limiares calibrados conservadores
// pra não bloquear foto razoável por falso positivo; ajustar depois de ver uso real.

export interface ResultadoValidacaoQualidade {
  ok: boolean;
  motivo?: string;
}

const LADO_MAX_ANALISE = 200; // reduz antes de analisar — essencial pra não travar no mobile
const LIMIAR_BRILHO_MINIMO = 35; // luminância média, escala 0-255
const LIMIAR_NITIDEZ_MINIMA = 12; // variância do Laplaciano aproximado

// Kernel Laplaciano 3x3 ([[0,1,0],[1,-4,1],[0,1,0]]) aplicado na escala de cinza —
// aproxima "quantidade de borda" da imagem. Foto borrada tem pouca variação de borda,
// então a variância das respostas do kernel fica baixa.
function variandaLaplaciano(cinza: Float32Array, largura: number, altura: number): number {
  if (largura < 3 || altura < 3) return Infinity; // imagem pequena demais pra analisar — não bloqueia
  const respostas: number[] = [];
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const idx = y * largura + x;
      const valor = cinza[idx - largura] + cinza[idx + largura] + cinza[idx - 1] + cinza[idx + 1] - 4 * cinza[idx];
      respostas.push(valor);
    }
  }
  const media = respostas.reduce((s, v) => s + v, 0) / respostas.length;
  return respostas.reduce((s, v) => s + (v - media) ** 2, 0) / respostas.length;
}

export async function validarQualidadeImagem(file: File): Promise<ResultadoValidacaoQualidade> {
  // Só imagens têm "brilho"/"nitidez" nesse sentido — PDFs passam direto.
  if (!file.type.startsWith("image/")) return { ok: true };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formato que o navegador não decodifica aqui (ex.: HEIC em alguns casos) — não
    // bloqueia; comprimirImagem()/o próprio upload já lidam com esses formatos à parte.
    return { ok: true };
  }

  try {
    const escala = Math.min(1, LADO_MAX_ANALISE / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: true };
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    const { data } = ctx.getImageData(0, 0, largura, altura);

    const cinza = new Float32Array(largura * altura);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      cinza[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const brilhoMedio = cinza.reduce((soma, v) => soma + v, 0) / cinza.length;
    if (brilhoMedio < LIMIAR_BRILHO_MINIMO) {
      return { ok: false, motivo: "A foto ficou muito escura. Tente novamente em um local mais iluminado." };
    }

    const variancia = variandaLaplaciano(cinza, largura, altura);
    if (variancia < LIMIAR_NITIDEZ_MINIMA) {
      return { ok: false, motivo: "A foto ficou borrada. Segure o celular firme e tente novamente." };
    }

    return { ok: true };
  } finally {
    bitmap.close();
  }
}
