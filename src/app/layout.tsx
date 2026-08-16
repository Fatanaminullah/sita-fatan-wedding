import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { isProductionSite, siteOrigin } from "@/lib/site-env";

const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// metadataBase makes the file-convention opengraph-image.png resolve to an
// absolute URL. Without it Next emits a relative og:image, which WhatsApp and
// iMessage silently drop, so the rich link falls back to a bare text row.
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  // Anything that is not the production domain is a staging or preview
  // deployment and must not be indexed. Paired with app/robots.ts: robots.txt
  // asks a crawler not to fetch, this stops an already-fetched page from being
  // indexed. Fails safe, since an unset NEXT_PUBLIC_SITE_URL is treated as
  // production only when it matches the real origin exactly.
  robots: isProductionSite() ? undefined : { index: false, follow: false },
  title: "Wedding Guest Management",
  description:
    "Internal guest management for the Sita and Fatan wedding: guest list, per-inviter capacity, waitlist, and RSVP.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${firaSans.variable} ${firaCode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
