import Link from "next/link";

export function SiteFooter({ orgName, supportEmail }: { orgName: string; supportEmail?: string }) {
  return (
    <footer className="mt-24 border-t border-rule bg-paper">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-slate sm:grid-cols-[1fr_auto] sm:px-6">
        <div className="space-y-2">
          <p className="font-medium text-ink">{orgName}</p>
          <p className="max-w-[60ch]">
            Results describe preferences and interests you report. They are not a diagnosis and do not guarantee career fit or success.
          </p>
          <p className="max-w-[60ch] text-muted">
            Questionnaire material is reproduced from the Indian School of Counselling and Healing Studies workbook supplied for this service.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Link href="/privacy" className="hover:text-ink">
            Privacy notice
          </Link>
          {supportEmail ? (
            <a href={`mailto:${supportEmail}`} className="hover:text-ink">
              {supportEmail}
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
