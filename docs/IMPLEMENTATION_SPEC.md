# Psychology-Based Career Assessment Platform

## Coding-Agent Implementation Specification — v1.1

**Document type:** Product requirements + engineering implementation guide
**Source:** `Automated_Career_Assessment_BRD.pdf` (Initial Scope, Phase 1), plus `QUESTIONNAIRES_SOURCE_DATA.md` / `.json`
**Status:** Implementation baseline. Items marked **TBD / Client Approval Required** must be resolved before a *production* release. Each one now also has an **Engineering default** so the platform can be built, tested and deployed to a preview/staging environment while the client decides.
**Reference implementation:** `career-assessment-platform/` (Next.js full-stack app built to this spec).
**Location:** this file (`docs/IMPLEMENTATION_SPEC.md`) is the canonical copy and should be updated alongside code changes. The questionnaire source files it refers to are in `docs/source/`; the original v1.0 spec is in `docs/archive/`.

------------------------------------------------------------------------

## 0. Revision summary (v1.0 → v1.1)

v1.0 described *what* to build but left gaps that made it hard to implement and impossible to deploy as written. v1.1 makes these specific changes:

| # | Problem in v1.0 | Change in v1.1 | Section |
|---|---|---|---|
| 1 | No technology stack was chosen, so "deploy to Vercel or Hostinger" had no concrete meaning. | Adopted one full-stack TypeScript app (Next.js 16 App Router + Prisma 7). It runs as serverless functions on Vercel and as a normal Node.js server on Hostinger/VPS/Docker. | §7.0, §16 |
| 2 | The repository layout split `frontend/` and `backend/` (two deployments, CORS, two hosting bills) and used Python paths (`registry.py`). | One deployable app with strict internal module boundaries (`src/server/*` never imported by client code). | §15 |
| 3 | The repository layout contained `domain/assessments/psychology/`, a leftover fourth module that contradicts "the product name is not a fourth assessment". | Removed. Exactly three modules: `mbti_personality`, `holland_riasec`, `vark_learning_styles`. | §15 |
| 4 | The design assumed a durable queue and long-running workers. Vercel has neither, and shared Hostinger plans can't run a separate worker process. | Database-backed job table (outbox) processed by three triggers: inline `after()` right after the request, status polling, and a secret-protected cron endpoint. An optional in-process interval worker is available for long-running servers. | §7.3 |
| 5 | No database decision; Hostinger shared/cloud plans only provide MySQL. | PostgreSQL is primary (Neon/Supabase/VPS); MySQL 8 is supported for Hostinger plans. Same schema, provider chosen with `DATABASE_PROVIDER`. | §7.0, §8 |
| 6 | `assessment_definitions` / `assessment_versions` tables needed seeding and admin tooling just to hold content that is really versioned source material. | Questionnaires, scoring and interpretation packs are versioned **files in the repo** (reviewable, immutable per version). Every attempt snapshots the version identifiers it used. No seed step is needed to deploy. | §8, §10 |
| 7 | Consent was required but there was no consent table; there was no webhook-event dedupe store and no job idempotency key. | Added `consents`, `payment_events`, `jobs` (with unique `dedupe_key`), `report_blobs`, `rate_limits`. | §8 |
| 8 | States had no transition table; it was unclear when an attempt is `completed` or when payment is allowed. | Explicit transition table and payment-allowed states. | §5.2–5.4 |
| 9 | Student access control was only "an unguessable ID is not enough", with no mechanism. | Per-attempt secret access token (hash stored server-side, raw token in an httpOnly cookie) plus HMAC-signed, expiring report links for email/WhatsApp. | §11.1 |
| 10 | Admin authentication was unspecified. | Env-configured admin credentials (scrypt hash), signed httpOnly session cookie, login rate limiting, audit of every record view. | §11.2 |
| 11 | Modules could not be enabled until every TBD was resolved, so nothing could be demonstrated or deployed. | Approval gate: each assessment version carries an approval status. Production refuses unapproved versions unless `ALLOW_UNAPPROVED_ASSESSMENTS=true`, in which case the UI and PDF carry a visible "Preview — pending client validation" marker. | §6 FR-02a |
| 12 | Report content was blocked by missing interpretation text. | Interpretation text lives in versioned **content packs**. The repo ships a clearly labelled *draft* pack for client editing; reports state the pack version and draft status. | §10.3 |
| 13 | Scoring edge cases were undecided (MBTI ties, VARK Q1 display, back navigation). | Engineering defaults recorded and implemented behind configuration (MBTI tie → `X`, VARK Q1 shown but unscored, Q15 not rendered). | §10.1, §21 |
| 14 | Golden tests were only possible with client fixtures, so no scoring could be tested at all. | Two fixture tiers: *engineering fixtures* derived directly from the source key (run in CI now) and *client-approved fixtures* (launch blocker). | §13.2 |
| 15 | In-memory rate limiting and sessions don't work on serverless (each instance has its own memory). | DB-backed rate limits; stateless signed cookies. | §11 |
| 16 | No payment provider; the client is India-based (ISCHS workbook, INR). | Razorpay adapter (Orders API + Checkout + signed webhooks) as the Phase 1 provider; a `mock` adapter for non-production only. | §6 FR-05 |
| 17 | Configuration was listed by category only. | A full environment variable table and a validated `.env.example`. | §14 |
| 18 | No frontend/UX guidance beyond "usable on mobile". | Design system, accessibility target (WCAG 2.2 AA), and questionnaire interaction rules. | §17 |
| 19 | No deployment procedure. | Step-by-step for Vercel, Hostinger Node.js Web Apps, Hostinger VPS / Docker. | §16 |

------------------------------------------------------------------------

## 1. Mission and Product Outcome

Build a secure, web-based platform that lets a student select and complete one or more career-related assessments, pay according to the configured payment journey, receive a personalised PDF report after verified payment, and have their assessment record stored for administration and audit.

The Phase 1 product is named **Psychology-Based Career Assessment** and contains three assessment modules:

