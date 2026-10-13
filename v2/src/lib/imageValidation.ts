import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from "./constants";

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Fast metadata rejection before reading any file bytes. */
export function validateImageFile(file: File): ImageValidationResult {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return {
      ok: false,
      message: "Use a JPG, PNG, or WEBP image. Other formats are not accepted in this prototype.",
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "This file is over 10 MB. Try a smaller export or crop." };
  }
  if (file.size === 0) {
    return { ok: false, message: "The file looks empty. Pick another image." };
  }
  return { ok: true };
}

/** Check actual file headers, not merely the browser-provided MIME claim. */
export async function validateImageContent(file: File): Promise<ImageValidationResult> {
  const metadata = validateImageFile(file);
  if (!metadata.ok) return metadata;
  let bytes: Uint8Array;
  try {
    const header = file.slice(0, 16);
    if (typeof header.arrayBuffer === "function") {
      bytes = new Uint8Array(await header.arrayBuffer());
    } else {
      // FileReader fallback also works in older browser engines and jsdom tests.
      bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(header);
      });
    }
  } catch {
    return { ok: false, message: "We couldn't read that file. Try another image." };
  }
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  const webp = bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const valid = file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : webp;
  return valid
    ? { ok: true }
    : { ok: false, message: "This file doesn't contain a valid JPG, PNG, or WEBP image. Try another photo." };
}
