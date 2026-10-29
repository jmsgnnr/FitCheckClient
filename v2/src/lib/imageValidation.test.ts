import { describe, expect, it } from "vitest";
import { validateImageFile, validateImageContent, validateImageCompleteness, jpegHasPrimaryEoi } from "./imageValidation";

function mockFile(type: string, size: number): File {
  const blob = new Blob([new Uint8Array(8)], { type });
  const file = new File([blob], "test.bin", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateImageFile", () => {
  it("accepts allowed MIME types", () => {
    expect(validateImageFile(mockFile("image/jpeg", 1000)).ok).toBe(true);
    expect(validateImageFile(mockFile("image/png", 1000)).ok).toBe(true);
    expect(validateImageFile(mockFile("image/webp", 1000)).ok).toBe(true);
  });

  it("rejects disallowed MIME", () => {
    const result = validateImageFile(mockFile("image/gif", 1000));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/JPG/i);
    }
  });

  it("rejects oversize files", () => {
    const result = validateImageFile(
      mockFile("image/png", 10 * 1024 * 1024 + 1),
    );
    expect(result.ok).toBe(false);
  });
});


describe("validateImageContent", () => {
  it("checks actual signatures, not only a claimed MIME type", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "fixture.png", { type: "image/png" });
    expect((await validateImageContent(png)).ok).toBe(true);
    const forged = new File(["this is not a PNG"], "fake.png", { type: "image/png" });
    const result = await validateImageContent(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/doesn't contain a valid/i);
  });

  it("recognizes JPEG and WEBP signatures", async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "a.jpg", { type: "image/jpeg" });
    const webp = new File([new Uint8Array([82,73,70,70, 0,0,0,0, 87,69,66,80])], "b.webp", { type: "image/webp" });
    expect((await validateImageContent(jpeg)).ok).toBe(true);
    expect((await validateImageContent(webp)).ok).toBe(true);
  });
});

describe("validateImageCompleteness", () => {
  const png = (tail: number[]) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, ...tail])], "a.png", { type: "image/png" });
  const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

  it("accepts PNG ending in IEND and rejects a truncated PNG", async () => {
    expect((await validateImageCompleteness(png(IEND))).ok).toBe(true);
    const cut = await validateImageCompleteness(png([9, 9, 9, 9, 9]));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.message).toMatch(/cut off/i);
  });

  it("walks JPEG markers via validateImageCompleteness", async () => {
    const file = (b: number[]) => new File([new Uint8Array(b)], "a.jpg", { type: "image/jpeg" });
    expect((await validateImageCompleteness(file(jpegBytes()))).ok).toBe(true);
    expect((await validateImageCompleteness(file(jpegBytes().slice(0, 20)))).ok).toBe(false);
  });

  it("accepts WEBP whose RIFF length fits the file and rejects a short one", async () => {
    const webp = (declared: number, total: number) => {
      const bytes = new Uint8Array(total);
      bytes.set([82, 73, 70, 70, declared & 255, (declared >> 8) & 255, 0, 0, 87, 69, 66, 80]);
      return new File([bytes], "a.webp", { type: "image/webp" });
    };
    expect((await validateImageCompleteness(webp(32, 40))).ok).toBe(true);
    expect((await validateImageCompleteness(webp(200, 40))).ok).toBe(false);
  });
});


const APP0 = [0xff, 0xe0, 0x00, 0x04, 0x41, 0x42];
const SOS = [0xff, 0xda, 0x00, 0x04, 0x01, 0x02];
function jpegBytes(scans = 1, trailer = 0, scanData = [0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]): number[] {
  const out = [0xff, 0xd8, ...APP0];
  for (let i = 0; i < scans; i += 1) out.push(...SOS, ...scanData);
  out.push(0xff, 0xd9);
  for (let i = 0; i < trailer; i += 1) out.push(i % 251);
  return out;
}

describe("jpegHasPrimaryEoi", () => {
  it("accepts a complete JPEG, stuffed bytes and restart markers included", () => {
    expect(jpegHasPrimaryEoi(new Uint8Array(jpegBytes()))).toBe(true);
  });

  it("accepts a complete JPEG followed by a 200 KB trailer, even one containing FFD9 and FFD8", () => {
    const bytes = jpegBytes(1, 200_000);
    bytes.push(0xff, 0xd8, 0xff, 0xd9, 0xff, 0xd9);
    expect(jpegHasPrimaryEoi(new Uint8Array(bytes))).toBe(true);
  });

  it("accepts a progressive JPEG with multiple SOS scans and fill bytes", () => {
    const bytes = jpegBytes(4);
    bytes.splice(2, 0, 0xff, 0xff); // fill bytes before first marker
    expect(jpegHasPrimaryEoi(new Uint8Array(bytes))).toBe(true);
  });

  it("rejects a truncated JPEG at every cut point", () => {
    const bytes = jpegBytes(3);
    for (let cut = 0; cut < bytes.length - 1; cut += 1) {
      expect(jpegHasPrimaryEoi(new Uint8Array(bytes.slice(0, cut)))).toBe(false);
    }
  });

  it("rejects tiny and empty inputs", () => {
    expect(jpegHasPrimaryEoi(new Uint8Array([]))).toBe(false);
    expect(jpegHasPrimaryEoi(new Uint8Array([0xff, 0xd8]))).toBe(false);
    expect(jpegHasPrimaryEoi(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(false);
  });

  it("rejects malformed segment lengths without throwing", () => {
    expect(jpegHasPrimaryEoi(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xd9]))).toBe(false);
    expect(jpegHasPrimaryEoi(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x41, 0xff, 0xd9]))).toBe(false);
    expect(jpegHasPrimaryEoi(new Uint8Array([0xff, 0xd8, 0x12, 0x34, 0xff, 0xd9]))).toBe(false);
  });

  it("does not take an EOI hidden inside a skipped segment as the end", () => {
    const bytes = [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0xff, 0xd9, 0x00, 0x00, ...SOS, 0x11];
    expect(jpegHasPrimaryEoi(new Uint8Array(bytes))).toBe(false);
  });
});
