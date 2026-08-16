import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://sitafatan.wedding",
  ),
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