1. MBTI / Personality Type Identification (from `TEST 1 (PERSONALITY).pdf`) — id `mbti_personality`
2. Holland's Career Interest Inventory (RIASEC) (from `Holland's.pdf`) — id `holland_riasec`
3. VARK Learning Styles (from `Learning Style.pdf`) — id `vark_learning_styles`

The product name is not a separate fourth questionnaire. Refer to `QUESTIONNAIRES_SOURCE_DATA.md` for question text, answer options, source scoring details and unresolved items. `QUESTIONNAIRES_SOURCE_DATA.json` is the structured source the app's content files are generated from and tested against.

The system must digitise the approved questionnaires, apply each assessment's own authorised scoring method, validate scores against documented test cases, generate a report using the client-approved template, process payments, send reports through configured email and/or WhatsApp channels, and notify the owner/host of relevant events.

**Product principle:** Assessment results and career recommendations must be presented as different things. Do not imply that a personality or learning-style result is itself a definitive career recommendation.

## 2. Source Requirements vs. Engineering Recommendations

-   **BRD requirement** — explicitly required by the supplied document.
-   **Engineering recommendation** — an implementation choice that supports reliability, security, usability or maintainability but isn't prescribed by the BRD.
-   **TBD / Client Approval Required** — the coding agent must not invent a business rule, questionnaire, scoring formula, report interpretation or vendor credential *as if it were approved*.
-   **Engineering default (v1.1)** — a reversible, configurable placeholder adopted so the system can run before the client decides. Every engineering default is listed in the decision register (§21), is visible in configuration or versioned content, and is labelled in user-facing output where it affects results or interpretation.

If a decision depends on a client-supplied questionnaire, scoring methodology, report template, payment provider, WhatsApp Business integration, email provider or database requirement, create a configuration boundary and record the dependency. Do not silently substitute a generic or internet-sourced assessment.

## 3. Goals, Scope, and Non-Goals

### 3.1 Phase 1 goals

-   Provide a landing page and assessment-selection experience.
-   Deliver the three supplied assessment modules digitally, subject to client approval and scoring validation.
-   Save questionnaire responses and calculate results using the approved scoring rules for each assessment.
-   Validate scoring with documented fixtures and expected outputs.
-   Support payment either before the assessment starts or after completion to unlock the report.
-   Generate a personalised PDF report using the agreed template.
-   Release and send the report only after payment is verified.
-   Capture the student's email address and WhatsApp number as needed for delivery.
-   Deliver the report through the configured email and/or WhatsApp channel(s).
-   Notify the owner/host of configured assessment and payment events.
-   Persist student details, responses, scores, payment state, report metadata and timestamps for administration and record-keeping.
-   **(v1.1)** Be deployable without code changes to Vercel, Hostinger (Node.js Web Apps or VPS) or any Docker host.

### 3.2 Explicitly outside the confirmed Phase 1 scope

Don't treat these as committed requirements unless the client approves them:

-   AI-generated career counselling, or an LLM making independent career decisions.
-   A student/parent portal with accounts and passwords. (The minimum admin capability in §4.2 *is* in scope.)
-   Subscription plans, coupons, refunds, multi-currency support or multiple simultaneous payment providers.
-   School/enterprise tenancy, bulk imports, or integrations with student information systems.
-   Psychologist/counsellor appointment booking.
-   Mobile-native applications.
-   Normative comparisons against a population unless validated data and permission are supplied.
-   Any claim that an assessment diagnoses a mental-health condition or guarantees career success.
-   Multi-assessment bundles in a single payment (each attempt is paid separately in Phase 1).

## 4. Users and Permissions

### 4.1 Student / assessment taker

Can:
- View the landing page and assessment descriptions.
- Select an assessment and review its instructions and the privacy notice.
- Provide contact details and consent.
- Complete and submit an assessment, with progress saved on the server so a refresh doesn't lose answers.
- Pay according to the configured payment workflow.
- See a clear payment/report status.
- View an on-screen result summary and download the PDF once unlocked.
- Receive the report through the configured delivery channel(s).

Must not:
- Access another student's responses, results, payment records or report.
- Unlock a report by editing client-side state or calling a public endpoint with a forged payment status.

### 4.2 Owner / host / administrator

**Engineering default (v1.1):** a minimal, read-mostly admin area at `/admin`:
- Sign-in with credentials configured in environment variables (one or more admins).
- List attempts with filters (assessment, status, payment status, email search) and a "needs attention" count (failed jobs, failed deliveries, failed attempts).
- View an attempt: contact snapshot, consents, status timeline, result summary (no raw answers on screen), payments, report metadata, delivery/notification jobs, audit trail.
- Actions: retry a failed job, re-send the report to the student (new delivery jobs; never a new charge).
- Every admin view and action writes an audit event.

**TBD / Client Approval Required:** exports, edit capabilities, additional roles, retention/deletion workflow.

### 4.3 System / background worker

Responsible for scoring submitted responses, generating and storing report artifacts, verifying payment-provider events, sending email/WhatsApp messages, retrying transient failures safely, and recording audit events and delivery status. In v1.1 this is the job runner described in §7.3; it runs inside the same app.

## 5. Primary User Journey and State Model

### 5.1 Standard journey

1.  Student visits the landing page.
2.  Student selects one of the three assessment modules.
3.  Student reads the instructions, enters name, email and (optionally) WhatsApp number, and gives consent. The server creates the attempt and sets the attempt access cookie.
4.  The configured payment workflow is applied:
    -   **Pay upfront:** verified payment is required before the questionnaire becomes available; or
    -   **Pay after completion:** the student completes and submits the assessment, then pays to unlock the report.
5.  Student answers; answers are autosaved to the server.
6.  Student submits. The server validates the full answer set against the questionnaire version, freezes it (checksum), and queues scoring.
7.  The scoring job computes results with that assessment's scoring implementation.
8.  The report job renders the PDF from the stored result snapshot and stores it privately.
9.  The report stays locked until payment is verified.
10. Once payment is verified, the report is unlocked and delivery jobs are queued.
11. The system sends the report via the configured email and/or WhatsApp channel(s).
12. The system emits configured owner/host notifications from persisted events.
13. The student sees status, an on-screen summary and a download button; email/WhatsApp contain a signed, expiring link.

### 5.2 Explicit states

Server-side states only; the browser never decides workflow state.

**Assessment attempt:** `awaiting_payment` · `in_progress` · `submitted` · `scoring` · `scored` · `report_generating` · `report_ready_locked` · `report_unlocked` · `completed` · `cancelled` · `failed`

(v1.0 listed `created`. An attempt is created together with its contact/consent records in one transaction and starts directly in `awaiting_payment` or `in_progress`, so `created` is never persisted.)

**Payment:** `pending` · `succeeded` · `failed` · `cancelled` · `refunded` (reserved; refunds aren't implemented in Phase 1). An attempt with no payment row is "payment not required yet".

**Job / delivery:** `pending` · `running` · `succeeded` · `failed` (will retry) · `dead` (retries exhausted; visible to admins)

### 5.3 Attempt transition table

| From | To | Trigger | Guard |
|---|---|---|---|
| — | `awaiting_payment` | create attempt | workflow = upfront |
| — | `in_progress` | create attempt | workflow = post_completion |
| `awaiting_payment` | `in_progress` | payment verified | verified payment exists |
| `in_progress` | `submitted` | submit | valid, complete answer set; first submission only |
| `submitted` | `scoring` | scoring job claimed | — |
| `scoring` | `scored` | scoring succeeded | result row written |
| `scored` | `report_generating` | report job claimed | — |
| `report_generating` | `report_ready_locked` | PDF stored | no verified payment |
| `report_generating` | `report_unlocked` | PDF stored | verified payment exists |
| `report_ready_locked` | `report_unlocked` | payment verified | — |
| `report_unlocked` | `completed` | all student-facing deliveries sent, or no delivery channel enabled | — |
| `submitted` / `scoring` / `scored` / `report_generating` | `failed` | scoring or report job retries exhausted (or permanent error) | failure code recorded |
| `failed` | `submitted` / `scored` | admin retry | audit event |
| `awaiting_payment` / `in_progress` | `cancelled` | admin action (reserved) | — |

A delivery failure never moves the attempt backwards and never changes a verified payment.

### 5.4 State-transition rules

-   An attempt can be submitted only once. Re-sending the same `submissionKey` returns the original result (idempotent). Answer edits after submission are rejected.
-   Scoring uses the frozen response set; its checksum is stored on the attempt and copied into the result.
-   Report generation is idempotent per `(attempt, result, report template version)`.
-   `report_unlocked` requires a payment row with status `succeeded`, a provider-verified amount equal to the price snapshot on the attempt, and `verified_at` set.
-   **Payment is allowed** in `awaiting_payment` (upfront) and in `submitted`, `scoring`, `scored`, `report_generating`, `report_ready_locked` (post-completion). A student who pays while the report is still generating is unlocked automatically when it's ready.
-   Delivery jobs can be retried without charging again or generating a duplicate report.
-   Failed scoring/report generation is observable (`failed` + error code + dead job) and recoverable by admin retry.
-   If payment succeeds but report generation fails, the payment is kept and generation is retried; the student is never asked to pay again.
-   Duplicate payment webhooks, duplicate client verification calls and webhook/client races cannot create duplicate payments, unlock events or delivery jobs. The success transition is a guarded conditional update (`... WHERE status <> 'succeeded'`); only the caller that flips it queues follow-up jobs, and job `dedupe_key`s are unique.

## 6. Functional Requirements

### FR-01 — Landing page and assessment selection

**Requirement:** a web landing page where the user can select an assessment.

Acceptance criteria:
- The three Phase 1 modules are listed by their configured names.
- Each has a description, question count, estimated time, price and a start action.
- The page explains the next steps and the payment workflow that applies.
- Usable on desktop and mobile (320 px and up) without horizontal scrolling.
- A module that is disabled, or unapproved in production without the preview override, is shown as unavailable and can't be started; the API also refuses it.

**TBD:** brand identity, final copy, pricing, language, bundles. **Engineering default:** see §17 for design; prices come from environment configuration.

### FR-02 — Questionnaire delivery

**Requirement:** digitise all three supplied modules.

Acceptance criteria:
- Questions and options match the source text exactly. An automated test compares the app's content files with `QUESTIONNAIRES_SOURCE_DATA.json`.
- Required/optional status, response type (`single_choice`, `multi_select`, `boolean_checkbox`) and scored/unscored status are explicit per item.
- Progress is shown; validation errors name the unanswered items without losing valid answers.
- The server validates question IDs and answer values against the active questionnaire version.
- Each attempt records `assessment_version`, `questionnaire_version`, `scoring_version`, `report_template_version` and `interpretation_version`.
- The system doesn't invent, rewrite, reorder or omit items. Source typos are kept verbatim and listed in §21.

**Engineering defaults (v1.1):** no randomisation; source order; no time limit (per source); answers autosave; back navigation allowed (configurable per assessment version — the MBTI paper instructions say no going back, so this needs client confirmation); keyboard shortcuts for options.

### FR-02a — Approval gate (new in v1.1)

Each assessment version in the registry carries `approval.status` (`pending` | `approved`) and `approval.reference` (the client sign-off reference).
- `APP_ENV=production`: a module is available only if it's in `ENABLED_ASSESSMENTS` **and** approved, unless `ALLOW_UNAPPROVED_ASSESSMENTS=true`.
- Any environment: an unapproved module that is served shows "Preview — pending client validation" on its pages and on every page of its PDF.
- Approving a version is a reviewed code change (status + reference + date), not a database toggle, so approval is tied to exact content.

### FR-03 — Assessment scoring engine

**Requirement:** each assessment uses its own approved scoring method; scoring is reproducible and validated against expected outputs.

Acceptance criteria:
- Scoring is isolated by assessment type and version (`src/server/assessments/<module>/scoring.v1.ts`).
- It runs server-side as a pure, deterministic function.
- Invalid, missing, duplicated or out-of-range responses raise a structured `ScoringError`; nothing is guessed.
- Raw responses are stored separately from derived scores.
- Each result records `scoring_version` and the response checksum.
- Golden tests run in CI (§13.2).
- Scoring changes are new versions; historical attempts keep their original provenance.
- A failed scoring run is recorded as a failure.

The exact algorithms implemented from the source key are in §10.1. **Client approval is still required** for each algorithm and its engineering defaults (ties etc.).

### FR-04 — Personalised PDF report

**Requirement:** a personalised PDF with diagrams, scores, personality and learning profiles, career-related insights and interpretations, using the client-approved template.

Acceptance criteria:
- The report renders from the stored result snapshot plus a versioned template and content pack; it never re-scores.
- Measured results, interpretation and career-related insights are separate, titled sections. Career insights carry a "starting points for exploration, not a recommendation" statement.
- The report shows provenance: assessment, questionnaire, scoring, template and interpretation versions, the approval reference or "Preview" marker, and the report reference.
- Rendering is reproducible: the PDF creation date is set to the result's `scored_at`, so the same inputs give the same checksum.
- Generation failures are logged and retried.
- Reports aren't reachable through a predictable or unauthenticated URL.
- No report is delivered before the payment gate is satisfied.

**Engineering default (v1.1):** A4, `@react-pdf/renderer` (pure JavaScript, so it runs on serverless and shared hosting without Chromium), bundled Lexend fonts, vector charts (MBTI preference bars, RIASEC hexagon + bars with source bands, VARK bars). One report per attempt (per module).

### FR-05 — Payment gateway and payment timing

Acceptance criteria:
- Workflow is configurable globally (`PAYMENT_WORKFLOW`) and per assessment (`PAYMENT_WORKFLOW_<MODULE_ID>`). The workflow and price are snapshotted on the attempt at creation.
- Amount and currency come only from server configuration (`PRICE_<MODULE_ID>` in minor units, `CURRENCY`).
- **Engineering default provider: Razorpay.** The server creates an Order; the browser opens Razorpay Checkout; the server verifies the returned signature (HMAC-SHA256 of `order_id|payment_id` with the key secret) **and** fetches the order from the Razorpay API to confirm `status = paid` and the amount before marking success. The `order.paid` / `payment.captured` / `payment.failed` webhook is verified with `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with the webhook secret) and de-duplicated by `x-razorpay-event-id`.
- Client-side success callbacks are informational; only the verified paths above can mark a payment succeeded.
- Amount, currency, provider order/payment IDs, status and timestamps are persisted; card data never touches the server.
- Secrets live only in environment variables.
- `PAYMENT_PROVIDER=mock` exists for development and E2E tests and is **rejected at startup when `APP_ENV=production`**.

