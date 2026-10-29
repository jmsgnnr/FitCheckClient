import { describe, expect, it } from "vitest";
import { validateImageFile, validateImageContent, validateImageCompleteness } from "./imageValidation";

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

  it("accepts JPEG ending in EOI (with padding) and rejects a truncated JPEG", async () => {
    const jpeg = (bytes: number[]) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...bytes])], "a.jpg", { type: "image/jpeg" });
    expect((await validateImageCompleteness(jpeg([1, 2, 3, 0xff, 0xd9]))).ok).toBe(true);
    expect((await validateImageCompleteness(jpeg([1, 2, 3, 0xff, 0xd9, 0, 0]))).ok).toBe(true);
    expect((await validateImageCompleteness(jpeg([1, 2, 3, 4, 5]))).ok).toBe(false);
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
