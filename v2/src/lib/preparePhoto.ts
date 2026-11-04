/** Downscale and re-encode a shopper photo so EXIF is dropped before upload. */

export const PREPARE_MAX_SIDE = 1024;
export const PREPARE_JPEG_QUALITY = 0.85;
export const PREPARE_MAX_BYTES = 4 * 1024 * 1024;

export const PREPARE_FAILED_MESSAGE = "We couldn't prepare that photo. Try another image.";
export const PREPARE_TOO_LARGE_MESSAGE = "That photo is still too large after resizing. Try a tighter crop.";

/** True when a JPEG buffer still carries an APP1/Exif segment. */
export function jpegHasExifMarker(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return false;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return false;
    const marker = bytes[i];
    i += 1;
    if (marker === 0xd9 || marker === 0xda) return false;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= bytes.length) return false;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return false;
    if (marker === 0xe1) {
      const payloadStart = i + 2;
      if (
        payloadStart + 4 <= bytes.length &&
        bytes[payloadStart] === 0x45 &&
        bytes[payloadStart + 1] === 0x78 &&
        bytes[payloadStart + 2] === 0x69 &&
        bytes[payloadStart + 3] === 0x66
      ) {
        return true;
      }
    }
    i += length;
  }
  return false;
}

function loadImage(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => bitmap);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(PREPARE_FAILED_MESSAGE));
    };
    image.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error(PREPARE_FAILED_MESSAGE));
        else resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Decode, fit longest side to PREPARE_MAX_SIDE, re-encode as JPEG.
 * Canvas re-encode drops EXIF. The blob is returned only to the caller — never stored.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number; close?: () => void };
  try {
    source = await loadImage(file);
  } catch {
    throw new Error(PREPARE_FAILED_MESSAGE);
  }

  try {
    const longest = Math.max(source.width, source.height);
    if (!longest) throw new Error(PREPARE_FAILED_MESSAGE);
    const scale = longest > PREPARE_MAX_SIDE ? PREPARE_MAX_SIDE / longest : 1;
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(PREPARE_FAILED_MESSAGE);
    ctx.drawImage(source, 0, 0, width, height);

    const blob = await canvasToJpegBlob(canvas, PREPARE_JPEG_QUALITY);
    if (blob.size > PREPARE_MAX_BYTES) throw new Error(PREPARE_TOO_LARGE_MESSAGE);
    return blob;
  } finally {
    if (typeof source.close === "function") source.close();
  }
}