**TBD:** final provider confirmation, prices, tax/invoice (GST) needs, refund/chargeback policy, reconciliation.

### FR-06 — Email and WhatsApp report delivery

Acceptance criteria:
- Email is validated and lower-cased. WhatsApp numbers are parsed and normalised to E.164 (default region `IN`, configurable).
- The student is told which channels will be used. WhatsApp delivery requires a separate opt-in tick.
- Delivery jobs are queued only when the report is ready **and** payment is verified (whichever happens second queues them).
- Adapters: email `smtp` | `log` | `none`; WhatsApp `meta` (WhatsApp Cloud API, approved template) | `log` | `none`.
- Each delivery job records status, provider message ID, attempt count and last error code (redacted).
- Retries use bounded exponential backoff (5 attempts: 30 s, 2 min, 8 min, 32 min, 2 h cap). Permanent errors go to `dead` and appear in the admin "needs attention" list.
- `dedupe_key = deliver:<report_id>:<channel>:<purpose>` prevents duplicate logical sends; admin re-sends use a new purpose (`resend-<n>`).
- Email carries the PDF as an attachment (configurable) plus a signed link. WhatsApp sends an approved template whose parameters are the student's first name and the signed link.
- Report content never appears in logs.

**TBD:** email provider/sender domain, WhatsApp Business account, approved template text, attachment policy, fallback order.

### FR-07 — Owner/host event notifications

Event hooks: `assessment_started`, `assessment_submitted`, `scoring_completed`, `scoring_failed`, `payment_succeeded`, `payment_failed`, `report_generated`, `report_generation_failed`, `report_delivered`, `report_delivery_failed`.

- Destinations: `OWNER_NOTIFY_EMAILS`. Enabled events: `OWNER_NOTIFY_EVENTS` (engineering default: `payment_succeeded,scoring_failed,report_generation_failed,report_delivery_failed`).
- Notifications are jobs created from persisted events in the same transaction as the state change (outbox), with `dedupe_key = notify:<event>:<entity_id>`.
- A notification failure never rolls back an assessment or payment.
- Messages contain only the attempt reference, module name, event and timestamp (no student name, contact details, answers or scores).

### FR-08 — Student data management

Acceptance criteria:
- Every student, attempt, response, result, payment, report and job has a stable ID; records are linked with foreign keys.
- Timestamps are stored in UTC and rendered in `Asia/Kolkata` (configurable `DISPLAY_TIMEZONE`).
- Raw responses, results, payments and report metadata are separately queryable.
- Admin data access is authenticated and audited.
- **Engineering default:** contact details are snapshotted on the attempt (delivery uses the snapshot); the `students` row is created by email if missing and is never overwritten from public input.

