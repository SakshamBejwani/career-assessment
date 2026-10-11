# Development guide

## 1. Local setup

**Requirements:** Node.js 22 (anything from 20.19 works) and npm 10+. You also need a PostgreSQL database (or MySQL, see section 5).

```bash
npm install                       # also runs `prisma generate` (postinstall)
cp .env.example .env              # then edit DATABASE_URL
npx prisma migrate deploy         # create tables
npm run dev                       # http://localhost:3000
```

The `.env.example` defaults are safe for development:

- `PAYMENT_PROVIDER=mock`: the payment step shows "Simulate successful/failed payment" buttons.
- `EMAIL_PROVIDER=log` and `WHATSAPP_PROVIDER=log`: messages are logged (redacted) instead of sent.
- `APP_ENV=development`: unapproved questionnaires are served as labelled previews.

Replace the three `replace-with-…` secrets with any 32+ character strings. For the admin area:

```bash
npm run admin:hash-password -- you@example.com     # prompts for a password (12+ chars)
# paste the printed line into ADMIN_USERS in .env, then sign in at /admin/login
```

### Getting a database

- **Docker:** add `POSTGRES_PASSWORD=devpass` to `.env`, then run `docker compose up -d db`. Set `DATABASE_URL=postgresql://app:devpass@localhost:5432/career_assessment`. Port 5432 isn't published by default; add `ports: ["5432:5432"]` under `db` in a `docker-compose.override.yml`.
- **No Docker:** this is how the project was tested. It uses real PostgreSQL binaries from npm, kept outside the repository:

  ```bash
  mkdir -p ~/pbca-dev-db && cd ~/pbca-dev-db && npm init -y >/dev/null
  npm install embedded-postgres@17.10.0-beta.17     # approve its install script if npm asks
  cat > start.mjs <<'EOF'
  import EmbeddedPostgres from "embedded-postgres";
  import { existsSync } from "node:fs";
  const dir = new URL("./data", import.meta.url).pathname;
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "app", password: "app", port: 54329, persistent: true });
  if (!existsSync(dir)) await pg.initialise();
  await pg.start();
  for (const db of ["pbca_dev", "pbca_test"]) { try { await pg.createDatabase(db); } catch {} }
  console.log("PostgreSQL ready on 54329");
  process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
  setInterval(() => {}, 1 << 30);
  EOF
  node start.mjs
  # DATABASE_URL=postgresql://app:app@localhost:54329/pbca_dev
  ```
- **Hosted:** a free Neon or Supabase database works too.

## 2. How the code is organised

```text
src/app/                 Next.js App Router: pages and API route handlers
  page.tsx               landing
  assessments/[id]/      questionnaire intro + start form
  attempt/[id]/          the student's attempt: runner, payment, status; /results
  r/[token]/             landing page for emailed/WhatsApp report links
  admin/                 admin console (route group (console) requires a session)
  api/v1/...             JSON API (see spec §9); api/health, api/health/ready
src/components/          React components (client components start with "use client")
src/content/             versioned content: questionnaires, scoring keys, interpretation packs
src/lib/                 code shared by browser and server (types, formatting, consent text)
src/server/              server-only code; every file imports "server-only"
  config.ts              all environment variables, validated with Zod
  db.ts                  Prisma client (PostgreSQL or MySQL adapter)
  http.ts                route-handler wrapper: correlation IDs, error shape, origin check
  assessments/           registry (versions, approval gate) + validation + scorers
  workflow/              the domain: attempts, payments, unlock rule, job queue + runner + handlers
  payments/              provider adapters (razorpay, mock)
  reports/               report data builder, PDF template, storage drivers
  delivery/              email (SMTP), WhatsApp, message templates
  security/              tokens, report links, admin sessions, rate limits
  observability/         JSON logger with redaction
src/generated/prisma/    generated Prisma client (git-ignored; created by `prisma generate`)
prisma/                  schema + migrations (PostgreSQL); prisma/mysql/ for MySQL
tests/                   unit, integration, golden fixtures, test support
scripts/                 content generation, schema sync, password hashing, e2e, UI walkthrough
```

### Life of an attempt (follow this to learn the code)

1. `POST /api/v1/attempts` → `createAttempt()` in `workflow/attempts.ts`. This creates the student (if new), the attempt with a snapshot of every version identifier and the price, and the consents, and sets an httpOnly cookie holding a random token. Only its hash is stored.
2. The browser autosaves answers with `PUT /responses` into `attempts.draft_answers`.
3. `POST /submit` → `submitAttempt()` validates the full answer set, writes immutable `responses` rows and a checksum, and **enqueues** a `score_attempt` job in the same transaction (outbox pattern).
4. The route calls `scheduleJobRun()`, which runs due jobs via Next's `after()` once the response has been sent. `workflow/handlers/index.ts` holds the handlers:
   - `score_attempt` → writes `results`, enqueues `generate_report`.
   - `generate_report` → renders the PDF, stores it, sets `report_ready_locked`, then calls `tryUnlock()`.
