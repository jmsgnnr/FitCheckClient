import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { hasLiveSellerConnection, PLANNED_ADAPTERS } from "./lib/adapters";
import { parseBudgetInput } from "./lib/budgetValidation";
import {
  buildConciergeBrief,
  clearDraft,
  loadDraft,
  saveDraft,
} from "./lib/draftStorage";
import { validateImageContent } from "./lib/imageValidation";
import { buildMarketplaceSearchUrl } from "./lib/marketplaceUrls";
import {
  ITEM_CATEGORIES,
  type ItemCategory,
  type ItemCondition,
  type ShipRegion,
} from "./lib/constants";
import { buildSearchPhrase, isSearchReady } from "./lib/searchPhrase";
import "./styles/app.css";

type ActiveStep = "photo" | "hunt" | "found";

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRequestId = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const [category, setCategory] = useState<ItemCategory | "">("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState<ItemCondition>("either");
  const [region, setRegion] = useState<ShipRegion>("US");
  const [budgetRaw, setBudgetRaw] = useState("");
  const [budgetUsd, setBudgetUsd] = useState<number | null>(null);

  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeNote, setConciergeNote] = useState("");
  const [conciergeEmail, setConciergeEmail] = useState("");

  const hasPhoto = previewUrl != null;
  const liveSellers = hasLiveSellerConnection();

  const draftInput = useMemo(
    () => ({
      category,
      description,
      size,
      condition,
      region,
      budgetUsd,
    }),
    [category, description, size, condition, region, budgetUsd],
  );

  const searchPhrase = useMemo(
    () => buildSearchPhrase(draftInput),
    [draftInput],
  );
  const searchReady = isSearchReady(draftInput);

  const activeStep: ActiveStep = !hasPhoto
    ? "photo"
    : searchReady
      ? "found"
      : "hunt";

  useEffect(() => {
    const saved = loadDraft();
    if (!saved) return;
    setCategory(saved.category);
    setDescription(saved.description);
    setSize(saved.size);
    setCondition(saved.condition);
    setRegion(saved.region);
    setBudgetUsd(saved.budgetUsd);
    setBudgetRaw(saved.budgetUsd != null ? String(saved.budgetUsd) : "");
    setConciergeNote(saved.conciergeNote);
  }, []);

  useEffect(() => {
    if (!hasPhoto && !description && !category) return;
    saveDraft({
      ...draftInput,
      savedAt: new Date().toISOString(),
      conciergeNote,
    });
  }, [draftInput, conciergeNote, hasPhoto, description, category]);

  const revokePreview = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  const applyImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const request = ++imageRequestId.current;
      const validation = await validateImageContent(file);
      if (request !== imageRequestId.current) return;
      if (!validation.ok) {
        setImageError(validation.message);
        return;
      }
      try {
        if (typeof createImageBitmap === "function") {
          const decoded = await createImageBitmap(file);
          decoded.close();
        }
      } catch {
        if (request === imageRequestId.current) {
          setImageError("We couldn't display that image. Try another photo.");
        }
        return;
      }
      if (request !== imageRequestId.current) return;
      setImageError(null);
      setPreviewUrl((previous) => {
        revokePreview(previous);
        return URL.createObjectURL(file);
      });
    },
    [revokePreview],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) applyImageFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [applyImageFile]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyImageFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    applyImageFile(event.dataTransfer.files?.[0]);
  };

  const removePhoto = () => {
    imageRequestId.current += 1;
    revokePreview(previewUrl);
    setPreviewUrl(null);
    setImageError(null);
  };

  const onBudgetBlur = () => {
    const parsed = parseBudgetInput(budgetRaw);
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    setFormError(null);
    setBudgetUsd(parsed.value);
  };

  const ebayUrl = searchReady
    ? buildMarketplaceSearchUrl("ebay", searchPhrase)
    : null;
  const etsyUrl = searchReady
    ? buildMarketplaceSearchUrl("etsy", searchPhrase)
    : null;

  const copyPhrase = async () => {
    if (!searchReady) {
      setFormError(
        "Pick an item type and describe it in a few words before copying.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(searchPhrase);
      setCopyStatus("Search phrase copied.");
    } catch {
      setCopyStatus("Copy failed. Select the phrase box and copy manually.");
    }
  };

  const copyBrief = async () => {
    const brief = buildConciergeBrief(
      draftInput,
      searchPhrase,
      conciergeNote,
      conciergeEmail,
    );
    try {
      await navigator.clipboard.writeText(brief);
      setCopyStatus("Sourcing brief copied (not submitted).");
    } catch {
      setCopyStatus("Copy failed. Select the brief text and copy manually.");
    }
  };

  const resetAll = () => {
    imageRequestId.current += 1;
    revokePreview(previewUrl);
    setPreviewUrl(null);
    setImageError(null);
    setFormError(null);
    setCopyStatus(null);
    setCategory("");
    setDescription("");
    setSize("");
    setCondition("either");
    setRegion("US");
    setBudgetRaw("");
    setBudgetUsd(null);
    setConciergeNote("");
    setConciergeEmail("");
    setConciergeOpen(false);
    clearDraft();
  };

  const clearSavedDraft = () => {
    clearDraft();
    setCopyStatus("Saved field draft cleared. Photo stays until you remove it.");
  };

  const conciergeBrief = buildConciergeBrief(
    draftInput,
    searchPhrase,
    conciergeNote,
    conciergeEmail,
  );

  return (
    <div className="app-shell">
      <header className="masthead">
        <p className="wordmark" aria-label="FitCheck">
          Fit<span>Check</span>
        </p>
        <nav className="step-rail" aria-label="Progress">
          <span
            className={`step-tag ${activeStep === "photo" ? "is-active" : ""}`}
          >
            [01 Photo]
          </span>
          <span
            className={`step-tag ${activeStep === "hunt" ? "is-active" : ""}`}
          >
            [02 Hunt]
          </span>
          <span
            className={`step-tag ${activeStep === "found" ? "is-active" : ""}`}
          >
            [03 Found?]
          </span>
        </nav>
      </header>

      <section className="hero-grid" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="catalog-id">Specimen intake · offline prototype</p>
          <h1 id="hero-title">Upload the fit. Hunt the price.</h1>
          <p className="lede">
            Saw it somewhere? Drop a photo, tell us which piece matters, and we
            build an honest search phrase. Market links open only when you click
            them.
          </p>
        </div>

        <div
          className="scanner-frame"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {!previewUrl ? (
            <>
              <div className="scan-line" aria-hidden="true" />
              <button
                type="button"
                className="drop-zone"
                onClick={() => fileInputRef.current?.click()}
              >
                <strong>Drop the piece</strong>
                <span className="drop-hint">
                  Click, drag, or paste an image (JPG, PNG, WEBP · max 10 MB).
                  Stays on this device.
                </span>
              </button>
            </>
          ) : (
            <div className="preview-wrap">
              <img src={previewUrl} alt="Your uploaded garment preview" />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={onFileChange}
            aria-label="Choose garment image"
          />
          {previewUrl && (
            <div className="preview-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                Replace photo
              </button>
              <button type="button" className="btn btn-ghost" onClick={removePhoto}>
                Remove photo
              </button>
            </div>
          )}
        </div>
      </section>

      {imageError && (
        <div className="error-banner" role="alert" aria-live="assertive">
          {imageError}
        </div>
      )}

      {hasPhoto && (
        <section className="panel" aria-labelledby="describe-heading">
          <h2 id="describe-heading">What caught your eye?</h2>
          <p className="honest-note">
            We are not scanning this photo yet. Descriptions come from you so
            the hunt stays transparent until vision and catalog adapters connect.
          </p>

          {(formError || copyStatus) && (
            <div
              className="error-banner"
              role={formError ? "alert" : "status"}
              aria-live="polite"
              style={
                formError
                  ? undefined
                  : {
                      background: "#1f2412",
                      color: "#e9ff5b",
                      borderColor: "#e9ff5b",
                    }
              }
            >
              {formError ?? copyStatus}
            </div>
          )}

          <div className="field-grid">
            <div className="field">
              <label htmlFor="item-category">Item focus</label>
              <select
                id="item-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ItemCategory | "")
                }
              >
                <option value="">Select type</option>
                {ITEM_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ship-region">Ship to</label>
              <select
                id="ship-region"
                value={region}
                onChange={(e) => setRegion(e.target.value as ShipRegion)}
              >
                <option value="US">United States</option>
                <option value="MX">Mexico</option>
              </select>
            </div>
            <div className="field field-full">
              <label htmlFor="description">Describe the piece</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. brown suede trucker jacket, brass buttons, 90s cut"
              />
            </div>
            <div className="field">
              <label htmlFor="size">Size (optional)</label>
              <input
                id="size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="M / 8 / 32 waist"
              />
            </div>
            <div className="field">
              <label htmlFor="budget">Max budget USD (optional)</label>
              <input
                id="budget"
                inputMode="decimal"
                value={budgetRaw}
                onChange={(e) => setBudgetRaw(e.target.value)}
                onBlur={onBudgetBlur}
                placeholder="Leave blank for no cap"
              />
            </div>
            <div className="field field-full">
              <label htmlFor="condition">Condition</label>
              <select
                id="condition"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as ItemCondition)
                }
              >
                <option value="either">New or used</option>
                <option value="new">New only</option>
                <option value="used">Used / pre-owned</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {hasPhoto && (
        <section className="panel" aria-labelledby="hunt-heading">
          <h2 id="hunt-heading">Your hunt phrase</h2>
          <p className="honest-note">
            Same one? Close cut? This phrase is built from your words, not from
            hidden image recognition.
          </p>
          <p className="phrase-box" aria-label="Constructed search phrase">
            {searchReady
              ? searchPhrase
              : "Add an item type and a short description to unlock handoff links."}
          </p>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={copyPhrase}
              disabled={!searchReady}
            >
              Copy search text
            </button>
            {ebayUrl && (
              <a
                className="btn btn-secondary"
                href={ebayUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Search eBay
              </a>
            )}
            {etsyUrl && (
              <a
                className="btn btn-secondary"
                href={etsyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Search Etsy
              </a>
            )}
            <button type="button" className="btn btn-ghost" onClick={resetAll}>
              Reset all
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={clearSavedDraft}
            >
              Clear saved fields
            </button>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Catalog connection status</h2>
        {liveSellers ? (
          <p>Live seller adapters are connected.</p>
        ) : (
          <p className="honest-note">
            <strong>No live sellers connected yet.</strong> Integrated search
            will land here once partner APIs are approved. Until then, use the
            marketplace handoff links above; they are not scraped results from
            FitCheck.
          </p>
        )}
        <ul className="coverage-list">
          {PLANNED_ADAPTERS.map((adapter) => (
            <li key={adapter.id}>
              <span>{adapter.label}</span>
              <span className="status-pill">{adapter.state}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="concierge-heading">
        <h2 id="concierge-heading">Can&apos;t find it?</h2>
        <p className="honest-note">
          Human sourcing is <strong>not available yet</strong>. No one receives
          this brief automatically. Prepare a copy you can email later when the
          service is staffed.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setConciergeOpen((v) => !v)}
          aria-expanded={conciergeOpen}
        >
          {conciergeOpen ? "Hide brief builder" : "Prepare sourcing brief"}
        </button>
        {conciergeOpen && (
          <div style={{ marginTop: "1rem" }}>
            <div className="field-grid">
              <div className="field field-full">
                <label htmlFor="concierge-note">What makes this hunt hard?</label>
                <textarea
                  id="concierge-note"
                  value={conciergeNote}
                  onChange={(e) => setConciergeNote(e.target.value)}
                  placeholder="Sold out drop, unusual size, need authentic vintage only..."
                />
              </div>
              <div className="field field-full">
                <label htmlFor="concierge-email">
                  Email (optional, not saved or sent)
                </label>
                <input
                  id="concierge-email"
                  type="email"
                  autoComplete="email"
                  value={conciergeEmail}
                  onChange={(e) => setConciergeEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <pre className="brief-output" aria-label="Sourcing brief preview">
              {conciergeBrief}
            </pre>
            <div className="action-row">
              <button type="button" className="btn btn-secondary" onClick={copyBrief}>
                Copy brief (not submitted)
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <p>
          FitCheck V2 prototype by{" "}
          <a href="https://github.com/jmsgnnr" rel="noopener noreferrer">
            @jmsgnnr
          </a>
          . Uploads stay in browser memory. Saved drafts contain search fields only;
          contact email is not saved.
        </p>
        <p>
          Merchant links open third-party sites under their terms. Affiliate
          relationships will be disclosed here when live feeds connect; none are
          claimed in this build.
        </p>
        <p>
          You must own or have rights to photos you upload. Prices shown on
          external sites are theirs to verify.
        </p>
      </footer>
    </div>
  );
}
