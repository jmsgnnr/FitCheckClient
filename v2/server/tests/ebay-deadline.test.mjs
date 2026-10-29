import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EbayBrowseAdapter } from "../ebay/browse.mjs";
import { MAX_PROVIDER_BODY_BYTES, OVERALL_DEADLINE_MS } from "../ebay/config.mjs";
import { FIXTURE_SEARCH_RESPONSE } from "./fixtures/ebay-search-sample.mjs";

const approvedEnv = {
  FITCHECK_ENABLE_LIVE_EBAY: "true",
  EBAY_CLIENT_ID: "fixture-client-id",
  EBAY_CLIENT_SECRET: "fixture-client-secret",
  FITCHECK_EBAY_PRODUCTION_APPROVED: "true",
};

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });

/** Headers sent, then the body never produces another byte and ignores abort. */
function stalledBody(firstChunk = '{"itemSumm') {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(firstChunk));
    },
    pull() {
      return new Promise(() => {}); // never resolves
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(stream, { status: 200 }), wasCancelled: () => cancelled };
}

function adapterWith(fetchImpl, deadlineMs = 150) {
  return new EbayBrowseAdapter({ env: approvedEnv, fetchImpl, deadlineMs });
}

const isTokenUrl = (url) => String(url).includes("oauth2/token");
const search = (adapter) => adapter.searchKeyword({ query: "chore coat", region: "US" });

async function timed(promise) {
  const started = performance.now();
  try {
    await promise;
    return { ok: true, elapsed: performance.now() - started };
  } catch (error) {
    return { ok: false, error, elapsed: performance.now() - started };
  }
}

describe("eBay adapter deadlines and body bounds (mocked HTTP, no network)", () => {
  it("documents a 12s overall deadline and a bounded body size", () => {
    assert.equal(OVERALL_DEADLINE_MS, 12_000);
    assert.equal(MAX_PROVIDER_BODY_BYTES, 1_000_000);
  });

  it("terminates a stalled Browse response body at the deadline and cancels it", async () => {
    const body = stalledBody();
    const adapter = adapterWith(async (url) => (isTokenUrl(url) ? tokenResponse() : body.response));
    const result = await timed(search(adapter));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "browse_timeout");
    assert.ok(result.elapsed < 1000, `took ${result.elapsed}ms`);
    assert.equal(body.wasCancelled(), true);
  });

  it("terminates a stalled OAuth response body at the deadline", async () => {
    const body = stalledBody('{"access_');
    const adapter = adapterWith(async (url) => {
      if (isTokenUrl(url)) return body.response;
      throw new Error("Browse must not be called");
    });
    const result = await timed(search(adapter));
    assert.equal(result.error.code, "oauth_timeout");
    assert.ok(result.elapsed < 1000);
  });

  it("terminates a fetch that never resolves and ignores its AbortSignal", async () => {
    let browseCalls = 0;
    const adapter = adapterWith((url) => {
      if (!isTokenUrl(url)) browseCalls += 1;
      return new Promise(() => {});
    });
    const result = await timed(search(adapter));
    assert.equal(result.error.code, "oauth_timeout");
    assert.ok(result.elapsed < 1000);
    assert.equal(browseCalls, 0);
  });

  it("uses ONE deadline for token plus search, not one per step", async () => {
    const adapter = adapterWith(async (url) => {
      if (isTokenUrl(url)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return tokenResponse();
      }
      return stalledBody().response;
    }, 200);
    const result = await timed(search(adapter));
    assert.equal(result.error.code, "browse_timeout");
    // A per-step timer would take about 100 + 200 = 300ms.
    assert.ok(result.elapsed < 280, `took ${result.elapsed}ms`);
  });

  it("passes an abortable signal to both provider requests", async () => {
    const signals = [];
    const adapter = adapterWith(async (url, init) => {
      signals.push(init.signal);
      return isTokenUrl(url)
        ? tokenResponse()
        : new Response(JSON.stringify(FIXTURE_SEARCH_RESPONSE), { status: 200 });
    }, 5_000);
    await search(adapter);
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal instanceof AbortSignal));
    assert.equal(signals[0], signals[1], "token and search share the overall-deadline signal");
  });

  it("rejects an oversize streamed body with no content-length", async () => {
    const chunk = new Uint8Array(100_000).fill(0x61);
    let sent = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent > 3 * MAX_PROVIDER_BODY_BYTES) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const adapter = adapterWith(async (url) =>
      isTokenUrl(url) ? tokenResponse() : new Response(stream, { status: 200 }), 5_000);
    const result = await timed(search(adapter));
    assert.equal(result.error.code, "body_too_large");
    assert.equal(cancelled, true);
    assert.ok(sent <= MAX_PROVIDER_BODY_BYTES + 2 * chunk.byteLength, `read ${sent} bytes`);
  });

  it("rejects an oversize declared content-length without reading the body", async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull() {}, cancel() { cancelled = true; } });
    const adapter = adapterWith(async (url) =>
      isTokenUrl(url)
        ? tokenResponse()
        : new Response(stream, { status: 200, headers: { "content-length": String(MAX_PROVIDER_BODY_BYTES + 1) } }),
    5_000);
    const result = await timed(search(adapter));
    assert.equal(result.error.code, "body_too_large");
    assert.equal(cancelled, true, "stream cancelled instead of buffered");
  });

  it("rejects an oversize OAuth body", async () => {
    const adapter = adapterWith(async () => new Response("x".repeat(70_000), { status: 200 }), 5_000);
    const result = await timed(search(adapter));
    assert.equal(result.error.code, "body_too_large");
  });

  it("does not retry automatically; a later click makes exactly one new provider call", async () => {
    const calls = [];
    let failFirst = true;
    const adapter = adapterWith(async (url) => {
      calls.push(isTokenUrl(url) ? "token" : "search");
      if (isTokenUrl(url)) return tokenResponse();
      if (failFirst) {
        failFirst = false;
        return new Response("boom", { status: 503 });
      }
      return new Response(JSON.stringify(FIXTURE_SEARCH_RESPONSE), { status: 200 });
    }, 5_000);
    await assert.rejects(() => search(adapter), (error) => error.code === "provider_response");
    assert.deepEqual(calls, ["token", "search"]);
    const result = await search(adapter);
    assert.equal(result.provider, "ebay");
    assert.deepEqual(calls, ["token", "search", "search"], "cached token reused; no hidden retry");
  });

  it("still succeeds normally inside the deadline", async () => {
    const adapter = adapterWith(async (url) =>
      isTokenUrl(url)
        ? tokenResponse()
        : new Response(JSON.stringify(FIXTURE_SEARCH_RESPONSE), { status: 200 }), 5_000);
    const result = await search(adapter);
    assert.ok(result.listings.length > 0);
  });
});

