# Handover: start here

This document is for whoever takes the project forward. It covers what exists, what has been verified, what is still open, and where to begin. Read it first, then the documents it points to.

## 1. What this project is

**Psychology-Based Career Assessment** is a web platform where a student:

1. picks one of three questionnaires: **Personality type** (MBTI-style, 70 questions), **Career interests** (Holland RIASEC, 72 statements) or **Learning style** (VARK, 14 questions);
2. answers it (progress autosaves);
3. pays via Razorpay, either before starting or after finishing (configurable);
4. gets a personalised PDF report on screen, by email, and by WhatsApp if they opt in.

The owner gets email notifications for key events. There's a small admin area to look up attempts, retry failed work and re-send reports.

The questionnaire content comes from workbook PDFs supplied by the client (Indian School of Counselling and Healing Studies). Their verbatim transcription is in [`docs/source/`](source/).

## 2. Documents in this repository

| Document | Read it when |
|---|---|
| [`HANDOVER.md`](HANDOVER.md) (this file) | First: status, open work, where to begin |
| [`IMPLEMENTATION_SPEC.md`](IMPLEMENTATION_SPEC.md) | You need the requirements, the state model, the API contract or the reasoning behind the architecture. This is the canonical spec (v1.1) |
| [`DECISIONS.md`](DECISIONS.md) | You need to know what the client still has to decide, which defaults are in place meanwhile, and the engineering decisions already made |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | You are setting up locally, changing code, adding migrations or running tests. Includes the known gotchas |
| [`DESIGN.md`](DESIGN.md) | You are touching the UI or the PDF: design tokens, typography, chart rules, copy style |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | You are deploying to Vercel, Hostinger or Docker |
| [`OPERATIONS.md`](OPERATIONS.md) | The site is live: admin use, failure playbooks, backups, secret rotation, approving content, deleting data |
| [`CHANGELOG.md`](CHANGELOG.md) | You want the history. Add an entry for every meaningful change |
| [`source/`](source/) | The client-supplied questionnaire data. Never edit by hand; see DEVELOPMENT.md |
| [`archive/`](archive/) | The original v1.0 spec, for comparison with v1.1 |
| [`../AGENTS.md`](../AGENTS.md) and [`../CLAUDE.md`](../CLAUDE.md) | Standing instructions for AI coding assistants (and a short checklist for humans) |

## 3. Current status

**Software:** feature-complete for Phase 1 and verified (section 4).
**Product launch:** blocked on client inputs (section 5). The app can be deployed today as a **preview/staging** site.

| Area | State |
|---|---|
| Landing page, three questionnaires, autosave, submit | Done |
| Scoring (all three, versioned, deterministic) | Done. Implements the source keys; client confirmation pending |
| Payments: Razorpay upfront or after completion, webhooks, mock provider | Done. Not yet run against a Razorpay sandbox |
| PDF report and on-screen results | Done, using **draft** interpretation text |
| Email (SMTP), WhatsApp (Meta Cloud API), owner notifications | Done. SMTP verified against a local mail server; WhatsApp verified by request shape only |
| Admin area with audit trail | Done |
| PostgreSQL and MySQL support | Done; both tested |
| Deployment: Vercel, Hostinger Node.js apps, Docker + Caddy | Configured and documented; no live deployment made yet |

## 4. How it was verified (October 2026)

All commands are runnable by you (see DEVELOPMENT.md for database setup):

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | Clean |
| Lint | `npm run lint` | Clean |
| Unit tests: scoring, golden fixtures, content fidelity, security, config, state machine | `npm test` | 62 passed |
| Integration tests on PostgreSQL 17: full lifecycle, webhooks, races, failure recovery, real SMTP | `TEST_DATABASE_URL=… npm run test:integration` | 12 passed |
| Same suite on MySQL 8.4 | `TEST_DATABASE_PROVIDER=mysql TEST_DATABASE_URL=… npm run test:integration` | 11 lifecycle tests passed (the SMTP test was added afterwards; run it on MySQL too) |
| Production build | `npm run build` | Clean |
| HTTP end-to-end, against `next start` and against the standalone/Docker build | `BASE_URL=… npm run test:e2e` | 34 of 34 checks passed on both |
| Browser walkthrough: all three questionnaires on desktop and phone, both payment workflows, results, admin | `node scripts/ui-walkthrough.mjs ./screenshots` (Playwright; see DEVELOPMENT.md section 8) | Passed, no browser errors; visual issues found along the way were fixed |

