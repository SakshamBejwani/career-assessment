# Psychology-Based Career Assessment Platform

## Coding-Agent Implementation Specification

**Document type:** Product requirements + engineering implementation
guide\
**Source:** `Automated_Career_Assessment_BRD.pdf` (Initial Scope, Phase
1)\
**Status:** Implementation baseline; items marked **TBD / Client
Approval Required** must be resolved before production release.

------------------------------------------------------------------------

## 1. Mission and Product Outcome

Build a secure, web-based platform that lets a student select and
complete one or more career-related assessments, pays according to the
configured payment journey, receives a personalised PDF report after
verified payment, and has their assessment record stored for
administration and audit.

The Phase 1 product is named **Psychology-Based Career Assessment** and contains three assessment modules:

1. MBTI / Personality Type Identification (from `TEST 1 (PERSONALITY).pdf`)
2. Holland's Career Interest Inventory (RIASEC)
3. VARK Learning Styles (from `Learning Style.pdf`)

The product name is not a separate fourth questionnaire. Refer to `QUESTIONNAIRES_SOURCE_DATA.md` for question text, answer options, scoring details present in the source PDFs, and unresolved items. `QUESTIONNAIRES_SOURCE_DATA.json` contains structured questionnaire data for configuration/seeding.

The system must digitise the approved questionnaires, apply each
assessment's own authorised scoring method, validate scores against
documented test cases, generate a report using the client-approved
template, process payments, send reports through configured email and/or
WhatsApp channels, and notify the owner/host of relevant events.

**Product principle:** Assessment results and career recommendations
must be presented as different things. Do not imply that a personality
or learning-style result is itself a definitive career recommendation.

## 2. Source Requirements vs. Engineering Recommendations

This specification preserves the requirements stated in the BRD and adds
implementation guidance so a coding agent can build a coherent, testable
product.

-   **BRD requirement** means explicitly required by the supplied
    document.
-   **Engineering recommendation** means a proposed implementation
    choice that supports reliability, security, usability, or
    maintainability but is not explicitly prescribed by the BRD.
-   **TBD / Client Approval Required** means the coding agent must not
    invent a business rule, questionnaire, scoring formula, report
    interpretation, or vendor credential.

If a decision depends on a client-supplied questionnaire, scoring
methodology, report template, payment provider, WhatsApp Business
integration, email provider, or database requirement, create a clear
configuration boundary and record the unresolved dependency. Do not
silently substitute a generic or internet-sourced assessment.

## 3. Goals, Scope, and Non-Goals

### 3.1 Phase 1 goals

-   Provide a landing page and assessment-selection experience.
-   Deliver the three supplied assessment modules digitally, subject to client approval and scoring validation.
-   Save questionnaire responses and calculate results using the
    approved scoring rules for each assessment.
-   Validate scoring with documented fixtures and expected outputs.
-   Support payment either before the assessment starts or after
    completion to unlock the report.
-   Generate a personalised PDF report using the agreed template.
-   Release and send the report only after payment is verified.
-   Capture the student's email address and WhatsApp number as needed
    for delivery.
-   Deliver the report through the configured email and/or WhatsApp
    channel(s).
-   Notify the owner/host of configured assessment and payment events.
-   Persist student details, responses, scores, payment state, report
    metadata, and timestamps for administration and record-keeping.

### 3.2 Explicitly outside the confirmed Phase 1 scope

Do not treat the following as committed requirements unless the client
approves them:

-   AI-generated career counselling or an LLM making independent career
    decisions.
-   A student/parent/administrator portal beyond the minimum
    administration capability needed to manage records.
-   Subscription plans, coupons, refunds, multi-currency support, or
    multiple payment providers.
-   School/enterprise tenancy, bulk imports, or integrations with
    third-party student information systems.
-   Psychologist/counsellor appointment booking.
-   Mobile-native applications.
-   Normative comparisons against a population unless validated data and
    permission are supplied.
-   Any claim that an assessment diagnoses a mental-health condition or
    guarantees career success.

These can be considered later extensions, not assumed Phase 1 features.

## 4. Users and Permissions

### 4.1 Student / assessment taker

Can: - View the landing page and assessment descriptions. - Select an
assessment and review relevant instructions and privacy information. -
Provide required contact details. - Complete and submit an assessment. -
Pay according to the selected payment flow. - See a clear payment/report
status. - Receive the report through the configured delivery channel.

Must not: - Access another student's responses, results, payment
records, or report. - Unlock a report by editing client-side state or
calling a public endpoint with a forged payment status.

### 4.2 Owner / host / administrator

Minimum Phase 1 capability: - Receive event notifications for configured
assessment and payment events. - Access student and assessment records
only through an authenticated, authorised administrative mechanism. -
Review status and timestamps needed for operational support.

**TBD / Client Approval Required:** Whether an administration dashboard
is required, which fields admins can view/edit/export, who may access
it, and the retention/deletion policy.

### 4.3 System / background worker

