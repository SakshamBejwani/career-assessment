# Changelog

Record every meaningful change here: newest first, dated, with what changed, why, and how it was verified. Content and scoring changes must also name the new version identifiers and any client approval reference.

## 2026-10-11: Initial implementation (app v1.0.0, spec v1.1)

### Specification
- Revised the implementation spec from v1.0 to v1.1 (`docs/IMPLEMENTATION_SPEC.md`; v1.0 kept in `docs/archive/`). It has 19 specific changes, listed in its section 0. The main ones:
  - A concrete, host-portable stack.
  - Removal of the stray fourth "psychology" module.
  - Serverless-safe background jobs.
  - PostgreSQL and MySQL support.
  - Student and admin authentication.
  - The approval gate with preview mode.
  - Explicit state transitions.
  - Engineering defaults for every open client decision.

### Application
- Next.js 16 + Prisma 7 full-stack app. Landing page, three questionnaires (personality type, Holland RIASEC, VARK) generated verbatim from `docs/source/`, autosave, submit and freeze.
- Versioned scorers implementing the source answer keys, with engineering golden fixtures computed independently.
- Razorpay payments (upfront or post-completion, signature + order verification, signed and de-duplicated webhooks) and a non-production mock provider.
- PDF report (`@react-pdf/renderer`) and on-screen results with charts, draft interpretation packs, insights kept separate from results, and reproducible checksums.
- Delivery by SMTP email (PDF attached + signed 7-day link) and WhatsApp Cloud API template, plus owner notifications; database-backed job queue with retries and dead-lettering.
- Admin area: attempts list, needs-attention view, attempt detail, retry, re-send, audit trail.
- Deployment: Vercel (`vercel-build`, cron), Hostinger Node.js apps (`build:prod` / `start:prod`, in-process worker), and Docker (standalone image, migrate service, Caddy HTTPS).

### Fixes made during verification
- Attempts didn't reach `completed`: the "all delivered?" check ran before the delivery job itself was marked succeeded. It now runs after the job row is updated (`afterSuccess`).
- A job that died before moving its attempt forward couldn't mark the attempt `failed`. Added `submitted → failed` and `scored → failed` transitions.
- The admin password hash format contained `$`, which `.env` expansion corrupts. Switched to `scrypt.N.r.p.salt.hash` (base64url).
- Upgraded `nodemailer` to 10.1.0 (SMTP/header injection advisories). Pinned `mariadb` 3.5.4 and `mysql2` 3.24.5 through `overrides`.
- UI polish after screenshot review: hexagon labels no longer clip, long VARK prompts use the reading face on phones, a compact mobile header, the attempt header aligned to its content, admin emails wrap, chart tracks are visible, and VARK bars share one track width on phones.

### Verified
- `npm run typecheck`, `npm run lint`, `npm run build` clean.
- 62 unit tests.
- 12 integration tests on PostgreSQL 17; the 11 lifecycle tests also on MySQL 8.4.
- 34-check `npm run test:e2e` against `next start` and the standalone build.
- `scripts/ui-walkthrough.mjs` passing with no browser errors.

### Not yet verified
- Live Razorpay, production SMTP, WhatsApp.
- A real Vercel or Hostinger deployment.
- A `docker build`.
