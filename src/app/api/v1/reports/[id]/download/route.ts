import { getDb } from "@/server/db";
import { apiHandler } from "@/server/http";
import { enforceRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { authoriseReport, readReportPdf } from "@/server/workflow/report-access";

export const dynamic = "force-dynamic";

/** Streams the PDF to the attempt owner (cookie) or a signed-link holder, after the unlock check. */
export const GET = apiHandler<{ id: string }>(async ({ req, params, ip, requestId }) => {
  await enforceRateLimit(RATE_RULES.download, ip);
  const token = req.nextUrl.searchParams.get("token");
  const access = token ? ({ via: "link", token } as const) : ({ via: "cookie" } as const);
  const report = await authoriseReport(params.id, access);
  const { publicRef } = await getDb().attempt.findUniqueOrThrow({ where: { id: report.attemptId }, select: { publicRef: true } });
  const pdf = await readReportPdf(report, { via: access.via, correlationId: requestId });
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="report-${publicRef}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