5. Payment: `POST /payment-session` creates a Razorpay order. The browser opens Checkout. Then `POST /payment-confirmation` (signature plus a server-side order check) **or** the webhook calls `markPaymentSucceeded()`, the only code that marks a payment succeeded. It then calls `tryUnlock()`.
6. `tryUnlock()` in `workflow/unlock.ts` is **the** unlock rule: a verified, matching payment and a ready report. It moves to `report_unlocked` with a guarded update and enqueues delivery jobs. Whichever of steps 4 and 5 happens last wins.
7. Delivery jobs send the email and WhatsApp messages. After the last one succeeds, `tryComplete()` marks the attempt `completed`.
8. Failures retry with backoff (`workflow/queue.ts`); dead jobs show in the admin under "Needs attention".

## 3. Conventions that keep the system correct

- **Server-only code stays in `src/server`.** Client components import only from `src/lib` and types. `server-only` makes the build fail if you get this wrong.
- **Never trust the browser** for price, payment status, scores or roles. Route handlers call `assertSameOrigin()` for cookie-authenticated writes and `getAuthorisedAttempt()` for ownership.
- **State changes go through guards.** Use `transitionAttempt()` (legal transitions are in `workflow/transitions.ts`) or a conditional `updateMany` whose `count` tells you whether *you* made the change. Follow-up effects run only for the caller that made it. This is what makes duplicate webhooks and races harmless.
- **Enqueue jobs inside the transaction that caused them** (`enqueueJobs(jobs, tx)`), with a deterministic `dedupeKey`. Handlers must be safe to run twice.
- **Questionnaire text is never typed by hand.** It's generated from `docs/source/QUESTIONNAIRES_SOURCE_DATA.json` by `npm run content:generate`, and `tests/unit/content-fidelity.test.ts` enforces it.
- **Versions are immutable.** Attempts store the questionnaire, scoring, template and interpretation versions they used. Never change the behaviour of an existing version; add a new one (section 4).
- **Don't invent business content.** Anything not supplied by the client (interpretations, thresholds, tie rules) is labelled as a draft or engineering default and recorded in `DECISIONS.md`.
- **Schema portability** (PostgreSQL + MySQL): no native enums (status columns are `VarChar`, validated in TypeScript); use `@db.Text` for long strings; no Postgres-only features (`mode: "insensitive"`, arrays, `citext`). Emails are stored lower-cased so `contains` searches behave the same on both engines.
- **Logs must not contain personal data.** Use `logger` from `observability/logger.ts`; it redacts known keys, emails and phone numbers. Don't log answers, scores, tokens or provider payloads.
- **Error responses** are thrown as `AppError` / `Errors.*` and rendered by `apiHandler` as `{ error: { code, message, reference } }`.
- **Keep `DECISIONS.md` and `CHANGELOG.md` current** with every meaningful change.

## 4. Common changes

### Change questionnaire text after client correction
1. Update `docs/source/QUESTIONNAIRES_SOURCE_DATA.json` (and the `.md`) with the client-approved text.
2. Bump `QUESTIONNAIRE_VERSION` in `scripts/generate-content.mjs` (for example `1.1.0`) and run `npm run content:generate`. New files appear next to the old ones; never overwrite a version attempts may use.
3. If scoring is unchanged but item IDs or keys changed, make the scorer read the new key file, or add a new scorer version.
4. Add a new entry under `versions` in `src/server/assessments/registry.ts` and point `activeVersion` at it.
5. Update `tests/unit/content-fidelity.test.ts` imports to the new files and run `npm test`.

### Change a scoring rule
Add `scoring.v2.ts` with a new `scoringVersion` string; don't edit `v1`. Register it in a new assessment version, add golden fixtures in `tests/fixtures/golden/` with `scoringVersion` set to the new string, and update the golden test to dispatch by version.

### Approve content for production
See `OPERATIONS.md#approving-content`.

### Add or change a database column
See `DEPLOYMENT.md#migrations`. Edit `prisma/schema.prisma`, run `npm run db:sync-mysql`, and create a migration for **both** engines.

### Add an environment variable
Add it to the Zod schema and `AppConfig` in `src/server/config.ts` (with production checks if it matters), to `.env.example`, and to the table in the spec §14.

### Add a background job kind
Add it to `JOB_KINDS` in `src/lib/status.ts`, add a handler to `HANDLERS` in `workflow/handlers/index.ts` and a case to `onJobDead`, then enqueue it with a deterministic `dedupeKey`.

