/**
 * Optional in-process job loop for long-running Node servers (VPS, Docker, Hostinger Node.js apps).
 * Enable with JOB_WORKER_INTERVAL_MS > 0. Leave at 0 on Vercel, where functions are short-lived
 * and Vercel Cron calls the same endpoint instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const interval = Number(process.env.JOB_WORKER_INTERVAL_MS ?? 0);
  const secret = process.env.CRON_SECRET;
  if (!interval || interval < 5000 || !secret || process.env.VERCEL) return;

  const port = process.env.PORT ?? "3000";
  const url = `http://127.0.0.1:${port}/api/v1/cron/jobs`;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55_000) });
    } catch {
      // The server may still be starting; the next tick retries.
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, interval);
  timer.unref?.();
  console.log(JSON.stringify({ level: "info", msg: "in-process job worker enabled", intervalMs: interval }));
}
