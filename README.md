# FitCheckClient

**Author:** [@jmsgnnr](https://github.com/jmsgnnr)

Legacy React 16 front end for FitCheck (outfit / fit tracking). This repository is under **draft contract review** on branch `maintenance/client-contract-baseline`: API wrappers were aligned with the maintained FitCheckAPI security baseline; the legacy Webpack 3 / node-sass 4 toolchain is **not** rebuilt or verified in this pass.

## Status and limitations

- Source edits to `src/api/*` describe the intended HTTP contract; the browser app may still serve an older generated bundle until a audited rebuild is run.
- Do **not** run root `npm install` or legacy `start` / `build` / `deploy` without auditing the obsolete dependency tree (native `node-sass`, Webpack 3).
- No live calls to Heroku or localhost backends are required for unit contract tests.
- `src/components/Fits/FitIndex.js` remains a placeholder; `/fits` routing is unchanged.

## Backend API contract (client expectations)

Base URL is chosen in `src/apiConfig.js` (historical Heroku vs `localhost:4741`); contract tests use a fabricated host only.

| Action | Method | Path | Auth |
| --- | --- | --- | --- |
| Sign up | POST | `/sign-up` | none |
| Sign in | POST | `/sign-in` | none |
| Sign out | DELETE | `/sign-out` | `Authorization: Bearer <token>` |
| Change password | PATCH | `/change-password` | `Authorization: Bearer <token>` |
| List fits | GET | `/fits` | `Authorization: Bearer <token>` |
| Create fit | POST | `/fits` | `Authorization: Bearer <token>` |
| Show fit | GET | `/fits/:id` | `Authorization: Bearer <token>` |

Fit `:id` must be a 24-character hexadecimal MongoDB ObjectId. Malformed IDs are rejected before the request is built.

Request shapes are built in `src/api/requestContracts.js` and consumed by `src/api/auth.js` and `src/api/fits.js`.

## Tests

Dependency-free contract regression (Node built-in test runner, Node ≥ 18):

```bash
npm run test:unit
```

Equivalent:

```bash
node --test "tests/unit/*.test.js"
```

Legacy Jest / `npm test` (jsdom, Babel, Webpack toolchain) was **not** run for this baseline because root dependencies are intentionally not installed.

## Third-party credits

Built with Create React App–era tooling, React, Axios, Bootstrap, and other dependencies listed in `package.json`. FitCheckAPI is a separate repository.
