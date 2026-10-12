# FitCheck V2 (isolated prototype)

**Upload the fit. Hunt the price.**

Author: [@jmsgnnr](https://github.com/jmsgnnr)

This directory is a self-contained Vite + React + TypeScript prototype. It does not modify the legacy FitCheck client at the repository root. There are **no live catalog providers**, no backend, and no image uploads sent off-device.

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
| `src/lib/adapters.ts` | **Proposed** future provider adapter registry (all disconnected) |

## Honest limitations

- Photo understanding and in-app listing cards are **not implemented**.
- "Search eBay" / "Search Etsy" open marketplace search pages with your phrase; they are not FitCheck results.
- Human concierge is preparation-only; nothing is transmitted.
- No affiliate revenue is claimed in this build.

## Design

See `docs/design-brief.md` for palette, typography, and anti-template checklist.

## License / attribution

FitCheck V2 prototype by @jmsgnnr. Third-party marketplace names belong to their owners; links are user-initiated.


## Review notes (2026-10-12)

This is **prototype review code, not production shopping search**. It cannot recognize garments from photos, fetch live catalog prices, sort real seller offers, or contact a design team. eBay and Etsy links are user-initiated keyword searches, not FitCheck-generated results. No accounts, backend, provider credentials, scraping, or deployments are included.

Supervisor QA upgraded the isolated V2 toolchain to Vite 8.3.4, Vitest 5.0.4, @vitejs/plugin-react 6.1.2 and Playwright 1.64.0; audit reported 0 known vulnerabilities on the audited install. The original React 16 root remains untouched. The image uploader now checks MIME, size, file signatures and decodability in supporting browsers. Preview images remain in memory only; optional contact email is never saved or sent. Draft metadata may be cleared with **Clear saved fields**.

The Playwright fixture at `e2e/fixtures/specimen.png` is a synthetic illustrated jacket made solely for automated visual tests. It is neither a real product photo nor a seller listing. Playwright screenshots and reports must stay outside the repository. Browser acceptance should explicitly check real upload preview, invalid image errors, text contrast, keyboard behavior, no horizontal overflow at 390px and external marketplace links without navigating them.

Before adding live comparison search, obtain provider permissions and review licensing, prices, freshness, shipping/taxes and user-upload consent. See the internal FitCheck V2 product brief.
