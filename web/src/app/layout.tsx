import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { TopBar } from "@/components/TopBar";
import { GridTrail } from "@/components/GridTrail";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Showup — on-chain anti-flake deposits",
  description:
    "Put a refundable deposit on showing up. Reserve, check in, reclaim — on Stellar Testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <GridTrail />
          <TopBar />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
            {children}
          </main>
          <footer className="border-t border-border">
            <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted-2 sm:px-6">
              Showup runs on Stellar Testnet. No real funds are used.
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
