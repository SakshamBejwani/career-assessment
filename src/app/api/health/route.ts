export const dynamic = "force-dynamic";

/** Liveness: the process is up. No dependencies are checked. */
export function GET() {
  return Response.json({ status: "ok", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