**Not verified:** a real Razorpay transaction, the client's production SMTP account, a real WhatsApp send, a deployment on Vercel or Hostinger, and a real Docker image build (the standalone output the Dockerfile uses was tested, but no `docker build` was run).

## 5. What is blocked on the client

The full list, with the default in use for each, is in [`DECISIONS.md`](DECISIONS.md). The launch blockers:

1. **Rights**: written permission to digitise and sell the ISCHS workbook questionnaires (D-01).
2. **Scoring sign-off**: confirmation of each scoring rule, especially the MBTI tie rule (D-04, D-05, D-07, D-09), plus client-approved golden test cases (D-11).
3. **Report text**: the interpretation and career-insight text in `src/content/interpretations/` was written by engineering as a **draft** because the source files contain none. The client must approve or replace it (D-12, D-13).
4. **Commercials**: real prices (current ₹499 / ₹499 / ₹299 are placeholders), Razorpay live account, GST/receipt needs (D-15, D-17).
5. **Messaging**: a sending domain with SPF/DKIM, and a Meta-approved WhatsApp template if WhatsApp is wanted (D-19, D-21).
6. **Legal**: privacy notice, consent wording, minors and guardian consent, retention period. India's DPDP Act 2023 likely applies (D-22 to D-25).

When content is approved, follow [`OPERATIONS.md#approving-content`](OPERATIONS.md#approving-content). It's a small, reviewed code change.

## 6. Suggested next steps, in order

1. **Get it running locally** (DEVELOPMENT.md section 1) and run every check in section 4.
2. **Deploy a staging site** (`APP_ENV=staging`, `PAYMENT_PROVIDER=mock`) so the client can try all three questionnaires and review the draft report text.
3. **Razorpay test mode**: test keys, the webhook on the staging URL, and **automatic payment capture enabled** in the Razorpay dashboard. The app unlocks reports only for *captured* payments; with manual capture, reports stay locked.
4. **Collect the client decisions** in section 5; update `DECISIONS.md` as each one closes.
5. **Apply approvals**: client golden fixtures, final interpretation text, registry approval references.
6. **Production deployment** (DEPLOYMENT.md), then a live ₹1 test transaction and one real email and WhatsApp send.
7. **Nice-to-haves** (not in Phase 1 scope; confirm with the client first):
   - Run the browser walkthrough in CI.
   - An admin "download PDF" button.
   - A Noto font fallback for non-Latin names in PDFs.
   - Automated retention/deletion once a policy exists.
   - A higher attempt-creation rate limit if whole classrooms share one IP.

## 7. Known limitations

- **Device-bound attempts.** A student's in-progress attempt lives in an httpOnly cookie in the browser where they started. Another device can't resume it. Finished reports are reachable from any device through the emailed or WhatsApp link (valid 7 days by default). This follows from the spec's "no student accounts" scope.
- **Status updates poll** every 2 seconds, then every 10, while work is in progress. There are no websockets.
- **PDF fonts cover Latin script only** (decision D-31).
- **English only** (D-30). **No dark mode**: the UI declares `color-scheme: light`.
- **Vercel Hobby cron runs once a day.** Retries still progress through `after()` and status polling, but on Vercel Hobby add an external cron as described in DEPLOYMENT.md.
- **`npm audit`** still reports `deepmerge-ts` inside the Prisma CLI (build/migrate time only; see DECISIONS.md T-10). `mariadb` and `mysql2` are pinned to fixed versions through `overrides` in `package.json`. Remove those once Prisma updates them.

## 8. Accounts and secrets you will need

Nothing secret is in the repository. `.env` is git-ignored and `.env.example` holds placeholders only. You'll need to create or obtain:

- A database: Neon or Supabase Postgres, Hostinger MySQL, or the Docker Postgres.
- Razorpay account keys and a webhook secret.
- SMTP credentials for the sending mailbox.
- Optional: Meta WhatsApp Cloud API phone number ID and permanent token.
- Your own `SESSION_SECRET`, `REPORT_LINK_SECRET` and `CRON_SECRET` (commands in DEPLOYMENT.md).
- Your own admin login (`npm run admin:hash-password -- you@example.com`).