describe("review fixes: non-settling cancel and abort preservation", () => {
  it("a stream whose cancel() never settles cannot defeat the deadline (Browse body)", async () => {
    const stream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode("{")); },
      pull() { return new Promise(() => {}); },
      cancel() { return new Promise(() => {}); },
    });
    const adapter = adapterWith(async (url) => (isTokenUrl(url) ? tokenResponse() : new Response(stream, { status: 200 })));
    const result = await timed(search(adapter));
    assert.equal(result.error?.code, "browse_timeout");
    assert.ok(result.elapsed < 1000, `took ${result.elapsed}ms`);
  });

  it("non-settling cancel does not delay declared-size rejection or non-ok cleanup", async () => {
    const hang = () => new ReadableStream({ pull() {}, cancel() { return new Promise(() => {}); } });
    const big = adapterWith(async (url) => isTokenUrl(url)
      ? tokenResponse()
      : new Response(hang(), { status: 200, headers: { "content-length": String(MAX_PROVIDER_BODY_BYTES + 1) } }), 5_000);
    const r1 = await timed(search(big));
    assert.equal(r1.error?.code, "body_too_large");
    assert.ok(r1.elapsed < 500);
    const bad = adapterWith(async (url) => isTokenUrl(url) ? tokenResponse() : new Response(hang(), { status: 503 }), 5_000);
    const r2 = await timed(search(bad));
    assert.equal(r2.error?.code, "provider_response");
    assert.ok(r2.elapsed < 500);
  });

  it("OAuth: real HTTP server sends headers and partial JSON then stalls -> oauth_timeout, not oauth_malformed", async () => {
    const http = await import("node:http");
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"access_token":"abc","expires');
      // never ends
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      const adapter = new EbayBrowseAdapter({
        env: approvedEnv,
        deadlineMs: 300,
        fetchImpl: (url, init) =>
          globalThis.fetch(String(url).replace("https://api.ebay.com", `http://127.0.0.1:${port}`), init),
      });
      const result = await timed(search(adapter));
      assert.equal(result.error?.code, "oauth_timeout");
      assert.ok(result.elapsed < 1500, `took ${result.elapsed}ms`);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("OAuth: genuinely invalid JSON is still oauth_malformed", async () => {
    const adapter = adapterWith(async () => new Response("not json", { status: 200 }), 5_000);
    const result = await timed(search(adapter));
    assert.equal(result.error?.code, "oauth_malformed");
  });
});
