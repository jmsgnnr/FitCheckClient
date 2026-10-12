import { CatalogError } from "../catalog/errors.mjs";
import { DEFAULT_TIMEOUT_MS, EBAY_OAUTH_SCOPE } from "./config.mjs";

/**
 * @param {string} apiOrigin
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {typeof fetch} fetchImpl
 * @param {number} [timeoutMs]
 */
export async function fetchApplicationAccessToken(
  apiOrigin,
  clientId,
  clientSecret,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const tokenUrl = `${apiOrigin}/identity/v1/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_OAUTH_SCOPE,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CatalogError(
        "oauth_failed",
        `OAuth token request failed (${response.status})`,
        { status: response.status === 429 ? "rate_limited" : "error" },
      );
    }
    const payload = await response.json();
    if (!payload?.access_token || typeof payload.access_token !== "string") {
      throw new CatalogError("oauth_malformed", "OAuth response missing token", {
        status: "error",
      });
    }
    const expiresIn =
      typeof payload.expires_in === "number" ? payload.expires_in : 7200;
    return {
      accessToken: payload.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new CatalogError("oauth_timeout", "OAuth token request timed out", {
        status: "error",
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
