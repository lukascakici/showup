import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/og";
import { SITE_URL } from "@/lib/links";

/**
 * The card behind every Showup link.
 *
 * Generated once at build time rather than per request: nothing on it depends
 * on which event is being shared, so making a chat client wait on a render —
 * or on an RPC read — would buy nothing. The per-event facts travel in the
 * title and description, which cost one chain read the page was making anyway.
 *
 * Same rules as the app: flat black, one amber accent, no gradient, no emoji.
 */

export const alt = "Showup — put a refundable deposit on showing up";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AMBER = "#e0a44a";
const BACKGROUND = "#0a0a0a";

export default function OpengraphImage() {
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
          padding: 80,
        }}
      >
        {/* Satori has no `::before`, so the accent rule is a real element. */}
        <div style={{ display: "flex", width: 96, height: 8, backgroundColor: AMBER }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 108,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: -4,
              lineHeight: 1.05,
            }}
          >
            Showup
          </div>
          <div
            style={{
              fontSize: 40,
              color: "#a1a1a1",
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
          <div style={{ display: "flex", fontSize: 28, color: AMBER, fontWeight: 700 }}>
            {SITE_URL.replace(/^https?:\/\//, "")}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#6b6b6b" }}>
            no real funds are used
          </div>
        </div>
      </div>
    ),
    size,
  );
}
