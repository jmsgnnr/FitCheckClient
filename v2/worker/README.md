# FitCheck PoC identify worker

Cloudflare Worker that accepts one consented clothing/shoes photo, runs a single Workers AI vision call, and returns a short identification JSON. Sample listings stay in the browser; this worker does not search marketplaces.

## What is not stored

- Image bytes are not written to D1, R2, KV, or logs.
- The model prompt and model output are not stored or logged.
- Only a running search counter (`search_quota.used`) is kept in D1 so the free-tier cap can be enforced.
- Error responses are `{ error, code }` only. Successful responses are identification fields only.

## $0 rule

Use a free Cloudflare account with **no payment method** attached. Do not enable paid AI, Workers, or D1 features. If the free quota is exhausted, the worker returns `429 quota_exhausted` and stops. Do not raise `SEARCH_CAP` past what the free plan can absorb.

## Owner setup (run on your machine)

Replace `REPLACE_BEFORE_DEPLOY` in `wrangler.toml` with a real D1 database id after creating the DB.

```bash
cd v2/worker
npx wrangler d1 create fitcheck-poc
# paste the database_id into wrangler.toml

npx wrangler d1 migrations apply fitcheck-poc --remote
npx wrangler deploy
```

Set `ALLOWED_ORIGINS` to the exact browser origin that hosts the V2 client (no wildcards). Point the client at the worker with `VITE_FITCHECK_API_URL`.

## Shopify

Nothing in this worker calls Shopify or any storefront API.
