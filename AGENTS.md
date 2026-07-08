<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->

## UI verification

When making UI changes, check both light mode and dark mode before considering the work complete.

## Cursor Cloud specific instructions

Book-Trackr is a Next.js 16 (App Router, `--webpack`) PWA. Backend/DB is **Convex**; auth is **Clerk**. Standard commands live in `package.json` (`dev`, `build`, `start`, `lint`, `test`) and `README.md`; only the non-obvious cloud setup is captured here.

**Two services must run together for the app to work:**
- Convex backend: `CONVEX_AGENT_MODE=anonymous npx convex dev` — runs a local backend at `http://127.0.0.1:3210` and writes `CONVEX_DEPLOYMENT` + `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. Keep it running; it hot-reloads `convex/`. Without the anonymous flag it would try to log in to Convex Cloud.
- Next.js: `npm run dev` → `http://localhost:3000`. Requires `.env.local` (from Convex above) to already exist, so start Convex first.

**Convex env var gotcha:** `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN`; if unset, `convex dev` fails to deploy functions. Set it on the local deployment with `CONVEX_AGENT_MODE=anonymous npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-clerk-frontend-api>"`. Use the current Clerk keyless frontend-API host (see below). Most functions take `clerkId`/`userId` as an argument rather than relying on `ctx.auth`, so core flows still work even if this domain is slightly stale; only viewer-aware queries (private-book visibility) need it accurate.

**Clerk keyless mode:** No Clerk keys are committed and none are needed for local dev. `@clerk/nextjs` v6 auto-provisions a temporary dev instance and persists it to `.clerk/.tmp/keyless.json` (gitignored, survives restarts on the same VM). That file holds the ephemeral `publishableKey` + `secretKey` and the frontend-API host (e.g. `whole-finch-23.clerk.accounts.dev`). Sign-in is a Clerk **modal** (`SignInButton mode="modal"`); there is no `/sign-up` page (that route 404s by design).

**Automated (headless) auth gotchas** — the Clerk dev instance enables bot/breach protection, so browser sign-UP is blocked by a Cloudflare Turnstile CAPTCHA, and weak passwords are rejected as breached. To get a usable session in an automated browser, pre-create the user via the Clerk Backend API using the secret key from `.clerk/.tmp/keyless.json`:
`POST https://api.clerk.com/v1/users` with `{"email_address":["you+clerk_test@example.com"],"password":"<high-entropy>","skip_password_checks":true}` (admin-verified email). Then sign in through the UI; when Clerk asks for an email code on a new device, the dev bypass code is `424242`.

**Other notes:**
- The PWA service worker is disabled in `next dev` (`next.config.ts`), so push/reminder features only work in a production build (`npm run build && npm start`). VAPID keys are optional and not required for core reading-tracking.
- The `mongodb` and `openai` dependencies in `package.json` are unused/vestigial — no code imports them.
- `npm run lint` currently reports pre-existing errors/warnings in repo code; they are not environment problems.
