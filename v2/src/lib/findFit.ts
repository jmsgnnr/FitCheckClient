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
