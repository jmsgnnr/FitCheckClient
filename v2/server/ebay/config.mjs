const PRODUCTION_API = "https://api.ebay.com";
const SANDBOX_API = "https://api.sandbox.ebay.com";

const MARKETPLACE_BY_REGION = {
  US: "EBAY_US",
  // EBAY_MX is NOT a supported eBay Buy marketplace. Mexico buyers require
  // a separately validated shipping/destination strategy, not a fake ID.
};

/**
 * @typedef {object} EbayRuntimeConfig
 * @property {boolean} liveRequestsAllowed
 * @property {import('../catalog/status.mjs').ProviderStatus} status
 * @property {string} [clientId]
 * @property {string} [clientSecret]
 * @property {'production' | 'sandbox'} apiEnvironment
 * @property {string} apiOrigin
 * @property {readonly ('US' | 'MX')[]} supportedRegions
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {EbayRuntimeConfig}
 */
export function resolveEbayConfig(env = process.env) {
  const liveFlag = env.FITCHECK_ENABLE_LIVE_EBAY === "true";
  const clientId = env.EBAY_CLIENT_ID?.trim();
  const clientSecret = env.EBAY_CLIENT_SECRET?.trim();
  const approved = env.FITCHECK_EBAY_PRODUCTION_APPROVED === "true";
  const apiEnvironment =
    env.FITCHECK_EBAY_API_ENV === "sandbox" ? "sandbox" : "production";
  const apiOrigin =
    apiEnvironment === "sandbox" ? SANDBOX_API : PRODUCTION_API;

  if (!liveFlag) {
    return {
      liveRequestsAllowed: false,
      status: "disabled",
      apiEnvironment,
      apiOrigin,
      supportedRegions: ["US"],
    };
  }
  if (!clientId || !clientSecret) {
    return {
      liveRequestsAllowed: false,
      status: "not_configured",
      apiEnvironment,
      apiOrigin,
      supportedRegions: ["US"],
    };
  }
  if (!approved) {
    return {
      liveRequestsAllowed: false,
      status: "awaiting_approval",
      clientId,
      clientSecret,
      apiEnvironment,
      apiOrigin,
      supportedRegions: ["US"],
    };
  }
  return {
    liveRequestsAllowed: true,
    status: "available",
    clientId,
    clientSecret,
    apiEnvironment,
    apiOrigin,
    supportedRegions: ["US"],
  };
}

/**
 * @param {'US' | 'MX'} region
 * @returns {string | null}
 */
export function marketplaceIdForRegion(region) {
  return MARKETPLACE_BY_REGION[region] ?? null;
}

export const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
export const MAX_QUERY_LENGTH = 120;
export const MAX_RESULT_LIMIT = 25;
export const DEFAULT_TIMEOUT_MS = 12_000;
