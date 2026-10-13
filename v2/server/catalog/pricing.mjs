/**
 * Estimated landed subtotal when price, shipping, and optional tax share one currency.
 * Never infer cross-currency totals.
 *
 * @param {{ amount: number, currency: string }} price
 * @param {{ amount: number, currency: string } | null} shipping
 * @param {{ amount: number, currency: string } | null} taxEstimate
 * @returns {{ kind: 'complete', amount: number, currency: string, label: string } | { kind: 'partial', label: string } | { kind: 'unknown', label: string }}
 */
export function describeLandedTotal(price, shipping, taxEstimate) {
  if (!shipping) {
    return {
      kind: "partial",
      label: "Listing price only; shipping unknown",
    };
  }
  if (shipping.currency !== price.currency) {
    return {
      kind: "unknown",
      label: "Shipping currency differs; no delivered total",
    };
  }
  let total = price.amount + shipping.amount;
  if (taxEstimate) {
    if (taxEstimate.currency !== price.currency) {
      return {
        kind: "unknown",
        label: "Tax currency differs; no delivered total",
      };
    }
    total += taxEstimate.amount;
  }
  return {
    kind: "complete",
    amount: total,
    currency: price.currency,
    label: "Estimated subtotal (price + shipping + disclosed tax)",
  };
}

/**
 * Rank by landed total only when every listing has a complete same-currency total.
 * Otherwise preserve provider order (required for eBay keyword results).
 *
 * @param {import('./schema.mjs').NormalizedListing[]} listings
 * @param {{ preserveProviderOrder?: boolean }} [options]
 * @returns {import('./schema.mjs').NormalizedListing[]}
 */
export function rankListings(listings, options = {}) {
  if (options.preserveProviderOrder) {
    return [...listings];
  }
  const scored = listings.map((item) => {
    const landed = describeLandedTotal(
      item.price,
      item.shipping,
      item.taxEstimate,
    );
    return { item, landed };
  });
  const allComplete = scored.every((s) => s.landed.kind === "complete");
  const currencies = new Set(scored.map((s) => s.landed.kind === "complete" ? s.landed.currency : null));
  if (!allComplete || currencies.size !== 1) {
    return [...listings];
  }
  return scored
    .sort((a, b) => {
      const at = a.landed.amount ?? 0;
      const bt = b.landed.amount ?? 0;
      return at - bt;
    })
    .map((s) => s.item);
}
