# Deployment guide

The app is one Next.js project: pages, API, background jobs and PDF generation all deploy together. It runs on:

| Target | Database | Background jobs | Report storage |
|---|---|---|---|
| [Vercel](#vercel) | Neon or Supabase Postgres | `after()` + Vercel Cron | `database` or `s3` (e.g. Cloudflare R2) |
| [Hostinger Node.js Web Apps](#hostinger-nodejs-web-apps-business-and-cloud-plans) | Hostinger MySQL (or external Postgres) | `after()` + in-process worker and/or hPanel cron | `database` |
| [Hostinger VPS / any Docker host](#hostinger-vps-or-any-docker-host) | Postgres in Docker | `after()` + in-process worker | `database` or `filesystem` |

Whatever the host, the steps are the same: create a database, set environment variables, run migrations, build, start, register the Razorpay webhook.

---

## Before you deploy

1. **Put the project in a Git repository.** The `career-assessment-platform` folder is the repository root.
2. **Generate secrets** (run locally, once per environment):

   ```bash
   openssl rand -base64 48   # SESSION_SECRET
   openssl rand -base64 48   # REPORT_LINK_SECRET (must differ)
   openssl rand -hex 24      # CRON_SECRET
   ```
3. **Create an admin login:**

   ```bash
   npm install
   npm run admin:hash-password -- you@example.com
   ```
   Paste the printed `you@example.com:scrypt.16384.8.1.…` line into `ADMIN_USERS`. Separate several admins with commas.
4. **Decide the environment.** Use `APP_ENV=staging` for a demo or preview site: mock payments are allowed there and every questionnaire runs as a labelled preview. `APP_ENV=production` refuses to start with mock payments, weak secrets, a non-https URL or no admins, and hides unapproved questionnaires unless `ALLOW_UNAPPROVED_ASSESSMENTS=true`.

### Required environment variables

All variables are documented in `.env.example`. The minimum for production:

```
APP_ENV=production
APP_URL=https://assessments.example.com
DATABASE_PROVIDER=postgresql            # or mysql
DATABASE_URL=...
SESSION_SECRET=...
REPORT_LINK_SECRET=...
CRON_SECRET=...
ADMIN_USERS=you@example.com:scrypt.16384.8.1....
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
PRICE_MBTI_PERSONALITY=49900            # paise; confirm prices with the client
PRICE_HOLLAND_RIASEC=49900
PRICE_VARK_LEARNING_STYLES=29900
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=reports@example.com
SMTP_PASSWORD=...
EMAIL_FROM="Psychology-Based Career Assessment <reports@example.com>"
SUPPORT_EMAIL=support@example.com
OWNER_NOTIFY_EMAILS=owner@example.com
```

Until the client signs off the questionnaire content (see `OPERATIONS.md#approving-content`), production also needs `ALLOW_UNAPPROVED_ASSESSMENTS=true` to show any questionnaire. Pages and PDFs then carry a "Preview" marker.

---

## Vercel

1. **Import the repository.** In Vercel, choose *Add New → Project* and import it. The framework is detected as Next.js. Leave the build and output settings at their defaults. Vercel runs the `vercel-build` script automatically, which generates the Prisma client, applies migrations and builds.
2. **Add a database.** In the project's *Storage* tab, choose *Create Database* and pick **Neon** (Postgres). Choose the region closest to your users (for India: AWS `ap-south-1`, Mumbai), then connect it to the project. Neon adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used for migrations) automatically.
3. **Add environment variables** from the list above under *Settings → Environment Variables*. Set `DATABASE_PROVIDER=postgresql` and `APP_URL` to your final domain. Keep `JOB_WORKER_INTERVAL_MS=0`. Use `REPORT_STORAGE=database` (default) or `s3`. The local filesystem on Vercel is temporary.
4. **Set the function region** close to the database: *Settings → Functions → Function Region*, for example `bom1` (Mumbai) when Neon is in `ap-south-1`.
5. **Deploy.** Then open `https://<your-domain>/api/health/ready`. It should return `{"status":"ready"}`.
6. **Cron.** `vercel.json` schedules `/api/v1/cron/jobs` once a day, the maximum on the Hobby plan. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. Normal processing doesn't depend on cron: every request that creates work processes it immediately after responding, and the student's status page keeps nudging retries. Cron is the safety net for retries nobody is waiting on. On the Pro plan, change the schedule to `*/5 * * * *`. On Hobby you can also point a free external scheduler (for example cron-job.org) at the URL with the same header every 5 minutes.
7. **Preview deployments.** In the Preview environment, set `APP_ENV=staging` and `PAYMENT_PROVIDER=mock`, and point `DATABASE_URL` at a separate Neon branch, so previews never touch live payments or data.

---

## Hostinger Node.js Web Apps (Business and Cloud plans)

Hostinger's managed Node.js hosting builds and runs the app from GitHub or an uploaded archive. Menu names in hPanel change from time to time; the steps below describe what to set rather than exact clicks.

1. **Create the database.** In hPanel, open *Databases → MySQL Databases*, create a database and user, and note the host, database name, user and password.

   ```
   DATABASE_PROVIDER=mysql
   DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
   DATABASE_POOL_MAX=3
   ```
   URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`). Shared MySQL plans limit connections, so keep the pool small.

   *Alternative:* use an external Postgres (Neon or Supabase free tier) with `DATABASE_PROVIDER=postgresql`.
2. **Create the Node.js app.** Add a website of type Node.js app, connect the GitHub repository (or upload a zip of the folder without `node_modules` and `.next`), and choose **Node.js 22**.
3. **Build and start commands.**
   - Build command: `npm run build:prod` (generates the Prisma client, applies migrations, builds)
   - Start command: `npm run start`
   - If the panel only lets you change the start command, use `npm run start:prod` (applies migrations, then starts) and leave the build as `npm run build`.
4. **Environment variables.** Add everything from the list above in the app's environment settings, plus:

   ```
   JOB_WORKER_INTERVAL_MS=30000
   REPORT_STORAGE=database
   ```
   The worker processes retries every 30 seconds inside the running app.
5. **Cron (recommended as a backup).** In hPanel, open *Advanced → Cron Jobs* and add an every-5-minutes job:

   ```bash
   curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/v1/cron/jobs > /dev/null
   ```
6. **Email.** Create a mailbox (for example `reports@your-domain`) in Hostinger Email and use `smtp.hostinger.com`, port `465`, `SMTP_SECURE=true`. Add the SPF and DKIM records hPanel suggests so reports don't land in spam.
7. **Domain and SSL.** Attach your domain and enable the free SSL certificate. Set `APP_URL` to the `https://` address.
8. **Check** `https://<your-domain>/api/health/ready`.

---

## Hostinger VPS or any Docker host

Choose an Ubuntu VPS template with Docker preinstalled (or install Docker Engine and the Compose plugin).

```bash
git clone <your-repo> career-assessment && cd career-assessment
cp .env.example .env
# edit .env: production values plus
#   DOMAIN=assessments.example.com
#   POSTGRES_PASSWORD=<strong password>
#   APP_URL=https://assessments.example.com
docker compose up -d --build
```

Point the domain's DNS `A` record at the server's IP before starting. Caddy obtains and renews the HTTPS certificate automatically.

- `db` is PostgreSQL 17 with a persistent volume.
- `migrate` applies migrations once, then exits. The app only starts after it succeeds.
- `app` is the standalone Next.js server with the in-process job worker enabled.
- `caddy` provides HTTPS on ports 80 and 443.

To update, run `git pull && docker compose up -d --build`. Back up the `db-data` volume (see `OPERATIONS.md#backups`).

The same `Dockerfile` works on Render, Railway, Fly.io, Google Cloud Run and AWS. Run the `migrate` target (or `npx prisma migrate deploy`) as a release step, then run the `runner` target.

---

## After every deployment

1. **Health:** `GET /api/health` (liveness) and `GET /api/health/ready` (configuration + database).
2. **Razorpay webhook** (once per environment): in the Razorpay Dashboard, open *Accounts & Settings → Webhooks → Add New Webhook*.
   - URL: `https://<your-domain>/api/v1/webhooks/payments/razorpay`
   - Secret: the value of `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`

   Use Test Mode keys and a staging URL first, then repeat with Live keys.

   Also confirm **automatic payment capture** is on (*Accounts & Settings → Payment Capture*; the default for new accounts). The app unlocks reports only for captured payments, so with manual capture reports stay locked until you capture each payment yourself.
3. **Smoke test.** On staging (mock payments) run:

   ```bash
   BASE_URL=https://staging.example.com E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
   ```
   On production, take one real ₹1 test: temporarily set a module's price to `100`, buy it, confirm the email arrives and the admin shows the payment as verified by webhook, then restore the price.
4. **WhatsApp** (optional): in Meta Business Manager, create a WhatsApp Cloud API app and a phone number, generate a permanent System User token, and get a **Utility** template approved:
   - Name: `report_ready`, language `en`
   - Body: `Hi {{1}}, your assessment report is ready. Download it securely here: {{2}}`

   Then set `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`.

---

## Migrations

`prisma/schema.prisma` (PostgreSQL) is the source of truth. `prisma/mysql/schema.prisma` is generated from it.

When you change the schema:

```bash
# 1. edit prisma/schema.prisma (portable types only: see the header comment)
npm run db:sync-mysql
# 2. PostgreSQL migration (against a local Postgres)
DATABASE_PROVIDER=postgresql npx prisma migrate dev --name <change>
# 3. MySQL migration (against a local MySQL)
DATABASE_PROVIDER=mysql DATABASE_URL=mysql://root@localhost:3306/dev npx prisma migrate dev --name <change>
# 4. regenerate the client for your usual engine
DATABASE_PROVIDER=postgresql npx prisma generate
```

Commit both migration folders. Deployments apply them with `prisma migrate deploy` (part of `build:prod`, `vercel-build`, `start:prod` and the Docker `migrate` service).

## Why some build tools are in `dependencies`

`prisma`, `typescript`, `tailwindcss` and the font packages are needed at build time. Some hosts install only `dependencies` before building, so these are listed there to guarantee the build works everywhere. They don't add weight to the running app.