Responsible for: - Scoring submitted responses. - Generating and storing
report artifacts. - Verifying payment-provider events. - Sending
email/WhatsApp messages. - Retrying transient failures safely. -
Recording audit events and delivery status.

## 5. Primary User Journey and State Model

### 5.1 Standard journey

1.  Student visits the landing page.
2.  Student selects one of the three assessment modules.
3.  System creates an assessment attempt and collects required contact
    details and consent.
4.  The configured payment workflow is applied:
    -   **Pay upfront:** verified payment is required before the
        assessment becomes available; or
    -   **Pay after completion:** student completes and submits the
        assessment, then pays to unlock the report.
5.  Student submits responses.
6.  Server validates the submission and computes scores with that
    assessment's approved scoring implementation.
7.  System generates a report in the approved format.
8.  The report remains locked until payment is verified.
9.  Once payment is verified, the report becomes available for delivery.
10. System sends the report via configured email and/or WhatsApp
    channel(s).
11. System persists the final record and emits configured owner/host
    notifications.
12. Student receives a clear status and, where supported, a secure way
    to access the report.

### 5.2 Recommended explicit states

Use server-side states rather than deriving workflow state from the
browser.

**Assessment attempt** - `created` - `awaiting_payment` (upfront flow) -
`in_progress` - `submitted` - `scoring` - `scored` -
`report_generating` - `report_ready_locked` - `report_unlocked` -
`completed` - `cancelled` - `failed`

**Payment** - `not_required_yet` - `pending` - `succeeded` - `failed` -
`cancelled` - `refunded` (only if refunds are later implemented)

**Delivery** - `not_queued` - `queued` - `sending` - `sent` - `failed` -
`retrying`

The exact state transitions should be implemented as validated
server-side operations. A browser redirect from a payment page is not
proof of payment.

### 5.3 State-transition rules

-   An attempt can be submitted only once unless an explicitly approved
    resume/amendment policy exists.
-   Scoring must use the immutable submitted response snapshot.
-   Report generation must be idempotent for a given attempt, scoring
    version, and report-template version.
-   `report_unlocked` requires verified payment, or a documented
    authorised no-payment policy if the business later introduces one.
-   Delivery jobs can be retried without charging the student again or
    generating duplicate logical reports.
-   Failed scoring/report generation must be observable and recoverable;
    do not mark an attempt completed merely because a request was
    accepted.
-   If payment succeeds but report generation fails, retain the
    successful payment and retry report generation; do not ask the
    student to pay again.
-   If a payment webhook is received more than once, processing must not
    create duplicate payments, unlock events, or delivery jobs.

## 6. Functional Requirements

### FR-01 --- Landing page and assessment selection

**Requirement:** Provide a web landing page where the user can select an
assessment.

Acceptance criteria: - The three Phase 1 assessment modules are listed by their
approved names. - Each assessment has a clear description and start
action. - The page explains the next steps and the applicable payment
workflow. - The UI is usable on common desktop and mobile viewport
sizes. - No assessment is available for completion if its approved
questionnaire/scoring configuration is missing or inactive.

**TBD:** Brand identity, copy, pricing, language, accessibility target,
and whether users can purchase a bundle of assessments.

### FR-02 --- Questionnaire delivery

**Requirement:** Digitise all three supplied assessment modules.

Acceptance criteria: - Questions and answer options match the
client-approved source. - Required/optional questions and any branching
are represented explicitly. - Progress is shown where appropriate. -
Validation errors identify what the student needs to correct without
losing valid answers. - The server validates submitted question IDs and
answer values against the active questionnaire version. - The system
records the questionnaire version used by each attempt. - The system
does not invent, rewrite, reorder, or omit assessment items without
approval.

**TBD:** Exact questions, question order, randomisation policy,
branching rules, time limits, save-and-resume policy, and accessibility
requirements.

### FR-03 --- Assessment scoring engine

**Requirement:** Each assessment must use its own approved scoring
methodology, and scoring must be reproducible and validated against
expected outputs.

Acceptance criteria: - Scoring logic is isolated by assessment type and
version. - Scoring runs server-side and is deterministic for the same
valid responses and scoring version. - Invalid, missing, duplicated, or
out-of-range responses are handled according to the approved rules. -
The system stores raw responses separately from derived scores. - Each
score record identifies the scoring-method version. - Automated tests
include known input/output fixtures approved by the client. - Scoring
changes are versioned; historical attempts retain their original score
provenance. - A failed scoring run is recorded as a failure and is not
silently replaced by guessed results.

**TBD / Client Approval Required:** All scoring algorithms,
reverse-coded items, weights, subscales, cut-offs, tie handling,
missing-answer handling, interpretation bands, and any licensing
restrictions. The coding agent must not create substitute scoring rules.

### FR-04 --- Personalised PDF report

**Requirement:** Generate a personalised PDF report with diagrams,
scores, personality and learning profiles, career-related insights, and
detailed interpretations using a report template supplied/approved by
the client.

