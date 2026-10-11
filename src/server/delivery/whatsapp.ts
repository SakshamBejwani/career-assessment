import "server-only";
import { getConfig } from "../config";
import { logger } from "../observability/logger";
import { DeliveryError } from "./email";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Sends the approved "report ready" template via the WhatsApp Cloud API.
 * Template body parameters: {{1}} = first name, {{2}} = signed report link.
 * Business-initiated messages must use a Meta-approved template.
 */
export async function sendReportWhatsapp(input: { toE164: string; firstName: string; link: string }): Promise<{ messageId: string | null }> {
  const { whatsapp } = getConfig();
  if (whatsapp.provider === "none") throw new DeliveryError("whatsapp_disabled", "WhatsApp delivery is disabled", true);
  if (whatsapp.provider === "log") {
    logger.info("whatsapp (log adapter)", { template: whatsapp.templateName });
    return { messageId: `log-${Date.now()}` };
  }
  const meta = whatsapp.meta!;
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${meta.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${meta.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.toE164.replace(/^\+/, ""),
        type: "template",
        template: {
          name: whatsapp.templateName,
          language: { code: whatsapp.templateLang },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: input.firstName.slice(0, 60) },
                { type: "text", text: input.link },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DeliveryError("whatsapp_unreachable", "Could not reach WhatsApp Cloud API");
  }
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number } };
  if (!res.ok) {
    const code = body.error?.code;
    // 4xx other than rate limits (e.g. invalid number, template not approved) need human action.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new DeliveryError(`whatsapp_${code ?? res.status}`, `WhatsApp send failed (${res.status})`, permanent);
  }
  return { messageId: body.messages?.[0]?.id ?? null };
}
