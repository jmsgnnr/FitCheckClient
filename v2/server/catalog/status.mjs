/** @typedef {'not_configured' | 'awaiting_approval' | 'disabled' | 'available' | 'error' | 'rate_limited'} ProviderStatus */

export const PROVIDER_STATUSES = [
  "not_configured",
  "awaiting_approval",
  "disabled",
  "available",
  "error",
  "rate_limited",
];

/**
 * @param {unknown} value
 * @returns {value is ProviderStatus}
 */
export function isProviderStatus(value) {
  return typeof value === "string" && PROVIDER_STATUSES.includes(value);
}
