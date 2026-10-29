import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from "./constants";

export const IMAGE_DECODE_ERROR =
  "We couldn't display that image. It may be damaged or cut off. Try another photo.";

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

async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * True when the JPEG's own marker stream reaches EOI. Linear in file size and
 * never throws: any malformed length or premature end returns false.
 */
export function jpegHasPrimaryEoi(bytes: Uint8Array): boolean {
  const n = bytes.length;
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i < n) {
    if (bytes[i] !== 0xff) return false; // expected a marker
    while (i < n && bytes[i] === 0xff) i += 1; // fill bytes
    if (i >= n) return false;
    const marker = bytes[i];
    i += 1;
    if (marker === 0xd9) return true;
    if (marker === 0x00) return false;
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > n) return false;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > n) return false;
    i += length;
    if (marker === 0xda) {
      // Entropy-coded data: FF00 is a stuffed byte, FFD0-D7 are restarts, FFFF is fill.
      for (;;) {
        while (i < n && bytes[i] !== 0xff) i += 1;
        if (i + 1 >= n) return false;
        const next = bytes[i + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { i += 2; continue; }
        if (next === 0xff) { i += 1; continue; }
        break; // real marker; outer loop handles it
      }
    }
  }
  return false;
}

const PNG_IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

/**
 * Structural end-of-file check. Browsers happily paint a truncated PNG/JPEG/WEBP
 * as a partial picture (load events still fire), so decode success alone cannot
 * tell a cut-off upload from a good one. Run after validateImageContent.
 */
export async function validateImageCompleteness(file: File): Promise<ImageValidationResult> {
  const incomplete: ImageValidationResult = {
    ok: false,
    message: "This image looks cut off or damaged. Try exporting it again or pick another photo.",
  };
  try {
    if (file.type === "image/png") {
      const tail = await readBytes(file.slice(Math.max(0, file.size - PNG_IEND.length)));
      return tail.length === PNG_IEND.length && PNG_IEND.every((byte, i) => tail[i] === byte)
        ? { ok: true }
        : incomplete;
    }
    if (file.type === "image/jpeg") {
      // Walk the marker structure to the primary image's EOI; trailing data
      // (motion-photo video, vendor blobs) after it is ignored. Size is capped at 10 MB.
      return jpegHasPrimaryEoi(await readBytes(file)) ? { ok: true } : incomplete;
    }
    if (file.type === "image/webp") {
      const head = await readBytes(file.slice(0, 8));
      if (head.length < 8) return incomplete;
      const declared = (head[4] | (head[5] << 8) | (head[6] << 16) | (head[7] << 24)) >>> 0;
      return file.size >= declared + 8 ? { ok: true } : incomplete;
    }
  } catch {
    return { ok: false, message: "We couldn't read that file. Try another image." };
  }
  return incomplete;
}
