import {
  dedupeListings,
  isHttpsUrl,
  parseMoney,
  validateNormalizedListing,
} from "../catalog/schema.mjs";

/**
 * @param {Record<string, unknown>} item
 * @returns {string | undefined}
 */
function extractSizeText(item) {
  if (typeof item.size === "string" && item.size.trim()) {
    return item.size.trim();
  }
  const aspects = item.localizedAspects;
  if (!Array.isArray(aspects)) return undefined;
  for (const aspect of aspects) {
    if (
      aspect &&
      typeof aspect === "object" &&
      String(aspect.name).toLowerCase() === "size" &&
      typeof aspect.value === "string" &&
      aspect.value.trim()
    ) {
      return aspect.value.trim();
    }
  }
  return undefined;
}

/**
 * @param {unknown} rawItem
 * @param {string} checkedAt
 * @returns {import('../catalog/schema.mjs').NormalizedListing | null}
 */
export function normalizeEbayItemSummary(rawItem, checkedAt) {
  if (!rawItem || typeof rawItem !== "object") return null;
  const item = rawItem;
  const listingId =
    typeof item.itemId === "string"
      ? item.itemId
      : typeof item.legacyItemId === "string"
        ? item.legacyItemId
        : null;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const merchantUrl =
    typeof item.itemWebUrl === "string" ? item.itemWebUrl : "";
  if (!listingId || !title || !isHttpsUrl(merchantUrl)) return null;

  const priceValue = item.price?.value ?? item.price?.amount;
  const priceCurrency = item.price?.currency;
  const price = parseMoney(priceValue, priceCurrency);
  if (!price.ok) return null;

  let photoUrl;
  const imageCandidate =
    item.image?.imageUrl ??
    item.thumbnailImages?.[0]?.imageUrl ??
    item.image?.url;
  if (typeof imageCandidate === "string" && isHttpsUrl(imageCandidate)) {
    photoUrl = imageCandidate;
  }

  let shipping = null;
  const shippingOption = item.shippingOptions?.[0]?.shippingCost;
  if (shippingOption) {
    const parsed = parseMoney(
      shippingOption.value ?? shippingOption.amount,
      shippingOption.currency,
    );
    if (parsed.ok) shipping = parsed.value;
  }

  let condition = "unknown";
  const conditionId = item.conditionId ?? item.condition;
  if (conditionId === "1000" || conditionId === "NEW") condition = "new";
  else if (
    conditionId === "3000" ||
    conditionId === "USED" ||
    conditionId === "USED_EXCELLENT"
  ) {
    condition = "used";
  }

  // An item summary alone does not guarantee current purchasability.
  const availability = "unknown";

  const normalized = {
    source: "ebay",
    listingId,
    title,
    merchantUrl,
    sellerName:
      typeof item.seller?.username === "string"
        ? item.seller.username
        : undefined,
    photoUrl,
    price: price.value,
    shipping,
    taxEstimate: null,
    condition,
    sizeText: extractSizeText(item),
    availability,
    checkedAt,
    matching: "unverified",
    evidence: ["keyword_search_only"],
    affiliateDisclosure:
      "Links open on eBay; affiliate terms apply when configured.",
  };

  const valid = validateNormalizedListing(normalized);
  return valid.ok ? normalized : null;
}

/**
 * @param {unknown} payload
 * @param {string} checkedAt
 * @returns {import('../catalog/schema.mjs').NormalizedListing[]}
 */
export function normalizeEbaySearchResponse(payload, checkedAt) {
  const summaries = Array.isArray(payload?.itemSummaries)
    ? payload.itemSummaries
    : [];
  const mapped = summaries
    .map((item) => normalizeEbayItemSummary(item, checkedAt))
    .filter(Boolean);
  return dedupeListings(mapped);
}
