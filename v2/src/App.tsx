import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { PLANNED_ADAPTERS } from "./lib/adapters";
import {
  checkLocalCatalog,
  searchLocalCatalog,
  type CatalogResults,
  type LocalCatalogStatus,
} from "./lib/catalogClient";
import { parseBudgetInput } from "./lib/budgetValidation";
import {
  buildConciergeBrief,
  clearDraft,
  isDraftEmpty,
  isSavingPaused,
  loadDraft,
  peekDraft,
  saveDraft,
  setSavingPaused,
  type PersistedDraft,
} from "./lib/draftStorage";
import { clampText } from "./lib/textLimit";
import { validateImageContent } from "./lib/imageValidation";
import { buildMarketplaceSearchUrl } from "./lib/marketplaceUrls";
import {
  DRAFT_MAX_TEXT_LENGTH,
  DRAFT_PAUSE_KEY,
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_DAYS,
  ITEM_CATEGORIES,
  type ItemCategory,
  type ItemCondition,
  type ShipRegion,
} from "./lib/constants";
import { buildSearchPhrase, isSearchReady } from "./lib/searchPhrase";
import "./styles/app.css";

type ActiveStep = "photo" | "describe" | "ready";

const STORAGE_UNAVAILABLE_MESSAGE =
  "Your browser blocked saving, so these fields are not being saved. You can keep editing and searching; they will be lost when you close or reload this page.";
const CLEAR_FAILED_MESSAGE =
  "Your browser blocked deleting the saved fields, so an earlier saved copy may still be stored on this device.";

function fieldsKey(d: Omit<PersistedDraft, "savedAt">): string {
  return JSON.stringify([d.category, d.description, d.size, d.condition, d.region, d.budgetUsd, d.conciergeNote]);
}

const CONDITION_LABELS: Record<ItemCondition, string> = { new: "New", used: "Used", either: "Either" };

