import http from "node:http";
import { CatalogError } from "../catalog/errors.mjs";
import { EbayBrowseAdapter } from "../ebay/browse.mjs";
import { resolveEbayConfig } from "../ebay/config.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3927;

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<Record<string, string>>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new CatalogError("payload_too_large", "Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new CatalogError("invalid_json", "Malformed JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });
  res.end(payload);
}

/**
 * @param {{ host?: string, port?: number, adapter?: EbayBrowseAdapter, env?: NodeJS.ProcessEnv }} [options]
 */
export function createCatalogHttpServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  if (host !== DEFAULT_HOST) {
    throw new CatalogError("invalid_host", "Catalog server must bind loopback only");
  }
  const port = options.port ?? DEFAULT_PORT;
  const adapter =
    options.adapter ??
    new EbayBrowseAdapter({ env: options.env, fetchImpl: globalThis.fetch });

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "bad_request" });
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${host}:${port}`);

    if (req.method === "GET" && url.pathname === "/api/catalog/status") {
      const config = resolveEbayConfig(options.env ?? process.env);
      sendJson(res, 200, {
        ebay: {
          provider: "ebay",
          status: config.status,
          liveRequestsAllowed: config.liveRequestsAllowed,
          supportedRegions: config.supportedRegions,
          keywordSearch: true,
          imageSearch: false,
          note:
            "Live eBay requires FITCHECK_ENABLE_LIVE_EBAY=true, credentials, and documented production approval.",
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/catalog/search") {
      const query = url.searchParams.get("q") ?? "";
      const regionParam = url.searchParams.get("region") ?? "US";
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Number(limitParam) : undefined;
      if (!["US", "MX"].includes(regionParam) ||
          (limitParam != null && (!Number.isInteger(limit) || limit < 1 || limit > 25))) {
        sendJson(res, 400, { error: "invalid_search_parameters" });
        return;
      }
      const region = regionParam;

      try {
        const result = await adapter.searchKeyword({
          query,
          region,
          limit,
        });
        sendJson(res, 200, result);
      } catch (error) {
        if (error instanceof CatalogError) {
          const statusCode =
            error.code === "invalid_query" || error.code === "unsupported_region"
              ? 400
              : error.providerStatus === "rate_limited" ? 429 : 503;
          sendJson(res, statusCode, {
            error: error.code,
            message: error.message,
            providerStatus: error.providerStatus,
          });
          return;
        }
        sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    if (req.method === "POST") {
      await readJsonBody(req).catch(() => ({}));
    }

    sendJson(res, 404, { error: "not_found" });
  });

  return {
    server,
    host,
    port,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve({ host, port }));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
