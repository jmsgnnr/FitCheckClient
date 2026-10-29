import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { EbayBrowseAdapter } from "../ebay/browse.mjs";
import { resolveEbayConfig } from "../ebay/config.mjs";
import { createCatalogHttpServer } from "../http/server.mjs";

describe("catalog HTTP boundary", () => {
  it("status endpoint makes no outbound fetch by default", async () => {
    let fetchCount = 0;
    const api = createCatalogHttpServer({
      port: 0,
      env: {},
      adapter: new EbayBrowseAdapter({
        env: {},
        fetchImpl: async () => {
          fetchCount += 1;
          return new Response("{}");
        },
      }),
    });

    await new Promise((resolve, reject) => {
      api.server.listen(0, "127.0.0.1", resolve);
      api.server.once("error", reject);
    });
    const address = api.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const body = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/catalog/status`, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(JSON.parse(data)));
      }).on("error", reject);
    });

    assert.equal(body.ebay.status, "disabled");
    assert.equal(body.ebay.liveRequestsAllowed, false);
    assert.equal(fetchCount, 0);
    await api.close();
  });

  it("search returns 503 when live eBay is disabled", async () => {
    const api = createCatalogHttpServer({
      env: {},
      adapter: new EbayBrowseAdapter({ env: {} }),
    });
    await new Promise((resolve) => api.server.listen(0, "127.0.0.1", resolve));
    const address = api.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const status = await new Promise((resolve, reject) => {
      http.get(
        `http://127.0.0.1:${port}/api/catalog/search?q=coat&region=US`,
        (res) => {
          let data = "";
          res.on("data", (c) => {
            data += c;
          });
          res.on("end", () =>
            resolve({ code: res.statusCode, body: JSON.parse(data) }),
          );
        },
      ).on("error", reject);
    });

    assert.equal(status.code, 503);
    assert.equal(status.body.providerStatus, "disabled");
    await api.close();
  });
});


describe("HTTP input and bind restrictions", () => {
  it("rejects public network binding", () => {
    assert.throws(
      () => createCatalogHttpServer({ host: "0.0.0.0", env: {} }),
      (err) => err.code === "invalid_host",
    );
  });

  it("rejects unknown regions and invalid limits without a provider call", async () => {
    let calls = 0;
    const fakeAdapter = {
      searchKeyword: async () => {
        calls += 1;
        throw new Error("Should not call provider");
      },
    };
    const api = createCatalogHttpServer({ port: 0, env: {}, adapter: fakeAdapter });
    await api.listen();
    try {
      const address = api.server.address();
      const port = address.port;
      for (const query of ["q=coat&region=XYZ", "q=coat&region=US&limit=999",
        "q=coat&region=US&limit=wat"]) {
        const response = await fetch("http://127.0.0.1:" + port + "/api/catalog/search?" + query);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, "invalid_search_parameters");
      }
      assert.equal(calls, 0);
    } finally {
      await api.close();
    }
  });
});

