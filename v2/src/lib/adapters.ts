/**
 * Proposed provider adapter surface for future server-side integration.
 * Slice 1 does not call any remote catalog APIs.
 */
export type AdapterConnectionState =
  | "disconnected"
  | "configured"
  | "error";

export interface CatalogAdapterDescriptor {
  id: string;
  label: string;
  state: AdapterConnectionState;
  note: string;
}

export const PLANNED_ADAPTERS: CatalogAdapterDescriptor[] = [
  {
    id: "ebay-browse",
    label: "eBay Browse",
    state: "disconnected",
    note: "OAuth partner approval required before live listing search.",
  },
  {
    id: "etsy-open",
    label: "Etsy Open API",
    state: "disconnected",
    note: "App review required; no scraping substitute.",
  },
  {
    id: "affiliate-feeds",
    label: "Publisher product feeds",
    state: "disconnected",
    note: "Awin / Rakuten feeds need publisher relationships first.",
  },
];

export function hasLiveSellerConnection(): boolean {
  return PLANNED_ADAPTERS.some((a) => a.state === "configured");
}
