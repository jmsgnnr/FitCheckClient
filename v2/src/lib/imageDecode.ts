export const IMAGE_DECODE_TIMEOUT_MS = 8000;

export type ImageDecodeResult = { ok: true } | { ok: false };

/**
 * Prove that the browser can fully decode a file before it becomes the preview.
 * Uses createImageBitmap when present; otherwise falls back to an offscreen
 * HTMLImageElement so unsupported browsers cannot show a broken preview.
 * The object URL used for the fallback is always revoked.
 */
export async function canDecodeImage(
  file: Blob,
  timeoutMs = IMAGE_DECODE_TIMEOUT_MS,
): Promise<ImageDecodeResult> {
  if (typeof createImageBitmap === "function") {
    try {
      const decoded = await createImageBitmap(file);
      decoded.close();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
  if (typeof Image !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return { ok: false };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
    });
    image.src = url;
    let ok = await loaded;
    if (ok && typeof image.decode === "function") {
      ok = await image.decode().then(() => true, () => false);
    }
    if (ok && (image.naturalWidth === 0 || image.naturalHeight === 0)) ok = false;
    return ok ? { ok: true } : { ok: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}
