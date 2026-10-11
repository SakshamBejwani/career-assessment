// End-to-end smoke test over HTTP against a running deployment (local or staging).
//
//   BASE_URL=http://localhost:3000 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
//
// Requires PAYMENT_PROVIDER=mock on the target (never production). Exercises the real routes:
// origin checks, cookie-scoped access, autosave, validation, background jobs via after(),
// the payment gate, PDF download, cron auth and the admin API.
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ORIGIN = new URL(BASE).origin;
let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

class Client {
  cookies = new Map();
  async req(path, { method = "GET", body, origin = true, headers = {} } = {}) {
    const h = { ...headers };
    if (body !== undefined) h["content-type"] = "application/json";
    if (origin && method !== "GET") h.origin = ORIGIN;
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }
}

async function waitFor(client, id, predicate, label, timeoutMs = 45_000) {
  const start = Date.now();
  let view;
  while (Date.now() - start < timeoutMs) {
    view = (await client.req(`/api/v1/attempts/${id}`)).data;
    if (predicate(view)) return view;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${label}; last status ${view?.status}`);
}

async function main() {
  console.log(`E2E against ${BASE}`);
  const student = new Client();
  const stranger = new Client();

  check("liveness", (await student.req("/api/health")).status === 200);
  const ready = await student.req("/api/health/ready");
  check("readiness", ready.status === 200, JSON.stringify(ready.data));

  const list = await student.req("/api/v1/assessments");
  const vark = list.data.assessments?.find((a) => a.id === "vark_learning_styles");
  check("assessments listed", list.data.assessments?.length === 3);
  check("VARK available", vark?.available === true, JSON.stringify(vark));

  const q = await student.req("/api/v1/assessments/vark_learning_styles");
  check("questionnaire served", q.data.questionnaire?.items?.length === 14);
  check("no scoring key leaked", !JSON.stringify(q.data).includes("answerKey"));

  const createBody = {
    assessmentId: "vark_learning_styles",
    fullName: "E2E Student",
    email: `e2e.${Date.now()}@example.test`,
    whatsapp: "9876543210",
    consents: { dataProcessing: true, ageOrGuardian: true, whatsapp: true },
  };
  check("cross-site create rejected", (await student.req("/api/v1/attempts", { method: "POST", body: createBody, origin: false })).status === 403);
  const missingConsent = await student.req("/api/v1/attempts", { method: "POST", body: { ...createBody, consents: { dataProcessing: false, ageOrGuardian: true } } });
  check("consent required", missingConsent.status === 422);

  const created = await student.req("/api/v1/attempts", { method: "POST", body: createBody });
  check("attempt created", created.status === 201, JSON.stringify(created.data));
  const id = created.data.attemptId;
  const upfront = created.data.status === "awaiting_payment";

  check("other browsers cannot read the attempt", (await stranger.req(`/api/v1/attempts/${id}`)).status === 404);

  if (upfront) {
    check("answers blocked before upfront payment", (await student.req(`/api/v1/attempts/${id}/responses`, { method: "PUT", body: { answers: { vark_q01: ["a"] } } })).status === 409);
    await student.req(`/api/v1/attempts/${id}/payment-mock`, { method: "POST", body: { outcome: "succeeded" } });
  }

  const items = q.data.questionnaire.items;
  const answers = Object.fromEntries(items.map((it, i) => [it.id, i % 3 === 0 ? ["a", "b"] : ["b"]]));
  const saved = await student.req(`/api/v1/attempts/${id}/responses`, { method: "PUT", body: { answers: { vark_q01: ["a"], vark_q02: ["a", "c"] } } });
  check("autosave", saved.status === 200 && saved.data.saved === 2, JSON.stringify(saved.data));
  check("invalid option rejected", (await student.req(`/api/v1/attempts/${id}/responses`, { method: "PUT", body: { answers: { vark_q05: ["d"] } } })).status === 422);
  check("stranger cannot write answers", (await stranger.req(`/api/v1/attempts/${id}/responses`, { method: "PUT", body: { answers: { vark_q01: ["b"] } } })).status === 404);

  const incomplete = await student.req(`/api/v1/attempts/${id}/submit`, { method: "POST", body: { answers: {}, submissionKey: "e2e-incomplete-key" } });
  check("incomplete submission rejected", incomplete.status === 422);

  const key = `e2e-${Date.now()}`;
  const submitted = await student.req(`/api/v1/attempts/${id}/submit`, { method: "POST", body: { answers, submissionKey: key } });
  check("submitted", submitted.status === 200, JSON.stringify(submitted.data).slice(0, 200));
  const replay = await student.req(`/api/v1/attempts/${id}/submit`, { method: "POST", body: { answers, submissionKey: key } });
  check("submission replay is idempotent", replay.status === 200);

  if (!upfront) {
    const locked = await waitFor(student, id, (v) => v.status === "report_ready_locked", "locked report");
    check("report generated and locked", Boolean(locked.report?.id));
    const dl = await student.req(`/api/v1/reports/${locked.report.id}/download`);
    check("download refused before payment", dl.status === 403);

    await student.req(`/api/v1/attempts/${id}/payment-mock`, { method: "POST", body: { outcome: "failed" } });
    const afterFail = (await student.req(`/api/v1/attempts/${id}`)).data;
    check("failed payment keeps report locked", afterFail.status === "report_ready_locked" && afterFail.payable === true);
    check("stranger cannot pay", (await stranger.req(`/api/v1/attempts/${id}/payment-mock`, { method: "POST", body: { outcome: "succeeded" } })).status === 404);
    await student.req(`/api/v1/attempts/${id}/payment-mock`, { method: "POST", body: { outcome: "succeeded" } });
  }

  const done = await waitFor(student, id, (v) => v.status === "completed", "completion");
  check("report delivered", done.deliveries.every((d) => d.status === "succeeded") && done.deliveries.length === 2, JSON.stringify(done.deliveries));
  const pdf = await student.req(`/api/v1/reports/${done.report.id}/download`);
  const bytes = Buffer.from(pdf.data);
  check("PDF downloads after payment", pdf.status === 200 && bytes.subarray(0, 5).toString() === "%PDF-", `status ${pdf.status}`);
  check("stranger cannot download", (await stranger.req(`/api/v1/reports/${done.report.id}/download`)).status === 404);
  check("forged link rejected", (await stranger.req(`/api/v1/reports/${done.report.id}/download?token=abc.def`)).status === 404);
  check("results page renders", (await student.req(`/attempt/${id}/results`)).status === 200);

  check("cron needs its secret", (await stranger.req("/api/v1/cron/jobs")).status === 401);
  check("unknown webhook provider rejected", (await stranger.req("/api/v1/webhooks/payments/stripe", { method: "POST", body: {}, origin: false })).status === 404);

  const admin = new Client();
  check("admin API requires sign-in", (await admin.req("/api/v1/admin/attempts")).status === 401);
  check("wrong admin password rejected", (await admin.req("/api/v1/admin/session", { method: "POST", body: { email: "nobody@example.test", password: "nope" } })).status === 401);
  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
    const login = await admin.req("/api/v1/admin/session", { method: "POST", body: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } });
    check("admin sign-in", login.status === 200);
    const found = await admin.req(`/api/v1/admin/attempts?q=${encodeURIComponent(created.data.reference)}`);
    check("admin finds attempt by reference", found.data.rows?.[0]?.id === id);
    const detail = await admin.req(`/api/v1/admin/attempts/${id}`);
    check("admin detail excludes access token", detail.status === 200 && !JSON.stringify(detail.data).includes("accessTokenHash"));
    const resend = await admin.req(`/api/v1/admin/attempts/${id}/resend`, { method: "POST", body: {} });
    check("admin re-send queues delivery", resend.status === 200 && resend.data.queued === 2);
    check("admin pages render", (await admin.req("/admin")).status === 200);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