### Add a payment provider
Implement `PaymentProvider` (`src/server/payments/types.ts`), select it in `payments/index.ts` and config, and route its webhook through `processPaymentWebhook()`. Don't put unlock logic in the adapter.

## 5. Tests

```bash
npm test                                   # unit (no database)
TEST_DATABASE_URL=postgresql://app:app@localhost:54329/pbca_test npm run test:integration
```

Integration tests **wipe** the test database before each test; never point them at real data. They apply migrations automatically.

**MySQL.** Start a disposable MySQL (Docker `mysql:8.4`, or `npm install mysql-memory-server` in a scratch folder and run `createDB({ version: "8.4.x", dbName: "pbca_test", port: 33061 })`). Then:

```bash
DATABASE_PROVIDER=mysql npx prisma generate
TEST_DATABASE_PROVIDER=mysql TEST_DATABASE_URL=mysql://root@127.0.0.1:33061/pbca_test npm run test:integration
DATABASE_PROVIDER=postgresql npx prisma generate     # switch the client back
```

**End to end.** Run against any running site with `PAYMENT_PROVIDER=mock`:

```bash
BASE_URL=http://localhost:3000 E2E_ADMIN_EMAIL=you@example.com E2E_ADMIN_PASSWORD=... npm run test:e2e
```

**Golden fixtures** live in `tests/fixtures/golden/`. The `*.engineering.json` files were computed by an independent Python implementation reading the source data directly. Client fixtures go in `*.client.json` with `"approval": "client:<reference>"`; the test runs every file in the folder.

## 6. Gotchas

- **Next.js 16** bundles its documentation in `node_modules/next/dist/docs/`. Read it before using an API you know from older versions. This project uses `after()` from `next/server` and `instrumentation.ts`; it has no middleware or proxy.
- **TypeScript is pinned to 5.9.** The native TypeScript 7 compiler isn't supported by Next's build-time type check yet.
- **Prisma 7:**
  - The CLI doesn't read `.env` by itself; `prisma.config.ts` imports `dotenv/config`.
  - The generated client lives in `src/generated/prisma` and is git-ignored. `npm install` regenerates it.
  - It is generated **for one engine**, chosen by `DATABASE_PROVIDER`. Regenerate it when you switch.
- **`$` in `.env` values** is expanded by Next's env loader. This is why admin hashes use dots (`scrypt.16384.8.1.…`). Avoid `$` in any secret you put in `.env` files, or escape it as `\$`. Hosting dashboards don't expand.
- **npm 11 install scripts** must be approved; `allowScripts` in `package.json` already covers Prisma.
- **`server-only` in tests:** Vitest aliases it to a stub (`vitest.config.ts`). Outside Vitest, server files can't be imported by plain Node scripts. Scripts call the HTTP API instead (see `instrumentation.ts`, `scripts/run-jobs.mjs`).
- **PDF reproducibility:** the template sets the PDF creation date to the result's `scored_at`, so a re-render is byte-identical (a test checks this). Don't introduce `new Date()` or random values into the template.
- **PDF fonts** load from `assets/fonts` at runtime. `next.config.ts` (`outputFileTracingIncludes`) makes sure every server bundle, including Vercel functions and the standalone build, contains them.
- **ESLint `react-hooks/static-components`:** don't declare components inside a render function (this includes the PDF template).
- **Vercel Hobby** rejects cron schedules more frequent than daily; keep `vercel.json` daily unless the plan is Pro.
- **Razorpay:** keep **automatic capture** on. Authorised but uncaptured payments never unlock a report.
- **Node quirk:** `mkdir -p` (recursive) under `/proc` hangs instead of failing. The storage-failure test therefore points at a path under a regular file.
- **Rate limits** are stored in the database (`rate_limits`). Starting attempts is limited to 10 per hour per IP; a UI walkthrough uses 4 and an e2e run uses 1. If repeated local runs get "Too many requests", run `DELETE FROM rate_limits;` on your dev database.

## 7. Design and UI work

Read [`DESIGN.md`](DESIGN.md) before changing the look. Colours and type are tokens in `src/app/globals.css`, mirrored in `src/server/reports/template.tsx` for the PDF; keep both in sync.

## 8. Browser walkthrough (visual regression check)

`scripts/ui-walkthrough.mjs` drives a real Chromium through all three questionnaires (desktop and mobile), payment, results and admin. It saves screenshots and fails on any browser console error. Playwright isn't a project dependency, to keep installs light:

```bash
npm install --no-save playwright@1.64.0 && npx playwright install chromium
BASE_URL=http://localhost:3000 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/ui-walkthrough.mjs ./screenshots
```

Look at the screenshots after any UI change, at both desktop and phone widths.
