import { CatalogError } from "../catalog/errors.mjs";

/**
 * Read a fetch Response body as text with a hard byte cap that also honors an
 * AbortSignal, even when the (possibly mocked or proxied) stream ignores the
 * signal itself. Rejects with CatalogError codes `body_too_large` or
 * `deadline_exceeded` and cancels the underlying stream.
 *
 * @param {Response} response
 * @param {{ maxBytes: number, signal: AbortSignal }} options
 * @returns {Promise<string>}
 */
export async function readBoundedText(response, { maxBytes, signal }) {
  const declared = Number(response.headers?.get?.("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new CatalogError("body_too_large", "Provider response too large", { status: "error" });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () =>
      reject(new CatalogError("deadline_exceeded", "Provider response not finished before deadline", { status: "error" }));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  // The race loser must never surface as an unhandled rejection.
  aborted.catch(() => {});
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        throw new CatalogError("body_too_large", "Provider response too large", { status: "error" });
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Settle with `promise`, or reject with an AbortError-shaped error as soon as
 * `signal` aborts. Guards against fetch implementations that ignore the signal.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal} signal
 * @returns {Promise<T>}
 */
export function raceAbort(promise, signal) {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}
