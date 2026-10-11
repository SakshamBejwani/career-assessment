# Operations runbook

## Daily use of the admin area

Sign in at `/admin/login` with an account from `ADMIN_USERS`.

- **Attempts list:** filter by questionnaire, status, or email/reference. **Needs attention** shows attempts that failed or have a job that exhausted its retries.
- **Attempt detail:** contact snapshot, consents, versions, result summary, payments, report metadata, every background job, and the audit trail. Raw answers are never displayed.
- **Retry now:** re-runs a failed or dead job (scoring, report generation, a delivery or a notification). Retrying never creates a new payment.
- **Re-send report:** sends the existing report again by email (and WhatsApp if the student opted in) with a fresh link.

Every sign-in, record view and action is written to the audit trail.

## Where things can go wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| Student paid but the page still says "Payment" | Razorpay webhook not configured, or a wrong `RAZORPAY_WEBHOOK_SECRET` | Check the Razorpay dashboard's webhook delivery log; fix the URL or secret. Razorpay retries failed webhooks for 24 hours, and processing is idempotent, so retried deliveries complete the unlock automatically |
| Attempt shows **failed** with `scoring_*` | Answers didn't satisfy the scoring key (shouldn't happen after validation) | Check the failure code and logs by reference; fix and use *Retry now* on the score job |
| Attempt shows **failed** with a report error | Storage misconfiguration (S3 credentials, unwritable directory) or fonts missing | Fix configuration, then *Retry now* on the `generate report` job. The payment is kept |
| Delivery job **dead** with `smtp_5xx` | Bad email address or the SMTP account rejected the sender | Confirm the address with the student; fix SMTP settings; *Retry now* or *Re-send report* |
| Delivery job **dead** with `whatsapp_*` | Template not approved, number not on WhatsApp, or token expired | Fix in Meta Business Manager; the student still has the email and the download link |
| `GET /api/health/ready` returns 503 | Configuration invalid or database unreachable | The server log lists every configuration problem at once |
| Many `rate_limited` responses | Abuse, or many students behind one school network | Limits live in `src/server/security/rate-limit.ts`; raise `createAttempt` if a whole classroom shares an IP |

## Logs and metrics

Logs are one JSON object per line. Personal data, answers, tokens and provider payloads are redacted before writing.

- Each API error includes a `reference`; search logs for that value (`requestId`).
- Counters are logged as `{"msg":"metric","metric":"..."}`. Names: `attempt_started`, `attempt_submitted`, `scoring_succeeded`, `scoring_failed`, `report_generated`, `report_failed`, `payment_succeeded`, `payment_failed`, `delivery_succeeded`, `delivery_failed`, `job_retry_scheduled`, `job_dead`.
- Set `ERROR_WEBHOOK_URL` to a Slack or Discord incoming webhook to get error alerts.
- Suggested alerts: any `job_dead`; `payment_failed` spikes; `/api/health/ready` failing for over 2 minutes.

## Background jobs

Jobs are rows in the `jobs` table. They run:

1. immediately after the request that created them,
2. when the student's status page polls,
3. on every `GET /api/v1/cron/jobs` (Vercel Cron, hPanel cron or any scheduler), and
4. every `JOB_WORKER_INTERVAL_MS` on long-running servers.

Failures retry after 30 s, 2 min, 8 min, 32 min and 2 h, then become `dead` and show under **Needs attention**. To trigger a pass by hand:

```bash
APP_URL=https://your-domain CRON_SECRET=... npm run jobs:run
```

## Approving content

When the client signs off a questionnaire version, its scoring and its interpretation text:

1. **Golden fixtures.** Add the client's expected outputs as `tests/fixtures/golden/<module>.client.json` in the same format as the engineering files, with `"approval": "client:<reference>"`. Run `npm test`; it must pass.
2. **Interpretation text.** Edit `src/content/interpretations/<module>.ts` with the approved wording. Bump `version` (for example `1.0.0`), set `status: "approved"` and `approvalReference`.
3. **Questionnaire and scoring.** In `src/server/assessments/registry.ts`, set that version's `approval` to `{ status: "approved", reference: "<client ref>", approvedAt: "YYYY-MM-DD" }`.
4. Deploy, and remove `ALLOW_UNAPPROVED_ASSESSMENTS` from production.

**Changing questions or scoring later:** never edit a version that attempts already use. Update `docs/source/QUESTIONNAIRES_SOURCE_DATA.json`, bump `QUESTIONNAIRE_VERSION` in `scripts/generate-content.mjs`, run `npm run content:generate`, add a new scorer file (`scoring.v2.ts`) and a new registry version, and point `activeVersion` at it. Old attempts keep their original version.

## Backups

- **Neon / Supabase:** point-in-time restore is built in; confirm the retention window on your plan.
- **Docker Postgres:**

  ```bash
  docker compose exec db pg_dump -U app career_assessment | gzip > backup-$(date +%F).sql.gz
  ```
  Run it daily from cron and copy the file off the server.
- **Hostinger MySQL:** use hPanel's automatic backups, or `mysqldump`.
- With `REPORT_STORAGE=database` (default), PDFs are inside the database backup. With `filesystem`, also back up the `report-files` volume. With `s3`, enable bucket versioning.

Restore by loading the dump into an empty database, then deploying. Migrations are already recorded in `_prisma_migrations`.

## Rotating secrets

| Secret | Effect of rotating |
|---|---|
| `SESSION_SECRET` | Signs every admin out |
| `REPORT_LINK_SECRET` | Invalidates emailed report links; students can still open reports in their original browser, and admins can re-send |
| `CRON_SECRET` | Update Vercel / hPanel cron at the same time |
| `RAZORPAY_*` | Update the webhook secret in Razorpay at the same moment |
| Admin password | Generate a new hash and replace the entry in `ADMIN_USERS` |

## Deleting a student's data

Until the client approves a retention policy (decision D-25), handle deletion requests manually. Deleting the student row cascades to their attempts, consents, answers, results, payments, reports, report files stored in the database, and jobs.

```sql
-- PostgreSQL and MySQL
DELETE FROM students WHERE email = 'student@example.com';
```

Audit events keep only IDs, never personal data, so they can stay. If reports are stored in S3 or on the filesystem, delete `reports/<report_id>.pdf` as well. Keep Razorpay's own payment records as required for accounting.
