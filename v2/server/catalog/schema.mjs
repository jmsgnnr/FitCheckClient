const HTTPS_URL = /^https:\/\//i;
const ISO_CURRENCY = /^[A-Z]{3}$/;

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isHttpsUrl(url) {
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {unknown} amount
 * @param {unknown} currency
 * @returns {{ ok: true, value: { amount: number, currency: string } } | { ok: false, reason: string }}
 */
export function parseMoney(amount, currency) {
  const numeric =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (typeof currency !== "string" || !ISO_CURRENCY.test(currency)) {
    return { ok: false, reason: "invalid_currency" };
  }
  return { ok: true, value: { amount: numeric, currency } };
}

/**
 * @typedef {'new' | 'used' | 'unknown'} ListingCondition
 * @typedef {'available' | 'unavailable' | 'unknown'} ListingAvailability
 * @typedef {'unverified' | 'similar' | 'exactVerified'} ListingMatching
 *
 * @typedef {object} NormalizedListing
 * @property {'ebay'} source
 * @property {string} listingId
 * @property {string} title
 * @property {string} merchantUrl
 * @property {string} [sellerName]
 * @property {string} [photoUrl]
 * @property {{ amount: number, currency: string }} price
 * @property {{ amount: number, currency: string } | null} shipping
 * @property {{ amount: number, currency: string } | null} taxEstimate
 * @property {ListingCondition} condition
 * @property {string} [sizeText]
 * @property {ListingAvailability} availability
 * @property {string} checkedAt
 * @property {ListingMatching} matching
 * @property {string[]} evidence
 * @property {string} [affiliateDisclosure]
 */

/**
 * @param {NormalizedListing} listing
 * @returns {{ ok: true } | { ok: false, reasons: string[] }}
 */
export function validateNormalizedListing(listing) {
  const reasons = [];
  if (listing.source !== "ebay") reasons.push("invalid_source");
  if (!listing.listingId || typeof listing.listingId !== "string") {
    reasons.push("invalid_listing_id");
  }
  if (!listing.title?.trim()) reasons.push("invalid_title");
  if (!isHttpsUrl(listing.merchantUrl)) reasons.push("invalid_merchant_url");
  if (listing.photoUrl && !isHttpsUrl(listing.photoUrl)) {
    reasons.push("invalid_photo_url");
  }
  const price = parseMoney(listing.price?.amount, listing.price?.currency);
  if (!price.ok) reasons.push("invalid_price");
  if (listing.shipping) {
    const ship = parseMoney(listing.shipping.amount, listing.shipping.currency);
    if (!ship.ok) reasons.push("invalid_shipping");
  }
  if (listing.taxEstimate) {
    const tax = parseMoney(
      listing.taxEstimate.amount,
      listing.taxEstimate.currency,
    );
    if (!tax.ok) reasons.push("invalid_tax");
  }
  if (!listing.checkedAt) reasons.push("missing_checked_at");
  if (listing.matching === "exactVerified" && listing.evidence.length === 0) {
    reasons.push("exact_without_evidence");
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/**
 * @param {string} source
 * @param {string} listingId
 * @returns {string}
 */
export function listingDedupKey(source, listingId) {
  return `${source}:${listingId}`;
}

/**
 * @param {NormalizedListing[]} listings
 * @returns {NormalizedListing[]}
 */
export function dedupeListings(listings) {
  const seen = new Set();
  const out = [];
  for (const item of listings) {
    const key = listingDedupKey(item.source, item.listingId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export { HTTPS_URL };
