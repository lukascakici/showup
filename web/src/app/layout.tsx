import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { SITE_URL, X_HANDLE, X_URL } from "@/lib/links";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/og";
import { TopBar } from "@/components/TopBar";
import { NetworkBanner } from "@/components/NetworkBanner";
import { Backdrop } from "@/components/Backdrop";
import { WalletPicker } from "@/components/WalletPicker";

/**
 * One face, everywhere: headings, body, balances and addresses alike.
 *
 * Self-hosted rather than fetched, so there is no second origin to reach before
 * the first paint and nothing to fall back from mid-render. Two cuts, 89kB of
 * woff2 between them, and `display: swap` so the page is readable while they
 * arrive.
 *
 * The weight ranges are wider than the two files: the design asks for 500 in a
 * lot of places, and a browser told only about 400 and 700 is free to synthesise
 * something in between. Claiming 100–500 for the regular cut and 600–900 for the
 * bold one means every weight the CSS names resolves to a real drawing.
 *
 * Turkish is covered — ş, ğ, ı, İ, ç, ö, ü are all in both cuts, checked against
 * the cmap rather than assumed, because event titles are typed by organizers in
 * Turkey and a fallback mid-word is exactly what this replaces.
 */
const jeko = localFont({
  src: [
    { path: "./fonts/jeko-regular.woff2", weight: "100 500", style: "normal" },
    { path: "./fonts/jeko-bold.woff2", weight: "600 900", style: "normal" },
  ],
  variable: "--font-jeko",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/**
 * `metadataBase` is what turns `opengraph-image.tsx` into the absolute URL a
 * chat client can actually fetch; without it Next emits a relative path and
 * warns at build time. It is also the reason the OG image declared once here
 * cascades onto every route, including `/e/[id]`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    site: `@${X_HANDLE}`,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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
 * without it the bar above the page stays light grey over a black page. It is
 * `--background` from `globals.css`, spelled out because a meta tag cannot read
 * a custom property.
 */
export const viewport: Viewport = {
  themeColor: "#0f0f10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jeko.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <Backdrop />
          <TopBar />
          <NetworkBanner />
          <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-8 pb-24 sm:px-7 sm:pt-11">
            {children}
          </main>
          <footer className="border-t border-border">
            {/* The home indicator sits over the last few pixels of the page on a
                modern iPhone, so the note gets the inset added to its own
                padding rather than being read through a bar. */}
            <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 text-[13px] text-muted-3 sm:px-7">
              <span>Showup — deposit-backed attendance on Stellar Testnet.</span>
              <span className="flex items-center gap-4">
                No real funds are used.
                {/* Padding and a matching negative margin: a thumb-sized target
                    that doesn't push the footer taller than the line it sits on. */}
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Showup on X, @${X_HANDLE}`}
                  className="-my-3 -mr-2 flex size-11 items-center justify-center transition-colors hover:text-foreground-2"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </span>
            </div>
          </footer>
          <WalletPicker />
        </WalletProvider>
      </body>
    </html>
  );
}
