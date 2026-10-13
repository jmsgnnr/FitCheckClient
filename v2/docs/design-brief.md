# FitCheck V2 Slice 1 — Design Brief

Author: [@jmsgnnr](https://github.com/jmsgnnr) | Date: 2026-10-12

## Design thesis

Internet thrifting meets an indie fashion magazine contact sheet. The uploaded garment is the hero inside a scanner crop frame; everything else reads like zine annotations and specimen catalog labels. This is an honest prototype: no fake listings, no AI glow gradients.

## Headline

**Upload the fit. Hunt the price.**

Supporting promise: Saw it somewhere? We help you track it down with your words until live catalogs connect.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Ink | `#141317` | Background, primary text on paper |
| Vintage paper | `#F5EFE5` | Panels, form surfaces |
| Signal pink | `#FF4A99` | Primary actions, step accent |
| Chartreuse | `#E9FF5B` | Verified/selected focus ring, step 03 tag |
| Warm charcoal | `#3A3632` | Dividers, secondary borders |

Accents are sparse: pink for action, chartreuse only on active step and focus.

## Typography

- Display: `Arial Black`, `Impact`, `Haettenschweiler`, sans-serif — uppercase, tracked labels.
- Utility: `Consolas`, `Courier New`, monospace — step tags `[01 PHOTO]`, metadata, catalog numbers.
- Body: `Segoe UI`, system-ui — readable sentences at 16px base.

No external font files; no Inter-only identity.

## Layout outline

1. Masthead: FITCHECK wordmark + step rail `[01 PHOTO] [02 HUNT] [03 FOUND?]`
2. Asymmetric hero: left copy stack, right scanner-frame drop zone (stacks on mobile).
3. After photo: progressive fields (item focus, description, region, optional budget/size/condition).
4. Hunt panel: constructed phrase, copy button, explicit eBay/Etsy handoff links (not results).
5. Catalog strip: "No live sellers connected yet" with coverage explanation.
6. Concierge prep: local brief builder, clearly not submitted.
7. Footer: disclaimer, affiliate placeholder honesty, @jmsgnnr credit.

## Voice examples

- "Drop the piece."
- "What caught your eye?"
- "We are not scanning this photo yet. Tell us what you are hunting."
- "Search eBay" / "Search Etsy" (handoff, not a price card).
- "No verified match in our catalog. These links open the marketplaces with your phrase."

## Accessibility

- Visible labels, `aria-live` for errors, focus outlines in chartreuse.
- `prefers-reduced-motion`: disable scan line animation.
- Target 4.5:1 for body text on paper; pink buttons use ink text.
- Keyboard: activate drop zone via button, tab through all controls.

## Anti-template checklist

- No four-up stat cards, no glassmorphism hero, no fake discount badges.
- No seeded product tiles or pretend "87% match" metrics.
- No signup wall or demo mode toggle.

## Reused vs new

All UI is new under `v2/`. Legacy FitCheck client untouched. Marketplace URLs are user-initiated handoffs only.