Acceptance criteria: - The report uses the approved template and
content. - It includes the relevant assessment results, scores,
diagrams, profiles, interpretations, and career-related insights
approved for that assessment. - The report clearly separates
measured/derived assessment results from career recommendations. - The
report identifies the assessment and scoring version or other provenance
where approved. - A report is reproducible from the stored result
snapshot and the corresponding report-template version. - PDF generation
failures are logged and retryable. - The report is not publicly
accessible through a predictable, unauthenticated URL. - A generated
report is not delivered until the payment gate is satisfied.

**TBD:** Report template, chart specifications, branding, content,
disclaimers, fonts, language, page size, report expiry, and whether one
report combines multiple assessments.

**Engineering recommendation:** Store a private PDF artifact and its
checksum, generation timestamp, template version, and status. Avoid
regenerating an already-valid report unnecessarily.

### FR-05 --- Payment gateway and payment timing

**Requirement:** Support either payment before an assessment begins or
payment after completion to unlock the report, according to the selected
workflow.

Acceptance criteria: - The payment workflow is configurable per
assessment or product offering. - The amount and currency are determined
by trusted server-side configuration. - Payment is initiated through the
selected provider's supported checkout/API flow. - The server verifies
payment using a trusted provider API and/or a cryptographically verified
webhook. - Client-side success redirects are informational only and
cannot unlock a report. - Payment amount, currency, provider
transaction/reference ID, status, and relevant timestamps are
persisted. - Repeated webhook events are idempotent. - A report cannot
be unlocked by altering request payloads or local browser state. -
Provider secrets are stored in environment/secret management, never in
source code or client-side bundles.

**TBD:** Payment provider, currency, tax/invoice needs, prices,
upfront-vs-post-completion default, webhook setup, refund/chargeback
policy, and payment reconciliation requirements.

### FR-06 --- Email and WhatsApp report delivery

**Requirement:** Capture email and WhatsApp number. After verified
payment, deliver the report through WhatsApp and/or email.

Acceptance criteria: - Contact details are validated and normalised. -
The student is told which channel(s) will be used and provides any
required consent. - Delivery jobs are queued only after the report is
ready and payment is verified. - Email and WhatsApp integrations are
implemented behind provider-specific adapters. - Each channel records
status, provider message ID where available, attempt count, and last
error. - Transient provider errors use bounded retry with backoff;
permanent errors become visible for support. - Duplicate webhook events
or job retries do not cause uncontrolled duplicate sends. - The message
contains an appropriate secure report link or attachment according to
provider constraints and the approved design. - Sensitive report content
is not written into ordinary application logs.

**TBD:** Email provider, WhatsApp Business provider/API, approved
templates, opt-in wording, attachment/link policy, delivery fallback
order, and operational support process.

### FR-07 --- Owner/host event notifications

**Requirement:** Notify the owner/host about relevant assessment and
payment events.

At minimum, design event hooks for: - Assessment started. - Assessment
submitted. - Scoring completed or failed. - Payment succeeded or
failed. - Report generated or generation failed. - Report delivery
succeeded or failed.

The final notification set and destinations must be configurable and
approved. Do not send every internal event to the owner by default if it
exposes unnecessary student data.

Acceptance criteria: - Notifications are triggered from persisted
server-side events. - Notification failures do not roll back a valid
assessment or payment. - Duplicate events are deduplicated where
appropriate. - Messages contain only the minimum operational information
required. - Notification outcomes are observable.

### FR-08 --- Student data management

**Requirement:** Securely store student details, responses, scores,
payment status, generated reports, and timestamps for administration and
record-keeping.

Acceptance criteria: - Each student, assessment attempt, payment,
result, report, and delivery has a stable internal identifier. - Records
are linked through explicit foreign-key relationships. - Timestamps are
stored consistently, preferably UTC, and rendered in the user's relevant
timezone. - Raw responses, derived scores, payment records, and report
metadata are separately queryable. - Data access is authorised and
audited. - The system supports a documented retention and deletion
process once approved. - Sensitive data is not exposed in logs,
analytics events, or error messages.

**TBD:** Database technology, data residency, retention period, deletion
policy, backup requirements, export needs, and the applicable
privacy/legal requirements.

### FR-09 --- Status and error handling

**Engineering recommendation:** Give students clear states such as
"Assessment submitted," "Payment pending," "Generating report," "Report
ready," and "Delivery needs attention." Avoid exposing stack traces or
provider internals.

Acceptance criteria: - All long-running operations have a persisted
status. - Users can recover from refreshes and temporary network
failures without duplicate submissions or payments. - Errors include a
correlation/reference ID suitable for support. - Operational failures
are logged with enough context to diagnose them, without logging secrets
or unnecessary personal data.

## 7. Suggested Architecture

Use a modular monolith for Phase 1 unless the implementation environment
or scale requirements justify a distributed design. Keep boundaries
clear so components can later be separated.

### 7.1 Logical components

1.  **Web frontend**
    -   Landing page, assessment selection, questionnaire UI,
        contact/consent capture, payment status, and report status.
    -   Treat all browser input as untrusted.
