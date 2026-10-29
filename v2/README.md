# FitCheck V2 (isolated prototype)

**Upload the fit. Hunt the price.**

Author: [@jmsgnnr](https://github.com/jmsgnnr)

This directory is a self-contained Vite + React + TypeScript prototype. It does not modify the legacy FitCheck client at the repository root. **Live catalog providers are disabled by default.** A local Node catalog server (`v2/server/`) implements an eBay Browse keyword adapter with mocked contract tests only. No image uploads are sent off-device in this build.

## Commands

Run everything from `v2/` only (never `npm install` at repo root for this work):

```bash
cd v2
npm install --ignore-scripts
npm run typecheck
npm test
npm run build
npm run dev          # local preview at http://127.0.0.1:5173
npm run test:e2e     # starts dev server; requires Chromium (bundled or Chrome channel)
npm run test:catalog # Node catalog adapter tests (mocked HTTP only)
```

Optional screenshot output directory for Playwright:

```bash
set FITCHECK_V2_SCREENSHOTS=C:\path\outside\repo
npm run test:e2e
```

## Architecture (slice 1)

| Area | Role |
| --- | --- |
| `src/lib/searchPhrase.ts` | Builds transparent text phrase from user fields |
| `src/lib/marketplaceUrls.ts` | eBay/Etsy **handoff** URLs (user clicks; no auto-navigation) |
| `src/lib/imageValidation.ts` | MIME + 10 MB limit for local preview |
| `src/lib/draftStorage.ts` | `localStorage` metadata only (no image bytes) |
| `src/lib/adapters.ts` | Client-side provider status mirror (no network calls) |
| `server/` | Credential-gated eBay keyword adapter, normalized listing schema, optional `127.0.0.1` JSON API |

## Catalog provider gates (env names only)

Live eBay Browse requests are **off** unless every gate below is satisfied. Do not enable in CI or local dev without owner approval and documented Buy API eligibility.

| Variable | Purpose |
| --- | --- |
| `FITCHECK_ENABLE_LIVE_EBAY` | Must be `true` to allow outbound eBay HTTP (default: unset / disabled) |
| `EBAY_CLIENT_ID` | Server-side OAuth client ID (never commit) |
| `EBAY_CLIENT_SECRET` | Server-side OAuth secret (never commit) |
| `FITCHECK_EBAY_PRODUCTION_APPROVED` | Must be `true` after eBay Buy production approval |
| `FITCHECK_EBAY_API_ENV` | Optional `sandbox` or `production` API host |

Optional local status API (not started by `npm run dev`): binds `127.0.0.1` only via `v2/server/http/server.mjs`. Endpoints: `GET /api/catalog/status`, `GET /api/catalog/search?q=...&region=US`. The UI's **Mexico** destination remains available for text handoffs, but the eBay Buy adapter deliberately **rejects MX**, because eBay's supported Buy marketplace list does not include `EBAY_MX`. A future supported-marketplace-plus-Mexico-shipping strategy must be validated before enabling it. All catalog tests use synthetic mock responses; do not interpret the `available` mock status as production access.

### Local catalog API trust policy

Enforced in `server/http/server.mjs` for every request, before routing and before any adapter or credential call. Violations return `403 {"error":"forbidden_origin_or_host"}`.

- **Host**: must be exactly `127.0.0.1`, `localhost` or `[::1]` plus the port the socket is actually serving. Rebinding names (`evil.example`, `127.0.0.1.evil.com`), userinfo, other ports, missing/oversized Host are rejected.
- **Origin (present)**: must exactly match an allowed local client origin. Default: `http://127.0.0.1:5173`, `http://localhost:5173`; override with the `allowedOrigins` option. `null` and empty Origins are rejected.
- **Origin (missing)**: allowed only for non-browser local tooling (curl, tests), i.e. when `Sec-Fetch-Site` is absent, `same-origin` or `none`. A browser request that omits Origin but sends `Sec-Fetch-Site: cross-site`/`same-site` (e.g. `<script src>`) is rejected.
- **Budget**: `/api/catalog/search` is limited in memory to 30 requests per 60 s and 2 concurrent requests (`budget: { maxRequests, windowMs, maxConcurrent }`); excess gets `429 request_budget_exceeded`. Rejected (403) traffic does not consume budget.
- The existing loopback-only bind and live/credential/production-approval gates are unchanged. No image bytes are accepted or sent.

Future `search_by_image` requires (1) owner-approved provider config and (2) explicit shopper consent before forwarding a photo. That path is not implemented here.

## Honest limitations

- Photo understanding and in-app listing cards are **not implemented** in the UI.
- The catalog server does not run automatically; the UI still shows **no live sellers connected**. Even when the server runs locally, actual outgoing requests remain disabled without all three independent enablement/approval/credential gates.
- "Search eBay" / "Search Etsy" open marketplace search pages with your phrase; they are not FitCheck catalog results.
- Human concierge is preparation-only; nothing is transmitted.
- No affiliate revenue is claimed in this build. The normalized server adapter labels current inventory as **availability unknown** unless a documented live item check establishes purchasability. Asking prices never establish the cheapest delivered offer when shipping/tax or currency comparability is missing.

## Design

See `docs/design-brief.md` for palette, typography, and anti-template checklist.

## License / attribution

FitCheck V2 prototype by @jmsgnnr. Third-party marketplace names belong to their owners; links are user-initiated.


## Review notes (2026-10-12)

This is **prototype review code, not production shopping search**. It cannot recognize garments from photos, fetch live catalog prices, sort real seller offers, or contact a design team. eBay and Etsy links are user-initiated keyword searches, not FitCheck-generated results. No accounts, backend, provider credentials, scraping, or deployments are included.

Supervisor QA upgraded the isolated V2 toolchain to Vite 8.3.4, Vitest 5.0.4, @vitejs/plugin-react 6.1.2 and Playwright 1.64.0; audit reported 0 known vulnerabilities on the audited install. The original React 16 root remains untouched. The image uploader now checks MIME, size, file signatures and decodability in supporting browsers. Preview images remain in memory only; optional contact email is never saved or sent. Draft metadata may be cleared with **Clear saved fields**.

The Playwright fixture at `e2e/fixtures/specimen.png` is a synthetic illustrated jacket made solely for automated visual tests. It is neither a real product photo nor a seller listing. Playwright screenshots and reports must stay outside the repository. Browser acceptance should explicitly check real upload preview, invalid image errors, text contrast, keyboard behavior, no horizontal overflow at 390px and external marketplace links without navigating them.

Before adding live comparison search, obtain provider permissions and review licensing, prices, freshness, shipping/taxes and user-upload consent. See the internal FitCheck V2 product brief.
