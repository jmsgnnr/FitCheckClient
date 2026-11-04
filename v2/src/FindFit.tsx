import { useEffect, useRef, useState } from "react";
import { FIND_FAILED_MESSAGE, canSearch, findWithDeadline, matchLabel } from "./lib/findFit";
import type { FitProvider, FitResult } from "./lib/findFit";
import { IMAGE_DECODE_ERROR, validateImageContent } from "./lib/imageValidation";
import "./styles/find-fit.css";

type Phase = "idle" | "searching" | "done";

export default function FindFit({ provider }: { provider: FitProvider }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const runRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<FitResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => { if (phase === "done") resultsRef.current?.focus(); }, [phase]);

  const clear = (message = "") => {
    runRef.current += 1;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setPreviewUrl(null);
    setConsented(false);
    setResult(null);
    setPhase("idle");
    setError(message);
    if (inputRef.current) inputRef.current.value = "";
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const checked = await validateImageContent(file);
    if (!checked.ok) {
      clear(checked.message);
      return;
    }
    clear();
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setPhoto(file);
    setPreviewUrl(url);
  };

  const search = async () => {
    if (!photo || !canSearch(provider, true, consented)) return;
    const run = ++runRef.current;
    setPhase("searching");
    setError("");
    setResult(null);
    try {
      const found = await findWithDeadline(provider, photo);
      if (run !== runRef.current) return;
      setResult(found);
      setPhase("done");
    } catch (caught) {
      if (run !== runRef.current) return;
      setError(caught instanceof Error && caught.message ? caught.message : FIND_FAILED_MESSAGE);
      setPhase("idle");
    }
  };

  return (
    <div className="find-shell">
      <header className="find-top">
        <p className="find-mark">FIT<span>CHECK</span></p>
        {provider.isDemo && <p className="find-demo-tag">DEMO: SAMPLE LISTINGS</p>}
      </header>
      <main>
        <h1>Snap the fit.<br /><span>We find it.</span></h1>
        <section className="find-stage" aria-label="Your photo">
          {previewUrl ? (
            <img src={previewUrl} alt="Your photo" onError={() => clear(IMAGE_DECODE_ERROR)} />
          ) : (
            <button type="button" className="find-drop" onClick={() => inputRef.current?.click()}>
              <strong>Take or choose a photo</strong>
              <span>JPG, PNG or WEBP, up to 10 MB</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label="Choose a photo"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </section>
        {error && <p className="find-error" role="alert">{error}</p>}
        {photo && (
          <div className="find-actions">
            {provider.sendsPhoto && (
              <label className="find-consent">
                <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
                Send this photo to {provider.name} to find matches
              </label>
            )}
            <button
              type="button"
              className="find-go"
              disabled={phase === "searching" || !canSearch(provider, true, consented)}
              onClick={() => void search()}
            >
              {phase === "searching" ? "Finding..." : "Find this"}
            </button>
            <button type="button" className="find-quiet" onClick={() => clear()}>Remove photo</button>
          </div>
        )}
        {provider.isDemo && (
          <p className="find-note">
            Demo mode: your photo stays on this device and isn&apos;t analyzed. Every photo gets the same sample listings.
          </p>
        )}
        <div aria-live="polite">{phase === "searching" && <p className="find-note">Looking for your fit...</p>}</div>
        {phase === "done" && result && (
          <section className="find-results" aria-labelledby="find-results-heading">
            <h2 id="find-results-heading" ref={resultsRef} tabIndex={-1}>
              {result.listings.length ? (provider.isDemo ? "Sample results" : "What we found") : "No matches found"}
            </h2>
            {result.identified && <p className="find-identified">Looks like {result.identified}</p>}
            {!result.listings.length && <p className="find-note">Try a clearer photo with one item in frame.</p>}
            <ul>
              {result.listings.map((listing) => (
                <li key={listing.id}>
                  <div className="find-thumb" aria-hidden="true">{provider.isDemo ? "SAMPLE" : ""}</div>
                  <div>
                    <p className={`find-badge ${listing.evidence === "product_id" ? "is-exact" : ""}`}>{matchLabel(listing.evidence)}</p>
                    <h3>{listing.title}</h3>
                    <p className="find-price">{listing.priceText}</p>
                    <p className="find-meta">{listing.source} · {listing.condition} · {listing.shippingText}</p>
                    <p className="find-meta">{listing.checkedText}</p>
                    {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer">View listing</a>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