2.  **Application API**
    -   Authentication/authorisation where required.
    -   Assessment attempts, questionnaire delivery, submission, status
        retrieval, and administrative operations.
    -   Enforces the workflow and payment gate.
3.  **Assessment registry**
    -   Stores assessment definitions and active versions.
    -   Connects each assessment version to approved questionnaire data,
        scoring implementation, and interpretation content.
4.  **Scoring module**
    -   Pure, testable functions where possible.
    -   One implementation boundary per assessment and scoring version.
5.  **Payment adapter**
    -   Creates payment sessions and verifies provider events.
    -   Provider-specific code must not leak into domain rules.
6.  **Report service**
    -   Builds report data from a versioned result snapshot and renders
        the approved PDF template.
7.  **Notification/delivery worker**
    -   Sends email/WhatsApp messages and owner notifications
        asynchronously.
    -   Supports retries and deduplication.
8.  **Persistence layer**
    -   Stores students, attempts, responses, results, payments,
        reports, delivery jobs, and audit events.
9.  **Observability**
    -   Structured logs, metrics, correlation IDs, error tracking, and
        health checks.

### 7.2 Architectural rules

-   Keep scoring logic independent of HTTP controllers and UI code.
-   Keep payment-provider integration independent of report-unlock
    domain rules.
-   Use a durable queue or database-backed job pattern for report
    generation and message delivery if the deployment platform supports
    it.
-   Use database transactions for related state changes.
-   Use an outbox pattern or equivalent reliable event dispatch for
    critical post-transaction events.
-   Do not trust a frontend-provided `paid`, `score`, `result`,
    `report_url`, or `role` value.
-   Avoid premature microservices. Prioritise testability, clear
    interfaces, and reliable state transitions.

## 8. Suggested Data Model

The final schema must be adapted to the chosen database. The following
is a logical starting point, not a mandated database technology.

### `students`

-   `id` --- internal primary key
-   `email` --- nullable only if email is not required for the selected
    delivery path
-   `whatsapp_number` --- normalised international format; nullable only
    if not required
-   `created_at`, `updated_at`
-   Consent records should be stored explicitly rather than inferred
    from the existence of contact details.

### `assessment_definitions`

-   `id`
-   `assessment_type` --- one of the three assessment modules
-   `name`
-   `active_version_id`
-   `active`
-   `created_at`, `updated_at`

### `assessment_versions`

-   `id`
-   `assessment_definition_id`
-   `version`
-   `questionnaire_version`
-   `scoring_version`
-   `report_template_version`
-   `approved_at` / approval reference where applicable
-   `status` --- draft, approved, active, retired

### `assessment_attempts`

-   `id`
-   `student_id`
-   `assessment_version_id`
-   `status`
-   `payment_workflow` --- upfront or post-completion
-   `started_at`, `submitted_at`, `completed_at`
-   `created_at`, `updated_at`
-   `idempotency_key` or equivalent submission deduplication key

### `assessment_responses`

-   `id`
-   `attempt_id`
-   `question_id`
-   `answer_value` --- structured representation validated against the
    questionnaire definition
-   `answered_at`
-   Unique constraint on `(attempt_id, question_id)` unless approved
    branching requires a different representation.

### `assessment_results`

-   `id`
-   `attempt_id` --- unique for the authoritative result of an attempt,
    unless multiple explicitly versioned runs are required
-   `scoring_version`
-   `scores_json` --- validated, documented schema
-   `interpretations_json` --- approved interpretation output
-   `scored_at`
-   `status`, `error_code` where applicable

### `payments`

-   `id`
-   `attempt_id`
-   `provider`
-   `provider_payment_id` / transaction reference
-   `amount`, `currency`
-   `status`
-   `verified_at`, `created_at`, `updated_at`
-   Store only necessary provider response metadata; never store payment
    card data.

### `reports`

-   `id`
-   `attempt_id`
-   `result_id`
-   `template_version`
-   `storage_key` --- private object/storage reference, not a public URL
-   `checksum`
-   `status`
-   `generated_at`, `created_at`

### `delivery_jobs`

-   `id`
-   `attempt_id`
-   `report_id`
-   `channel` --- email, WhatsApp, owner notification
-   `recipient_reference` --- minimise or protect contact data
-   `status`
-   `attempt_count`
-   `provider_message_id`
-   `last_error_code`
-   `created_at`, `sent_at`, `updated_at`
-   A deduplication key should prevent duplicate logical sends for the
    same report/channel/recipient/purpose.

### `audit_events`

-   `id`
-   `actor_type`, `actor_id` where available
-   `event_type`
-   `entity_type`, `entity_id`
-   `correlation_id`
-   Minimal redacted metadata
-   `created_at`

**Data model rules:** Add appropriate foreign keys, indexes, uniqueness
constraints, and deletion/retention behaviour. Do not store secrets or
raw payment-card information. Define whether student contact details are
snapshotted on an attempt or always resolved from the student record.

## 9. API Contract --- Suggested Starting Point

