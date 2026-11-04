import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jpegHasExifMarker,
  preparePhoto,
  PREPARE_JPEG_QUALITY,
  PREPARE_TOO_LARGE_MESSAGE,
} from "./preparePhoto";

/** Minimal JPEG with an APP1 Exif segment (not a real photo — marker structure only). */
function jpegWithExif(): Uint8Array {
  const exifBody = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  ];
  const app1Len = exifBody.length + 2;
  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...exifBody,
    0xff, 0xd9, // EOI
  ]);
}

function cleanJpeg(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
}

describe("jpegHasExifMarker", () => {
  it("detects an APP1 Exif segment and ignores a clean JPEG", () => {
    expect(jpegHasExifMarker(jpegWithExif())).toBe(true);
    expect(jpegHasExifMarker(cleanJpeg())).toBe(false);
  });
});

describe("preparePhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-encodes through canvas as JPEG and drops EXIF from the fixture", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2000, height: 1000, close }),
    );

    class FakeCanvas {
      width = 0;
      height = 0;
      getContext() {
        return { drawImage: vi.fn() };
      }
      toBlob(cb: (blob: Blob | null) => void, type?: string, quality?: number) {
        expect(type).toBe("image/jpeg");
        expect(quality).toBe(PREPARE_JPEG_QUALITY);
        expect(this.width).toBe(1024);
        expect(this.height).toBe(512);
        cb(new Blob([cleanJpeg()], { type: "image/jpeg" }));
      }
    }
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return new FakeCanvas() as unknown as HTMLCanvasElement;
      return createElement(tag);
    });

    const input = new File([jpegWithExif()], "with-exif.jpg", { type: "image/jpeg" });
    expect(jpegHasExifMarker(new Uint8Array(await input.arrayBuffer()))).toBe(true);

    const out = await preparePhoto(input);
    expect(out.type).toBe("image/jpeg");
    const bytes = new Uint8Array(await out.arrayBuffer());
    expect(jpegHasExifMarker(bytes)).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it("rejects when the re-encoded blob exceeds 4 MB", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }),
    );
    class FakeCanvas {
      width = 0;
      height = 0;
      getContext() {
        return { drawImage: vi.fn() };
      }
      toBlob(cb: (blob: Blob | null) => void) {
        cb(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/jpeg" }));
      }
    }
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return new FakeCanvas() as unknown as HTMLCanvasElement;
      return createElement(tag);
    });

    await expect(preparePhoto(new Blob(["x"]))).rejects.toThrow(PREPARE_TOO_LARGE_MESSAGE);
  });
});
