import { CatalogError } from "../catalog/errors.mjs";
import { raceAbort, readBoundedText } from "./bounded.mjs";
import { DEFAULT_TIMEOUT_MS, EBAY_OAUTH_SCOPE, MAX_TOKEN_BODY_BYTES } from "./config.mjs";

/**
 * @param {string} apiOrigin
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {typeof fetch} fetchImpl
 * @param {number} [timeoutMs] ignored when `signal` is supplied (the caller owns the deadline)
 * @param {AbortSignal} [signal] shared overall-deadline signal
 */
export async function fetchApplicationAccessToken(
  apiOrigin,
  clientId,
  clientSecret,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
) {
  const tokenUrl = `${apiOrigin}/identity/v1/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_OAUTH_SCOPE,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const controller = new AbortController();
  const timer = signal ? null : setTimeout(() => controller.abort(), timeoutMs);
  const effectiveSignal = signal ?? controller.signal;
  try {
    const response = await raceAbort(
      fetchImpl(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: body.toString(),
        signal: effectiveSignal,
      }),
      effectiveSignal,
    );
    if (!response.ok) {
      throw new CatalogError(
        "oauth_failed",
        `OAuth token request failed (${response.status})`,
        { status: response.status === 429 ? "rate_limited" : "error" },
      );
    }
    // Abort/deadline/size errors from the bounded read propagate untouched;
    // only a JSON.parse failure means a malformed token response.
    const text = await readBoundedText(response, {
      maxBytes: MAX_TOKEN_BODY_BYTES,
      signal: effectiveSignal,
    });
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CatalogError("oauth_malformed", "OAuth response was not valid JSON", {
        status: "error",
      });
    }
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
    if (error?.name === "AbortError" || error?.code === "deadline_exceeded" || effectiveSignal.aborted) {
      throw new CatalogError("oauth_timeout", "OAuth token request timed out", {
        status: "error",
      });
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
