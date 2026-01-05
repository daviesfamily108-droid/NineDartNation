# Automated Staging Deploy & Smoke Tests

This document describes the GitHub Actions workflow added to support CI-gated deployments and post-deploy smoke tests.

Files added
- `.github/workflows/staging-deploy.yml` — runs unit tests, builds, runs a local preview + UI smoke tests on push, and provides a manual deployment job to Render and Vercel (triggerable via workflow_dispatch).

How it works
- On push to `main`:
  - Checkout, install deps
  - Run unit tests (`npm run test:unit`)
  - Build client and server (`npm run build`, `npm run build:server`)
  - Start a local `vite preview` server and run the UI smoke test (`npm run e2e:ui-smoke`) against it.

- Manual deploy (`workflow_dispatch`):
  - Requires at least one deploy credential in repository secrets:
    - `RENDER_API_KEY` and `RENDER_SERVICE_ID` (recommended for server), and/or
    - `VERCEL_TOKEN` (recommended for frontend)
  - When dispatched, the job will build (if not already built), deploy to the configured providers, and then run the UI smoke tests against the provided staging URL (workflow input `staging_url` or secret `STAGING_URL`).

Secrets to add in GitHub repository settings
- `RENDER_API_KEY` — Render API token (service deploy permission)
- `RENDER_SERVICE_ID` — Render service id (without `srv-` prefix)
- `VERCEL_TOKEN` — Vercel token with deploy permission
- `STAGING_URL` — optional default staging URL for post-deploy tests

How to trigger a staged deploy
1. Go to the repository on GitHub → Actions → 'Staging Deploy & Smoke Tests'
2. Click 'Run workflow' and optionally provide `staging_url` (e.g., https://staging.example.com)
3. Click 'Run workflow' — the job will deploy and run smoke tests. Check the run logs for the smoke test results.

Notes & next steps
- The workflow expects you to supply deploy tokens as GitHub Secrets (do not commit tokens in code).
- If you want me to wire automatic production deploys (after successful staging smoke tests), I can add a gated production job that requires manual approval or protected environment.
- I can also add a Canary rollout via Vercel's preview domains or Render's CLI if desired.
