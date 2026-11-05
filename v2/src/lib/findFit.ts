import { preparePhoto } from "./preparePhoto";

/** Photo-to-listings seam. A real provider replaces the demo one; the screen does not change. */
export type MatchEvidence = "product_id" | "visual_only";

export type FitListing = {
  id: string;
  title: string;
  priceText: string;
  source: string;
  condition: string;
  shippingText: string;
  checkedText: string;
  evidence: MatchEvidence;
  /** Absent for demo listings, which must never look clickable. */
  url?: string;
};

export type FitResult = {
  identified: string | null;
  listings: FitListing[];
};

export type FitProvider = {
  name: string;
  /** True when the photo leaves this device. Search then requires explicit consent. */
  sendsPhoto: boolean;
  isDemo: boolean;
  /** When true, listings are unlinked samples and must not be shown as matches. */
  listingsAreSamples?: boolean;
  find: (photo: File, signal: AbortSignal) => Promise<FitResult>;
};

export type DemoScenario = "results" | "empty" | "error" | "slow";

export const FIND_DEADLINE_MS = 12_000;
export const FIND_TIMEOUT_MESSAGE = "The search took too long. Your photo is still here, so you can try again.";
export const FIND_FAILED_MESSAGE = "We couldn't finish that search. Your photo is still here, so you can try again.";

/** "Exact" is reserved for product-level evidence. Looking alike is never enough. */
export function matchLabel(evidence: MatchEvidence): "Exact match" | "Similar" {
  return evidence === "product_id" ? "Exact match" : "Similar";
}

export function canSearch(provider: Pick<FitProvider, "sendsPhoto">, hasPhoto: boolean, consented: boolean): boolean {
  return hasPhoto && (!provider.sendsPhoto || consented);
}

/** Runs a provider with one overall deadline, aborting it on timeout. */
export async function findWithDeadline(
  provider: FitProvider,
  photo: File,
  deadlineMs: number = FIND_DEADLINE_MS,
): Promise<FitResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(FIND_TIMEOUT_MESSAGE));
    }, deadlineMs);
  });
  try {
    return await Promise.race([provider.find(photo, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const SAMPLE_LISTINGS: FitListing[] = [
  {
    id: "sample-a",
    title: "Sample listing A",
    priceText: "$000 (sample)",
    source: "Sample store",
    condition: "Used",
    shippingText: "Shipping unknown",
    checkedText: "Not checked: sample data",
    evidence: "product_id",
  },
  {
    id: "sample-b",
    title: "Sample listing B",
    priceText: "$000 (sample)",
    source: "Sample marketplace",
    condition: "New",
    shippingText: "Shipping unknown",
    checkedText: "Not checked: sample data",
    evidence: "visual_only",
  },
  {
    id: "sample-c",
    title: "Sample listing C",
    priceText: "$000 (sample)",
    source: "Sample resale",
    condition: "Used",
    shippingText: "Shipping unknown",
    checkedText: "Not checked: sample data",
    evidence: "visual_only",
  },
];

/** Never reads or sends the photo, and returns the same samples for every image. */
export function createDemoProvider(scenario: DemoScenario = "results", delayMs = 500): FitProvider {
  return {
    name: "Demo",
    sendsPhoto: false,
    isDemo: true,
    find: (_photo, signal) =>
      new Promise<FitResult>((resolve, reject) => {
        const finish = () => {
          if (scenario === "error") reject(new Error(FIND_FAILED_MESSAGE));
          else if (scenario === "empty") resolve({ identified: null, listings: [] });
          else resolve({ identified: null, listings: SAMPLE_LISTINGS });
        };
        if (scenario === "slow") {
          signal.addEventListener("abort", () => reject(new Error(FIND_TIMEOUT_MESSAGE)));
          return;
        }
        setTimeout(finish, delayMs);
      }),
  };
}

export const WORKER_QUOTA_MESSAGE = "The test limit has been reached.";
export const WORKER_UNSUPPORTED_PHOTO_MESSAGE =
  "Use a photo of just the clothing or shoes, with no people in it.";

type WorkerIdentified = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  colorway?: string | null;
  styleCode?: string | null;
  visibleText?: string[] | null;
  uncertainties?: string[] | null;
};

/** Build a short readable line from identify fields only — never invent missing pieces. */
export function formatWorkerIdentified(fields: WorkerIdentified): string {
  const brand = typeof fields.brand === "string" && fields.brand.trim() ? fields.brand.trim() : null;
  const model = typeof fields.model === "string" && fields.model.trim() ? fields.model.trim() : null;
  if (!brand && !model) return "Couldn't identify the exact item";
  const parts: string[] = [];
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  let text = parts.join(" ");
  const colorway =
    typeof fields.colorway === "string" && fields.colorway.trim() ? fields.colorway.trim() : null;
  const styleCode =
    typeof fields.styleCode === "string" && fields.styleCode.trim() ? fields.styleCode.trim() : null;
  if (colorway) text += ` in ${colorway}`;
  if (styleCode) text += ` (${styleCode})`;
  return text;
}

function mapWorkerError(code: unknown): string {
  if (code === "quota_exhausted") return WORKER_QUOTA_MESSAGE;
  if (code === "unsupported_photo") return WORKER_UNSUPPORTED_PHOTO_MESSAGE;
  return FIND_FAILED_MESSAGE;
}

/**
 * Sends a prepared photo to the Cloudflare identify worker.
 * Listings remain the same unlinked samples — identification only.
 */
export function createWorkerProvider(apiUrl: string): FitProvider {
  const base = apiUrl.replace(/\/$/, "");
  return {
    name: "Cloudflare",
    sendsPhoto: true,
    isDemo: false,
    listingsAreSamples: true,
    find: async (photo, signal) => {
      const prepared = await preparePhoto(photo);
      let response: Response;
      try {
        response = await fetch(`${base}/api/identify`, {
          method: "POST",
          headers: {
            "Content-Type": "image/jpeg",
            "X-FitCheck-Consent": "yes",
          },
          body: prepared,
          signal,
        });
      } catch {
        if (signal.aborted) throw new Error(FIND_TIMEOUT_MESSAGE);
        throw new Error(FIND_FAILED_MESSAGE);
      }

      let payload: { identified?: WorkerIdentified; code?: string } | null = null;
      try {
        payload = (await response.json()) as { identified?: WorkerIdentified; code?: string };
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(mapWorkerError(payload?.code));
      }
      if (!payload?.identified || typeof payload.identified !== "object") {
        throw new Error(FIND_FAILED_MESSAGE);
      }

      return {
        identified: formatWorkerIdentified(payload.identified),
        listings: SAMPLE_LISTINGS,
      };
    },
  };
}