These routes are illustrative. Adapt naming to the selected framework
while preserving the trust boundaries and behaviours.

### Public/student routes

-   `GET /api/v1/assessments` --- list active assessments and safe
    public metadata.
-   `GET /api/v1/assessments/{assessment_id}` --- fetch the active
    approved questionnaire/instructions or a safe questionnaire schema.
-   `POST /api/v1/attempts` --- create an attempt, capture required
    contact/consent, and establish the configured payment workflow.
-   `GET /api/v1/attempts/{attempt_id}` --- fetch status only after
    validating access to that attempt.
-   `PUT /api/v1/attempts/{attempt_id}/responses` --- save/resume
    responses if this capability is approved.
-   `POST /api/v1/attempts/{attempt_id}/submit` --- validate and freeze
    responses, then initiate scoring.
-   `POST /api/v1/attempts/{attempt_id}/payment-session` --- create
    provider checkout session when payment is due.
-   `GET /api/v1/attempts/{attempt_id}/report-status` --- return safe
    status, not an unrestricted storage path.
-   `GET /api/v1/reports/{report_id}/download` --- authorise access and
    verify unlock conditions before issuing a short-lived download URL
    or streaming the PDF.

### Provider webhook routes

-   `POST /api/v1/webhooks/payments/{provider}` --- verify signature,
    validate event, and process idempotently.
-   Delivery-provider webhooks may be added for sent/delivered/failed
    status if supported.

### Admin routes

-   `GET /api/v1/admin/attempts`
-   `GET /api/v1/admin/attempts/{attempt_id}`
-   Optional export/retry actions only after permissions and audit
    requirements are approved.

**API rules** - Validate all request bodies with explicit schemas. -
Return consistent error shapes and appropriate HTTP status codes. -
Apply rate limiting to public endpoints and webhook-specific
verification. - Do not expose internal stack traces, secrets, provider
tokens, or another student's data. - Use access control for
attempt/report retrieval; an unguessable ID alone is not a complete
authorisation strategy. - Add idempotency to operations that create
payment sessions, submit attempts, generate reports, and queue delivery.

## 10. Scoring and Report Data Contracts

### 10.1 Scoring input/output

Define a typed interface for each assessment implementation,
conceptually:

-   Input: approved assessment version + validated, immutable response
    snapshot.
-   Output: a schema-validated result containing the scores and
    subscales defined by the approved scoring rules, interpretation
    keys, scoring version, and any validation warnings.
-   Failure: a structured error that can be logged and retried or
    escalated without fabricating a score.

Do not hard-code unknown scales or assume all assessments return the
same score structure. Use an assessment-specific result schema behind a
common interface.

### 10.2 Report-generation input

The report service should receive: - Student/report display fields that
are approved for inclusion. - Assessment name and version. - Validated
result snapshot. - Approved interpretation text and career-insight
content. - Report-template version and branding configuration. -
Required disclaimers and provenance information approved by the client.

The report renderer must not recalculate scores independently. Scoring
is the single source of truth.

## 11. Security, Privacy, and Responsible Presentation

These are engineering recommendations and release requirements for a
platform storing personal assessment data.

-   Enforce HTTPS in production.
-   Store secrets in a secret manager or protected environment
    configuration.
-   Use least-privilege database and storage credentials.
-   Encrypt sensitive data in transit and use encryption at rest where
    supported.
-   Restrict report files to private storage; use short-lived signed
    URLs or authorised streaming.
-   Apply role-based access to administration functions.
-   Verify payment webhooks cryptographically and protect against
    replay/duplicate processing.
-   Validate and normalise email and telephone inputs.
-   Record consent and the purpose/channel associated with it.
-   Define data retention, deletion, access, export, and
    incident-response processes with the client/legal owner.
-   Redact personal information, assessment answers, report content,
    tokens, and payment metadata from ordinary logs.
-   Apply rate limits and abuse protection to public APIs.
-   Avoid collecting information not needed for the agreed service.
-   Explain that results are assessment outputs and not guarantees of
    job fit, career success, or clinical diagnoses.
-   Confirm the client's authority/licensing to reproduce and digitally
    administer each questionnaire, scoring system, and interpretive
    content before launch.

**TBD / Client Approval Required:** Applicable jurisdiction and privacy
obligations, age/minor handling, parental consent where relevant,
privacy notice, lawful basis/consent model, data residency, retention
duration, and access/deletion request handling.

## 12. Reliability and Observability

Implement: - Structured logs with correlation IDs. - Metrics for
attempts started/submitted, scoring success/failure, report generation
success/failure, payment success/failure, delivery success/failure, and
retry counts. - Health/readiness endpoints for application and worker
dependencies. - Centralised error tracking without sensitive payloads. -
Bounded retry with exponential backoff for transient failures. -
Dead-letter/manual-review handling for repeatedly failing jobs. -
Idempotent job handlers. - Backup and restore procedures appropriate to
the chosen database and artifact store. - Alerts for sustained failures
in payment webhooks, report generation, or delivery.

