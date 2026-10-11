import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getConfig } from "@/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy notice" };

// Describes what this software actually does with data. The operator must review it with legal
// counsel (retention period, grievance officer, jurisdiction) before launch — spec §11.
export default function PrivacyPage() {
  const config = getConfig();
  const sections: [string, string[]][] = [
    [
      "What we collect",
      [
        "Your name, email address and, if you give it, your WhatsApp number.",
        "Your answers to the questionnaire you choose, and the results calculated from them.",
        "Payment status and the payment reference from our payment provider. We never see or store your card, UPI or bank details.",
        "The agreements you tick, with the date and the version of the wording you saw.",
      ],
    ],
    [
      "Why we use it",
      [
        "To score your answers, prepare your report and send it to you.",
        "To confirm your payment and make sure only you can open your report.",
        "To help you if something goes wrong, using your report reference.",
      ],
    ],
    [
      "Who can see it",
      [
        "You, in the browser where you started, and through the private links we send you.",
        "A small number of authorised staff, for support. Every time they open a record, it is logged.",
        "Service providers that run the service for us: hosting, database, email, WhatsApp (only if you ask for it) and payments. They receive only what they need.",
      ],
    ],
    [
      "How long we keep it",
      ["We keep your record for as long as needed to provide the report and meet legal obligations. Ask us to delete it at any time."],
    ],
    [
      "Your choices",
      [
        "You can ask for a copy of your data, a correction, or deletion by writing to us with your report reference.",
        "WhatsApp delivery is optional and only used if you tick the box.",
      ],
    ],
  ];
  return (
    <>
      <SiteHeader orgName={config.orgName} />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-8 pt-6 sm:px-6">
        <h1 className="text-3xl sm:text-4xl">Privacy notice</h1>
        <p className="mt-4 text-lg text-slate">How {config.orgName} handles your information.</p>
        <div className="mt-10 space-y-10">
          {sections.map(([title, lines]) => (
            <section key={title}>
              <h2 className="text-xl">{title}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
          {config.supportEmail ? (
            <section>
              <h2 className="text-xl">Contact</h2>
              <p className="mt-3">
                Write to <a className="underline" href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>.
              </p>
            </section>
          ) : null}
        </div>
      </main>
      <SiteFooter orgName={config.orgName} supportEmail={config.supportEmail} />
    </>
  );
}
