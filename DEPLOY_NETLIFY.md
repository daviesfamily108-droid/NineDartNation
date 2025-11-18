Netlify Deploy: Update Vite API Host

When deploying the frontend to Netlify, make sure the build-time environment variables point to your Render backend. Vite embeds env vars at build time, so changing them on Netlify requires a rebuild to take effect.

Recommended Environment Variables (Netlify build settings):
- VITE_API_URL = https://ninedartnation-1.onrender.com
- VITE_WS_URL = wss://ninedartnation-1.onrender.com

Steps:
1. Go to your Netlify site → Site settings → Build & deploy → Environment.
2. Add or update the variables above. If you already have values set, change them to `-1` if Render's domain contains '-1'.
3. Trigger a new deploy (via the Pull Request, pushing a commit, or "Trigger deploy" in Netlify UI).

Optional: If you deploy auto-builds from GitHub, you can commit a small, non-functional change (e.g., update README) to force a new build.

Notes:
- If you rely on Netlify preview deploys (PR deploys), add `https://ninedartnation.netlify.app` or `https://*.netlify.app` to `CORS_ORIGINS` on the Render service to allow preview domains.
 - TIP: The in-app debug banner that once showed API / token info has been removed; use server logs, browser devtools, or the provided E2E scripts (e.g., `scripts/e2e_admin_tournament.cjs`) for debugging.
- If you prefer not to use netlify.toml, set the environment variables directly in the Netlify UI under "Build & Deploy → Environment" to guarantee the right values are used during CI builds.