describe("Origin/Host boundary and request budget", () => {
  const SEARCH = "/api/catalog/search?q=coat&region=US";

  async function start(extra = {}) {
    const calls = { search: 0, credential: 0 };
    const adapter = {
      searchKeyword: async () => {
        calls.search += 1;
        return { listings: [] };
      },
      ...(extra.adapter ?? {}),
    };
    const api = createCatalogHttpServer({
      port: 0,
      env: {},
      adapter,
      ...(extra.options ?? {}),
    });
    await api.listen();
    return { api, calls, port: api.server.address().port };
  }

  // fetch() forbids overriding Host, so use raw http.request.
  function raw(port, path, headers) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path, method: "GET", headers, setHost: false },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ code: res.statusCode, body: data }));
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("rejects untrusted Origin, null Origin and cross-site fetch metadata with 403", async () => {
    const { api, calls, port } = await start();
    try {
      const host = `127.0.0.1:${port}`;
      for (const headers of [
        { Host: host, Origin: "https://evil.example" },
        { Host: host, Origin: "null" },
        { Host: host, Origin: "http://127.0.0.1:5173.evil.example" },
        { Host: host, Origin: "http://127.0.0.1:9999" },
        { Host: host, Origin: "" },
        { Host: host, "Sec-Fetch-Site": "cross-site" },
        { Host: host, "Sec-Fetch-Site": "same-site" },
      ]) {
        const r = await raw(port, SEARCH, headers);
        assert.equal(r.code, 403, JSON.stringify(headers));
      }
      assert.equal(calls.search, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects untrusted, rebinding-style and malformed Host with 403", async () => {
    const { api, calls, port } = await start();
    try {
      for (const host of [
        "evil.example",
        `evil.example:${port}`,
        `127.0.0.1.evil.com:${port}`,
        `localhost.evil.com:${port}`,
        `127.0.0.1:${port}.evil.com`,
        `user@127.0.0.1:${port}`,
        `127.0.0.1:${port + 1}`,
        "127.0.0.1",
        `0.0.0.0:${port}`,
        `127.0.0.2:${port}`,
        `127.0.0.1:${port} `.repeat(1) + "x",
        "a".repeat(200),
        "",
      ]) {
        const r = await raw(port, SEARCH, { Host: host });
        // Node itself may answer 400 for an unparsable Host; either way no adapter call.
        assert.ok([400, 403].includes(r.code), JSON.stringify(host) + " got " + r.code);
      }
      const noHost = await raw(port, SEARCH, {});
      assert.ok([400, 403].includes(noHost.code));
      for (const path of ["/api/catalog/status", "/nope"]) {
        assert.equal((await raw(port, path, { Host: "evil.example" })).code, 403);
      }
      assert.equal(calls.search, 0);
    } finally {
      await api.close();
    }
  });

  it("allows configured local client origins and loopback hosts", async () => {
    const { api, calls, port } = await start();
    try {
      for (const headers of [
        { Host: `127.0.0.1:${port}`, Origin: "http://127.0.0.1:5173" },
        { Host: `localhost:${port}`, Origin: "http://localhost:5173" },
        { Host: `[::1]:${port}` }, // missing Origin: non-browser local tooling
        { Host: `127.0.0.1:${port}`, "Sec-Fetch-Site": "same-origin" },
      ]) {
        const r = await raw(port, SEARCH, headers);
        assert.equal(r.code, 200, JSON.stringify(headers));
      }
      assert.equal(calls.search, 4);
      const withOrigin = await new Promise((resolve) =>
        http.get(`http://127.0.0.1:${port}/api/catalog/status`,
          { headers: { Origin: "http://localhost:5173" } }, resolve));
      assert.equal(withOrigin.headers["access-control-allow-origin"], "http://localhost:5173");
      withOrigin.resume();
    } finally {
      await api.close();
    }
  });

  it("allowedOrigins is explicit and configurable", async () => {
    const { api, calls, port } = await start({ options: { allowedOrigins: ["http://127.0.0.1:4000"] } });
    try {
      const host = `127.0.0.1:${port}`;
      assert.equal((await raw(port, SEARCH, { Host: host, Origin: "http://127.0.0.1:5173" })).code, 403);
      assert.equal((await raw(port, SEARCH, { Host: host, Origin: "http://127.0.0.1:4000" })).code, 200);
      assert.equal(calls.search, 1);
    } finally {
      await api.close();
    }
  });

  it("returns 429 when the request budget is exhausted; rejected traffic does not consume it", async () => {
    const { api, calls, port } = await start({ options: { budget: { maxRequests: 2, windowMs: 60_000 } } });
    try {
      const ok = { Host: `127.0.0.1:${port}` };
      for (let i = 0; i < 5; i += 1) {
        assert.equal((await raw(port, SEARCH, { Host: "evil.example" })).code, 403);
      }
      assert.equal((await raw(port, SEARCH, ok)).code, 200);
      assert.equal((await raw(port, SEARCH, ok)).code, 200);
      assert.equal((await raw(port, SEARCH, ok)).code, 429);
      assert.equal((await raw(port, SEARCH, ok)).code, 429);
      assert.equal(calls.search, 2);
      // status endpoint is not budgeted and never reaches the adapter
      assert.equal((await raw(port, "/api/catalog/status", ok)).code, 200);
    } finally {
      await api.close();
    }
  });

  it("returns 429 above the concurrency cap and releases slots afterwards", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    let started = 0;
    const { api, port } = await start({
      adapter: { searchKeyword: async () => { started += 1; await gate; return { listings: [] }; } },
      options: { budget: { maxConcurrent: 2, maxRequests: 100 } },
    });
    try {
      const ok = { Host: `127.0.0.1:${port}` };
      const inFlight = [raw(port, SEARCH, ok), raw(port, SEARCH, ok)];
      while (started < 2) await new Promise((r) => setTimeout(r, 5));
      assert.equal((await raw(port, SEARCH, ok)).code, 429);
      assert.equal(started, 2);
      release();
      assert.deepEqual((await Promise.all(inFlight)).map((r) => r.code), [200, 200]);
      assert.equal((await raw(port, SEARCH, ok)).code, 200);
    } finally {
      release();
      await api.close();
    }
  });

  it("never invokes the live fetch or credential path for rejected traffic", async () => {
    let fetchCalls = 0;
    const adapter = new EbayBrowseAdapter({
      env: {
        FITCHECK_ENABLE_LIVE_EBAY: "true",
        FITCHECK_EBAY_PRODUCTION_APPROVED: "true",
        EBAY_CLIENT_ID: "id",
        EBAY_CLIENT_SECRET: "secret",
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("{}");
      },
    });
    const api = createCatalogHttpServer({ port: 0, env: {}, adapter });
    await api.listen();
    try {
      const port = api.server.address().port;
      await raw(port, SEARCH, { Host: "evil.example" });
      await raw(port, SEARCH, { Host: `127.0.0.1:${port}`, Origin: "https://evil.example" });
      assert.equal(fetchCalls, 0);
    } finally {
      await api.close();
    }
  });
});
