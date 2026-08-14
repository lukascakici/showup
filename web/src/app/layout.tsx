import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Dancing_Script } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { TopBar } from "@/components/TopBar";
import { GridTrail } from "@/components/GridTrail";
import { WalletPicker } from "@/components/WalletPicker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const handwriting = Dancing_Script({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Showup — on-chain anti-flake deposits",
  description:
    "Put a refundable deposit on showing up. Reserve, check in, reclaim — on Stellar Testnet.",
};

/**
 * Only the theme colour is set here; the width and scale come from Next's own
 * default, which is already `width=device-width, initial-scale=1`.
 *
 * Deliberately *not* `maximum-scale=1` or `user-scalable=no`. That is the usual
 * way to stop iOS zooming into a form, and it works by taking pinch-zoom away
 * from everyone who needs it. The inputs are 16px instead — see `ui.tsx`.
 *
 * The colour is what mobile Safari and Chrome paint their own chrome with, so
 * without it the bar above the page stays light grey over a black page.
 */
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${handwriting.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <GridTrail />
          <TopBar />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
            {children}
          </main>
          <footer className="border-t border-border">
            {/* The home indicator sits over the last few pixels of the page on
                a modern iPhone, so the note gets the inset added to its own
                padding rather than being read through a bar. */}
            <div className="mx-auto max-w-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-xs text-muted-2 sm:px-6">
              Showup runs on Stellar Testnet. No real funds are used.
            </div>
          </footer>
          <WalletPicker />
        </WalletProvider>
      </body>
    </html>
  );
}
