// Triggers one background-job pass on a running deployment (useful from any cron).
//   APP_URL=https://example.com CRON_SECRET=... node scripts/run-jobs.mjs
import "dotenv/config";

const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const res = await fetch(`${base}/api/v1/cron/jobs`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