**TBD:** retention period, deletion process, backups, export, data residency, applicable law (India's DPDP Act 2023 is the likely framework — legal review required).

### FR-09 — Status and error handling

- All long-running operations have persisted status; the attempt page polls a status endpoint and recovers after refresh.
- Submission and payment creation are idempotent, so refreshes and network retries don't create duplicates.
- API errors use one shape: `{ "error": { "code": "...", "message": "...", "reference": "<correlation id>" } }`.
- Logs are structured JSON with the correlation ID; personal data, answers, tokens and provider payloads are redacted.

## 7. Architecture

### 7.0 Technology stack (v1.1 decision)

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js ≥ 20.19 (22 LTS recommended) | Supported by Vercel and Hostinger Node.js hosting |
| Framework | Next.js 16 (App Router, TypeScript, Route Handlers) | One deployable unit for UI + API; native on Vercel; `next start` on any Node host; `output: standalone` for Docker |
| Styling | Tailwind CSS 4 with design tokens | Small CSS, consistent tokens |
| Validation | Zod 4 | Shared request/content schemas |
| ORM | Prisma 7 with driver adapters (`@prisma/adapter-pg`, `@prisma/adapter-mariadb`) | No native query-engine binary to ship, so it works on serverless and shared hosting; typed queries; migrations |
| Database | PostgreSQL 14+ (primary) or MySQL 8 (Hostinger shared/cloud) | Selected by `DATABASE_PROVIDER`; schema uses only portable types |
| PDF | `@react-pdf/renderer` | Pure JS, no headless browser |
| Report storage | Driver: `database` (default) / `filesystem` / `s3` (any S3-compatible: AWS, Cloudflare R2, Backblaze B2, MinIO) | `database` works everywhere with no extra service |
| Payments | Razorpay (Orders + Checkout + Webhooks) behind a `PaymentProvider` interface | INR, India-based client |
| Email | SMTP via Nodemailer (works with Hostinger Mail, Google Workspace, SES, Brevo, etc.) | Provider-neutral |
| WhatsApp | Meta WhatsApp Cloud API (template messages) | Official API, no BSP lock-in |
| Jobs | DB-backed job table + `after()` + cron endpoint + optional interval worker | Works without a separate worker process |
| Tests | Vitest (unit + integration against a real database) | Fast, TypeScript-native |

### 7.1 Logical components

1.  **Web frontend** (`src/app`, `src/components`) — landing, assessment pages, questionnaire runner, payment, status/results, admin UI. Treats all input as untrusted; holds no secrets.
2.  **Application API** (`src/app/api/v1/**`) — thin route handlers: parse with Zod, authorise, call services, map errors.
3.  **Assessment registry** (`src/server/assessments/registry.ts`) — maps module ID → active version → questionnaire content, validator, scorer, interpretation pack, approval.
4.  **Scoring module** (`src/server/assessments/<module>/scoring.v1.ts`) — pure functions, no I/O.
5.  **Payment adapter** (`src/server/payments/providers/*`) — `createOrder`, `verifyClientConfirmation`, `verifyWebhook`, `fetchOrderStatus`. No unlock logic in adapters.
6.  **Report service** (`src/server/reports/*`) — builds report data from the result snapshot and renders the template; storage drivers.
7.  **Notification/delivery** (`src/server/delivery/*`) — email/WhatsApp adapters, owner notifications.
8.  **Persistence** (`prisma/`, `src/server/db.ts`) — schema, migrations, client factory per provider.
9.  **Workflow/domain services** (`src/server/workflow/*`) — attempt state machine, payment success handling, unlock policy, job queue.
10. **Observability** (`src/server/observability/*`) — JSON logger with redaction, correlation IDs, health endpoints, metrics counters in logs.

### 7.2 Architectural rules

-   Scoring logic is independent of HTTP and UI code.
-   Payment-provider code is independent of report-unlock rules (`src/server/workflow/unlock.ts` is the only place that decides unlock).
-   Related state changes and the jobs they trigger are written in one database transaction (outbox).
-   Never trust a frontend-provided `paid`, `score`, `result`, `report_url`, `price` or `role`.
-   `src/server/**` modules import `server-only`, so accidentally importing them into client components fails the build.
-   Modular monolith; no microservices in Phase 1.

### 7.3 Background job processing on serverless and shared hosting (new)

`jobs` table columns: `kind`, `status`, `run_at`, `locked_until`, `attempts`, `max_attempts`, `dedupe_key` (unique), `last_error_code`, `last_error`, `provider_message_id`, `payload`.

Kinds: `score_attempt`, `generate_report`, `deliver_email`, `deliver_whatsapp`, `notify_owner`.

**Claiming** is a conditional update (`UPDATE … SET status='running', locked_until=now()+2m, attempts=attempts+1 WHERE id=? AND (status IN ('pending','failed') AND run_at<=now() OR status='running' AND locked_until<now())`). Only the caller that updates one row runs the job, so it's safe across many serverless instances and both database engines. Handlers are idempotent.

**Triggers:**
1. **Inline:** the request that enqueues jobs calls `after(() => runDueJobs({ attemptId }))`, so the happy path finishes seconds after the response (Vercel keeps the function alive via `waitUntil`; Node servers run it in-process).
2. **Status polling:** the student's status endpoint triggers the same runner for that attempt when due jobs exist (rate-limited), so retries progress while the student is waiting.
3. **Cron:** `GET /api/v1/cron/jobs` with `Authorization: Bearer <CRON_SECRET>` drains all due jobs and purges expired rate-limit rows. Vercel Cron calls it (Hobby plans allow once a day, Pro every minute). On Hostinger use hPanel Cron Jobs or any external cron (e.g. every 5 minutes).
4. **Optional interval worker:** `JOB_WORKER_INTERVAL_MS>0` starts an in-process loop from `instrumentation.ts` on long-running Node servers (VPS, Docker, Hostinger Node.js apps). Leave it at `0` on Vercel.

Retries: exponential backoff from 30 s, ×4 per attempt, capped at 2 h; `max_attempts=5`; then `dead`. Dead scoring/report jobs move the attempt to `failed`.

## 8. Data Model

Implemented in `prisma/schema.prisma` (PostgreSQL) and generated to `prisma/mysql/schema.prisma` (MySQL) by `npm run db:sync-mysql`. Status columns are validated strings (portable across engines); IDs are CUIDs; all timestamps are UTC.

| Table | Purpose | Key columns / constraints |
|---|---|---|
| `students` | Person record | `email` unique (lower-cased), `full_name`, `whatsapp_e164` |
| `consents` | Explicit consent records | `student_id`, `attempt_id`, `purpose` (`data_processing`, `age_or_guardian`, `email_delivery`, `whatsapp_delivery`), `granted`, `text_version`, `granted_at` |
| `attempts` | Assessment attempt (spec: `assessment_attempts`) | `public_ref` unique (support reference, e.g. `PBCA-7KQ4M9`), `assessment_id`, all version identifiers, `status`, `payment_workflow`, `price_amount`, `currency`, `access_token_hash`, contact snapshot, `deliver_email`, `deliver_whatsapp`, `submission_key` unique, `responses_checksum`, `paid_at`, `started_at`, `submitted_at`, `completed_at`, `failure_code`; index on `(status)`, `(created_at)`, `(assessment_id)` |
| `responses` | Raw answers (spec: `assessment_responses`) | unique `(attempt_id, question_id)`, `answer` JSON, `answered_at`; immutable after submission |
| `results` | Derived scores (spec: `assessment_results`) | `attempt_id` unique, `scoring_version`, `scores` JSON, `warnings` JSON, `responses_checksum`, `scored_at` |
| `payments` | Provider payments | `provider`, `provider_order_id` unique, `provider_payment_id` unique, `amount`, `currency`, `status`, `verified_at`, `failure_reason`; no card data |
| `payment_events` | Webhook de-duplication | unique `(provider, event_id)`, `event_type`, `processed_at` |
| `reports` | Report metadata | unique `(attempt_id, result_id, template_version)`, `interpretation_version`, `status`, `storage_driver`, `storage_key`, `checksum` (SHA-256), `byte_size`, `generated_at` |
| `report_blobs` | PDF bytes when `REPORT_STORAGE=database` | `report_id` PK, `data` bytes |
| `jobs` | Outbox / queue / delivery records (spec: `delivery_jobs`, generalised) | unique `dedupe_key`, `kind`, `channel`, `status`, `attempts`, `run_at`, `locked_until`, `provider_message_id`, `last_error_code`; index `(status, run_at)`, `(attempt_id)` |
| `audit_events` | Audit trail | `actor_type` (`system`, `student`, `admin`, `provider`), `actor_id`, `event_type`, `entity_type`, `entity_id`, `correlation_id`, redacted `metadata`; index `(entity_type, entity_id)` |
| `rate_limits` | Fixed-window counters | `key` PK (`bucket:subject:window`), `count`, `expires_at` |

Assessment definitions and versions live in code (`src/content/**`, `src/server/assessments/registry.ts`); attempts snapshot the version identifiers (rule 6 in §0).

## 9. API Contract (implemented)

All bodies are validated with Zod. Errors use the shape in FR-09. State-changing student and admin routes require a same-origin `Origin` header (CSRF defence) and are rate-limited.

### Public/student routes

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/v1/assessments` | public | Active modules + safe metadata (price, counts, availability) |
| `GET /api/v1/assessments/{id}` | public | Questionnaire (items, options, instructions) — never scoring keys |
| `POST /api/v1/attempts` | public, rate-limited | Create attempt with contact + consents; sets attempt cookie |
| `GET /api/v1/attempts/{id}` | attempt cookie | Status, saved answers (while in progress), payment and report state |
| `PUT /api/v1/attempts/{id}/responses` | attempt cookie | Autosave answers (only in `in_progress`) |
| `POST /api/v1/attempts/{id}/submit` | attempt cookie | Validate, freeze, queue scoring; idempotent by `submissionKey` |
| `POST /api/v1/attempts/{id}/payment-session` | attempt cookie | Create (or reuse) a provider order for the server-side price |
| `POST /api/v1/attempts/{id}/payment-confirmation` | attempt cookie | Verify the Checkout signature and provider order status |
| `POST /api/v1/attempts/{id}/payment-mock` | attempt cookie, non-production only | Simulate success/failure through the same domain path |
| `GET /api/v1/attempts/{id}/report-status` | attempt cookie | Report + delivery status only |
| `GET /api/v1/reports/{reportId}/download` | attempt cookie **or** signed `token` | Streams the PDF after re-checking the unlock rule |

### Provider and system routes

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/webhooks/payments/razorpay` | HMAC signature | Verify, de-duplicate, process idempotently |
| `GET /api/v1/cron/jobs` | `Bearer CRON_SECRET` | Drain due jobs, purge expired rate limits |
| `GET /api/health` | public | Liveness (no dependencies) |
| `GET /api/health/ready` | public | Readiness (database round-trip, configuration sanity) |

### Admin routes

| Method & path | Purpose |
|---|---|
| `POST /api/v1/admin/session` / `DELETE` | Sign in / out (rate-limited) |
| `GET /api/v1/admin/attempts` | Filtered list (paginated) |
| `GET /api/v1/admin/attempts/{id}` | Full operational record (audited) |
| `POST /api/v1/admin/jobs/{jobId}/retry` | Retry a failed/dead job (audited) |
| `POST /api/v1/admin/attempts/{id}/resend` | Queue a fresh delivery of the existing report (audited) |

## 10. Scoring and Report Data Contracts

All scorers implement:

```ts
interface Scorer<TScores> {
  scoringVersion: string;
  score(input: { questionnaire: Questionnaire; responses: Record<string, Answer> }): ScoringOutput<TScores>; // throws ScoringError
}
```

Each module has its own result schema (Zod) behind this common interface.

### 10.1 Scoring rules implemented from the source key (client approval still required)

**MBTI / Personality (`mbti-scoring-1.0.0`)**
- Input: 70 answers, each `a` or `b`; all required.
- Group *g* (1–7) = questions where `(n − 1) mod 7 = g − 1` (matches the source table).
- E = count(a in g1), I = count(b in g1); S = a(g2)+a(g3), N = b(g2)+b(g3); T = a(g4)+a(g5), F = b(g4)+b(g5); J = a(g6)+a(g7), P = b(g6)+b(g7).
- Each letter is the larger of its pair. **Engineering default for ties** (5–5 on E/I, 10–10 on the others; the source doesn't cover this): the position is reported as `X` and the report says "balanced". Client decision required.
- Output: type code, per-pair counts, per-group a/b tallies, tie list.

**Holland RIASEC (`riasec-scoring-1.0.0`)**
- Input: 72 booleans (12 per category); unticked = `false`.
- Category score = number of ticked statements (0–12). Band from source: High 9–12, Mid 5–8, Low 0–4.
- Output: scores, bands, dense ranking (ties share a rank). No three-letter code is produced, because the source defines none; offering one is a client decision.

**VARK (`vark-scoring-1.0.0`)**
- Input: Q1–Q14, each one or more option keys (multi-select permitted by the source); at least one per question.
- Q1 is shown and answered but **unscored** (no key in the source chart). Source item 15 ("Ignore question 1.") is not rendered.
- Each selected option adds 1 to its V/A/R/K category from the source chart.
- Output: counts, total scored selections, highest preference(s) (all categories tied at the maximum). No thresholds or "multimodal" bands, because the source supplies none.

### 10.2 Report-generation input

The report service receives approved display fields (student name, report date, reference), assessment name and versions, the validated result snapshot, the interpretation pack, template version and branding, and the disclaimers/provenance block. The renderer never recalculates scores.

### 10.3 Interpretation content packs (new)

`src/content/interpretations/<module>.ts` exports `{ version, status: 'draft' | 'approved', approvalReference?, sections }`. The repo ships `0.1.0-draft` packs written by engineering in neutral, non-clinical language:
- MBTI: a description of each of the eight preference poles. **No type-to-career mapping**, per the source data note.
- RIASEC: what each interest area describes, plus example fields to explore (labelled as exploration starting points).
- VARK: what each mode describes and study strategies.

While a pack is `draft`, the PDF provenance block says "Interpretive text: draft pending client approval", and production activation follows the approval gate. The client edits the pack (or supplies their own text) and marks it approved with a reference.

## 11. Security, Privacy, and Responsible Presentation

-   HTTPS in production (Vercel/Hostinger TLS); HSTS header set.
-   Secrets only in environment variables; startup validation fails fast on missing or weak secrets (`SESSION_SECRET`, `REPORT_LINK_SECRET` ≥ 32 chars).
-   Least-privilege database user (DDL only for migrations if the host allows separate users).
-   Reports in private storage only; downloads stream through the app after authorisation.
-   Role-based admin access; every admin read/action is audited.
-   Payment webhooks verified with HMAC over the raw body (constant-time compare), de-duplicated by event ID.
-   Email/phone validated and normalised; consent recorded per purpose with a text version.
-   Logs redact emails, phones, names, tokens, answers and provider payloads.
-   Rate limits on all public endpoints (DB-backed so they work across serverless instances).
-   Security headers: CSP (allowing only Razorpay Checkout origins as third parties), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'`.
-   User-facing copy says results describe preferences, aren't diagnoses and don't guarantee career fit or success.
-   Confirm the client's authority/licensing for every questionnaire, scoring system and interpretation before launch. The source PDFs carry Indian School of Counselling and Healing Studies (ISCHS) copyright notices, and "MBTI" is a registered trademark of The Myers-Briggs Company, so the module's public name needs legal confirmation.

### 11.1 Student access (new)

- On attempt creation the server generates a 256-bit random token, stores `SHA-256(token)` on the attempt and sets it in an httpOnly, `SameSite=Lax`, `Secure` (production) cookie scoped to that attempt (30-day lifetime). Every student route compares hashes in constant time.
- Email/WhatsApp links use `token = base64url(reportId.expiry).HMAC-SHA256(REPORT_LINK_SECRET)` with `REPORT_LINK_TTL_HOURS` (default 168). The download route re-checks the unlock rule on every request.
- Attempt IDs are CUIDs; knowing one grants nothing without the cookie or a valid signature.

### 11.2 Admin access (new)

- `ADMIN_USERS` = comma-separated `email:scrypt-hash` pairs (generate a hash with `npm run admin:hash-password`).
- The session is an HMAC-signed cookie (`SESSION_SECRET`), httpOnly, `SameSite=Strict`, 8-hour expiry.
- Login is limited to 5 attempts per 15 minutes per IP and per email; failures are audited without the password.

**TBD / Client Approval Required:** jurisdiction and privacy obligations (DPDP Act 2023), minors and parental consent, the privacy notice text, retention, data residency, access/deletion handling. **Engineering default:** a required tick confirming "I am 18 or older, or my parent/guardian has agreed to me taking this assessment".

## 12. Reliability and Observability

- Structured JSON logs (`LOG_LEVEL`) with `x-request-id` correlation IDs returned to clients as the error `reference`.
- Counters are logged as `metric` events (attempt started/submitted, scoring ok/fail, report ok/fail, payment ok/fail, delivery ok/fail, retries), so any log drain (Vercel, Better Stack, Axiom, Loki) can chart them.
- `GET /api/health` (liveness) and `GET /api/health/ready` (database + config).
- Optional error tracking: `ERROR_WEBHOOK_URL` receives redacted error events (Slack/Discord-compatible JSON).
- Bounded retry with exponential backoff; dead-letter status visible in admin.
- Idempotent handlers (§5.4, §7.3).
- Backups: managed Postgres point-in-time recovery (Neon/Supabase) or daily `pg_dump`/`mysqldump` on VPS/Hostinger (hPanel backups). With `REPORT_STORAGE=database`, reports are included in database backups.
- A payment success is never lost because email/WhatsApp is down; a delivery failure never changes a verified payment.

## 13. Testing Strategy and Definition of Done

### 13.1 Unit tests (Vitest)
Scoring (each module), response validation, interpretation mapping, state transitions, unlock policy, Razorpay signature verification, signed report tokens, attempt-token hashing, rate-limit window maths, contact normalisation, log redaction, content-fidelity (app content = source JSON).

### 13.2 Golden scoring tests — launch blocker

Two tiers:
1. **Engineering fixtures** (`tests/fixtures/golden/*.json`), derived by hand from the source answer key: all-`a`, all-`b`, mixed vectors, every tie boundary, RIASEC band edges (4/5, 8/9, 0, 12), VARK multi-select and Q1-ignored cases. Labelled `"approval": "engineering"`. They prove the code matches the transcribed key; they **don't** prove the key is right.
2. **Client-approved fixtures**, same format with `"approval": "client:<reference>"`. Required for production sign-off. The test suite runs every fixture file in the folder.

### 13.3 Integration tests
Against a real disposable database (`TEST_DATABASE_URL`; PostgreSQL by default, MySQL with `TEST_DATABASE_PROVIDER=mysql`): attempt lifecycle, idempotent submit, duplicate/out-of-order payment confirmation and webhook, report generation + checksum reproducibility, unlock enforcement on download, job retry/backoff/dead, delivery dedupe, audit rows.

### 13.4 End-to-end tests
Scripted HTTP flows against a running app with `PAYMENT_PROVIDER=mock`, `EMAIL_PROVIDER=log`, `WHATSAPP_PROVIDER=log`: upfront and post-completion journeys, payment failure then retry, forced report failure then recovery, unauthorised access denied. Razorpay sandbox verification is a manual release step (test keys + webhook to a staging URL).

### 13.5 Definition of Done for Phase 1

A feature is complete only when requirements and acceptance criteria are implemented, automated tests pass, error paths and transitions are covered, security-sensitive operations are server-enforced, logs and status support operations, configuration/deployment are documented, no credentials or real personal data are committed, and client-dependent content is approved and versioned.

**Phase 1 launch blockers:**
1. Approved and licensed questionnaire content for all three modules.
2. Approved scoring methods (including tie rules) and client-approved golden fixtures for all three modules.
3. Approved report template and interpretation/career-insight content (replacing or approving the draft packs).
4. Live Razorpay keys, verified webhook on the production URL, and a successful live ₹1 test.
5. Configured email (SPF/DKIM on the sender domain) and WhatsApp Business template approved by Meta.
6. Approved privacy notice, consent wording, retention and deletion decisions.
7. End-to-end proof (test evidence retained) that reports can't be unlocked before verified payment.

## 14. Configuration and Environment

Commit only `.env.example`. All variables are validated at startup (`src/server/config.ts`); production refuses to start with unsafe values.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `APP_ENV` | yes | `development` | `development` / `staging` / `production` |
| `APP_URL` | yes | — | Public base URL, used for links and origin checks |
| `DATABASE_PROVIDER` | yes | `postgresql` | `postgresql` or `mysql` |
| `DATABASE_URL` | yes | — | Pooled/runtime connection string |
| `DATABASE_URL_UNPOOLED` | no | — | Direct connection for migrations (Neon/Supabase) |
| `DATABASE_POOL_MAX` | no | `5` | Connections per server instance (use 3 on shared MySQL) |
| `SESSION_SECRET` | yes | — | ≥ 32 random characters |
| `REPORT_LINK_SECRET` | yes | — | ≥ 32 random characters |
| `REPORT_LINK_TTL_HOURS` | no | `168` | Signed link lifetime |
| `CRON_SECRET` | prod | — | Bearer token for the cron endpoint |
| `ENABLED_ASSESSMENTS` | no | all three | Comma-separated module IDs |
| `ALLOW_UNAPPROVED_ASSESSMENTS` | no | `false` | Preview override in production (adds visible markers) |
| `PAYMENT_PROVIDER` | yes | `mock` | `razorpay` or `mock` (mock is rejected in production) |
| `PAYMENT_WORKFLOW` | no | `post_completion` | or `upfront` |
| `PAYMENT_WORKFLOW_<MODULE_ID>` | no | — | Per-module override, e.g. `PAYMENT_WORKFLOW_HOLLAND_RIASEC` |
| `CURRENCY` | no | `INR` | ISO 4217 |
| `PRICE_<MODULE_ID>` | yes | — | Minor units (paise), e.g. `PRICE_MBTI_PERSONALITY=49900` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | if razorpay | — | From the Razorpay dashboard |
| `EMAIL_PROVIDER` | no | `log` | `smtp` / `log` / `none` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | if smtp | — | e.g. Hostinger: `smtp.hostinger.com`, 465, true |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | if smtp | — | Sender identity |
| `EMAIL_ATTACH_PDF` | no | `true` | Attach the PDF as well as the link |
| `WHATSAPP_PROVIDER` | no | `log` | `meta` / `log` / `none` |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | if meta | — | Meta Cloud API |
| `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` | if meta | `report_ready` / `en` | Approved template with 2 body params |
| `DEFAULT_PHONE_REGION` | no | `IN` | For parsing local numbers |
| `OWNER_NOTIFY_EMAILS` | no | — | Comma-separated |
| `OWNER_NOTIFY_EVENTS` | no | see FR-07 | Comma-separated event names |
| `REPORT_STORAGE` | no | `database` | `database` / `filesystem` / `s3` |
| `REPORT_STORAGE_DIR` | if filesystem | `./storage/reports` | Outside `public/` |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | if s3 | — | Private bucket |
| `ADMIN_USERS` | prod | — | `email:scrypt.16384.8.1.<salt>.<hash>` pairs (no `$`, so `.env` expansion is safe) |
| `JOB_WORKER_INTERVAL_MS` | no | `0` | > 0 enables the in-process worker (non-Vercel) |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |
| `ERROR_WEBHOOK_URL` | no | — | Redacted error events |
| `DISPLAY_TIMEZONE` | no | `Asia/Kolkata` | Rendering only |
| `NEXT_PUBLIC_ORG_NAME` / `SUPPORT_EMAIL` | no | — | Branding and support contact |

## 15. Repository Structure (implemented)

```text
career-assessment-platform/
  README.md                     # quick start
  .env.example
  docs/
    IMPLEMENTATION_SPEC.md      # copy of this spec
    DEPLOYMENT.md               # Vercel / Hostinger / Docker
    DECISIONS.md                # decision register with engineering defaults
    OPERATIONS.md               # admin, retries, backups, incidents
    source/                     # questionnaire source data (read-only)
    archive/                    # v1.0 spec
  prisma/
    schema.prisma               # PostgreSQL (source of truth)
    migrations/                 # PostgreSQL migrations
    mysql/schema.prisma         # generated MySQL variant
    mysql/migrations/           # MySQL migrations
  prisma.config.ts              # selects schema/migrations by DATABASE_PROVIDER
  assets/fonts/                 # PDF fonts (OFL)
  src/
    app/                        # pages + route handlers (UI and API)
    components/                 # UI components (client/server)
    content/
      questionnaires/           # versioned questionnaire JSON (generated from source, tested)
      interpretations/          # versioned interpretation packs
    server/                     # server-only code
      config.ts  db.ts
      assessments/              # registry + mbti/ riasec/ vark/ (validation + scoring)
      workflow/                 # state machine, unlock, payments domain, jobs
      payments/                 # provider adapters
      reports/                  # PDF template, charts, storage drivers
      delivery/                 # email, WhatsApp, owner notifications
      security/                 # tokens, admin auth, rate limit, origin checks
      observability/            # logger, correlation IDs
    lib/                        # shared, isomorphic helpers (formatting, types)
  scripts/                      # content generation, MySQL schema sync, password hashing
  tests/
    unit/  integration/  fixtures/golden/
  scripts/e2e.mjs               # HTTP end-to-end smoke test against any deployment
  Dockerfile  docker-compose.yml  vercel.json
```

## 16. Deployment (new)

Full steps are in `docs/DEPLOYMENT.md`. Summary:

**Vercel**
1. Import the repo; framework Next.js; Node 22.
2. Add Postgres (Neon via the Vercel Marketplace) → `DATABASE_URL`, `DATABASE_URL_UNPOOLED`.
3. Set the env vars from §14 (`APP_ENV=production`, secrets, prices, Razorpay, SMTP).
4. The build runs `vercel-build` = `prisma generate && prisma migrate deploy && next build`.
5. `vercel.json` registers the daily cron (Hobby). On Pro, change it to `*/5 * * * *`, or point an external cron at `/api/v1/cron/jobs`.
6. Keep `REPORT_STORAGE=database` or use `s3` (Cloudflare R2). The local filesystem is not persistent on Vercel.
7. Add the Razorpay webhook at `https://<domain>/api/v1/webhooks/payments/razorpay` (events `order.paid`, `payment.captured`, `payment.failed`).

**Hostinger — Node.js Web Apps (Business / Cloud plans)**
1. hPanel → Websites → Add → Node.js App → import from GitHub (or upload the zip); Node 22.
2. Database: hPanel → MySQL Databases → create → `DATABASE_PROVIDER=mysql`, `DATABASE_URL=mysql://user:pass@host:3306/db`. Or use external Postgres (Neon) with `DATABASE_PROVIDER=postgresql`.
3. Build command `npm run build:prod`; start command `npm run start` (if the panel doesn't allow a custom build command, use start command `npm run start:prod`, which runs migrations first).
4. Set environment variables in the app's settings. `REPORT_STORAGE=database` (or `filesystem` with a persistent directory).
5. Jobs: set `JOB_WORKER_INTERVAL_MS=30000`, and/or add an hPanel Cron Job: `curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://<domain>/api/v1/cron/jobs` every 5 minutes.
6. Email: a Hostinger mailbox works with `smtp.hostinger.com:465`.

**Hostinger VPS / any Docker host**
`docker compose up -d --build` starts Postgres, the app (standalone Next.js build, migrations on start) and Caddy for automatic HTTPS. Set the domain in `.env`.

## 17. Frontend Experience and Design System (new)

- **Audience:** students (about 14–22) and the parents who pay. **Primary job:** pick an assessment, answer honestly without stress, pay, get a report they trust.
- **Tone:** calm, plain-spoken, non-clinical; "there are no right answers" is repeated where it matters.
- **Typography:** Lexend, a typeface family designed around reading-proficiency research. Its wider cuts (Exa, Mega) are used for display moments such as headings and result codes; body text uses standard Lexend. Line length is under 75 characters.
- **Colour tokens:** Ink `#17213A`, Mist (page) `#EEF1F5`, Paper (surface) `#FFFFFF`, Rule `#D5DBE4`, Marigold accent `#E9A23B` (decorative highlights, progress), Data blue `#2A62C9` (chart marks), Slate (secondary text) `#4A5468`. Status colours are reserved for status and always paired with an icon + label.
- **Signature element:** the Holland hexagon (the characteristic diagram of interest theory) as the brand mark and the landing hero, drawn in once on load (skipped with `prefers-reduced-motion`).
- **Questionnaire runner:** one item per screen for MBTI/VARK with large answer targets (≥ 48 px), keyboard shortcuts (A/B, 1–4), auto-advance for single choice, autosave indicator, progress bar and count. RIASEC shows one category per step as tick-boxes grouped by "Are you / Can you / Like to", matching the source layout.
- **Charts:** one series per chart in Data blue; labels on every bar; text in ink tokens, never series colour; a table equivalent for screen readers.
- **Accessibility target:** WCAG 2.2 AA — visible focus, labelled controls, error text linked to fields, 4.5:1 text contrast, works at 320 px and 200% zoom.

## 18. Implementation Plan (milestones)

Implement in vertical slices, keeping the app runnable at each milestone. v1.1 status in brackets refers to the reference implementation.

- **M0 — Inspection & decision log.** Exit: plan + `docs/DECISIONS.md`. [done]
- **M1 — Domain model & workflow.** Schema, migrations (PG + MySQL), state machine, ownership checks, tests. [done]
- **M2 — Registry & questionnaire UI/API.** Versioned content generated from source JSON, fidelity test, autosave, submit/freeze. [done]
- **M3 — Scoring & golden tests.** Three scorers, engineering fixtures. Exit for production: client fixtures pass. [engineering tier done; client tier blocked]
- **M4 — Payment & access gate.** Razorpay adapter, webhook, mock provider, unlock enforcement tests. [done; Razorpay sandbox verification is a manual release step]
- **M5 — PDF report.** Template, charts, storage drivers, reproducible checksum. [done with draft content; client template approval blocked]
- **M6 — Email, WhatsApp, owner notifications.** Adapters, consent checks, dedupe, retry. [done; live provider verification blocked on credentials]
- **M7 — Admin, security, observability.** [done]
- **M8 — Release readiness.** All launch blockers in §13.5 closed. [blocked on client]

**Verification evidence for the reference implementation (v1.1):**
- 62 unit tests (`npm test`).
- Integration tests (`npm run test:integration`): the 11-test lifecycle suite passed against both PostgreSQL 17 and MySQL 8.4, and a delivery test performs a real SMTP round trip to a local mail sink and checks the exact WhatsApp Cloud API request.
- A 34-check HTTP end-to-end suite (`npm run test:e2e`) passed against both the `next start` server and the standalone (Docker) build.
- A browser walkthrough of all three questionnaires.
- Clean `next build`, `tsc` and ESLint runs.

Razorpay and WhatsApp are verified against signature fixtures and request shapes, not against live sandboxes. Live sandbox verification of Razorpay, the production SMTP account and Meta remains a release step (rule 11).

## 19. Coding-Agent Working Rules

1.  **Inspect first.** Read the repository and current tests before changing code.
2.  **Don't fabricate business logic.** Missing questionnaires, scoring rules, report copy, prices or provider details are blockers requiring a documented question, a configurable stub or a *labelled* engineering default.
3.  **Preserve traceability.** Map every BRD requirement to code, tests and acceptance evidence.
4.  **Prefer small, testable changes.**
5.  **Keep secrets out of code.**
6.  **Treat the client and providers as untrusted boundaries.**
7.  **Enforce invariants on the server.**
8.  **Make asynchronous work recoverable.**
9.  **Version assessment logic.** Never silently change the scoring semantics of an existing attempt.
10. **Don't claim tests passed without running them.** Report the exact commands and results.
11. **Don't mark integrations complete when only mocked.** Distinguish mock, sandbox and production verification.
12. **Document trade-offs and decisions** in `docs/DECISIONS.md`.
13. **Don't expand Phase 1 silently.**
14. **Protect personal data.** Synthetic test data only.
15. **Keep the product usable.**
16. **(v1.1) Keep the app host-portable.** No dependency on a host-specific API in domain code; anything host-specific (cron, storage, workers) sits behind configuration.

## 20. Requirement Traceability Matrix

| ID | Requirement | Primary component (v1.1) | Minimum evidence |
|---|---|---|---|
| FR-01 | Landing & selection | `src/app/page.tsx`, `GET /api/v1/assessments` | Availability tests, UI review |
| FR-02 | Three questionnaires | `src/content/questionnaires`, `server/assessments/validate.ts`, `components/attempt/*Runner.tsx` | Content-fidelity test, validation tests |
| FR-02a | Approval gate | `assessments/registry.ts`, `config.ts` | Availability tests per environment |
| FR-03 | Reproducible scoring | `assessments/*/scoring.v1.ts` | Golden fixtures (engineering + client) |
| FR-04 | PDF report | `server/reports/*` | Checksum reproducibility test, template review |
| FR-05 | Payments | `server/payments/*`, `workflow/payments.ts`, `workflow/unlock.ts` | Signature tests, idempotency integration tests, sandbox run |
| FR-06 | Delivery | `server/delivery/*`, `workflow/jobs.ts` | Dedupe/retry tests, sandbox send |
| FR-07 | Owner notifications | `server/workflow/queue.ts` (`emitOwnerEvent`), `server/delivery/messages.ts` | Event-to-job assertions in integration tests |
| FR-08 | Data management | `prisma/schema.prisma`, admin | Schema, access-control, audit tests |
| FR-09 | Status & recovery | status API, job runner, error mapper | Failure-path tests |

## 21. Client Decisions Required Before Production

The live register with owners and dates is `docs/DECISIONS.md`.

| Decision | Why it matters | Engineering default (v1.1) |
|---|---|---|
| Final approved questionnaires | Determines items and validation | Verbatim source transcription, typos kept (Q7 "chose", Q33 "gentles", Q36 "tied", Q40 "rules your more", RIASEC "Yourself") |
| Scoring rules + licensing | Correct, lawful scoring | Source key implemented as in §10.1 |
| MBTI tie rule | Ties are possible on every pair | `X` + "balanced" |
| MBTI back navigation | Source paper says no going back | Back allowed (configurable) |
| VARK Q1 presentation | Q1 has no key; Q15 says ignore Q1 | Shown, required, unscored; Q15 not rendered |
| RIASEC 3-letter code | Not defined in source | Not produced; ranked list shown |
| Golden fixtures | Proves scoring accuracy | Engineering fixtures only |
| Report template + interpretations | Required for final PDF | Draft content packs, labelled |
| Career insights definition | Prevents misleading conclusions | RIASEC example fields only; none from MBTI type |
| Payment provider, prices, workflow | Checkout and webhook | Razorpay; placeholder prices; post-completion |
| GST invoice / receipts | Tax compliance | Razorpay receipt only |
| Email provider + sender | Delivery adapter | SMTP |
| WhatsApp provider, template, opt-in | Compliant messaging | Meta Cloud API, `report_ready` template, separate opt-in |
| Contact fields + consent language | Data collection | Name, email, optional WhatsApp; 3 consents |
| Minors / guardian consent | Safeguarding | Required self/guardian confirmation tick |
| Database, residency, retention | Persistence & legal | Postgres or MySQL; retention TBD (no auto-deletion yet) |
| Admin access & reporting | Operational UI | Minimal admin (§4.2), no export |
| Hosting, domain, monitoring, backups | Operations | Vercel / Hostinger / Docker documented |
| Product naming ("MBTI") | Trademark | Uses the configured name; legal check required |
| Brand, languages, accessibility | Presentation | §17; English; WCAG 2.2 AA |

## 22. Final Product Acceptance Checklist

-   [ ] All three modules are available and versioned.
-   [ ] Questionnaire content matches client-approved source material.
-   [ ] Each assessment uses its own authorised scoring method.
-   [ ] Golden scoring tests (client tier) pass; evidence retained.
-   [ ] Assessment results and career recommendations are clearly distinguished.
-   [ ] PDF reports match the approved template; draft content packs replaced or approved.
-   [ ] Both payment workflows behave as configured.
-   [ ] Only verified payment can unlock a report.
-   [ ] Payment webhooks are verified and idempotent (tested on the production URL).
-   [ ] Student records, responses, results, payments, reports and timestamps are stored correctly.
-   [ ] Reports are stored privately and access-controlled.
-   [ ] Email/WhatsApp delivery is consent-aware, retryable and observable.
-   [ ] Owner notifications fire for the approved events.
-   [ ] Duplicate submissions, webhooks and delivery retries are handled safely.
-   [ ] Failure states are recoverable and visible to operations.
-   [ ] Privacy, retention, access and deletion decisions are approved.
-   [ ] Deployment, secrets, migrations, monitoring and backups are documented and tested.
-   [ ] `ALLOW_UNAPPROVED_ASSESSMENTS` is `false` in production.
-   [ ] No unresolved client-dependent launch blocker is represented as complete.

------------------------------------------------------------------------

## Appendix A — BRD Requirements Preserved

The supplied BRD's initial scope requires:
- A web application/landing page for MBTI/personality, Holland RIASEC and VARK Learning Styles. The product/app name is Psychology-Based Career Assessment.
- Questionnaire delivery and approved scoring methodologies.
- Personalised PDF reporting with diagrams, scores, personality and learning profiles, career insights and detailed interpretations using a supplied template.
- Payment before the assessment or after completion to unlock the report.
- Email and WhatsApp number capture, report delivery after verified payment, and owner/host event notifications.
- Secure storage of student details, responses, scores, payment status, reports and timestamps.
- Phase 1 implementation of questionnaires/scoring, scoring validation, report generation, payment, email/WhatsApp, database and event triggers.
- Reproducible verified scores, approved-format reports, secure payment processing, payment-gated report release, and documented scoring test cases before launch.
- Client provision/approval of questionnaires, scoring rules, report template, payment credentials, WhatsApp Business integration, email service and database requirements.
- Separate approved scoring methods per assessment and a clear distinction between assessment results and career recommendations.

## Appendix B — Questionnaire Source Data Supplied After the BRD

The owner has supplied three questionnaire PDFs and clarified that **Psychology-Based Career Assessment** is the product name, not a separate assessment. The implementation therefore models three modules: MBTI/personality, Holland RIASEC and VARK Learning Styles.

`QUESTIONNAIRES_SOURCE_DATA.md` has the complete transcription, answer options, source-derived scoring information and unresolved content issues. `QUESTIONNAIRES_SOURCE_DATA.json` is the structured source; `scripts/generate-content.mjs` builds the app's versioned questionnaire files from it, and a test fails if the two ever diverge. Don't retype questions from memory or silently modify the text.

**Before production:** confirm permission to digitise/reproduce the supplied workbook material. Block production scoring for MBTI until approved expected-output fixtures confirm the implementation (including ties). Confirm the RIASEC "Yourself" statement and the point-per-check interpretation. Treat VARK Q1 as unscored and Q15 as instruction-only unless the client provides an approved correction/key.
