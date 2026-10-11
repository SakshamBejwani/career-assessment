# Psychology-Based Career Assessment

A web platform where students take one of three questionnaires (personality type, Holland career interests, VARK learning style), pay, and receive a personalised PDF report by email and optionally WhatsApp. It includes an admin area, owner notifications and an audit trail.

**New to the project? Start with [`docs/HANDOVER.md`](docs/HANDOVER.md).**

## Documentation

| Document | What it covers |
|---|---|
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | Status, what's verified, what's blocked on the client, next steps |
| [`docs/IMPLEMENTATION_SPEC.md`](docs/IMPLEMENTATION_SPEC.md) | Canonical requirements and architecture (spec v1.1) |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision register: open client decisions, defaults in use, engineering decisions |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local setup, code tour, conventions, recipes, tests, gotchas |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system, typography, charts, copy and accessibility rules |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel, Hostinger and Docker deployment |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Running the live service: admin, failures, backups, approvals, data deletion |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | History of changes |
| [`docs/source/`](docs/source/) | Client-supplied questionnaire source data |
| [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) | Working rules for contributors and AI coding assistants |

## What's in the box

- **Three questionnaires**, transcribed verbatim from the supplied source data and versioned. A test fails if the text ever drifts from the source.
- **Server-side scoring** for each instrument, implemented from the source answer keys and checked against independently computed golden fixtures.
- **Payment gate**: Razorpay Checkout, with server-side signature and order verification plus signed, de-duplicated webhooks. Pay up front or after finishing, configurable per questionnaire. A mock provider is available outside production.
- **PDF report** with charts, interpretation and career/learning insights, kept in separate sections. Each report is reproducible byte-for-byte from the stored result.
- **Delivery**: email over SMTP with the PDF attached and a signed, expiring link, plus WhatsApp Cloud API templates. Deliveries retry with backoff.
- **Admin**: attempts list, "needs attention" view, full record per attempt, retry and re-send. Every view is audited.
- **Portable deployment**: Vercel, Hostinger Node.js hosting (MySQL), or Docker on any VPS.

## Stack

Next.js 16 (App Router, TypeScript) · Prisma 7 (PostgreSQL or MySQL) · Tailwind CSS 4 · Zod 4 · @react-pdf/renderer · Nodemailer · Vitest. Node.js 20.19+ (22 recommended).

## Run it locally

You need Node.js 22 and a PostgreSQL database. Any local Postgres works, or run one with Docker:

```bash
docker compose up -d db        # needs POSTGRES_PASSWORD in .env
```

Then:

```bash
cp .env.example .env           # set DATABASE_URL; the defaults use mock payments and log-only email
npm install                    # also generates the Prisma client
npx prisma migrate deploy
npm run dev                    # http://localhost:3000
```

For the admin area, create a login with `npm run admin:hash-password -- you@example.com` and put the output in `ADMIN_USERS`.

With `PAYMENT_PROVIDER=mock`, the payment step shows "Simulate successful payment" and "Simulate failed payment" buttons. With `EMAIL_PROVIDER=log`, emails are logged (redacted) instead of sent.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run build:prod` / `npm run start:prod` | The same, applying database migrations first (for hosts) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests: scoring, golden fixtures, content fidelity, security, config |
| `TEST_DATABASE_URL=… npm run test:integration` | Full lifecycle against a real disposable database (`TEST_DATABASE_PROVIDER=mysql` for MySQL) |
| `BASE_URL=… npm run test:e2e` | HTTP smoke test against a running deployment with mock payments |
| `node scripts/ui-walkthrough.mjs ./screenshots` | Browser walkthrough with screenshots (needs Playwright; see docs/DEVELOPMENT.md) |
| `npm run content:generate` | Rebuild questionnaire files from `docs/source/QUESTIONNAIRES_SOURCE_DATA.json` |
| `npm run db:sync-mysql` | Regenerate the MySQL schema from the PostgreSQL one |
| `npm run admin:hash-password -- email` | Create an `ADMIN_USERS` entry |
| `npm run jobs:run` | Trigger one background-job pass on a deployment |

## Project layout

```text
src/app/              pages and API route handlers (/api/v1/...)
src/components/       UI (landing, questionnaire runners, payment, results, admin)
src/content/          versioned questionnaires, scoring keys, interpretation packs
src/server/           server-only code: config, db, assessments (scoring), workflow
                      (state machine, payments, jobs, unlock), reports (PDF), delivery,
                      security, observability
prisma/               schema + migrations for PostgreSQL, and prisma/mysql for MySQL
tests/                unit, integration, golden fixtures
docs/                 spec, deployment, operations, decision register, source data
```

## Deploying

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for step-by-step guides for Vercel, Hostinger Node.js Web Apps and Docker. Day-to-day running is covered in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

Never commit `.env`. It is git-ignored; `.env.example` lists every setting with placeholder values.

## Before a real launch

The software is production-grade, but some content still has to come from the client. Until then, production hides the questionnaires unless `ALLOW_UNAPPROVED_ASSESSMENTS=true`, and every page and PDF says "Preview". Open items are tracked in [`docs/DECISIONS.md`](docs/DECISIONS.md). The launch blockers are:

1. Permission to digitise the ISCHS workbook questionnaires.
2. Client confirmation of each scoring rule (including MBTI ties), with client-approved golden fixtures.
3. Approved interpretation and career-insight text. The current text is an engineering draft.
4. Real prices, live Razorpay keys and a verified webhook.
5. A sending domain with SPF/DKIM, and an approved WhatsApp template if WhatsApp is used.
6. Legal review of the privacy notice, consent wording, minors' consent and retention.
