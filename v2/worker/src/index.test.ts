import { coerceIdentifyFields } from "./index";
import { describe, expect, it, vi } from "vitest";
import {
  CONSENT_HEADER,
  CONSENT_VALUE,
  handleRequest,
  matchesMagicBytes,
  parseModelOutput,
  type WorkerEnv,
} from "./index";

const ORIGIN = "http://127.0.0.1:5173";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function goodIdentifyJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    category: "shoes",
    brand: "SampleBrand",
    model: "SampleModel",
    colorway: "Black",
    styleCode: null,
    visibleText: ["Sample"],
    uncertainties: [],
    containsPerson: false,
    ...overrides,
  });
}

function fakeDb(changes: number, shouldThrow = false) {
  return {
    prepare: () => ({
      bind: () => ({
        run: async () => {
          if (shouldThrow) throw new Error("db down");
          return { meta: { changes } };
        },
      }),
    }),
  };
}

function fakeAi(response: unknown, spy?: { calls: number }) {
  return {
    run: async () => {
      if (spy) spy.calls += 1;
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function env(overrides: Partial<WorkerEnv> & { aiSpy?: { calls: number } } = {}): WorkerEnv {
  const { aiSpy, ...rest } = overrides;
  return {
    AI: rest.AI ?? fakeAi({ response: goodIdentifyJson() }, aiSpy),
    DB: rest.DB ?? fakeDb(1),
    ALLOWED_ORIGINS: rest.ALLOWED_ORIGINS ?? ORIGIN,
    SEARCH_CAP: rest.SEARCH_CAP ?? "40",
  };
}

function identifyRequest(init: {
  origin?: string | null;
  method?: string;
  path?: string;
  consent?: string | null;
  contentType?: string | null;
  body?: ArrayBuffer | Uint8Array | null;
}) {
  const headers = new Headers();
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  if (init.consent !== null) headers.set(CONSENT_HEADER, init.consent ?? CONSENT_VALUE);
  if (init.contentType !== null) headers.set("Content-Type", init.contentType ?? "image/png");
  const body = init.body === null ? undefined : (init.body ?? PNG);
  return new Request(`https://example.test${init.path ?? "/api/identify"}`, {
    method: init.method ?? "POST",
    headers,
    body,
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("matchesMagicBytes", () => {
  it("accepts real headers and rejects spoofs", () => {
    expect(matchesMagicBytes(PNG, "image/png")).toBe(true);
    expect(matchesMagicBytes(JPEG, "image/jpeg")).toBe(true);
    expect(matchesMagicBytes(PNG, "image/jpeg")).toBe(false);
  });
});

describe("parseModelOutput", () => {
  it("pulls the first JSON object and coerces fields", () => {
    const parsed = parseModelOutput({
      response: `Sure.\n${goodIdentifyJson({ brand: "  Nike  " })}\nthanks`,
    });
    expect(parsed?.brand).toBe("Nike");
    expect(parsed?.category).toBe("shoes");
  });

  it("returns null for unparseable output", () => {
    expect(parseModelOutput({ response: "no json here" })).toBeNull();
  });
});

describe("handleRequest", () => {
  it("rejects a non-matching origin", async () => {
    const aiSpy = { calls: 0 };
    const response = await handleRequest(
      identifyRequest({ origin: "https://evil.example" }),
      env({ aiSpy }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(aiSpy.calls).toBe(0);
    const body = await readJson(response);
    expect(body).toEqual({ error: expect.any(String), code: "forbidden_origin" });
  });

  it("requires consent", async () => {
    const response = await handleRequest(identifyRequest({ consent: null }), env());
    expect(response.status).toBe(400);
    expect((await readJson(response)).code).toBe("consent_required");
  });

  it("rejects a bad content type", async () => {
    const response = await handleRequest(identifyRequest({ contentType: "text/plain" }), env());
    expect(response.status).toBe(400);
    expect((await readJson(response)).code).toBe("bad_type");
  });

  it("rejects a spoofed content type when magic bytes disagree", async () => {
    const response = await handleRequest(
      identifyRequest({ contentType: "image/jpeg", body: PNG }),
      env(),
    );
    expect(response.status).toBe(400);
    expect((await readJson(response)).code).toBe("bad_type");
  });

  it("rejects an oversize body", async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    big[4] = 0x0d;
    big[5] = 0x0a;
    big[6] = 0x1a;
    big[7] = 0x0a;
    const response = await handleRequest(identifyRequest({ body: big }), env());
    expect(response.status).toBe(413);
    expect((await readJson(response)).code).toBe("too_large");
  });

  it("returns quota_exhausted when no row changes", async () => {
    const aiSpy = { calls: 0 };
    const response = await handleRequest(identifyRequest({}), env({ DB: fakeDb(0), aiSpy }));
    expect(response.status).toBe(429);
    expect((await readJson(response)).code).toBe("quota_exhausted");
    expect(aiSpy.calls).toBe(0);
  });

  it("fails closed on DB error without calling the model", async () => {
    const aiSpy = { calls: 0 };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRequest(
      identifyRequest({}),
      env({ DB: fakeDb(0, true), aiSpy }),
    );
    expect(response.status).toBe(503);
    expect((await readJson(response)).code).toBe("db_unavailable");
    expect(aiSpy.calls).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith("db_error");
    errorSpy.mockRestore();
  });

  it("makes exactly one model call on success", async () => {
    const aiSpy = { calls: 0 };
    const response = await handleRequest(identifyRequest({}), env({ aiSpy }));
    expect(response.status).toBe(200);
    expect(aiSpy.calls).toBe(1);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await readJson(response);
    expect(body.identified).toMatchObject({
      category: "shoes",
      brand: "SampleBrand",
      model: "SampleModel",
    });
    expect(body).not.toHaveProperty("containsPerson");
  });

  it("returns identify_failed for malformed model output", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleRequest(
      identifyRequest({}),
      env({ AI: fakeAi({ response: "not json" }) }),
    );
    expect(response.status).toBe(502);
    expect((await readJson(response)).code).toBe("identify_failed");
    errorSpy.mockRestore();
  });

  it("returns unsupported_photo for other category or a person in frame", async () => {
    const other = await handleRequest(
      identifyRequest({}),
      env({ AI: fakeAi({ response: goodIdentifyJson({ category: "other" }) }) }),
    );
    expect(other.status).toBe(422);
    expect((await readJson(other)).code).toBe("unsupported_photo");

    const person = await handleRequest(
      identifyRequest({}),
      env({ AI: fakeAi({ response: goodIdentifyJson({ containsPerson: true }) }) }),
    );
    expect(person.status).toBe(422);
    expect((await readJson(person)).code).toBe("unsupported_photo");
  });

  it("sets no-store and never echoes image bytes or raw model text", async () => {
    const modelText = `PREFIX ${goodIdentifyJson()} SUFFIX secret-model-text`;
    const response = await handleRequest(
      identifyRequest({ body: PNG }),
      env({ AI: fakeAi({ response: modelText }) }),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const raw = await response.text();
    expect(raw).not.toContain("secret-model-text");
    expect(raw).not.toContain("PREFIX");
    expect(raw).not.toContain(String.fromCharCode(...PNG.slice(0, 4)));
    expect(raw).not.toMatch(/\u0089PNG/);
  });

  it("answers CORS preflight for an allowed origin only", async () => {
    const ok = await handleRequest(identifyRequest({ method: "OPTIONS", body: null }), env());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);

    const bad = await handleRequest(
      identifyRequest({ method: "OPTIONS", origin: "https://evil.example", body: null }),
      env(),
    );
    expect(bad.status).toBe(403);
  });

  it("404s unknown paths", async () => {
    const response = await handleRequest(identifyRequest({ path: "/api/other" }), env());
    expect(response.status).toBe(404);
  });
});

describe("person check", () => {
  it("rejects a missing or non-boolean containsPerson as malformed", () => {
    expect(coerceIdentifyFields({ category: "shoes" })).toBeNull();
    expect(coerceIdentifyFields({ category: "shoes", containsPerson: "true" })).toBeNull();
    expect(coerceIdentifyFields({ category: "shoes", containsPerson: false })?.containsPerson).toBe(false);
  });
});
