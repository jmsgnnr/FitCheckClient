export class CatalogError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: import('./status.mjs').ProviderStatus, cause?: unknown }} [options]
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.providerStatus = options.status ?? "error";
    this.cause = options.cause;
  }
}

export class ProviderResponseError extends CatalogError {
  /**
   * @param {string} message
   * @param {{ httpStatus: number, providerStatus?: import('./status.mjs').ProviderStatus }} detail
   */
  constructor(message, detail) {
    const status =
      detail.httpStatus === 429
        ? "rate_limited"
        : detail.providerStatus ?? "error";
    super("provider_response", message, { status });
    this.httpStatus = detail.httpStatus;
  }
}