A payment success must not be lost because email/WhatsApp is
unavailable. A delivery failure must not change a verified payment to
failed.

## 13. Testing Strategy and Definition of Done

### 13.1 Unit tests

-   Each assessment scoring implementation.
-   Response validation and edge cases.
-   Score-to-interpretation mapping.
-   Payment state transitions.
-   Report access/unlock policy.
-   Idempotency and deduplication logic.
-   Input normalisation and consent capture.

### 13.2 Golden scoring tests --- launch blocker

For each assessment, the client must provide or approve a set of
fixtures containing: - Assessment/scoring version. - Input responses. -
Expected score output. - Expected interpretation/band where
applicable. - Tolerance rules, if any.

Acceptance criteria: - All approved golden fixtures pass. - Tests cover
normal cases, boundary cases, missing answers, invalid answers, ties,
reverse scoring, and other cases relevant to the supplied methodology. -
Test evidence is retained as a release artifact. - No scoring method is
considered validated merely because the code runs.

### 13.3 Integration tests

-   Database persistence and retrieval.
-   Payment-provider sandbox flow and webhook verification.
-   Duplicate/out-of-order webhook handling.
-   PDF rendering against approved template.
-   Email/WhatsApp provider adapters in sandbox/test mode.
-   Retry and failure recovery.
-   Secure report download access.

### 13.4 End-to-end tests

-   Upfront payment → assessment → scoring → report → delivery.
-   Assessment → post-completion payment → report unlock → delivery.
-   Payment pending/failure and retry.
-   Payment succeeds while report generation fails, then recovers.
-   Delivery failure and retry without duplicate payment.
-   Attempt/report access from an unauthorised user is denied.
-   Student record and audit/event records are persisted correctly.

### 13.5 Definition of Done for Phase 1

A feature is complete only when: - Requirements and acceptance criteria
are implemented. - Automated tests are passing. - Error paths and status
transitions are covered. - Security-sensitive operations are
server-enforced. - Logs and operational status are sufficient for
support. - Configuration and deployment instructions are documented. -
No credentials or real personal data are committed to source control. -
Client-dependent content is approved and versioned.

**Phase 1 launch blockers:** 1. Approved and licensed questionnaire content for all
three assessment modules. 2. Approved scoring methods and golden test cases for
all three assessment modules. 3. Approved report template and
interpretation/career-insight content. 4. Selected payment provider,
configured credentials, and verified webhook flow. 5. Configured email
and WhatsApp Business integrations and approved message
templates/consent. 6. Approved data storage, access, privacy, and
retention decisions. 7. End-to-end proof that reports cannot be unlocked
before verified payment.

## 14. Configuration and Environment

Use environment variables or a secret manager for deployment-specific
settings. Commit only a safe `.env.example` containing placeholder
values.

Expected configuration categories: - Application environment, base URL,
allowed origins. - Database connection. - Private report storage
configuration. - Payment provider name, public configuration, secret key
reference, webhook secret reference. - Email provider settings and
sender identity. - WhatsApp Business provider settings and approved
template identifiers. - Owner/host notification destination(s). -
Assessment activation flags and version IDs. - Report template
version. - Queue/worker configuration. - Logging level and
error-reporting DSN.

Do not place live credentials in the repository, client bundle, sample
files, logs, or generated reports.

## 15. Repository Structure --- Suggested

Adapt this to the coding agent's existing stack rather than replacing a
functioning repository without reason.

``` text
career-assessment-platform/
  README.md
  .env.example
  docs/
    IMPLEMENTATION_SPEC.md
    decisions/
  frontend/
    src/
      pages/
      components/
      api/
      validation/
  backend/
    app/
      api/
      domain/
        assessments/
          registry.py
          psychology/
          mbti/
          riasec/
          vark/
        payments/
        reports/
        delivery/
      services/
      repositories/
      models/
      schemas/
      workers/
      security/
      observability/
      config/
    tests/
      unit/
      integration/
      e2e/
      fixtures/
  migrations/
  scripts/
```

The example paths are illustrative and language-specific in places. If
the project uses a different language/framework, preserve the separation
of concerns rather than copying the exact filenames.

## 16. Implementation Plan for the Coding Agent

Implement in vertical slices, keeping the application runnable at each
milestone.

### Milestone 0 --- Repository inspection and decision log

-   Inspect the existing repository, language, framework, tests, and
    deployment assumptions.
-   Do not overwrite or restructure working code before understanding
    it.
-   Produce a concise architecture and gap analysis.
-   Create a decision log for unresolved technical and client
    dependencies.
-   Identify secrets/configuration already present and avoid printing
    them.

**Exit criteria:** A plan mapped to the repository, with unknowns
clearly listed.

### Milestone 1 --- Domain model and workflow

-   Implement core entities and state transitions.
-   Add schema validation, database migrations, indexes, and idempotency
    constraints.
-   Add tests for legal/illegal transitions and ownership checks.

**Exit criteria:** Attempts, responses, payments, results, reports, and
delivery states can be persisted and tested.

