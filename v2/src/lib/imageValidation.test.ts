import { describe, expect, it } from "vitest";
import { validateImageFile, validateImageContent } from "./imageValidation";

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
