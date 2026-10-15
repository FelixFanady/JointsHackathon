"use client";

export async function compressImage(
  file: File,
  { maxEdge = 256, quality = 0.72 }: { maxEdge?: number; quality?: number } = {},
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("File bukan gambar.");

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kompresi gambar gagal.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  let dataUri = canvas.toDataURL("image/jpeg", quality);
  let q = quality;
  while (dataUri.length > 340000 && q > 0.4) {
    q -= 0.1;
    dataUri = canvas.toDataURL("image/jpeg", q);
  }
  return dataUri;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Gagal memuat gambar."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function dataUriKb(uri: string): number {
  const b64 = uri.slice(uri.indexOf(",") + 1);
  return Math.round((b64.length * 3) / 4 / 1024);
}
