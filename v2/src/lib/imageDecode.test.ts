import { afterEach, describe, expect, it, vi } from "vitest";
import { canDecodeImage } from "./imageDecode";

type Handlers = { onload: null | (() => void); onerror: null | (() => void) };

function stubImage(behavior: "load" | "error" | "hang" | "empty", decodeRejects = false) {
  class FakeImage implements Handlers {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    naturalWidth = behavior === "empty" ? 0 : 10;
    naturalHeight = behavior === "empty" ? 0 : 10;
    decode = decodeRejects ? () => Promise.reject(new Error("decode")) : () => Promise.resolve();
    set src(_value: string) {
      if (behavior === "hang") return;
      queueMicrotask(() => (behavior === "error" ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

describe("canDecodeImage without createImageBitmap", () => {
  const revoke = vi.fn();
  const create = vi.fn(() => "blob:mock");

  function setup() {
    vi.stubGlobal("createImageBitmap", undefined);
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    revoke.mockClear();
    create.mockClear();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("accepts an image the element can load and decode", async () => {
    setup();
    stubImage("load");
    await expect(canDecodeImage(new Blob(["x"]))).resolves.toEqual({ ok: true });
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });

  it("rejects a load error (truncated file)", async () => {
    setup();
    stubImage("error");
    await expect(canDecodeImage(new Blob(["x"]))).resolves.toEqual({ ok: false });
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });

  it("rejects when decode() rejects even though load fired", async () => {
    setup();
    stubImage("load", true);
    await expect(canDecodeImage(new Blob(["x"]))).resolves.toEqual({ ok: false });
  });

  it("rejects zero-dimension images", async () => {
    setup();
    stubImage("empty");
    await expect(canDecodeImage(new Blob(["x"]))).resolves.toEqual({ ok: false });
  });

  it("times out a hung decode and still revokes the URL", async () => {
    setup();
    stubImage("hang");
    vi.useFakeTimers();
    const pending = canDecodeImage(new Blob(["x"]), 50);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toEqual({ ok: false });
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});

describe("canDecodeImage with createImageBitmap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("closes the bitmap on success and reports failure on rejection", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce({ close }));
    await expect(canDecodeImage(new Blob(["x"]))).resolves.toEqual({ ok: true });
    expect(close).toHaveBeenCalled();
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValueOnce(new Error("bad")));
    await expect(canDecodeImage(new Blob(["x"]))).resolves.toEqual({ ok: false });
  });
});