### Milestone 2 --- Assessment registry and questionnaire UI/API

-   Implement versioned assessment definitions and questionnaire
    delivery.
-   Load only client-approved assessment content.
-   Add response validation and submit/freeze semantics.
-   Use clearly marked placeholders only in development; never label
    them as validated assessments.

**Exit criteria:** Each approved questionnaire can be completed and
submitted end-to-end in a non-production environment.

### Milestone 3 --- Scoring engine and golden tests

-   Implement each approved scoring methodology behind a separate
    versioned interface.
-   Add client-provided golden fixtures and edge cases.
-   Persist score provenance and structured errors.

**Exit criteria:** All approved scoring fixtures pass; otherwise scoring
is not production-ready.

### Milestone 4 --- Payment and access gate

-   Integrate the selected provider in sandbox mode.
-   Implement signed webhook verification, idempotent processing, and
    server-side payment verification.
-   Enforce the report unlock rule on every report access path.

**Exit criteria:** Tests prove that forged browser state and unverified
payments cannot unlock reports.

### Milestone 5 --- PDF report generation

-   Implement the client-approved template and diagram generation.
-   Render from persisted result snapshots.
-   Store artifacts privately with metadata and checksum.
-   Add retry and failure-state handling.

**Exit criteria:** Approved sample reports match the agreed template and
are reproducible.

### Milestone 6 --- Email, WhatsApp, and owner notifications

-   Implement provider adapters.
-   Queue delivery only after the payment/report conditions are met.
-   Add consent checks, idempotency, retry/backoff, and delivery status.

**Exit criteria:** Sandbox tests demonstrate successful and failed
delivery handling without duplicate payment or uncontrolled duplicate
messages.

### Milestone 7 --- Admin operations, security, and observability

-   Implement only the approved minimum admin capabilities.
-   Add audit events, structured logs, health checks, metrics, and alert
    hooks.
-   Verify privacy, retention, access control, and secure artifact
    delivery.

**Exit criteria:** Operational users can diagnose failures without
exposing unnecessary student data.

### Milestone 8 --- Release readiness

-   Run unit, integration, and end-to-end suites.
-   Validate backup/restore and deployment configuration.
-   Verify production webhook endpoints and secrets management.
-   Complete client sign-off for questionnaires, scoring, report
    template, integrations, and privacy decisions.

**Exit criteria:** All launch blockers in Section 13.5 are closed.

## 17. Coding-Agent Working Rules

The coding agent must follow these rules throughout implementation:

1.  **Inspect first.** Read the repository and current tests before
    changing code.
2.  **Do not fabricate business logic.** Missing questionnaires, scoring
    rules, report copy, prices, or provider details are blockers
    requiring a documented question or configurable stub.
3.  **Preserve traceability.** Map every BRD requirement to code, tests,
    and acceptance evidence.
4.  **Prefer small, testable changes.** Implement one vertical slice at
    a time.
5.  **Keep secrets out of code.** Use safe configuration and
    placeholder-only examples.
6.  **Treat the client and provider as untrusted boundaries.** Validate
    request data and verify webhook signatures.
7.  **Enforce invariants on the server.** Payment/report access rules
    must not depend on UI state.
8.  **Make asynchronous work recoverable.** Use persisted states,
    idempotency, retries, and visible failures.
9.  **Version assessment logic.** Never silently change the scoring
    semantics of an existing attempt.
10. **Do not claim tests passed without running them.** Report the exact
    commands executed and results.
11. **Do not mark integrations complete when only mocked.** Clearly
    distinguish mocks, sandbox integration, and production verification.
12. **Document trade-offs and decisions.** If a choice is not specified
    in this document, record the rationale and assumptions.
13. **Do not expand Phase 1 silently.** Propose enhancements separately
    and prioritise the BRD acceptance criteria first.
14. **Protect personal data.** Use synthetic test data; avoid copying
    real student records into development fixtures.
15. **Keep the product usable.** Provide clear progress, status,
    validation, recovery, and error messages.

## 18. Requirement Traceability Matrix

  ---------------------------------------------------------------------------------------
  ID                Requirement       Primary component           Minimum evidence
  ----------------- ----------------- --------------------------- -----------------------
  FR-01             Landing page and  Frontend/API                UI and route tests
                    assessment                                    
                    selection                                     

  FR-02             Three approved   Assessment registry/UI      Version and
                    questionnaires                                response-validation
                                                                  tests

  FR-03             Approved,         Scoring module              Client-approved golden
                    reproducible                                  tests
                    scoring                                       

  FR-04             Personalised PDF  Report service              Template review and PDF
                    report                                        tests

  FR-05             Upfront or        Payment adapter/domain      Sandbox + webhook +
                    post-completion                               access-gate tests
                    payment                                       

  FR-06             Email/WhatsApp    Delivery worker/adapters    Sandbox send, retry,
                    report delivery                               deduplication tests

  FR-07             Owner/host event  Event/notification service  Event-to-notification
                    notifications                                 tests

  FR-08             Secure student    Persistence/security        Schema, access-control,
                    record storage                                retention tests

  FR-09             Status and        API/workers/observability   Failure-path and
                    failure recovery                              recovery tests
  ---------------------------------------------------------------------------------------

