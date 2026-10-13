/**
 * Provider adapter registry (client-side status mirror).
 * Live catalog search runs only on the optional local server in `v2/server/`
 * when explicitly enabled; the browser does not call eBay directly.
 */
export type ProviderStatus =
  | "not_configured"
  | "awaiting_approval"
  | "disabled"
  | "available"
  | "error"
  | "rate_limited";

export interface CatalogAdapterDescriptor {
  id: string;
  label: string;
  state: ProviderStatus;
  note: string;
}

export const PLANNED_ADAPTERS: CatalogAdapterDescriptor[] = [
  {
    id: "ebay-browse",
    label: "eBay Browse (keyword)",
    state: "disabled",
    note:
      "Server adapter exists; live calls need FITCHECK_ENABLE_LIVE_EBAY, credentials, and Buy API approval.",
  },
  {
    id: "ebay-image",
    label: "eBay search_by_image",
    state: "disabled",
    note: "Not implemented. Requires separate shopper consent before any photo forward.",
  },
  {
    id: "etsy-open",
    label: "Etsy Open API",
    state: "not_configured",
    note: "App review required; no scraping substitute.",
  },
  {
    id: "affiliate-feeds",
    label: "Publisher product feeds",
    state: "not_configured",
    note: "Awin / Rakuten feeds need publisher relationships first.",
  },
];

/** True only when a provider is actually serving listings (not used in slice 2 UI). */
export function hasLiveSellerConnection(): boolean {
  return PLANNED_ADAPTERS.some((a) => a.state === "available");
}
