import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import varkQ from "@/content/questionnaires/vark_learning_styles.v1.0.0.json";
import { resetConfigForTests } from "@/server/config";
import { getDb } from "@/server/db";
import { createAttempt, submitAttempt } from "@/server/workflow/attempts";
import { simulateMockPayment } from "@/server/workflow/payments";
import { runDueJobs } from "@/server/workflow/runner";
import { setTestEnv } from "../support/env";

// Real SMTP round trip through Nodemailer to a local sink, and the exact WhatsApp Cloud API request.
interface Received {
  from: string;
  to: string[];
  raw: string;
}
const inbox: Received[] = [];
let server: SMTPServer;
let port = 0;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, done) {
      let raw = "";
      stream.on("data", (c: Buffer) => (raw += c.toString("utf8")));
      stream.on("end", () => {
        inbox.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address), raw });
        done();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  inbox.length = 0;
  setTestEnv({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_PROVIDER: process.env.TEST_DATABASE_PROVIDER ?? "postgresql",
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(port),
    SMTP_SECURE: "false",
    EMAIL_FROM: "Career Reports <reports@example.test>",
    OWNER_NOTIFY_EMAILS: "owner@example.test",
    WHATSAPP_PROVIDER: "meta",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_ACCESS_TOKEN: "test-token",
  });
  resetConfigForTests();
  await getDb().student.deleteMany();
});

describe("report delivery adapters", () => {
  it("emails the PDF and a signed link over SMTP, and calls the WhatsApp template API", async () => {
    const realFetch = globalThis.fetch;
    const graphCalls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://graph.facebook.com/")) {
        graphCalls.push({ url, body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") });
        return new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 });
      }
      return realFetch(input, init);
    });
    try {
      const { attempt } = await createAttempt(
        {
          assessmentId: "vark_learning_styles",
          fullName: "Meera Iyer",
          email: "meera@example.test",
          whatsapp: "+91 98765 43210",
          consents: { dataProcessing: true, ageOrGuardian: true, whatsapp: true },
        },
        "d1",
      );
      await submitAttempt(attempt, { answers: Object.fromEntries(varkQ.items.map((i) => [i.id, ["b"]])), submissionKey: "delivery-1" }, "d1");
      await simulateMockPayment(await getDb().attempt.findUniqueOrThrow({ where: { id: attempt.id } }), "succeeded", "d1");
      await runDueJobs({ attemptId: attempt.id });

      const student = inbox.find((m) => m.to.includes("meera@example.test"));
      expect(student, "student email received").toBeDefined();
      expect(student!.from).toBe("reports@example.test");
      expect(student!.raw).toMatch(/Subject: Your learning style report is ready/);
      expect(student!.raw).toMatch(/Content-Type: application\/pdf; name=report-PBCA-[A-Z0-9]{6}\.pdf/);
      expect(student!.raw.replace(/=\r?\n/g, "")).toMatch(/http:\/\/localhost:3000\/r\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);

      const owner = inbox.find((m) => m.to.includes("owner@example.test"));
      expect(owner?.raw).toMatch(/Subject: Payment received: PBCA-/);
      expect(owner?.raw).not.toMatch(/meera/i);

      expect(graphCalls).toHaveLength(1);
      expect(graphCalls[0]!.url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
      expect(graphCalls[0]!.auth).toBe("Bearer test-token");
      expect(graphCalls[0]!.body).toMatchObject({
        messaging_product: "whatsapp",
        to: "919876543210",
        type: "template",
        template: { name: "report_ready", language: { code: "en" } },
      });
      const params = (graphCalls[0]!.body.template as { components: { parameters: { text: string }[] }[] }).components[0]!.parameters;
      expect(params[0]!.text).toBe("Meera");
      expect(params[1]!.text).toMatch(/^http:\/\/localhost:3000\/r\//);

      const jobs = await getDb().job.findMany({ where: { attemptId: attempt.id, kind: { in: ["deliver_email", "deliver_whatsapp"] } } });
      expect(jobs.map((j) => j.status)).toEqual(["succeeded", "succeeded"]);
      expect(jobs.find((j) => j.channel === "whatsapp")?.providerMessageId).toBe("wamid.TEST");
      expect((await getDb().attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe("completed");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
