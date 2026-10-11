import type { Metadata, Viewport } from "next";
import "@fontsource/lexend/latin-300.css";
import "@fontsource/lexend/latin-400.css";
import "@fontsource/lexend/latin-500.css";
import "@fontsource/lexend/latin-600.css";
import "@fontsource/lexend-exa/latin-500.css";
import "@fontsource/lexend-exa/latin-600.css";
import "@fontsource/lexend-mega/latin-600.css";
import "./globals.css";

const orgName = process.env.NEXT_PUBLIC_ORG_NAME ?? "Psychology-Based Career Assessment";

export const metadata: Metadata = {
  title: { default: orgName, template: `%s | ${orgName}` },
  description: "Personality type, career interests and learning style questionnaires with a personalised PDF report.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#17213a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
