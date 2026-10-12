import { CatalogError, ProviderResponseError } from "../catalog/errors.mjs";
import { rankListings } from "../catalog/pricing.mjs";
import {
  DEFAULT_TIMEOUT_MS,
  marketplaceIdForRegion,
  MAX_QUERY_LENGTH,
  MAX_RESULT_LIMIT,
  resolveEbayConfig,
} from "./config.mjs";
import { fetchApplicationAccessToken } from "./oauth.mjs";
import { normalizeEbaySearchResponse } from "./normalize.mjs";

/**
 * @typedef {object} EbaySearchParams
 * @property {string} query
 * @property {'US' | 'MX'} region
 * @property {number} [limit]
 */

/**
 * @param {string} query
 * @returns {string}
 */
export function sanitizeSearchQuery(query) {
  return query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

/**
 * @param {EbaySearchParams} params
 * @param {string} apiOrigin
 * @returns {URL}
 */
export function buildBrowseSearchUrl(params, apiOrigin) {
  const q = sanitizeSearchQuery(params.query);
  const limit = Math.min(
    Math.max(1, params.limit ?? 10),
    MAX_RESULT_LIMIT,
  );
  const url = new URL(`${apiOrigin}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  return url;
}

/**
 * In-memory token cache for a single adapter instance (server process).
 */
export class EbayBrowseAdapter {
  /**
   * @param {{ fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv, config?: ReturnType<typeof resolveEbayConfig> }} [options]
   */
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.env = options.env ?? process.env;
    this.config = options.config ?? resolveEbayConfig(this.env);
    this.cachedToken = null;
  }

  getStatus() {
    return this.config.status;
  }

  /**
   * @returns {Promise<import('../catalog/status.mjs').ProviderStatus>}
   */
  async refreshStatusFromLastError() {
    return this.config.status;
  }

  /**
   * @param {EbaySearchParams} params
   * Requests may run only when all explicit server-side gates are satisfied.
   */
  async searchKeyword(params) {
    const marketplaceId = marketplaceIdForRegion(params.region);
    if (!marketplaceId) {
      throw new CatalogError("unsupported_region", "Region not supported", {
        status: "error",
      });
    }
    const query = sanitizeSearchQuery(params.query);
    if (!query) {
      throw new CatalogError("invalid_query", "Search query is required", {
        status: "error",
      });
    }

    const mayRequest = this.config.liveRequestsAllowed && this.config.status === "available";

    if (!mayRequest) {
      throw new CatalogError(
        "provider_unavailable",
        `eBay catalog search is ${this.config.status}`,
        { status: this.config.status },
      );
    }

    const { clientId, clientSecret, apiOrigin } = this.config;
    if (!clientId || !clientSecret) {
      throw new CatalogError("not_configured", "Missing eBay credentials", {
        status: "not_configured",
      });
    }

    const token = await this.getAccessToken(apiOrigin, clientId, clientSecret);
    const url = buildBrowseSearchUrl(
      { ...params, query },
      apiOrigin,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new CatalogError("browse_timeout", "Browse search timed out", {
          status: "error",
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ProviderResponseError("eBay Browse search failed", {
        httpStatus: response.status,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new CatalogError("browse_malformed", "Invalid JSON from eBay", {
        status: "error",
      });
    }

    const checkedAt = new Date().toISOString();
    const listings = normalizeEbaySearchResponse(payload, checkedAt);
    return {
      provider: "ebay",
      status: "available",
      query,
      region: params.region,
      marketplaceId,
      preserveProviderOrder: true,
      listings: rankListings(listings, { preserveProviderOrder: true }),
      checkedAt,
    };
  }

  async getAccessToken(apiOrigin, clientId, clientSecret) {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.accessToken;
    }
    const next = await fetchApplicationAccessToken(
      apiOrigin,
      clientId,
      clientSecret,
      this.fetchImpl,
    );
    this.cachedToken = next;
    return next.accessToken;
  }
}
