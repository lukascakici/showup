import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/og";
import { SITE_URL } from "@/lib/links";
import { markDataUri } from "@/lib/mark";

/**
 * The card behind every Showup link.
 *
 * Generated once at build time rather than per request: nothing on it depends
 * on which event is being shared, so making a chat client wait on a render —
 * or on an RPC read — would buy nothing. The per-event facts travel in the
 * title and description, which cost one chain read the page was making anyway.
 *
 * Same rules as the app: off-black, one silver accent, no gradient, no emoji,
 * and Jeko throughout. The colours are spelled out because Satori resolves no
 * custom properties, and the font is handed over as TTF because it reads TTF,
 * OTF and WOFF but not the WOFF2 the browser gets.
 */

export const alt = "Showup — put a refundable deposit on showing up";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#cdcfd6";
const BACKGROUND = "#0f0f10";
const FOREGROUND = "#e6e6e9";
const MUTED = "#9a9ba1";
const QUIET = "#696a71";

/**
 * Read off disk rather than fetched.
 *
 * The documented `fetch(new URL('./x.ttf', import.meta.url))` is not implemented
 * in the Turbopack build and fails the prerender outright. This route is static —
 * the card is generated once, during the build, in Node — so reading the file is
 * both available and cheaper. `process.cwd()` is the Next project root here and
 * on Vercel alike.
 *
 * TTF, not the WOFF2 the browser gets: Satori reads TTF, OTF and WOFF only.
 */
const font = (file: string) =>
  readFileSync(join(process.cwd(), "src/app/fonts", file));

export default function OpengraphImage() {
  const regular = font("jeko-regular.ttf");
  const bold = font("jeko-bold.ttf");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: BACKGROUND,
          fontFamily: "Jeko",
          padding: 80,
        }}
      >
        {/* A data URI rather than an asset, and Satori renders no `next/image`. */}
        <img src={markDataUri(ACCENT)} width={92} height={92} alt="" />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 108,
              fontWeight: 700,
              color: FOREGROUND,
              letterSpacing: -4,
              lineHeight: 1.05,
            }}
          >
            Showup
          </div>
          <div
            style={{
              fontSize: 40,
              color: MUTED,
              lineHeight: 1.35,
              maxWidth: 880,
              marginTop: 24,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>

        {/* The tagline above already says Stellar Testnet, so this line carries
            the domain instead — on a card pasted into a group chat it is the
            only thing telling you where the link goes. */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 28, color: ACCENT, fontWeight: 700 }}>
            {SITE_URL.replace(/^https?:\/\//, "")}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: QUIET }}>
            no real funds are used
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Jeko", data: regular, weight: 400, style: "normal" },
        { name: "Jeko", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
