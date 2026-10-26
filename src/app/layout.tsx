import type { Metadata } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

const uiSans = Schibsted_Grotesk({ variable: "--font-ui-sans", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PRD Builder",
  description: "Interview your way to a checked PRD for a product that uses AI or agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${uiSans.variable} ${plexMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