export default function App() {
  // Restore synchronously so the first autosave pass sees the restored fields, not blanks.
  const [initial] = useState<PersistedDraft | null>(() => loadDraft());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRequestId = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState<Record<"description" | "size" | "note", boolean>>({
    description: false, size: false, note: false,
  });
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [savingEnabled, setSavingEnabled] = useState(() => !isSavingPaused());
  const [savedDraft, setSavedDraft] = useState<PersistedDraft | null>(initial);
  // Fingerprint of what storage already holds, so restoring a draft never re-saves
  // it (which would silently extend its retention) and unchanged fields never rewrite.
  const persistedKey = useRef<string | null>(initial ? fieldsKey(initial) : null);

  const [category, setCategory] = useState<ItemCategory | "">(initial?.category ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [size, setSize] = useState(initial?.size ?? "");
  const [condition, setCondition] = useState<ItemCondition>(initial?.condition ?? "either");
  const [region, setRegion] = useState<ShipRegion>(initial?.region ?? "US");
  const [budgetRaw, setBudgetRaw] = useState(initial?.budgetUsd != null ? String(initial.budgetUsd) : "");
  const [budgetUsd, setBudgetUsd] = useState<number | null>(initial?.budgetUsd ?? null);

  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeNote, setConciergeNote] = useState(initial?.conciergeNote ?? "");
  const [conciergeEmail, setConciergeEmail] = useState("");
  const [catalogStatus, setCatalogStatus] = useState<LocalCatalogStatus | null>(null);
  const [catalogChecking, setCatalogChecking] = useState(false);
  const [catalogConnectionError, setCatalogConnectionError] = useState(false);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogResult, setCatalogResult] = useState<{ key: string; data: CatalogResults } | null>(null);
  const catalogRequestId = useRef(0);

  const hasPhoto = previewUrl != null;

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

  const limited = (field: "description" | "size" | "note", set: (v: string) => void) =>
    (value: string) => {
      const tooLong = value.length > DRAFT_MAX_TEXT_LENGTH;
      set(clampText(value, DRAFT_MAX_TEXT_LENGTH));
      setLimitHit((prev) => (prev[field] === tooLong ? prev : { ...prev, [field]: tooLong }));
    };
  const limitMessage = `Text was shortened to the ${DRAFT_MAX_TEXT_LENGTH.toLocaleString("en-US")} character limit.`;

  const searchPhrase = useMemo(
    () => buildSearchPhrase(draftInput),
    [draftInput],
  );
  const searchReady = isSearchReady(draftInput);
  const catalogKey = JSON.stringify([searchPhrase, region]);
  const shownCatalog = catalogResult?.key === catalogKey ? catalogResult.data : null;
  const canSearchCatalog = searchReady && catalogStatus?.kind === "available" &&
    catalogStatus.supportedRegions.includes(region) && searchPhrase.length <= 120 && !catalogSearching;

  const checkCatalogConnection = async () => {
    const requestId = ++catalogRequestId.current;
    setCatalogChecking(true);
    setCatalogConnectionError(false);
    setCatalogStatus(null);
    setCatalogResult(null);
    setCatalogError(false);
    try {
      const status = await checkLocalCatalog();
      if (catalogRequestId.current === requestId) setCatalogStatus(status);
    } catch {
      if (catalogRequestId.current === requestId) setCatalogConnectionError(true);
    } finally {
      if (catalogRequestId.current === requestId) setCatalogChecking(false);
    }
  };

  const searchConnectedCatalog = async () => {
    if (!canSearchCatalog) return;
    const requestId = ++catalogRequestId.current;
    const key = catalogKey;
    setCatalogSearching(true);
    setCatalogResult(null);
    setCatalogError(false);
    try {
      const result = await searchLocalCatalog(searchPhrase, region);
      if (catalogRequestId.current === requestId) setCatalogResult({ key, data: result });
    } catch {
      if (catalogRequestId.current === requestId) setCatalogError(true);
    } finally {
      if (catalogRequestId.current === requestId) setCatalogSearching(false);
    }
  };

  const activeStep: ActiveStep = !hasPhoto
    ? "photo"
    : searchReady
      ? "ready"
      : "describe";

  useEffect(() => {
    if (!savingEnabled) return;
    const fields = { ...draftInput, conciergeNote };
    if (isDraftEmpty(fields)) {
      // Emptied fields must not leave an older copy behind.
      if (persistedKey.current !== null) {
        if (clearDraft()) {
          persistedKey.current = null;
          setSavedDraft(null);
          setStorageWarning(null);
        } else {
          setStorageWarning(CLEAR_FAILED_MESSAGE);
        }
      }
      return;
    }
    const key = fieldsKey(fields);
    if (key === persistedKey.current) return;
    const draft = { ...fields, savedAt: new Date().toISOString() };
    if (saveDraft(draft)) {
      persistedKey.current = key;
      setSavedDraft(draft);
      setStorageWarning(null);
    } else if (isSavingPaused()) {
      // Another tab turned saving off after this tab last looked.
      setSavingEnabled(false);
      setSavedDraft(null);
      persistedKey.current = null;
    } else {
      setStorageWarning(STORAGE_UNAVAILABLE_MESSAGE);
    }
  }, [draftInput, conciergeNote, savingEnabled]);

  // Keep this tab in step with deletions and pause changes made in other tabs.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== DRAFT_PAUSE_KEY && event.key !== DRAFT_STORAGE_KEY) return;
      setSavingEnabled(!isSavingPaused());
      const stored = peekDraft();
      persistedKey.current = stored ? fieldsKey(stored) : null;
      setSavedDraft(stored);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    catalogRequestId.current += 1;
    setCatalogSearching(false);
    setCatalogResult(null);
    setCatalogError(false);
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
    if (clearDraft()) {
      persistedKey.current = null;
      setSavedDraft(null);
    } else {
      setStorageWarning(CLEAR_FAILED_MESSAGE);
    }
  };

  const clearSavedDraft = () => {
    // Pause first: a deleted draft must not be recreated by the next edit.
    setSavingEnabled(false);
    const pauseStored = setSavingPaused(true);
    if (clearDraft()) {
      persistedKey.current = null;
      setSavedDraft(null);
      setStorageWarning(null);
      setCopyStatus(
        pauseStored
          ? "Saved fields deleted. Saving stays off until you turn it back on. Fields on screen and any photo are unchanged."
          : "Saved fields deleted. Saving is off for this visit only, because your browser blocked remembering that choice. Fields on screen and any photo are unchanged.",
      );
    } else {
      setCopyStatus(null);
      setStorageWarning(CLEAR_FAILED_MESSAGE);
    }
  };

  const resumeSaving = () => {
    setSavingPaused(false);
    setCopyStatus(null);
    setSavingEnabled(true);
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
            className={`step-tag ${activeStep === "describe" ? "is-active" : ""}`}
          >
            [02 Describe]
          </span>
          <span
            className={`step-tag ${activeStep === "ready" ? "is-active" : ""}`}
          >
            [03 Ready]
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

      {storageWarning && (
        <div className="error-banner" role="status" aria-live="polite" data-testid="storage-warning">
          {storageWarning}
        </div>
      )}

      {(savedDraft || !savingEnabled) && (
        <section className="panel" aria-labelledby="saved-heading" data-testid="saved-fields">
          <h2 id="saved-heading">Saved on this device</h2>
          <p className="honest-note">
            {savedDraft
              ? `Search fields (including your sourcing notes) are stored in this browser only, never your photo or email. They are removed automatically ${DRAFT_TTL_DAYS} days after the last change.`
              : "No search fields are saved on this device."}{" "}
            {!savingEnabled && "Saving is turned off."}
          </p>
          {savedDraft && (
            <details className="saved-details">
              <summary>Inspect saved fields</summary>
              <dl className="saved-fields">
                <dt>Last saved</dt><dd>{savedDraft.savedAt.slice(0, 10)}</dd>
                <dt>Item focus</dt><dd>{savedDraft.category || "(not set)"}</dd>
                <dt>Description</dt><dd>{savedDraft.description || "(not set)"}</dd>
                <dt>Size</dt><dd>{savedDraft.size || "(not set)"}</dd>
                <dt>Condition</dt><dd>{CONDITION_LABELS[savedDraft.condition]}</dd>
                <dt>Ship to</dt><dd>{savedDraft.region}</dd>
                <dt>Max budget (USD)</dt><dd>{savedDraft.budgetUsd ?? "(none)"}</dd>
                <dt>Sourcing notes</dt><dd className="saved-note">{savedDraft.conciergeNote || "(none)"}</dd>
              </dl>
            </details>
          )}
          <div className="action-row">
            {savedDraft && (
              <button type="button" className="btn btn-secondary" onClick={clearSavedDraft}>
                Delete saved fields
              </button>
            )}
            {!savingEnabled && (
              <button type="button" className="btn btn-ghost" onClick={resumeSaving}>
                Turn saving back on
              </button>
            )}
          </div>
          {copyStatus && !savedDraft && (
            <p className="honest-note" role="status">{copyStatus}</p>
          )}
        </section>
      )}

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
                onChange={(e) => limited("description", setDescription)(e.target.value)}
                aria-describedby="description-limit"
                placeholder="e.g. brown suede trucker jacket, brass buttons, 90s cut"
              />
              <p id="description-limit" role="status" className="honest-note">{limitHit.description ? limitMessage : ""}</p>
            </div>
            <div className="field">
              <label htmlFor="size">Size (optional)</label>
              <input
                id="size"
                value={size}
                onChange={(e) => limited("size", setSize)(e.target.value)}
                aria-describedby="size-limit"
                placeholder="M / 8 / 32 waist"
              />
              <p id="size-limit" role="status" className="honest-note">{limitHit.size ? limitMessage : ""}</p>
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
            hidden image recognition. We haven&apos;t found a seller or searched
            any store for you yet.
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
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Catalog connection status</h2>
        <p className="honest-note">
          <strong>{catalogStatus?.kind === "available"
            ? "Local keyword catalog enabled."
            : "No live sellers connected yet."}</strong>{" "}
          {catalogStatus?.kind === "available"
            ? "This does not verify any photo match or guarantee an item is still available. Only your explicit search checks local catalog results."
            : "The optional eBay adapter is off by default. Marketplace links above are user-initiated handoffs, not results from FitCheck."}
        </p>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={checkCatalogConnection} disabled={catalogChecking || catalogSearching}>
            {catalogChecking ? "Checking local catalog..." : "Check local catalog"}
          </button>
          {canSearchCatalog && (
            <button type="button" className="btn btn-secondary" onClick={searchConnectedCatalog}>
              Search connected listings
            </button>
          )}
        </div>
        <p className="catalog-helper">Optional check contacts only 127.0.0.1 on this device. No photo or search text is sent by checking status. Searches run only when you click Search connected listings.</p>
        {catalogConnectionError && <p role="status">Local catalog unavailable. Marketplace links remain available.</p>}
        {catalogStatus?.kind === "disabled" && <p role="status">Local provider is disabled or awaiting approval; no live request was made.</p>}
        {catalogStatus?.kind === "available" && !catalogStatus.supportedRegions.includes(region) && (
          <p role="status">Connected eBay catalog supports US only. Mexico shipping search is not yet available.</p>
        )}
        {catalogStatus?.kind === "available" && searchReady && searchPhrase.length > 120 && (
          <p role="status">Your search is too long for the local catalog. Shorten the description to fit 120 characters.</p>
        )}
        {catalogSearching && <p role="status">Checking permitted keyword listings...</p>}
        {catalogError && <p role="status">Search could not complete. No items have been verified. Use a marketplace link instead.</p>}
        {shownCatalog && (
          <div className="catalog-results" aria-live="polite">
            <h3>Keyword listings from eBay · not photo-matched</h3>
            <p className="catalog-helper">These are seller-provided listing prices, not verified lowest delivered prices. Availability and tax may be unknown.</p>
            {shownCatalog.listings.length === 0 ? (
              <p>No supported items returned for this keyword search.</p>
            ) : (
              <ul className="listing-list">
                {shownCatalog.listings.map((item) => (
                  <li key={item.listingId}>
                    <strong>{item.title}</strong>
                    <p>{item.price.currency} {item.price.amount.toFixed(2)} · {item.shipping === null
                      ? "Shipping unknown"
                      : item.shipping.currency === item.price.currency
                        ? `Shipping ${item.shipping.currency} ${item.shipping.amount.toFixed(2)}`
                        : "Shipping currency differs; total unknown"}</p>
                    <p className="catalog-helper">Condition: {item.condition} · Size: {item.sizeText || "unverified"} · Checked: {item.checkedAt.slice(0, 10)} · Availability unverified</p>
                    <a href={item.merchantUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">View original eBay listing</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <details className="provider-details">
          <summary>See supported and planned sources</summary>
          <ul className="coverage-list">
            {PLANNED_ADAPTERS.map((adapter) => (
              <li key={adapter.id}>
                <span>{adapter.label}</span>
                <span className="status-pill">{adapter.state}</span>
              </li>
            ))}
          </ul>
        </details>
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
                  onChange={(e) => limited("note", setConciergeNote)(e.target.value)}
                  aria-describedby="note-limit"
                  placeholder="Sold out drop, unusual size, need authentic vintage only..."
                />
                <p id="note-limit" role="status" className="honest-note">{limitHit.note ? limitMessage : ""}</p>
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
          . Uploads stay in browser memory. Saved drafts contain search fields and sourcing notes only, expire after
          {" "}{DRAFT_TTL_DAYS} days, and never include your photo or contact email.
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
