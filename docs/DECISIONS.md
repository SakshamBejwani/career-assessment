# Decision register

Every item the BRD and spec leave to the client, with the reversible engineering default the platform uses until the client decides. Production launch is blocked until the items marked **Launch blocker** are closed (spec §13.5).

Status values: **Open** (client decision needed) · **Default in use** (engineering default active, client may change) · **Closed**.

| ID | Decision | Engineering default in use | Where it lives | Status |
|---|---|---|---|---|
| D-01 | Rights to digitise and administer the ISCHS workbook questionnaires and interpretations | Content shipped as transcribed; footer and PDF credit the ISCHS workbook | `src/components/site/SiteFooter.tsx`, `src/server/reports/template.tsx` | **Launch blocker** |
| D-02 | Public name of the personality module ("MBTI" is a trademark of The Myers-Briggs Company; the PDF calls itself "Personality Type Identification Using Psychometric Test") | UI shows "Personality type"; the registry `name` keeps the source label | `src/server/assessments/registry.ts` | Open |
| D-03 | Source typos: Q7 "chose", Q33 "gentles", Q36 "tied", Q40 "rules your more", RIASEC Artistic "Yourself" | Shown verbatim (content-fidelity test enforces this). "Yourself" is flagged `source_text_review_required` | `src/content/questionnaires/*`, `scripts/generate-content.mjs` | Open |
| D-04 | MBTI scoring aggregation (groups 2+3, 4+5, 6+7) | Implemented exactly as the answer sheet describes | `src/server/assessments/mbti/scoring.v1.ts` | **Launch blocker** (needs client fixtures) |
| D-05 | MBTI tie rule (5–5 on E/I, 10–10 on the others) | Position reported as `X`, explained as "balanced" | same | **Launch blocker** |
| D-06 | MBTI back navigation (paper instructions say no going back) | Back allowed (`allowBackNavigation: true`) | `registry.ts` | Open |
| D-07 | RIASEC point-per-tick scoring | 1 point per ticked statement, bands High 9–12 / Mid 5–8 / Low 0–4 | `riasec/scoring.v1.ts` | **Launch blocker** |
| D-08 | RIASEC three-letter Holland code and tie-breaking | Not produced; a ranked list is shown with ties sharing a rank | same | Open |
| D-09 | VARK Q1 (no key) and Q15 ("Ignore question 1") | Q1 shown, required, never scored; Q15 not rendered | `vark/scoring.v1.ts`, content generator | **Launch blocker** |
| D-10 | VARK thresholds / "multimodal" bands | None; counts plus highest mode(s) only | same | Open |
| D-11 | Golden test fixtures | Engineering fixtures derived from the source key (`tests/fixtures/golden/*.engineering.json`) | `tests/unit/golden-scoring.test.ts` | **Launch blocker** (add `*.client.json` with `"approval": "client:<ref>"`) |
| D-12 | Report template and interpretation text | Draft packs `0.1.0-draft` written by engineering; reports say so | `src/content/interpretations/*` | **Launch blocker** |
| D-13 | Career insights definition | RIASEC: example fields for High-band areas (or the top area). MBTI: none, by design. VARK: study strategies | same | **Launch blocker** |
| D-14 | Payment provider | Razorpay (Orders, Checkout, webhooks) | `src/server/payments/providers/razorpay.ts` | Default in use |
| D-15 | Prices and currency | Placeholders: ₹499 / ₹499 / ₹299, INR | environment `PRICE_*` | **Launch blocker** |
| D-16 | Payment timing | Pay after completion, configurable globally and per module | `PAYMENT_WORKFLOW*` | Default in use |
| D-17 | GST invoices / receipts | Razorpay's receipt only | — | Open |
| D-18 | Refunds and chargebacks | Not implemented; handled in the Razorpay dashboard | — | Open |
| D-19 | Email provider and sender domain | SMTP (works with Hostinger Mail, Google Workspace, SES, Brevo) | `src/server/delivery/email.ts` | **Launch blocker** (sender domain with SPF/DKIM) |
| D-20 | Report attachment policy | PDF attached (up to 5 MB) plus a signed link valid for 7 days | `EMAIL_ATTACH_PDF`, `REPORT_LINK_TTL_HOURS` | Default in use |
| D-21 | WhatsApp provider, template text and opt-in | Meta Cloud API; template `report_ready` with name + link; separate opt-in tick | `src/server/delivery/whatsapp.ts` | Open |
| D-22 | Contact fields and consent wording | Full name, email, optional WhatsApp; consents versioned `consent-2026-10-v1` | `src/lib/consent.ts` | **Launch blocker** (legal review) |
| D-23 | Minors / parental consent | Required tick: "18 or older, or my parent or guardian has agreed" | same | **Launch blocker** (legal review, DPDP Act 2023) |
| D-24 | Privacy notice | Factual draft of what the system does | `src/app/privacy/page.tsx` | **Launch blocker** (legal review) |
| D-25 | Retention and deletion | No automatic deletion; manual deletion procedure in OPERATIONS.md | — | **Launch blocker** |
| D-26 | Database and data residency | PostgreSQL (or MySQL on Hostinger); choose an India region if residency is required | deployment | Open |
| D-27 | Admin capabilities | List, detail, retry job, re-send report; no export or edits | `src/app/admin`, `src/server/admin.ts` | Default in use |
| D-28 | Owner notification events | `payment_succeeded`, `scoring_failed`, `report_generation_failed`, `report_delivery_failed` | `OWNER_NOTIFY_EVENTS` | Default in use |
| D-29 | Bundles (several modules, one payment) | Not offered; one payment per module | — | Open |
| D-30 | Language | English only | — | Open |
| D-31 | Names in non-Latin scripts on the PDF | Lexend Latin subset; Devanagari and other scripts would render as missing glyphs | `assets/fonts` | Open (add a Noto font if needed) |
| D-32 | Brand identity | Neutral design system (spec §17) using the configured `NEXT_PUBLIC_ORG_NAME` | `src/app/globals.css` | Open |

## Technical decisions (engineering-owned)

| ID | Decision | Rationale |
|---|---|---|
| T-01 | One Next.js app for UI and API | One deployment on Vercel or Hostinger, no CORS, shared types |
| T-02 | Prisma 7 with driver adapters | No native query engine binary, so it works on serverless and shared hosting; one typed schema for Postgres and MySQL |
| T-03 | Content as versioned files, not DB rows | Questionnaire text and scoring keys are reviewed in Git, immutable per version, and need no seeding step |
| T-04 | Database-backed job queue + `after()` + cron | Works without long-running workers; idempotent and safe across instances |
| T-05 | Report PDFs stored in the database by default | Portable to every host and included in database backups; S3 and filesystem drivers available |
| T-06 | `@react-pdf/renderer` | Pure JavaScript, deterministic output (creation date pinned to scoring time), no headless browser |
| T-07 | Cookie-held attempt tokens instead of student accounts | Spec excludes a student portal; tokens are hashed at rest and scoped per attempt |
| T-08 | Status columns as validated strings | Same schema on PostgreSQL and MySQL |
| T-09 | Admin password hash format `scrypt.N.r.p.salt.hash` | No `$`, which `.env` variable expansion would corrupt |
| T-10 | npm `overrides` pin `mariadb` 3.5.4 (under `@prisma/adapter-mariadb`) and `mysql2` 3.24.5 | Fixes published advisories in the versions Prisma 7.10 pins. The MySQL integration suite passes with the overrides. Remove them once Prisma ships fixed versions. The remaining `npm audit` item (`deepmerge-ts`) is inside the Prisma CLI's config loader, runs only at build/migrate time and only merges our own static config |
