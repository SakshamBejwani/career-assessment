// Browser walkthrough: drives Chromium through every student journey and the admin area,
// saving screenshots and failing on any browser console error. Use after UI changes.
//
//   npm install --no-save playwright@1.64.0 && npx playwright install chromium
//   BASE_URL=http://localhost:3000 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
//     node scripts/ui-walkthrough.mjs ./screenshots
//
// The target must use PAYMENT_PROVIDER=mock (never production). Each run starts 4 attempts; the app
// allows 10 per hour per IP, so clear the `rate_limits` table between repeated local runs.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright@1.64.0 && npx playwright install chromium");
  process.exit(1);
}

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const OUT = resolve(process.argv[2] ?? "screenshots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const problems = [];
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()} console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${page.url()} error: ${e.message}`));
  return page;
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const step = (label) => console.log(`- ${label}`);

async function start(page, id, name) {
  await page.goto(`${BASE}/assessments/${id}`);
  await page.fill("#field-fullName", name);
  await page.fill("#field-email", `${name.split(" ")[0].toLowerCase()}.${Date.now()}@example.test`);
  await page.check("#field-dataProcessing");
  await page.check("#field-ageOrGuardian");
  await page.click("button[type=submit]");
  // Either we navigate to the attempt, or the form shows an error (e.g. the rate limit).
  const alert = page.locator("form [role=alert]");
  await Promise.race([page.waitForURL(/\/attempt\//, { timeout: 30_000 }), alert.waitFor({ timeout: 30_000 })]);
  if (await alert.count()) throw new Error(`start form refused: ${await alert.innerText()}`);
  await page.waitForTimeout(600);
  // Upfront workflow: pay first.
  if (await page.locator("text=Simulate successful payment").count()) {
    await page.click("text=Simulate successful payment");
    await page.waitForSelector("h2", { timeout: 30_000 });
    await page.reload();
    await page.waitForTimeout(600);
  }
}

// After submitting: post-completion attempts wait for payment; upfront ones go straight to the report.
const afterSubmit = (page) =>
  page.locator("text=Unlock your report").or(page.locator("text=See your results")).first().waitFor({ timeout: 45_000 });

async function payAndOpenResults(page, name) {
  if (await page.locator("text=Simulate successful payment").count()) {
    await page.click("text=Simulate successful payment");
  }
  await page.waitForSelector("text=See your results", { timeout: 45_000 });
  await shot(page, `${name}-status-unlocked`);
  await page.click("text=See your results");
  await page.waitForSelector("text=What your results describe");
  await shot(page, `${name}-results`);
}

try {
  step("landing");
  const desktop = await newPage(DESKTOP);
  await desktop.goto(BASE);
  await desktop.waitForTimeout(2600); // let the hero animation finish
  await shot(desktop, "landing-desktop");
  const phone = await newPage(PHONE);
  await phone.goto(BASE);
  await phone.waitForTimeout(2600);
  await shot(phone, "landing-phone");

  step("form validation");
  await desktop.goto(`${BASE}/assessments/mbti_personality`);
  await desktop.click("button[type=submit]");
  await desktop.waitForSelector(".field-error");
  await shot(desktop, "start-form-errors", false);

  step("personality type: 70 questions by keyboard");
  await start(desktop, "mbti_personality", "Ananya Krishnan");
  await shot(desktop, "mbti-question", false);
  for (let i = 0; i < 70; i++) {
    await desktop.keyboard.press(i % 3 ? "b" : "a");
    await desktop.waitForTimeout(320);
  }
  await desktop.waitForSelector("text=All questions answered");
  await shot(desktop, "mbti-review", false);
  await desktop.click("text=Submit my answers");
  await afterSubmit(desktop);
  await shot(desktop, "mbti-status-after-submit");
  await payAndOpenResults(desktop, "mbti");

  step("career interests: six areas");
  const riasec = await newPage(DESKTOP);
  await start(riasec, "holland_riasec", "Rohan Mehta");
  const ticks = [[0, 1, 4, 8], [0, 1, 2, 3, 4, 5, 6, 8, 9, 10], [1, 2, 4, 5, 8, 9, 10], [0, 1, 2, 3, 4, 6, 8, 9, 11], [2, 4, 8], [0, 1, 3, 5, 9, 10]];
  for (let area = 0; area < 6; area++) {
    const boxes = await riasec.$$("label:has(input[type=checkbox])");
    for (const i of ticks[area]) await boxes[i].click();
    if (area === 1) await shot(riasec, "riasec-area", false);
    await riasec.click(area === 5 ? "text=Review" : "text=Next area");
    await riasec.waitForTimeout(300);
  }
  await riasec.click("text=Submit my answers");
  await afterSubmit(riasec);
  await payAndOpenResults(riasec, "riasec");

  step("learning style on a phone: multi-select");
  const vark = await newPage(PHONE);
  await start(vark, "vark_learning_styles", "Sana Iqbal");
  for (let q = 0; q < 14; q++) {
    await vark.keyboard.press("b");
    if (q % 4 === 0) await vark.keyboard.press("a");
    if (q === 1) await shot(vark, "vark-question-phone", false);
    await vark.keyboard.press("Enter");
    await vark.waitForTimeout(250);
  }
  await vark.waitForSelector("text=All questions answered");
  await vark.click("text=Submit my answers");
  await afterSubmit(vark);
  await payAndOpenResults(vark, "vark-phone");

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    step("admin");
    const admin = await newPage(DESKTOP);
    await admin.goto(`${BASE}/admin/login`);
    await admin.fill("#admin-email", process.env.ADMIN_EMAIL);
    await admin.fill("#admin-password", process.env.ADMIN_PASSWORD);
    await admin.click("button[type=submit]");
    await admin.waitForURL(`${BASE}/admin`);
    await shot(admin, "admin-list", false);
    await admin.click("table a >> nth=0");
    await admin.waitForSelector("text=Audit trail");
    await shot(admin, "admin-detail");
  } else {
    step("admin skipped (set ADMIN_EMAIL and ADMIN_PASSWORD)");
  }
} catch (error) {
  problems.push(`walkthrough stopped: ${error.message}`);
} finally {
  await browser.close();
}

console.log(`\nScreenshots in ${OUT}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("No browser errors.");