## 19. Client Decisions Required Before Production

Track these explicitly in a decision register with owner, due date,
status, and implementation impact.

  -----------------------------------------------------------------------
  Decision                            Why it blocks or affects
                                      implementation
  ----------------------------------- -----------------------------------
  Final approved questionnaires for   Determines the actual questionnaire
  all three assessment modules                UI and validation

  Authorised scoring rules and        Required for correct, lawful
  licensing permissions               scoring

  Golden test inputs and expected     Required to prove scoring accuracy
  outputs                             

  Report template and approved        Required for final PDF generation
  interpretation content              

  Definition of career                Prevents unsupported or misleading
  insights/recommendations            conclusions

  Payment provider, prices, currency, Determines checkout and webhook
  and workflow                        integration

  Email provider and sender identity  Determines delivery adapter and
                                      setup

  WhatsApp Business provider,         Determines compliant message
  templates, and opt-in               delivery

  Student contact fields and consent  Determines data collection and
  language                            delivery eligibility

  Database, storage, data residency,  Determines persistence/security
  and retention                       implementation

  Admin access and reporting needs    Determines operational UI and
                                      permissions

  Hosting, domain, monitoring,        Determines deployment and
  backups, and recovery targets       operations

  Supported age range and             Determines consent and safeguarding
  privacy/legal review                requirements

  Brand, languages, accessibility     Determines frontend and report
  target                              presentation
  -----------------------------------------------------------------------

## 20. Final Product Acceptance Checklist

Before calling Phase 1 production-ready, confirm:

-   [ ] All three assessment modules are available and versioned.
-   [ ] Questionnaire content matches client-approved source material.
-   [ ] Each assessment uses its own authorised scoring methodology.
-   [ ] Golden scoring tests pass and evidence is retained.
-   [ ] Assessment results and career recommendations are clearly
    distinguished.
-   [ ] PDF reports match the approved template.
-   [ ] Both supported payment timing workflows behave as configured.
-   [ ] Only verified payment can unlock a report.
-   [ ] Payment webhooks are verified and idempotent.
-   [ ] Student records, responses, results, payments, reports, and
    timestamps are stored correctly.
-   [ ] Reports are stored privately and access-controlled.
-   [ ] Email/WhatsApp delivery is consent-aware, retryable, and
    observable.
-   [ ] Owner/host notifications fire for the approved events.
-   [ ] Duplicate submissions, webhooks, and delivery retries are
    handled safely.
-   [ ] Failure states are recoverable and visible to operations.
-   [ ] Privacy, retention, access, and deletion decisions are approved.
-   [ ] Deployment, secrets, migrations, monitoring, and backup
    procedures are documented.
-   [ ] No unresolved client-dependent launch blocker is being
    represented as complete.

------------------------------------------------------------------------

## Appendix A --- BRD Requirements Preserved

The supplied BRD's initial scope requires: - A web application/landing
page for MBTI/personality, Holland RIASEC, and VARK Learning Styles. The
product/app name is Psychology-Based Career Assessment. - Questionnaire delivery and approved scoring
methodologies. - Personalised PDF reporting with diagrams, scores,
personality and learning profiles, career insights, and detailed
interpretations using a supplied template. - Payment before the
assessment or after completion to unlock the report. - Email and
WhatsApp number capture, report delivery after verified payment, and
owner/host event notifications. - Secure storage of student details,
responses, scores, payment status, reports, and timestamps. - Phase 1
implementation of questionnaires/scoring, scoring validation, report
generation, payment, email/WhatsApp, database, and event triggers. -
Reproducible verified scores, approved-format reports, secure payment
processing, payment-gated report release, and documented scoring test
cases before launch. - Client provision/approval of questionnaires,
scoring rules, report template, payment credentials, WhatsApp Business
integration, email service, and database requirements. - Separate
approved scoring methods per assessment and a clear distinction between
assessment results and career recommendations.


## Questionnaire Source Data Supplied After the BRD

The owner has supplied three questionnaire PDFs and clarified that **Psychology-Based Career Assessment** is the product name, not a separate assessment. The implementation must therefore model three modules: MBTI/personality, Holland RIASEC, and VARK Learning Styles.

Read `QUESTIONNAIRES_SOURCE_DATA.md` for the complete question/statement transcription, answer options, source-derived scoring information, and unresolved content issues. `QUESTIONNAIRES_SOURCE_DATA.json` provides structured data for seeding/configuring the application. Do not retype questions from memory or silently modify the text.

**Before production:** confirm permission to digitise/reproduce the supplied workbook material. Block production scoring for MBTI until approved expected-output fixtures confirm the scoring implementation. Confirm the RIASEC “Yourself” statement and point-per-check interpretation. Treat VARK Q1 as unscored and Q15 as instruction-only unless the client provides an approved correction/key.
