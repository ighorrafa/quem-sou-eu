import { MAX_UPLOAD_BYTES, validateImageFile } from "./validation";

export const CARD_IMAGE_MAX_SIDE = 1024;
const JPEG_QUALITY = 0.85;

async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari antigo e alguns formatos: cai para <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redimensiona para no máximo 1024px e exporta JPEG com fundo branco,
 * reduzindo o tamanho do upload e padronizando o formato.
 */
export async function prepareCardImage(file: File): Promise<Blob> {
  const check = validateImageFile(file);
  if (!check.ok) throw new Error(check.error);

  const source = await loadImage(file);
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new Error("Não foi possível ler a imagem.");

  const scale = Math.min(1, CARD_IMAGE_MAX_SIDE / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não suporta processamento de imagem.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Falha ao processar a imagem.");
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("A imagem continua grande demais após a compressão. Tente outra.");
  }
  return blob;
}

/** Caminho determinístico por sala/usuário; o sufixo aleatório evita cache. */
export function buildCardImagePath(roomId: string, userId: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${roomId}/${userId}/${Date.now()}-${suffix}.jpg`;
}
