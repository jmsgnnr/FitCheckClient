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
