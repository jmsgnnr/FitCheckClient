import http from "node:http";
import { CatalogError } from "../catalog/errors.mjs";
import { EbayBrowseAdapter } from "../ebay/browse.mjs";
import { resolveEbayConfig } from "../ebay/config.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3927;
const DEFAULT_ALLOWED_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const DEFAULT_BUDGET = { maxRequests: 30, windowMs: 60_000, maxConcurrent: 2 };

/**
 * Strict Host check: loopback hostname plus the port this socket is serving.
 * Anything else (DNS-rebinding names, userinfo, lookalikes, junk) is untrusted.
 * @param {unknown} hostHeader
 * @param {number | undefined} localPort
 */
export function isTrustedHost(hostHeader, localPort) {
  if (typeof hostHeader !== "string" || hostHeader.length > 64) return false;
  const match = /^(127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/i.exec(hostHeader);
  if (!match || !LOOPBACK_HOSTNAMES.has(match[1].toLowerCase())) return false;
  return localPort != null && Number(match[2]) === localPort;
}

/**
 * Origin policy: when present it must exactly match an allowed local client
 * origin. When missing, allow only non-browser tooling: a browser-originated
 * cross-site request (Sec-Fetch-Site other than same-origin/none) is refused.
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {Set<string>} allowedOrigins
 */
export function isTrustedOrigin(headers, allowedOrigins) {
  const origin = headers.origin;
  if (origin !== undefined) {
    return typeof origin === "string" && allowedOrigins.has(origin);
  }
  const fetchSite = headers["sec-fetch-site"];
  if (fetchSite === undefined) return true;
  return fetchSite === "same-origin" || fetchSite === "none";
}

/** In-memory sliding-window request budget plus concurrency cap. */
function createBudget(options) {
  const { maxRequests, windowMs, maxConcurrent } = { ...DEFAULT_BUDGET, ...options };
  /** @type {number[]} */
  let stamps = [];
  let inFlight = 0;
  return {
    /** @returns {(() => void) | null} release function, or null if over budget */
    acquire() {
      const now = Date.now();
      stamps = stamps.filter((t) => now - t < windowMs);
      if (stamps.length >= maxRequests || inFlight >= maxConcurrent) return null;
      stamps.push(now);
      inFlight += 1;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          inFlight -= 1;
        }
      };
    },
  };
}

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
function sendJson(res, status, body, allowOrigin = DEFAULT_ALLOWED_ORIGINS[0]) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  });
  res.end(payload);
}

/**
 * @param {{ host?: string, port?: number, adapter?: EbayBrowseAdapter, env?: NodeJS.ProcessEnv,
 *   allowedOrigins?: string[], budget?: { maxRequests?: number, windowMs?: number, maxConcurrent?: number } }} [options]
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

  const allowedOrigins = new Set(options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS);
  const budget = createBudget(options.budget);

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "bad_request" });
      return;
    }

    // Origin/Host boundary: runs before routing, body reads, and any adapter call.
    if (
      !isTrustedHost(req.headers.host, req.socket.localPort) ||
      !isTrustedOrigin(req.headers, allowedOrigins)
    ) {
      res.writeHead(403, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "forbidden_origin_or_host" }));
      return;
    }
    const allowOrigin = allowedOrigins.has(req.headers.origin ?? "")
      ? req.headers.origin
      : DEFAULT_ALLOWED_ORIGINS[0];

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": allowOrigin,
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
      }, allowOrigin);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/catalog/search") {
      const query = url.searchParams.get("q") ?? "";
      const regionParam = url.searchParams.get("region") ?? "US";
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Number(limitParam) : undefined;
      if (!["US", "MX"].includes(regionParam) ||
          (limitParam != null && (!Number.isInteger(limit) || limit < 1 || limit > 25))) {
        sendJson(res, 400, { error: "invalid_search_parameters" }, allowOrigin);
        return;
      }
      const region = regionParam;

      const release = budget.acquire();
      if (!release) {
        sendJson(res, 429, { error: "request_budget_exceeded" }, allowOrigin);
        return;
      }
      try {
        const result = await adapter.searchKeyword({
          query,
          region,
          limit,
        });
        sendJson(res, 200, result, allowOrigin);
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
          }, allowOrigin);
          return;
        }
        sendJson(res, 500, { error: "internal_error" }, allowOrigin);
      } finally {
        release();
      }
      return;
    }

    if (req.method === "POST") {
      await readJsonBody(req).catch(() => ({}));
    }

    sendJson(res, 404, { error: "not_found" }, allowOrigin);
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
